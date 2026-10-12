<?php

namespace App\Services\Courses;

use App\Models\Courses\CourseFile;
use App\Models\Courses\Lesson;
use App\Models\Courses\LiveSession;
use App\Models\Courses\Offering;
use App\Models\Courses\Section;
use App\Models\User;
use App\Services\Books\BooksException;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

/** The inside of an offering: sections, lessons (reading, video link, file, recipe, live session) and their order. */
class Curriculum
{
    public function __construct(private LiveLinks $links, private CourseAccess $access, private CourseFiles $files)
    {
    }

    public function saveSection(Offering $o, array $d, ?Section $s = null): Section
    {
        $title = trim((string) ($d['title'] ?? $s?->title ?? ''));
        if ($title === '' || mb_strlen($title) > 160) {
            throw new BooksException('Give the section a title of up to 160 letters.');
        }
        if ($s && (int) $s->offering_id !== (int) $o->id) {
            throw new BooksException('That section belongs to another offering.');
        }
        $s ??= new Section(['offering_id' => $o->id, 'sort_order' => (int) Section::where('offering_id', $o->id)->max('sort_order') + 10]);
        $s->fill(['title' => $title])->save();

        return $s->fresh();
    }

    /** Deleting a section keeps its lessons, now outside any section. */
    public function deleteSection(Offering $o, Section $s): void
    {
        if ((int) $s->offering_id !== (int) $o->id) {
            throw new BooksException('That section belongs to another offering.');
        }
        DB::transaction(function () use ($s) {
            Lesson::where('section_id', $s->id)->update(['section_id' => null]);
            $s->delete();
        });
    }

    /**
     * Add or change a lesson. A video needs an https link, a file lesson a file of this offering, a live lesson a session (date, time, link).
     *
     * @param array{kind?: mixed, title?: mixed, section_id?: mixed, body?: mixed, video_url?: mixed, file_id?: mixed, duration_minutes?: mixed, drip_days?: mixed, is_preview?: mixed, is_required?: mixed, live?: mixed} $d
     */
    public function saveLesson(Offering $o, array $d, ?Lesson $l = null): Lesson
    {
        if ($l && (int) $l->offering_id !== (int) $o->id) {
            throw new BooksException('That lesson belongs to another offering.');
        }
        $kind = (string) ($d['kind'] ?? $l?->kind ?? 'text');
        if (! isset(Lesson::KINDS[$kind])) {
            throw new BooksException('Choose what kind of lesson it is.');
        }
        $title = trim((string) ($d['title'] ?? $l?->title ?? ''));
        if ($title === '' || mb_strlen($title) > 160) {
            throw new BooksException('Give the lesson a title of up to 160 letters.');
        }
        $sectionId = array_key_exists('section_id', $d) ? ($d['section_id'] ? (int) $d['section_id'] : null) : $l?->section_id;
        if ($sectionId && ! Section::where('id', $sectionId)->where('offering_id', $o->id)->exists()) {
            throw new BooksException('That section is not part of this offering.');
        }
        $video = array_key_exists('video_url', $d) ? $this->url($d['video_url'], 'video link') : $l?->video_url;
        $fileId = array_key_exists('file_id', $d) ? ($d['file_id'] ? (int) $d['file_id'] : null) : $l?->file_id;
        if ($kind === 'video' && ! $video) {
            throw new BooksException('Give the address of the video.');
        }
        if (! in_array($kind, ['file', 'recipe', 'text'], true)) {
            $fileId = null;
        }
        if ($kind === 'file' && ! $fileId) {
            throw new BooksException('Choose one of this offering\'s files.');
        }
        if ($fileId) {
            $f = CourseFile::find($fileId);
            if (! $f || ($f->offering_id && (int) $f->offering_id !== (int) $o->id)) {
                throw new BooksException('Choose one of this offering\'s files.');
            }
        }
        $dur = array_key_exists('duration_minutes', $d) ? ($d['duration_minutes'] === null || $d['duration_minutes'] === '' ? null : (int) $d['duration_minutes']) : $l?->duration_minutes;
        if ($dur !== null && ($dur < 1 || $dur > 1440)) {
            throw new BooksException('A lesson lasts 1 to 1440 minutes.');
        }
        $drip = array_key_exists('drip_days', $d) ? ($d['drip_days'] === null || $d['drip_days'] === '' ? null : (int) $d['drip_days']) : $l?->drip_days;
        if ($drip !== null && ($drip < 0 || $drip > 3650)) {
            throw new BooksException('A lesson can open 0 to 3650 days after access begins.');
        }
        $live = $kind === 'live' ? $this->liveData($d['live'] ?? null, $l?->live) : null;

        $saved = DB::transaction(function () use ($o, $d, $l, $kind, $title, $sectionId, $video, $fileId, $dur, $drip, $live) {
            $l ??= new Lesson(['offering_id' => $o->id, 'sort_order' => (int) Lesson::where('offering_id', $o->id)->max('sort_order') + 10]);
            $body = array_key_exists('body', $d) ? (trim((string) $d['body']) === '' ? null : mb_substr(trim((string) $d['body']), 0, 60000)) : $l->body;
            $l->fill(['kind' => $kind, 'title' => $title, 'section_id' => $sectionId, 'body' => $body, 'video_url' => in_array($kind, ['video', 'recipe', 'text'], true) ? $video : null, 'file_id' => $fileId,
                'duration_minutes' => $dur, 'drip_days' => $drip, 'is_preview' => array_key_exists('is_preview', $d) ? (bool) $d['is_preview'] : (bool) $l->is_preview,
                'is_required' => array_key_exists('is_required', $d) ? (bool) $d['is_required'] : ($l->exists ? (bool) $l->is_required : true)])->save();
            if ($fileId && ! CourseFile::whereKey($fileId)->value('offering_id')) {
                CourseFile::whereKey($fileId)->update(['offering_id' => $o->id]);   // a file used by a lesson belongs to that offering
            }
            if ($kind === 'live') {
                $row = ['offering_id' => $o->id, 'lesson_id' => $l->id] + $live;
                $existing = LiveSession::where('lesson_id', $l->id)->first();
                $existing ? $existing->update($row) : LiveSession::create($row);
            } else {
                LiveSession::where('lesson_id', $l->id)->delete();
            }

            return $l->fresh();
        });
        app(CourseAttendance::class)->syncLive($o, $saved);

        return $saved;
    }

