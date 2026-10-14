<?php

namespace Tests\Feature;

use App\Models\Courses\ClassSession;
use App\Models\Courses\Enrolment;
use App\Models\Courses\Intake;
use App\Models\Courses\Offering;
use App\Models\Courses\RegisterEntry;
use App\Models\Courses\WaitlistEntry;
use App\Models\User;
use App\Services\Books\BooksException;
use App\Services\Courses\CourseAccess;
use App\Services\Courses\CourseSettings;
use App\Services\Courses\EnrolmentService;
use App\Services\Courses\IntakeService;
use App\Services\Courses\TeachingService;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/** Courses step 9: intakes, the waiting list and its offers, and the teacher's dashboard and students. "Now" is Monday 12 Oct 2026, 12:00. */
class CoursesTeachingTest extends TestCase
{
    use Concerns\CreatesCoursesWorld;

    protected function setUp(): void
    {
        parent::setUp();
        $this->createCoursesWorld();
    }

    private function fails(callable $fn, string $msg): void
    {
        try {
            $fn();
            $this->fail("Expected: {$msg}");
        } catch (BooksException $e) {
            $this->assertStringContainsString($msg, $e->getMessage());
        }
    }

    private function intakes(): IntakeService
    {
        return app(IntakeService::class);
    }

    private function enrol(Offering $o, User $u, array $in = []): Enrolment
    {
        return app(EnrolmentService::class)->enrol($o, $in + ['student_user_id' => $u->id]);
    }

    private function intake(Offering $o, array $d = []): Intake
    {
        return $this->intakes()->save($o, $d + ['name' => 'January 2027', 'starts_on' => '2027-01-10', 'ends_on' => '2027-03-10']);
    }

    // ── intakes ──────────────────────────────────────────────────────────

    public function test_an_intake_is_saved_and_checked(): void
    {
        $o = $this->offering();
        $i = $this->intake($o, ['enrol_until' => '2027-01-05', 'capacity' => 20, 'name' => '  Jan run ']);
        $this->assertSame(['Jan run', '2027-01-10', '2027-03-10', '2027-01-05', 20, 'open'], [$i->name, $i->starts_on->toDateString(), $i->ends_on->toDateString(), $i->enrol_until->toDateString(), (int) $i->capacity, $i->status]);
        $this->fails(fn () => $this->intakes()->save($o, ['name' => ' ']), 'Give the intake a name');
        $this->fails(fn () => $this->intake($o, ['starts_on' => 'someday']), 'valid start date');
        $this->fails(fn () => $this->intake($o, ['ends_on' => '2027-01-09']), 'cannot end before it starts');
        $this->assertSame('2027-01-10', $this->intake($o, ['ends_on' => '2027-01-10'])->ends_on->toDateString());   // a one-day run
        $this->fails(fn () => $this->intake($o, ['enrol_until' => '2027-03-11']), 'close by the day the intake ends');
        $this->assertSame('2027-03-10', $this->intake($o, ['enrol_until' => '2027-03-10'])->enrol_until->toDateString());
        $this->fails(fn () => $this->intake($o, ['capacity' => 0]), 'between 1 and 5000');
        $this->fails(fn () => $this->intake($o, ['capacity' => 5001]), 'between 1 and 5000');
        $this->assertSame(5000, (int) $this->intake($o, ['capacity' => 5000])->capacity);
        $this->assertNull($this->intakes()->save($o, ['capacity' => ''], $i)->capacity);
        $this->fails(fn () => $this->intake($o, ['status' => 'paused']), 'open or closed');
        $this->assertSame('closed', $this->intakes()->save($o, ['status' => 'closed'], $i)->status);
        $this->assertSame('Jan run', $this->intakes()->save($o, ['status' => 'open'], $i)->name);   // what is left out stays
    }

