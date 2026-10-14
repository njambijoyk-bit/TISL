<?php

namespace Tests\Feature;

use App\Models\Courses\Access;
use App\Models\Courses\Enrolment;
use App\Models\Courses\LiveSession;
use App\Models\Courses\Offering;
use App\Models\Courses\Progress;
use App\Models\Courses\Section;
use App\Models\User;
use App\Services\Books\BooksException;
use App\Services\Courses\CourseAccess;
use App\Services\Courses\Learning;
use App\Services\Courses\LiveReminders;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/** Courses steps 3 and 4: the public catalogue and offering page, and My learning (library, player, progress, completing, calendar files, live reminders). "Now" is Monday 12 Oct 2026, 12:00. */
class CoursesLearningTest extends TestCase
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

    private function learning(): Learning
    {
        return app(Learning::class);
    }

    private function give(User $u, Offering $o, ?Carbon $until = null): Access
    {
        return app(CourseAccess::class)->grant($u->id, $o->id, 'staff', 'test', $until);
    }

    private function live(Offering $o, string $starts, string $ends, array $x = []): LiveSession
    {
        $l = $this->lesson($o, ['kind' => 'live', 'title' => 'Live class']);

        return LiveSession::forceCreate($x + ['offering_id' => $o->id, 'lesson_id' => $l->id, 'starts_at' => Carbon::parse($starts, 'Africa/Nairobi'), 'ends_at' => Carbon::parse($ends, 'Africa/Nairobi'), 'timezone' => 'Africa/Nairobi', 'provider' => 'zoom',
            'join_url' => 'https://zoom.us/j/1', 'meeting_id' => '111', 'passcode' => 'pw', 'replay_url' => 'https://vimeo.com/2'])->fresh();
    }

    // ── the catalogue ────────────────────────────────────────────────────

    public function test_the_catalogue_shows_only_published_offerings_with_their_price_and_filters(): void
    {
        $bread = $this->offering(['title' => 'Bread basics', 'summary' => 'Loaves', 'category' => 'Baking', 'skill_level' => 'beginner', 'tags' => ['yeast', 'oven'], 'instructor_user_id' => $this->person('Chef Wanjiku', false)->id]);
        $this->fee($bread, ['amount' => 1000]);
        $this->fee($bread, ['kind' => 'registration', 'name' => 'Reg', 'amount' => 250.5]);
        $this->fee($bread, ['name' => 'Apron', 'amount' => 900, 'is_optional' => true]);   // an extra is not part of "from"
        $this->fee($bread, ['name' => 'Old', 'amount' => 5000, 'is_active' => false]);
        $this->lesson($bread, ['duration_minutes' => 30]);
        $this->lesson($bread, ['duration_minutes' => 15]);
        $cake = $this->offering(['title' => 'Cakes', 'kind' => 'recipe', 'category' => 'Baking', 'skill_level' => 'advanced', 'delivery' => 'in_person', 'location_id' => 1]);
        $free = $this->offering(['title' => 'Knife skills', 'category' => 'Fundamentals']);
        $this->offering(['title' => 'Draft one', 'status' => 'draft']);
        $this->offering(['title' => 'Old one', 'status' => 'archived']);
        $r = $this->getJson('/api/learn')->assertOk()->json();
        $this->assertSame(['Bread basics', 'Cakes', 'Knife skills'], array_column($r['offerings'], 'title'));
        $this->assertSame(3, $r['total']);
        $b = $r['offerings'][0];
        $this->assertSame([false, 1250.5, 2, 45, 'Chef Wanjiku', ['yeast', 'oven'], 'Beginner'], [$b['free'], $b['price_from'], $b['lessons'], $b['minutes'], $b['teacher'], $b['tags'], $b['level_label']]);
        $this->assertEquals([true, 0, null], [$r['offerings'][2]['free'], $r['offerings'][2]['price_from'], $r['offerings'][2]['teacher']]);
        $this->assertEquals(['course' => 2, 'recipe' => 1], $r['facets']['kinds']);
        $this->assertEquals(['Baking' => 2, 'Fundamentals' => 1], $r['facets']['categories']);
        $titles = fn (string $qs) => array_column($this->getJson('/api/learn?'.$qs)->assertOk()->json('offerings'), 'title');
        $this->assertSame(['Cakes'], $titles('kind=recipe'));
        $this->assertSame(['Bread basics', 'Cakes'], $titles('category=Baking'));
        $this->assertSame(['Cakes'], $titles('level=advanced'));
        $this->assertSame(['Cakes'], $titles('delivery=in_person'));
        $this->assertSame(['Bread basics'], $titles('tag=yeast'));
        $this->assertSame([], $titles('tag=yea'));   // a whole tag, not a piece of one
        $this->assertSame(['Bread basics'], $titles('q=loav'));
        $this->assertSame(['Knife skills'], $titles('q=fundament'));   // the category matches too
        $this->assertSame([], $titles('q=%25'));   // a % is a letter, not "anything"
        $this->assertSame([], $titles('q=draft'));
        unset($cake, $free);
    }

    public function test_the_catalogue_comes_in_pages_of_twelve_with_the_next_live_class(): void
    {
        foreach (range(1, 14) as $i) {
            $this->offering(['title' => sprintf('Course %02d', $i)]);
        }
        $first = Offering::where('title', 'Course 01')->first();
        $this->live($first, '2026-10-01 10:00', '2026-10-01 11:00');   // over
        $next = $this->live($first, '2026-10-20 10:00', '2026-10-20 11:00');
        $this->live($first, '2026-10-30 10:00', '2026-10-30 11:00');
        $p1 = $this->getJson('/api/learn')->json();
        $this->assertSame([12, 14, 1, 12], [count($p1['offerings']), $p1['total'], $p1['page'], $p1['per_page']]);
        $this->assertSame($next->starts_at->toIso8601String(), $p1['offerings'][0]['next_live']);
        $this->assertNull($p1['offerings'][1]['next_live']);
        $this->assertSame(['Course 13', 'Course 14'], array_column($this->getJson('/api/learn?page=2')->json('offerings'), 'title'));
        $this->assertSame(1, $this->getJson('/api/learn?page=-3')->json('page'));
    }

    public function test_the_offering_page_shows_the_plan_and_keeps_paid_lessons_locked(): void
    {
        $o = $this->offering(['title' => 'Sourdough', 'body' => 'All about it', 'free_preview' => true, 'deposit_pct' => 30, 'instalments' => 2, 'grant_on' => 'deposit', 'refund_days' => 14, 'capacity' => 3]);
        $this->fee($o);
        $s = Section::forceCreate(['offering_id' => $o->id, 'title' => 'Week 1', 'sort_order' => 10]);
        $this->lesson($o, ['section_id' => $s->id, 'title' => 'Welcome', 'is_preview' => true, 'body' => 'Hello all']);
        $this->lesson($o, ['section_id' => $s->id, 'title' => 'Starter', 'body' => 'The secret']);
        $this->getJson('/api/learn/no-such-thing')->assertNotFound();
        $this->getJson('/api/learn/'.$this->offering(['status' => 'draft'])->slug)->assertNotFound();
        $r = $this->getJson("/api/learn/{$o->slug}")->assertOk()->json();
        $this->assertEquals(['All about it', 3, 30, 2, 30, 'deposit', 14], [$r['offering']['body'], $r['offering']['capacity_left'], $r['offering']['plan']['deposit_pct'], $r['offering']['plan']['instalments'], $r['offering']['plan']['instalment_days'], $r['offering']['plan']['grant_on'], $r['offering']['plan']['refund_days']]);
        [$welcome, $starter] = $r['outline']['sections'][0]['lessons'];
        $this->assertSame([false, 'Hello all'], [$welcome['locked'], $welcome['body']]);
        $this->assertTrue($starter['locked']);
        $this->assertArrayNotHasKey('body', $starter);   // the paid words never leave the server
        $this->assertSame([false, false, null], [$r['me']['signed_in'], $r['me']['has_access'], $r['me']['enrolment']]);
        $this->assertTrue($r['me']['can_enrol']);
        $this->assertEquals([['Tuition', 1000]], array_map(fn ($f) => [$f['name'], $f['amount']], $r['fees']));
    }

    public function test_a_signed_in_visitor_sees_their_enrolment_and_the_places_left(): void
    {
        $o = $this->offering(['capacity' => 2]);
        $this->fee($o);
        $me = $this->person('Me');
        app(\App\Services\Courses\EnrolmentService::class)->enrol($o, ['student_user_id' => $this->person('Other')->id]);
        Sanctum::actingAs($me, ['*']);
        $r = $this->getJson("/api/learn/{$o->slug}")->json();
        $this->assertSame([true, 1, true, null], [$r['me']['signed_in'], $r['offering']['capacity_left'], $r['me']['can_enrol'], $r['me']['enrolment']]);
        $e = app(\App\Services\Courses\EnrolmentService::class)->enrol($o, ['student_user_id' => $me->id]);
        $r = $this->getJson("/api/learn/{$o->slug}")->json();
        $this->assertSame([0, false, $e->number, null], [$r['offering']['capacity_left'], $r['me']['can_enrol'], $r['me']['enrolment']['number'], $r['me']['enrolment']['invoice_id']]);
        $full = $this->offering(['capacity' => 1]);
        app(\App\Services\Courses\EnrolmentService::class)->enrol($full, ['student_user_id' => $this->person('Z')->id]);
        $r = $this->getJson("/api/learn/{$full->slug}")->json();
        $this->assertSame([false, true], [$r['me']['can_enrol'], $r['me']['can_wait']]);
    }

    public function test_the_teacher_is_shown_from_a_public_chef_profile_when_there_is_one(): void
    {
        DB::statement('CREATE TABLE menus_chefs (id INTEGER PRIMARY KEY, user_id INTEGER, display_name TEXT, title TEXT, bio TEXT, photo TEXT, is_public INTEGER, is_active INTEGER)');
        $chef = $this->person('Real Name', false);
        $o = $this->offering(['instructor_user_id' => $chef->id]);
        $this->assertSame(['Real Name', null], [$this->getJson("/api/learn/{$o->slug}")->json('offering.teacher_profile.name'), $this->getJson("/api/learn/{$o->slug}")->json('offering.teacher_profile.bio')]);
        DB::table('menus_chefs')->insert(['user_id' => $chef->id, 'display_name' => 'Chef W', 'title' => 'Head baker', 'bio' => 'Bakes', 'photo' => null, 'is_public' => 0, 'is_active' => 1]);
        $this->assertSame('Real Name', $this->getJson("/api/learn/{$o->slug}")->json('offering.teacher_profile.name'));   // not public: just the name
        DB::table('menus_chefs')->update(['is_public' => 1]);
        $this->assertSame(['Chef W', 'Head baker', 'Bakes'], array_values(array_intersect_key($this->getJson("/api/learn/{$o->slug}")->json('offering.teacher_profile'), array_flip(['name', 'title', 'bio']))));
        DB::table('menus_chefs')->update(['is_active' => 0]);
        $this->assertSame('Real Name', $this->getJson('/api/learn')->json('offerings.0.teacher'));
    }

    // ── my learning ──────────────────────────────────────────────────────

    public function test_the_library_lists_what_i_can_open_with_progress_and_what_has_ended(): void
    {
        $u = $this->person();
        $a = $this->offering(['title' => 'Bread']);
        $l1 = $this->lesson($a);
        $this->lesson($a);
        $this->lesson($a, ['is_required' => false]);
        $b = $this->offering(['title' => 'Alpha']);
        $this->lesson($b);
        $c = $this->offering(['title' => 'Cakes']);
        $this->give($u, $a, Carbon::parse('2026-10-22 12:00', 'Africa/Nairobi'));
        $this->give($u, $b);
        $b->update(['status' => 'archived']);   // archived: still open to those who have it
        $this->give($u, $c, Carbon::parse('2026-10-13 12:00', 'Africa/Nairobi'));
        $this->give($this->person('Other'), $this->offering(['title' => 'Theirs']));
        $hidden = $this->offering(['title' => 'Hidden', 'status' => 'draft']);
        $this->give($u, $hidden);
        $this->learning()->mark($u, $l1, 'done');
        $this->at('2026-10-14 09:00');   // Cakes has ended
        $lib = $this->learning()->library($u);
        $this->assertSame(['Alpha', 'Bread', 'Cakes'], array_column($lib['items'], 'title'));
        $this->assertSame(['active', 'active', 'ended'], array_column($lib['items'], 'state'));
        $this->assertSame([null, 9, null], array_column($lib['items'], 'days_left'));
        $this->assertSame(['done' => 1, 'total' => 2, 'percent' => 50], $lib['items'][1]['progress']);
        $this->assertSame($l1->id, $lib['items'][1]['last_lesson_id']);
        $this->assertSame([], $lib['on_hold']);
        Sanctum::actingAs($u, ['*']);
        $this->assertSame(3, count($this->getJson('/api/courses/my/library')->assertOk()->json('items')));
    }

    public function test_an_enrolment_held_for_a_late_payment_shows_on_hold(): void
    {
        $u = $this->person();
        $o = $this->offering(['title' => 'Bread']);
        Enrolment::forceCreate(['number' => 'EN-1', 'offering_id' => $o->id, 'student_user_id' => $u->id, 'status' => 'active', 'channel' => 'online', 'access_paused' => true, 'total' => 0, 'paid_total' => 0]);
        Enrolment::forceCreate(['number' => 'EN-2', 'offering_id' => $o->id, 'student_user_id' => $this->person('B')->id, 'status' => 'active', 'channel' => 'online', 'access_paused' => true, 'total' => 0, 'paid_total' => 0]);
        $this->assertSame([['enrolment' => 'EN-1', 'offering' => 'Bread', 'slug' => $o->slug]], $this->learning()->library($u)['on_hold']);
    }

    public function test_lessons_open_by_drip_and_in_order_when_the_offering_asks(): void
    {
        $u = $this->person();
        $o = $this->offering(['in_order' => true]);
        $s = Section::forceCreate(['offering_id' => $o->id, 'title' => 'Part 1', 'sort_order' => 10]);
        $loose = $this->lesson($o, ['title' => 'Extra reading', 'sort_order' => 5]);   // outside any section: comes last
        $one = $this->lesson($o, ['section_id' => $s->id, 'title' => 'One', 'sort_order' => 10]);
        $opt = $this->lesson($o, ['section_id' => $s->id, 'title' => 'Optional', 'is_required' => false, 'sort_order' => 20]);
        $two = $this->lesson($o, ['section_id' => $s->id, 'title' => 'Two', 'sort_order' => 30]);
        $later = $this->lesson($o, ['section_id' => $s->id, 'title' => 'Week 2', 'drip_days' => 7, 'sort_order' => 40]);
        $this->give($u, $o);
        $this->assertSame([$one->id, $opt->id, $two->id, $later->id, $loose->id], $this->learning()->sequence($o)->pluck('id')->all());
        $p = $this->learning()->player($u, $o);
        $rows = collect($p['sections'][0]['lessons'])->keyBy('title');
        $this->assertSame([false, null], [$rows['One']['locked'], $rows['One']['lock_reason']]);
        $this->assertSame([true, 'order', 'One'], [$rows['Two']['locked'], $rows['Two']['lock_reason'], $rows['Two']['after']]);
        $this->assertArrayNotHasKey('body', $rows['Two']);
        $this->assertSame([true, 'drip', '2026-10-19'], [$rows['Week 2']['locked'], $rows['Week 2']['lock_reason'], substr($rows['Week 2']['opens_at'], 0, 10)]);
        $this->assertSame($one->id, $p['resume_lesson_id']);
        $this->fails(fn () => $this->learning()->mark($u, $two, 'done'), 'Finish "One" first');
        $this->learning()->mark($u, $one, 'done');
        $this->assertSame('done', $this->learning()->mark($u, $two, 'done')['status']);   // the optional one is not needed first
        $this->fails(fn () => $this->learning()->mark($u, $later, 'started'), 'not open to you yet');
        $this->at('2026-10-19 12:00');
        $this->learning()->mark($u, $later, 'done');
        $this->learning()->mark($u, $loose, 'done');
        $o->update(['in_order' => false]);
        $v = $this->person('V');
        $this->give($v, $o);
        $this->assertSame('started', $this->learning()->mark($v, $two, 'started')['status']);   // any order now
    }

    public function test_progress_counts_required_lessons_and_done_stays_done(): void
    {
        $u = $this->person();
        $o = $this->offering();
        $a = $this->lesson($o);
        $b = $this->lesson($o);
        $c = $this->lesson($o);
        $this->lesson($o, ['is_required' => false]);
        $this->give($u, $o);
        $this->fails(fn () => $this->learning()->mark($u, $a, 'finished'), 'started or done');
        $this->fails(fn () => $this->learning()->mark($u, $a, 'started', -1), 'not valid');
        $this->fails(fn () => $this->learning()->mark($u, $a, 'started', 864001), 'not valid');
        $r = $this->learning()->mark($u, $a, 'started', 864000);
        $this->assertSame(['started', 0, false], [$r['status'], $r['progress']['percent'], $r['completed']]);
        $this->assertSame(864000, Progress::where('user_id', $u->id)->where('lesson_id', $a->id)->value('position_seconds'));
        $this->assertSame(0, $this->learning()->mark($u, $a, 'started', 0)['progress']['done']);
        $this->assertSame(33, $this->learning()->mark($u, $a, 'done')['progress']['percent']);
        $this->assertSame('done', $this->learning()->mark($u, $a, 'started', 5)['status']);   // done stays done
        $this->learning()->mark($u, $b, 'done');
        $this->assertSame(['done' => 2, 'total' => 3, 'percent' => 66], $this->learning()->percent($u->id, $o));
        $this->learning()->mark($u, $c, 'done');
        $this->assertSame(100, $this->learning()->percent($u->id, $o)['percent']);
        $this->assertSame(['done' => 0, 'total' => 0, 'percent' => 0], $this->learning()->percent($u->id, $this->offering()));
        $stranger = $this->person('S');
        $this->fails(fn () => $this->learning()->mark($stranger, $a, 'started'), 'not open to you yet');
        $quiz = $this->lesson($o, ['kind' => 'quiz']);
        $this->fails(fn () => $this->learning()->mark($u, $quiz, 'done'), 'Pass the quiz');
    }

    public function test_finishing_every_required_lesson_completes_a_fully_paid_enrolment_only(): void
    {
        $o = $this->offering();
        $a = $this->lesson($o);
        $paid = $this->person('Paid');
        $owing = $this->person('Owing');
        $granted = $this->person('Granted');
        $e1 = Enrolment::forceCreate(['number' => 'EN-1', 'offering_id' => $o->id, 'student_user_id' => $paid->id, 'status' => 'active', 'channel' => 'online', 'total' => 100, 'paid_total' => 100]);
        $e2 = Enrolment::forceCreate(['number' => 'EN-2', 'offering_id' => $o->id, 'student_user_id' => $owing->id, 'status' => 'active', 'channel' => 'online', 'total' => 100, 'paid_total' => 99.99]);
        foreach ([$paid, $owing, $granted] as $u) {
            $this->give($u, $o);
        }
        $this->assertTrue($this->learning()->mark($paid, $a, 'done')['completed']);
        $this->assertSame('completed', $e1->fresh()->status);
        $this->assertFalse($this->learning()->mark($owing, $a, 'done')['completed']);
        $this->assertSame('active', $e2->fresh()->status);
        $this->assertFalse($this->learning()->mark($granted, $a, 'done')['completed']);   // nothing to complete
        $this->assertFalse($this->learning()->tryComplete($paid, $this->offering()));   // no lessons, no attendance asked: nothing to finish
    }

    public function test_a_quiz_passed_finishes_its_lesson(): void
    {
        $o = $this->offering();
        $q = $this->lesson($o, ['kind' => 'quiz']);
        $u = $this->person();
        $e = Enrolment::forceCreate(['number' => 'EN-1', 'offering_id' => $o->id, 'student_user_id' => $u->id, 'status' => 'active', 'channel' => 'online', 'total' => 0, 'paid_total' => 0]);
        $this->learning()->finishLesson($u, $q);
        $this->learning()->finishLesson($u, $q);
        $p = Progress::where('user_id', $u->id)->sole();
        $this->assertSame(['done', $o->id], [$p->status, (int) $p->offering_id]);
        $this->assertSame('completed', $e->fresh()->status);
    }

    public function test_the_player_needs_access_and_resumes_where_i_left_off(): void
    {
        $o = $this->offering(['certificate' => true]);
        $a = $this->lesson($o, ['title' => 'A']);
        $b = $this->lesson($o, ['title' => 'B']);
        $c = $this->lesson($o, ['title' => 'C']);
        $u = $this->person();
        $this->fails(fn () => $this->learning()->player($u, $o), 'do not have access');
        $this->give($u, $o, Carbon::parse('2026-10-20 12:00', 'Africa/Nairobi'));
        $this->assertSame($a->id, $this->learning()->player($u, $o)['resume_lesson_id']);
        $this->learning()->mark($u, $a, 'done');
        $this->at('2026-10-12 13:00');
        $this->learning()->mark($u, $c, 'started', 40);
        $p = $this->learning()->player($u, $o);
        $this->assertSame([$c->id, 8, false], [$p['resume_lesson_id'], $p['access']['days_left'], $p['access']['staff_preview']]);
        $this->assertSame(['done', 'none', 'started'], array_column($p['loose'], 'status'));
        $this->assertSame(40, $p['loose'][2]['position_seconds']);
        $this->learning()->mark($u, $c, 'done');
        $this->assertSame($b->id, $this->learning()->player($u, $o)['resume_lesson_id']);   // the last one touched is done: the first not done
        $mgr = $this->staff('Manager', ['courses.manage']);
        $this->assertTrue($this->learning()->player($mgr, $o)['access']['staff_preview']);
        Sanctum::actingAs($u, ['*']);
        $this->getJson("/api/courses/my/offerings/{$o->slug}")->assertOk()->assertJsonPath('offering.id', $o->id);
        $this->getJson('/api/courses/my/offerings/'.$this->offering()->slug)->assertStatus(422);
        $this->postJson("/api/courses/my/lessons/{$b->id}/progress", ['status' => 'done'])->assertOk()->assertJsonPath('progress.percent', 100);
        $this->postJson("/api/courses/my/lessons/{$b->id}/progress", ['status' => 'skipped'])->assertStatus(422);
        $theirs = $this->lesson($this->offering());
        $this->postJson("/api/courses/my/lessons/{$theirs->id}/progress", ['status' => 'done'])->assertStatus(422);
    }

    public function test_a_calendar_file_carries_the_course_page_never_the_join_link(): void
    {
        config(['app.frontend_url' => 'https://shop.example/']);
        $o = $this->offering(['title' => 'Bread; with, salt']);
        $l = $this->live($o, '2026-10-20 18:00', '2026-10-20 19:30');
        $u = $this->person();
        $this->fails(fn () => $this->learning()->ics($u, $l), 'do not have access');
        $this->give($u, $o);
        $ics = $this->learning()->ics($u, $l);
        $this->assertStringContainsString("DTSTART:20261020T150000Z\r\n", $ics);
        $this->assertStringContainsString("DTEND:20261020T163000Z\r\n", $ics);
        $this->assertStringContainsString('SUMMARY:Bread\; with\, salt', $ics);
        $this->assertStringContainsString('URL:https://shop.example/learn/my/'.$o->slug, $ics);
        $this->assertStringNotContainsString('zoom.us', $ics);
        $this->assertStringEndsWith("END:VCALENDAR\r\n", $ics);
        Sanctum::actingAs($u, ['*']);
        $r = $this->get("/api/courses/my/live/{$l->id}/ics")->assertOk();
        $this->assertStringStartsWith('text/calendar', $r->headers->get('Content-Type'));
        Sanctum::actingAs($this->person('Other'), ['*']);
        $this->get("/api/courses/my/live/{$l->id}/ics")->assertStatus(422);
    }

    public function test_live_reminders_go_a_day_before_and_within_the_hour_once_each_to_people_with_access(): void
    {
        $o = $this->offering(['title' => 'Bread']);
        $l = $this->live($o, '2026-10-13 10:00', '2026-10-13 11:00');
        $draft = $this->offering(['status' => 'draft']);
        $this->live($draft, '2026-10-13 10:00', '2026-10-13 11:00');
        $u = $this->person('A');
        $v = $this->person('B');
        $gone = $this->person('C');
        $this->give($u, $o);
        $this->give($v, $o);
        $this->give($gone, $o, Carbon::parse('2026-10-12 13:00', 'Africa/Nairobi'));
        app(CourseAccess::class)->revoke('staff', 'nothing');
        $this->give($this->person('D'), $draft);
        $run = fn (string $at) => app(LiveReminders::class)->run(Carbon::parse($at, 'Africa/Nairobi'));
        $this->assertSame(0, $run('2026-10-12 09:59'));   // more than a day ahead
        $this->assertSame(2, $run('2026-10-12 14:00'));   // a day before (C's access has ended)
        $this->assertSame(['course_live_soon'], $this->sentTo($u->id));
        $this->assertSame([], $this->sentTo($gone->id));
        $this->assertSame(0, $run('2026-10-12 20:00'));
        $this->assertSame(0, $run('2026-10-13 08:54'));   // 66 minutes ahead: not yet
        $this->assertSame(2, $run('2026-10-13 08:55'));
        $this->assertStringContainsString('within the hour', collect($this->sent)->where('to', $u->id)->last()['title']);
        $this->assertSame(0, $run('2026-10-13 09:30'));
        $this->assertSame(0, $run('2026-10-13 10:00'));   // started: nothing more
        $late = $this->live($o, '2026-10-14 10:30', '2026-10-14 11:00');
        $this->assertSame(2, $run('2026-10-14 10:00'));   // first seen within the hour: the hour reminder only
        $this->assertNotNull($late->fresh()->reminded_day_at);
        $this->assertSame(0, $run('2026-10-14 10:05'));
        $this->assertSame($l->id, LiveSession::whereNotNull('reminded_hour_at')->orderBy('id')->value('id'));
    }
}