    private function url(mixed $v, string $what): ?string
    {
        $v = trim((string) $v);
        if ($v === '') {
            return null;
        }
        if (mb_strlen($v) > 500 || ! preg_match('#^https://[^\s/$.?\#][^\s]*$#i', $v) || ! filter_var($v, FILTER_VALIDATE_URL)) {
            throw new BooksException("The {$what} must be a web address starting with https://.");
        }

        return $v;
    }

    /** @return array<string, mixed> the live session's columns, checked */
    private function liveData(mixed $in, ?LiveSession $cur): array
    {
        $in = is_array($in) ? $in : [];
        $tz = (string) ($in['timezone'] ?? $cur?->timezone ?? config('app.timezone', 'Africa/Nairobi'));
        if (! in_array($tz, \DateTimeZone::listIdentifiers(), true)) {
            throw new BooksException('Choose a time zone from the list.');
        }
        try {
            $start = ! empty($in['starts_at']) ? Carbon::parse((string) $in['starts_at'], $tz) : $cur?->starts_at?->copy();
            $end = ! empty($in['ends_at']) ? Carbon::parse((string) $in['ends_at'], $tz) : $cur?->ends_at?->copy();
        } catch (\Throwable) {
            throw new BooksException('Give the day and the start and end time of the live session.');
        }
        if (! $start || ! $end) {
            throw new BooksException('Give the day and the start and end time of the live session.');
        }
        if ($end->lte($start)) {
            throw new BooksException('The session must end after it starts.');
        }
        if ($start->diffInHours($end) > 12) {
            throw new BooksException('A live session lasts at most 12 hours.');
        }
        $url = array_key_exists('join_url', $in) ? $this->url($in['join_url'], 'join link') : $cur?->join_url;
        $replay = array_key_exists('replay_url', $in) ? $this->url($in['replay_url'], 'replay link') : $cur?->replay_url;
        $provider = (string) ($in['provider'] ?? '');
        if ($provider === '' || $provider === 'auto') {
            $provider = $url ? $this->links->providerOf($url) : ($cur?->provider ?? 'other');
        }
        if (! isset(LiveSession::PROVIDERS[$provider])) {
            throw new BooksException('Choose Zoom, Google Meet, Microsoft Teams or another link.');
        }
        $cap = array_key_exists('capacity', $in) ? ($in['capacity'] === null || $in['capacity'] === '' ? null : (int) $in['capacity']) : $cur?->capacity;
        if ($cap !== null && ($cap < 1 || $cap > 5000)) {
            throw new BooksException('The number of places is between 1 and 5000.');
        }
        $text = fn (string $k, int $max) => array_key_exists($k, $in) ? (trim((string) $in[$k]) === '' ? null : mb_substr(trim((string) $in[$k]), 0, $max)) : $cur?->{$k};

        return ['starts_at' => $start->copy()->timezone(config('app.timezone', 'Africa/Nairobi')), 'ends_at' => $end->copy()->timezone(config('app.timezone', 'Africa/Nairobi')), 'timezone' => $tz, 'provider' => $provider,
            'join_url' => $url, 'meeting_id' => $text('meeting_id', 60), 'passcode' => $text('passcode', 60), 'replay_url' => $replay, 'capacity' => $cap];
    }

