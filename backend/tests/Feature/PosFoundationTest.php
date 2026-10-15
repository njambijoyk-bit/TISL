<?php

namespace Tests\Feature;

use App\Models\Access\AccessLog;
use App\Models\Books\PaymentMethod;
use App\Models\Pos\Station;
use App\Services\Books\BooksException;
use App\Services\Pos\ApprovalRequired;
use App\Services\Pos\PinService;
use App\Services\Pos\ShiftService;
use App\Services\Pos\StationLedgers;
use App\Services\Pos\StationService;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Route;
use Tests\TestCase;

/** Point of sale: stations and their ledgers, supervisor PINs, shifts and the cash over or short, and the menus.till doors. The books' voucher service is stood in for. */
class PosFoundationTest extends TestCase
{
    use Concerns\CreatesPosWorld;

    protected function setUp(): void
    {
        parent::setUp();
        $this->createPosWorld();
        $this->pinFor($this->boss);
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        StationLedgers::forget();
        parent::tearDown();
    }

    private function shifts(): ShiftService
    {
        return app(ShiftService::class);
    }

    private function approval(string $purpose, $by = null): string
    {
        return app(PinService::class)->approve($this->cashier, $this->till, ($by ?? $this->boss)->id, '482916', $purpose)['token'];
    }

    // ── stations ──

    public function test_the_first_staff_till_of_a_branch_is_its_default_and_a_second_is_not(): void
    {
        $this->assertTrue($this->till->is_default);
        $second = app(StationService::class)->save(['name' => 'Second till', 'code' => 'T2', 'location_id' => 1]);
        $this->assertFalse($second->is_default);
        $this->assertTrue($this->till->fresh()->is_default);
    }

    public function test_a_station_takes_cash_and_bank_ledgers_from_the_right_groups_only(): void
    {
        $s = app(StationService::class)->save(['cash_ledger_id' => 11, 'bank_ledger_id' => 20], $this->till);
        $this->assertSame([11, 20], [(int) $s->cash_ledger_id, (int) $s->bank_ledger_id]);

        foreach ([['cash_ledger_id' => 20], ['bank_ledger_id' => 10], ['cash_ledger_id' => 30]] as $bad) {
            try {
                app(StationService::class)->save($bad, $this->till);
                $this->fail('a ledger from the wrong group was accepted');
            } catch (BooksException $e) {
                $this->assertStringContainsString('Choose a ledger', $e->getMessage());
            }
        }
        $this->assertSame(11, (int) $this->till->fresh()->cash_ledger_id);
        $cleared = app(StationService::class)->save(['cash_ledger_id' => null], $this->till);   // blank goes back to the method's own ledger
        $this->assertNull($cleared->cash_ledger_id);
    }

    public function test_a_station_posts_cash_and_bank_to_its_own_ledgers_and_leaves_gift_vouchers_alone(): void
    {
        app(StationService::class)->save(['cash_ledger_id' => 11, 'bank_ledger_id' => 21], $this->till);
        StationLedgers::forget();
        $cash = StationLedgers::method(PaymentMethod::find(1), $this->till->id);
        $mpesa = StationLedgers::method(PaymentMethod::find(2), $this->till->id);
        $gift = StationLedgers::method(PaymentMethod::find(3), $this->till->id);
        $this->assertSame([11, 21, 99], [(int) $cash->ledger_id, (int) $mpesa->ledger_id, (int) $gift->ledger_id]);
        $this->assertSame(10, (int) PaymentMethod::find(1)->ledger_id, 'the method itself is not changed');
        $this->assertSame(10, (int) StationLedgers::method(PaymentMethod::find(1), null)->ledger_id, 'no station: the method\'s own ledger');
    }

    // ── supervisor PINs ──

    public function test_an_approval_is_good_once_for_one_purpose_and_five_wrong_pins_lock_it(): void
    {
        $pins = app(PinService::class);
        $token = $this->approval('close_shift');
        $this->assertSame($this->boss->id, $pins->peek($token, $this->cashier, $this->till, 'close_shift'));
        $this->assertNull($pins->peek($token, $this->cashier, $this->till, 'reopen_shift'), 'another purpose');
        $this->assertNull($pins->peek($token, $this->boss, $this->till, 'close_shift'), 'another person');
        $pins->spend($token, $this->cashier, $this->till, 'close_shift');
        $this->expectException(ApprovalRequired::class);
        $pins->spend($token, $this->cashier, $this->till, 'close_shift');
    }

