<?php

namespace Tests\Feature;

use App\Models\Books\GiftVoucher;
use App\Models\Books\Voucher;
use App\Models\Currency;
use App\Models\Pos\Station;
use App\Services\Books\GiftVoucherService;
use App\Services\Books\PromoUsageService;
use App\Services\Books\RewardService;
use App\Services\Books\VoucherService;
use App\Services\CurrencyConversionService;
use App\Services\Pos\HelpService;
use App\Services\Pos\ReturnRewardsService;
use App\Services\Pos\StationService;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Route;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

/** Point of sale: what a return undoes and what cancelling it gives back (once), the help button's tries, and the doors: every till route is guarded and no inner limit shares the screen's counter. */
class PosReturnsAndDoorsTest extends TestCase
{
    use Concerns\CreatesPosWorld;

    private array $calls = [];

    protected function setUp(): void
    {
        parent::setUp();
        $this->createPosWorld();
        config(['daraja.consumer_key' => 'x', 'daraja.consumer_secret' => 'x', 'daraja.shortcode' => '1', 'daraja.passkey' => 'x', 'daraja.callback_url' => 'https://x.test/cb', 'daraja.env' => 'sandbox']);
        Schema::create('gift_vouchers', function ($t) { $t->id(); $t->string('code')->nullable(); });
        DB::table('gift_vouchers')->insert(['id' => 5, 'code' => 'GV-1']);
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    private function sale(array $meta = []): Voucher
    {
        return Voucher::find(DB::table('vouchers')->insertGetId(['voucher_type_id' => 1, 'voucher_number' => 'CS-7', 'status' => 'posted', 'total_amount' => 1000, 'location_id' => 1, 'meta' => json_encode($meta)]));
    }

    private function note(array $meta = []): Voucher
    {
        return Voucher::find(DB::table('vouchers')->insertGetId(['voucher_type_id' => 3, 'voucher_number' => 'CN-1', 'status' => 'posted', 'total_amount' => 1000, 'location_id' => 1, 'meta' => json_encode($meta + ['pos_refund' => ['ledger_id' => 10, 'amount' => 1000]])]));
    }

    /** The service with the books' reward, promo and gift services stood in for: they answer as given and every call is written down. */
    private function service(array $gift = [], ?array $points = null, array $promo = []): ReturnRewardsService
    {
        $rewards = $this->createMock(RewardService::class);
        $rewards->method('onCancel')->willReturnCallback(function (Voucher $v, string $why) use ($points) { $this->calls[] = ['onCancel', $v->id, $why]; return $points; });
        $rewards->method('onReinstate')->willReturnCallback(function (Voucher $v, array $snap) { $this->calls[] = ['onReinstate', $v->id, $snap['points']]; return ['points' => $snap['points'], 'journal_id' => 77]; });
        $promos = $this->createMock(PromoUsageService::class);
        $promos->method('reverse')->willReturnCallback(function (Voucher $v) use ($promo) { $this->calls[] = ['promoReverse', $v->id]; return $promo; });
        $promos->method('reinstate')->willReturnCallback(function (array $ids) { $this->calls[] = ['promoReinstate', $ids]; return count($ids); });
        $gifts = $this->createMock(GiftVoucherService::class);
        $gifts->method('restoreFor')->willReturnCallback(function (Voucher $v) use ($gift) { $this->calls[] = ['giftRestore', $v->id]; return $gift; });
        $gifts->method('liabilityLedger')->willReturn(99);
        $gifts->method('redeem')->willReturnCallback(function ($gv, float $amount, Voucher $sale, $by, ?float $base) { $this->calls[] = ['giftRedeem', $gv->id, $amount, $base]; });
        $money = $this->createMock(CurrencyConversionService::class);
        $money->method('getBaseCurrency')->willReturn(Currency::find(1));

        return new ReturnRewardsService($rewards, $promos, $gifts, app(VoucherService::class), $money);
    }

    // ── what a return undoes, and cancelling it gives back once ──

    public function test_a_return_takes_back_the_points_the_promo_use_and_the_gift_voucher_and_keeps_a_record(): void
    {
        $source = $this->sale();
        $note = $this->note();
        $svc = $this->service([['gift_voucher_id' => 5, 'amount' => 150.0, 'base' => 150.0]], ['points' => 12, 'value' => 12.0, 'journal_id' => 3, 'meta' => ['rewarded_at' => 'x']], [41]);
        $out = $svc->reverse($note, $source, $this->cashier, 10);

        $this->assertSame(150.0, $out['gift_base']);
        $this->assertSame([['onCancel', $source->id, 'returned'], ['promoReverse', $source->id], ['giftRestore', $source->id]], $this->calls);
        $rec = $note->fresh()->meta['pos_reversal'];
        $this->assertSame($source->id, $rec['source_id']);
        $this->assertSame(12, $rec['points']['points']);
        $this->assertSame([41], $rec['promo']);
        // the part paid by gift voucher is not paid out in cash: the till's cash ledger gets it back from the gift liability
        $j = $this->posted[0]['entries'];
        $this->assertSame([[10, 'D', 150.0], [99, 'C', 150.0]], [[$j[0]['ledger_id'], $j[0]['side'], (float) $j[0]['amount']], [$j[1]['ledger_id'], $j[1]['side'], (float) $j[1]['amount']]]);
    }

    public function test_a_sale_with_no_points_no_promo_and_no_gift_voucher_writes_no_journal(): void
    {
        $this->service()->reverse($note = $this->note(), $this->sale(), $this->cashier, 10);
        $this->assertSame([], $this->posted);
        $this->assertEquals(0.0, $note->fresh()->meta['pos_reversal']['gift_base']);
    }

    public function test_cancelling_the_return_gives_everything_back_once_and_reverses_the_gift_journal(): void
    {
        $source = $this->sale();
        $note = $this->note();
        $svc = $this->service([['gift_voucher_id' => 5, 'amount' => 150.0, 'base' => 150.0]], ['points' => 12, 'value' => 12.0, 'journal_id' => 3, 'meta' => ['rewarded_at' => 'x']], [41]);
        $svc->reverse($note, $source, $this->cashier, 10);
        $this->calls = [];
        $this->posted = [];

        $svc->restore($note->fresh(), $this->cashier);
        $this->assertSame([['giftRedeem', 5, 150.0, 150.0], ['promoReinstate', [41]], ['onReinstate', $source->id, 12]], $this->calls);
        $back = $this->posted[0]['entries'];
        $this->assertSame([[99, 'D'], [10, 'C']], [[$back[0]['ledger_id'], $back[0]['side']], [$back[1]['ledger_id'], $back[1]['side']]], 'the journal that kept the gift part out of the cash refund is itself reversed');
        $this->assertNotEmpty($note->fresh()->meta['pos_reversal']['restored_at']);

        $this->calls = [];
        $svc->restore($note->fresh(), $this->cashier);   // a second cancel changes nothing
        $this->assertSame([], $this->calls);
        $this->assertCount(1, $this->posted);
    }

    public function test_nothing_is_given_back_for_a_sale_that_is_no_longer_live_or_a_note_that_is_not_a_pos_return(): void
    {
        $source = $this->sale();
        $note = $this->note();
        $svc = $this->service([], ['points' => 5, 'value' => 5.0, 'journal_id' => null, 'meta' => ['rewarded_at' => 'x']]);
        $svc->reverse($note, $source, $this->cashier, 10);
        $source->update(['status' => 'cancelled']);
        $this->calls = [];
        $svc->restore($note->fresh(), $this->cashier);
        $this->assertSame([], $this->calls, 'the sale is cancelled: its rewards were already undone');
        $this->assertSame('sale is not live', $note->fresh()->meta['pos_reversal']['skipped']);

        $plain = $this->note();   // a credit note made in Books, not at the till
        $svc->restore($plain, $this->cashier);
        $this->assertSame([], $this->calls);
    }

    // ── help ──

    public function test_the_help_button_counts_tries_nudges_one_request_and_a_clear_gives_the_tries_back(): void
    {
        Cache::flush();
        $help = app(HelpService::class);
        $self = app(StationService::class)->save(['name' => 'Self 1', 'code' => 'S1', 'location_id' => 1, 'kind' => 'self_checkout']);
        $help->request($self);
        $s = $help->request($self);
        $this->assertSame([true, 2, 10], [$s['open'], $s['tries'], $s['max']]);
        $this->assertSame(1, DB::table('pos_help_requests')->count(), 'one open request, nudged');
        $this->assertSame(2, (int) DB::table('pos_help_requests')->value('tries'));

        $id = (int) DB::table('pos_help_requests')->value('id');
        $this->grant($this->cashier, ['pos.view']);
        $this->assertTrue($help->done($this->cashier, $id));
        $this->assertFalse($help->done($this->cashier, $id), 'already done');
        $this->assertSame(0, $help->status($self)['tries'], 'the customer starts again with every try');

        for ($i = 0; $i < 10; $i++) {
            $help->request($self);
        }
        $this->expectExceptionMessage('10 times');
        $help->request($self);
    }

    // ── the doors ──

    public function test_every_till_route_is_guarded_by_a_pos_permission_and_the_modules_licence(): void
    {
        $open = [];
        foreach (Route::getRoutes() as $r) {
            if (! str_starts_with($r->uri(), 'api/admin/pos')) {
                continue;
            }
            $mw = $r->gatherMiddleware();
            $perm = array_filter($mw, fn ($m) => is_string($m) && str_starts_with($m, 'permission:pos.'));
            if (! $perm || ! in_array('module:extras', $mw, true)) {
                $open[] = $r->methods()[0].' '.$r->uri();
            }
        }
        $this->assertSame([], $open, 'a till route without a pos permission or the Extras licence');
    }

    public function test_an_inner_limit_on_a_self_checkout_or_kiosk_screen_has_its_own_counter(): void
    {
        $shared = [];
        foreach (Route::getRoutes() as $r) {
            if (! str_starts_with($r->uri(), 'api/pos/self/') && ! str_starts_with($r->uri(), 'api/kiosk/')) {
                continue;
            }
            $limits = array_values(array_filter($r->gatherMiddleware(), fn ($m) => is_string($m) && str_starts_with($m, 'throttle:')));
            foreach (array_slice($limits, 1) as $l) {   // the first is the screen's own limit; any other must name a counter (a third part), or it adds up with the screen's
                if (count(explode(',', $l)) < 3) {
                    $shared[] = $r->methods()[0].' '.$r->uri().' '.$l;
                }
            }
        }
        $this->assertSame([], $shared);
    }
}
