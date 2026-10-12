<?php

namespace App\Services\Menus;

use App\Models\Location;
use App\Models\Menus\Chef;
use App\Models\Menus\CookingRequest;
use App\Models\Menus\DayOff;
use App\Models\Menus\Shift;
use App\Models\Menus\Station;
use App\Models\User;
use App\Services\Books\BooksException;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Chef rotas and days off. A manager plans a week of shifts (draft), publishes it (each chef is told their own shifts) and may change it afterwards (the chef is told again).
 * A chef asks for time off (or a manager records it); an approved day off takes that chef's shifts in those days off the rota and keeps them from being booked for a private chef job.
 * A chef can not be given two shifts that overlap, nor a shift that overlaps a private chef job they hold. Too many hours, too little rest and a certificate that has run out are warnings, not refusals.
 */
class RotaService
{
    private static ?bool $installed = null;

    /** The shortest and longest a shift may be, in hours, and how far ahead the rota may be planned. */
    private const MIN_HOURS = 1;
    private const MAX_HOURS = 16;
    private const AHEAD_DAYS = 400;
    private const MAX_OFF_DAYS = 60;

    public static function installed(): bool
    {
        if (app()->runningUnitTests()) {
            return Schema::hasTable('menus_shifts') && Schema::hasTable('menus_days_off');
        }

        return self::$installed ??= Schema::hasTable('menus_shifts') && Schema::hasTable('menus_days_off');
    }

    public function __construct(private RotaNotices $notices, private RotaLeave $leave)
    {
    }

    private function tz(): string
    {
        return (string) config('app.timezone', 'Africa/Nairobi');
    }

    private function today(): Carbon
    {
        return Carbon::now($this->tz())->startOfDay();
    }

    private function date(mixed $v, string $what): Carbon
    {
        if (trim((string) $v) === '') {
            throw new BooksException("Choose {$what}.");
        }
        try {
            return Carbon::parse((string) $v, $this->tz())->startOfDay();
        } catch (\Throwable) {
            throw new BooksException("Choose {$what}.");
        }
    }

    /** The Monday of the week a date is in. */
    public function monday(mixed $date = null): Carbon
    {
        $d = $date ? $this->date($date, 'a date') : $this->today();

        return $d->copy()->startOfWeek(Carbon::MONDAY);
    }

    // ── shifts ────────────────────────────────────────────────────────────

    private function clock(mixed $v, string $what): string
    {
        $v = trim((string) $v);
        if (! preg_match('/^([01]\d|2[0-3]):[0-5]\d$/', substr($v, 0, 5)) || strlen($v) > 8) {
            throw new BooksException("Enter {$what} like 08:30.");
        }

        return substr($v, 0, 5);
    }