    public function test_wrong_pins_lock_the_supervisor_for_a_while(): void
    {
        $pins = app(PinService::class);
        for ($i = 0; $i < 5; $i++) {
            try {
                $pins->approve($this->cashier, $this->till, $this->boss->id, '000000', 'return');
            } catch (BooksException) {
            }
        }
        $this->expectExceptionMessage('locked');
        $pins->approve($this->cashier, $this->till, $this->boss->id, '482916', 'return');
    }

    // ── shifts ──

    public function test_one_open_shift_per_person_and_per_station(): void
    {
        $this->shifts()->open($this->cashier, $this->till, 500);
        try {
            $this->shifts()->open($this->cashier, $this->till, 0);
            $this->fail('a second shift opened');
        } catch (BooksException $e) {
            $this->assertStringContainsString('already have a shift open', $e->getMessage());
        }
        $this->expectExceptionMessage('Someone else has this station open');
        $this->shifts()->open($this->boss, $this->till, 0);
    }

    public function test_expected_cash_is_the_float_plus_cash_taken_and_a_gift_voucher_is_not_drawer_cash(): void
    {
        $sh = $this->shifts()->open($this->cashier, $this->till, 500);
        $this->cashSale($sh->id, [1 => 1000, 2 => 400, 3 => 150]);
        $r = $this->shifts()->report($this->cashier, $sh->id);
        $by = collect($r['methods'])->keyBy('kind');
        $this->assertSame(1500.0, $by['cash']['expected']);
        $this->assertSame(400.0, $by['mpesa']['expected']);
        $this->assertSame(150.0, $by['gift_voucher']['expected']);
        $this->assertSame(1500.0, $r['expected_cash']);
    }

    public function test_the_cash_must_be_counted_and_a_difference_needs_a_note(): void
    {
        $sh = $this->shifts()->open($this->cashier, $this->till, 0);
        $this->cashSale($sh->id, [1 => 1000]);
        try {
            $this->shifts()->close($this->cashier, $sh->id, [], null);
            $this->fail('closed without counting');
        } catch (BooksException $e) {
            $this->assertStringContainsString('Count the cash', $e->getMessage());
        }
        try {
            $this->shifts()->close($this->cashier, $sh->id, [['payment_method_id' => 1, 'amount' => 990]], null);
            $this->fail('closed a short count with no note');
        } catch (BooksException $e) {
            $this->assertStringContainsString('short by 10.00', $e->getMessage());
        }
        $z = $this->shifts()->close($this->cashier, $sh->id, [['payment_method_id' => 1, 'amount' => 990]], 'a coin was lost');
        $this->assertSame('Z', $z['kind']);
        $this->assertEquals(-10.0, $z['variance']);
    }

    public function test_a_small_gap_posts_a_journal_short_debits_over_short_and_over_credits_it(): void
    {
        $sh = $this->shifts()->open($this->cashier, $this->till, 0);
        $this->cashSale($sh->id, [1 => 1000]);
        $z = $this->shifts()->close($this->cashier, $sh->id, [['payment_method_id' => 1, 'amount' => 960]], 'short');   // 40 short: under the 100 limit
        $this->assertTrue($z['books']['posted']);
        $e = collect($this->posted[0]['entries']);
        $this->assertSame(40.0, (float) $e[0]['amount']);
        $this->assertSame([30, 'D'], [$e[0]['ledger_id'], $e[0]['side']], 'Cash over/short is debited when short');
        $this->assertSame([10, 'C'], [$e[1]['ledger_id'], $e[1]['side']], 'the till\'s cash ledger is credited');

        $sh2 = $this->shifts()->open($this->cashier, $this->till, 0);
        $this->cashSale($sh2->id, [1 => 500]);
        $this->shifts()->close($this->cashier, $sh2->id, [['payment_method_id' => 1, 'amount' => 520]], 'over');
        $o = collect($this->posted[1]['entries']);
        $this->assertSame([10, 'D'], [$o[0]['ledger_id'], $o[0]['side']]);
        $this->assertSame([30, 'C'], [$o[1]['ledger_id'], $o[1]['side']]);
    }

    public function test_a_balanced_shift_posts_nothing_and_a_missing_ledger_does_not_stop_the_close(): void
    {
        $sh = $this->shifts()->open($this->cashier, $this->till, 0);
        $this->cashSale($sh->id, [1 => 100]);
        $z = $this->shifts()->close($this->cashier, $sh->id, [['payment_method_id' => 1, 'amount' => 100]], null);
        $this->assertNull($z['books']);
        $this->assertSame([], $this->posted);

        DB::table('accounting_settings')->update(['cash_over_short_ledger_id' => null]);
        $sh2 = $this->shifts()->open($this->cashier, $this->till, 0);
        $this->cashSale($sh2->id, [1 => 100]);
        $z2 = $this->shifts()->close($this->cashier, $sh2->id, [['payment_method_id' => 1, 'amount' => 90]], 'short');
        $this->assertFalse($z2['books']['posted']);
        $this->assertStringContainsString('Cash Over / Short', $z2['books']['why']);
    }

