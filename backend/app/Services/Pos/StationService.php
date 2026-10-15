<?php

namespace App\Services\Pos;

use App\Models\Location;
use App\Models\Pos\Station;
use App\Models\User;
use App\Services\Access\Authorizer;
use App\Services\Books\BooksException;
use App\Services\Licensing\LicenseManager;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;

/**
 * Stations of the point of sale: a till (or a self-checkout screen) at a branch. A branch has many; one staff station is its default. A station is only a tag on what is sold there: stock still moves at
 * the branch. A person works at the stations they are given (inside the branches they may use); with none chosen, their own default, then the branch's, is used.
 * Each branch also names the receipt paper it offers (A4, 110, 85, 80 or 58 mm) and its default.
 */
class StationService
{
    public const PAPER = ['a4' => 'A4', 'pos110' => 'POS 110 mm', 'pos85' => 'POS 85 mm', 'pos80' => 'POS 80 mm', 'pos58' => 'POS 58 mm'];
    public const KINDS = ['staff' => 'Staff till', 'self_checkout' => 'Self checkout'];

    public static function installed(): bool
    {
        return Schema::hasTable('pos_stations') && Schema::hasTable('pos_station_users') && Schema::hasTable('pos_branch_settings');
    }

    /** The point of sale belongs to the Extras module: it only exists where that is licensed and switched on. */
    public static function moduleOn(): bool
    {
        try {
            return app(LicenseManager::class)->isActive('extras');
        } catch (\Throwable) {
            return false;
        }
    }

    /** Ready to use: the tables are there and the module is on. */
    public static function ready(): bool
    {
        return self::installed() && self::moduleOn();
    }

    // ── stations ──────────────────────────────────────────────────────────

    /** @param array{name?: mixed, location_id?: mixed, kind?: mixed, code?: mixed, paper?: mixed, is_default?: mixed, is_active?: mixed} $d */
    public function save(array $d, ?Station $s = null): Station
    {
        if (! self::installed()) {
            throw new BooksException('Run database script 169_pos.sql first.');
        }
        $name = trim((string) ($d['name'] ?? $s?->name ?? ''));
        if ($name === '' || mb_strlen($name) > 80) {
            throw new BooksException('Give the station a name of up to 80 letters.');
        }
        $loc = (int) ($d['location_id'] ?? $s?->location_id ?? 0);
        if (! $loc || ! Location::whereKey($loc)->exists()) {
            throw new BooksException('Choose the branch this station is at.');
        }
        if ($s && (int) $s->location_id !== $loc && DB::table('vouchers')->where('station_id', $s->id)->exists()) {
            throw new BooksException('Documents were made at this station: it can not move to another branch. Make a new station there instead.');
        }
        $kind = (string) ($d['kind'] ?? $s?->kind ?? 'staff');
        if (! isset(self::KINDS[$kind])) {
            throw new BooksException('Choose a staff till or a self checkout.');
        }
        $paper = array_key_exists('paper', $d) ? ($d['paper'] === null || $d['paper'] === '' ? null : (string) $d['paper']) : $s?->paper;
        if ($paper !== null && ! isset(self::PAPER[$paper])) {
            throw new BooksException('Choose a receipt paper from the list.');
        }
        $code = strtoupper(preg_replace('/[^A-Za-z0-9]/', '', (string) ($d['code'] ?? $s?->code ?? '')) ?? '');
        if ($code === '') {
            $code = strtoupper(Str::substr(preg_replace('/[^A-Za-z0-9]/', '', $name) ?: 'ST', 0, 6));
        }
        $code = Str::substr($code, 0, 20);
        $taken = Station::where('location_id', $loc)->where('code', $code)->when($s, fn ($q) => $q->where('id', '!=', $s->id))->exists();
        if ($taken) {
            throw new BooksException("Another station at this branch already uses the code {$code}.");
        }
        $active = array_key_exists('is_active', $d) ? (bool) $d['is_active'] : ($s?->is_active ?? true);
        $default = array_key_exists('is_default', $d) ? (bool) $d['is_default'] : ($s?->is_default ?? false);
        if ($default && ($kind !== 'staff' || ! $active)) {
            throw new BooksException('The default station of a branch is an active staff till.');
        }
        if ($kind !== 'staff' && $s && $s->kind === 'staff' && DB::table('pos_station_users')->where('station_id', $s->id)->exists()) {
            throw new BooksException('People work at this station: take them off it before making it a self checkout.');
        }

        return DB::transaction(function () use ($s, $name, $loc, $kind, $paper, $code, $active, $default) {
            $first = ! Station::where('location_id', $loc)->where('kind', 'staff')->where('is_default', true)->when($s, fn ($q) => $q->where('id', '!=', $s->id))->exists();
            $default = $default || ($first && $kind === 'staff' && $active);   // a branch's first staff till is its default
            if ($default) {
                Station::where('location_id', $loc)->where('is_default', true)->when($s, fn ($q) => $q->where('id', '!=', $s->id))->update(['is_default' => false]);
            }
            $row = ['name' => $name, 'location_id' => $loc, 'kind' => $kind, 'paper' => $paper, 'code' => $code, 'is_active' => $active, 'is_default' => $default];
            $s = $s ? tap($s)->update($row) : Station::create($row);
            if (! $active) {
                $this->afterSwitchedOff($s);
            }

            return $s->fresh();
        });
    }