    /**
     * Add or change a shift (a new one is a draft). Refused: the past, an inactive chef, an approved day off, a shift that overlaps another of theirs or a private chef job they hold.
     *
     * @param array{chef_id?: mixed, location_id?: mixed, station_id?: mixed, date?: mixed, starts_at?: mixed, ends_at?: mixed, note?: mixed} $d
     * @param int[] $ignore shifts to leave out of the overlap check (the other half of a trade that is being made at the same moment)
     * @return array{shift: Shift, warnings: string[]}
     */
    public function saveShift(array $d, ?Shift $shift = null, ?User $by = null, array $ignore = []): array
    {
        $old = $shift ? $shift->replicate() : null;
        $shift ??= new Shift(['status' => 'draft', 'created_by' => $by?->id]);
        if ($shift->exists && $shift->shift_date->lt($this->today())) {
            throw new BooksException('A shift that has passed can not be changed.');
        }
        $chefId = (int) ($d['chef_id'] ?? $shift->chef_id ?? 0);
        $chef = Chef::find($chefId);
        if (! $chef || ! $chef->is_active) {
            throw new BooksException('Choose a chef who is working with us.');
        }
        $loc = Location::find((int) ($d['location_id'] ?? $shift->location_id ?? 0));
        if (! $loc) {
            throw new BooksException('Choose the branch the chef works at.');
        }
        $day = $this->date($d['date'] ?? $shift->shift_date?->toDateString(), 'the day');
        if ($day->lt($this->today())) {
            throw new BooksException('Choose today or a day to come.');
        }
        if ($day->gt($this->today()->addDays(self::AHEAD_DAYS))) {
            throw new BooksException('That day is too far ahead.');
        }
        $from = $this->clock($d['starts_at'] ?? $shift->starts_at, 'the start time');
        $to = $this->clock($d['ends_at'] ?? $shift->ends_at, 'the finish time');
        $stationId = array_key_exists('station_id', $d) ? ($d['station_id'] ? (int) $d['station_id'] : null) : $shift->station_id;
        if ($stationId && KitchenService::installed() && ! Station::whereKey($stationId)->exists()) {
            throw new BooksException('That kitchen station does not exist.');
        }
        $start = Carbon::parse($day->format('Y-m-d').' '.$from, $this->tz());
        $end = Carbon::parse($day->format('Y-m-d').' '.$to, $this->tz());
        $hours = $start->diffInMinutes($end, false) / 60;
        if ($hours <= 0) {
            throw new BooksException('The shift must finish after it starts, on the same day.');
        }
        if ($hours < self::MIN_HOURS || $hours > self::MAX_HOURS) {
            throw new BooksException('A shift is between '.self::MIN_HOURS.' and '.self::MAX_HOURS.' hours long.');
        }
        $this->assertFree($chef, $start, $end, (int) $shift->id, $ignore);

        $shift->fill(['chef_id' => $chef->id, 'location_id' => $loc->id, 'station_id' => $stationId, 'shift_date' => $day->toDateString(), 'starts_at' => $from, 'ends_at' => $to,
            'note' => array_key_exists('note', $d) ? (trim((string) $d['note']) === '' ? null : mb_substr(trim((string) $d['note']), 0, 200)) : $shift->note]
            + (! empty($d['pattern_id']) && Schema::hasColumn('menus_shifts', 'pattern_id') ? ['pattern_id' => (int) $d['pattern_id']] : []));
        $changed = $shift->exists && $shift->isDirty(['chef_id', 'shift_date', 'starts_at', 'ends_at', 'location_id', 'station_id']);
        $shift->save();
        if ($shift->status === 'published' && $changed) {   // the chef already knew about it
            if ($old && (int) $old->chef_id !== (int) $shift->chef_id) {
                $this->notices->changed($old, 'cancelled');
            }
            $this->notices->changed($shift, 'changed');
        }

        return ['shift' => $shift->fresh(), 'warnings' => $this->shiftWarnings($chef, $shift)];
    }

    /**
     * The checks a chef must pass to work this time: not on an approved day off, no overlapping shift (apart from the ones named), no private chef job they hold close by.
     *
     * @param int[] $ignore
     * @throws BooksException
     */
    private function assertFree(Chef $chef, Carbon $start, Carbon $end, int $exceptShift = 0, array $ignore = []): void
    {
        $day = $start->copy()->timezone($this->tz());
        if ($off = $this->offDuring($chef->id, $start, $end)) {
            throw new BooksException("{$chef->display_name} is off on {$day->format('D j M')} ({$off->from_date->format('j M')} to {$off->to_date->format('j M')}).");
        }
        $clash = Shift::where('chef_id', $chef->id)->where('shift_date', $day->toDateString())->where('id', '!=', $exceptShift)->when($ignore, fn ($q) => $q->whereNotIn('id', $ignore))->get()
            ->first(function (Shift $o) use ($start, $end) { [$a, $b] = $o->span(); return $a->lt($end) && $b->gt($start); });
        if ($clash) {
            throw new BooksException("{$chef->display_name} already works ".substr((string) $clash->starts_at, 0, 5).' to '.substr((string) $clash->ends_at, 0, 5).' that day.');
        }
        if (CookingService::chefInstalled() && ($job = app(CookingService::class)->heldJob($chef->id, $start, $end))) {
            throw new BooksException("{$chef->display_name} has private chef job {$job->number} at {$job->event_at->copy()->timezone($this->tz())->format('D j M, H:i')}, too close to this shift.");
        }
    }

