<?php

namespace Tests\Feature;

use App\Models\Books\Voucher;
use App\Models\Menus\Channel;
use App\Models\Menus\Kiosk;
use App\Models\Menus\MenuOrder;
use App\Models\Menus\Ticket;
use App\Services\Books\BooksException;
use App\Services\Menus\CounterService;
use App\Services\Menus\KioskService;
use App\Services\Menus\MenuOrderNotices;
use App\Services\Menus\MenuOrderService;
use App\Services\Menus\MenuService;
use App\Services\Menus\MenusSettings;
use App\Services\Menus\ReceiptService;
use App\Services\Notify\Notifier;
use App\Services\Notify\Staff;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/** Menus step 7: the self-order kiosk. Setting a screen up, ordering with no sign-in, paying at the screen (M-Pesa) or at the counter, and what the kitchen and the cashier see. */
class MenusKioskTest extends TestCase
{
    use Concerns\CreatesCounterWorld;

    private Kiosk $kiosk;
    private array $told = [];

    protected function setUp(): void
    {
        parent::setUp();
        $this->createCounterWorld();
        $n = $this->createMock(MenuOrderNotices::class);
        foreach (['placed', 'paid', 'ready', 'out', 'cancelled'] as $m) {
            $n->method($m)->willReturnCallback(function (MenuOrder $o) use ($m) { $this->told[] = [$m, $o->number]; });
        }
        $this->app->instance(MenuOrderNotices::class, $n);
        $this->kiosk = $this->kiosks()->save(['name' => 'Front kiosk', 'location_id' => self::BRANCH, 'welcome' => 'Touch to order']);
    }

    private function kiosks(): KioskService
    {
        return app(KioskService::class);
    }

    private function counter(): CounterService
    {
        return app(CounterService::class);
    }

    private function dish(string $name = 'Burger', float $price = 500, int $stock = 50)
    {
        $d = $this->make($name, $price);
        $this->stock((int) $d->variant_id, $stock);
        $m = \App\Models\Menus\Menu::first() ?? app(MenuService::class)->save(['name' => 'All day']);
        $s = $m->sections()->first() ?? $m->sections()->create(['name' => 'Mains']);
        DB::table('menus_section_dishes')->insert(['section_id' => $s->id, 'dish_id' => $d->id]);

        return $d;
    }

    private function in($d, array $o = []): array
    {
        return $o + ['service' => 'take_out', 'pay' => 'counter', 'items' => [['dish_id' => $d->id, 'quantity' => 2]]];
    }

    private function screen($d, array $o = []): array
    {
        return $this->in($d, $o + ['pay' => 'screen', 'payment_method_id' => 4, 'phone' => '0712345678']);
    }

    private function fails(callable $fn, string $part): void
    {
        try {
            $fn();
        } catch (BooksException $e) {
            $this->assertStringContainsString($part, $e->getMessage());

            return;
        }
        $this->fail("Expected: {$part}");
    }

    // ------------------------------------------------------------ setting a kiosk up

    public function test_a_kiosk_keeps_to_its_limits_and_has_a_secret_address(): void
    {
        $this->fails(fn () => $this->kiosks()->save(['name' => ' ', 'location_id' => self::BRANCH]), 'name');
        $this->fails(fn () => $this->kiosks()->save(['name' => 'K', 'location_id' => 999]), 'branch');
        $this->fails(fn () => $this->kiosks()->save(['name' => 'K', 'location_id' => self::BRANCH, 'idle_seconds' => 5]), '15 to 600');
        $this->fails(fn () => $this->kiosks()->save(['name' => 'K', 'location_id' => self::BRANCH, 'pay_at_screen' => false, 'pay_at_counter' => false]), 'at the screen, at the counter, or both');
        $this->assertSame(32, strlen($this->kiosk->token));
        config(['app.frontend_url' => 'https://shop.example/']);
        $this->assertSame('https://shop.example/kiosk/'.$this->kiosk->token, $this->kiosks()->url($this->kiosk));
        $old = $this->kiosk->token;
        $this->assertNotSame($old, $this->kiosks()->renewToken($this->kiosk)->token);
        $this->expectException(\Illuminate\Database\Eloquent\ModelNotFoundException::class);
        $this->kiosks()->forToken($old);
    }

    public function test_a_switched_off_kiosk_or_a_wrong_address_opens_nothing(): void
    {
        $this->kiosks()->save(['name' => 'Front kiosk', 'is_active' => false], $this->kiosk->id);
        $this->expectException(\Illuminate\Database\Eloquent\ModelNotFoundException::class);
        $this->kiosks()->forToken($this->kiosk->fresh()->makeVisible('token')->token);
    }

