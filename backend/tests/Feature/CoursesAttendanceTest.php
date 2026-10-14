<?php

namespace Tests\Feature;

use App\Models\Courses\ClassSession;
use App\Models\Courses\Enrolment;
use App\Models\Courses\LiveSession;
use App\Models\Courses\Offering;
use App\Models\Courses\RegisterEntry;
use App\Models\User;
use App\Services\Books\BooksException;
use App\Services\Courses\CourseAccess;
use App\Services\Courses\CourseAttendance;
use App\Services\Courses\Curriculum;
use App\Services\Courses\CourseSettings;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/** Courses step 6: classes, the register, self check-in, excuses, the share attended, completing on attendance, and the warnings. "Now" is Monday 12 Oct 2026, 12:00. */
class CoursesAttendanceTest extends TestCase
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

    private function att(): CourseAttendance
    {
        return app(CourseAttendance::class);
    }

    private function cls(Offering $o, string $starts, int $hours = 2, array $x = []): ClassSession
    {
        $s = Carbon::parse($starts, 'Africa/Nairobi');

        return ClassSession::forceCreate($x + ['offering_id' => $o->id, 'title' => 'Class '.$starts, 'starts_at' => $s, 'ends_at' => $s->copy()->addHours($hours), 'mode' => 'in_person', 'status' => 'scheduled'])->fresh();
    }

    private function student(Offering $o, string $name = 'Amina', ?string $from = null): User
    {
        $u = $this->person($name);
        $a = app(CourseAccess::class)->grant($u->id, $o->id, 'staff', 'test');
        if ($from) {
            $a->update(['starts_at' => Carbon::parse($from, 'Africa/Nairobi')]);
        }

        return $u;
    }

    private function mark(Offering $o, ClassSession $s, array $marks): int
    {
        return $this->att()->mark($o, $s, array_map(fn ($uid, $st) => ['user_id' => $uid, 'status' => $st], array_keys($marks), $marks));
    }

    // ── classes ──────────────────────────────────────────────────────────

    public function test_a_class_is_saved_and_checked(): void
    {
        $o = $this->offering(['location_id' => 2, 'delivery' => 'in_person']);
        $s = $this->att()->saveSession($o, ['title' => '  Week 1 ', 'starts_at' => '2026-10-20 09:00', 'ends_at' => '2026-10-20 21:00', 'notes' => ' Bring flour ', 'self_checkin' => true], null, 7);
        $this->assertSame(['Week 1', 'in_person', 2, 'Bring flour', true, 6, 'scheduled', 7], [$s->title, $s->mode, (int) $s->location_id, $s->notes, (bool) $s->self_checkin, strlen($s->checkin_code), $s->status, (int) $s->created_by]);
        $code = $s->checkin_code;
        $s = $this->att()->saveSession($o, ['title' => 'Week 1b'], $s);
        $this->assertSame([$code, '2026-10-20 09:00'], [$s->checkin_code, $s->starts_at->format('Y-m-d H:i')]);   // the code stays
        $this->assertNull($this->att()->saveSession($o, ['mode' => 'online'], $s)->location_id);   // online: no branch
        $this->assertNull($this->att()->saveSession($o, ['notes' => ''], $s)->notes);
        $this->fails(fn () => $this->att()->saveSession($o, ['title' => '', 'starts_at' => '2026-10-20 09:00', 'ends_at' => '2026-10-20 10:00']), 'title of up to 160');
        $this->fails(fn () => $this->att()->saveSession($o, ['title' => str_repeat('t', 161), 'starts_at' => '2026-10-20 09:00', 'ends_at' => '2026-10-20 10:00']), 'title of up to 160');
        $this->assertSame(160, mb_strlen($this->att()->saveSession($o, ['title' => str_repeat('t', 160), 'starts_at' => '2026-10-20 09:00', 'ends_at' => '2026-10-20 10:00'])->title));
        $this->fails(fn () => $this->att()->saveSession($o, ['title' => 'X']), 'start and end time');
        $this->fails(fn () => $this->att()->saveSession($o, ['title' => 'X', 'starts_at' => '2026-10-20 09:00']), 'start and end time');
        $this->fails(fn () => $this->att()->saveSession($o, ['title' => 'X', 'starts_at' => 'whenever', 'ends_at' => 'later']), 'start and end time');
        $this->fails(fn () => $this->att()->saveSession($o, ['title' => 'X', 'starts_at' => '2026-10-20 09:00', 'ends_at' => '2026-10-20 09:00']), 'at most 12 hours');
        $this->fails(fn () => $this->att()->saveSession($o, ['title' => 'X', 'starts_at' => '2026-10-20 09:00', 'ends_at' => '2026-10-20 21:01']), 'at most 12 hours');
        $this->fails(fn () => $this->att()->saveSession($o, ['title' => 'X', 'starts_at' => '2026-10-20 09:00', 'ends_at' => '2026-10-20 10:00', 'mode' => 'radio']), 'in person or online');
        $this->fails(fn () => $this->att()->saveSession($o, ['title' => 'X', 'starts_at' => '2026-10-20 09:00', 'ends_at' => '2026-10-20 10:00', 'location_id' => 99]), 'branch does not exist');
        $this->fails(fn () => $this->att()->saveSession($this->offering(), ['title' => 'X'], $s), 'another offering');
        $this->assertNull($this->att()->saveSession($o, ['title' => 'No code', 'starts_at' => '2026-10-21 09:00', 'ends_at' => '2026-10-21 10:00'])->checkin_code);
    }

    public function test_a_make_up_class_stands_in_for_an_ordinary_class_of_the_same_offering(): void
    {
        $o = $this->offering();
        $a = $this->cls($o, '2026-10-05 09:00');
        $m = $this->att()->saveSession($o, ['title' => 'Make-up', 'starts_at' => '2026-10-08 09:00', 'ends_at' => '2026-10-08 10:00', 'makeup_for_id' => $a->id]);
        $this->assertSame($a->id, (int) $m->makeup_for_id);
        $this->fails(fn () => $this->att()->saveSession($o, ['title' => 'X', 'starts_at' => '2026-10-09 09:00', 'ends_at' => '2026-10-09 10:00', 'makeup_for_id' => $m->id]), 'ordinary classes');   // not a make-up of a make-up
        $this->fails(fn () => $this->att()->saveSession($o, ['title' => 'X', 'starts_at' => '2026-10-09 09:00', 'ends_at' => '2026-10-09 10:00', 'makeup_for_id' => $this->cls($this->offering(), '2026-10-05 09:00')->id]), 'ordinary classes');
        $this->fails(fn () => $this->att()->saveSession($o, ['makeup_for_id' => $a->id], $a), 'ordinary classes');   // not of itself
        $this->assertNull($this->att()->saveSession($o, ['makeup_for_id' => null], $m)->makeup_for_id);
    }

    public function test_classes_are_cancelled_kept_or_removed_and_a_live_lesson_brings_its_own(): void
    {
        $o = $this->offering();
        $u = $this->student($o, 'Amina', '2026-09-01 00:00');
        $marked = $this->cls($o, '2026-10-05 09:00');
        $this->mark($o, $marked, [$u->id => 'present']);
        $this->fails(fn () => $this->att()->deleteSession($o, $marked), 'cancel it instead');
        $this->assertSame('cancelled', $this->att()->cancelSession($o, $marked)->status);
        $this->fails(fn () => $this->mark($o, $marked->fresh(), [$u->id => 'present']), 'was cancelled');
        $empty = $this->cls($o, '2026-10-06 09:00');
        $mk = $this->cls($o, '2026-10-07 09:00', 1, ['makeup_for_id' => $empty->id]);
        $this->att()->deleteSession($o, $empty);
        $this->assertNull($mk->fresh()->makeup_for_id);   // the make-up becomes an ordinary class
        $this->fails(fn () => $this->att()->deleteSession($this->offering(), $mk), 'another offering');
        $this->fails(fn () => $this->att()->cancelSession($this->offering(), $mk), 'another offering');

        $cur = app(Curriculum::class);
        $live = $cur->saveLesson($o, ['kind' => 'live', 'title' => 'Zoom bread', 'live' => ['starts_at' => '2026-10-20 18:00', 'ends_at' => '2026-10-20 19:00']]);
        $s = ClassSession::whereNotNull('live_id')->sole();
        $this->assertSame(['Zoom bread', 'online', '2026-10-20 18:00'], [$s->title, $s->mode, $s->starts_at->format('Y-m-d H:i')]);
        $this->fails(fn () => $this->att()->saveSession($o, ['starts_at' => '2026-10-21 18:00'], $s), 'change the times on the lesson');
        $this->fails(fn () => $this->att()->cancelSession($o, $s), 'remove the lesson');
        $this->assertTrue((bool) $this->att()->saveSession($o, ['self_checkin' => true], $s)->self_checkin);   // the rest may change
        $cur->saveLesson($o, ['title' => 'Zoom bread 2', 'live' => ['starts_at' => '2026-10-22 18:00', 'ends_at' => '2026-10-22 19:00']], $live);
        $this->assertSame(['Zoom bread 2', '2026-10-22 18:00', 1], [$s->fresh()->title, $s->fresh()->starts_at->format('Y-m-d H:i'), ClassSession::whereNotNull('live_id')->count()]);
        $cur->deleteLesson($o, $live);
        $this->assertNull(ClassSession::find($s->id));   // no marks: it goes
        $live2 = $cur->saveLesson($o, ['kind' => 'live', 'title' => 'Zoom 2', 'live' => ['starts_at' => '2026-10-01 18:00', 'ends_at' => '2026-10-01 19:00']]);
        $s2 = ClassSession::whereNotNull('live_id')->sole();
        $this->mark($o, $s2, [$u->id => 'present']);
        $cur->saveLesson($o, ['kind' => 'text'], $live2);   // no longer live
        $this->assertSame(['cancelled', null], [$s2->fresh()->status, $s2->fresh()->live_id]);   // marks kept: cancelled
    }

    // ── the register ─────────────────────────────────────────────────────

    public function test_the_roll_is_who_had_access_around_the_class_and_anyone_already_marked(): void
    {
        $o = $this->offering();
        $s = $this->cls($o, '2026-10-10 09:00');
        $in = $this->student($o, 'Ann', '2026-10-01 00:00');
        $late = $this->student($o, 'Bob', '2026-10-10 10:30');   // joined during the class: still on the roll
        $after = $this->student($o, 'Cy', '2026-10-10 11:01');   // after it ended
        $ended = $this->person('Dee');
        app(CourseAccess::class)->grant($ended->id, $o->id, 'staff', 'old')->update(['starts_at' => Carbon::parse('2026-09-01'), 'ends_at' => Carbon::parse('2026-10-10 09:00', 'Africa/Nairobi')]);
        $gone = $this->person('Eve');
        app(CourseAccess::class)->grant($gone->id, $o->id, 'staff', 'gone')->update(['starts_at' => Carbon::parse('2026-09-01'), 'revoked_at' => Carbon::parse('2026-10-10 09:30', 'Africa/Nairobi')]);   // revoked during it: was there
        $this->assertSame(['Ann', 'Bob', 'Eve'], $this->att()->roll($s)->pluck('name')->all());
        $this->fails(fn () => $this->mark($o, $s, [$after->id => 'present']), 'not on this class');
        $this->fails(fn () => $this->mark($o, $s, [$in->id => 'asleep']), 'present, late, absent or excused');
        $this->assertSame(2, $this->att()->mark($o, $s, [['user_id' => $in->id, 'status' => 'late', 'note' => ' Bus '], ['user_id' => $late->id, 'status' => 'absent']], 9));
        $e = RegisterEntry::where('user_id', $in->id)->sole();
        $this->assertSame(['late', 'teacher', 'Bus', 9], [$e->status, $e->method, $e->note, (int) $e->marked_by]);
        $this->assertSame(1, $this->att()->mark($o, $s, [['user_id' => $late->id, 'status' => '']]));   // cleared
        $this->assertSame(1, RegisterEntry::count());
        $this->fails(fn () => $this->att()->mark($this->offering(), $s, []), 'another offering');
        $roll = $this->att()->rollCall($s);
        $this->assertSame([['Ann', 'late'], ['Bob', null], ['Eve', null]], array_map(fn ($r) => [$r['name'], $r['status']], $roll['students']));
        unset($ended, $gone);
    }

    public function test_students_check_themselves_in_with_the_code_on_time_or_late(): void
    {
        $o = $this->offering();
        $s = $this->cls($o, '2026-10-12 14:00', 2, ['self_checkin' => true, 'checkin_code' => '123456']);
        $u = $this->student($o, 'Ann');
        $v = $this->student($o, 'Bob');
        $t = fn (string $at) => Carbon::parse($at, 'Africa/Nairobi');
        $this->fails(fn () => $this->att()->checkIn($u, $s, '123456', $t('2026-10-12 13:44')), 'open from 15 minutes before');
        $this->fails(fn () => $this->att()->checkIn($u, $s, '654321', $t('2026-10-12 13:45')), 'code is not right');
        $this->assertSame('present', $this->att()->checkIn($u, $s, ' 123456 ', $t('2026-10-12 14:10'))->status);
        $this->fails(fn () => $this->att()->checkIn($u, $s, '123456', $t('2026-10-12 14:11')), 'marked already');
        $e = $this->att()->checkIn($v, $s, '123456', $t('2026-10-12 14:10:01'));
        $this->assertSame(['late', 'self'], [$e->status, $e->method]);
        $w = $this->student($o, 'Cy');
        $this->assertSame('late', $this->att()->checkIn($w, $s, '123456', $t('2026-10-12 16:00'))->status);
        $x = $this->student($o, 'Dee');
        $this->fails(fn () => $this->att()->checkIn($x, $s, '123456', $t('2026-10-12 16:00:01')), 'open from');
        $this->fails(fn () => $this->att()->checkIn($this->person('Stranger'), $s, '123456', $t('2026-10-12 14:00')), 'not on the roll');
        $off = $this->cls($o, '2026-10-12 14:00');
        $this->fails(fn () => $this->att()->checkIn($x, $off, '', $t('2026-10-12 14:00')), 'not on for this class');
        $s->update(['status' => 'cancelled']);
        $this->fails(fn () => $this->att()->checkIn($x, $s->fresh(), '123456', $t('2026-10-12 14:00')), 'not on for this class');
        CourseSettings::save(['checkin_open_minutes' => 0, 'checkin_late_minutes' => 0], null);
        $s2 = $this->cls($o, '2026-10-13 09:00', 1, ['self_checkin' => true, 'checkin_code' => '111111']);
        $this->fails(fn () => $this->att()->checkIn($x, $s2, '111111', $t('2026-10-13 08:59')), 'open from 0 minutes');
        $this->assertSame('present', $this->att()->checkIn($x, $s2, '111111', $t('2026-10-13 09:00'))->status);
        $this->mark($o, $s2, [$w->id => 'absent']);
        $this->assertSame('late', $this->att()->checkIn($w, $s2, '111111', $t('2026-10-13 09:01'))->status);   // marked absent, then came: checked in
    }

    public function test_a_student_asks_to_be_excused_and_the_teacher_decides(): void
    {
        $o = $this->offering();
        $s = $this->cls($o, '2026-10-08 09:00');   // ends 11:00 on the 8th
        $u = $this->student($o, 'Ann', '2026-09-01 00:00');
        $t = fn (string $at) => Carbon::parse($at, 'Africa/Nairobi');
        $this->fails(fn () => $this->att()->askExcuse($u, $s, '  ', $t('2026-10-09 09:00')), 'Say why');
        $this->fails(fn () => $this->att()->askExcuse($u, $s, 'Ill', $t('2026-10-15 11:00:01')), 'too late');
        $e = $this->att()->askExcuse($u, $s, ' Ill ', $t('2026-10-15 11:00'));   // a week after it ended
        $this->assertSame(['asked', 'Ill', 'self', null], [$e->status, $e->note, $e->method, $e->marked_by]);
        $this->fails(fn () => $this->att()->askExcuse($this->person('Stranger'), $s, 'Ill'), 'not on the roll');
        $this->fails(fn () => $this->att()->decideExcuse($this->offering(), $e, true), 'no excuse waiting');
        $e = $this->att()->decideExcuse($o, $e, true, 9, '  ');
        $this->assertSame(['excused', 'Ill', 9], [$e->status, $e->note, (int) $e->marked_by]);
        $this->fails(fn () => $this->att()->decideExcuse($o, $e, true), 'no excuse waiting');
        $this->fails(fn () => $this->att()->askExcuse($u, $s, 'Again', $t('2026-10-09 09:00')), 'marked already');
        $v = $this->student($o, 'Bob', '2026-09-01 00:00');
        $no = $this->att()->decideExcuse($o, $this->att()->askExcuse($v, $s, 'Bored', $t('2026-10-09 09:00')), false, 9, 'Not a reason');
        $this->assertSame(['absent', 'Not a reason'], [$no->status, $no->note]);
        $s->update(['status' => 'cancelled']);
        $this->fails(fn () => $this->att()->askExcuse($this->student($o, 'Cy', '2026-09-01 00:00'), $s->fresh(), 'Ill', $t('2026-10-09 09:00')), 'too late');
    }

    // ── the share ────────────────────────────────────────────────────────

    public function test_the_share_counts_held_classes_leaves_excused_ones_out_and_follows_make_ups(): void
    {
        $o = $this->offering(['min_attendance_pct' => 75]);
        $u = $this->student($o, 'Ann', '2026-09-01 00:00');
        $other = $this->student($o, 'Bob', '2026-09-01 00:00');
        $c = [];
        foreach (['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-05', '2026-10-20', '2026-10-21'] as $d) {
            $c[] = $this->cls($o, $d.' 09:00');
        }
        $this->assertSame(['state' => 'pending', 'needed' => 75, 'rate' => null, 'attended' => 0, 'excused' => 0, 'held' => 0, 'remaining' => 6, 'total' => 6, 'best' => 100.0], $this->att()->standing($u->id, $o));
        $this->mark($o, $c[0], [$u->id => 'present', $other->id => 'present']);
        $this->mark($o, $c[1], [$u->id => 'late', $other->id => 'present']);
        $this->mark($o, $c[2], [$u->id => 'absent', $other->id => 'present']);
        $this->mark($o, $c[3], [$u->id => 'excused', $other->id => 'present']);
        $st = $this->att()->standing($u->id, $o);
        $this->assertSame([66.7, 2, 1, 4, 2, 6, 80.0], [$st['rate'], $st['attended'], $st['excused'], $st['held'], $st['remaining'], $st['total'], $st['best']]);
        $this->assertSame('at_risk', $st['state']);   // 2 of 3 held is under 75%, but 4 of 5 can still be reached
        $mk = $this->cls($o, '2026-10-08 09:00', 1, ['makeup_for_id' => $c[2]->id]);
        $this->mark($o, $mk, [$u->id => 'present']);
        $st = $this->att()->standing($u->id, $o);
        $this->assertSame(['ok', 100.0, 3, 6], [$st['state'], $st['rate'], $st['attended'], $st['total']]);   // the make-up stands in, and is not counted itself
        $this->att()->cancelSession($o, $c[5]);
        $this->assertSame(5, $this->att()->standing($u->id, $o)['total']);
        $this->assertFalse($this->att()->meets($u->id, $o));   // a class is still to be held
        $this->at('2026-10-20 11:00:01');
        $this->assertSame(1, $this->att()->standing($u->id, $o)['remaining']);   // over but nobody marked it: not held yet
        $this->mark($o, $c[4], [$u->id => 'present']);
        $this->assertTrue($this->att()->meets($u->id, $o));
        $this->assertTrue($this->att()->meets($u->id, $this->offering()));   // nothing asked
        $this->assertSame('none', $this->att()->standing($u->id, $this->offering())['state']);
    }

    public function test_an_excuse_request_alone_does_not_make_a_class_held_for_everyone(): void
    {
        $o = $this->offering(['min_attendance_pct' => 50]);
        $u = $this->student($o, 'Ann', '2026-09-01 00:00');
        $v = $this->student($o, 'Bob', '2026-09-01 00:00');
        $s = $this->cls($o, '2026-10-09 09:00');
        $this->cls($o, '2026-10-30 09:00');
        $this->att()->askExcuse($u, $s, 'Ill');
        $this->assertSame(['pending', 0], [$this->att()->standing($v->id, $o)['state'], $this->att()->standing($v->id, $o)['held']]);
        $this->assertSame(0, $this->att()->warn());
    }

    public function test_a_student_who_can_no_longer_reach_the_share_has_failed_and_is_told_once_for_each_state(): void
    {
        $o = $this->offering(['min_attendance_pct' => 80, 'title' => 'Bread']);
        $u = $this->student($o, 'Ann', '2026-09-01 00:00');
        $ok = $this->student($o, 'Bob', '2026-09-01 00:00');
        $c = [];
        foreach (['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04', '2026-10-30'] as $d) {
            $c[] = $this->cls($o, $d.' 09:00');
        }
        $this->mark($o, $c[0], [$u->id => 'absent', $ok->id => 'present']);
        $this->assertSame('at_risk', $this->att()->standing($u->id, $o)['state']);   // 4 of 5 still possible
        $this->assertSame(1, $this->att()->warn());
        $this->assertSame(0, $this->att()->warn());   // once
        $this->assertSame(['course_attendance'], $this->sentTo($u->id));
        $this->assertSame([], $this->sentTo($ok->id));
        $this->mark($o, $c[1], [$u->id => 'absent', $ok->id => 'present']);
        $this->assertSame('failed', $this->att()->standing($u->id, $o)['state']);
        $this->assertSame(1, $this->att()->warn());
        $this->assertSame(0, $this->att()->warn());
        $this->assertSame(2, DB::table('course_attendance_flags')->count());
        $o->update(['status' => 'archived']);
        DB::table('course_attendance_flags')->delete();
        $this->assertSame(0, $this->att()->warn());   // only offerings on sale
    }

    // ── completing on attendance ─────────────────────────────────────────

    public function test_an_offering_with_only_attendance_completes_when_the_last_class_is_marked(): void
    {
        $o = $this->offering(['min_attendance_pct' => 50]);
        $u = $this->student($o, 'Ann', '2026-09-01 00:00');
        $e = Enrolment::forceCreate(['number' => 'EN-1', 'offering_id' => $o->id, 'student_user_id' => $u->id, 'status' => 'active', 'channel' => 'online', 'total' => 0, 'paid_total' => 0]);
        $a = $this->cls($o, '2026-10-01 09:00');
        $b = $this->cls($o, '2026-10-02 09:00');
        $this->mark($o, $a, [$u->id => 'present']);
        $this->assertSame('active', $e->fresh()->status);
        $this->mark($o, $b, [$u->id => 'absent']);
        $this->assertSame('completed', $e->fresh()->status);
    }

    public function test_self_check_in_and_an_approved_excuse_can_complete_too(): void
    {
        $o = $this->offering(['min_attendance_pct' => 100]);
        $u = $this->student($o, 'Ann', '2026-09-01 00:00');
        $e = Enrolment::forceCreate(['number' => 'EN-1', 'offering_id' => $o->id, 'student_user_id' => $u->id, 'status' => 'active', 'channel' => 'online', 'total' => 0, 'paid_total' => 0]);
        $a = $this->cls($o, '2026-10-08 09:00');
        $b = $this->cls($o, '2026-10-12 11:00', 1, ['self_checkin' => true, 'checkin_code' => '222222']);
        $this->mark($o, $a, [$u->id => 'present']);
        $this->at('2026-10-12 11:30');
        $this->att()->checkIn($u, $b, '222222');
        $this->assertSame('active', $e->fresh()->status);   // the class has not ended
        $this->at('2026-10-12 12:01');
        $req = $this->att()->askExcuse($this->student($o, 'Bob', '2026-09-01 00:00'), $a, 'x');
        $this->att()->decideExcuse($o, $req, true);
        $this->assertSame('active', $e->fresh()->status);   // Bob's register changed, not Ann's
        $this->assertSame(1, $this->att()->completeFinished());   // the hourly job tries again once the class is over
        $this->assertSame('completed', $e->fresh()->status);
        $this->assertSame(0, $this->att()->completeFinished());
        $this->artisan('courses:attendance-warnings')->assertSuccessful();
    }

    // ── what the screens show (HTTP) ─────────────────────────────────────

    public function test_the_teacher_keeps_the_register_only_for_their_own_offerings(): void
    {
        $teacher = $this->staff('Teacher', ['courses.teach']);
        $mine = $this->offering(['instructor_user_id' => $teacher->id, 'min_attendance_pct' => 50]);
        $theirs = $this->offering();
        $u = $this->student($mine, 'Ann', '2026-09-01 00:00');
        $s = $this->cls($mine, '2026-10-05 09:00', 2, ['self_checkin' => true, 'checkin_code' => '333333']);
        $x = $this->cls($theirs, '2026-10-05 09:00');
        Sanctum::actingAs($teacher, ['*']);
        $this->getJson("/api/admin/courses/offerings/{$theirs->id}/attendance")->assertForbidden();
        $this->postJson("/api/admin/courses/offerings/{$theirs->id}/sessions/{$x->id}/marks", ['marks' => [['user_id' => $u->id, 'status' => 'present']]])->assertForbidden();
        $this->postJson("/api/admin/courses/offerings/{$mine->id}/sessions/{$x->id}/marks", ['marks' => [['user_id' => $u->id, 'status' => 'present']]])->assertNotFound();   // another offering's class
        $r = $this->postJson("/api/admin/courses/offerings/{$mine->id}/sessions/{$s->id}/marks", ['marks' => [['user_id' => $u->id, 'status' => 'present']]])->assertOk()->json();
        $this->assertSame(['1 mark(s) saved.', 'present', 1], [$r['message'], $r['roll']['students'][0]['status'], $r['sessions'][0]['present']]);
        $this->assertSame('333333', $r['sessions'][0]['checkin_code']);
        $ov = $this->getJson("/api/admin/courses/offerings/{$mine->id}/attendance")->assertOk()->json();
        $this->assertSame(['Ann', 'ok'], [$ov['report'][0]['name'], $ov['report'][0]['state']]);
        $this->postJson("/api/admin/courses/offerings/{$mine->id}/sessions", ['title' => 'New', 'starts_at' => '2026-10-25 09:00', 'ends_at' => '2026-10-25 10:00'])->assertOk()->assertJsonCount(2, 'sessions');
        $other = $this->cls($theirs, '2026-10-06 09:00');
        $entry = RegisterEntry::forceCreate(['session_id' => $other->id, 'offering_id' => $theirs->id, 'user_id' => $u->id, 'status' => 'asked']);
        $this->postJson("/api/admin/courses/offerings/{$mine->id}/excuses/{$entry->id}", ['approve' => true])->assertNotFound();
        $this->assertSame('asked', $entry->fresh()->status);
    }

    public function test_a_student_checks_in_and_asks_to_be_excused_from_my_learning(): void
    {
        $o = $this->offering();
        $u = $this->student($o, 'Ann', '2026-09-01 00:00');
        $s = $this->cls($o, '2026-10-12 11:30', 2, ['self_checkin' => true, 'checkin_code' => '444444']);
        $later = $this->cls($o, '2026-10-20 09:00');
        Sanctum::actingAs($u, ['*']);
        $this->postJson("/api/courses/my/sessions/{$s->id}/checkin", ['code' => '000000'])->assertStatus(422)->assertJsonPath('message', 'That code is not right. Ask your teacher for it.');
        $this->postJson("/api/courses/my/sessions/{$s->id}/checkin", ['code' => '444444'])->assertOk()->assertJsonPath('status', 'late');
        $this->postJson("/api/courses/my/sessions/{$later->id}/excuse", ['reason' => 'Wedding'])->assertOk();
        $mine = $this->att()->mine($u, $o);
        $this->assertSame([['late', false], ['asked', true]], array_map(fn ($r) => [$r['status'], $r['can_excuse']], $mine['sessions']));
        Sanctum::actingAs($this->person('Stranger'), ['*']);
        $this->postJson("/api/courses/my/sessions/{$later->id}/excuse", ['reason' => 'x'])->assertStatus(422);
    }
}