    /** Could this chef work from this time to that time? (an open shift asks before a claim is taken) @param int[] $ignore @throws BooksException */
    public function assertCanWork(Chef $chef, Carbon $start, Carbon $end, array $ignore = []): void
    {
        if (! $chef->is_active) {
            throw new BooksException("{$chef->display_name} is not working with us.");
        }
        $this->assertFree($chef, $start, $end, 0, $ignore);
    }

    /** Could this chef take this shift as it is? (A swap asks before it asks the colleague.) @param int[] $ignore @throws BooksException */
    public function assertCanHold(Chef $chef, Shift $shift, array $ignore = []): void
    {
        if (! $chef->is_active) {
            throw new BooksException("{$chef->display_name} is not working with us.");
        }
        [$a, $b] = $shift->span();
        $this->assertFree($chef, $a, $b, 0, $ignore);
    }

    public function deleteShift(Shift $shift): void
    {
        if ($shift->shift_date->lt($this->today())) {
            throw new BooksException('A shift that has passed can not be removed.');
        }
        $published = $shift->status === 'published';
        $shift->delete();
        if ($published) {
            $this->notices->changed($shift, 'cancelled');
        }
    }

    /** Publish the drafts of a week (a branch, or all): each chef is told their own shifts once. @return int how many shifts were published */
    public function publish(Carbon $monday, ?int $locationId = null): int
    {
        $drafts = Shift::where('status', 'draft')->whereBetween('shift_date', [$monday->toDateString(), $monday->copy()->addDays(6)->toDateString()])
            ->when($locationId, fn ($q) => $q->where('location_id', $locationId))->get();
        foreach ($drafts as $s) {
            $s->update(['status' => 'published', 'published_at' => now()]);
        }
        if ($drafts->isNotEmpty()) {
            $this->notices->published($drafts);
        }

        return $drafts->count();
    }

    /**
     * Plan a week like another one: every shift is copied to the same weekday as a draft. A shift is left out when that day has passed, the chef is not working with us, is off, already works
     * then or holds a private chef job.
     *
     * @return array{copied: int, skipped: string[]}
     */
    public function copyWeek(Carbon $from, Carbon $to, ?int $locationId = null, ?User $by = null): array
    {
        $from = $from->copy()->startOfWeek(Carbon::MONDAY);
        $to = $to->copy()->startOfWeek(Carbon::MONDAY);
        if ($from->eq($to)) {
            throw new BooksException('Choose a different week to copy into.');
        }
        $copied = 0;
        $skipped = [];
        $src = Shift::whereBetween('shift_date', [$from->toDateString(), $from->copy()->addDays(6)->toDateString()])->when($locationId, fn ($q) => $q->where('location_id', $locationId))->orderBy('shift_date')->orderBy('starts_at')->get();
        foreach ($src as $s) {
            $target = $to->copy()->addDays((int) round($from->copy()->startOfDay()->diffInDays($s->shift_date->copy()->startOfDay())));
            $label = Chef::whereKey($s->chef_id)->value('display_name').' '.$target->format('D j M');
            try {
                $this->saveShift(['chef_id' => $s->chef_id, 'location_id' => $s->location_id, 'station_id' => $s->station_id, 'date' => $target->toDateString(), 'starts_at' => $s->starts_at, 'ends_at' => $s->ends_at, 'note' => $s->note], null, $by);
                $copied++;
            } catch (BooksException $e) {
                $skipped[] = "{$label}: {$e->getMessage()}";
            }
        }

        return ['copied' => $copied, 'skipped' => $skipped];
    }

