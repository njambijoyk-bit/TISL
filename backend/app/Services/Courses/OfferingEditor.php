<?php

namespace App\Services\Courses;

use App\Models\Courses\Access;
use App\Models\Courses\CourseFile;
use App\Models\Courses\Lesson;
use App\Models\Courses\LiveSession;
use App\Models\Courses\Offering;
use App\Models\Courses\Section;
use App\Models\Location;
use App\Models\User;
use App\Services\Books\BooksException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/** Making and changing offerings: what they are, who teaches, and when they go on sale (draft, published, archived). Nothing here touches money. */
class OfferingEditor
{
    /**
     * @param array{kind?: mixed, title?: mixed, summary?: mixed, body?: mixed, cover?: mixed, category?: mixed, skill_level?: mixed, tags?: mixed, instructor_user_id?: mixed, delivery?: mixed, location_id?: mixed,
     *     free_preview?: mixed, access_days?: mixed, min_attendance_pct?: mixed, certificate?: mixed} $d
     */
    public function save(array $d, ?Offering $o = null, ?int $by = null): Offering
    {
        $new = ! $o;
        $o ??= new Offering(['status' => 'draft', 'created_by' => $by]);
        $kind = (string) ($d['kind'] ?? $o->kind ?? 'course');
        if (! isset(Offering::KINDS[$kind])) {
            throw new BooksException('Choose a course, recipe, notes or a live class.');
        }
        if (! $new && $kind !== $o->kind && $o->lessons()->exists()) {
            throw new BooksException('The kind can not be changed once there are lessons.');
        }
        $title = trim((string) ($d['title'] ?? $o->title ?? ''));
        if ($title === '' || mb_strlen($title) > 160) {
            throw new BooksException('Give it a title of up to 160 letters.');
        }
        $level = (string) ($d['skill_level'] ?? $o->skill_level ?? 'all');
        if (! isset(Offering::LEVELS[$level])) {
            throw new BooksException('Choose the level.');
        }
        $delivery = (string) ($d['delivery'] ?? $o->delivery ?? 'online');
        if (! isset(Offering::DELIVERY[$delivery])) {
            throw new BooksException('Choose online, in person or both.');
        }
        $locId = array_key_exists('location_id', $d) ? ($d['location_id'] ? (int) $d['location_id'] : null) : $o->location_id;
        if ($delivery !== 'online' && ! $locId) {
            throw new BooksException('Choose the branch where it is taught.');
        }
        if ($delivery === 'online') {
            $locId = null;
        }
        if ($locId && ! Location::whereKey($locId)->exists()) {
            throw new BooksException('That branch does not exist.');
        }
        $teacher = array_key_exists('instructor_user_id', $d) ? ($d['instructor_user_id'] ? (int) $d['instructor_user_id'] : null) : $o->instructor_user_id;
        if ($teacher && ! User::whereKey($teacher)->exists()) {
            throw new BooksException('That teacher does not exist.');
        }
        $days = array_key_exists('access_days', $d) ? ($d['access_days'] === null || $d['access_days'] === '' ? null : (int) $d['access_days']) : $o->access_days;
        if ($days !== null && ($days < 1 || $days > 3650)) {
            throw new BooksException('Access lasts between 1 and 3650 days (or for ever).');
        }
        $pct = array_key_exists('min_attendance_pct', $d) ? ($d['min_attendance_pct'] === null || $d['min_attendance_pct'] === '' ? null : (int) $d['min_attendance_pct']) : $o->min_attendance_pct;
        if ($pct !== null && ($pct < 1 || $pct > 100)) {
            throw new BooksException('The attendance needed is between 1 and 100 percent.');
        }
        $tags = $o->tags ?? [];
        if (array_key_exists('tags', $d)) {
            $tags = array_values(array_unique(array_filter(array_map(fn ($t) => mb_substr(trim((string) $t), 0, 30), is_array($d['tags']) ? $d['tags'] : explode(',', (string) $d['tags'])), fn ($t) => $t !== '')));
            if (count($tags) > 10) {
                throw new BooksException('Use at most 10 tags.');
            }
        }
        $row = $this->finance($d, $o) + ['kind' => $kind, 'title' => $title, 'skill_level' => $level, 'delivery' => $delivery, 'location_id' => $locId, 'instructor_user_id' => $teacher, 'access_days' => $days, 'min_attendance_pct' => $pct, 'tags' => $tags];
        foreach (['summary' => 400, 'body' => 60000, 'cover' => 255, 'category' => 80] as $k => $max) {
            if (array_key_exists($k, $d)) {
                $v = trim((string) $d[$k]);
                $row[$k] = $v === '' ? null : mb_substr($v, 0, $max);
            }
        }
        if (\Illuminate\Support\Facades\Schema::hasColumn('course_offerings', 'cert_valid_months') && array_key_exists('cert_valid_months', $d)) {
            $m = $d['cert_valid_months'];
            if ($m === null || $m === '') {
                $row['cert_valid_months'] = null;
            } elseif ((int) $m < 1 || (int) $m > 600) {
                throw new BooksException('A certificate stays valid for 1 to 600 months (or for ever).');
            } else {
                $row['cert_valid_months'] = (int) $m;
            }
        }
        foreach (['free_preview', 'certificate', 'in_order'] as $k) {
            if ($k === 'in_order' && ! \Illuminate\Support\Facades\Schema::hasColumn('course_offerings', 'in_order')) {
                continue;
            }
            if (array_key_exists($k, $d)) {
                $row[$k] = (bool) $d[$k];
            }
        }
        if ($new) {
            $row['slug'] = $this->slug($title);
        }
        $o->fill($row)->save();

        return $o->fresh();
    }

