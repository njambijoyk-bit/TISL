<?php

namespace App\Services\Menus;

use App\Models\AttendanceDay;
use App\Models\Menus\Chef;
use App\Models\Menus\Holiday;
use App\Models\Menus\Premium;
use App\Models\Menus\Shift;
use App\Services\Books\BooksException;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Schema;

/**
 * Shift premiums: night hours, weekend days and public holidays pay extra. For each minute a chef was signed in, the rules that apply are looked at and the **best one wins** (the highest
 * percentage, then the highest amount): premiums do not stack, so a night shift on a holiday is paid the better of the two, not both. Premium pay is the extra on top of the pay the
 * salary already covers: hours x the hourly rate x the percentage, plus hours x the flat amount. Only days Attendance has verified are paid. Nothing here changes attendance or the rota.
 */
class RotaPremium
{
    public static function installed(): bool
    {
        return Schema::hasTable('menus_premiums') && Schema::hasTable('menus_holidays');
    }

    private function tz(): string
    {
        return (string) config('app.timezone', 'Africa/Nairobi');
    }

    // ── the rules ─────────────────────────────────────────────────────────

    /**
     * @param array{name?: mixed, kind?: mixed, starts_at?: mixed, ends_at?: mixed, weekdays?: mixed, extra_pct?: mixed, flat_per_hour?: mixed, is_active?: mixed} $d
     */
    public function saveRule(array $d, ?Premium $p = null, ?int $by = null): Premium
    {
        $kind = (string) ($d['kind'] ?? $p?->kind ?? '');
        if (! isset(Premium::KINDS[$kind])) {
            throw new BooksException('Choose night hours, weekend days or public holidays.');
        }
        $name = trim((string) ($d['name'] ?? $p?->name ?? ''));
        if ($name === '' || mb_strlen($name) > 80) {
            throw new BooksException('Give the rule a name of up to 80 letters.');
        }
        $pct = round((float) ($d['extra_pct'] ?? $p?->extra_pct ?? 0), 2);
        $flat = round((float) ($d['flat_per_hour'] ?? $p?->flat_per_hour ?? 0), 2);
        if ($pct < 0 || $pct > 500 || $flat < 0 || $flat > 100000) {
            throw new BooksException('The extra is between 0 and 500 percent, and the amount per hour can not be negative.');
        }
        if ($pct <= 0 && $flat <= 0) {
            throw new BooksException('Give an extra percentage or an amount per hour.');
        }
        $row = ['name' => $name, 'kind' => $kind, 'extra_pct' => $pct, 'flat_per_hour' => $flat, 'starts_at' => null, 'ends_at' => null, 'weekdays' => null];
        if ($kind === 'night') {
            foreach (['starts_at', 'ends_at'] as $k) {
                $v = substr(trim((string) ($d[$k] ?? $p?->{$k} ?? '')), 0, 5);
                if (! preg_match('/^([01]\d|2[0-3]):[0-5]\d$/', $v)) {
                    throw new BooksException('Enter the night hours like 22:00 and 06:00.');
                }
                $row[$k] = $v;
            }
            if ($row['starts_at'] === $row['ends_at']) {
                throw new BooksException('The night must start and end at different times.');
            }
        } elseif ($kind === 'weekend') {
            $days = array_values(array_unique(array_map('intval', is_array($d['weekdays'] ?? null) ? $d['weekdays'] : explode(',', (string) ($d['weekdays'] ?? $p?->weekdays ?? '')))));
            if (! $days || array_diff($days, [1, 2, 3, 4, 5, 6, 7])) {
                throw new BooksException('Choose the days of the week this applies to.');
            }
            sort($days);
            $row['weekdays'] = implode(',', $days);
        }
        $p ??= new Premium(['created_by' => $by]);
        $p->fill($row + ['is_active' => array_key_exists('is_active', $d) ? (bool) $d['is_active'] : ($p->is_active ?? true)])->save();

        return $p->fresh();
    }

    public function saveHoliday(array $d, ?int $locationScope = null): Holiday
    {
        try {
            if (trim((string) ($d['date'] ?? '')) === '') {
                throw new \InvalidArgumentException('no day');
            }
            $day = Carbon::parse((string) $d['date'], $this->tz())->startOfDay();
        } catch (\Throwable) {
            throw new BooksException('Choose the day.');
        }
        $name = trim((string) ($d['name'] ?? ''));
        if ($name === '' || mb_strlen($name) > 80) {
            throw new BooksException('Give the holiday a name of up to 80 letters.');
        }
        $loc = ! empty($d['location_id']) ? (int) $d['location_id'] : null;
        if (Holiday::whereDate('holiday_date', $day->toDateString())->where('location_id', $loc)->exists()) {
            throw new BooksException('That day is already a holiday.');
        }

        return Holiday::create(['holiday_date' => $day->toDateString(), 'name' => $name, 'location_id' => $loc]);
    }

    // ── what was earned ───────────────────────────────────────────────────

    /** Does this rule cover this minute? @param array<string, true> $holidays dates that are holidays for the branch */
    private function covers(Premium $r, Carbon $m, array $holidays): bool
    {
        return match ($r->kind) {
            'night' => $this->inNight(substr((string) $r->starts_at, 0, 5), substr((string) $r->ends_at, 0, 5), $m),
            'weekend' => in_array($m->dayOfWeekIso, $r->days(), true),
            'holiday' => isset($holidays[$m->toDateString()]),
            default => false,
        };
    }