    // ── days off ──────────────────────────────────────────────────────────

    /**
     * A chef asks for time off, or a manager records it ($record: it is approved at once and the chef's shifts in those days come off the rota).
     *
     * @param array{from?: mixed, to?: mixed, kind?: mixed, reason?: mixed} $d
     */
    public function requestDayOff(Chef $chef, array $d, ?User $by = null, bool $record = false): DayOff
    {
        $from = $this->date($d['from'] ?? null, 'the first day');
        $to = $this->date($d['to'] ?? $d['from'] ?? null, 'the last day');
        $kind = (string) ($d['kind'] ?? 'off');
        if (! isset(DayOff::KINDS[$kind])) {
            throw new BooksException('Choose what kind of time off it is.');
        }
        if ($to->lt($from)) {
            throw new BooksException('The last day can not be before the first.');
        }
        if ($from->lt($this->today())) {
            throw new BooksException('Time off must start today or later.');
        }
        if ((int) round($from->diffInDays($to)) + 1 > self::MAX_OFF_DAYS) {
            throw new BooksException('Time off can be at most '.self::MAX_OFF_DAYS.' days at once.');
        }
        if (! $chef->is_active) {
            throw new BooksException('That chef is not working with us.');
        }
        if (DayOff::where('chef_id', $chef->id)->whereIn('status', ['requested', 'approved'])->whereDate('from_date', '<=', $to->toDateString())->whereDate('to_date', '>=', $from->toDateString())->exists()) {
            throw new BooksException('That overlaps time off already asked for or approved.');
        }
        if ($kind === 'leave') {
            $this->leave->assertEnough($chef, $from, $to);
        }
        $reason = trim((string) ($d['reason'] ?? ''));
        $off = DB::transaction(function () use ($chef, $from, $to, $kind, $reason, $record, $by) {
            $off = DayOff::create(['chef_id' => $chef->id, 'from_date' => $from->toDateString(), 'to_date' => $to->toDateString(), 'kind' => $kind, 'reason' => $reason === '' ? null : mb_substr($reason, 0, 300),
            'status' => $record ? 'approved' : 'requested', 'requested_by' => $by?->id] + ($record ? ['decided_by' => $by?->id, 'decided_at' => now()] : []));
            if ($record) {
                $this->leave->charge($off, $chef, $by);
            }

            return $off;
        });
        if ($record) {
            $this->clearShifts($off);
            $this->notices->decided($off, $chef, 0);
        } else {
            $this->notices->requested($off, $chef);
        }

        return $off->fresh();
    }

    /** @return array{dayoff: DayOff, shifts_removed: int, jobs: string[]} jobs: private chef jobs the chef still holds in those days (they need another chef) */
    public function decide(DayOff $off, string $to, ?string $note = null, ?User $by = null): array
    {
        if ($off->status !== 'requested') {
            throw new BooksException('This request has been answered already.');
        }
        if (! in_array($to, ['approved', 'declined'], true)) {
            throw new BooksException('Approve or decline it.');
        }
        $note = trim((string) $note);
        $chef = Chef::find($off->chef_id);
        DB::transaction(function () use ($off, $to, $note, $by, $chef) {
            $off->update(['status' => $to, 'decided_by' => $by?->id, 'decided_at' => now(), 'decision_note' => $note === '' ? null : mb_substr($note, 0, 300)]);
            if ($to === 'approved' && $chef) {
                $this->leave->charge($off, $chef, $by);   // refused (and nothing changed) when the balance is not enough any more
            }
        });
        $removed = $to === 'approved' ? $this->clearShifts($off) : 0;
        if ($chef) {
            $this->notices->decided($off, $chef, $removed);
        }

        return ['dayoff' => $off->fresh(), 'shifts_removed' => $removed, 'jobs' => $to === 'approved' ? $this->jobsIn($off) : []];
    }