    /** The payment plan and the number of places (script 153): checked and returned as columns, nothing at all before the script has been run. @return array<string, mixed> */
    private function finance(array $d, Offering $o): array
    {
        if (! \Illuminate\Support\Facades\Schema::hasColumn('course_offerings', 'capacity')) {
            return [];
        }
        $int = function (string $key, int $lo, int $hi, string $what, bool $nullable = true) use ($d, $o) {
            $v = array_key_exists($key, $d) ? $d[$key] : $o->{$key};
            if ($v === null || $v === '') {
                if (! $nullable) {
                    throw new BooksException("Give {$what}.");
                }

                return null;
            }
            if (! is_numeric($v) || (int) $v < $lo || (int) $v > $hi) {
                throw new BooksException(ucfirst($what)." is between {$lo} and {$hi}.");
            }

            return (int) $v;
        };
        $dep = array_key_exists('deposit_pct', $d) ? $d['deposit_pct'] : $o->deposit_pct;
        $dep = ($dep === null || $dep === '') ? null : round((float) $dep, 2);
        if ($dep !== null && ($dep <= 0 || $dep >= 100)) {
            $dep = $dep <= 0 ? null : throw new BooksException('The deposit is a share between 0 and 100 percent.');
        }
        $grant = (string) ($d['grant_on'] ?? $o->grant_on ?? 'paid');
        if (! in_array($grant, ['paid', 'deposit'], true)) {
            throw new BooksException('Access begins when it is paid in full or at the deposit.');
        }
        if ($grant === 'deposit' && ! $dep && ! ((int) ($d['instalments'] ?? $o->instalments ?? 0) > 1)) {
            throw new BooksException('Access at the deposit needs a deposit or instalments.');
        }

        return ['deposit_pct' => $dep, 'instalments' => $int('instalments', 1, 24, 'the number of instalments'), 'instalment_days' => $int('instalment_days', 1, 365, 'the days between payments', false) ?? 30,
            'grant_on' => $grant, 'grace_days' => $int('grace_days', 0, 60, 'the days an instalment may be late', false) ?? 7, 'refund_days' => $int('refund_days', 0, 3650, 'the refund days'), 'capacity' => $int('capacity', 1, 5000, 'the number of places')];
    }

    private function slug(string $title): string
    {
        $base = Str::slug($title) ?: 'offering';
        $slug = $base;
        for ($i = 2; in_array($slug, ['my', 'books', 'verify'], true) || Offering::where('slug', $slug)->exists(); $i++) {   // 'my' is the student's own page
            $slug = "{$base}-{$i}";
        }

        return $slug;
    }

    /** Put it on sale. It needs something to show: lessons, or for a recipe or notes a description. */
    public function publish(Offering $o): Offering
    {
        if ($o->status === 'published') {
            throw new BooksException('It is published already.');
        }
        $lessons = $o->lessons()->count();
        if ($o->kind === 'live' && ! LiveSession::where('offering_id', $o->id)->exists()) {
            throw new BooksException('Add the live session (date, time and link) before publishing.');
        }
        if ($lessons === 0 && ! ($o->kind === 'recipe' && trim((string) $o->body) !== '')) {
            throw new BooksException('Add at least one lesson before publishing.');
        }

        $o->update(['status' => 'published']);

        return $o->fresh();
    }

    public function unpublish(Offering $o): Offering
    {
        if ($o->status !== 'published') {
            throw new BooksException('It is not published.');
        }
        $o->update(['status' => 'draft']);

        return $o->fresh();
    }

    /** Archive: nobody new can be added; people who already have access keep it until it ends. */
    public function archive(Offering $o): Offering
    {
        if ($o->status === 'archived') {
            throw new BooksException('It is archived already.');
        }
        $o->update(['status' => 'archived']);

        return $o->fresh();
    }

    public function restore(Offering $o): Offering
    {
        if ($o->status !== 'archived') {
            throw new BooksException('It is not archived.');
        }
        $o->update(['status' => 'draft']);

        return $o->fresh();
    }

    /** Only something nobody has had access to can be deleted; otherwise archive it. */
    public function delete(Offering $o): void
    {
        if (Access::where('offering_id', $o->id)->exists()) {
            throw new BooksException('People have had access to this: archive it instead.');
        }
        DB::transaction(function () use ($o) {
            $files = CourseFile::where('offering_id', $o->id)->get();
            LiveSession::where('offering_id', $o->id)->delete();
            Lesson::where('offering_id', $o->id)->delete();
            Section::where('offering_id', $o->id)->delete();
            foreach ($files as $f) {
                app(CourseFiles::class)->remove($f);
            }
            $o->delete();
        });
    }
}
