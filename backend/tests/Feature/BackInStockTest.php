<?php

namespace Tests\Feature;

use App\Jobs\SendNotificationEmail;
use App\Jobs\TellBackInStock;
use App\Models\Customer;
use App\Models\NotificationDelivery;
use App\Models\StockWatch;
use App\Models\User;
use App\Services\Location\VariantStockService;
use App\Services\Notify\NotifySettings;
use App\Services\Stock\BackInStock;
use App\Services\Stock\BackInStockException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Facades\Schema;

/** "Tell me when it is back": who may ask, who is told (as many as there is stock, or everyone), the link to stop, and the hook on stock going up. */
class BackInStockTest extends NotifyTestCase
{
    use Concerns\CreatesPreorderTables;

    protected function setUp(): void
    {
        parent::setUp();
        $this->createPreorderTables();
        config(['app.frontend_url' => 'https://shop.example.com']);
        Schema::table('products', function ($t) { $t->decimal('stock_quantity', 12, 4)->default(0); $t->boolean('in_stock')->default(false); $t->decimal('sellable_quantity', 12, 4)->default(0); });
        Schema::table('product_variants', function ($t) { $t->decimal('stock_quantity', 12, 4)->default(0); $t->decimal('sellable_quantity', 12, 4)->default(0); });
        Schema::create('locations', function ($t) { $t->id(); $t->string('name')->nullable(); $t->string('code')->nullable(); $t->boolean('is_active')->default(true); $t->boolean('sells_to_customers')->default(true); $t->boolean('is_default')->default(false); $t->timestamps(); });
        Schema::create('stock_watches', function ($t) { $t->id(); $t->unsignedBigInteger('product_id'); $t->unsignedBigInteger('variant_id'); $t->unsignedBigInteger('customer_id')->nullable(); $t->string('email', 190); $t->string('name', 120)->nullable(); $t->char('token', 40)->unique(); $t->string('status', 10)->default('waiting'); $t->dateTime('notified_at')->nullable(); $t->dateTime('stopped_at')->nullable(); $t->timestamps(); });
        Schema::create('stock_watch_runs', function ($t) { $t->id(); $t->unsignedBigInteger('variant_id'); $t->string('trigger_by', 10); $t->string('mode', 10); $t->decimal('stock', 14, 4)->default(0); $t->unsignedInteger('told')->default(0); $t->unsignedInteger('left_waiting')->default(0); $t->unsignedBigInteger('user_id')->nullable(); $t->timestamp('created_at')->nullable(); });
        DB::table('locations')->insert(['id' => 1, 'name' => 'Main', 'is_default' => true, 'created_at' => now(), 'updated_at' => now()]);
        DB::table('products')->insert(['id' => 1, 'name' => 'Teak Table', 'created_at' => now(), 'updated_at' => now()]);
        DB::table('product_variants')->insert(['id' => 1, 'product_id' => 1, 'name' => 'Default', 'is_default' => true, 'created_at' => now(), 'updated_at' => now()]);
        Queue::fake();
    }

    private function stockIs(float $q): void
    {
        DB::table('product_variants')->where('id', 1)->update(['stock_quantity' => $q, 'sellable_quantity' => $q]);
    }

    private function ask(string $email, array $o = []): array
    {
        return app(BackInStock::class)->watch(['product_id' => 1, 'email' => $email] + $o, null);
    }

    private function general(array $o): void
    {
        app(NotifySettings::class)->save('general', $o, $this->admin());
    }

    private function emailsTo(): array
    {
        return NotificationDelivery::where('type', 'back_in_stock')->where('channel', 'email')->orderBy('id')->pluck('to_address')->all();
    }

    // ------------------------------------------------------------ asking

    public function test_anyone_with_an_email_can_ask_on_an_out_of_stock_product_and_asking_twice_is_one_request(): void
    {
        $a = $this->ask('  Wanjiku@Example.com ', ['name' => 'Wanjiku Kamau']);
        $this->assertFalse($a['already']);
        $this->assertSame(['wanjiku@example.com', 'waiting', 1], [$a['watch']->email, $a['watch']->status, $a['watch']->variant_id], 'the default variant when none is chosen; the address is tidied');
        $this->assertSame(40, strlen($a['watch']->token));
        $this->assertTrue($this->ask('wanjiku@example.com')['already']);
        $this->assertSame(1, StockWatch::count());
    }

