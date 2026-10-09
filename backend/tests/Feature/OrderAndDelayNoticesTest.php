<?php

namespace Tests\Feature;

use App\Jobs\SendNotificationEmail;
use App\Models\Books\Voucher;
use App\Models\Customer;
use App\Models\Notification;
use App\Models\NotificationDelivery;
use App\Models\User;
use App\Services\Notify\Notifier;
use App\Services\Notify\NotifySettings;
use App\Services\Notify\OrderNotices;
use App\Services\Notify\Staff;
use App\Services\Preorders\PreorderDelayNotices;
use App\Services\Preorders\PreorderService;
use Carbon\Carbon;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Facades\Schema;

/**
 * Phase 4: shoppers are told what happens to their orders (received, paid, on its way, delivered, cancelled), a paid preorder past its promised date triggers a polite
 * note (first, then every 14 days, at most 3), staff get one note a day, and a customer's request to cancel is announced to staff and answered to the customer.
 * Guests (no account) are reached at the email and phone they gave at checkout.
 */
class OrderAndDelayNoticesTest extends NotifyTestCase
{
    use Concerns\CreatesPreorderTables;

    private const SO = 1;
    private const CASH = 2;
    private const DN = 3;

    protected function setUp(): void
    {
        parent::setUp();
        $this->createPreorderTables();
        Schema::table('vouchers', function ($t) { $t->string('channel')->nullable(); $t->unsignedBigInteger('currency_id')->nullable(); $t->string('party_name')->nullable(); $t->string('party_phone')->nullable(); $t->string('cancel_reason')->nullable(); $t->decimal('total_amount', 12, 2)->default(0); $t->timestamps(); });
        DB::table('voucher_types')->insert([['id' => self::SO, 'base_type' => 'sales_order'], ['id' => self::CASH, 'base_type' => 'cash_sale'], ['id' => self::DN, 'base_type' => 'delivery_note']]);
        Queue::fake();
        Cache::flush();
        $this->app->instance(Staff::class, new class extends Staff {
            public array $users = [];

            public function holding(string $permission): \Illuminate\Support\Collection
            {
                return collect($this->users);
            }
        });
    }

    private function customer(): Customer
    {
        $user = User::find(40) ?? User::forceCreate(['id' => 40, 'name' => 'Amina Wanjiru', 'email' => 'amina@example.com', 'password' => 'x']);

        return Customer::where('user_id', 40)->first() ?? Customer::forceCreate(['user_id' => $user->id, 'first_name' => 'Amina', 'last_name' => 'Wanjiru', 'email' => 'amina@example.com']);
    }

    /** A storefront order (a preorder by default), optionally paid, with one line of 4 owing; promised on $due (days from today). */
    private function order(array $o = []): Voucher
    {
        $o += ['guest' => false, 'preorder' => true, 'paid' => true, 'due' => -3, 'channel' => 'storefront', 'delivered' => 0, 'qty' => 4];
        $meta = array_filter(['preorder' => $o['preorder'] ? ['campaign_ids' => [1]] : null, 'contact' => $o['guest'] ? ['name' => 'Wanjiku', 'email' => 'guest@example.com', 'phone' => '0722000111'] : null, 'cancel_request' => $o['cancel'] ?? null]);
        $id = DB::table('vouchers')->insertGetId(['voucher_type_id' => self::SO, 'customer_id' => $o['guest'] ? null : $this->customer()->id, 'status' => 'posted', 'voucher_number' => 'PRE-00007', 'channel' => $o['channel'],
            'total_amount' => 1000, 'date' => today()->subDays(10), 'meta' => json_encode($meta), 'created_at' => now(), 'updated_at' => now()]);
        DB::table('voucher_items')->insert(['voucher_id' => $id, 'variant_id' => 5, 'quantity' => $o['qty'], 'delivered_quantity' => $o['delivered']]);
        DB::table('preorder_lines')->insert(['voucher_id' => $id, 'offer_id' => 1, 'variant_id' => 5, 'location_id' => 1, 'promised_date' => today()->addDays($o['due'])->toDateString()]);
        if ($o['paid']) {
            DB::table('vouchers')->insert(['voucher_type_id' => self::CASH, 'status' => 'posted', 'source_voucher_id' => $id, 'voucher_number' => 'CS-7', 'channel' => $o['channel'], 'total_amount' => 1000]);
        }

        return Voucher::findOrFail($id);
    }