    public function test_the_station_cash_ledger_takes_the_gap_instead_of_the_methods(): void
    {
        app(StationService::class)->save(['cash_ledger_id' => 11], $this->till);
        StationLedgers::forget();
        $sh = $this->shifts()->open($this->cashier, $this->till, 0);
        $this->cashSale($sh->id, [1 => 100]);
        $this->shifts()->close($this->cashier, $sh->id, [['payment_method_id' => 1, 'amount' => 90]], 'short');
        $this->assertSame(11, $this->posted[0]['entries'][1]['ledger_id']);
    }

    public function test_a_gap_over_the_branch_limit_needs_a_supervisors_pin_and_a_smaller_limit_can_be_set(): void
    {
        $sh = $this->shifts()->open($this->cashier, $this->till, 0);
        $this->cashSale($sh->id, [1 => 1000]);
        $count = [['payment_method_id' => 1, 'amount' => 800]];   // 200 short: over the 100 limit
        try {
            $this->shifts()->close($this->cashier, $sh->id, $count, 'short', null, $this->till);
            $this->fail('a large gap closed without a PIN');
        } catch (ApprovalRequired $e) {
            $this->assertSame('close_shift', $e->purpose);
            $this->assertStringContainsString('200.00', $e->getMessage());
        }
        $z = $this->shifts()->close($this->cashier, $sh->id, $count, 'short', $this->approval('close_shift'), $this->till);
        $this->assertEquals(-200.0, $z['variance']);
        $this->assertSame('close_shift', AccessLog::where('action', 'pos_approval_used')->first()->details['purpose']);

        app(StationService::class)->saveBranch(1, ['variance_limit' => 5]);
        $sh2 = $this->shifts()->open($this->cashier, $this->till, 0);
        $this->cashSale($sh2->id, [1 => 100]);
        $this->expectException(ApprovalRequired::class);
        $this->shifts()->close($this->cashier, $sh2->id, [['payment_method_id' => 1, 'amount' => 90]], 'short', null, $this->till);   // 10 short: over a limit of 5
    }

    public function test_someone_elses_shift_or_a_cashier_without_the_shift_permission_needs_a_pin_to_close(): void
    {
        $sh = $this->shifts()->open($this->cashier, $this->till, 0);
        $this->cashSale($sh->id, [1 => 100]);
        $count = [['payment_method_id' => 1, 'amount' => 100]];
        $this->grant($this->boss, ['pos.view', 'pos.shift', 'pos.supervise']);   // may close a shift, but this one is not theirs
        try {
            $this->shifts()->close($this->boss, $sh->id, $count, null, null, $this->till);
            $this->fail('closed another person\'s shift with no PIN');
        } catch (ApprovalRequired) {
        }
        $token = app(PinService::class)->approve($this->boss, $this->till, $this->boss->id, '482916', 'close_shift')['token'];   // a supervisor may approve themselves
        $this->assertSame('Z', $this->shifts()->close($this->boss, $sh->id, $count, null, $token, $this->till)['kind']);

        $sh2 = $this->shifts()->open($this->cashier, $this->till, 0);   // the cashier's own shift again, then the shift permission is taken away
        $this->grant($this->cashier, ['pos.view', 'pos.sell']);
        $this->expectException(ApprovalRequired::class);
        $this->shifts()->close($this->cashier, $sh2->id, [['payment_method_id' => 1, 'amount' => 0]], null, null, $this->till);
    }

    public function test_a_closed_shift_reopens_with_a_pin_and_a_reason_and_its_journal_is_cancelled(): void
    {
        $sh = $this->shifts()->open($this->cashier, $this->till, 0);
        $this->cashSale($sh->id, [1 => 1000]);
        $this->shifts()->close($this->cashier, $sh->id, [['payment_method_id' => 1, 'amount' => 950]], 'short');
        $this->assertCount(1, $this->posted);

        try {
            $this->shifts()->reopen($this->cashier, $sh->id, 'ab', null, $this->till);
            $this->fail('reopened with a two letter reason');
        } catch (BooksException $e) {
            $this->assertStringContainsString('why', $e->getMessage());
        }
        try {
            $this->shifts()->reopen($this->cashier, $sh->id, 'Counted wrong', null, $this->till);
            $this->fail('reopened with no PIN');
        } catch (ApprovalRequired $e) {
            $this->assertSame('reopen_shift', $e->purpose);
        }
        $x = $this->shifts()->reopen($this->cashier, $sh->id, 'Counted wrong', $this->approval('reopen_shift'), $this->till);
        $this->assertSame('X', $x['kind']);
        $this->assertCount(1, $this->unposted, 'the over/short journal came off');
        $log = AccessLog::where('action', 'pos_shift_reopened')->first();
        $this->assertSame('Counted wrong', $log->details['reason']);
        $this->assertEquals(-50.0, $log->details['variance'], 'the old Z report is kept in the log');

        $z = $this->shifts()->close($this->cashier, $sh->id, [['payment_method_id' => 1, 'amount' => 1000]], null);   // closed again: a fresh report
        $this->assertEquals(0.0, $z['variance']);
        $this->assertNull($z['books']);
    }