    public function test_the_screen_gets_its_menu_rules_and_only_ways_to_pay_it_can_use(): void
    {
        $this->dish();
        MenusSettings::save(['service_charge_pct' => 10, 'service_charge_ledger_id' => 81], null);
        $c = $this->kiosks()->config($this->kiosk, $this->now);
        $this->assertSame(['Front kiosk', 60, true, true, 10.0, 'Touch to order'], [$c['name'], $c['idle_seconds'], $c['pay_at_screen'], $c['pay_at_counter'], $c['service_charge_pct'], $c['welcome']]);
        DB::table('payment_methods')->insert(['id' => 5, 'name' => 'Card page', 'kind' => 'card', 'is_active' => true, 'is_online' => true, 'gateway' => 'pesapal']);
        $this->assertSame(['M-Pesa online'], array_column($this->kiosks()->config($this->kiosk, $this->now)['payment_methods'], 'name'), 'only a way the kiosk can charge by itself, without leaving the screen');
        $this->assertNotEmpty($c['menu']['menus']);
        $this->kiosks()->save(['name' => 'Front kiosk', 'pay_at_screen' => false], $this->kiosk->id);
        $this->assertSame([], $this->kiosks()->config($this->kiosk->fresh(), $this->now)['payment_methods'], 'no payment at the screen: nothing offered');
        Channel::where('code', 'kiosk')->update(['menu_ids' => [999]]);
        $this->assertSame([], $this->kiosks()->config($this->kiosk->fresh(), $this->now)['menu']['menus'], 'the kiosk shows only the menus chosen for it');
    }

    // ------------------------------------------------------------ ordering

    public function test_the_kiosk_prices_like_the_counter_with_a_service_charge_for_dine_in_and_no_tip(): void
    {
        $d = $this->dish();
        MenusSettings::save(['service_charge_pct' => 10, 'service_charge_ledger_id' => 81, 'tip_ledger_id' => 80], null);
        $this->assertSame([1160.0, 0.0], [$this->kiosks()->quote($this->kiosk, $this->in($d), $this->now)['total'], $this->kiosks()->quote($this->kiosk, $this->in($d), $this->now)['service_charge']]);
        $this->assertSame([1260.0, 100.0], [$this->kiosks()->quote($this->kiosk, $this->in($d, ['service' => 'dine_in']), $this->now)['total'], $this->kiosks()->quote($this->kiosk, $this->in($d, ['service' => 'dine_in']), $this->now)['service_charge']]);
        $this->fails(fn () => $this->kiosks()->quote($this->kiosk, $this->in($d, ['service' => 'floor']), $this->now), 'dine in or take out');
        $this->fails(fn () => $this->kiosks()->quote($this->kiosk, $this->in($d, ['items' => []]), $this->now), 'basket is empty');
    }

    public function test_paying_at_the_counter_gives_a_number_and_the_kitchen_waits_for_the_cashier(): void
    {
        $d = $this->dish();
        $r = $this->kiosks()->place($this->kiosk, $this->in($d), $this->now);
        $o = $r['order'];
        $this->assertSame(['kiosk', 'take_out', 'open', 'placed', 1, $this->kiosk->id, 10], [$o->order_type, $o->service, $o->payment, $o->status, $o->short_no, $o->kiosk_id, strlen($o->session_code)]);
        $this->assertSame(1160.0, (float) $o->total);
        $this->assertNull($o->voucher_id, 'nothing is booked until it is paid');
        $this->assertSame([0, []], [Ticket::count(), $this->placed], 'and the kitchen has no ticket yet');
        $this->assertArrayNotHasKey('attempt', $r);
        $this->assertSame([$o->id], $this->counter()->board()['kiosk']->pluck('id')->all(), 'the cashier sees it');

        $paid = $this->counter()->settleKiosk($o->fresh(), ['tenders' => [['payment_method_id' => 1, 'amount' => 2000]]]);
        $this->assertSame(['paid', 'placed', 840.0, 1], [$paid->payment, $paid->status, (float) $paid->change_due, Ticket::count()]);
        $this->assertSame(1, count($this->placed));
        $this->assertSame([], $this->counter()->board()['kiosk']->all());
        $this->assertSame([$o->id], $this->counter()->board()['ready']->pluck('id')->all(), 'then it waits to be handed over like any paid order');
        $this->assertFalse($paid->fresh()->payment === 'open');
        $this->fails(fn () => $this->counter()->settleKiosk($paid->fresh(), ['tenders' => [['payment_method_id' => 1, 'amount' => 2000]]]), 'not a kiosk order waiting');
    }

