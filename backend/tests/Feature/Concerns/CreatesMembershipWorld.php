<?php

namespace Tests\Feature\Concerns;

use App\Models\Books\Voucher;
use App\Models\Memberships\Plan;
use App\Models\User;
use App\Services\Books\BooksException;
use App\Services\Books\GatewayPaymentService;
use App\Services\Books\VoucherService;
use App\Services\Licensing\LicenseManager;
use App\Services\Memberships\MembershipBenefits;
use App\Services\Notify\Notifier;
use App\Services\Notify\Staff;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * The memberships tests' world: every Memberships table (as scripts 162 to 167 make them), users, customers, branches, and the books and payment gateway stood in for (what they are
 * asked is recorded: orders placed, invoices made with 16% tax, receipts, cancellations, credit notes, payments started). "Now" is Monday 12 Oct 2026, 12:00 in Nairobi.
 */
trait CreatesMembershipWorld
{
    protected array $placed = [];
    protected array $invoices = [];
    protected array $receipts = [];
    protected array $cancelled = [];
    protected array $credited = [];
    protected array $started = [];
    protected array $sent = [];
    protected bool $licensed = true;
    protected int $serviceLedger = 0;
    protected int $productLedger = 0;

    protected function createMembershipWorld(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-10-12 12:00', 'Africa/Nairobi'));
        config(['app.timezone' => 'Africa/Nairobi', 'cache.default' => 'array']);
        Schema::create('users', function ($t) { $t->id(); $t->string('name'); $t->string('email')->nullable(); $t->string('password')->nullable(); $t->string('role')->nullable(); $t->softDeletes(); $t->timestamps(); });
        Schema::create('customers', function ($t) { $t->id(); $t->unsignedBigInteger('user_id')->nullable(); $t->string('first_name')->nullable(); $t->string('phone')->nullable(); $t->softDeletes(); $t->timestamps(); });
        Schema::create('locations', function ($t) { $t->id(); $t->string('name'); $t->boolean('is_default')->default(false); $t->softDeletes(); $t->timestamps(); });
        Schema::create('currencies', function ($t) { $t->id(); $t->string('code', 8); $t->boolean('is_base')->default(false); $t->boolean('is_active')->default(true); $t->timestamps(); });
        Schema::create('vouchers', function ($t) { $t->id(); $t->unsignedBigInteger('voucher_type_id')->nullable(); $t->string('voucher_number')->nullable(); $t->unsignedBigInteger('currency_id')->nullable(); $t->unsignedBigInteger('customer_id')->nullable(); $t->string('status')->default('posted'); $t->decimal('total_amount', 12, 2)->default(0); $t->unsignedBigInteger('source_voucher_id')->nullable(); $t->json('meta')->nullable(); $t->timestamps(); });
        Schema::create('payment_methods', function ($t) { $t->id(); $t->string('name'); $t->string('kind')->nullable(); $t->unsignedBigInteger('ledger_id')->nullable(); $t->boolean('is_online')->default(false); $t->string('gateway')->nullable(); $t->boolean('requires_reference')->default(false); $t->integer('sort_order')->default(0); $t->boolean('is_active')->default(true); $t->timestamps(); });
        Schema::create('ledger_groups', function ($t) { $t->id(); $t->unsignedBigInteger('parent_id')->nullable(); $t->string('name'); $t->string('behaviour')->nullable(); $t->json('settings')->nullable(); $t->timestamps(); });
        Schema::create('ledgers', function ($t) { $t->id(); $t->string('name'); $t->unsignedBigInteger('group_id'); $t->boolean('is_active')->default(true); $t->string('tax_nature')->nullable(); $t->boolean('offer_at_checkout')->default(false); $t->timestamps(); });
        Schema::create('membership_plans', function ($t) {
            $t->id(); $t->string('name', 120); $t->string('slug', 140)->unique(); $t->string('summary', 300)->nullable(); $t->text('description')->nullable(); $t->string('cover')->nullable(); $t->string('period_unit', 6)->default('month'); $t->unsignedSmallInteger('period_count')->default(1);
            $t->decimal('price', 14, 2)->default(0); $t->decimal('joining_fee', 14, 2)->default(0); $t->unsignedBigInteger('ledger_id')->nullable(); $t->unsignedBigInteger('joining_ledger_id')->nullable(); $t->unsignedSmallInteger('trial_days')->default(0); $t->unsignedSmallInteger('grace_days')->default(7);
            $t->boolean('auto_renew')->default(true); $t->unsignedInteger('capacity')->nullable(); $t->boolean('all_branches')->default(true); $t->json('branch_ids')->nullable(); $t->string('status', 10)->default('draft'); $t->integer('sort_order')->default(0); $t->unsignedBigInteger('created_by')->nullable(); $t->timestamps();
        });
        Schema::create('membership_plan_benefits', function ($t) { $t->id(); $t->unsignedBigInteger('plan_id'); $t->string('type', 20); $t->json('config')->nullable(); $t->integer('sort_order')->default(0); $t->timestamps(); });
        Schema::create('membership_settings', function ($t) { $t->unsignedTinyInteger('id')->primary(); $t->json('settings')->nullable(); $t->unsignedBigInteger('updated_by')->nullable(); $t->timestamps(); });
        Schema::create('memberships', function ($t) {
            $t->id(); $t->string('number', 20)->unique(); $t->unsignedBigInteger('plan_id'); $t->unsignedBigInteger('member_user_id'); $t->unsignedBigInteger('payer_user_id')->nullable(); $t->unsignedBigInteger('customer_id')->nullable(); $t->string('status', 10)->default('pending');
            $t->string('billing', 8)->default('invoice'); $t->string('channel', 8)->default('online'); foreach (['started_on', 'trial_ends_on', 'period_from', 'paid_until', 'paused_from', 'paused_until'] as $c) { $t->date($c)->nullable(); }
            $t->boolean('cancel_at_end')->default(false); $t->dateTime('cancelled_at')->nullable(); $t->string('cancel_reason', 300)->nullable(); $t->unsignedSmallInteger('pause_days_used')->default(0); $t->unsignedSmallInteger('pause_year')->nullable();
            $t->unsignedBigInteger('change_to_plan_id')->nullable(); $t->dateTime('expires_at')->nullable(); $t->string('notes', 500)->nullable(); $t->unsignedBigInteger('created_by')->nullable(); $t->timestamps();
        });
        Schema::create('membership_periods', function ($t) {
            $t->id(); $t->unsignedBigInteger('membership_id'); $t->unsignedSmallInteger('seq')->default(1); $t->string('kind', 8)->default('period'); $t->string('label', 160); $t->unsignedBigInteger('plan_id'); $t->date('period_from')->nullable(); $t->date('period_to')->nullable(); $t->date('due_date')->nullable();
            $t->decimal('amount', 14, 2)->default(0); $t->decimal('paid_amount', 14, 2)->default(0); $t->string('status', 8)->default('open'); $t->unsignedBigInteger('voucher_id')->nullable(); $t->unsignedBigInteger('invoice_id')->nullable(); $t->unsignedBigInteger('credit_note_id')->nullable();
            foreach (['invoiced_at', 'paid_at', 'reminded_before_at', 'reminded_after_at'] as $c) { $t->dateTime($c)->nullable(); } $t->timestamps();
        });
        Schema::create('membership_events', function ($t) { $t->id(); $t->unsignedBigInteger('membership_id'); $t->string('type', 24); $t->string('note', 300)->nullable(); $t->unsignedBigInteger('by_user_id')->nullable(); $t->timestamp('created_at')->nullable(); });
        Schema::create('membership_credits', function ($t) {
            $t->id(); $t->unsignedBigInteger('membership_id')->nullable(); $t->unsignedBigInteger('user_id'); $t->string('kind', 8); $t->integer('delta'); $t->integer('remaining')->nullable(); $t->dateTime('expires_at')->nullable(); $t->string('period_key', 60)->nullable();
            $t->json('allocations')->nullable(); $t->string('source_type', 30)->nullable(); $t->unsignedBigInteger('source_id')->nullable(); $t->string('note', 200)->nullable(); $t->unsignedBigInteger('by_user_id')->nullable(); $t->timestamp('created_at')->nullable();
        });
        Schema::create('membership_checkins', function ($t) { $t->id(); $t->unsignedBigInteger('membership_id')->nullable(); $t->unsignedBigInteger('user_id'); $t->unsignedBigInteger('location_id')->nullable(); $t->string('result', 8); $t->string('reason', 200)->nullable(); $t->string('method', 8)->default('card'); $t->unsignedBigInteger('by_user_id')->nullable(); $t->timestamp('created_at')->nullable(); });

        DB::table('currencies')->insert(['id' => 1, 'code' => 'KES', 'is_base' => true]);
        DB::table('locations')->insert([['id' => 1, 'name' => 'Westlands', 'is_default' => true], ['id' => 2, 'name' => 'Karen', 'is_default' => false]]);
        DB::table('payment_methods')->insert([['id' => 1, 'name' => 'Cash', 'kind' => 'cash', 'is_online' => false, 'gateway' => null, 'is_active' => true], ['id' => 4, 'name' => 'M-Pesa online', 'kind' => 'mpesa', 'is_online' => true, 'gateway' => 'mpesa_stk', 'is_active' => true]]);
        $svc = DB::table('ledger_groups')->insertGetId(['name' => 'Service Income', 'behaviour' => 'sales', 'settings' => json_encode(['applies_to' => 'service'])]);
        $prod = DB::table('ledger_groups')->insertGetId(['name' => 'Sales Accounts', 'behaviour' => 'sales']);
        $this->serviceLedger = DB::table('ledgers')->insertGetId(['name' => 'Membership income', 'group_id' => $svc, 'tax_nature' => 'taxable']);
        $this->productLedger = DB::table('ledgers')->insertGetId(['name' => 'Goods', 'group_id' => $prod, 'tax_nature' => 'taxable']);

        $this->mock(LicenseManager::class, fn ($m) => $m->shouldReceive('isActive')->andReturnUsing(fn () => $this->licensed));
        $this->standInBooks();
        $this->app->instance(Notifier::class, new class($this) extends Notifier {
            public function __construct(private $test) {}

            public function send(Model $to, string $type, string $title, string $message, array $o = []): array
            {
                $this->test->noteSent($to->id, $type, $title, $message);

                return [];
            }
        });
        $this->mock(Staff::class, fn ($m) => $m->shouldReceive('holding')->andReturn(new Collection()));
    }