    public function cancelDayOff(DayOff $off, ?User $by = null): DayOff
    {
        if (! in_array($off->status, ['requested', 'approved'], true) || $off->to_date->lt($this->today())) {
            throw new BooksException('This time off can not be cancelled now.');
        }
        $wasApproved = $off->status === 'approved';
        $off->update(['status' => 'cancelled']);
        if ($wasApproved && ($chef = Chef::find($off->chef_id))) {
            $this->leave->refund($off->fresh(), $chef, $by);   // approved leave gives its days back
        }

        return $off->fresh();
    }

    /** An approved day off takes the chef's shifts in those days off the rota. */
    private function clearShifts(DayOff $off): int
    {
        $n = 0;
        foreach (Shift::where('chef_id', $off->chef_id)->whereBetween('shift_date', [$off->from_date->toDateString(), $off->to_date->toDateString()])->get() as $s) {
            $published = $s->status === 'published';
            $s->delete();
            $n++;
            if ($published) {
                $this->notices->changed($s, 'cancelled');
            }
        }

        return $n;
    }

    /** @return string[] */
    private function jobsIn(DayOff $off): array
    {
        if (! CookingService::chefInstalled()) {
            return [];
        }
        $a = Carbon::parse($off->from_date->toDateString(), $this->tz())->startOfDay();
        $b = Carbon::parse($off->to_date->toDateString(), $this->tz())->endOfDay();

        return CookingRequest::where('chef_id', $off->chef_id)->whereIn('status', ['accepted', 'confirmed', 'preparing'])->whereBetween('event_at', [$a, $b])->orderBy('event_at')->pluck('number')->all();
    }

    /** An approved day off that covers any part of this time. */
    public function offDuring(int $chefId, Carbon $start, Carbon $end): ?DayOff
    {
        if (! self::installed()) {
            return null;
        }
        $a = $start->copy()->timezone($this->tz())->toDateString();
        $b = $end->copy()->timezone($this->tz())->toDateString();

        return DayOff::where('chef_id', $chefId)->where('status', 'approved')->whereDate('from_date', '<=', $b)->whereDate('to_date', '>=', $a)->first();
    }

    /** A shift (draft or published) that overlaps this time, with minutes to spare either side. */
    public function shiftClash(int $chefId, Carbon $start, Carbon $end, int $spare = 0): ?Shift
    {
        if (! self::installed()) {
            return null;
        }
        $a = $start->copy()->subMinutes($spare);
        $b = $end->copy()->addMinutes($spare);
        $days = [$a->copy()->timezone($this->tz())->subDay()->toDateString(), $b->copy()->timezone($this->tz())->addDay()->toDateString()];

        return Shift::where('chef_id', $chefId)->whereBetween('shift_date', $days)->get()->first(function (Shift $s) use ($a, $b) { [$x, $y] = $s->span(); return $x->lt($b) && $y->gt($a); });
    }

    // ── what the screens show ─────────────────────────────────────────────

    /** @return string[] warnings (not refusals) about this chef's week around a shift */
    private function shiftWarnings(Chef $chef, Shift $shift): array
    {
        $out = [];
        if ($shift->station_id && $chef->station_ids && ! in_array((int) $shift->station_id, array_map('intval', $chef->station_ids), true)) {
            $out[] = "{$chef->display_name} is not set up for that station.";
        }
        foreach ($chef->certs()->whereNotNull('expires_on')->whereDate('expires_on', '<', $shift->shift_date->toDateString())->get() as $c) {
            $out[] = "{$c->name} will have run out by {$shift->shift_date->format('D j M')} ({$c->expires_on->format('j M Y')}).";
        }
        $monday = $shift->shift_date->copy()->startOfWeek(Carbon::MONDAY);

        return array_merge($out, $this->weekWarnings($chef->id, Shift::where('chef_id', $chef->id)->whereBetween('shift_date', [$monday->toDateString(), $monday->copy()->addDays(6)->toDateString()])->get()));
    }