    public function test_it_refuses_when_it_can_be_bought_when_the_email_is_bad_when_too_many_or_when_switched_off(): void
    {
        $this->stockIs(2);
        $this->assertThrowsMessage('in stock now', fn () => $this->ask('a@example.com'));
        $this->stockIs(0);
        $this->assertThrowsMessage('valid email', fn () => $this->ask('not-an-email'));
        $this->assertThrowsMessage('product was not found', fn () => app(BackInStock::class)->watch(['product_id' => 99, 'email' => 'a@example.com'], null));
        $this->assertThrowsMessage('option was not found', fn () => $this->ask('a@example.com', ['variant_id' => 77]));

        for ($i = 1; $i <= BackInStock::MAX_WAITING_PER_EMAIL; $i++) {
            DB::table('products')->insert(['id' => 100 + $i, 'name' => "P{$i}", 'created_at' => now(), 'updated_at' => now()]);
            DB::table('product_variants')->insert(['id' => 100 + $i, 'product_id' => 100 + $i, 'name' => 'D', 'is_default' => true, 'created_at' => now(), 'updated_at' => now()]);
            app(BackInStock::class)->watch(['product_id' => 100 + $i, 'email' => 'busy@example.com'], null);
        }
        $this->assertThrowsMessage('already waiting for', fn () => $this->ask('busy@example.com'));

        $this->general(['back_in_stock_enabled' => false]);
        $this->assertThrowsMessage('not available', fn () => $this->ask('a@example.com'));
    }

    public function test_a_signed_in_customer_is_linked_and_needs_no_typing(): void
    {
        $u = User::forceCreate(['id' => 40, 'name' => 'Amina', 'email' => 'amina@example.com', 'password' => 'x']);
        Customer::forceCreate(['user_id' => 40, 'first_name' => 'Amina', 'last_name' => 'Wanjiru', 'email' => 'amina@example.com']);
        $w = app(BackInStock::class)->watch(['product_id' => 1], $u->fresh())['watch'];
        $this->assertSame(['amina@example.com', 'Amina Wanjiru'], [$w->email, $w->name]);
        $this->assertNotNull($w->customer_id);
    }

    private function assertThrowsMessage(string $fragment, callable $fn): void
    {
        try {
            $fn();
            $this->fail("Expected a BackInStockException containing “{$fragment}”.");
        } catch (BackInStockException $e) {
            $this->assertStringContainsString($fragment, $e->getMessage());
        }
    }

    // ------------------------------------------------------------ telling

    private function waiting(int $n): void
    {
        for ($i = 1; $i <= $n; $i++) {
            $this->ask("person{$i}@example.com", ['name' => "Person {$i}"]);
        }
    }

    public function test_as_many_as_there_is_stock_first_come_first_served_and_the_rest_keep_waiting(): void
    {
        $this->waiting(5);
        $this->stockIs(3);
        $r = app(BackInStock::class)->tell(1, 'stock', null);
        $this->assertSame([3, 2], [$r['told'], $r['left']]);
        $this->assertSame(['person1@example.com', 'person2@example.com', 'person3@example.com'], $this->emailsTo());
        $this->assertSame(['notified', 'notified', 'notified', 'waiting', 'waiting'], StockWatch::orderBy('id')->pluck('status')->all());
        Queue::assertPushed(SendNotificationEmail::class, 3);
        $body = NotificationDelivery::where('to_address', 'person1@example.com')->value('body');
        $this->assertStringContainsString('Teak Table is back in stock', $body);
        $this->assertStringContainsString('first come, first served', $body);
        $this->assertStringContainsString('https://shop.example.com/stock-alerts/stop/' . StockWatch::first()->token, $body);
    }

    public function test_people_told_a_moment_ago_count_as_holding_stock_until_the_hold_runs_out(): void
    {
        $this->waiting(5);
        $this->stockIs(3);
        app(BackInStock::class)->tell(1, 'stock', null);
        $again = app(BackInStock::class)->tell(1, 'stock', null);
        $this->assertSame(0, $again['told'], 'the three told just now still have the stock to themselves');

        $this->travel(25)->hours();
        $later = app(BackInStock::class)->tell(1, 'stock', null);
        $this->assertSame(2, $later['told'], 'a day on, with the stock still there, the next people are told');
    }

    public function test_everyone_when_the_company_or_staff_say_all_but_never_when_nothing_can_be_bought(): void
    {
        $this->waiting(5);
        $this->stockIs(0);
        $this->assertSame(0, app(BackInStock::class)->tell(1, 'all', null)['told']);
        $this->stockIs(1);
        $r = app(BackInStock::class)->tell(1, 'all', $this->admin());
        $this->assertSame([5, 0], [$r['told'], $r['left']]);
        $this->assertSame([5], DB::table('stock_watch_runs')->where('trigger_by', 'staff')->pluck('told')->all());
    }

    public function test_stopped_requests_are_never_told_and_the_stop_link_works_once_or_a_hundred_times(): void
    {
        $this->waiting(2);
        $first = StockWatch::first();
        $this->assertSame('waiting', app(BackInStock::class)->peek($first->token)['status']);
        $this->assertSame('stopped', app(BackInStock::class)->stop($first->token)['status']);
        $this->assertSame('stopped', app(BackInStock::class)->stop($first->token)['status']);
        $this->assertNull(app(BackInStock::class)->stop(str_repeat('x', 40)));
        $this->assertNull(app(BackInStock::class)->stop('short'));
        $this->stockIs(5);
        app(BackInStock::class)->tell(1, 'all', null);
        $this->assertSame(['person2@example.com'], $this->emailsTo());
    }

