<?php

namespace Tests\Feature;

use App\Models\Memberships\Plan;
use App\Services\Books\BooksException;
use App\Services\Memberships\MembershipReports;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/** Memberships step 7: the numbers. "Now" is Wednesday 14 Oct 2026. */
class MembershipsReportsTest extends TestCase
{
    use Concerns\CreatesMembershipWorld;
    use Concerns\StandsInForAccess;

    private Plan $monthly;
    private Plan $yearly;

    protected function setUp(): void
    {
        parent::setUp();
        $this->createMembershipWorld();
        $this->standInAccess();
        $this->at('2026-10-14 12:00');
        $this->monthly = $this->plan(['name' => 'Monthly', 'price' => 3000]);
        $this->yearly = $this->plan(['name' => 'Yearly', 'price' => 36525, 'period_unit' => 'year']);
        foreach (['A', 'B', 'C', 'D', '=cmd()'] as $n) {
            $this->person($n);
        }
        DB::table('memberships')->insert([
            ['number' => 'MB-1', 'plan_id' => $this->monthly->id, 'member_user_id' => 1, 'status' => 'active', 'billing' => 'invoice', 'started_on' => '2026-10-01', 'paid_until' => '2026-11-01', 'cancel_at_end' => 1],
            ['number' => 'MB-2', 'plan_id' => $this->yearly->id, 'member_user_id' => 2, 'status' => 'active', 'billing' => 'invoice', 'started_on' => '2026-01-01', 'paid_until' => '2027-01-01', 'cancel_at_end' => 0],
            ['number' => 'MB-3', 'plan_id' => $this->monthly->id, 'member_user_id' => 3, 'status' => 'past_due', 'billing' => 'invoice', 'started_on' => '2026-08-01', 'paid_until' => '2026-10-10', 'cancel_at_end' => 0],
            ['number' => 'MB-4', 'plan_id' => $this->monthly->id, 'member_user_id' => 4, 'status' => 'cancelled', 'billing' => 'invoice', 'started_on' => '2026-05-01', 'paid_until' => '2026-10-05', 'cancel_at_end' => 0],
            ['number' => 'MB-5', 'plan_id' => $this->monthly->id, 'member_user_id' => 5, 'status' => 'trial', 'billing' => 'none', 'started_on' => '2026-10-10', 'paid_until' => '2026-10-20', 'cancel_at_end' => 0],
        ]);
        DB::table('membership_periods')->insert([
            ['membership_id' => 3, 'label' => 'x', 'plan_id' => 1, 'amount' => 3480, 'paid_amount' => 1000, 'status' => 'open', 'invoiced_at' => '2026-10-03 10:00', 'paid_at' => null, 'updated_at' => '2026-10-03 10:00'],
            ['membership_id' => 1, 'label' => 'x', 'plan_id' => 1, 'amount' => 3480, 'paid_amount' => 3480, 'status' => 'paid', 'invoiced_at' => '2026-10-01 10:00', 'paid_at' => '2026-10-01 11:00', 'updated_at' => '2026-10-01 11:00'],
            ['membership_id' => 4, 'label' => 'x', 'plan_id' => 1, 'amount' => 3480, 'paid_amount' => 3480, 'status' => 'refunded', 'invoiced_at' => '2026-05-01 10:00', 'paid_at' => '2026-05-01 11:00', 'updated_at' => '2026-10-05 09:00'],
            ['membership_id' => 2, 'label' => 'x', 'plan_id' => 2, 'amount' => 999, 'paid_amount' => 0, 'status' => 'void', 'invoiced_at' => '2026-10-02 10:00', 'paid_at' => null, 'updated_at' => '2026-10-02 10:00'],
        ]);
        DB::table('membership_events')->insert([['membership_id' => 4, 'type' => 'cancelled', 'created_at' => '2026-10-05 09:00'], ['membership_id' => 4, 'type' => 'refunded', 'created_at' => '2026-10-05 09:01'], ['membership_id' => 3, 'type' => 'past_due', 'created_at' => '2026-10-10 09:00'],
            ['membership_id' => 1, 'type' => 'lapsed', 'created_at' => '2026-07-10 09:00']]);
    }

    private function r(): MembershipReports
    {
        return app(MembershipReports::class);
    }

