<?php

namespace App\Services\Menus;

use App\Models\Location;
use App\Models\Menus\Chef;
use App\Models\Menus\RotaPattern;
use App\Models\Menus\Shift;
use App\Models\Menus\Station;
use App\Models\User;
use App\Services\Books\BooksException;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Schema;

/**
 * Repeating weekly patterns. A pattern says "this chef works Monday 08:00 to 16:00 at the Grill, from this day until that day". It never reaches a chef by itself: it plans **draft** shifts
 * (the ordinary rota rules apply, so a day off or a private chef job simply leaves that day out), and a manager publishes them like any other week. Planning is safe to repeat:
 * a shift that is already there is not planned twice.
 */
class RotaPatterns
{
    private const MIN_HOURS = 1;
    private const MAX_HOURS = 16;

    public static function installed(): bool
    {
        return Schema::hasTable('menus_rota_patterns');
    }

    public function __construct(private RotaService $rota, private RotaNotices $notices)
    {
    }

    private function tz(): string
    {
        return (string) config('app.timezone', 'Africa/Nairobi');
    }

    private function day(mixed $v, string $what): Carbon
    {
        try {
            return Carbon::parse((string) $v, $this->tz())->startOfDay();
        } catch (\Throwable) {
            throw new BooksException("Choose {$what}.");
        }
    }

    private function clock(mixed $v, string $what): string
    {
        $v = substr(trim((string) $v), 0, 5);
        if (! preg_match('/^([01]\d|2[0-3]):[0-5]\d$/', $v)) {
            throw new BooksException("Enter {$what} like 08:30.");
        }

        return $v;
    }

    /**
     * Add a pattern for each weekday chosen (or change one). Refused: a chef who is not working with us, no weekday, a shift length outside 1 to 16 hours, a last day before the first, and a pattern
     * that overlaps another of the same chef's on that weekday while both are running.
     *
     * @param array{chef_id?: mixed, weekdays?: mixed, location_id?: mixed, station_id?: mixed, starts_at?: mixed, ends_at?: mixed, valid_from?: mixed, valid_to?: mixed, note?: mixed} $d
     * @return RotaPattern[]
     */
    public function save(array $d, ?RotaPattern $edit = null, ?User $by = null): array
    {
        $chef = Chef::find((int) ($d['chef_id'] ?? $edit?->chef_id ?? 0));
        if (! $chef || ! $chef->is_active) {
            throw new BooksException('Choose a chef who is working with us.');
        }
        $loc = Location::find((int) ($d['location_id'] ?? $edit?->location_id ?? 0));
        if (! $loc) {
            throw new BooksException('Choose the branch the chef works at.');
        }
        $days = $edit ? [(int) ($d['weekday'] ?? $edit->weekday)] : array_values(array_unique(array_map('intval', (array) ($d['weekdays'] ?? []))));
        if (! $days || array_diff($days, array_keys(RotaPattern::DAYS))) {
            throw new BooksException('Choose the days of the week.');
        }
        $from = $this->clock($d['starts_at'] ?? $edit?->starts_at, 'the start time');
        $to = $this->clock($d['ends_at'] ?? $edit?->ends_at, 'the finish time');
        $hours = (strtotime("2000-01-01 {$to}") - strtotime("2000-01-01 {$from}")) / 3600;
        if ($hours <= 0) {
            throw new BooksException('The shift must finish after it starts, on the same day.');
        }
        if ($hours < self::MIN_HOURS || $hours > self::MAX_HOURS) {
            throw new BooksException('A shift is between '.self::MIN_HOURS.' and '.self::MAX_HOURS.' hours long.');
        }
        $stationId = array_key_exists('station_id', $d) ? ($d['station_id'] ? (int) $d['station_id'] : null) : $edit?->station_id;
        if ($stationId && KitchenService::installed() && ! Station::whereKey($stationId)->exists()) {
            throw new BooksException('That kitchen station does not exist.');
        }
        $validFrom = $this->day($d['valid_from'] ?? $edit?->valid_from?->toDateString() ?? today($this->tz())->toDateString(), 'the first day');
        $validTo = ! empty($d['valid_to']) ? $this->day($d['valid_to'], 'the last day') : (array_key_exists('valid_to', $d) ? null : $edit?->valid_to?->copy());
        if ($validTo && $validTo->lt($validFrom)) {
            throw new BooksException('The last day can not be before the first.');
        }
        $note = array_key_exists('note', $d) ? (trim((string) $d['note']) === '' ? null : mb_substr(trim((string) $d['note']), 0, 200)) : $edit?->note;

        $out = [];
        foreach ($days as $wd) {
            $clash = RotaPattern::where('chef_id', $chef->id)->where('weekday', $wd)->where('is_active', true)->where('id', '!=', $edit?->id ?: 0)->get()->first(function (RotaPattern $o) use ($from, $to, $validFrom, $validTo) {
                $overlapTime = substr((string) $o->starts_at, 0, 5) < $to && substr((string) $o->ends_at, 0, 5) > $from;
                $overlapDays = (! $o->valid_to || $o->valid_to->gte($validFrom)) && (! $validTo || $o->valid_from->lte($validTo));

                return $overlapTime && $overlapDays;
            });
            if ($clash) {
                throw new BooksException("{$chef->display_name} already has a pattern on ".RotaPattern::DAYS[$wd].' '.substr((string) $clash->starts_at, 0, 5).' to '.substr((string) $clash->ends_at, 0, 5).'.');
            }
        }
        foreach ($days as $wd) {
            $p = $edit ?? new RotaPattern(['created_by' => $by?->id, 'is_active' => true]);
            $p->fill(['chef_id' => $chef->id, 'location_id' => $loc->id, 'station_id' => $stationId, 'weekday' => $wd, 'starts_at' => $from, 'ends_at' => $to, 'valid_from' => $validFrom->toDateString(),
                'valid_to' => $validTo?->toDateString(), 'note' => $note])->save();
            $out[] = $p->fresh();
        }

        return $out;
    }