    public function test_the_company_default_decides_what_happens_on_its_own_and_manual_waits_for_staff(): void
    {
        $this->waiting(4);
        $this->stockIs(2);
        $this->general(['back_in_stock_mode' => 'manual']);
        $this->assertNull(app(BackInStock::class)->restocked(1));
        $this->assertSame([], $this->emailsTo());

        $this->general(['back_in_stock_mode' => 'stock']);
        $this->assertSame(2, app(BackInStock::class)->restocked(1)['told']);

        $this->general(['back_in_stock_mode' => 'all']);
        $this->assertSame(2, app(BackInStock::class)->restocked(1)['told'], 'everyone else');
    }

    public function test_an_essential_only_customer_is_still_told_because_they_asked(): void
    {
        $u = User::forceCreate(['id' => 40, 'name' => 'Amina', 'email' => 'amina@example.com', 'password' => 'x']);
        Customer::forceCreate(['user_id' => 40, 'first_name' => 'Amina', 'last_name' => 'W', 'email' => 'amina@example.com', 'notify_essential_only' => true]);
        app(BackInStock::class)->watch(['product_id' => 1], $u->fresh());
        $this->stockIs(1);
        app(BackInStock::class)->tell(1, 'all', null);
        $this->assertSame(['amina@example.com'], $this->emailsTo());
    }

    public function test_old_requests_are_let_go_after_a_year(): void
    {
        $this->waiting(2);
        StockWatch::first()->forceFill(['created_at' => now()->subDays(400)])->save();
        $this->assertSame(1, app(BackInStock::class)->expireOld());
        $this->assertSame(['expired', 'waiting'], StockWatch::orderBy('id')->pluck('status')->all());
    }

    // ------------------------------------------------------------ the hook on stock going up

    public function test_stock_going_up_tells_the_queue_and_going_down_or_nobody_waiting_does_not(): void
    {
        $stock = app(VariantStockService::class);
        $product = \App\Models\Product::find(1);
        DB::table('variant_location_stock')->insert(['product_variant_id' => 1, 'location_id' => 1, 'quantity' => 0, 'created_at' => now(), 'updated_at' => now()]);

        $set = function (float $q) use ($stock, $product) {
            DB::table('variant_location_stock')->where('product_variant_id', 1)->update(['quantity' => $q]);
            $stock->recomputeCaches($product->fresh());
        };
        $set(4);
        Queue::assertNotPushed(TellBackInStock::class);   // nobody is waiting
        $set(0);
        $this->waiting(1);
        $set(9);
        Queue::assertPushed(TellBackInStock::class, 1);
        $this->assertSame(1, Queue::pushed(TellBackInStock::class)->first()->variantId);
        $set(5);   // went down
        Queue::assertPushed(TellBackInStock::class, 1);
        $this->assertSame(5.0, (float) DB::table('product_variants')->where('id', 1)->value('sellable_quantity'));
    }

    // ------------------------------------------------------------ the API

    public function test_the_public_endpoints_ask_look_up_and_stop_without_signing_in(): void
    {
        $this->getJson('/api/stock-watches/enabled')->assertOk()->assertJsonPath('enabled', true);
        $this->postJson('/api/stock-watches', ['product_id' => 1, 'email' => 'guest@example.com'])->assertStatus(201)->assertJsonPath('already', false);
        $this->postJson('/api/stock-watches', ['product_id' => 1, 'email' => 'guest@example.com'])->assertStatus(200)->assertJsonPath('already', true);
        $this->postJson('/api/stock-watches', ['product_id' => 1, 'email' => 'nope'])->assertStatus(422);
        $this->stockIs(3);
        $this->postJson('/api/stock-watches', ['product_id' => 1, 'email' => 'other@example.com'])->assertStatus(422)->assertJsonPath('message', 'It is in stock now: you can order it.');

        $token = DB::table('stock_watches')->value('token');
        $this->getJson("/api/stock-watches/{$token}")->assertOk()->assertJsonPath('product', 'Teak Table')->assertJsonPath('status', 'waiting');
        $this->postJson("/api/stock-watches/{$token}/stop")->assertOk()->assertJsonPath('status', 'stopped');
        $this->getJson('/api/stock-watches/' . str_repeat('z', 40))->assertNotFound();
    }

    public function test_staff_see_who_is_waiting_and_tell_them_with_a_chosen_mode(): void
    {
        $this->waiting(3);
        $this->stockIs(1);
        $c = new \App\Http\Controllers\Api\StockWatchController(app(BackInStock::class));
        $o = $c->overview()->getData(true);
        $this->assertSame([3, 1, 'Teak Table'], [$o['products'][0]['waiting'], $o['products'][0]['stock'], $o['products'][0]['product']]);

        $user = $this->admin();
        $req = \Illuminate\Http\Request::create('/x', 'POST', ['mode' => 'stock']);
        $req->setUserResolver(fn () => $user);
        $r = $c->tell($req, 1)->getData(true);
        $this->assertSame([1, 2], [$r['told'], $r['left']]);
        $this->assertSame('Told 1 person, 2 still waiting.', $r['message']);
        $this->assertSame('Admin 5', $c->overview()->getData(true)['runs'][0]['by']);
    }
}