    /** A station switched off is nobody's default any more, and if it was its branch's the next staff till takes over. */
    private function afterSwitchedOff(Station $s): void
    {
        DB::table('pos_station_users')->where('station_id', $s->id)->update(['is_default' => false]);
        if ($s->is_default) {
            $s->update(['is_default' => false]);
            Station::where('location_id', $s->location_id)->where('kind', 'staff')->where('is_active', true)->where('id', '!=', $s->id)->orderBy('id')->first()?->update(['is_default' => true]);
        }
    }

    /** A station nobody sold at is removed; otherwise it can only be switched off. */
    public function delete(Station $s): void
    {
        if (DB::table('vouchers')->where('station_id', $s->id)->exists()) {
            throw new BooksException('Documents were made at this station: switch it off instead.');
        }
        DB::transaction(function () use ($s) {
            DB::table('pos_station_users')->where('station_id', $s->id)->delete();
            $wasDefault = $s->is_default;
            $loc = $s->location_id;
            $s->delete();
            if ($wasDefault) {
                Station::where('location_id', $loc)->where('kind', 'staff')->where('is_active', true)->orderBy('id')->first()?->update(['is_default' => true]);
            }
        });
    }

    /** @return array<int, array<string, mixed>> */
    public function rows(?int $locationId = null): array
    {
        if (! self::installed()) {
            return [];
        }
        $names = Location::pluck('name', 'id');
        $people = DB::table('pos_station_users')->selectRaw('station_id, count(*) as n')->groupBy('station_id')->pluck('n', 'station_id');
        $used = DB::table('vouchers')->whereNotNull('station_id')->selectRaw('station_id, count(*) as n')->groupBy('station_id')->pluck('n', 'station_id');

        return Station::query()->when($locationId, fn ($q) => $q->where('location_id', $locationId))->orderBy('location_id')->orderByDesc('is_default')->orderBy('name')->get()->map(fn (Station $s) => [
            'id' => $s->id, 'location_id' => (int) $s->location_id, 'location' => $names[$s->location_id] ?? null, 'name' => $s->name, 'code' => $s->code, 'kind' => $s->kind, 'kind_label' => self::KINDS[$s->kind] ?? $s->kind,
            'paper' => $s->paper, 'is_default' => $s->is_default, 'is_active' => $s->is_active, 'people' => (int) ($people[$s->id] ?? 0), 'documents' => (int) ($used[$s->id] ?? 0),
            'last_seen_at' => $s->last_seen_at?->toIso8601String(),
        ])->values()->all();
    }

    // ── the branch's receipt paper ────────────────────────────────────────

    /** @return array{location_id: int, paper_default: string, paper_allowed: string[], require_shift: bool} */
    public function branch(int $locationId): array
    {
        $r = self::installed() ? DB::table('pos_branch_settings')->where('location_id', $locationId)->first() : null;
        $allowed = $r && $r->paper_allowed ? (array) json_decode((string) $r->paper_allowed, true) : array_keys(self::PAPER);
        $allowed = array_values(array_filter(array_keys(self::PAPER), fn ($k) => in_array($k, $allowed, true)));
        $default = $r->paper_default ?? 'pos80';

        return ['location_id' => $locationId, 'paper_default' => in_array($default, $allowed, true) ? $default : ($allowed[0] ?? 'pos80'), 'paper_allowed' => $allowed ?: array_keys(self::PAPER), 'require_shift' => $r ? (bool) $r->require_shift : true];
    }

    /** @param array{paper_default?: mixed, paper_allowed?: mixed, require_shift?: mixed} $d */
    public function saveBranch(int $locationId, array $d): array
    {
        if (! self::installed()) {
            throw new BooksException('Run database script 169_pos.sql first.');
        }
        if (! Location::whereKey($locationId)->exists()) {
            throw new BooksException('That branch does not exist.');
        }
        $cur = $this->branch($locationId);
        $allowed = array_key_exists('paper_allowed', $d) ? array_values(array_unique(array_map('strval', (array) $d['paper_allowed']))) : $cur['paper_allowed'];
        foreach ($allowed as $k) {
            if (! isset(self::PAPER[$k])) {
                throw new BooksException('Choose receipt papers from the list.');
            }
        }
        if (! $allowed) {
            throw new BooksException('Offer at least one receipt paper.');
        }
        $default = (string) ($d['paper_default'] ?? $cur['paper_default']);
        if (! in_array($default, $allowed, true)) {
            throw new BooksException('The default paper must be one of the papers offered.');
        }
        $require = array_key_exists('require_shift', $d) ? (bool) $d['require_shift'] : $cur['require_shift'];
        $order = array_values(array_filter(array_keys(self::PAPER), fn ($k) => in_array($k, $allowed, true)));
        $row = ['paper_default' => $default, 'paper_allowed' => json_encode($order), 'require_shift' => $require ? 1 : 0, 'updated_at' => now()];
        DB::table('pos_branch_settings')->updateOrInsert(['location_id' => $locationId], $row + ['created_at' => now()]);

        return $this->branch($locationId);
    }