    public function test_the_cashier_must_take_the_full_amount_and_only_for_kiosk_orders(): void
    {
        $d = $this->dish();
        $o = $this->kiosks()->place($this->kiosk, $this->in($d), $this->now)['order'];
        $this->fails(fn () => $this->counter()->settleKiosk($o->fresh(), ['tenders' => [['payment_method_id' => 1, 'amount' => 500]]]), 'short by');
        $this->assertSame('open', $o->fresh()->payment);
        $this->assertSame(0, Ticket::count());
        $counterTab = $this->counter()->openTab(['service' => 'take_out', 'label' => 'T', 'items' => [['dish_id' => $d->id, 'quantity' => 1]]], null, $this->now);
        $this->fails(fn () => $this->counter()->settleKiosk($counterTab, ['tenders' => [['payment_method_id' => 1, 'amount' => 900]]]), 'not a kiosk order waiting');
    }

    public function test_paying_at_the_screen_starts_the_m_pesa_prompt_and_the_kitchen_starts_when_the_money_arrives(): void
    {
        $d = $this->dish();
        $r = $this->kiosks()->place($this->kiosk, $this->screen($d), $this->now);
        $o = $r['order'];
        $this->assertSame(['pending', 1160.0, '0712345678', 1160.0, 701], [$o->payment, (float) $o->total, $this->started[0]['contact']['phone'], $this->started[0]['due'], $r['attempt']['id']]);
        $this->assertSame(0, Ticket::count(), 'not started until it is paid');
        $voucher = Voucher::find($o->voucher_id);
        $this->assertSame($o->id, $voucher->meta['menu_order_id']);
        app(MenuOrderService::class)->paid($voucher, Voucher::create(['voucher_type_id' => 1, 'voucher_number' => 'CS-1']));
        app(MenuOrderService::class)->paid($voucher, Voucher::create(['voucher_type_id' => 1, 'voucher_number' => 'CS-2']));
        $o = $o->fresh();
        $this->assertSame(['paid', 'placed', 1], [$o->payment, $o->status, Ticket::count()], 'paid once; the kitchen has its ticket; the order is not closed by the payment');
        $this->assertSame([], $this->told, 'nobody is messaged: the guest follows the number on the screen');
    }

    public function test_only_ways_the_kiosk_offers_can_be_chosen(): void
    {
        $d = $this->dish();
        $this->fails(fn () => $this->kiosks()->place($this->kiosk, $this->screen($d, ['payment_method_id' => 1]), $this->now), 'Choose M-Pesa');
        $this->fails(fn () => $this->kiosks()->place($this->kiosk, $this->screen($d, ['phone' => ' ']), $this->now), 'phone number');
        $this->fails(fn () => $this->kiosks()->place($this->kiosk, $this->in($d, ['pay' => 'barter']), $this->now), 'how you would like to pay');
        $this->kiosks()->save(['name' => 'Front kiosk', 'pay_at_counter' => false], $this->kiosk->id);
        $this->fails(fn () => $this->kiosks()->place($this->kiosk->fresh(), $this->in($d), $this->now), 'how you would like to pay');
        $this->kiosks()->save(['name' => 'Front kiosk', 'pay_at_counter' => true, 'pay_at_screen' => false], $this->kiosk->id);
        $this->fails(fn () => $this->kiosks()->place($this->kiosk->fresh(), $this->screen($d), $this->now), 'how you would like to pay');
        $this->gatewayFails = true;
        $this->kiosks()->save(['name' => 'Front kiosk', 'pay_at_screen' => true], $this->kiosk->id);
        $this->fails(fn () => $this->kiosks()->place($this->kiosk->fresh(), $this->screen($d), $this->now), 'could not start');
        $this->assertSame(0, MenuOrder::count(), 'a payment that could not start leaves no order behind');
    }

    public function test_a_dish_that_is_not_available_can_not_be_ordered(): void
    {
        $d = $this->dish('Burger', 500, 1);
        $this->fails(fn () => $this->kiosks()->place($this->kiosk, $this->in($d), $this->now), 'Only 1 of Burger left');
        Channel::where('code', 'kiosk')->update(['is_active' => false]);
        $this->fails(fn () => $this->kiosks()->place($this->kiosk, $this->in($this->dish('Chips', 100)), $this->now), 'not switched on');
    }

    public function test_call_out_numbers_are_shared_by_the_counter_and_the_kiosk(): void
    {
        $d = $this->dish();
        $a = $this->counter()->sell(['service' => 'take_out', 'items' => [['dish_id' => $d->id, 'quantity' => 1]], 'tenders' => [['payment_method_id' => 1, 'amount' => 1000]]], null, $this->now);
        $b = $this->kiosks()->place($this->kiosk, $this->in($d), $this->now)['order'];
        $this->assertSame([1, 2], [$a->short_no, $b->short_no]);
        $first = $this->kiosks()->place($this->kiosk, $this->in($d), $this->now)['order'];
        $next = $this->counter()->sell(['service' => 'take_out', 'items' => [['dish_id' => $d->id, 'quantity' => 1]], 'tenders' => [['payment_method_id' => 1, 'amount' => 1000]]], null, $this->now);
        $this->assertSame([3, 4], [$first->short_no, $next->short_no], 'whichever comes first, the numbers never repeat');
        $this->assertNotSame($this->kiosks()->place($this->kiosk, $this->in($d), $this->now)['order']->session_code, $b->session_code);
    }