    public function test_an_offering_with_intakes_asks_for_an_open_one_with_room(): void
    {
        $o = $this->offering();
        $this->fee($o);
        $a = $this->intake($o, ['name' => 'A', 'capacity' => 1]);
        $closed = $this->intake($o, ['name' => 'Closed', 'status' => 'closed']);
        $past = $this->intake($o, ['name' => 'Past', 'starts_on' => '2026-09-01', 'ends_on' => '2026-12-01', 'enrol_until' => '2026-10-11']);
        $last = $this->intake($o, ['name' => 'Last day', 'starts_on' => '2026-10-01', 'ends_on' => '2026-12-01', 'enrol_until' => '2026-10-12']);
        $this->assertSame(['Last day', 'A'], $this->intakes()->openIntakes($o)->pluck('name')->all());   // in date order; enrol_until today still counts
        $u = $this->person('Ann');
        $this->fails(fn () => $this->enrol($o, $u), 'Choose which intake');
        $this->fails(fn () => $this->enrol($o, $u, ['intake_id' => $closed->id]), 'not open for enrolment');
        $this->fails(fn () => $this->enrol($o, $u, ['intake_id' => $past->id]), 'not open for enrolment');
        $e = $this->enrol($o, $u, ['intake_id' => $a->id]);
        $this->assertSame($a->id, (int) $e->intake_id);
        $this->fails(fn () => $this->enrol($o, $this->person('Bob'), ['intake_id' => $a->id]), 'Every place in that intake is taken');
        $this->assertSame($last->id, (int) $this->enrol($o, $this->person('Cy'), ['intake_id' => $last->id])->intake_id);
        $o->update(['capacity' => 2]);   // the offering's own limit still applies across runs
        $this->fails(fn () => $this->enrol($o, $this->person('Dee'), ['intake_id' => $last->id]), 'Every place in that intake is taken');
        Intake::query()->update(['status' => 'closed']);
        $this->fails(fn () => $this->enrol($o, $this->person('Eve')), 'no open intake right now');
        $rows = collect($this->intakes()->intakes($o))->keyBy('name');
        $this->assertSame([1, 0, false], [$rows['A']['enrolled'], $rows['A']['places_left'], $rows['A']['open']]);
    }

    public function test_an_intake_with_students_or_people_waiting_is_closed_not_removed(): void
    {
        $o = $this->offering();
        $this->fee($o);
        $a = $this->intake($o, ['capacity' => 2]);
        $this->enrol($o, $this->person('Ann'), ['intake_id' => $a->id]);
        $this->fails(fn () => $this->intakes()->delete($o, $a), 'close it instead');
        $this->fails(fn () => $this->intakes()->save($o, ['capacity' => 0], $a), 'between 1 and 5000');
        $b = $this->intake($o, ['name' => 'B', 'capacity' => 1]);
        $this->enrol($o, $this->person('Bob'), ['intake_id' => $b->id]);
        $this->intakes()->join($o, $this->person('Cy'), $b->id);
        $this->fails(fn () => $this->intakes()->delete($o, $b), 'close it instead');
        $this->enrol($o, $this->person('Dee'), ['intake_id' => $a->id]);   // the run is full now
        $this->fails(fn () => $this->intakes()->save($o, ['capacity' => 1], $a), 'more students in this intake');
        $this->assertSame(2, (int) $this->intakes()->save($o, ['capacity' => 2], $a)->capacity);
        $empty = $this->intake($o, ['name' => 'Empty']);
        $this->intakes()->delete($o, $empty);
        $this->assertNull(Intake::find($empty->id));
    }

    // ── the waiting list ─────────────────────────────────────────────────

    public function test_people_join_the_list_only_when_it_is_full_and_once(): void
    {
        $o = $this->offering(['capacity' => 1]);
        $this->fee($o);
        $ann = $this->person('Ann');
        $this->fails(fn () => $this->intakes()->join($o, $ann), 'There is room');
        $this->enrol($o, $ann);
        $this->fails(fn () => $this->intakes()->join($o, $ann), 'enrolled in this already');
        $bob = $this->person('Bob');
        $w = $this->intakes()->join($o, $bob);
        $this->assertSame(['waiting', null], [$w->status, $w->intake_id]);
        $this->fails(fn () => $this->intakes()->join($o, $bob), 'on the waiting list already');
        $this->fails(fn () => $this->intakes()->join($this->offering(['status' => 'draft', 'capacity' => 1]), $bob), 'not open for enrolment');
        $this->fails(fn () => $this->intakes()->join($this->offering(), $bob), 'There is room');   // no limit at all
        $this->intakes()->leave($o, $bob);
        $this->assertSame('removed', $w->fresh()->status);
        $i = $this->offering();
        $run = $this->intake($i, ['capacity' => 1]);
        $this->fails(fn () => $this->intakes()->join($i, $bob), 'Choose which intake');
        $this->fails(fn () => $this->intakes()->join($i, $bob, 999), 'not open for enrolment');
        $this->enrol($i, $ann, ['intake_id' => $run->id]);
        $this->assertSame($run->id, (int) $this->intakes()->join($i, $bob, $run->id)->intake_id);
    }

