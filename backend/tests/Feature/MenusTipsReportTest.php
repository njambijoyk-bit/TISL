<?php

namespace Tests\Feature;

use App\Models\Menus\Tip;
use App\Models\Menus\TipEvent;
use App\Services\Menus\TipsReport;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

/** Menus tips, build step 6.8 (script 212): the tips report. */
class MenusTipsReportTest extends TestCase
{
    use Concerns\CreatesCounterWorld;

    protected function setUp(): void
    {
        parent::setUp();
        $this->createCounterWorld();
        Schema::create('users', function ($t) { $t->id(); $t->string('name')->nullable(); $t->softDeletes(); });
        DB::table('users')->insert([['id' => 3, 'name' => 'Cashier Jo'], ['id' => 4, 'name' => 'Waiter Wanjiku'], ['id' => 5, 'name' => 'Manager Mo'], ['id' => 6, 'name' => 'Waiter Otieno']]);
        $this->runSqlScripts('212_menus_tips.sql');
        Carbon::setTestNow('2026-03-10 15:00:00');
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    private function tip(string $day, float $amount, array $o = []): Tip
    {
        static $n = 0;
        $t = Tip::create($o + ['order_id' => ++$n, 'amount' => $amount, 'ledger_id' => 80, 'location_id' => 1, 'served_by' => 4, 'received_by' => 3]);
        $t->forceFill(['created_at' => "{$day} 12:00:00"])->save();

        return $t;
    }

    private function issued(Tip $t, string $day, int $to, string $name = null): void
    {
        $t->update(['status' => 'issued', 'issued_at' => "{$day} 18:00:00", 'issued_by' => 5, 'issued_to' => $name ? null : $to, 'issued_to_name' => $name, 'issue_voucher_id' => 700 + $t->id]);
        TipEvent::create(['tip_id' => $t->id, 'kind' => 'issued', 'amount' => $t->amount, 'voucher_id' => 700 + $t->id, 'to_user_id' => $name ? null : $to, 'to_name' => $name, 'done_by' => 5, 'done_at' => "{$day} 18:00:00"]);
    }

    public function test_the_report_adds_up_what_was_taken_handed_over_and_is_waiting(): void
    {
        $a = $this->tip('2026-03-08', 200);
        $b = $this->tip('2026-03-08', 100, ['served_by' => 6]);
        $c = $this->tip('2026-03-09', 50);
        $this->tip('2026-03-05', 70);   // still waiting, taken before the period
        $this->tip('2026-02-01', 999, ['location_id' => 2]);   // far outside
        $this->issued($a, '2026-03-09', 4);
        $this->issued($b, '2026-03-10', 0, 'Kitchen team');

        $r = app(TipsReport::class)->build('2026-03-08', '2026-03-10');
        $this->assertTrue($r['ready']);
        $this->assertSame([350.0, 3, 300.0, 2, 1119.0, 3, 0.0, 0], [$r['totals']['taken'], $r['totals']['tips'], $r['totals']['handed_over'], $r['totals']['handed_over_tips'], $r['totals']['waiting'], $r['totals']['waiting_tips'], $r['totals']['taken_back'], $r['totals']['taken_back_times']]);
        $this->assertSame((int) Carbon::parse('2026-02-01')->diffInDays(Carbon::parse('2026-03-10')), $r['totals']['oldest_waiting_days'], 'the oldest tip still waiting, in days');
        $this->assertSame([['2026-03-08', 300.0, 2, 0.0], ['2026-03-09', 50.0, 1, 200.0], ['2026-03-10', 0.0, 0, 100.0]], array_map(fn ($d) => [$d['date'], $d['taken'], $d['tips'], $d['handed_over']], $r['by_day']), 'a tip is on the day it was taken, a hand-over on the day it was made');
        $this->assertSame([['Waiter Wanjiku', 2, 250.0], ['Waiter Otieno', 1, 100.0]], array_map(fn ($x) => [$x['name'], $x['tips'], $x['amount']], $r['by_server']));
        $this->assertSame([['Waiter Wanjiku', 1, 200.0], ['Kitchen team', 1, 100.0]], array_map(fn ($x) => [$x['name'], $x['tips'], $x['amount']], $r['by_recipient']));
        $this->assertSame(['issued', 'issued'], array_column($r['history'], 'kind'));
    }

    public function test_a_tip_taken_back_is_counted_and_in_the_history_and_handed_over_again_it_counts_once(): void
    {
        $a = $this->tip('2026-03-09', 200);
        $this->issued($a, '2026-03-09', 4);
        TipEvent::create(['tip_id' => $a->id, 'kind' => 'reversed', 'amount' => 200, 'voucher_id' => 700 + $a->id, 'narration' => 'Wrong person', 'done_by' => 5, 'done_at' => '2026-03-09 19:00:00']);
        $a->update(['status' => 'pending', 'issued_at' => null, 'issued_to' => null]);

        $r = app(TipsReport::class)->build('2026-03-08', '2026-03-10');
        $this->assertSame([0.0, 200.0, 200.0, 1], [$r['totals']['handed_over'], $r['totals']['waiting'], $r['totals']['taken_back'], $r['totals']['taken_back_times']]);
        $this->assertSame(['reversed', 'issued'], array_column($r['history'], 'kind'), 'newest first');
        $this->assertSame(['Wrong person', 'Manager Mo'], [$r['history'][0]['note'], $r['history'][0]['by']]);

        $this->issued($a, '2026-03-10', 3);
        $again = app(TipsReport::class)->build('2026-03-08', '2026-03-10');
        $this->assertSame([200.0, 1, 0.0], [$again['totals']['handed_over'], $again['totals']['handed_over_tips'], $again['totals']['waiting']], 'counted once, as handed over');
    }

    public function test_a_branch_can_be_chosen_and_a_tip_without_a_server_is_still_counted(): void
    {
        $this->tip('2026-03-09', 100);
        $this->tip('2026-03-09', 40, ['location_id' => 2, 'served_by' => null]);

        $all = app(TipsReport::class)->build('2026-03-01', '2026-03-10');
        $this->assertSame([140.0, 'Not recorded'], [$all['totals']['taken'], $all['by_server'][1]['name']]);
        $one = app(TipsReport::class)->build('2026-03-01', '2026-03-10', 2);
        $this->assertSame([40.0, 40.0], [$one['totals']['taken'], $one['totals']['waiting']]);
    }

    public function test_the_report_is_not_ready_before_script_212(): void
    {
        Schema::drop('menus_tip_events');
        Schema::drop('menus_tips');
        $this->assertSame(['ready' => false, 'from' => '2026-03-01', 'to' => '2026-03-10'], app(TipsReport::class)->build('2026-03-01', '2026-03-10'));
    }
}