    /** @return string[] too many hours in the week, too little rest between one day and the next */
    private function weekWarnings(int $chefId, $shifts): array
    {
        $s = MenusSettings::all();
        $out = [];
        $hours = round($shifts->sum(fn (Shift $x) => $x->hours()), 2);
        if ($hours > (float) $s['rota_max_week_hours']) {
            $out[] = "{$hours} hours this week (more than {$s['rota_max_week_hours']}).";
        }
        $byDay = $shifts->sortBy(fn (Shift $x) => $x->span()[0]->timestamp)->values();
        for ($i = 1; $i < $byDay->count(); $i++) {
            [, $end] = $byDay[$i - 1]->span();
            [$start] = $byDay[$i]->span();
            $rest = $end->diffInMinutes($start, false) / 60;
            if ($rest >= 0 && $rest < (float) $s['rota_min_rest_hours'] && $byDay[$i - 1]->shift_date->ne($byDay[$i]->shift_date)) {
                $out[] = 'Only '.round($rest, 1).' hours of rest before '.$byDay[$i]->shift_date->format('D j M').' (less than '.$s['rota_min_rest_hours'].').';
            }
        }

        return $out;
    }

    /** @return array<string, mixed> */
    public function shiftRow(Shift $s, $stations = null, $chefs = null): array
    {
        $stations ??= KitchenService::installed() ? Station::pluck('name', 'id') : collect();

        return ['id' => $s->id, 'chef_id' => $s->chef_id, 'chef' => $chefs ? ($chefs[$s->chef_id] ?? null) : Chef::whereKey($s->chef_id)->value('display_name'), 'location_id' => $s->location_id, 'station_id' => $s->station_id,
            'station' => $s->station_id ? ($stations[$s->station_id] ?? null) : null, 'date' => $s->shift_date->toDateString(), 'starts_at' => substr((string) $s->starts_at, 0, 5), 'ends_at' => substr((string) $s->ends_at, 0, 5),
            'hours' => $s->hours(), 'status' => $s->status, 'note' => $s->note, 'from_pattern' => ! empty($s->pattern_id), 'attendance' => null];
    }

    /** @return array<string, mixed> */
    public function dayOffRow(DayOff $d, $chefs = null): array
    {
        return ['id' => $d->id, 'chef_id' => $d->chef_id, 'chef' => $chefs ? ($chefs[$d->chef_id] ?? null) : Chef::whereKey($d->chef_id)->value('display_name'), 'from' => $d->from_date->toDateString(), 'to' => $d->to_date->toDateString(),
            'days' => $d->days(), 'kind' => $d->kind, 'kind_label' => DayOff::KINDS[$d->kind] ?? $d->kind, 'status' => $d->status, 'status_label' => DayOff::STATUSES[$d->status] ?? $d->status, 'reason' => $d->reason,
            'decision_note' => $d->decision_note, 'charged_days' => $d->charged_days ?? null, 'can_cancel' => in_array($d->status, ['requested', 'approved'], true) && $d->to_date->gte($this->today())];
    }