    public function test_members_now_and_the_money_that_recurs(): void
    {
        $s = $this->r()->summary();
        $this->assertSame('2026-09-15', $s['from']);
        $this->assertSame('2026-10-14', $s['to']);
        $this->assertSame(4, $s['now']['members']);   // active, active, past due, trial
        $this->assertEqualsWithDelta(3000 * 2 + 3043.75, $s['now']['mrr'], 0.001);   // the given (unbilled) member brings nothing
        $this->assertEqualsWithDelta((3000 * 2 + 3043.75) / 3, $s['now']['arpm'], 0.01);
        $this->assertEquals(2480, $s['now']['owing']);
        $byPlan = collect($s['now']['by_plan'])->keyBy('plan');
        $this->assertSame(3, $byPlan['Monthly']['members']);
        $this->assertSame(1, $byPlan['Monthly']['late']);
        $this->assertSame(1, $byPlan['Monthly']['on_trial']);
        $this->assertSame(1, $byPlan['Monthly']['given']);
        $this->assertEquals(6000, $byPlan['Monthly']['mrr']);
        $this->assertSame('Monthly', $s['now']['by_plan'][0]['plan']);   // most members first
        $this->assertEqualsCanonicalizing(['active' => 2, 'trial' => 1, 'past_due' => 1], collect($s['now']['by_status'])->pluck('count', 'status')->all());
    }

    public function test_joined_left_churn_and_money_in_the_range(): void
    {
        $s = $this->r()->summary();
        $this->assertSame(2, $s['range']['new']);   // MB-1 and MB-5 started in the 30 days
        $this->assertSame(1, $s['range']['left']);   // MB-4, counted once though it has two events
        $this->assertSame(33.3, $s['range']['churn_pct']);   // 1 of the 3 there at the start
        $this->assertEquals(6960, $s['range']['invoiced']);   // the void one does not count
        $this->assertEquals(3480, $s['range']['collected']);
        $this->assertEquals(3480, $s['range']['refunded']);
        $narrow = $this->r()->summary('2026-10-06', '2026-10-14');
        $this->assertSame(1, $narrow['range']['new']);
        $this->assertSame(0, $narrow['range']['left']);
        $this->assertEquals(0, $narrow['range']['collected']);
        $this->assertSame(['May 2026' => [1, 0], 'Jul 2026' => [0, 1], 'Aug 2026' => [1, 0], 'Oct 2026' => [2, 1]], collect($s['trend'])->filter(fn ($t) => $t['joined'] || $t['left'])->mapWithKeys(fn ($t) => [$t['month'] => [$t['joined'], $t['left']]])->all());
        $this->assertSame('May 2026', $s['trend'][0]['month']);
        $this->assertCount(6, $s['trend']);
        $one = $this->r()->summary(null, null, $this->yearly->id);
        $this->assertSame(1, $one['now']['members']);
        $this->assertSame(0, $one['range']['new']);
        $this->assertSame(0.0, $one['range']['churn_pct']);
        $none = $this->r()->summary(null, null, $this->plan(['name' => 'Empty'])->id);
        $this->assertNull($none['range']['churn_pct']);   // nobody there at the start: no share to give
        \Illuminate\Support\Facades\Schema::drop('membership_checkins');
        \Illuminate\Support\Facades\Schema::drop('membership_credits');
        $gone = $this->r()->summary();
        $this->assertNull($gone['checkins']);
        $this->assertNull($gone['credits']);
        $this->assertEquals(0, $one['range']['invoiced']);
    }

    public function test_the_late_list_and_the_ending_list(): void
    {
        $s = $this->r()->summary();
        $this->assertSame([['MB-3', 'C', 'Payment late', 2480.0]], array_map(fn ($r) => [$r['number'], $r['member'], $r['status_label'], $r['owing']], $s['late']));
        $this->assertSame([['MB-5', 'Given for a time', '2026-10-19']], array_map(fn ($r) => [$r['number'], $r['why'], $r['last_day']], $s['ending']));   // MB-1 ends 1 Nov: more than 14 days off
        $this->at('2026-10-20 12:00');
        $this->assertSame(['MB-5', 'MB-1'], array_column($this->r()->summary()['ending'], 'number'));
        $this->assertSame('Cancelled', $this->r()->summary()['ending'][1]['why']);
        DB::table('membership_plans')->where('id', $this->yearly->id)->update(['auto_renew' => false]);
        DB::table('memberships')->where('id', 2)->update(['paid_until' => '2026-10-25']);
        $this->assertSame('Plan does not renew', collect($this->r()->summary()['ending'])->firstWhere('number', 'MB-2')['why']);
    }