    public function setActive(RotaPattern $p, bool $on): RotaPattern
    {
        $p->update(['is_active' => $on]);

        return $p->fresh();
    }

    /** Stopping a pattern removes the draft shifts it planned that nobody has been told about; published shifts stay (they are the chef's promise). */
    public function delete(RotaPattern $p): int
    {
        $n = Shift::where('pattern_id', $p->id)->where('status', 'draft')->where('shift_date', '>=', today($this->tz())->toDateString())->delete();
        $p->delete();

        return (int) $n;
    }

    /**
     * Plan one week from the patterns that are running as drafts. A shift already there (the same chef, day and start) is left alone; a day the chef can not work (a day off, a private chef job, a
     * clash) is left out with the reason. Days that have passed are not planned.
     *
     * @return array{created: int, skipped: string[]}
     */
    public function apply(Carbon $monday, ?int $locationId = null, ?User $by = null): array
    {
        $created = 0;
        $skipped = [];
        $today = Carbon::now($this->tz())->startOfDay();
        $patterns = RotaPattern::where('is_active', true)->when($locationId, fn ($q) => $q->where('location_id', $locationId))->orderBy('chef_id')->orderBy('weekday')->orderBy('starts_at')->get();
        foreach ($patterns as $p) {
            $date = $monday->copy()->startOfWeek(Carbon::MONDAY)->addDays($p->weekday - 1);
            if ($date->lt($today) || $date->lt($p->valid_from) || ($p->valid_to && $date->gt($p->valid_to))) {
                continue;
            }
            if (Shift::where('chef_id', $p->chef_id)->where('shift_date', $date->toDateString())->where('starts_at', 'like', substr((string) $p->starts_at, 0, 5).'%')->exists()) {
                continue;
            }
            try {
                $this->rota->saveShift(['chef_id' => $p->chef_id, 'location_id' => $p->location_id, 'station_id' => $p->station_id, 'date' => $date->toDateString(), 'starts_at' => $p->starts_at, 'ends_at' => $p->ends_at,
                    'note' => $p->note, 'pattern_id' => $p->id], null, $by);
                $created++;
            } catch (BooksException $e) {
                $skipped[] = Chef::whereKey($p->chef_id)->value('display_name').' '.$date->format('D j M').': '.$e->getMessage();
            }
        }

        return ['created' => $created, 'skipped' => $skipped];
    }

    /** The scheduler's daily job: plan the coming weeks from the patterns as drafts and tell the managers once if anything new was planned. @return int shifts planned */
    public function planAhead(?Carbon $now = null): int
    {
        if (! self::installed() || ! RotaService::installed()) {
            return 0;
        }
        $weeks = (int) MenusSettings::all()['rota_ahead_weeks'];
        if ($weeks <= 0) {
            return 0;
        }
        $monday = ($now ?? Carbon::now($this->tz()))->copy()->startOfWeek(Carbon::MONDAY);
        $total = 0;
        for ($i = 0; $i <= $weeks; $i++) {
            $total += $this->apply($monday->copy()->addWeeks($i))['created'];
        }
        if ($total > 0) {
            $this->notices->planned($total);
        }

        return $total;
    }

    /** @return array<int, array<string, mixed>> */
    public function rows(?callable $scope = null): array
    {
        if (! self::installed()) {
            return [];
        }
        $q = RotaPattern::orderBy('chef_id')->orderBy('weekday')->orderBy('starts_at');
        if ($scope) {
            $scope($q);
        }
        $chefs = Chef::pluck('display_name', 'id');
        $stations = KitchenService::installed() ? Station::pluck('name', 'id') : collect();

        return $q->get()->map(fn (RotaPattern $p) => ['id' => $p->id, 'chef_id' => $p->chef_id, 'chef' => $chefs[$p->chef_id] ?? null, 'location_id' => $p->location_id, 'station_id' => $p->station_id,
            'station' => $p->station_id ? ($stations[$p->station_id] ?? null) : null, 'weekday' => $p->weekday, 'weekday_label' => RotaPattern::DAYS[$p->weekday] ?? '', 'starts_at' => substr((string) $p->starts_at, 0, 5),
            'ends_at' => substr((string) $p->ends_at, 0, 5), 'valid_from' => $p->valid_from->toDateString(), 'valid_to' => $p->valid_to?->toDateString(), 'note' => $p->note, 'is_active' => $p->is_active])->values()->all();
    }
}