    public function test_a_freed_place_is_offered_to_the_first_in_line_and_held_for_them_only(): void
    {
        $o = $this->offering(['capacity' => 1, 'title' => 'Bread']);
        $this->fee($o);
        $first = $this->enrol($o, $this->person('Ann'));
        $bob = $this->person('Bob');
        $cy = $this->person('Cy');
        $wb = $this->intakes()->join($o, $bob);
        $wc = $this->intakes()->join($o, $cy);
        app(EnrolmentService::class)->cancel($first);   // a place frees up
        $wb = $wb->fresh();
        $this->assertSame(['offered', '2026-10-14 12:00', 'waiting'], [$wb->status, $wb->offer_expires_at->timezone('Africa/Nairobi')->format('Y-m-d H:i'), $wc->fresh()->status]);
        $this->assertSame(['course_waitlist_offer'], $this->sentTo($bob->id));
        $this->fails(fn () => $this->enrol($o, $cy), 'Every place is taken');   // held for Bob
        $this->fails(fn () => $this->enrol($o, $this->person('Walk-in')), 'Every place is taken');
        $e = $this->enrol($o, $bob);
        $this->assertSame(['pending', 'enrolled'], [$e->status, $wb->fresh()->status]);
        $view = $this->intakes()->publicView($o, $cy);
        $this->assertSame(['status' => 'waiting', 'intake_id' => null, 'position' => 1, 'offer_expires_at' => null], $view['waitlist']);
    }

    public function test_an_offer_that_runs_out_passes_to_the_next_in_line(): void
    {
        CourseSettings::save(['waitlist_hold_hours' => 24], null);
        $o = $this->offering(['capacity' => 1]);
        $this->fee($o);
        $first = $this->enrol($o, $this->person('Ann'));
        $bob = $this->person('Bob');
        $cy = $this->person('Cy');
        $wb = $this->intakes()->join($o, $bob);
        $wc = $this->intakes()->join($o, $cy);
        app(EnrolmentService::class)->cancel($first);
        $this->assertSame(['expired' => 0, 'offered' => 0], $this->intakes()->sweep(Carbon::parse('2026-10-13 11:59', 'Africa/Nairobi')));
        $this->at('2026-10-13 12:00');
        $this->assertSame(['expired' => 1, 'offered' => 1], $this->intakes()->sweep());
        $this->assertSame(['expired', 'offered'], [$wb->fresh()->status, $wc->fresh()->status]);
        $this->assertContains('course_waitlist_expired', $this->sentTo($bob->id));
        $this->assertSame('pending', $this->enrol($o, $cy)->status);
    }

    public function test_staff_offer_a_place_now_or_take_someone_off_the_list(): void
    {
        $o = $this->offering(['capacity' => 1]);
        $this->fee($o);
        $first = $this->enrol($o, $this->person('Ann'));
        $wb = $this->intakes()->join($o, $this->person('Bob'));
        $wc = $this->intakes()->join($o, $this->person('Cy'));
        $this->fails(fn () => $this->intakes()->offerNow($o, $wc), 'no free place');
        $o->update(['capacity' => 2]);   // one more place: staff choose who gets it
        $this->assertSame('offered', $this->intakes()->offerNow($o, $wc)->status);
        $this->fails(fn () => $this->intakes()->offerNow($o, $wc->fresh()), 'Only someone who is waiting');
        $this->assertSame([['Bob', 'waiting', 1], ['Cy', 'offered', 2]], array_map(fn ($r) => [$r['student'], $r['status'], $r['position']], $this->intakes()->waitlist($o)));
        $this->intakes()->remove($wc->fresh());   // the place goes to the next in line
        $this->assertSame(['removed', 'offered'], [$wc->fresh()->status, $wb->fresh()->status]);
        unset($first);
    }

