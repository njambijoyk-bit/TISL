<?php

namespace Tests\Feature;

use App\Models\User;
use App\Services\Books\Engine\LedgerBalances;
use App\Services\Books\Engine\ReportEngine;
use App\Services\Books\Engine\Reports\DayBookReport;
use App\Services\Books\Engine\Scope;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * The day book on the engine (docs/BOOKS_REPORTS_PLAN.md, step 6.1): the same vouchers and totals as the old day book, plus the cost-centre
 * views (decision 12), identifiers, paging, and the cost centre or branch narrowing the entry lines (audit A1).
 */
class DayBookReportTest extends TestCase
{
    use Concerns\CreatesBooksLedgerWorld;
    use Concerns\RecordsGolden;
    use Concerns\StandsInForAccess;

    protected function setUp(): void
    {
        parent::setUp();
        $this->createBooksLedgerWorld();
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        LedgerBalances::forget();
        parent::tearDown();
    }

    private function run_(array $options = [], ?int $cc = null, ?int $loc = null, string $from = '2020-01-01', string $to = '2030-12-31'): array
    {
        return (new DayBookReport())->run(Scope::fromInput(['from' => $from, 'to' => $to, 'cost_centre_id' => $cc, 'location_id' => $loc]), $options);
    }

    private function numbers(array $d): array
    {
        return array_column($d['rows'], 'voucher_number');
    }

    public function test_it_gives_the_vouchers_and_totals_the_old_day_book_gave(): void
    {
        $old = $this->golden('day_book', 'all');
        $new = $this->run_();
        $this->assertSame(array_column($old['rows'], 'voucher_number'), $this->numbers($new), 'same vouchers, same order, memorandum left out');
        foreach ($old['rows'] as $i => $o) {
            $n = $new['rows'][$i];
            $this->assertSame($o['id'], $n['id']);
            $this->assertSame($o['date'], $n['date']);
            $this->assertSame($o['type'], $n['type']);
            $this->assertSame($o['party'], $n['party']);
            $this->assertSame($o['status'], $n['status']);
            $this->assertEquals($o['total'], $n['total'], "{$o['voucher_number']} total");
        }
        $this->assertEquals($old['total'], $new['total'], 'posted total');
        $this->assertNotContains('MEMO1', $this->numbers($new));
        $this->assertContains('V6', $this->numbers($new), 'a draft is listed');
        $this->assertEquals(100000 + 40000 + 130000 + 65000 + 5000 + 12000 + 7000 + 2000 + 5000 + 800 + 300, $new['total'], 'and never counted (V4 at today\'s rate)');
    }

    public function test_the_voucher_type_narrows_the_list_like_the_old_one(): void
    {
        $old = $this->golden('day_book', 'type2');
        $new = $this->run_(['type' => '2']);
        $this->assertSame(array_column($old['rows'], 'voucher_number'), $this->numbers($new));
        $this->assertSame(['V1'], $this->numbers($new));
        $this->assertSame('Sale to the customer', $new['rows'][0]['narration']);
    }

    public function test_the_period_keeps_whole_days_in_range(): void
    {
        $d = $this->run_([], null, null, '2026-02-15', '2026-03-01');
        $this->assertSame(['V2', 'V3'], $this->numbers($d));
    }

    public function test_a_cost_centre_narrows_the_lines_and_the_voucher_keeps_its_whole_amount(): void
    {
        $d = $this->run_([], 11);   // Admin: V2, V8 (one of its two debit lines), V11
        $this->assertSame(['V2', 'V8', 'V11'], $this->numbers($d));
        $v8 = collect($d['rows'])->firstWhere('voucher_number', 'V8');
        $this->assertEquals(7000, $v8['total'], 'each voucher once, with its full amount');
        $this->assertEquals(40000 + 7000 + 800, $d['total']);
    }

    public function test_the_cost_centre_view_shows_each_allocation_and_never_counts_a_voucher_twice(): void
    {
        $general = $this->run_();
        $cc = $this->run_(['view' => 'cost_centre']);
        $v8 = array_values(array_filter($cc['rows'], fn ($r) => $r['voucher_number'] === 'V8'));
        $this->assertCount(2, $v8, 'one voucher number, two rows');
        $this->assertEqualsCanonicalizing([3000, 4000], array_column($v8, 'total'));
        $this->assertEqualsCanonicalizing(['Head office', 'Admin'], array_column($v8, 'cost_centre'));
        $this->assertEquals($general['total'], $cc['total'], 'the two views agree on the posted total');
        $v7 = collect($cc['rows'])->firstWhere('voucher_number', 'V7');
        $this->assertSame('Not allocated', $v7['cost_centre']);
    }