    public function deleteLesson(Offering $o, Lesson $l): void
    {
        if ((int) $l->offering_id !== (int) $o->id) {
            throw new BooksException('That lesson belongs to another offering.');
        }
        app(CourseAttendance::class)->syncLive($o, $l, true);   // the class on the register goes with the lesson (or is cancelled if it has marks)
        DB::transaction(function () use ($l) {
            LiveSession::where('lesson_id', $l->id)->delete();
            $l->delete();
        });
    }

    /**
     * Put sections and lessons in a new order. `sections` is a list of section ids; `lessons` a list of {id, section_id} in the order wanted. Every id must belong to the offering.
     *
     * @param int[] $sections
     * @param array<int, array{id: int, section_id?: ?int}> $lessons
     */
    public function reorder(Offering $o, array $sections, array $lessons): void
    {
        $own = Section::where('offering_id', $o->id)->pluck('id')->all();
        $ownL = Lesson::where('offering_id', $o->id)->pluck('id')->all();
        foreach ($sections as $id) {
            if (! in_array((int) $id, $own, true)) {
                throw new BooksException('One of the sections is not part of this offering.');
            }
        }
        foreach ($lessons as $row) {
            if (! in_array((int) ($row['id'] ?? 0), $ownL, true)) {
                throw new BooksException('One of the lessons is not part of this offering.');
            }
            $sid = $row['section_id'] ?? null;
            if ($sid && ! in_array((int) $sid, $own, true)) {
                throw new BooksException('One of the sections is not part of this offering.');
            }
        }
        DB::transaction(function () use ($sections, $lessons) {
            foreach (array_values($sections) as $i => $id) {
                Section::whereKey((int) $id)->update(['sort_order' => ($i + 1) * 10]);
            }
            foreach (array_values($lessons) as $i => $row) {
                Lesson::whereKey((int) $row['id'])->update(['sort_order' => ($i + 1) * 10, 'section_id' => ! empty($row['section_id']) ? (int) $row['section_id'] : null]);
            }
        });
    }

    /**
     * The outline of an offering as one person may see it. Staff who manage or teach it see everything (the links too); everybody else gets titles, with a lock on what they may not open, and
     * the details (text, video, files, the live link) only for what they may open.
     *
     * @return array<string, mixed>
     */
    public function outline(Offering $o, ?User $u): array
    {
        $staff = $this->access->staffMay($u, $o);
        $lessons = $o->lessons()->get();
        $live = LiveSession::where('offering_id', $o->id)->get()->keyBy('lesson_id');
        $files = CourseFile::whereIn('id', $lessons->pluck('file_id')->filter())->get()->keyBy('id');
        $row = function (Lesson $l) use ($o, $u, $staff, $live, $files) {
            $open = $this->access->canLesson($u, $o, $l);
            $base = ['id' => $l->id, 'kind' => $l->kind, 'kind_label' => Lesson::KINDS[$l->kind] ?? $l->kind, 'title' => $l->title, 'section_id' => $l->section_id, 'duration_minutes' => $l->duration_minutes,
                'drip_days' => $l->drip_days, 'is_preview' => $l->is_preview, 'is_required' => $l->is_required, 'locked' => ! $open];
            if (! $open) {
                return $base + ['live' => $live[$l->id] ?? null ? $this->links->publicView($live[$l->id]) : null];
            }
            $f = $l->file_id ? ($files[$l->file_id] ?? null) : null;

            return $base + ['body' => $l->body, 'video_url' => $l->video_url, 'file' => $f ? ($this->files->row($f) + ($u ? ['url' => $this->files->link($f, $u)] : [])) : null,
                'live' => isset($live[$l->id]) ? ($staff ? $this->links->staffView($live[$l->id]) : $this->links->memberView($live[$l->id])) : null];
        };
        $byS = $lessons->groupBy(fn ($l) => $l->section_id ?? 0);

        return ['sections' => $o->sections()->get()->map(fn ($s) => ['id' => $s->id, 'title' => $s->title, 'lessons' => ($byS[$s->id] ?? collect())->map($row)->values()->all()])->values()->all(),
            'loose' => ($byS[0] ?? collect())->map($row)->values()->all()];
    }
}