    private function delays(): PreorderDelayNotices
    {
        return app(PreorderDelayNotices::class);
    }

    // ------------------------------------------------------------ who is late

    public function test_a_paid_preorder_past_its_date_is_late_and_the_day_itself_is_not(): void
    {
        $late = $this->order(['due' => -3]);
        $r = app(PreorderService::class)->overdue(today());
        $this->assertSame([$late->id], array_keys($r));
        $this->assertSame([3, 4.0], [$r[$late->id]['days'], $r[$late->id]['owed']]);
        $this->assertSame(today()->subDays(3)->toDateString(), $r[$late->id]['promised']);

        DB::table('preorder_lines')->update(['promised_date' => today()->toDateString()]);
        $this->assertSame([], app(PreorderService::class)->overdue(today()), 'due today is still on time');
    }

    public function test_unpaid_delivered_and_being_cancelled_orders_are_not_late(): void
    {
        $this->order(['paid' => false]);
        $this->assertSame([], app(PreorderService::class)->overdue(today()), 'nobody paid, so nobody is waiting');
        DB::table('voucher_items')->delete();
        DB::table('preorder_lines')->delete();
        DB::table('vouchers')->delete();

        $this->order(['delivered' => 4]);
        $this->assertSame([], app(PreorderService::class)->overdue(today()), 'all delivered');
        DB::table('voucher_items')->delete();
        DB::table('preorder_lines')->delete();
        DB::table('vouchers')->delete();

        $this->order(['cancel' => ['status' => 'requested']]);
        $this->assertSame([], app(PreorderService::class)->overdue(today()), 'they have asked to cancel');
    }

    public function test_part_delivered_is_late_for_what_is_still_owed(): void
    {
        $o = $this->order(['delivered' => 1]);
        $this->assertSame(3.0, app(PreorderService::class)->overdue(today())[$o->id]['owed']);
    }

    // ------------------------------------------------------------ the delay notice

    public function test_the_customer_is_told_once_with_the_date_and_the_way_out(): void
    {
        $o = $this->order();
        $r = $this->delays()->run(today());
        $this->assertSame(['late' => 1, 'told' => 1], ['late' => $r['late'], 'told' => $r['told']]);

        $bell = Notification::where('type', 'preorder_delayed')->first();
        $this->assertStringContainsString('PRE-00007', $bell->title);
        $this->assertStringContainsString('by ' . today()->subDays(3)->toDateString(), $bell->message);
        $this->assertStringContainsString('ask from your order page', $bell->message);
        $this->assertSame('/orders/' . $o->id, $bell->action_url);
        $this->assertSame('queued', NotificationDelivery::where('channel', 'email')->first()->status);
        Queue::assertPushed(SendNotificationEmail::class);

        $this->delays()->run(today());   // the same day again
        $this->assertSame(1, Notification::where('type', 'preorder_delayed')->count());
        $this->assertSame(1, $o->fresh()->meta['delay_notices']['count']);
    }

    public function test_it_repeats_every_14_days_and_stops_after_three(): void
    {
        $this->order();
        foreach ([0 => 1, 10 => 1, 14 => 2, 27 => 2, 28 => 3, 60 => 3, 120 => 3] as $day => $expected) {
            $this->delays()->run(today()->addDays($day));
            $this->assertSame($expected, Notification::where('type', 'preorder_delayed')->count(), "after day {$day}");
        }
    }

    public function test_a_dry_run_changes_nothing(): void
    {
        $o = $this->order();
        $r = $this->delays()->run(today(), true);
        $this->assertSame(1, $r['told']);
        $this->assertSame(0, Notification::count());
        $this->assertArrayNotHasKey('delay_notices', $o->fresh()->meta);
    }

