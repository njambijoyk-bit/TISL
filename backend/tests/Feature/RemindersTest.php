<?php

namespace Tests\Feature;

use App\Models\Customer;
use App\Models\NotificationDelivery;
use App\Models\User;
use App\Services\Notify\CartReminders;
use App\Services\Notify\NotifySettings;
use App\Services\Notify\PriceDropAlerts;
use App\Services\Notify\ReminderPrefs;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Facades\Schema;

/** Cart reminders and price-drop alerts: when they are sent, when they are not, and the way to stop them. */
class RemindersTest extends NotifyTestCase
{
    use Concerns\CreatesPreorderTables;

    protected function setUp(): void
    {
        parent::setUp();
        $this->createPreorderTables();
        config(['app.frontend_url' => 'https://shop.example.com']);
        Queue::fake();
        Schema::table('products', function ($t) { $t->decimal('price', 14, 2)->default(0); $t->decimal('original_price', 14, 2)->nullable(); $t->boolean('in_stock')->default(true); $t->string('status')->default('active'); $t->boolean('is_visible')->default(true); });
        Schema::table('vouchers', function ($t) { $t->timestamps(); });
        Schema::create('customer_carts', function ($t) { $t->unsignedBigInteger('customer_id')->primary(); $t->longText('items'); $t->dateTime('updated_at')->nullable(); });
        Schema::create('customer_wishlists', function ($t) { $t->unsignedBigInteger('customer_id')->primary(); $t->longText('ids'); $t->longText('service_ids')->nullable(); $t->dateTime('updated_at')->nullable(); });
        Schema::create('customer_reminder_prefs', function ($t) { $t->unsignedBigInteger('customer_id')->primary(); $t->boolean('cart')->default(true); $t->boolean('price')->default(true); $t->char('token', 40)->unique(); $t->dateTime('updated_at')->nullable(); });
        Schema::create('cart_reminders', function ($t) { $t->unsignedBigInteger('customer_id')->primary(); $t->dateTime('cart_updated_at'); $t->unsignedTinyInteger('sent_count')->default(0); $t->dateTime('last_sent_at')->nullable(); });
        Schema::create('price_watch_marks', function ($t) { $t->unsignedBigInteger('product_id')->primary(); $t->decimal('price', 14, 2); $t->dateTime('updated_at')->nullable(); });
        Schema::create('price_drop_notices', function ($t) { $t->unsignedBigInteger('customer_id'); $t->unsignedBigInteger('product_id'); $t->decimal('price_told', 14, 2); $t->dateTime('told_at'); $t->primary(['customer_id', 'product_id']); });
        $this->travelTo(now()->setTime(10, 0));
    }

    private function settings(array $o): void
    {
        app(NotifySettings::class)->save('general', $o, $this->admin());
    }

    private function customer(int $n = 1, array $o = []): Customer
    {
        $u = User::forceCreate(['id' => 100 + $n, 'name' => "C{$n}", 'email' => "c{$n}@example.com", 'password' => 'x']);

        return Customer::forceCreate($o + ['user_id' => $u->id, 'first_name' => "Cust{$n}", 'last_name' => 'X', 'email' => "c{$n}@example.com"]);
    }

    private function product(int $id, string $name, float $price = 1000, bool $inStock = true): void
    {
        DB::table('products')->insert(['id' => $id, 'name' => $name, 'price' => $price, 'in_stock' => $inStock, 'created_at' => now(), 'updated_at' => now()]);
    }

    private function cart(Customer $c, array $items, int $hoursAgo = 25): void
    {
        DB::table('customer_carts')->updateOrInsert(['customer_id' => $c->id], ['items' => json_encode($items), 'updated_at' => now()->subHours($hoursAgo)->toDateTimeString()]);
    }

    private function emails(string $type): array
    {
        return NotificationDelivery::where('type', $type)->where('channel', 'email')->orderBy('id')->pluck('to_address')->all();
    }

    // ------------------------------------------------------------ cart reminders

    public function test_nothing_is_sent_until_the_company_switches_it_on(): void
    {
        $this->product(1, 'Teak Table');
        $this->cart($this->customer(), [['id' => 1, 'name' => 'Teak Table', 'quantity' => 1]]);
        $this->assertSame(0, app(CartReminders::class)->run()['sent']);
        $this->assertSame([], $this->emails('cart_reminder'));
    }

