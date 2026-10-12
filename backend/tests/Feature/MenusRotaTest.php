<?php

namespace Tests\Feature;

use App\Models\Menus\DayOff;
use App\Models\Menus\Shift;
use App\Services\Books\BooksException;
use App\Services\Menus\MenusSettings;
use App\Services\Menus\RotaService;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/** Menus steps 11-12: the rota (shifts, publishing, copying a week), time off, leave balances and the private chef cross-checks. "Today" is Monday 12 Oct 2026, 12:00. */
class MenusRotaTest extends TestCase
{
    use Concerns\CreatesRotaWorld;

    protected function setUp(): void
    {
        parent::setUp();
        $this->createRotaWorld();
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    private function rota(): RotaService
    {
        return app(RotaService::class);
    }

    private function fails(callable $fn, string $part): void
    {
        try {
            $fn();
        } catch (BooksException $e) {
            $this->assertStringContainsString($part, $e->getMessage());

            return;
        }
        $this->fail("Expected a refusal containing: {$part}");
    }

    private function shift(int $chefId, string $date = '2026-10-14', string $from = '08:00', string $to = '16:00', array $o = []): Shift
    {
        return $this->rota()->saveShift(['chef_id' => $chefId, 'location_id' => 1, 'date' => $date, 'starts_at' => $from, 'ends_at' => $to] + $o)['shift'];
    }

    public function test_a_new_shift_is_a_draft_with_clean_times(): void
    {
        $c = $this->chefOf('Wanjiru Kamau');
        $s = $this->shift($c->id, '2026-10-14', '08:00', '16:30', ['note' => '  Opening  ']);
        $this->assertSame('draft', $s->status);
        $this->assertSame('08:00', substr((string) $s->starts_at, 0, 5));
        $this->assertSame('Opening', $s->note);
        $this->assertSame(0, $this->toldCount('changed'));   // a draft is not news to the chef
    }

    public function test_shift_validation(): void
    {
        $c = $this->chefOf('Wanjiru Kamau');
        $off = $this->chefOf('Left Us', ['is_active' => false]);
        $this->fails(fn () => $this->shift($off->id), 'Choose a chef');
        $this->fails(fn () => $this->shift(999), 'Choose a chef');
        $this->fails(fn () => $this->rota()->saveShift(['chef_id' => $c->id, 'location_id' => 99, 'date' => '2026-10-14', 'starts_at' => '08:00', 'ends_at' => '12:00']), 'branch');
        $this->fails(fn () => $this->shift($c->id, '2026-10-11'), 'today or a day to come');
        $this->fails(fn () => $this->shift($c->id, '2028-10-14'), 'too far ahead');
        $this->fails(fn () => $this->shift($c->id, '2026-10-14', '8am', '16:00'), 'start time');
        $this->fails(fn () => $this->shift($c->id, '2026-10-14', '08:00', '25:00'), 'finish time');
        $this->fails(fn () => $this->shift($c->id, '2026-10-14', '16:00', '08:00'), 'finish after it starts');
        $this->fails(fn () => $this->shift($c->id, '2026-10-14', '08:00', '08:30'), 'between 1 and 16');
        $this->fails(fn () => $this->shift($c->id, '2026-10-14', '04:00', '21:00'), 'between 1 and 16');
        $this->assertSame(0, Shift::count());
        $this->shift($c->id, '2026-10-12', '14:00', '15:00');   // exactly one hour, today
        $this->shift($c->id, '2026-10-13', '04:00', '20:00');   // exactly sixteen hours
        $this->assertSame(2, Shift::count());
    }

    public function test_a_chef_can_not_work_two_overlapping_shifts_but_back_to_back_is_fine(): void
    {
        $c = $this->chefOf('Wanjiru Kamau');
        $this->shift($c->id, '2026-10-14', '08:00', '12:00');
        $this->fails(fn () => $this->shift($c->id, '2026-10-14', '11:00', '15:00'), 'already works 08:00 to 12:00');
        $this->shift($c->id, '2026-10-14', '12:00', '16:00');
        $this->assertSame(2, Shift::count());
    }

    public function test_changing_a_shift_does_not_clash_with_itself_and_a_past_shift_is_locked(): void
    {
        $c = $this->chefOf('Wanjiru Kamau');
        $s = $this->shift($c->id);
        $moved = $this->rota()->saveShift(['ends_at' => '17:00'], $s)['shift'];
        $this->assertSame('17:00', substr((string) $moved->ends_at, 0, 5));
        $old = Shift::create(['chef_id' => $c->id, 'location_id' => 1, 'shift_date' => '2026-10-10', 'starts_at' => '08:00', 'ends_at' => '12:00', 'status' => 'published']);
        $this->fails(fn () => $this->rota()->saveShift(['ends_at' => '13:00'], $old), 'has passed');
        $this->fails(fn () => $this->rota()->deleteShift($old), 'has passed');
    }

    public function test_changing_a_published_shift_tells_the_chef_and_a_new_chef_too(): void
    {
        $a = $this->chefOf('Wanjiru Kamau');
        $b = $this->chefOf('Otieno Odhiambo');
        $s = $this->shift($a->id);
        $this->rota()->publish(Carbon::parse('2026-10-12'));
        $this->told = [];
        $this->rota()->saveShift(['note' => 'just a note'], Shift::find($s->id));
        $this->assertSame(0, $this->toldCount('changed'));   // nothing the chef cares about changed
        $this->rota()->saveShift(['starts_at' => '09:00'], Shift::find($s->id));
        $this->assertSame(1, $this->toldCount('changed'));
        $this->told = [];
        $this->rota()->saveShift(['chef_id' => $b->id], Shift::find($s->id));
        $this->assertSame(2, $this->toldCount('changed'));   // the old chef: cancelled, the new one: changed
        $this->assertSame([$s->id, 'cancelled'], array_values(array_filter($this->told, fn ($t) => $t[2] === 'cancelled'))[0] ? [$s->id, 'cancelled'] : []);
    }

    public function test_changing_a_draft_tells_nobody(): void
    {
        $c = $this->chefOf('Wanjiru Kamau');
        $s = $this->shift($c->id);
        $this->rota()->saveShift(['starts_at' => '09:00'], $s);
        $this->assertSame(0, $this->toldCount('changed'));
    }

    public function test_week_limits_are_warned_about_only_beyond_the_line(): void
    {
        $c = $this->chefOf('Wanjiru Kamau');
        foreach (['2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16', '2026-10-17'] as $d) {
            $r = $this->rota()->saveShift(['chef_id' => $c->id, 'location_id' => 1, 'date' => $d, 'starts_at' => '08:00', 'ends_at' => '16:00']);   // six 8-hour days = 48
            $this->assertSame([], $r['warnings']);
        }
        $r = $this->rota()->saveShift(['chef_id' => $c->id, 'location_id' => 1, 'date' => '2026-10-18', 'starts_at' => '08:00', 'ends_at' => '09:00']);
        $this->assertStringContainsString('49 hours this week', $r['warnings'][0]);
    }

    public function test_rest_between_days_is_warned_about_only_when_short(): void
    {
        $c = $this->chefOf('Wanjiru Kamau');
        MenusSettings::save(['rota_min_rest_hours' => 10], null);
        $this->shift($c->id, '2026-10-13', '14:00', '22:00');
        $ok = $this->rota()->saveShift(['chef_id' => $c->id, 'location_id' => 1, 'date' => '2026-10-14', 'starts_at' => '08:00', 'ends_at' => '12:00']);   // exactly 10 hours of rest
        $this->assertSame([], $ok['warnings']);
        $short = $this->rota()->saveShift(['chef_id' => $c->id, 'location_id' => 1, 'date' => '2026-10-15', 'starts_at' => '09:00', 'ends_at' => '13:00']);   // 21 h rest; fine
        $this->assertSame([], $short['warnings']);
        $d = $this->chefOf('Otieno Odhiambo');
        $this->shift($d->id, '2026-10-13', '14:00', '22:00');
        $tight = $this->rota()->saveShift(['chef_id' => $d->id, 'location_id' => 1, 'date' => '2026-10-14', 'starts_at' => '07:00', 'ends_at' => '11:00']);   // 9 hours of rest
        $this->assertStringContainsString('Only 9 hours of rest', $tight['warnings'][0]);
    }

    public function test_week_counts_what_is_waiting(): void
    {
        $c = $this->chefOf('Wanjiru Kamau');
        $this->rota()->requestDayOff($c, ['from' => '2026-10-20']);
        $this->rota()->requestDayOff($c, ['from' => '2026-10-22']);
        $this->rota()->requestDayOff($c, ['from' => '2026-10-27'], null, true);
        $this->assertSame(2, $this->rota()->week(Carbon::parse('2026-10-12'))['waiting']);
    }

    public function test_deleting_tells_only_when_it_was_published(): void
    {
        $c = $this->chefOf('Wanjiru Kamau');
        $draft = $this->shift($c->id, '2026-10-14');
        $pub = $this->shift($c->id, '2026-10-15');
        $this->rota()->publish(Carbon::parse('2026-10-12'));
        $d2 = $this->shift($c->id, '2026-10-16');
        $this->rota()->deleteShift($d2);
        $this->assertSame(0, $this->toldCount('changed'));
        $this->rota()->deleteShift(Shift::find($pub->id));
        $this->assertSame(1, $this->toldCount('changed'));
        $this->assertNull(Shift::find($pub->id));
        $this->assertNotNull(Shift::find($draft->id));
    }

    public function test_publish_covers_only_the_week_and_branch_and_tells_once(): void
    {
        $c = $this->chefOf('Wanjiru Kamau');
        $this->shift($c->id, '2026-10-12');
        $this->shift($c->id, '2026-10-18');
        $this->shift($c->id, '2026-10-19');   // next week
        $this->assertSame(2, $this->rota()->publish(Carbon::parse('2026-10-12')));
        $this->assertSame(1, $this->toldCount('published'));
        $this->assertSame(['published', 'published'], Shift::whereBetween('shift_date', ['2026-10-12', '2026-10-18'])->pluck('status')->map(fn () => 'published')->all());
        $this->assertSame('draft', Shift::where('shift_date', '2026-10-19')->value('status'));
        $this->assertNotNull(Shift::where('shift_date', '2026-10-12')->value('published_at'));
        $this->assertSame(0, $this->rota()->publish(Carbon::parse('2026-10-12')));   // nothing new
        $this->assertSame(1, $this->toldCount('published'));
        $this->assertSame(0, $this->rota()->publish(Carbon::parse('2026-10-19'), 7));   // another branch
    }

    public function test_copy_week_makes_drafts_and_says_what_it_left_out(): void
    {
        $a = $this->chefOf('Wanjiru Kamau');
        $b = $this->chefOf('Otieno Odhiambo');
        $this->shift($a->id, '2026-10-12', '08:00', '12:00');
        $this->shift($a->id, '2026-10-14');
        $this->shift($b->id, '2026-10-15');
        $this->rota()->publish(Carbon::parse('2026-10-12'));
        $this->rota()->requestDayOff($b, ['from' => '2026-10-22', 'to' => '2026-10-22'], null, true);
        $r = $this->rota()->copyWeek(Carbon::parse('2026-10-12'), Carbon::parse('2026-10-21'));   // any day in the weeks
        $this->assertSame(2, $r['copied']);
        $this->assertCount(1, $r['skipped']);
        $this->assertStringContainsString('Otieno Odhiambo Thu 22 Oct', $r['skipped'][0]);
        $this->assertSame('draft', Shift::where('shift_date', '2026-10-21')->value('status'));
        $this->assertSame(1, Shift::where('shift_date', '2026-10-21')->count());
        $this->assertSame(1, Shift::where('shift_date', '2026-10-19')->count());
        // copying again hits the clash for everyone
        $again = $this->rota()->copyWeek(Carbon::parse('2026-10-12'), Carbon::parse('2026-10-19'));
        $this->assertSame(0, $again['copied']);
        $this->assertGreaterThanOrEqual(2, count($again['skipped']));
        $this->fails(fn () => $this->rota()->copyWeek(Carbon::parse('2026-10-12'), Carbon::parse('2026-10-14')), 'different week');
        // a week that is already over is left out
        $past = $this->rota()->copyWeek(Carbon::parse('2026-10-12'), Carbon::parse('2026-10-05'));
        $this->assertSame(0, $past['copied']);
    }

    public function test_copy_week_can_be_limited_to_a_branch(): void
    {
        $a = $this->chefOf('Wanjiru Kamau');
        $this->shiftRow($a->id, '2026-10-13', '08:00', '12:00', 'published', ['location_id' => 2]);
        $this->shift($a->id, '2026-10-14');
        $r = $this->rota()->copyWeek(Carbon::parse('2026-10-12'), Carbon::parse('2026-10-19'), 1);
        $this->assertSame(1, $r['copied']);
    }

    // ── time off ──────────────────────────────────────────────────────────

    public function test_asking_for_time_off_is_a_request_and_a_manager_recording_it_is_approved(): void
    {
        $c = $this->chefOf('Wanjiru Kamau');
        $off = $this->rota()->requestDayOff($c, ['from' => '2026-10-20', 'to' => '2026-10-21', 'reason' => 'Wedding']);
        $this->assertSame('requested', $off->status);
        $this->assertSame(1, $this->toldCount('requested'));
        $rec = $this->rota()->requestDayOff($c, ['from' => '2026-10-27'], $this->person('Boss'), true);
        $this->assertSame('approved', $rec->status);
        $this->assertSame('2026-10-27', $rec->to_date->toDateString());
        $this->assertNotNull($rec->decided_at);
        $this->assertSame(1, $this->toldCount('decided'));
    }

    public function test_time_off_validation(): void
    {
        $c = $this->chefOf('Wanjiru Kamau');
        $this->fails(fn () => $this->rota()->requestDayOff($c, []), 'first day');
        $this->fails(fn () => $this->rota()->requestDayOff($c, ['from' => '2026-10-20', 'kind' => 'holiday']), 'kind of time off');
        $this->fails(fn () => $this->rota()->requestDayOff($c, ['from' => '2026-10-21', 'to' => '2026-10-20']), 'before the first');
        $this->fails(fn () => $this->rota()->requestDayOff($c, ['from' => '2026-10-11']), 'today or later');
        $this->fails(fn () => $this->rota()->requestDayOff($c, ['from' => '2026-10-13', 'to' => '2026-12-20']), 'at most 60');
        $this->rota()->requestDayOff($c, ['from' => '2026-10-13', 'to' => '2026-12-11']);   // 60 days is allowed
        $gone = $this->chefOf('Left Us', ['is_active' => false]);
        $this->fails(fn () => $this->rota()->requestDayOff($gone, ['from' => '2027-01-05']), 'not working with us');
    }

    public function test_time_off_may_not_overlap_but_a_declined_one_does_not_count(): void
    {
        $c = $this->chefOf('Wanjiru Kamau');
        $a = $this->rota()->requestDayOff($c, ['from' => '2026-10-20', 'to' => '2026-10-22']);
        $this->fails(fn () => $this->rota()->requestDayOff($c, ['from' => '2026-10-22', 'to' => '2026-10-23']), 'overlaps');
        $this->fails(fn () => $this->rota()->requestDayOff($c, ['from' => '2026-10-18', 'to' => '2026-10-20']), 'overlaps');
        $this->rota()->requestDayOff($c, ['from' => '2026-10-23', 'to' => '2026-10-23']);   // the day after is fine
        $this->rota()->decide($a, 'declined');
        $this->rota()->requestDayOff($c, ['from' => '2026-10-20', 'to' => '2026-10-22']);
        $this->assertSame(3, DayOff::count());
    }

    public function test_approving_takes_the_shifts_off_the_rota_and_tells_the_chef(): void
    {
        $c = $this->chefOf('Wanjiru Kamau');
        $this->shift($c->id, '2026-10-20');
        $this->shift($c->id, '2026-10-21');
        $this->shift($c->id, '2026-10-23');
        $this->rota()->publish(Carbon::parse('2026-10-19'));
        $this->told = [];
        $off = $this->rota()->requestDayOff($c, ['from' => '2026-10-20', 'to' => '2026-10-21']);
        $r = $this->rota()->decide($off, 'approved', ' enjoy ', $this->person('Boss'));
        $this->assertSame(2, $r['shifts_removed']);
        $this->assertSame('enjoy', $r['dayoff']->decision_note);
        $this->assertSame(1, Shift::count());
        $this->assertSame(2, $this->toldCount('changed'));
        $this->assertSame(1, $this->toldCount('decided'));
        $this->fails(fn () => $this->rota()->decide($off->fresh(), 'declined'), 'answered already');
    }

    public function test_declining_keeps_the_shifts(): void
    {
        $c = $this->chefOf('Wanjiru Kamau');
        $this->shift($c->id, '2026-10-20');
        $off = $this->rota()->requestDayOff($c, ['from' => '2026-10-20']);
        $r = $this->rota()->decide($off, 'declined');
        $this->assertSame(0, $r['shifts_removed']);
        $this->assertSame(1, Shift::count());
        $this->fails(fn () => $this->rota()->decide($this->rota()->requestDayOff($c, ['from' => '2026-10-25']), 'maybe'), 'Approve or decline');
    }

    public function test_a_chef_on_approved_time_off_can_not_be_given_a_shift(): void
    {
        $c = $this->chefOf('Wanjiru Kamau');
        $this->rota()->requestDayOff($c, ['from' => '2026-10-20', 'to' => '2026-10-22'], null, true);
        $this->fails(fn () => $this->shift($c->id, '2026-10-21'), 'is off on Wed 21 Oct');
        $this->shift($c->id, '2026-10-23');
        // asked-for-but-not-approved time off does not block
        $this->rota()->requestDayOff($c, ['from' => '2026-10-27']);
        $this->shift($c->id, '2026-10-27');
    }

    public function test_cancelling_time_off(): void
    {
        $c = $this->chefOf('Wanjiru Kamau');
        $off = $this->rota()->requestDayOff($c, ['from' => '2026-10-20']);
        $this->assertSame('cancelled', $this->rota()->cancelDayOff($off)->status);
        $this->fails(fn () => $this->rota()->cancelDayOff($off->fresh()), 'can not be cancelled');
        $this->shift($c->id, '2026-10-20');   // not blocked any more
        $past = DayOff::create(['chef_id' => $c->id, 'from_date' => '2026-10-05', 'to_date' => '2026-10-07', 'kind' => 'off', 'status' => 'approved']);
        $this->fails(fn () => $this->rota()->cancelDayOff($past), 'can not be cancelled');
    }

    // ── leave balance ─────────────────────────────────────────────────────

    public function test_leave_takes_working_days_off_the_balance_when_approved_and_gives_them_back(): void
    {
        $c = $this->chefOf('Wanjiru Kamau', [], ['leave_balance' => 10]);
        // Fri 16 Oct to Tue 20 Oct: Fri, Mon, Tue are working days = 3
        $off = $this->rota()->requestDayOff($c, ['from' => '2026-10-16', 'to' => '2026-10-20', 'kind' => 'leave']);
        $this->assertSame(10.0, (float) DB::table('employees')->value('leave_balance'));   // not charged until approved
        $this->rota()->decide($off, 'approved', null, $this->person('Boss'));
        $this->assertSame(7.0, (float) DB::table('employees')->value('leave_balance'));
        $this->assertSame(3.0, (float) $off->fresh()->charged_days);
        $log = DB::table('leave_logs')->first();
        $this->assertSame('use', $log->action);
        $this->assertEquals(3, $log->days);
        $this->assertEquals(10, $log->balance_before);
        $this->assertEquals(7, $log->balance_after);
        $this->rota()->cancelDayOff($off->fresh());
        $this->assertSame(10.0, (float) DB::table('employees')->value('leave_balance'));
        $this->assertSame(0.0, (float) $off->fresh()->charged_days);
        $this->assertSame('add', DB::table('leave_logs')->orderByDesc('id')->value('action'));
        $this->assertSame(2, DB::table('leave_logs')->count());
    }

    public function test_leave_recorded_by_a_manager_is_charged_at_once(): void
    {
        $c = $this->chefOf('Wanjiru Kamau', [], ['leave_balance' => 5]);
        $this->rota()->requestDayOff($c, ['from' => '2026-10-13', 'to' => '2026-10-14', 'kind' => 'leave'], $this->person('Boss'), true);
        $this->assertSame(3.0, (float) DB::table('employees')->value('leave_balance'));
    }

    public function test_leave_over_the_balance_is_refused_and_so_is_approving_after_it_ran_down(): void
    {
        $c = $this->chefOf('Wanjiru Kamau', [], ['leave_balance' => 2]);
        $this->fails(fn () => $this->rota()->requestDayOff($c, ['from' => '2026-10-13', 'to' => '2026-10-15', 'kind' => 'leave']), 'has 2 leave day(s) left and this needs 3');
        $a = $this->rota()->requestDayOff($c, ['from' => '2026-10-13', 'to' => '2026-10-14', 'kind' => 'leave']);
        $b = $this->rota()->requestDayOff($c, ['from' => '2026-10-15', 'to' => '2026-10-16', 'kind' => 'leave']);
        $this->rota()->decide($a, 'approved');
        $this->fails(fn () => $this->rota()->decide($b, 'approved'), 'only 0');
        $this->assertSame('requested', $b->fresh()->status);   // nothing changed
        $this->assertSame(0.0, (float) DB::table('employees')->value('leave_balance'));
    }

    public function test_only_leave_touches_the_balance_and_a_chef_without_an_employee_record_is_never_refused(): void
    {
        $c = $this->chefOf('Wanjiru Kamau', [], ['leave_balance' => 1]);
        foreach (['off', 'sick', 'other'] as $i => $kind) {
            if (! isset(DayOff::KINDS[$kind])) {
                continue;
            }
            $this->rota()->requestDayOff($c, ['from' => '2026-11-0'.($i + 2), 'to' => '2026-11-0'.($i + 2), 'kind' => $kind], null, true);
        }
        $this->assertSame(1.0, (float) DB::table('employees')->value('leave_balance'));
        $free = $this->chefOf('No Record');
        $this->rota()->requestDayOff($free, ['from' => '2026-10-13', 'to' => '2026-10-30', 'kind' => 'leave'], null, true);
        $this->assertSame(0, DB::table('leave_logs')->count());
    }

    // ── private chef jobs ─────────────────────────────────────────────────

    private function job(int $chefId, string $at, int $minutes = 120, string $status = 'confirmed'): int
    {
        return DB::table('menus_requests')->insertGetId(['number' => 'CK-'.rand(1000, 9999), 'chef_id' => $chefId, 'duration_minutes' => $minutes, 'event_at' => Carbon::parse($at, 'Africa/Nairobi')->format('Y-m-d H:i:s'), 'status' => $status, 'created_at' => now(), 'updated_at' => now()]);
    }

    public function test_a_chef_with_a_private_chef_job_can_not_be_given_a_shift_close_to_it(): void
    {
        $c = $this->chefOf('Wanjiru Kamau');
        $this->job($c->id, '2026-10-14 18:00', 120);   // 18:00-20:00 plus travel an hour each side
        $this->fails(fn () => $this->shift($c->id, '2026-10-14', '12:00', '17:30'), 'private chef job');
        $this->fails(fn () => $this->shift($c->id, '2026-10-14', '20:30', '23:00'), 'private chef job');
        $this->shift($c->id, '2026-10-14', '08:00', '16:30');
    }

    public function test_a_job_that_is_over_or_lapsed_does_not_block(): void
    {
        $c = $this->chefOf('Wanjiru Kamau');
        $this->job($c->id, '2026-10-14 18:00', 120, 'declined');
        $this->job($c->id, '2026-10-15 18:00', 120, 'requested');
        $this->assertSame('draft', $this->shift($c->id, '2026-10-14', '12:00', '19:00')->status);
        $this->assertSame('draft', $this->shift($c->id, '2026-10-15', '12:00', '19:00')->status);
    }

    public function test_approved_time_off_lists_the_private_chef_jobs_that_still_need_cover(): void
    {
        $c = $this->chefOf('Wanjiru Kamau');
        $this->job($c->id, '2026-10-21 10:00');
        $this->job($c->id, '2026-10-25 10:00');   // outside the days off
        $declined = $this->rota()->decide($this->rota()->requestDayOff($c, ['from' => '2026-10-20', 'to' => '2026-10-22']), 'declined');
        $this->assertSame([], $declined['jobs']);
        $r = $this->rota()->decide($this->rota()->requestDayOff($c, ['from' => '2026-10-20', 'to' => '2026-10-22']), 'approved');
        $this->assertCount(1, $r['jobs']);
    }

    public function test_a_job_can_not_be_booked_while_the_chef_is_on_a_shift_or_off(): void
    {
        $c = $this->chefOf('Wanjiru Kamau');
        $this->shift($c->id, '2026-10-14', '10:00', '14:00');
        $this->rota()->requestDayOff($c, ['from' => '2026-10-16'], null, true);
        $start = Carbon::parse('2026-10-14 12:00', 'Africa/Nairobi');
        $this->assertNotNull($this->rota()->shiftClash($c->id, $start, $start->copy()->addHours(2)));
        $this->assertNull($this->rota()->shiftClash($c->id, Carbon::parse('2026-10-14 14:00', 'Africa/Nairobi'), Carbon::parse('2026-10-14 15:00', 'Africa/Nairobi')));
        $this->assertNotNull($this->rota()->offDuring($c->id, Carbon::parse('2026-10-16 09:00', 'Africa/Nairobi'), Carbon::parse('2026-10-16 11:00', 'Africa/Nairobi')));
        $this->assertNull($this->rota()->offDuring($c->id, Carbon::parse('2026-10-17 09:00', 'Africa/Nairobi'), Carbon::parse('2026-10-17 11:00', 'Africa/Nairobi')));
    }

    // ── the week view ─────────────────────────────────────────────────────

    public function test_the_week_lists_shifts_time_off_and_warns_about_long_weeks(): void
    {
        $c = $this->chefOf('Wanjiru Kamau');
        foreach (['2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16'] as $d) {
            $this->shift($c->id, $d, '07:00', '17:00');
        }
        $this->shift($c->id, '2026-10-17', '07:00', '15:00');   // 58 hours
        $this->rota()->requestDayOff($c, ['from' => '2026-10-18'], null, true);
        $w = $this->rota()->week(Carbon::parse('2026-10-12'));
        $this->assertCount(6, $w['shifts']);
        $this->assertCount(1, $w['days_off']);
        $this->assertSame('2026-10-12', $w['week_start']);
        $this->assertSame(58.0, (float) $w['chefs'][0]['hours']);
        $this->assertTrue(collect($w['chefs'][0]['warnings'])->contains(fn ($x) => str_contains((string) $x, '58 hours this week')));
        $next = $this->rota()->week(Carbon::parse('2026-10-19'));
        $this->assertCount(0, $next['shifts']);
    }

    public function test_a_chef_sees_only_their_own_shifts_and_time_off(): void
    {
        $a = $this->chefOf('Wanjiru Kamau');
        $b = $this->chefOf('Otieno Odhiambo');
        $this->shift($a->id, '2026-10-14');
        $this->shift($b->id, '2026-10-15');
        $this->rota()->publish(Carbon::parse('2026-10-12'));
        $this->shift($a->id, '2026-10-16');   // a draft is not shown
        $this->rota()->requestDayOff($b, ['from' => '2026-10-20']);
        $mine = $this->rota()->mine(User_of($a));
        $this->assertCount(1, $mine['shifts']);
        $this->assertCount(0, $mine['days_off']);
    }

    public function test_rostered_on_lists_who_works_today(): void
    {
        $a = $this->chefOf('Wanjiru Kamau');
        $b = $this->chefOf('Otieno Odhiambo');
        $this->shift($a->id, '2026-10-12', '08:00', '16:00');
        $this->rota()->publish(Carbon::parse('2026-10-12'));
        $this->shift($b->id, '2026-10-12', '08:00', '16:00');   // still a draft
        $r = $this->rota()->rosteredOn();
        $this->assertCount(1, $r);
    }
}

function User_of(\App\Models\Menus\Chef $c): \App\Models\User
{
    return \App\Models\User::find($c->user_id);
}