    public function test_the_offering_page_shows_runs_and_my_place_in_line(): void
    {
        $o = $this->offering();
        $this->fee($o);
        $a = $this->intake($o, ['name' => 'A', 'capacity' => 1]);
        $b = $this->intake($o, ['name' => 'B', 'capacity' => 1]);
        $this->enrol($o, $this->person('Ann'), ['intake_id' => $a->id]);
        $this->enrol($o, $this->person('Bob'), ['intake_id' => $b->id]);
        $cy = $this->person('Cy');
        $this->intakes()->join($o, $this->person('Dee'), $a->id);
        $this->intakes()->join($o, $this->person('Eve'), $b->id);
        $this->intakes()->join($o, $cy, $b->id);
        $v = $this->intakes()->publicView($o, $cy);
        $this->assertSame([true, ['A', 'B'], [0, 0], 2], [$v['has_intakes'], array_column($v['intakes'], 'name'), array_column($v['intakes'], 'places_left'), $v['waitlist']['position']]);   // counted within the run
        Sanctum::actingAs($cy, ['*']);
        $r = $this->getJson("/api/learn/{$o->slug}")->assertOk()->json();
        $this->assertSame([false, false, 2], [$r['me']['can_enrol'], $r['me']['can_wait'], $r['me']['waitlist']['position']]);
        $this->deleteJson("/api/courses/offerings/{$o->id}/waitlist")->assertOk();
        $this->assertTrue($this->getJson("/api/learn/{$o->slug}")->json('me.can_wait'));
        $this->postJson("/api/courses/offerings/{$o->id}/waitlist", ['intake_id' => $a->id])->assertOk();
        $this->postJson("/api/courses/offerings/{$o->id}/waitlist", ['intake_id' => $a->id])->assertStatus(422);
    }

    public function test_an_offer_held_in_one_intake_does_not_take_a_place_in_another(): void
    {
        $o = $this->offering();
        $this->fee($o);
        $a = $this->intake($o, ['name' => 'A', 'capacity' => 1]);
        $b = $this->intake($o, ['name' => 'B', 'capacity' => 1]);
        $first = $this->enrol($o, $this->person('Ann'), ['intake_id' => $a->id]);
        $w = $this->intakes()->join($o, $this->person('Bob'), $a->id);
        app(EnrolmentService::class)->cancel($first);
        $this->assertSame('offered', $w->fresh()->status);
        $this->assertSame([0, 1], [$this->intakes()->room($o, $a->id), $this->intakes()->room($o, $b->id)]);   // held in A only
        $this->assertSame($b->id, (int) $this->enrol($o, $this->person('Cy'), ['intake_id' => $b->id])->intake_id);
    }

    public function test_no_offers_are_made_for_an_offering_off_sale_or_a_closed_intake(): void
    {
        $o = $this->offering(['capacity' => 1]);
        $this->fee($o);
        $first = $this->enrol($o, $this->person('Ann'));
        $w = $this->intakes()->join($o, $this->person('Bob'));
        $o->update(['status' => 'draft']);
        app(EnrolmentService::class)->cancel($first);
        $this->assertSame(['waiting', 0], [$w->fresh()->status, $this->intakes()->fill($o)]);
        $o->update(['status' => 'published']);
        $this->assertSame(1, $this->intakes()->fill($o));
        $i = $this->offering();
        $this->fee($i);
        $run = $this->intake($i, ['capacity' => 1]);
        $taken = $this->enrol($i, $this->person('Cy'), ['intake_id' => $run->id]);
        $x = $this->intakes()->join($i, $this->person('Dee'), $run->id);
        $this->intakes()->save($i, ['status' => 'closed'], $run);
        app(EnrolmentService::class)->cancel($taken);
        $this->assertSame('waiting', $x->fresh()->status);   // the run is closed: nobody is offered a place in it
    }

    public function test_intake_dates_may_be_left_empty_and_the_last_day_to_enrol_is_still_open(): void
    {
        $o = $this->offering();
        $i = $this->intakes()->save($o, ['name' => 'Rolling', 'starts_on' => '', 'ends_on' => null, 'enrol_until' => '2026-10-12']);
        $this->assertSame([null, null], [$i->starts_on, $i->ends_on]);
        $this->assertTrue($this->intakes()->intakes($o)[0]['open']);
        $this->at('2026-10-13 00:00');
        $this->assertFalse($this->intakes()->intakes($o)[0]['open']);
    }