    public function test_check_ins_and_credits_in_the_range(): void
    {
        DB::table('membership_checkins')->insert([['user_id' => 1, 'location_id' => 1, 'result' => 'ok', 'method' => 'card', 'created_at' => '2026-10-13 08:00'], ['user_id' => 1, 'location_id' => 2, 'result' => 'ok', 'method' => 'card', 'created_at' => '2026-10-13 18:00'],
            ['user_id' => 2, 'location_id' => 1, 'result' => 'ok', 'method' => 'card', 'created_at' => '2026-10-12 08:00'], ['user_id' => 4, 'location_id' => 1, 'result' => 'denied', 'method' => 'card', 'created_at' => '2026-10-12 08:00'],
            ['user_id' => 2, 'location_id' => 1, 'result' => 'ok', 'method' => 'card', 'created_at' => '2026-08-01 08:00']]);
        DB::table('membership_credits')->insert([['user_id' => 1, 'kind' => 'grant', 'delta' => 4, 'created_at' => '2026-10-01 00:00'], ['user_id' => 1, 'kind' => 'adjust', 'delta' => 2, 'created_at' => '2026-10-02 00:00'], ['user_id' => 1, 'kind' => 'adjust', 'delta' => -1, 'created_at' => '2026-10-02 00:00'],
            ['user_id' => 1, 'kind' => 'spend', 'delta' => -3, 'created_at' => '2026-10-03 00:00'], ['user_id' => 1, 'kind' => 'refund', 'delta' => 1, 'created_at' => '2026-10-04 00:00'], ['user_id' => 1, 'kind' => 'expire', 'delta' => -2, 'created_at' => '2026-10-05 00:00'],
            ['user_id' => 1, 'kind' => 'grant', 'delta' => 9, 'created_at' => '2026-01-01 00:00']]);
        $s = $this->r()->summary();
        $this->assertSame(['visits' => 3, 'people' => 2, 'turned_away' => 1, 'by_branch' => [['branch' => 'Westlands', 'visits' => 2], ['branch' => 'Karen', 'visits' => 1]]], $s['checkins']);
        $this->assertSame(['granted' => 6, 'spent' => 3, 'given_back' => 1, 'expired' => 2], $s['credits']);
    }

    public function test_the_range_is_checked(): void
    {
        foreach ([['2026-10-15', '2026-10-14', 'on or before'], ['2024-01-01', '2026-10-14', 'two years'], ['nonsense', null, 'valid dates']] as [$f, $t, $msg]) {
            try {
                $this->r()->summary($f, $t);
                $this->fail($msg);
            } catch (BooksException $e) {
                $this->assertStringContainsString($msg, $e->getMessage());
            }
        }
        $this->assertSame('2024-10-14', $this->r()->summary('2024-10-14', '2026-10-14')['from']);   // two years exactly is fine
        $this->assertSame('2026-10-14', $this->r()->summary('2026-10-14', '2026-10-14')['from']);
    }

    public function test_a_month_of_each_kind_of_plan(): void
    {
        $m = fn ($u, $n, $price) => $this->r()->monthly(new Plan(['period_unit' => $u, 'period_count' => $n, 'price' => $price]));
        $this->assertSame(3000.0, $m('month', 1, 3000));
        $this->assertSame(1000.0, $m('month', 3, 3000));
        $this->assertSame(3043.75, $m('year', 1, 36525));
        $this->assertSame(1521.88, $m('year', 2, 36525));
        $this->assertSame(4348.21, $m('week', 1, 1000));
        $this->assertSame(2174.11, $m('week', 2, 1000));
        $this->assertSame(3043.75, $m('day', 1, 100));
        $this->assertSame(1014.58, $m('day', 3, 100));
    }

    public function test_the_members_spreadsheet_quotes_formulas(): void
    {
        $rows = $this->r()->csv();
        $this->assertSame(['Number', 'Member', 'Email', 'Plan', 'Status', 'Billing', 'Started', 'Paid up to', 'Ends at period end', 'Owing'], $rows[0]);
        $this->assertCount(6, $rows);
        $this->assertSame(['MB-1', 'A', 'a@example.com', 'Monthly', 'Active', 'invoice', '2026-10-01', '2026-10-31', 'yes', 0.0], $rows[1]);
        $this->assertEquals(2480, $rows[3][9]);
        $this->assertCount(5, $this->r()->csv($this->monthly->id));   // the heading and four memberships
        $this->assertCount(2, $this->r()->csv(null, 'past_due'));
        $u = $this->person('Viewer');
        Sanctum::actingAs($u, ['*']);
        $this->get('/api/admin/memberships/reports/members.csv')->assertForbidden();
        $this->grant($u, ['memberships.view']);
        $csv = $this->get('/api/admin/memberships/reports/members.csv')->assertOk()->streamedContent();
        $this->assertStringContainsString("'=cmd()", $csv);   // a name that starts like a formula is kept as text
        $this->assertStringNotContainsString(',=cmd()', $csv);
        $this->assertSame(4, $this->getJson('/api/admin/memberships/reports')->assertOk()->json('now.members'));
        $this->getJson('/api/admin/memberships/reports?from=2026-10-20&to=2026-10-01')->assertStatus(422);
    }
}