    public function test_a_guest_is_told_at_the_email_they_gave(): void
    {
        $this->order(['guest' => true]);
        $this->delays()->run(today());
        $this->assertSame(0, Notification::count(), 'a guest has no bell');
        $d = NotificationDelivery::where('channel', 'email')->first();
        $this->assertSame(['guest@example.com', 'queued', 'preorder_delayed'], [$d->to_address, $d->status, $d->type]);
        $this->assertStringContainsString('please contact us', $d->body);
    }

    public function test_staff_get_one_note_a_day_only_when_something_is_late(): void
    {
        $staff = User::forceCreate(['id' => 60, 'name' => 'Stock keeper', 'email' => 'stock@example.com', 'password' => 'x']);
        app(Staff::class)->users = [$staff];

        $this->delays()->run(today());
        $this->assertSame(0, Notification::where('type', 'preorder_delays_staff')->count(), 'nothing late, nothing said');

        $this->order();
        $this->delays()->run(today());
        $this->delays()->run(today());
        $n = Notification::where('type', 'preorder_delays_staff')->get();
        $this->assertCount(1, $n);
        $this->assertSame([60, '1 preorder is past its date'], [$n[0]->notifiable_id, $n[0]->title]);
        $this->assertSame('/admin/orders?tab=preorders', $n[0]->action_url);
        $this->delays()->run(today()->addDay());
        $this->assertSame(2, Notification::where('type', 'preorder_delays_staff')->count(), 'the next day, again');
    }

    public function test_the_command_runs(): void
    {
        $this->order();
        $this->artisan('preorders:notify-delays', ['--dry-run' => true])->expectsOutputToContain('1 late preorder(s); 1 customer(s) would be told')->assertSuccessful();
        $this->artisan('preorders:notify-delays')->assertSuccessful();
        $this->assertSame(1, Notification::where('type', 'preorder_delayed')->count());
    }

    // ------------------------------------------------------------ order messages

    private function notices(): OrderNotices
    {
        return app(OrderNotices::class);
    }

    public function test_received_is_said_once_and_a_preorder_says_when_it_is_expected(): void
    {
        $o = $this->order(['due' => 20]);
        $this->notices()->placed($o);
        $this->notices()->placed($o->fresh());
        $this->assertSame(1, Notification::where('type', 'order_placed')->count());
        $m = Notification::first();
        $this->assertSame('Preorder PRE-00007 received', $m->title);
        $this->assertStringContainsString('expected by ' . today()->addDays(20)->toDateString(), $m->message);

        $plain = $this->order(['preorder' => false, 'channel' => 'storefront']);
        $this->notices()->placed($plain);
        $this->assertSame('Order PRE-00007 received', Notification::orderByDesc('id')->first()->title);
    }

    public function test_only_storefront_orders_are_announced(): void
    {
        $this->notices()->placed($this->order(['preorder' => false, 'channel' => 'admin']));
        $this->assertSame(0, Notification::count());
    }

    public function test_a_cash_sale_made_from_the_order_means_paid_and_a_delivery_means_on_its_way(): void
    {
        $o = $this->order(['paid' => false]);
        $sale = Voucher::create(['voucher_type_id' => self::CASH, 'status' => 'posted', 'source_voucher_id' => $o->id, 'voucher_number' => 'CS-9', 'total_amount' => 1000, 'channel' => 'storefront']);
        $this->notices()->converted($o, $sale);
        $this->notices()->converted($o->fresh(), $sale);
        $this->assertSame(1, Notification::where('type', 'payment_received')->count());
        $this->assertStringContainsString('payment of', Notification::first()->message);

        DB::table('voucher_items')->update(['delivered_quantity' => 1]);
        $dn = Voucher::create(['voucher_type_id' => self::DN, 'status' => 'posted', 'source_voucher_id' => $o->id, 'voucher_number' => 'DN-1', 'channel' => 'storefront']);
        $this->notices()->converted($o->fresh(), $dn);
        $part = Notification::where('type', 'order_shipped')->first();
        $this->assertStringContainsString('1 of 4 items', $part->message);

        DB::table('voucher_items')->update(['delivered_quantity' => 4]);
        $dn2 = Voucher::create(['voucher_type_id' => self::DN, 'status' => 'posted', 'source_voucher_id' => $o->id, 'voucher_number' => 'DN-2', 'channel' => 'storefront']);
        $this->notices()->converted($o->fresh(), $dn2);
        $this->assertStringContainsString('Everything in order PRE-00007 has been delivered', Notification::where('type', 'order_delivered')->first()->message);
    }