    private function inNight(string $from, string $to, Carbon $m): bool
    {
        $t = $m->format('H:i');

        return $from < $to ? ($t >= $from && $t < $to) : ($t >= $from || $t < $to);   // 22:00 to 06:00 runs past midnight
    }

    /**
     * Minutes worked under each rule between a sign-in and a sign-out: every minute is paid under the best rule that covers it, if any.
     *
     * @param \Illuminate\Support\Collection<int, Premium> $rules
     * @param array<string, true> $holidays
     * @return array<int, int> rule id => minutes
     */
    public function minutes(Carbon $in, Carbon $out, $rules, array $holidays): array
    {
        $rank = $rules->sortByDesc(fn (Premium $r) => [(float) $r->extra_pct, (float) $r->flat_per_hour])->values();
        $out_ = [];
        $cursor = $in->copy()->timezone($this->tz())->startOfMinute();
        $end = $out->copy()->timezone($this->tz())->startOfMinute();
        for ($i = 0; $cursor->lt($end) && $i < 1500; $i++, $cursor->addMinute()) {   // a day's work is far less than 1500 minutes
            foreach ($rank as $r) {
                if ($this->covers($r, $cursor, $holidays)) {
                    $out_[$r->id] = ($out_[$r->id] ?? 0) + 1;
                    break;
                }
            }
        }

        return $out_;
    }

    /** @return array<string, true> the dates in a stretch that are holidays for this branch (a holiday for every branch counts) */
    public function holidaysFor(Carbon $from, Carbon $to, ?int $locationId): array
    {
        if (! self::installed()) {
            return [];
        }

        return Holiday::whereBetween('holiday_date', [$from->copy()->subDay()->toDateString(), $to->copy()->addDay()->toDateString()])
            ->where(fn ($q) => $q->whereNull('location_id')->when($locationId, fn ($x) => $x->orWhere('location_id', $locationId)))->get()
            ->mapWithKeys(fn (Holiday $h) => [$h->holiday_date->toDateString() => true])->all();
    }

    /**
     * What a chef earned in premiums over a stretch of verified days.
     *
     * @return array{hours: float, amount: float, lines: array<int, array{rule: string, hours: float, amount: float}>}
     */
    public function pay(int $userId, Carbon $from, Carbon $to, float $hourly, bool $verifiedOnly = true): array
    {
        $empty = ['hours' => 0.0, 'amount' => 0.0, 'lines' => []];
        if (! self::installed() || ! Schema::hasTable('attendance_days')) {
            return $empty;
        }
        $rules = Premium::where('is_active', true)->get();
        if ($rules->isEmpty()) {
            return $empty;
        }
        $chefId = Chef::where('user_id', $userId)->value('id');
        $rows = AttendanceDay::where('user_id', $userId)->whereBetween('work_date', [$from->toDateString(), $to->toDateString()])->whereNotNull('sign_in_at')->whereNotNull('sign_out_at')
            ->when($verifiedOnly, fn ($q) => $q->where('verify_status', 'verified'))->get();
        $loc = $chefId ? Shift::where('chef_id', $chefId)->whereBetween('shift_date', [$from->toDateString(), $to->toDateString()])->orderByDesc('shift_date')->value('location_id') : null;
        $holidays = $this->holidaysFor($from, $to, $loc ? (int) $loc : null);
        $total = [];
        foreach ($rows as $r) {
            foreach ($this->minutes($r->sign_in_at, $r->sign_out_at, $rules, $holidays) as $id => $m) {
                $total[$id] = ($total[$id] ?? 0) + $m;
            }
        }
        $lines = [];
        $amount = 0.0;
        $hours = 0.0;
        foreach ($total as $id => $m) {
            $rule = $rules->firstWhere('id', $id);
            $h = round($m / 60, 2);
            $a = round($h * ($hourly * (float) $rule->extra_pct / 100 + (float) $rule->flat_per_hour), 2);
            $lines[] = ['rule' => $rule->name, 'hours' => $h, 'amount' => $a];
            $amount += $a;
            $hours += $h;
        }

        return ['hours' => round($hours, 2), 'amount' => round($amount, 2), 'lines' => $lines];
    }

    /** @return array<string, mixed> the rules and holidays for the screen */
    public function overview(): array
    {
        if (! self::installed()) {
            return ['rules' => [], 'holidays' => []];
        }

        return ['rules' => Premium::orderBy('kind')->orderBy('name')->get()->map(fn (Premium $p) => ['id' => $p->id, 'name' => $p->name, 'kind' => $p->kind, 'kind_label' => Premium::KINDS[$p->kind] ?? $p->kind,
            'starts_at' => $p->starts_at ? substr((string) $p->starts_at, 0, 5) : null, 'ends_at' => $p->ends_at ? substr((string) $p->ends_at, 0, 5) : null, 'weekdays' => $p->days(), 'extra_pct' => (float) $p->extra_pct,
            'flat_per_hour' => (float) $p->flat_per_hour, 'is_active' => $p->is_active])->values()->all(),
            'holidays' => Holiday::where('holiday_date', '>=', today($this->tz())->subMonths(1)->toDateString())->orderBy('holiday_date')->get()->map(fn (Holiday $h) => ['id' => $h->id, 'date' => $h->holiday_date->toDateString(), 'name' => $h->name, 'location_id' => $h->location_id])->values()->all()];
    }
}