    /**
     * One week for the screen: the chefs, their shifts (limited by $scope: the branches the person is cleared for), time off falling in the week, what is waiting to be decided and the warnings.
     *
     * @param callable|null $scope narrows the shifts query to the branches the person may see
     * @return array<string, mixed>
     */
    public function week(Carbon $monday, ?int $locationId = null, ?callable $scope = null): array
    {
        $end = $monday->copy()->addDays(6);
        $q = Shift::whereBetween('shift_date', [$monday->toDateString(), $end->toDateString()])->orderBy('shift_date')->orderBy('starts_at')->when($locationId, fn ($x) => $x->where('location_id', $locationId));
        if ($scope) {
            $scope($q);
        }
        $shifts = $q->get();
        $chefs = Chef::where('is_active', true)->orderBy('sort_order')->orderBy('display_name')->get();
        $names = $chefs->pluck('display_name', 'id');
        $stations = KitchenService::installed() ? Station::pluck('name', 'id') : collect();
        $att = app(RotaAttendance::class)->states($shifts);   // was the chef there? (empty until the shift has started or without attendance)
        $attended = app(RotaAttendance::class)->attendedHours($chefs, $monday, $end);
        $off = DayOff::whereIn('status', ['requested', 'approved'])->whereDate('from_date', '<=', $end->toDateString())->whereDate('to_date', '>=', $monday->toDateString())->orderBy('from_date')->get();

        return [
            'week_start' => $monday->toDateString(), 'week_end' => $end->toDateString(), 'days' => array_map(fn ($i) => $monday->copy()->addDays($i)->toDateString(), range(0, 6)),
            'chefs' => $chefs->map(fn (Chef $c) => ['id' => $c->id, 'name' => $c->display_name, 'title' => $c->title, 'user_id' => $c->user_id,
                'leave_balance' => $this->leave->balance($c), 'attended_hours' => $attended[$c->id] ?? null, 'hours' => round($shifts->where('chef_id', $c->id)->sum(fn (Shift $s) => $s->hours()), 2), 'warnings' => $this->weekWarnings($c->id, $shifts->where('chef_id', $c->id))])->values()->all(),
            'shifts' => $shifts->map(function (Shift $s) use ($stations, $names, $att) { $r = $this->shiftRow($s, $stations, $names); $r['attendance'] = $att[$s->id] ?? null; return $r; })->values()->all(),
            'days_off' => $off->map(fn (DayOff $d) => $this->dayOffRow($d, $names))->values()->all(),
            'drafts' => $shifts->where('status', 'draft')->count(),
            'waiting' => DayOff::where('status', 'requested')->where('to_date', '>=', $this->today()->toDateString())->count(),
        ];
    }

    /** A chef's own page: their published shifts for the next three weeks and their time off. @return array{chef: ?array, shifts: array, days_off: array} */
    public function mine(User $user): array
    {
        $chef = Chef::where('user_id', $user->id)->first();
        if (! $chef) {
            return ['chef' => null, 'shifts' => [], 'days_off' => []];
        }
        $names = [$chef->id => $chef->display_name];
        $from = $this->today();

        return ['chef' => ['id' => $chef->id, 'name' => $chef->display_name, 'leave_balance' => $this->leave->balance($chef)],
            'shifts' => Shift::where('chef_id', $chef->id)->where('status', 'published')->whereBetween('shift_date', [$from->toDateString(), $from->copy()->addDays(21)->toDateString()])->orderBy('shift_date')->orderBy('starts_at')->get()
                ->map(fn (Shift $s) => $this->shiftRow($s, null, $names))->all(),
            'days_off' => DayOff::where('chef_id', $chef->id)->where('to_date', '>=', $from->toDateString())->orderBy('from_date')->get()->map(fn (DayOff $d) => $this->dayOffRow($d, $names))->all()];
    }

    /** Who is rostered on a day (published shifts), by chef id: "08:00–16:00, 18:00–22:00". @return array<int, string> */
    public function rosteredOn(?Carbon $day = null): array
    {
        if (! self::installed()) {
            return [];
        }
        $day ??= $this->today();
        $spans = [];
        foreach (Shift::where('status', 'published')->where('shift_date', $day->toDateString())->orderBy('starts_at')->get() as $s) {
            $spans[$s->chef_id][] = substr((string) $s->starts_at, 0, 5).'–'.substr((string) $s->ends_at, 0, 5);
        }

        return array_map(fn ($list) => implode(', ', $list), $spans);
    }
}