    public function test_a_cart_left_a_day_gets_one_reminder_with_what_is_in_it_and_a_stop_link_and_is_not_nagged(): void
    {
        $this->settings(['cart_reminders_enabled' => true]);
        $this->product(1, 'Teak Table');
        $this->product(2, 'Oak Chair');
        $c = $this->customer();
        $this->cart($c, [['id' => 1, 'name' => 'Teak Table', 'quantity' => 1], ['id' => 2, 'name' => 'Oak Chair', 'quantity' => 4]]);

        $this->assertSame(1, app(CartReminders::class)->run()['sent']);
        $this->assertSame(['c1@example.com'], $this->emails('cart_reminder'));
        $body = NotificationDelivery::where('type', 'cart_reminder')->where('channel', 'email')->value('body');
        $this->assertStringContainsString('Teak Table', $body);
        $this->assertStringContainsString('4 × Oak Chair', $body);
        $this->assertStringContainsString('https://shop.example.com/reminders/stop/' . DB::table('customer_reminder_prefs')->value('token') . '?kind=cart', $body);

        $again = app(CartReminders::class)->run();
        $this->assertSame([0, 1], [$again['sent'], $again['skipped']['already_reminded']]);
        $this->assertCount(1, $this->emails('cart_reminder'));
    }

    public function test_too_fresh_too_old_empty_or_nothing_buyable_is_left_alone(): void
    {
        $this->settings(['cart_reminders_enabled' => true]);
        $this->product(1, 'Teak Table');
        $this->product(2, 'Gone', 1000, false);
        $item = fn ($id, $n) => [['id' => $id, 'name' => $n, 'quantity' => 1]];
        $this->cart($this->customer(1), $item(1, 'Teak Table'), 5);                     // too fresh
        $this->cart($this->customer(2), $item(1, 'Teak Table'), 24 * 15);               // abandoned for good
        $this->cart($this->customer(3), []);                                              // empty
        $this->cart($this->customer(4), $item(2, 'Gone'));                                // out of stock
        $r = app(CartReminders::class)->run();
        $this->assertSame(0, $r['sent']);
        $this->assertSame(1, $r['skipped']['empty']);
        $this->assertSame(1, $r['skipped']['nothing_buyable']);
        $this->assertSame([], $this->emails('cart_reminder'));
    }

    public function test_an_out_of_stock_item_counts_when_it_is_in_the_cart_as_a_preorder(): void
    {
        $this->settings(['cart_reminders_enabled' => true]);
        $this->product(2, 'Coming Soon Thing', 1000, false);
        $this->cart($this->customer(), [['id' => 2, 'name' => 'Coming Soon Thing', 'quantity' => 1, 'preorder' => true]]);
        $this->assertSame(1, app(CartReminders::class)->run()['sent']);
    }

    public function test_someone_who_ordered_since_or_said_stop_is_not_reminded(): void
    {
        $this->settings(['cart_reminders_enabled' => true]);
        $this->product(1, 'Teak Table');
        $item = [['id' => 1, 'name' => 'Teak Table', 'quantity' => 1]];
        $ordered = $this->customer(1);
        $this->cart($ordered, $item);
        DB::table('vouchers')->insert(['customer_id' => $ordered->id, 'created_at' => now()->subHours(2), 'updated_at' => now()]);
        $stopped = $this->customer(2);
        $this->cart($stopped, $item);
        app(ReminderPrefs::class)->save($stopped->id, ['cart' => false]);
        $r = app(CartReminders::class)->run();
        $this->assertSame([0, 1, 1], [$r['sent'], $r['skipped']['ordered'], $r['skipped']['stopped']]);
    }

