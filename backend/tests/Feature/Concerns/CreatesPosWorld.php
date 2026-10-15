<?php

namespace Tests\Feature\Concerns;

use App\Models\Books\Voucher;
use App\Models\Pos\Station;
use App\Models\User;
use App\Services\Books\VoucherService;
use App\Services\Pos\StationService;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * The point-of-sale tests' world: the POS tables built from the repo's own scripts (169 to 176), the few Books tables the POS reads, a cashier and a supervisor,
 * a branch with a staff till, and the books' voucher service stood in for (what it is asked to post or cancel is recorded in $posted and $unposted).
 */
trait CreatesPosWorld
{
    use RunsSqlScripts, StandsInForAccess;

    protected array $posted = [];
    protected array $unposted = [];
    protected User $cashier;
    protected User $boss;
    protected Station $till;

    protected function createPosWorld(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-10-15 09:00', 'Africa/Nairobi'));
        Schema::create('users', function ($t) { $t->id(); $t->string('name'); $t->string('email')->nullable(); $t->string('status')->default('active'); $t->softDeletes(); $t->timestamps(); });
        Schema::create('locations', function ($t) { $t->id(); $t->string('name'); $t->boolean('is_active')->default(true); $t->boolean('is_default')->default(false); });
        Schema::create('ledger_groups', function ($t) { $t->id(); $t->unsignedBigInteger('parent_id')->nullable(); $t->string('name'); $t->string('nature')->nullable(); $t->string('behaviour')->nullable(); $t->json('settings')->nullable(); $t->timestamps(); });
        Schema::create('ledgers', function ($t) { $t->id(); $t->string('name'); $t->unsignedBigInteger('group_id'); $t->boolean('is_active')->default(true); $t->timestamps(); });
        Schema::create('payment_methods', function ($t) { $t->id(); $t->string('name'); $t->string('kind')->nullable(); $t->unsignedBigInteger('ledger_id')->nullable(); $t->boolean('is_active')->default(true); $t->timestamps(); });
        Schema::create('voucher_types', function ($t) { $t->id(); $t->string('base_type'); $t->boolean('is_active')->default(true); $t->timestamps(); });
        Schema::create('vouchers', function ($t) {
            $t->id(); $t->unsignedBigInteger('voucher_type_id')->nullable(); $t->string('voucher_number')->nullable(); $t->string('status')->default('posted'); $t->decimal('total_amount', 14, 2)->default(0);
            $t->decimal('base_total', 14, 2)->default(0); $t->unsignedBigInteger('location_id')->nullable(); $t->json('meta')->nullable(); $t->timestamps();
        });
        Schema::create('voucher_tenders', function ($t) { $t->id(); $t->unsignedBigInteger('voucher_id'); $t->unsignedBigInteger('payment_method_id'); $t->decimal('amount', 14, 2)->default(0); $t->unsignedBigInteger('gift_voucher_id')->nullable(); });
        Schema::create('voucher_items', function ($t) { $t->id(); $t->unsignedBigInteger('voucher_id'); $t->decimal('discount_amount', 14, 2)->default(0); });
        Schema::create('currencies', function ($t) { $t->id(); $t->string('code', 8); $t->boolean('is_base')->default(false); $t->timestamps(); });
        Schema::create('accounting_settings', function ($t) { $t->id(); $t->integer('edit_window_days')->default(30); $t->unsignedBigInteger('cash_over_short_ledger_id')->nullable(); $t->timestamps(); });
        Schema::create('access_log', function ($t) { $t->id(); $t->unsignedBigInteger('actor_id')->nullable(); $t->unsignedBigInteger('subject_user_id')->nullable(); $t->string('action'); $t->json('details')->nullable(); $t->string('ip')->nullable(); $t->timestamp('created_at')->nullable(); });
        $this->runSqlScripts('169_pos.sql', '170_pos_sales.sql', '171_pos_pins.sql', '172_pos_shifts.sql', '173_pos_self.sql', '174_pos_help.sql', '175_pos_variance.sql', '176_pos_station_ledgers.sql');

        DB::table('currencies')->insert(['id' => 1, 'code' => 'KES', 'is_base' => true]);
        DB::table('locations')->insert(['id' => 1, 'name' => 'Main', 'is_active' => true, 'is_default' => true]);
        $cashGroup = DB::table('ledger_groups')->insertGetId(['name' => 'Cash-in-hand']);
        $bankGroup = DB::table('ledger_groups')->insertGetId(['name' => 'Bank Accounts']);
        $expense = DB::table('ledger_groups')->insertGetId(['name' => 'Indirect Expenses']);
        DB::table('ledgers')->insert([['id' => 10, 'name' => 'Till cash', 'group_id' => $cashGroup], ['id' => 11, 'name' => 'Station 2 cash', 'group_id' => $cashGroup], ['id' => 20, 'name' => 'KCB', 'group_id' => $bankGroup],
            ['id' => 21, 'name' => 'Equity', 'group_id' => $bankGroup], ['id' => 30, 'name' => 'Cash over short', 'group_id' => $expense]]);
        DB::table('payment_methods')->insert([['id' => 1, 'name' => 'Cash', 'kind' => 'cash', 'ledger_id' => 10], ['id' => 2, 'name' => 'M-Pesa', 'kind' => 'mpesa', 'ledger_id' => 20], ['id' => 3, 'name' => 'Gift voucher', 'kind' => 'gift_voucher', 'ledger_id' => 99]]);
        DB::table('voucher_types')->insert([['id' => 1, 'base_type' => 'cash_sale'], ['id' => 2, 'base_type' => 'journal'], ['id' => 3, 'base_type' => 'credit_note'], ['id' => 4, 'base_type' => 'receipt']]);
        DB::table('accounting_settings')->insert(['id' => 1, 'edit_window_days' => 30, 'cash_over_short_ledger_id' => 30]);
        foreach ([[1, 'Cashier'], [2, 'Boss']] as [$id, $name]) {
            DB::table('users')->insert(['id' => $id, 'name' => $name, 'status' => 'active']);
        }
        $this->cashier = User::find(1);
        $this->boss = User::find(2);
        $this->grant($this->cashier, ['pos.view', 'pos.sell', 'pos.shift', 'pos.return']);
        $this->grant($this->boss, ['pos.view', 'pos.sell', 'pos.shift', 'pos.supervise', 'pos.manage']);

        $vouchers = $this->createMock(VoucherService::class);
        $vouchers->method('create')->willReturnCallback(function (array $d) {
            $this->posted[] = $d;
            $id = DB::table('vouchers')->insertGetId(['voucher_type_id' => $d['voucher_type_id'], 'voucher_number' => 'JV-'.(count($this->posted)), 'status' => 'posted', 'total_amount' => $d['entries'][0]['amount'], 'base_total' => $d['entries'][0]['amount']]);

            return Voucher::find($id);
        });
        $vouchers->method('cancel')->willReturnCallback(function (Voucher $v, ?string $reason) {
            $this->unposted[] = [$v->id, $reason];
            $v->update(['status' => 'cancelled']);

            return $v;
        });
        $this->app->instance(VoucherService::class, $vouchers);

        $this->till = app(StationService::class)->save(['name' => 'Station 1', 'code' => 'T1', 'location_id' => 1, 'kind' => 'staff']);
    }

    /** Give a person a supervisor PIN. */
    protected function pinFor(User $u, string $pin = '482916'): void
    {
        app(\App\Services\Pos\PinService::class)->setPin($u, $pin);
    }

    /** A posted cash sale at the till in a shift, paid as given: [method id => amount]. */
    protected function cashSale(int $shiftId, array $paid): int
    {
        $id = DB::table('vouchers')->insertGetId(['voucher_type_id' => 1, 'voucher_number' => 'CS-'.random_int(100, 999), 'status' => 'posted', 'total_amount' => array_sum($paid), 'location_id' => 1, 'shift_id' => $shiftId, 'station_id' => $this->till->id]);
        foreach ($paid as $method => $amount) {
            DB::table('voucher_tenders')->insert(['voucher_id' => $id, 'payment_method_id' => $method, 'amount' => $amount]);
        }

        return $id;
    }
}