    // ------------------------------------------------------------ while the guest waits

    public function test_the_screen_follows_its_order_by_session_and_only_its_own(): void
    {
        $d = $this->dish();
        $o = $this->kiosks()->place($this->kiosk, $this->in($d), $this->now)['order'];
        $s = $this->kiosks()->status($this->kiosk, $o->session_code);
        $this->assertSame([1, 'open', 'placed', ['Burger']], [$s['number'], $s['payment'], $s['status'], array_column($s['lines'], 'name')]);
        $other = $this->kiosks()->save(['name' => 'Back kiosk', 'location_id' => self::BRANCH]);
        $this->expectException(\Illuminate\Database\Eloquent\ModelNotFoundException::class);
        $this->kiosks()->status($other, $o->session_code);
    }

    public function test_the_guest_can_back_out_until_it_is_paid(): void
    {
        $d = $this->dish();
        $counter = $this->kiosks()->place($this->kiosk, $this->in($d), $this->now)['order'];
        $this->assertSame('cancelled', $this->kiosks()->cancel($this->kiosk, $counter->session_code)->status);
        $screen = $this->kiosks()->place($this->kiosk, $this->screen($d), $this->now)['order'];
        $c = $this->kiosks()->cancel($this->kiosk, $screen->session_code);
        $this->assertSame(['cancelled', 'failed', [$screen->voucher_id]], [$c->status, $c->payment, $this->cancelled], 'the pending payment is cancelled in the books');
        $paid = $this->kiosks()->place($this->kiosk, $this->in($d), $this->now)['order'];
        $this->counter()->settleKiosk($paid->fresh(), ['tenders' => [['payment_method_id' => 1, 'amount' => 1160]]]);
        $this->fails(fn () => $this->kiosks()->cancel($this->kiosk, $paid->session_code), 'can not be cancelled here');
    }

    public function test_kiosk_orders_nobody_paid_for_are_swept(): void
    {
        $d = $this->dish();
        $old = $this->kiosks()->place($this->kiosk, $this->in($d), $this->now)['order'];
        $fresh = $this->kiosks()->place($this->kiosk, $this->in($d), $this->now)['order'];
        $paid = $this->kiosks()->place($this->kiosk, $this->in($d), $this->now)['order'];
        $this->counter()->settleKiosk($paid->fresh(), ['tenders' => [['payment_method_id' => 1, 'amount' => 1160]]]);
        MenuOrder::whereIn('id', [$old->id, $paid->id])->update(['created_at' => $this->now->copy()->subMinutes(90)]);
        $this->assertSame(1, $this->kiosks()->sweep(60));
        $this->assertSame(['cancelled', 'placed', 'placed'], [$old->fresh()->status, $fresh->fresh()->status, $paid->fresh()->status]);
        $this->assertSame(0, $this->kiosks()->sweep(60));
    }

    // ------------------------------------------------------------ the receipt and messages

    public function test_the_receipt_shows_the_kiosk_session_and_says_when_it_is_not_paid(): void
    {
        $d = $this->dish();
        $o = $this->kiosks()->place($this->kiosk, $this->in($d, ['service' => 'dine_in']), $this->now)['order'];
        $text = app(ReceiptService::class)->for($o->fresh())['text'];
        $this->assertMatchesRegularExpression('/Kiosk Session\s+'.$o->session_code.'/', $text);
        $this->assertMatchesRegularExpression('/Order Type\s+Dine In/', $text);
        $this->assertStringContainsString('PAY AT THE COUNTER', $text);
        $this->assertSame($text, $this->kiosks()->receipt($this->kiosk, $o->session_code)['text']);
        $this->counter()->settleKiosk($o->fresh(), ['tenders' => [['payment_method_id' => 1, 'amount' => 2000]]]);
        $this->assertStringNotContainsString('PAY AT THE COUNTER', app(ReceiptService::class)->for($o->fresh())['text']);
    }

    public function test_nobody_is_messaged_about_a_kiosk_order(): void
    {
        $sent = [];
        $notifier = $this->createMock(Notifier::class);
        $notifier->method('send')->willReturnCallback(function () use (&$sent) { $sent[] = 's'; return []; });
        $notifier->method('sendToContact')->willReturnCallback(function () use (&$sent) { $sent[] = 'c'; return []; });
        $n = new MenuOrderNotices($notifier, $this->createMock(Staff::class));
        $o = $this->kiosks()->place($this->kiosk, $this->in($this->dish()), $this->now)['order'];
        $n->ready($o);
        $n->cancelled($o);
        $this->assertSame([], $sent);
    }
}