    public function test_a_shift_cannot_be_reopened_when_the_cashier_or_the_station_is_busy(): void
    {
        $sh = $this->shifts()->open($this->cashier, $this->till, 0);
        $this->shifts()->close($this->cashier, $sh->id, [['payment_method_id' => 1, 'amount' => 0]], null);
        $other = app(StationService::class)->save(['name' => 'Second till', 'code' => 'T2', 'location_id' => 1]);
        $this->shifts()->open($this->cashier, $other, 0);   // the cashier has another shift open
        $this->expectExceptionMessage('has another shift open');
        $this->shifts()->reopen($this->cashier, $sh->id, 'by mistake', $this->approval('reopen_shift'), $this->till);
    }

    // ── the doors of menus.till ──

    public function test_menus_till_opens_the_food_till_and_the_floor_but_not_recipes_or_new_qr_codes(): void
    {
        config(['daraja.consumer_key' => 'x', 'daraja.consumer_secret' => 'x', 'daraja.shortcode' => '1', 'daraja.passkey' => 'x', 'daraja.callback_url' => 'https://x.test/cb', 'daraja.env' => 'sandbox']);
        $perm = [];
        foreach (Route::getRoutes() as $r) {
            if (str_starts_with($r->uri(), 'api/admin/menus/')) {
                $perm[$r->methods()[0].' '.$r->uri()] = array_values(array_filter($r->gatherMiddleware(), fn ($m) => is_string($m) && str_starts_with($m, 'permission:')));
            }
        }
        foreach (['GET api/admin/menus/till', 'POST api/admin/menus/till/sell', 'POST api/admin/menus/till/tabs/{id}/settle', 'GET api/admin/menus/floor', 'POST api/admin/menus/floor/tables/{id}/{action}', 'POST api/admin/menus/orders/{id}/status'] as $door) {
            $this->assertNotEmpty($perm[$door] ?? [], $door);
            $this->assertTrue($perm[$door] === ['permission:menus.till,menus.manage'] || $perm[$door] === ['permission:menus.till,menus.view,menus.manage'], $door.' '.json_encode($perm[$door]));
        }
        foreach (['GET api/admin/menus/recipes', 'GET api/admin/menus/ingredients', 'PUT api/admin/menus/recipes', 'POST api/admin/menus/dishes'] as $door) {
            $this->assertNotContains('permission:menus.till,menus.manage', $perm[$door] ?? [], "{$door} must not open to menus.till");
            $this->assertStringNotContainsString('menus.till', implode(',', $perm[$door] ?? []), $door);
        }
    }

    public function test_an_open_shift_is_not_reopened_and_a_station_opened_since_blocks_it(): void
    {
        $sh = $this->shifts()->open($this->cashier, $this->till, 0);
        try {
            $this->shifts()->reopen($this->cashier, $sh->id, 'no need', $this->approval('reopen_shift'), $this->till);
            $this->fail('an open shift was reopened');
        } catch (BooksException $e) {
            $this->assertStringContainsString('not closed', $e->getMessage());
        }
        $this->shifts()->close($this->cashier, $sh->id, [['payment_method_id' => 1, 'amount' => 0]], null);
        $this->shifts()->open($this->boss, $this->till, 0);   // someone else opens the same station
        $this->expectExceptionMessage('opened by someone else');
        $this->shifts()->reopen($this->cashier, $sh->id, 'by mistake', $this->approval('reopen_shift'), $this->till);
    }

    public function test_a_supervisor_who_has_lost_the_permission_since_giving_the_pin_no_longer_counts(): void
    {
        $sh = $this->shifts()->open($this->cashier, $this->till, 0);
        $this->shifts()->close($this->cashier, $sh->id, [['payment_method_id' => 1, 'amount' => 0]], null);
        $token = $this->approval('reopen_shift');
        $this->grant($this->boss, ['pos.view']);   // no longer a supervisor
        $this->expectExceptionMessage('can not approve');
        $this->shifts()->reopen($this->cashier, $sh->id, 'by mistake', $token, $this->till);
    }
}