    public function test_the_cost_centre_view_under_a_filter_shows_only_that_centre(): void
    {
        $cc = $this->run_(['view' => 'cost_centre'], 11);
        $this->assertSame(['V2', 'V8', 'V11'], $this->numbers($cc));
        $this->assertEquals(40000 + 4000 + 800, $cc['total']);
    }

    public function test_a_voucher_over_several_cost_centres_opens_to_its_split(): void
    {
        $rows = collect($this->run_()['rows']);
        $this->assertSame([['cost_centre_id' => 10, 'cost_centre' => 'Head office', 'amount' => 3000.0], ['cost_centre_id' => 11, 'cost_centre' => 'Admin', 'amount' => 4000.0]], $rows->firstWhere('voucher_number', 'V8')['split']);
        $this->assertSame([], $rows->firstWhere('voucher_number', 'V1')['split'], 'a voucher on one cost centre has none');
    }

    public function test_cheque_and_payment_references_are_shown(): void
    {
        $id = fn (string $no) => DB::table('vouchers')->where('voucher_number', $no)->value('id');
        DB::table('voucher_instruments')->insert(['voucher_id' => $id('V2'), 'ledger_id' => 1, 'direction' => 'out', 'type' => 'cheque', 'number' => '000123', 'instrument_date' => '2026-02-20', 'amount' => 40000, 'status' => 'cleared']);
        DB::table('voucher_tenders')->insert(['voucher_id' => $id('V9'), 'amount' => 2000, 'reference' => 'QWE123XYZ']);
        $rows = collect($this->run_()['rows']);
        $this->assertSame(['Cheque 000123 (2026-02-20)'], $rows->firstWhere('voucher_number', 'V2')['identifiers']);
        $this->assertSame(['Payment ref QWE123XYZ'], $rows->firstWhere('voucher_number', 'V9')['identifiers']);
    }

    public function test_a_branch_limited_person_sees_only_their_branches_and_the_banner_says_so(): void
    {
        $this->limitedTo = [2];
        $d = $this->run_();
        $this->assertSame(['V2', 'V7', 'V11'], $this->numbers($d), 'branch 2 and the vouchers with no branch');
        $r = app(ReportEngine::class)->run('day-book', ['from' => '2020-01-01', 'to' => '2030-12-31'], $this->person());
        $this->assertTrue($r['banners']['branch_limited']);
    }

    private function person(): User
    {
        $u = new User();
        $u->id = 4242;
        $this->grant($u, ['books.view']);

        return $u;
    }

    private function addVouchers(int $n): void
    {
        $now = now();
        for ($i = 0; $i < $n; $i++) {
            DB::table('vouchers')->insert(['voucher_type_id' => 1, 'voucher_number' => sprintf('X%03d', $i), 'date' => '2026-11-' . sprintf('%02d', 1 + $i % 28), 'status' => 'posted', 'currency_id' => 1, 'total_amount' => 10, 'base_total' => 10, 'created_at' => $now, 'updated_at' => $now]);
        }
    }

    public function test_it_comes_a_page_at_a_time_and_the_total_covers_every_page(): void
    {
        $this->addVouchers(210);
        $first = $this->run_();
        $this->assertSame(DayBookReport::PER_PAGE, count($first['rows']));
        $all = $first['paging']['total'];
        $this->assertSame((int) ceil($all / DayBookReport::PER_PAGE), $first['paging']['pages']);
        $second = $this->run_(['page' => 2]);
        $this->assertSame($all - DayBookReport::PER_PAGE, count($second['rows']));
        $this->assertSame([], array_intersect($this->numbers($first), $this->numbers($second)), 'no voucher on two pages');
        $this->assertEquals($first['total'], $second['total'], 'the posted total is of everything, not of the page');
        $this->assertEquals(100000 + 40000 + 130000 + 65000 + 5000 + 12000 + 7000 + 2000 + 5000 + 800 + 300 + 2100, $first['total']);
        $this->assertSame($second['rows'], $this->run_(['page' => 99])['rows'], 'a page past the end is the last page');
    }

    public function test_a_file_holds_every_row_not_a_page(): void
    {
        $this->addVouchers(210);
        [$table] = app(ReportEngine::class)->exportTable('day-book', ['from' => '2020-01-01', 'to' => '2030-12-31'], $this->person());
        $this->assertCount(210 + 11 + 1, $table['rows'], '210 added, 11 posted in the world, and the draft');
        $this->assertSame('Posted total', $table['totals']['narration']);
    }

    public function test_the_engine_lists_it_with_its_choices(): void
    {
        $c = collect(app(ReportEngine::class)->catalogue($this->person()))->firstWhere('key', 'day-book');
        $this->assertNotNull($c);
        $this->assertSame(['general', 'cost_centre'], array_keys($c['options'][0]['choices']));
        $this->assertContains('Journal', $c['options'][1]['choices']);
        $this->assertNotContains('Memorandum', $c['options'][1]['choices']);
    }
}