    public function test_a_cancelled_order_says_why(): void
    {
        $o = $this->order(['preorder' => false]);
        $o->forceFill(['cancel_reason' => 'Out of stock'])->save();
        $this->notices()->cancelled($o->fresh());
        $this->notices()->cancelled($o->fresh());
        $this->assertSame(1, Notification::where('type', 'order_cancelled')->count());
        $this->assertStringContainsString('Reason: Out of stock', Notification::first()->message);
    }

    public function test_a_guests_order_messages_go_to_the_contact_they_gave(): void
    {
        $o = $this->order(['guest' => true, 'preorder' => false]);
        $this->notices()->placed($o);
        $d = NotificationDelivery::where('channel', 'email')->first();
        $this->assertSame('guest@example.com', $d->to_address);
        $this->assertSame(0, Notification::count());
    }

    public function test_a_guest_with_whatsapp_on_gets_a_message_waiting_for_a_person(): void
    {
        app(NotifySettings::class)->save('general', ['whatsapp_enabled' => true], $this->admin());
        $o = $this->order(['guest' => true, 'preorder' => false]);
        $this->notices()->placed($o);
        $w = NotificationDelivery::where('channel', 'whatsapp')->first();
        $this->assertSame(['to_send', '+254722000111'], [$w->status, $w->to_address]);
        $this->assertStringStartsWith('https://wa.me/254722000111?text=', $w->wa_url);
    }

    public function test_a_problem_telling_someone_never_reaches_the_order(): void
    {
        $o = $this->order(['preorder' => false]);
        Schema::drop('vouchers');   // remembering that it was said fails: that must not reach the caller
        $this->notices()->placed($o);
        $this->assertSame(0, Notification::count());

        Schema::drop('notifications');
        Schema::drop('notification_deliveries');
        $this->notices()->cancelRequested($o, 'x');   // and a failing notifier must not either
        $this->assertTrue(true);
    }

    // ------------------------------------------------------------ cancellation requests

    public function test_staff_hear_about_a_request_and_the_customer_hears_the_answer(): void
    {
        $staff = User::forceCreate(['id' => 61, 'name' => 'Cashier', 'email' => 'cash@example.com', 'password' => 'x']);
        app(Staff::class)->users = [$staff];
        $o = $this->order(['cancel' => ['status' => 'requested', 'at' => '2026-10-09 10:00:00']]);

        $this->notices()->cancelRequested($o, 'Found it cheaper');
        $n = Notification::where('type', 'preorder_cancel_requested')->first();
        $this->assertSame([61, '/admin/orders?tab=preorders'], [$n->notifiable_id, $n->action_url]);
        $this->assertStringContainsString('Found it cheaper', $n->message);

        $this->notices()->cancelDecision($o->fresh(), true, null, 'M-Pesa');
        $yes = Notification::where('type', 'preorder_cancel_decided')->first();
        $this->assertStringContainsString('will refund', $yes->message);
        $this->assertStringContainsString('(M-Pesa)', $yes->message);
        $this->notices()->cancelDecision($o->fresh(), true, null, 'M-Pesa');   // not twice
        $this->assertSame(1, Notification::where('type', 'preorder_cancel_decided')->count());

        $this->notices()->cancelDecision($o->fresh(), false, 'It ships tomorrow.', null);
        $no = Notification::where('type', 'preorder_cancel_decided')->orderByDesc('id')->first();
        $this->assertStringContainsString('could not cancel', $no->message);
        $this->assertStringContainsString('It ships tomorrow.', $no->message);
    }
}