    public function noteSent(int $to, string $type, string $title, string $message): void
    {
        $this->sent[] = compact('to', 'type', 'title', 'message');
    }

    /** @return string[] the notice types sent to this person */
    protected function sentTo(int $userId): array
    {
        return array_values(array_map(fn ($s) => $s['type'], array_filter($this->sent, fn ($s) => $s['to'] === $userId)));
    }

    private function totalOf(array $lines): float
    {
        return round(array_sum(array_map(fn ($l) => ($l['quantity'] ?? 1) * ($l['rate'] ?? 0), $lines)) * 1.16, 2);
    }

    private function standInBooks(): void
    {
        $v = $this->createMock(VoucherService::class);
        $v->method('preview')->willReturnCallback(fn (array $d) => ['total' => $this->totalOf($d['lines'])]);
        $v->method('placeOrder')->willReturnCallback(function (array $d) {
            $this->placed[] = $d;

            return Voucher::create(['voucher_type_id' => 1, 'voucher_number' => 'SO-'.count($this->placed), 'currency_id' => $d['currency_id'], 'customer_id' => $d['customer_id'], 'total_amount' => $this->totalOf($d['lines']), 'meta' => $d['meta']]);
        });
        $v->method('convert')->willReturnCallback(function (Voucher $order, string $type, array $o) {
            $inv = Voucher::create(['voucher_type_id' => 2, 'voucher_number' => 'INV-'.(count($this->invoices) + 1), 'currency_id' => $order->currency_id, 'customer_id' => $order->customer_id, 'total_amount' => $order->total_amount, 'source_voucher_id' => $order->id, 'meta' => $order->meta]);
            $this->invoices[] = ['type' => $type, 'order' => $order->id, 'invoice' => $inv->id] + $o;

            return $inv;
        });
        $v->method('receive')->willReturnCallback(function (Voucher $inv, array $d) {
            $this->receipts[] = ['invoice' => $inv->id] + $d;

            return Voucher::create(['voucher_type_id' => 3, 'voucher_number' => 'RC-'.count($this->receipts), 'total_amount' => $d['amount']]);
        });
        $v->method('cancel')->willReturnCallback(function (Voucher $x) {
            $this->cancelled[] = $x->id;
            $x->update(['status' => Voucher::CANCELLED]);

            return $x;
        });
        $v->method('returnable')->willReturnCallback(fn (Voucher $inv) => ['lines' => array_map(fn ($l, $i) => ['id' => $inv->id * 100 + $i, 'item_type' => 'custom', 'description' => $l['description'], 'available_quantity' => in_array($inv->id, array_column($this->credited, 'invoice'), true) ? 0 : 1],
            $this->linesOf($inv), array_keys($this->linesOf($inv))), 'refund' => ['default_id' => 9]]);
        $v->method('paidAtOnce')->willReturn(false);
        $v->method('createReturn')->willReturnCallback(function (Voucher $inv, array $o) {
            $this->credited[] = ['invoice' => $inv->id] + $o;

            return Voucher::create(['voucher_type_id' => 4, 'voucher_number' => 'CN-'.count($this->credited), 'total_amount' => $inv->total_amount]);
        });
        $this->app->instance(VoucherService::class, $v);
        $g = $this->createMock(GatewayPaymentService::class);
        $g->method('start')->willReturnCallback(function (Voucher $inv, \App\Models\Books\PaymentMethod $m, array $contact, array $tenders, float $due) {
            $this->started[] = ['invoice' => $inv->id, 'method' => $m->name, 'amount' => $due, 'phone' => $contact['phone'] ?? null];
            $a = new \App\Models\Books\PaymentAttempt();
            $a->forceFill(['id' => 700 + count($this->started), 'status' => 'pending', 'amount' => $due, 'gateway' => $m->gateway]);

            return ['attempt' => $a, 'redirect_url' => null];
        });
        $this->app->instance(GatewayPaymentService::class, $g);
    }