    // ── the teacher's side ───────────────────────────────────────────────

    public function test_the_dashboard_counts_what_needs_doing_on_my_offerings_only(): void
    {
        $teacher = $this->staff('Teacher', ['courses.teach']);
        $mine = $this->offering(['title' => 'Mine', 'instructor_user_id' => $teacher->id, 'min_attendance_pct' => 100, 'capacity' => 2]);
        $this->offering(['title' => 'Theirs']);
        $this->offering(['title' => 'Old', 'instructor_user_id' => $teacher->id, 'status' => 'archived']);
        $ann = $this->person('Ann');
        $bob = $this->person('Bob');
        foreach ([$ann, $bob] as $i => $u) {
            Enrolment::forceCreate(['number' => 'EN-'.$i, 'offering_id' => $mine->id, 'student_user_id' => $u->id, 'status' => $i ? 'completed' : 'active', 'channel' => 'online', 'total' => 0, 'paid_total' => 0]);
            app(CourseAccess::class)->grant($u->id, $mine->id, 'staff', 't')->update(['starts_at' => Carbon::parse('2026-09-01')]);
        }
        $held = ClassSession::forceCreate(['offering_id' => $mine->id, 'title' => 'Held', 'starts_at' => Carbon::parse('2026-10-01 09:00'), 'ends_at' => Carbon::parse('2026-10-01 11:00'), 'mode' => 'in_person', 'status' => 'scheduled']);
        $asked = ClassSession::forceCreate(['offering_id' => $mine->id, 'title' => 'Asked only', 'starts_at' => Carbon::parse('2026-10-08 09:00'), 'ends_at' => Carbon::parse('2026-10-08 11:00'), 'mode' => 'in_person', 'status' => 'scheduled']);
        ClassSession::forceCreate(['offering_id' => $mine->id, 'title' => 'Next', 'starts_at' => Carbon::parse('2026-10-20 09:00', 'Africa/Nairobi'), 'ends_at' => Carbon::parse('2026-10-20 11:00', 'Africa/Nairobi'), 'mode' => 'in_person', 'status' => 'scheduled']);
        RegisterEntry::forceCreate(['session_id' => $held->id, 'offering_id' => $mine->id, 'user_id' => $ann->id, 'status' => 'absent']);
        RegisterEntry::forceCreate(['session_id' => $asked->id, 'offering_id' => $mine->id, 'user_id' => $bob->id, 'status' => 'asked', 'note' => 'Ill']);
        DB::table('course_quizzes')->insert(['id' => 1, 'offering_id' => $mine->id, 'lesson_id' => $this->lesson($mine, ['kind' => 'quiz'])->id]);
        DB::table('course_attempts')->insert(['quiz_id' => 1, 'offering_id' => $mine->id, 'user_id' => $ann->id, 'status' => 'submitted', 'started_at' => now()]);
        WaitlistEntry::forceCreate(['offering_id' => $mine->id, 'user_id' => $this->person('Cy')->id, 'status' => 'waiting']);
        $d = app(TeachingService::class)->dashboard($teacher);
        $this->assertSame(['Mine'], array_column($d['offerings'], 'title'));
        $row = $d['offerings'][0];
        $this->assertSame([2, 1, 1, 1, 1, 1, 1, 'Next'], [$row['students'], $row['completed'], $row['quizzes_to_mark'], $row['excuses_waiting'], $row['registers_to_take'], $row['behind_on_attendance'], $row['waiting_list'], $row['next_class']['title']]);
        $this->assertSame(['students' => 2, 'quizzes_to_mark' => 1, 'excuses_waiting' => 1, 'registers_to_take' => 1], $d['totals']);   // an excuse request alone is not a register
        $mgr = $this->staff('Manager', ['courses.manage']);
        $this->assertSame(['Mine', 'Theirs'], array_column(app(TeachingService::class)->dashboard($mgr)['offerings'], 'title'));
    }