    public function test_a_changed_cart_is_a_new_cart_and_a_second_reminder_waits_three_days(): void
    {
        $this->settings(['cart_reminders_enabled' => true, 'cart_reminder_count' => 2]);
        $this->product(1, 'Teak Table');
        $c = $this->customer();
        $this->cart($c, [['id' => 1, 'name' => 'Teak Table', 'quantity' => 1]], 25);
        $this->assertSame(1, app(CartReminders::class)->run()['sent']);
        $this->assertSame(1, app(CartReminders::class)->run()['skipped']['too_soon']);

        $this->travel(3)->days();
        $this->assertSame(1, app(CartReminders::class)->run()['sent'], 'the second, three days later');
        $this->assertSame(1, app(CartReminders::class)->run()['skipped']['already_reminded'], 'and no third');

        $this->cart($c, [['id' => 1, 'name' => 'Teak Table', 'quantity' => 2]], 30);   // changed since: a new cart
        $this->assertSame(1, app(CartReminders::class)->run()['sent']);
    }

    public function test_not_at_night_and_a_dry_run_changes_nothing(): void
    {
        $this->settings(['cart_reminders_enabled' => true]);
        $this->product(1, 'Teak Table');
        $this->cart($this->customer(), [['id' => 1, 'name' => 'Teak Table', 'quantity' => 1]]);
        $this->travelTo(now()->setTime(22, 30));
        $this->assertSame(['quiet_hours' => 1], app(CartReminders::class)->run()['skipped']);
        $this->travelTo(now()->setTime(11, 0));
        $dry = app(CartReminders::class)->run(null, true);
        $this->assertSame([0, 1], [$dry['sent'], $dry['would_send']]);
        $this->assertSame(0, DB::table('cart_reminders')->count());
        $this->assertSame(0, NotificationDelivery::count());
    }

    public function test_essential_only_customers_get_the_bell_not_an_email_and_whatsapp_is_not_a_job_for_staff(): void
    {
        $this->settings(['cart_reminders_enabled' => true, 'whatsapp_enabled' => true]);
        $this->product(1, 'Teak Table');
        $item = [['id' => 1, 'name' => 'Teak Table', 'quantity' => 1]];
        $quiet = $this->customer(1, ['notify_essential_only' => true]);
        $this->cart($quiet, $item);
        $chatty = $this->customer(2, ['whatsapp' => '0712345678', 'whatsapp_consent_at' => now(), 'whatsapp_consent_source' => 'profile']);
        $this->cart($chatty, $item);
        app(CartReminders::class)->run();
        $this->assertSame(['c2@example.com'], $this->emails('cart_reminder'));
        $this->assertSame(2, DB::table('notifications')->where('type', 'cart_reminder')->count(), 'both get the bell');
        $this->assertSame(0, NotificationDelivery::where('type', 'cart_reminder')->where('status', 'to_send')->count(), 'nothing for staff to send by hand');
        $this->assertSame('manual_not_used', NotificationDelivery::where('type', 'cart_reminder')->where('channel', 'whatsapp')->value('error'));
    }

    // ------------------------------------------------------------ price drops

    private function saved(Customer $c, array $ids): void
    {
        DB::table('customer_wishlists')->updateOrInsert(['customer_id' => $c->id], ['ids' => json_encode($ids), 'updated_at' => now()]);
    }

    private function price(int $id, float $price): void
    {
        DB::table('products')->where('id', $id)->update(['price' => $price]);
    }

    private function drops(bool $dry = false): array
    {
        return app(PriceDropAlerts::class)->run($dry);
    }

    public function test_the_first_look_only_notes_the_price_and_a_real_drop_tells_everyone_who_saved_it(): void
    {
        $this->settings(['price_drop_enabled' => true]);
        $this->product(1, 'Teak Table', 12000);
        $a = $this->customer(1);
        $b = $this->customer(2);
        $this->saved($a, [1]);
        $this->saved($b, [1, 99]);

        $this->assertSame(0, $this->drops()['told']);
        $this->assertSame(12000.0, (float) DB::table('price_watch_marks')->where('product_id', 1)->value('price'));

        $this->price(1, 9000);
        $r = $this->drops();
        $this->assertSame([1, 2], [$r['dropped'], $r['told']]);
        $this->assertSame(['c1@example.com', 'c2@example.com'], $this->emails('price_drop'));
        $body = NotificationDelivery::where('type', 'price_drop')->where('channel', 'email')->value('body');
        $this->assertStringContainsString('now KES 9,000.00 (it was KES 12,000.00): 25% off', $body);
        $this->assertStringContainsString('/reminders/stop/', $body);
        $this->assertStringContainsString('?kind=price', $body);

        $this->assertSame(0, $this->drops()['told'], 'the same drop is not told twice');
        $this->assertSame(9000.0, (float) DB::table('price_watch_marks')->where('product_id', 1)->value('price'));
    }