    /** The lines the order behind an invoice was placed with. */
    private function linesOf(Voucher $inv): array
    {
        foreach ($this->placed as $i => $p) {
            if (($p['meta']['membership_period_id'] ?? null) === ($inv->meta['membership_period_id'] ?? -1)) {
                return $p['lines'];
            }
        }

        return [];
    }

    protected function person(string $name = 'Amina', bool $customer = true, ?string $phone = '0712000000'): User
    {
        $u = User::forceCreate(['name' => $name, 'email' => strtolower(str_replace(' ', '', $name)).'@example.com']);
        if ($customer) {
            DB::table('customers')->insert(['user_id' => $u->id, 'first_name' => $name, 'phone' => $phone]);
        }

        return $u->fresh();
    }

    /** A published plan straight into the table (the plan service is tested on its own). */
    protected function plan(array $o = [], array $benefits = []): Plan
    {
        static $n = 0;
        $n++;
        $p = Plan::forceCreate($o + ['name' => 'Gold '.$n, 'slug' => 'gold-'.$n, 'period_unit' => 'month', 'period_count' => 1, 'price' => 1000, 'joining_fee' => 0, 'ledger_id' => $this->serviceLedger, 'trial_days' => 0, 'grace_days' => 7,
            'auto_renew' => true, 'all_branches' => true, 'status' => 'published']);
        foreach ($benefits as $i => [$type, $config]) {
            DB::table('membership_plan_benefits')->insert(['plan_id' => $p->id, 'type' => $type, 'config' => json_encode($config), 'sort_order' => $i]);
        }

        return $p->fresh();
    }

    /** Register a benefit type that records what it is asked, for a module that is always on. */
    protected function recordingBenefit(array &$log, string $type = 'probe'): void
    {
        app(MembershipBenefits::class)->register($type, 'Probe', 'core', fn ($c) => $c, fn ($c) => 'probe', function ($m, $c) use (&$log, $type) { $log[] = "grant:{$type}:{$m->id}"; }, function ($m, $c) use (&$log, $type) { $log[] = "revoke:{$type}:{$m->id}"; });
    }

    protected function at(string $when): void
    {
        Carbon::setTestNow(Carbon::parse($when, 'Africa/Nairobi'));
    }

    protected function boom(): never
    {
        throw new BooksException('boom');
    }
}