    public function test_the_students_of_an_offering_and_how_they_are_getting_on(): void
    {
        $o = $this->offering(['certificate' => true]);
        $this->fee($o);
        $l1 = $this->lesson($o);
        $this->lesson($o);
        $run = $this->intake($o, ['name' => 'Jan']);
        $ann = $this->person('Ann');
        $e = $this->enrol($o, $ann, ['intake_id' => $run->id]);
        app(EnrolmentService::class)->takePayment($e, [['payment_method_id' => 1, 'amount' => 1160]]);
        app(\App\Services\Courses\Learning::class)->mark($ann, $l1, 'done');
        $this->enrol($o, $this->person('Bob'), ['intake_id' => $run->id]);
        $rows = app(TeachingService::class)->students($o);
        $this->assertSame(['Ann', 'Bob'], array_column($rows, 'name'));
        $this->assertSame(['Jan', 0.0, 50, 1, 2, 'active'], [$rows[0]['intake'], $rows[0]['balance'], $rows[0]['progress_pct'], $rows[0]['lessons_done'], $rows[0]['lessons_total'], $rows[0]['status']]);
        $this->assertNotNull($rows[0]['last_active']);
        $this->assertSame([1160.0, 0, null], [$rows[1]['balance'], $rows[1]['progress_pct'], $rows[1]['last_active']]);
        $this->assertNull($rows[0]['attendance_state']);   // the offering asks for no attendance
        $o->update(['min_attendance_pct' => 50]);
        $this->assertSame('none', app(TeachingService::class)->students($o->fresh())[0]['attendance_state']);   // asked for, no classes yet
    }

    public function test_menus_chefs_marked_as_instructors_can_be_chosen_as_teachers(): void
    {
        $this->assertSame([], app(TeachingService::class)->instructors());
        DB::statement('CREATE TABLE menus_chefs (id INTEGER PRIMARY KEY, user_id INTEGER, display_name TEXT, title TEXT, bio TEXT, photo TEXT, is_public INTEGER, is_active INTEGER, is_instructor INTEGER, created_at TEXT, updated_at TEXT, deleted_at TEXT)');
        $a = $this->person('A', false);
        $b = $this->person('B', false);
        DB::table('menus_chefs')->insert([['user_id' => $a->id, 'display_name' => 'Zawadi', 'title' => 'Pastry', 'is_active' => 1, 'is_instructor' => 1], ['user_id' => $b->id, 'display_name' => 'Baraka', 'title' => null, 'is_active' => 1, 'is_instructor' => 0],
            ['user_id' => null, 'display_name' => 'Nobody', 'title' => null, 'is_active' => 1, 'is_instructor' => 1], ['user_id' => $b->id, 'display_name' => 'Gone', 'title' => null, 'is_active' => 0, 'is_instructor' => 1]]);
        $this->assertSame([['user_id' => $a->id, 'name' => 'Zawadi', 'title' => 'Pastry']], app(TeachingService::class)->instructors());
    }

    public function test_a_teacher_manages_intakes_and_the_list_of_their_own_offerings_only(): void
    {
        $teacher = $this->staff('Teacher', ['courses.teach']);
        $mine = $this->offering(['instructor_user_id' => $teacher->id, 'capacity' => 1]);
        $theirs = $this->offering(['capacity' => 1]);
        $this->fee($mine);
        $this->enrol($mine, $this->person('Ann'));
        $w = $this->intakes()->join($mine, $this->person('Bob'));
        $x = WaitlistEntry::forceCreate(['offering_id' => $theirs->id, 'user_id' => $this->person('Cy')->id, 'status' => 'waiting']);
        Sanctum::actingAs($teacher, ['*']);
        $this->getJson('/api/admin/courses/teaching')->assertOk()->assertJsonCount(1, 'offerings');
        $this->getJson("/api/admin/courses/offerings/{$theirs->id}/students")->assertForbidden();
        $this->getJson("/api/admin/courses/offerings/{$theirs->id}/intakes")->assertForbidden();
        $this->postJson("/api/admin/courses/offerings/{$mine->id}/intakes", ['name' => 'Feb', 'capacity' => 3])->assertOk()->assertJsonPath('intakes.0.name', 'Feb');
        $this->postJson("/api/admin/courses/offerings/{$mine->id}/waitlist/{$x->id}/offer")->assertNotFound();
        $this->deleteJson("/api/admin/courses/offerings/{$mine->id}/waitlist/{$x->id}")->assertNotFound();
        $this->deleteJson("/api/admin/courses/offerings/{$mine->id}/waitlist/{$w->id}")->assertOk()->assertJsonCount(0, 'waitlist');
        $this->assertSame('waiting', $x->fresh()->status);
    }
}