    /** @return array<int, array<string, mixed>> every branch with its paper settings and its stations */
    public function branches(): array
    {
        $stations = collect($this->rows())->groupBy('location_id');

        return Location::orderBy('name')->get(['id', 'name'])->map(fn (Location $l) => ['id' => $l->id, 'name' => $l->name] + $this->branch($l->id) + ['stations' => ($stations[$l->id] ?? collect())->values()->all()])->all();
    }

    /** The paper a station prints on: its own, else its branch's default. */
    public function paperFor(Station $s): string
    {
        $b = $this->branch((int) $s->location_id);

        return $s->paper && in_array($s->paper, $b['paper_allowed'], true) ? $s->paper : $b['paper_default'];
    }

    // ── who works where ───────────────────────────────────────────────────

    /** The staff stations this person may be given: active ones at the branches they may use (every branch when they are not limited). @return array<int, array<string, mixed>> */
    public function choicesFor(User $u): array
    {
        if (! self::installed()) {
            return [];
        }
        $ids = app(Authorizer::class)->locationIds($u);
        $names = Location::pluck('name', 'id');

        return Station::where('kind', 'staff')->where('is_active', true)->when($ids !== null, fn ($q) => $q->whereIn('location_id', $ids))->orderBy('location_id')->orderByDesc('is_default')->orderBy('name')->get()
            ->map(fn (Station $s) => ['id' => $s->id, 'name' => $s->name, 'location_id' => (int) $s->location_id, 'location' => $names[$s->location_id] ?? null, 'is_branch_default' => $s->is_default])->values()->all();
    }

    /** @return array{ids: int[], default: ?int} */
    public function forUser(int $userId): array
    {
        if (! self::installed()) {
            return ['ids' => [], 'default' => null];
        }
        $rows = DB::table('pos_station_users')->where('user_id', $userId)->orderBy('station_id')->get();

        return ['ids' => $rows->pluck('station_id')->map(fn ($i) => (int) $i)->all(), 'default' => ($d = $rows->firstWhere('is_default', 1)) ? (int) $d->station_id : null];
    }

    /** Give a person their stations (a list, replacing the old one) and say which is theirs by default. Only stations they may be given (see choicesFor). */
    public function setUserStations(User $u, array $stationIds, ?int $default): array
    {
        if (! self::installed()) {
            throw new BooksException('Run database script 169_pos.sql first.');
        }
        $ids = array_values(array_unique(array_map('intval', $stationIds)));
        $allowed = array_column($this->choicesFor($u), 'id');
        foreach ($ids as $id) {
            if (! in_array($id, $allowed, true)) {
                throw new BooksException('One of the stations is not at a branch this person may use, or is not a staff till.');
            }
        }
        if ($default !== null && ! in_array($default, $ids, true)) {
            throw new BooksException('The default station must be one of their stations.');
        }
        if ($default === null && count($ids) === 1) {
            $default = $ids[0];
        }
        DB::transaction(function () use ($u, $ids, $default) {
            DB::table('pos_station_users')->where('user_id', $u->id)->whereNotIn('station_id', $ids ?: [0])->delete();
            foreach ($ids as $id) {
                DB::table('pos_station_users')->updateOrInsert(['user_id' => $u->id, 'station_id' => $id], ['is_default' => $id === $default ? 1 : 0, 'updated_at' => now(), 'created_at' => now()]);
            }
        });

        return $this->forUser((int) $u->id);
    }

    /**
     * The station a person sells from: the one they chose (if they may use it), else their own default, else the default of the branch, else the first staff till there. Null when there is none.
     */
    public function resolveFor(User $u, ?int $locationId = null, ?int $chosen = null): ?Station
    {
        if (! self::installed()) {
            return null;
        }
        $allowed = collect($this->choicesFor($u))->when($locationId, fn ($c) => $c->where('location_id', $locationId));
        $ids = $allowed->pluck('id')->all();
        if ($chosen && in_array($chosen, $ids, true)) {
            return Station::find($chosen);
        }
        $mine = $this->forUser((int) $u->id);
        if ($mine['default'] && in_array($mine['default'], $ids, true)) {
            return Station::find($mine['default']);
        }
        $first = $allowed->firstWhere('is_branch_default', true) ?? $allowed->first();

        return $first ? Station::find($first['id']) : null;
    }
}