    public function test_small_cuts_add_up_a_rise_moves_the_note_and_a_further_cut_tells_again(): void
    {
        $this->settings(['price_drop_enabled' => true, 'price_drop_min_percent' => 10]);
        $this->product(1, 'Teak Table', 1000);
        $this->saved($this->customer(), [1]);
        $this->drops();

        $this->price(1, 960);                       // 4%: not enough
        $this->assertSame(0, $this->drops()['dropped']);
        $this->price(1, 890);                       // 11% from the noted 1000: now it counts
        $this->assertSame(1, $this->drops()['told']);

        $this->price(1, 1200);                      // back up: the note follows
        $this->drops();
        $this->assertSame(1200.0, (float) DB::table('price_watch_marks')->value('price'));
        $this->price(1, 1000);                      // 17% off 1200, but they were told 890 less than a month ago and 1000 is higher
        $this->assertSame(0, $this->drops()['told']);
        $this->price(1, 800);                       // lower than what they were told: worth saying
        $this->assertSame(1, $this->drops()['told']);
        $this->assertCount(2, $this->emails('price_drop'));
    }

    public function test_not_for_stock_that_is_gone_a_customer_who_said_stop_or_when_switched_off_and_a_dry_run_changes_nothing(): void
    {
        $this->settings(['price_drop_enabled' => true]);
        $this->product(1, 'Teak Table', 1000);
        $this->product(2, 'Gone', 1000, false);
        $kept = $this->customer(1);
        $stopped = $this->customer(2);
        $this->saved($kept, [1, 2]);
        $this->saved($stopped, [1]);
        app(ReminderPrefs::class)->save($stopped->id, ['price' => false]);
        $this->drops();
        $this->price(1, 500);
        $this->price(2, 500);

        $dry = $this->drops(true);
        $this->assertSame([1, 1], [$dry['dropped'], $dry['would_tell']]);
        $this->assertSame(1000.0, (float) DB::table('price_watch_marks')->where('product_id', 1)->value('price'));

        $this->drops();
        $this->assertSame(['c1@example.com'], $this->emails('price_drop'), 'only the one who did not stop, and only the product in stock');

        $this->settings(['price_drop_enabled' => false]);
        $this->price(1, 100);
        $this->assertSame(0, $this->drops()['products']);
    }

    // ------------------------------------------------------------ the stop link and the profile

    public function test_the_stop_link_stops_one_kind_or_all_and_a_bad_token_is_refused(): void
    {
        $prefs = app(ReminderPrefs::class);
        $c = $this->customer();
        $token = $prefs->forCustomer($c->id)->token;
        $this->assertSame(['cart' => true, 'price' => true], $prefs->peek($token));
        $this->assertSame(['cart' => false, 'price' => true], $prefs->stop($token, 'cart'));
        $this->assertSame(['cart' => false, 'price' => true], $prefs->stop($token, 'cart'), 'again changes nothing');
        $this->assertSame(['cart' => false, 'price' => false], $prefs->stop($token, 'all'));
        $this->assertNull($prefs->stop(str_repeat('x', 40), 'cart'));
        $this->assertNull($prefs->stop($token, 'bogus'));
        $this->assertSame(['cart' => true, 'price' => false], $prefs->save($c->id, ['cart' => true]), 'the customer can turn one back on from their profile');
    }

    public function test_the_public_endpoints_work_without_signing_in(): void
    {
        $token = app(ReminderPrefs::class)->forCustomer($this->customer()->id)->token;
        $this->getJson("/api/reminder-prefs/{$token}")->assertOk()->assertJsonPath('cart', true);
        $this->postJson("/api/reminder-prefs/{$token}/stop", ['kind' => 'price'])->assertOk()->assertJsonPath('price', false)->assertJsonPath('cart', true);
        $this->postJson("/api/reminder-prefs/{$token}/stop", ['kind' => 'nope'])->assertStatus(422);
        $this->getJson('/api/reminder-prefs/' . str_repeat('z', 40))->assertNotFound();
    }
}
