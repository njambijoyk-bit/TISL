<?php

namespace Tests\Feature;

use App\Models\Courses\Access;
use App\Models\Courses\CourseFile;
use App\Models\Courses\Lesson;
use App\Models\Courses\LiveSession;
use App\Models\Courses\Offering;
use App\Models\Courses\Section;
use App\Services\Books\BooksException;
use App\Services\Courses\CourseAccess;
use App\Services\Courses\CourseFiles;
use App\Services\Courses\CourseSettings;
use App\Services\Courses\Curriculum;
use App\Services\Courses\LiveLinks;
use App\Services\Courses\OfferingEditor;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Route;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\URL;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/** Courses step 1: offerings, their sections and lessons, live sessions, private files, who may open what, and the settings. "Now" is Monday 12 Oct 2026, 12:00. */
class CoursesFoundationTest extends TestCase
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

    private function editor(): OfferingEditor
    {
        return app(OfferingEditor::class);
    }

    private function cur(): Curriculum
    {
        return app(Curriculum::class);
    }

    private function access(): CourseAccess
    {
        return app(CourseAccess::class);
    }

    // ── offerings ────────────────────────────────────────────────────────

    public function test_an_offering_is_saved_as_a_draft_with_a_slug_and_tidy_fields(): void
    {
        $t = $this->person('Teacher', false);
        $o = $this->editor()->save(['title' => 'Sourdough Basics', 'kind' => 'course', 'skill_level' => 'beginner', 'summary' => '  Learn it ', 'body' => '', 'category' => 'Baking', 'tags' => 'bread, ,  sourdough,bread',
            'instructor_user_id' => $t->id, 'access_days' => 90, 'min_attendance_pct' => 75, 'free_preview' => 1, 'certificate' => true, 'in_order' => 1, 'cert_valid_months' => 12, 'credit_cost' => 3], null, 5);
        $this->assertSame('draft', $o->status);
        $this->assertSame('sourdough-basics', $o->slug);
        $this->assertSame('Learn it', $o->summary);
        $this->assertNull($o->body);
        $this->assertSame(['bread', 'sourdough'], $o->tags);
        $this->assertSame($t->id, (int) $o->instructor_user_id);
        $this->assertSame(90, $o->access_days);
        $this->assertSame(75, $o->min_attendance_pct);
        $this->assertTrue($o->free_preview);
        $this->assertTrue($o->certificate);
        $this->assertTrue((bool) $o->in_order);
        $this->assertSame(12, (int) $o->cert_valid_months);
        $this->assertSame(3, (int) $o->credit_cost);
        $this->assertSame(5, (int) $o->created_by);
        $this->assertSame('paid', $o->grant_on);
        $this->assertSame(30, (int) $o->instalment_days);
        $this->assertSame(7, (int) $o->grace_days);
        $o = $this->editor()->save(['title' => 'Sourdough Advanced', 'tags' => ['a', 'b'], 'credit_cost' => '', 'cert_valid_months' => null], $o);
        $this->assertSame('sourdough-basics', $o->slug);   // the address does not move
        $this->assertSame(['a', 'b'], $o->tags);
        $this->assertNull($o->credit_cost);
        $this->assertNull($o->cert_valid_months);
        $this->assertSame('Learn it', $o->summary);   // what was not sent stays
    }

    public function test_slugs_are_unique_and_never_a_word_the_site_uses(): void
    {
        $this->assertSame('bread', $this->editor()->save(['title' => 'Bread'])->slug);
        $this->assertSame('bread-2', $this->editor()->save(['title' => 'Bread'])->slug);
        $this->assertSame('my-2', $this->editor()->save(['title' => 'My'])->slug);
        $this->assertSame('books-2', $this->editor()->save(['title' => 'Books'])->slug);
        $this->assertSame('verify-2', $this->editor()->save(['title' => 'Verify'])->slug);
        $this->assertSame('offering', $this->editor()->save(['title' => '???'])->slug);
    }

    public function test_an_offering_is_checked(): void
    {
        $this->fails(fn () => $this->editor()->save(['title' => 'X', 'kind' => 'webinar']), 'course, recipe, notes');
        $this->fails(fn () => $this->editor()->save(['title' => ' ']), 'title of up to 160');
        $this->fails(fn () => $this->editor()->save(['title' => str_repeat('x', 161)]), 'title of up to 160');
        $this->fails(fn () => $this->editor()->save(['title' => 'X', 'skill_level' => 'guru']), 'level');
        $this->fails(fn () => $this->editor()->save(['title' => 'X', 'delivery' => 'post']), 'online, in person');
        $this->fails(fn () => $this->editor()->save(['title' => 'X', 'delivery' => 'in_person']), 'branch');
        $this->fails(fn () => $this->editor()->save(['title' => 'X', 'delivery' => 'hybrid', 'location_id' => 99]), 'branch does not exist');
        $this->assertSame(2, (int) $this->editor()->save(['title' => 'X', 'delivery' => 'in_person', 'location_id' => 2])->location_id);
        $this->assertNull($this->editor()->save(['title' => 'X', 'delivery' => 'online', 'location_id' => 2])->location_id);   // online has no branch
        $this->fails(fn () => $this->editor()->save(['title' => 'X', 'instructor_user_id' => 999]), 'teacher does not exist');
        $this->fails(fn () => $this->editor()->save(['title' => 'X', 'access_days' => 0]), '1 and 3650');
        $this->fails(fn () => $this->editor()->save(['title' => 'X', 'access_days' => 3651]), '1 and 3650');
        $this->fails(fn () => $this->editor()->save(['title' => 'X', 'min_attendance_pct' => 101]), '1 and 100 percent');
        $this->fails(fn () => $this->editor()->save(['title' => 'X', 'min_attendance_pct' => 0]), '1 and 100 percent');
        $this->fails(fn () => $this->editor()->save(['title' => 'X', 'tags' => range(1, 11)]), 'at most 10 tags');
        $this->fails(fn () => $this->editor()->save(['title' => 'X', 'cert_valid_months' => 601]), '1 to 600 months');
        $this->fails(fn () => $this->editor()->save(['title' => 'X', 'credit_cost' => 0]), '1 to 1000 credits');
        $this->fails(fn () => $this->editor()->save(['title' => 'X', 'credit_cost' => 1001]), '1 to 1000 credits');
        $edge = $this->editor()->save(['title' => str_repeat('x', 160), 'access_days' => 3650, 'min_attendance_pct' => 100, 'tags' => range(1, 10), 'cert_valid_months' => 600, 'credit_cost' => 1000, 'instalments' => 24, 'capacity' => 5000]);
        $this->assertSame([160, 3650, 100, 10, 600, 1000, 24, 5000], [mb_strlen($edge->title), (int) $edge->access_days, (int) $edge->min_attendance_pct, count($edge->tags), (int) $edge->cert_valid_months, (int) $edge->credit_cost, (int) $edge->instalments, (int) $edge->capacity]);
        $low = $this->editor()->save(['access_days' => 1, 'min_attendance_pct' => 1, 'cert_valid_months' => 1, 'credit_cost' => 1, 'instalments' => 1, 'capacity' => 1], $edge);
        $this->assertSame([1, 1, 1, 1, 1, 1], [(int) $low->access_days, (int) $low->min_attendance_pct, (int) $low->cert_valid_months, (int) $low->credit_cost, (int) $low->instalments, (int) $low->capacity]);
        $none = $this->editor()->save(['access_days' => '', 'min_attendance_pct' => '', 'cert_valid_months' => '', 'credit_cost' => ''], $low);
        $this->assertSame([null, null, null, null], [$none->access_days, $none->min_attendance_pct, $none->cert_valid_months, $none->credit_cost]);
        $o = $this->editor()->save(['title' => 'X']);
        $this->lesson($o);
        $this->fails(fn () => $this->editor()->save(['kind' => 'recipe'], $o), 'kind can not be changed');
        $this->assertSame('course', $this->editor()->save(['kind' => 'course', 'title' => 'Y'], $o)->kind);
    }

    public function test_an_offering_saves_before_the_later_scripts_are_run(): void
    {
        Schema::table('course_offerings', function ($t) { $t->dropColumn(['in_order', 'capacity']); });
        $o = $this->editor()->save(['title' => 'Old', 'in_order' => true, 'free_preview' => true, 'certificate' => true, 'capacity' => 5]);
        $this->assertSame([true, true], [(bool) $o->free_preview, (bool) $o->certificate]);
        $this->assertArrayNotHasKey('in_order', $o->getAttributes());
    }

    public function test_the_payment_plan_and_places_are_checked(): void
    {
        $o = $this->editor()->save(['title' => 'X', 'deposit_pct' => 30, 'instalments' => 3, 'instalment_days' => 14, 'grant_on' => 'deposit', 'grace_days' => 0, 'refund_days' => 10, 'capacity' => 20]);
        $this->assertEquals(30, $o->deposit_pct);
        $this->assertSame([3, 14, 'deposit', 0, 10, 20], [(int) $o->instalments, (int) $o->instalment_days, $o->grant_on, (int) $o->grace_days, (int) $o->refund_days, (int) $o->capacity]);
        $this->assertNull($this->editor()->save(['deposit_pct' => 0, 'grant_on' => 'paid'], $o)->deposit_pct);   // no deposit is the same as none
        $this->fails(fn () => $this->editor()->save(['deposit_pct' => 100], $o), 'between 0 and 100 percent');
        $this->fails(fn () => $this->editor()->save(['grant_on' => 'never'], $o), 'paid in full or at the deposit');
        $this->fails(fn () => $this->editor()->save(['grant_on' => 'deposit', 'deposit_pct' => null, 'instalments' => 1], $o), 'needs a deposit or instalments');
        $this->assertSame('deposit', $this->editor()->save(['grant_on' => 'deposit', 'deposit_pct' => null, 'instalments' => 2], $o)->grant_on);
        $this->fails(fn () => $this->editor()->save(['instalments' => 25], $o), 'The number of instalments is between 1 and 24');
        $this->fails(fn () => $this->editor()->save(['instalments' => 'x', 'grant_on' => 'paid'], $o), 'between 1 and 24');
        $this->fails(fn () => $this->editor()->save(['instalment_days' => 0], $o), 'between 1 and 365');
        $this->fails(fn () => $this->editor()->save(['instalment_days' => ''], $o), 'Give the days between payments');
        $this->fails(fn () => $this->editor()->save(['grace_days' => 61], $o), 'between 0 and 60');
        $this->fails(fn () => $this->editor()->save(['refund_days' => 3651], $o), 'between 0 and 3650');
        $this->fails(fn () => $this->editor()->save(['capacity' => 0], $o), 'between 1 and 5000');
        $this->assertNull($this->editor()->save(['capacity' => ''], $o)->capacity);
    }

    public function test_publishing_needs_something_to_show(): void
    {
        $course = $this->editor()->save(['title' => 'Empty']);
        $this->fails(fn () => $this->editor()->publish($course), 'at least one lesson');
        $recipe = $this->editor()->save(['title' => 'Chapati', 'kind' => 'recipe', 'body' => 'Flour, water.']);
        $this->assertSame('published', $this->editor()->publish($recipe)->status);   // a recipe with its text needs no lesson
        $this->fails(fn () => $this->editor()->publish($recipe->fresh()), 'published already');
        $live = $this->editor()->save(['title' => 'Live', 'kind' => 'live']);
        $this->lesson($live);
        $this->fails(fn () => $this->editor()->publish($live), 'Add the live session');
        LiveSession::forceCreate(['offering_id' => $live->id, 'starts_at' => '2026-10-20 10:00', 'ends_at' => '2026-10-20 11:00']);
        $this->assertSame('published', $this->editor()->publish($live)->status);
        $o = $this->editor()->unpublish($live->fresh());
        $this->assertSame('draft', $o->status);
        $this->fails(fn () => $this->editor()->unpublish($o), 'not published');
        $this->assertSame('archived', $this->editor()->archive($o)->status);
        $this->fails(fn () => $this->editor()->archive($o->fresh()), 'archived already');
        $this->assertSame('draft', $this->editor()->restore($o->fresh())->status);
        $this->fails(fn () => $this->editor()->restore($o->fresh()), 'not archived');
    }

    public function test_only_an_offering_nobody_had_is_deleted_with_everything_in_it(): void
    {
        $o = $this->offering();
        $s = $this->cur()->saveSection($o, ['title' => 'Part one']);
        $f = app(CourseFiles::class)->store(UploadedFile::fake()->create('notes.pdf', 10), $o->id, null);
        $l = $this->cur()->saveLesson($o, ['kind' => 'file', 'title' => 'Notes', 'file_id' => $f->id, 'section_id' => $s->id]);
        $u = $this->person();
        $this->access()->grant($u->id, $o->id, 'staff');
        $this->fails(fn () => $this->editor()->delete($o), 'archive it instead');
        Access::query()->delete();
        $this->editor()->delete($o);
        $this->assertNull(Offering::find($o->id));
        $this->assertNull(Lesson::find($l->id));
        $this->assertNull(Section::find($s->id));
        $this->assertNull(CourseFile::find($f->id));
        Storage::disk('local')->assertMissing($f->path);
    }

    // ── sections and lessons ─────────────────────────────────────────────

    public function test_sections_are_added_in_order_renamed_and_removed_keeping_their_lessons(): void
    {
        $o = $this->offering();
        $a = $this->cur()->saveSection($o, ['title' => ' One ']);
        $b = $this->cur()->saveSection($o, ['title' => 'Two']);
        $this->assertSame('One', $a->title);
        $this->assertSame([10, 20], [$a->sort_order, $b->sort_order]);
        $this->assertSame('Uno', $this->cur()->saveSection($o, ['title' => 'Uno'], $a)->title);
        $this->fails(fn () => $this->cur()->saveSection($o, ['title' => '']), 'title of up to 160');
        $other = $this->offering();
        $this->fails(fn () => $this->cur()->saveSection($other, ['title' => 'Hack'], $a), 'another offering');
        $this->fails(fn () => $this->cur()->deleteSection($other, $a), 'another offering');
        $l = $this->lesson($o, ['section_id' => $a->id]);
        $this->cur()->deleteSection($o, $a);
        $this->assertNull(Section::find($a->id));
        $this->assertNull($l->fresh()->section_id);
    }

    public function test_lessons_of_each_kind_are_checked(): void
    {
        $o = $this->offering();
        $this->fails(fn () => $this->cur()->saveLesson($o, ['kind' => 'podcast', 'title' => 'X']), 'what kind of lesson');
        $this->fails(fn () => $this->cur()->saveLesson($o, ['kind' => 'text', 'title' => '']), 'title of up to 160');
        $this->fails(fn () => $this->cur()->saveLesson($o, ['kind' => 'video', 'title' => 'V']), 'address of the video');
        $this->fails(fn () => $this->cur()->saveLesson($o, ['kind' => 'video', 'title' => 'V', 'video_url' => 'http://youtube.com/x']), 'starting with https://');
        $this->fails(fn () => $this->cur()->saveLesson($o, ['kind' => 'video', 'title' => 'V', 'video_url' => 'javascript:alert(1)']), 'starting with https://');
        $v = $this->cur()->saveLesson($o, ['kind' => 'video', 'title' => 'V', 'video_url' => ' https://youtu.be/abc ', 'duration_minutes' => 12, 'drip_days' => 3, 'is_preview' => 1, 'is_required' => 0]);
        $this->assertSame('https://youtu.be/abc', $v->video_url);
        $this->assertSame([12, 3, true, false], [$v->duration_minutes, $v->drip_days, $v->is_preview, $v->is_required]);
        $this->fails(fn () => $this->cur()->saveLesson($o, ['kind' => 'text', 'title' => 'T', 'duration_minutes' => 0]), '1 to 1440 minutes');
        $this->fails(fn () => $this->cur()->saveLesson($o, ['kind' => 'text', 'title' => 'T', 'duration_minutes' => 1441]), '1 to 1440 minutes');
        $this->fails(fn () => $this->cur()->saveLesson($o, ['kind' => 'text', 'title' => 'T', 'drip_days' => 3651]), '0 to 3650 days');
        $this->fails(fn () => $this->cur()->saveLesson($o, ['kind' => 'file', 'title' => 'F']), "this offering's files");
        $theirs = CourseFile::forceCreate(['offering_id' => $this->offering()->id, 'name' => 'x.pdf', 'path' => 'p']);
        $this->fails(fn () => $this->cur()->saveLesson($o, ['kind' => 'file', 'title' => 'F', 'file_id' => $theirs->id]), "this offering's files");
        $book = CourseFile::forceCreate(['offering_id' => null, 'name' => 'paid-book.pdf', 'path' => 'q']);   // a file of no offering is a book's
        $this->fails(fn () => $this->cur()->saveLesson($o, ['kind' => 'file', 'title' => 'F', 'file_id' => $book->id]), "this offering's files");
        $this->assertNull($book->fresh()->offering_id);
        $loose = CourseFile::forceCreate(['offering_id' => $o->id, 'name' => 'y.pdf', 'path' => 'q']);
        $this->cur()->saveLesson($o, ['kind' => 'file', 'title' => 'F', 'file_id' => $loose->id]);
        $t = $this->cur()->saveLesson($o, ['kind' => 'text', 'title' => 'T', 'body' => '  Words  ', 'video_url' => 'https://vimeo.com/1', 'file_id' => $loose->id]);
        $this->assertSame('Words', $t->body);
        $this->assertSame($loose->id, (int) $t->file_id);
        $this->assertTrue($t->is_required);   // required unless told otherwise
        $live = $this->cur()->saveLesson($o, ['kind' => 'live', 'title' => 'Live', 'video_url' => 'https://vimeo.com/1', 'file_id' => $loose->id, 'live' => ['starts_at' => '2026-10-20 18:00', 'ends_at' => '2026-10-20 19:30', 'join_url' => 'https://us02web.zoom.us/j/123']]);
        $this->assertNull($live->video_url);
        $this->assertNull($live->file_id);
        $this->fails(fn () => $this->cur()->saveLesson($o, ['kind' => 'text', 'title' => 'T', 'section_id' => Section::forceCreate(['offering_id' => $this->offering()->id, 'title' => 'Theirs'])->id]), 'not part of this offering');
        $this->fails(fn () => $this->cur()->saveLesson($this->offering(), ['title' => 'Steal'], $t), 'another offering');
        $this->assertSame([10, 20, 30, 40], Lesson::where('offering_id', $o->id)->orderBy('id')->pluck('sort_order')->all());   // each new lesson goes last
    }

    public function test_lesson_and_session_limits_are_inclusive(): void
    {
        $o = $this->offering();
        $this->assertSame(160, mb_strlen($this->cur()->saveSection($o, ['title' => str_repeat('s', 160)])->title));
        $this->fails(fn () => $this->cur()->saveSection($o, ['title' => str_repeat('s', 161)]), 'up to 160');
        $url = 'https://example.com/'.str_repeat('a', 480);   // 500 letters
        $l = $this->cur()->saveLesson($o, ['kind' => 'video', 'title' => str_repeat('t', 160), 'video_url' => $url, 'duration_minutes' => 1440, 'drip_days' => 3650]);
        $this->assertSame([160, 500, 1440, 3650], [mb_strlen($l->title), mb_strlen($l->video_url), $l->duration_minutes, $l->drip_days]);
        $this->fails(fn () => $this->cur()->saveLesson($o, ['kind' => 'video', 'title' => 'V', 'video_url' => $url.'a']), 'starting with https://');
        $l = $this->cur()->saveLesson($o, ['duration_minutes' => 1, 'drip_days' => 0], $l);
        $this->assertSame([1, 0], [$l->duration_minutes, $l->drip_days]);
        $l = $this->cur()->saveLesson($o, ['kind' => 'text', 'video_url' => '', 'duration_minutes' => '', 'drip_days' => ''], $l);   // emptied
        $this->assertSame([null, null, null], [$l->video_url, $l->duration_minutes, $l->drip_days]);
        $base = ['kind' => 'live', 'title' => 'Live'];
        $this->fails(fn () => $this->cur()->saveLesson($o, $base + ['live' => ['starts_at' => '2026-10-20 18:00']]), 'start and end time');
        $this->fails(fn () => $this->cur()->saveLesson($o, $base + ['live' => ['ends_at' => '2026-10-20 18:00']]), 'start and end time');
        $live = $this->cur()->saveLesson($o, $base + ['live' => ['starts_at' => '2026-10-20 06:00', 'ends_at' => '2026-10-20 18:00', 'capacity' => 5000]]);   // exactly 12 hours
        $this->assertSame(5000, LiveSession::where('lesson_id', $live->id)->value('capacity'));
        $this->cur()->saveLesson($o, ['live' => ['capacity' => 1]], $live);
        $this->assertSame(1, LiveSession::where('lesson_id', $live->id)->value('capacity'));
        $this->cur()->saveLesson($o, ['live' => ['capacity' => '']], $live);
        $this->assertNull(LiveSession::where('lesson_id', $live->id)->value('capacity'));
        $this->fails(fn () => $this->cur()->saveLesson($o, ['live' => ['capacity' => 5001]], $live), 'between 1 and 5000');
    }

    public function test_a_quiz_lesson_has_its_quiz_which_stays_once_someone_has_taken_it(): void
    {
        $o = $this->offering();
        $q = $this->cur()->saveLesson($o, ['kind' => 'quiz', 'title' => 'Check']);
        $quiz = \App\Models\Courses\Quiz::where('lesson_id', $q->id)->sole();
        $this->assertSame($o->id, (int) $quiz->offering_id);
        $this->cur()->saveLesson($o, ['title' => 'Check again'], $q);
        $this->assertSame(1, \App\Models\Courses\Quiz::count());   // the same quiz
        DB::table('course_questions')->insert(['quiz_id' => $quiz->id, 'kind' => 'truefalse', 'body' => 'Bread rises?', 'correct' => '["true"]']);
        $other = $this->cur()->saveLesson($o, ['kind' => 'text', 'title' => 'Words']);
        $this->assertSame(1, \App\Models\Courses\Quiz::count());   // a text lesson makes none
        $this->cur()->saveLesson($o, ['kind' => 'text'], $q);   // nobody took it: it goes, with its questions
        $this->assertSame([0, 0], [\App\Models\Courses\Quiz::count(), DB::table('course_questions')->count()]);
        $q2 = $this->cur()->saveLesson($o, ['kind' => 'quiz', 'title' => 'Final']);
        $quiz2 = \App\Models\Courses\Quiz::where('lesson_id', $q2->id)->sole();
        DB::table('course_attempts')->insert(['quiz_id' => $quiz2->id, 'offering_id' => $o->id, 'user_id' => $this->person()->id, 'started_at' => now()]);
        $this->fails(fn () => $this->cur()->saveLesson($o, ['kind' => 'text'], $q2), 'its lesson stays a quiz');
        $this->fails(fn () => $this->cur()->deleteLesson($o, $q2), 'can not be removed');
        $this->assertSame('Final!', $this->cur()->saveLesson($o, ['title' => 'Final!'], $q2)->title);   // still a quiz: may be renamed
        $q3 = $this->cur()->saveLesson($o, ['kind' => 'quiz', 'title' => 'Spare']);
        $this->cur()->deleteLesson($o, $q3);
        $this->assertSame([$quiz2->id], \App\Models\Courses\Quiz::pluck('id')->all());
        $this->cur()->deleteLesson($o, $other);
    }

    public function test_a_live_lesson_keeps_one_session_with_its_link_and_time_checked(): void
    {
        $o = $this->offering();
        $base = ['kind' => 'live', 'title' => 'Live'];
        $this->fails(fn () => $this->cur()->saveLesson($o, $base), 'start and end time');
        $this->fails(fn () => $this->cur()->saveLesson($o, $base + ['live' => ['starts_at' => 'soon', 'ends_at' => 'later']]), 'start and end time');
        $this->fails(fn () => $this->cur()->saveLesson($o, $base + ['live' => ['starts_at' => '2026-10-20 18:00', 'ends_at' => '2026-10-20 18:00']]), 'end after it starts');
        $this->fails(fn () => $this->cur()->saveLesson($o, $base + ['live' => ['starts_at' => '2026-10-20 06:00', 'ends_at' => '2026-10-20 18:01']]), 'at most 12 hours');
        $this->fails(fn () => $this->cur()->saveLesson($o, $base + ['live' => ['starts_at' => '2026-10-20 18:00', 'ends_at' => '2026-10-20 19:00', 'timezone' => 'Mars/Base']]), 'time zone');
        $this->fails(fn () => $this->cur()->saveLesson($o, $base + ['live' => ['starts_at' => '2026-10-20 18:00', 'ends_at' => '2026-10-20 19:00', 'provider' => 'skype']]), 'Zoom, Google Meet');
        $this->fails(fn () => $this->cur()->saveLesson($o, $base + ['live' => ['starts_at' => '2026-10-20 18:00', 'ends_at' => '2026-10-20 19:00', 'capacity' => 0]]), 'between 1 and 5000');
        $this->fails(fn () => $this->cur()->saveLesson($o, $base + ['live' => ['starts_at' => '2026-10-20 18:00', 'ends_at' => '2026-10-20 19:00', 'join_url' => 'http://zoom.us/j/1']]), 'join link must be');
        $l = $this->cur()->saveLesson($o, $base + ['live' => ['starts_at' => '2026-10-20 08:00', 'ends_at' => '2026-10-20 09:00', 'timezone' => 'Europe/London', 'join_url' => 'https://meet.google.com/abc-defg-hij', 'meeting_id' => ' 123 ', 'passcode' => '', 'capacity' => 30]]);
        $s = LiveSession::where('lesson_id', $l->id)->sole();
        $this->assertSame('meet', $s->provider);   // found from the link
        $this->assertSame('2026-10-20 10:00', $s->starts_at->format('Y-m-d H:i'));   // 08:00 in London is 10:00 here
        $this->assertSame('Europe/London', $s->timezone);
        $this->assertSame('123', $s->meeting_id);
        $this->assertNull($s->passcode);
        $this->assertSame(30, $s->capacity);
        $this->cur()->saveLesson($o, ['live' => ['replay_url' => 'https://vimeo.com/9']], $l);   // change one thing; the rest stays
        $s = LiveSession::where('lesson_id', $l->id)->sole();
        $this->assertSame('https://vimeo.com/9', $s->replay_url);
        $this->assertSame('https://meet.google.com/abc-defg-hij', $s->join_url);
        $this->assertSame(30, $s->capacity);
        $this->cur()->saveLesson($o, ['kind' => 'text'], $l);
        $this->assertSame(0, LiveSession::count());   // no longer live: the session goes
    }

    public function test_providers_are_found_from_the_link(): void
    {
        $p = fn ($u) => app(LiveLinks::class)->providerOf($u);
        $this->assertSame('zoom', $p('https://zoom.us/j/1'));
        $this->assertSame('zoom', $p('https://us06web.zoom.us/j/1'));
        $this->assertSame('zoom', $p('https://x.zoom.com/j'));
        $this->assertSame('meet', $p('https://meet.google.com/a'));
        $this->assertSame('teams', $p('https://teams.microsoft.com/l/1'));
        $this->assertSame('teams', $p('https://teams.live.com/meet/1'));
        $this->assertSame('other', $p('https://notzoom.us/j/1'));
        $this->assertSame('other', $p('https://zoom.us.evil.com/j/1'));
        $this->assertSame('other', $p(null));
    }

    public function test_the_join_link_shows_only_near_the_class_and_the_replay_after(): void
    {
        $s = LiveSession::forceCreate(['offering_id' => 1, 'starts_at' => '2026-10-12 14:00', 'ends_at' => '2026-10-12 15:00', 'provider' => 'zoom', 'join_url' => 'https://zoom.us/j/1', 'meeting_id' => '1', 'passcode' => 'pw', 'replay_url' => 'https://vimeo.com/1', 'capacity' => 9]);
        $v = fn (string $at) => app(LiveLinks::class)->memberView($s->fresh(), Carbon::parse($at, 'Africa/Nairobi'));
        $before = $v('2026-10-12 13:29');
        $this->assertSame('upcoming', $before['state']);
        $this->assertNull($before['join_url']);
        $this->assertNull($before['passcode']);
        $this->assertNull($before['replay_url']);
        $open = $v('2026-10-12 13:30');   // 30 minutes before
        $this->assertSame(['open', 'https://zoom.us/j/1', '1', 'pw', null], [$open['state'], $open['join_url'], $open['meeting_id'], $open['passcode'], $open['replay_url']]);
        $this->assertSame('open', $v('2026-10-12 16:00')['state']);   // an hour's grace after the end
        $after = $v('2026-10-12 16:01');
        $this->assertSame(['over', null, 'https://vimeo.com/1'], [$after['state'], $after['join_url'], $after['replay_url']]);
        CourseSettings::save(['live_open_minutes' => 10, 'live_grace_minutes' => 0], null);
        $this->assertSame('upcoming', $v('2026-10-12 13:49')['state']);
        $this->assertSame('over', $v('2026-10-12 15:01')['state']);
        $public = app(LiveLinks::class)->publicView($s);
        $this->assertArrayNotHasKey('join_url', $public);
        $this->assertSame('Zoom', $public['provider_label']);
        $this->assertSame('https://zoom.us/j/1', app(LiveLinks::class)->staffView($s)['join_url']);
    }

    public function test_lessons_can_be_reordered_only_within_their_offering_and_removed(): void
    {
        $o = $this->offering();
        $s1 = $this->cur()->saveSection($o, ['title' => 'A']);
        $s2 = $this->cur()->saveSection($o, ['title' => 'B']);
        $a = $this->lesson($o);
        $b = $this->lesson($o);
        $this->cur()->reorder($o, [$s2->id, $s1->id], [['id' => $b->id, 'section_id' => $s2->id], ['id' => $a->id]]);
        $this->assertSame([10, 20], [$s2->fresh()->sort_order, $s1->fresh()->sort_order]);
        $this->assertSame([10, $s2->id], [$b->fresh()->sort_order, (int) $b->fresh()->section_id]);
        $this->assertSame([20, null], [$a->fresh()->sort_order, $a->fresh()->section_id]);
        $other = $this->offering();
        $theirs = $this->lesson($other);
        $theirSection = $this->cur()->saveSection($other, ['title' => 'X']);
        $this->fails(fn () => $this->cur()->reorder($o, [$theirSection->id], []), 'sections is not part');
        $this->fails(fn () => $this->cur()->reorder($o, [], [['id' => $theirs->id]]), 'lessons is not part');
        $this->fails(fn () => $this->cur()->reorder($o, [], [['id' => $a->id, 'section_id' => $theirSection->id]]), 'sections is not part');
        $this->fails(fn () => $this->cur()->deleteLesson($other, $a), 'another offering');
        $this->cur()->deleteLesson($o, $a);
        $this->assertNull(Lesson::find($a->id));
    }

    // ── who may open what ────────────────────────────────────────────────

    public function test_a_grant_is_one_per_source_and_ends_by_the_access_window(): void
    {
        $o = $this->offering(['access_days' => 30]);
        $u = $this->person();
        $a = $this->access()->grant($u->id, $o->id, 'invoice', ' enrolment:1 ', null, '  paid ', 9);
        $this->assertSame('enrolment:1', $a->source_ref);
        $this->assertSame('2026-11-11 12:00', $a->ends_at->timezone('Africa/Nairobi')->format('Y-m-d H:i'));
        $this->assertSame('paid', $a->note);
        $this->assertSame(9, (int) $a->granted_by);
        $again = $this->access()->grant($u->id, $o->id, 'invoice', 'enrolment:1');
        $this->assertSame($a->id, $again->id);
        $this->assertSame('paid', $again->note);   // kept when no new note
        $this->assertSame(9, (int) $again->granted_by);
        $this->assertSame(1, Access::count());
        $m = $this->access()->grant($u->id, $o->id, 'membership', 'membership:4');
        $this->assertNull($m->ends_at);   // a membership decides when its access ends
        $this->assertSame(2, Access::count());
        $o2 = $this->offering();
        $this->assertNull($this->access()->grant($u->id, $o2->id, 'staff')->ends_at);   // no window anywhere: for ever
        CourseSettings::save(['default_access_days' => 10], null);
        $this->assertSame('2026-10-22', $this->access()->grant($u->id, $o2->id, 'staff', 'x')->ends_at->toDateString());
        $this->assertSame('2026-12-01', $this->access()->grant($u->id, $o2->id, 'staff', 'y', Carbon::parse('2026-12-01'))->ends_at->toDateString());
        $this->fails(fn () => $this->access()->grant($u->id, $o->id, 'gift'), 'Choose who gives');
        $this->fails(fn () => $this->access()->grant(999, $o->id, 'staff'), 'person does not exist');
        $this->fails(fn () => $this->access()->grant($u->id, 999, 'staff'), 'offering does not exist');
        $this->fails(fn () => $this->access()->grant($u->id, $o->id, 'staff', 'z', Carbon::now()), 'end in the future');
        $this->fails(fn () => $this->access()->grant($u->id, $this->offering(['status' => 'archived'])->id, 'staff'), 'archived');
    }

    public function test_revoking_ends_a_sources_grants_and_granting_again_starts_afresh(): void
    {
        $o = $this->offering();
        $u = $this->person();
        $a = $this->access()->grant($u->id, $o->id, 'invoice', 'enrolment:1');
        $this->assertSame(1, $this->access()->revoke('invoice', 'enrolment:1'));
        $this->assertSame(0, $this->access()->revoke('invoice', 'enrolment:1'));
        $this->assertFalse($this->access()->can($u, $o));
        $this->assertSame([], $this->access()->offeringsFor('invoice', 'enrolment:1'));
        $this->at('2026-10-15 09:00');
        $b = $this->access()->grant($u->id, $o->id, 'invoice', 'enrolment:1');
        $this->assertSame($a->id, $b->id);
        $this->assertNull($b->revoked_at);
        $this->assertSame('2026-10-15 09:00', $b->starts_at->timezone('Africa/Nairobi')->format('Y-m-d H:i'));   // a fresh start (drip counts from here)
        $this->assertTrue($this->access()->can($u, $o));
        $this->assertSame([$o->id], $this->access()->offeringsFor('invoice', 'enrolment:1'));
        $b = $this->access()->revokeOne($b);
        $this->assertNotNull($b->revoked_at);
        $this->fails(fn () => $this->access()->revokeOne($b), 'ended already');
    }

    public function test_who_may_open_an_offering_and_its_lessons(): void
    {
        $teacher = $this->staff('Teacher', ['courses.teach']);
        $manager = $this->staff('Manager', ['courses.manage']);
        $o = $this->offering(['instructor_user_id' => $teacher->id, 'free_preview' => true]);
        $draft = $this->offering(['status' => 'draft', 'instructor_user_id' => $teacher->id]);
        $preview = $this->lesson($o, ['is_preview' => true]);
        $drip = $this->lesson($o, ['drip_days' => 7]);
        $plain = $this->lesson($o);
        $other = $this->staff('Other teacher', ['courses.teach']);
        $u = $this->person();
        foreach ([$teacher, $manager] as $staff) {
            $this->assertTrue($this->access()->can($staff, $o));
            $this->assertTrue($this->access()->can($staff, $draft));
            $this->assertTrue($this->access()->canLesson($staff, $draft, $plain));
        }
        $this->assertFalse($this->access()->staffMay($other, $o));
        $this->assertFalse($this->access()->staffMay(null, $o));
        $this->assertFalse($this->access()->can($other, $o));
        $this->assertFalse($this->access()->can(null, $o));
        $this->assertTrue($this->access()->canLesson(null, $o, $preview));   // a free preview is open to anyone
        $this->assertFalse($this->access()->canLesson(null, $o, $plain));
        $o->update(['free_preview' => false]);
        $this->assertFalse($this->access()->canLesson(null, $o->fresh(), $preview));
        $this->access()->grant($u->id, $o->id, 'staff');
        $this->assertTrue($this->access()->can($u, $o));
        $this->assertTrue($this->access()->canLesson($u, $o, $plain));
        $this->assertFalse($this->access()->canLesson($u, $o, $drip));   // opens 7 days after access began
        $this->assertTrue($this->access()->canLesson($u, $o, $drip, Carbon::parse('2026-10-19 12:00', 'Africa/Nairobi')));
        $o->update(['status' => 'archived']);
        $this->assertTrue($this->access()->can($u, $o->fresh()));   // people who have it keep it
        $o->update(['status' => 'draft']);
        $this->assertFalse($this->access()->can($u, $o->fresh()));
        $this->assertFalse($this->access()->canLesson($u, $o->fresh(), $plain));
        $this->assertFalse($this->access()->canLesson($u, $o->fresh(), $preview));
    }

    public function test_access_that_has_ended_or_not_begun_does_not_open(): void
    {
        $o = $this->offering();
        $u = $this->person();
        Access::forceCreate(['user_id' => $u->id, 'offering_id' => $o->id, 'source' => 'staff', 'source_ref' => 'a', 'starts_at' => '2026-10-01 00:00', 'ends_at' => '2026-10-12 11:59']);
        Access::forceCreate(['user_id' => $u->id, 'offering_id' => $o->id, 'source' => 'staff', 'source_ref' => 'b', 'starts_at' => '2026-10-13 00:00', 'ends_at' => null]);
        $this->assertFalse($this->access()->can($u, $o));
        $this->assertNotNull($this->access()->active($u->id, $o->id, Carbon::parse('2026-10-13 00:00', 'Africa/Nairobi')));
        $this->assertSame('b', $this->access()->active($u->id, $o->id, Carbon::parse('2026-10-14'))->source_ref);
        Access::forceCreate(['user_id' => $u->id, 'offering_id' => $o->id, 'source' => 'staff', 'source_ref' => 'c', 'starts_at' => '2026-10-01 00:00', 'ends_at' => '2027-01-01 00:00']);
        $this->assertSame('b', $this->access()->active($u->id, $o->id, Carbon::parse('2026-10-14'))->source_ref);   // the one that never ends wins
    }

    // ── files ────────────────────────────────────────────────────────────

    public function test_files_are_kept_privately_with_a_clean_name_and_only_safe_kinds(): void
    {
        $o = $this->offering();
        $f = app(CourseFiles::class)->store(UploadedFile::fake()->create('../../My "notes":v1.pdf', 20, 'application/pdf'), $o->id, 3);
        $this->assertSame('My _notes_v1.pdf', $f->name);
        $this->assertStringStartsWith('courses/files/', $f->path);
        $this->assertStringEndsWith('.pdf', $f->path);
        Storage::disk('local')->assertExists($f->path);
        $this->assertSame(20 * 1024, (int) $f->size_bytes);
        $this->assertSame(64, strlen($f->sha256));
        $this->assertSame(3, (int) $f->uploaded_by);
        foreach (['virus.exe', 'run.php', 'page.html', 'script.js', 'x.svg'] as $bad) {
            $this->fails(fn () => app(CourseFiles::class)->store(UploadedFile::fake()->create($bad, 1), $o->id, null), 'not allowed');
        }
        CourseSettings::save(['max_file_mb' => 1], null);
        $this->fails(fn () => app(CourseFiles::class)->store(UploadedFile::fake()->create('big.pdf', 1025), $o->id, null), 'at most 1 MB');
        app(CourseFiles::class)->store(UploadedFile::fake()->create('ok.PDF', 1024), $o->id, null);
        $broken = UploadedFile::fake()->create('cut.pdf', 5);
        $half = new UploadedFile($broken->getRealPath(), 'cut.pdf', 'application/pdf', UPLOAD_ERR_PARTIAL, true);
        $this->fails(fn () => app(CourseFiles::class)->store($half, $o->id, null), 'did not upload');
        $this->assertSame('file', app(CourseFiles::class)->cleanName('///'));
        $this->assertSame(190, mb_strlen(app(CourseFiles::class)->cleanName(str_repeat('a', 300).'.pdf')));
    }

    public function test_a_file_in_a_lesson_is_not_removed_and_downloads_are_logged(): void
    {
        $o = $this->offering();
        $f = app(CourseFiles::class)->store(UploadedFile::fake()->create('notes.pdf', 5), $o->id, null);
        $l = $this->lesson($o, ['kind' => 'file', 'file_id' => $f->id]);
        $this->fails(fn () => app(CourseFiles::class)->remove($f), 'used by a lesson');
        $u = $this->person();
        app(CourseFiles::class)->record($f, $u, str_repeat('1', 60));
        $this->assertSame(1, $f->fresh()->downloads);
        $log = DB::table('course_downloads')->sole();
        $this->assertSame([$f->id, $u->id, $o->id, 45], [(int) $log->file_id, (int) $log->user_id, (int) $log->offering_id, strlen($log->ip)]);
        $l->delete();
        app(CourseFiles::class)->remove($f);
        $this->assertNull(CourseFile::find($f->id));
    }

    public function test_a_download_link_works_for_its_person_for_a_few_minutes_and_only_with_access(): void
    {
        $o = $this->offering();
        $f = app(CourseFiles::class)->store(UploadedFile::fake()->createWithContent('notes.pdf', '%PDF-secret'), $o->id, null);
        $this->lesson($o, ['kind' => 'file', 'file_id' => $f->id]);
        $u = $this->person();
        $url = app(CourseFiles::class)->link($f, $u);
        $this->get($url)->assertForbidden();   // signed, but no access
        $this->assertFalse(app(CourseAccess::class)->canFile($u, $f));
        $this->access()->grant($u->id, $o->id, 'staff');
        $this->assertTrue(app(CourseAccess::class)->canFile($u, $f));
        $r = $this->get($url)->assertOk();
        $this->assertSame('%PDF-secret', $r->streamedContent());
        $this->assertSame('nosniff', $r->headers->get('X-Content-Type-Options'));
        $this->assertSame(1, DB::table('course_downloads')->count());
        $this->get(str_replace('u='.$u->id, 'u='.($u->id + 1), $url))->assertForbidden();   // another person in the link: the signature fails
        $this->get(URL::route('courses.download', ['file' => $f->id, 'u' => $u->id]))->assertForbidden();   // not signed
        $this->at('2026-10-12 12:06');
        $this->get($url)->assertForbidden();   // five minutes have passed
        Storage::disk('local')->delete($f->path);
        $this->at('2026-10-12 12:00');
        $this->get(app(CourseFiles::class)->link($f, $u))->assertNotFound();
    }

    // ── the outline ──────────────────────────────────────────────────────

    public function test_the_outline_locks_what_a_person_may_not_open_and_hides_the_details(): void
    {
        $teacher = $this->staff('Teacher', ['courses.teach']);
        $o = $this->offering(['instructor_user_id' => $teacher->id, 'free_preview' => true]);
        $s = $this->cur()->saveSection($o, ['title' => 'Week 1']);
        $f = app(CourseFiles::class)->store(UploadedFile::fake()->create('notes.pdf', 5), $o->id, null);
        $this->lesson($o, ['section_id' => $s->id, 'title' => 'Free', 'is_preview' => true, 'body' => 'Free words']);
        $this->lesson($o, ['section_id' => $s->id, 'title' => 'Paid', 'body' => 'Paid words', 'kind' => 'file', 'file_id' => $f->id]);
        $live = $this->cur()->saveLesson($o, ['kind' => 'live', 'title' => 'Live', 'live' => ['starts_at' => '2026-10-12 12:10', 'ends_at' => '2026-10-12 13:00', 'join_url' => 'https://zoom.us/j/9', 'passcode' => 'pw']]);
        $anon = $this->cur()->outline($o, null);
        [$free, $paid] = $anon['sections'][0]['lessons'];
        $this->assertFalse($free['locked']);
        $this->assertSame('Free words', $free['body']);
        $this->assertTrue($paid['locked']);
        $this->assertArrayNotHasKey('body', $paid);
        $this->assertArrayNotHasKey('file', $paid);
        $this->assertTrue($anon['loose'][0]['locked']);
        $this->assertArrayNotHasKey('join_url', $anon['loose'][0]['live']);   // the time is public, never the link
        $u = $this->person();
        $this->access()->grant($u->id, $o->id, 'staff');
        $mine = $this->cur()->outline($o, $u);
        $paid = $mine['sections'][0]['lessons'][1];
        $this->assertSame('Paid words', $paid['body']);
        $this->assertSame('notes.pdf', $paid['file']['name']);
        $this->assertStringContainsString('signature=', $paid['file']['url']);
        $this->assertSame('https://zoom.us/j/9', $mine['loose'][0]['live']['join_url']);   // open: 10 minutes before
        $this->assertSame('open', $mine['loose'][0]['live']['state']);
        $staff = $this->cur()->outline($o, $teacher);
        $this->assertSame($live->id, $staff['loose'][0]['live']['lesson_id']);   // staff see everything
        $this->assertArrayNotHasKey('url', $this->cur()->outline($o, null)['sections'][0]['lessons'][0]['file'] ?? []);
    }

    // ── settings and the screens ─────────────────────────────────────────

    public function test_staff_may_fetch_an_offerings_file_that_no_lesson_uses_yet(): void
    {
        $o = $this->offering();
        $f = CourseFile::forceCreate(['offering_id' => $o->id, 'name' => 'draft.pdf', 'path' => 'x']);
        $loose = CourseFile::forceCreate(['offering_id' => null, 'name' => 'loose.pdf', 'path' => 'y']);
        $mgr = $this->staff('Manager', ['courses.manage']);
        $teacher = $this->staff('Teacher', ['courses.teach']);
        $this->assertTrue($this->access()->canFile($mgr, $f));
        $this->assertFalse($this->access()->canFile($teacher, $f));   // not their offering
        $this->assertFalse($this->access()->canFile($mgr, $loose));   // belongs to no offering yet
        $o->update(['instructor_user_id' => $teacher->id]);
        $this->assertTrue($this->access()->canFile($teacher, $f->fresh()));
        $this->assertFalse($this->access()->canFile($this->person('Student'), $f));
        $this->assertFalse($this->access()->canFile(null, $f));
    }

    public function test_granting_again_keeps_the_note_unless_a_new_one_is_given(): void
    {
        $o = $this->offering();
        $u = $this->person();
        $this->access()->grant($u->id, $o->id, 'staff', 'x', null, 'Scholarship');
        $this->assertSame('Scholarship', $this->access()->grant($u->id, $o->id, 'staff', 'x', null, '  ')->note);
        $this->assertSame('Scholarship', $this->access()->grant($u->id, $o->id, 'staff', 'x')->note);
        $this->assertSame('Prize', $this->access()->grant($u->id, $o->id, 'staff', 'x', null, ' Prize ')->note);
    }

    public function test_settings_keep_to_their_limits(): void
    {
        $this->assertSame(CourseSettings::DEFAULTS, CourseSettings::all());
        $s = CourseSettings::save(['live_open_minutes' => 240, 'download_minutes' => 1, 'default_access_days' => '', 'cert_signatory' => '  Jane  ', 'other' => 1], 2);
        $this->assertSame([240, 1, null, 'Jane'], [$s['live_open_minutes'], $s['download_minutes'], $s['default_access_days'], $s['cert_signatory']]);
        $this->assertArrayNotHasKey('other', CourseSettings::all());
        foreach ([['live_open_minutes', 241], ['download_minutes', 0], ['max_file_mb', 501], ['waitlist_hold_hours', 0], ['max_discount_pct', 101], ['reminder_days', 31]] as [$k, $v]) {
            $this->fails(fn () => CourseSettings::save([$k => $v], null), 'between');
        }
        $this->fails(fn () => CourseSettings::save(['default_access_days' => 3651], null), '1 and 3650');
        $this->fails(fn () => CourseSettings::save(['default_access_days' => 0], null), '1 and 3650');
        $this->assertSame(3650, CourseSettings::save(['default_access_days' => 3650], null)['default_access_days']);
        $this->assertSame(1, CourseSettings::save(['default_access_days' => 1], null)['default_access_days']);
        $this->assertSame(80, mb_strlen(CourseSettings::save(['cert_signatory_title' => str_repeat('t', 99)], null)['cert_signatory_title']));
        Schema::drop('course_settings');
        $this->assertSame(CourseSettings::DEFAULTS, CourseSettings::all());
        $this->fails(fn () => CourseSettings::save([], null), '152_courses.sql');
    }

    public function test_every_courses_route_needs_the_module_and_staff_routes_a_permission(): void
    {
        $n = 0;
        foreach (Route::getRoutes() as $r) {
            $uri = $r->uri();
            if (! str_contains($uri, 'courses') && ! str_starts_with($uri, 'api/learn')) {
                continue;
            }
            $n++;
            $mw = $r->gatherMiddleware();
            $this->assertContains('module:courses', $mw, $uri);
            if (str_starts_with($uri, 'api/admin/courses')) {
                $this->assertContains('permission:courses.view,courses.manage,courses.teach', $mw, $uri);
            } elseif (str_contains($uri, '/download')) {
                $this->assertContains('signed', $mw, $uri);
            } elseif (str_starts_with($uri, 'api/courses/')) {
                $this->assertContains('auth:sanctum', $mw, $uri);
            }
        }
        $this->assertGreaterThan(60, $n);
    }

    public function test_a_teacher_works_only_on_their_own_offerings_and_never_hands_them_on(): void
    {
        $teacher = $this->staff('Teacher', ['courses.teach']);
        $mine = $this->offering(['instructor_user_id' => $teacher->id, 'status' => 'draft']);
        $this->lesson($mine);
        $theirs = $this->offering();
        Sanctum::actingAs($teacher, ['*']);
        $this->assertSame([$mine->id], array_column($this->getJson('/api/admin/courses/offerings')->assertOk()->json('offerings'), 'id'));
        $this->getJson("/api/admin/courses/offerings/{$theirs->id}")->assertForbidden();
        $this->putJson("/api/admin/courses/offerings/{$theirs->id}", ['title' => 'Mine now'])->assertForbidden();
        $this->postJson('/api/admin/courses/offerings', ['title' => 'New'])->assertForbidden();
        $this->deleteJson("/api/admin/courses/offerings/{$mine->id}")->assertForbidden();
        $this->postJson("/api/admin/courses/offerings/{$mine->id}/archive")->assertForbidden();
        $other = $this->person('Other', false);
        $this->putJson("/api/admin/courses/offerings/{$mine->id}", ['title' => 'Renamed', 'instructor_user_id' => $other->id])->assertOk();
        $this->assertSame([$teacher->id, 'Renamed'], [(int) $mine->fresh()->instructor_user_id, $mine->fresh()->title]);
        $this->postJson("/api/admin/courses/offerings/{$mine->id}/publish")->assertOk();
        $this->postJson("/api/admin/courses/offerings/{$theirs->id}/lessons", ['kind' => 'text', 'title' => 'Sneak'])->assertForbidden();
        $this->postJson("/api/admin/courses/offerings/{$theirs->id}/access", ['user_id' => $other->id])->assertForbidden();
        $this->assertSame(0, Lesson::where('offering_id', $theirs->id)->count());
    }
}
