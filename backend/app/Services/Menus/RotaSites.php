<?php

namespace App\Services\Menus;

use App\Models\Location;
use App\Services\Books\BooksException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Clocking in by place. A branch has a point (its own address point from Locations, or one set here) and a radius; when Menus settings ask for it, a chef clocking in from the rota page
 * sends where the phone is and it is compared with the branch of the shift. *warn* records it and lets the chef in; *require* turns the chef away when they are away from the branch, give no position
 * or give one too rough to trust. A branch with no known point is never checked. Every clock-in and clock-out is logged with where it was. The position is the browser's own report: it can be faked, so
 * this is a deterrent and a record, not proof; Attendance stays the record that payroll uses.
 */
class RotaSites
{
    public static function installed(): bool
    {
        return Schema::hasTable('menus_clock_sites') && Schema::hasTable('menus_clock_events');
    }

    /** Metres between two points on the earth (great circle). */
    public static function distance(float $lat1, float $lng1, float $lat2, float $lng2): float
    {
        $r = 6371000.0;
        $a = deg2rad($lat2 - $lat1);
        $b = deg2rad($lng2 - $lng1);
        $h = sin($a / 2) ** 2 + cos(deg2rad($lat1)) * cos(deg2rad($lat2)) * sin($b / 2) ** 2;

        return 2 * $r * asin(min(1.0, sqrt($h)));
    }

    /** @return array{lat: float, lng: float, radius: int, source: string}|null where the branch is for clocking in, or null when no point is known (or the place is switched off) */
    public function site(int $locationId): ?array
    {
        $row = self::installed() ? DB::table('menus_clock_sites')->where('location_id', $locationId)->first() : null;
        if ($row && ! $row->is_active) {
            return null;
        }
        $loc = Location::find($locationId);
        $lat = $row?->latitude ?? $loc?->latitude;
        $lng = $row?->longitude ?? $loc?->longitude;
        if ($lat === null || $lng === null) {
            return null;
        }

        return ['lat' => (float) $lat, 'lng' => (float) $lng, 'radius' => (int) ($row?->radius_m ?: MenusSettings::all()['rota_clock_radius']), 'source' => $row?->latitude !== null ? 'site' : 'branch'];
    }

    /**
     * Is this position at the branch? Returns the result and, when it could be worked out, how far away.
     *
     * @param array{lat?: mixed, lng?: mixed, accuracy?: mixed} $pos
     * @return array{result: string, distance: ?int, blocked: bool, message: ?string, site: ?array}
     */
    public function check(int $locationId, array $pos): array
    {
        $mode = MenusSettings::all()['rota_clock_location'];
        if ($mode === 'off' || ! self::installed()) {
            return ['result' => 'ok', 'distance' => null, 'blocked' => false, 'message' => null, 'site' => null];
        }
        $site = $this->site($locationId);
        if (! $site) {
            return ['result' => 'no_site', 'distance' => null, 'blocked' => false, 'message' => null, 'site' => null];
        }
        $block = $mode === 'require';
        $has = isset($pos['lat'], $pos['lng']) && is_numeric($pos['lat']) && is_numeric($pos['lng']) && abs((float) $pos['lat']) <= 90 && abs((float) $pos['lng']) <= 180;
        if (! $has) {
            return ['result' => 'no_position', 'distance' => null, 'blocked' => $block, 'site' => $site, 'message' => 'Allow your phone or browser to share your location, then try again.'];
        }
        $acc = isset($pos['accuracy']) && is_numeric($pos['accuracy']) ? max(0, (int) round((float) $pos['accuracy'])) : null;
        $limit = (int) MenusSettings::all()['rota_clock_accuracy'];
        $d = (int) round(self::distance((float) $pos['lat'], (float) $pos['lng'], $site['lat'], $site['lng']));
        if ($acc === null || $acc > $limit) {
            return ['result' => 'poor_signal', 'distance' => $d, 'blocked' => $block, 'site' => $site, 'message' => 'Your location is not clear enough ('.($acc === null ? 'unknown accuracy' : "about {$acc} m").'). Move to a window or outside and try again.'];
        }
        // the phone may be anywhere inside its own accuracy circle: it is "there" if the circle reaches the branch's
        if ($d - $acc > $site['radius']) {
            return ['result' => $block ? 'outside' : 'warned', 'distance' => $d, 'blocked' => $block, 'site' => $site, 'message' => "You are about {$d} m from the branch: clock in when you are there."];
        }

        return ['result' => 'ok', 'distance' => $d, 'blocked' => false, 'message' => null, 'site' => $site];
    }

    /** Write one line to the clock log. */
    public function log(int $userId, ?int $chefId, ?int $shiftId, ?int $locationId, string $action, array $pos, array $check): void
    {
        if (! self::installed()) {
            return;
        }
        DB::table('menus_clock_events')->insert(['user_id' => $userId, 'chef_id' => $chefId, 'shift_id' => $shiftId, 'location_id' => $locationId, 'action' => $action,
            'latitude' => isset($pos['lat']) && is_numeric($pos['lat']) ? round((float) $pos['lat'], 7) : null, 'longitude' => isset($pos['lng']) && is_numeric($pos['lng']) ? round((float) $pos['lng'], 7) : null,
            'accuracy_m' => isset($pos['accuracy']) && is_numeric($pos['accuracy']) ? (int) round((float) $pos['accuracy']) : null, 'distance_m' => $check['distance'], 'result' => $check['result'], 'created_at' => now()]);
    }

    /** Set a branch's clocking point and radius (empty point: the branch's own address point is used). @param array{latitude?: mixed, longitude?: mixed, radius_m?: mixed, is_active?: mixed} $d */
    public function save(int $locationId, array $d): void
    {
        if (! self::installed()) {
            throw new BooksException('Run database script 148_menus_rota_pay.sql first.');
        }
        if (! Location::whereKey($locationId)->exists()) {
            throw new BooksException('That branch does not exist.');
        }
        $lat = $d['latitude'] ?? null;
        $lng = $d['longitude'] ?? null;
        $has = $lat !== null && $lat !== '' && $lng !== null && $lng !== '';
        if (($lat !== null && $lat !== '') xor ($lng !== null && $lng !== '')) {
            throw new BooksException('Give both the latitude and the longitude, or neither.');
        }
        if ($has && (! is_numeric($lat) || ! is_numeric($lng) || abs((float) $lat) > 90 || abs((float) $lng) > 180)) {
            throw new BooksException('The latitude is between -90 and 90 and the longitude between -180 and 180.');
        }
        $radius = (int) ($d['radius_m'] ?? 150);
        if ($radius < 20 || $radius > 5000) {
            throw new BooksException('The radius is between 20 and 5000 metres.');
        }
        $row = ['latitude' => $has ? round((float) $lat, 7) : null, 'longitude' => $has ? round((float) $lng, 7) : null, 'radius_m' => $radius, 'is_active' => ! array_key_exists('is_active', $d) || (bool) $d['is_active'], 'updated_at' => now()];
        DB::table('menus_clock_sites')->where('location_id', $locationId)->exists()
            ? DB::table('menus_clock_sites')->where('location_id', $locationId)->update($row)
            : DB::table('menus_clock_sites')->insert($row + ['location_id' => $locationId, 'created_at' => now()]);
    }

    /** @return array<int, array<string, mixed>> every branch with where it is for clocking in */
    public function rows(): array
    {
        $sites = self::installed() ? DB::table('menus_clock_sites')->get()->keyBy('location_id') : collect();

        return Location::query()->orderBy('name')->get()->map(function (Location $l) use ($sites) {
            $s = $sites[$l->id] ?? null;

            return ['location_id' => $l->id, 'name' => $l->name, 'branch_latitude' => $l->latitude !== null ? (float) $l->latitude : null, 'branch_longitude' => $l->longitude !== null ? (float) $l->longitude : null,
                'latitude' => $s?->latitude !== null ? (float) $s->latitude : null, 'longitude' => $s?->longitude !== null ? (float) $s->longitude : null, 'radius_m' => (int) ($s?->radius_m ?: MenusSettings::all()['rota_clock_radius']),
                'is_active' => $s ? (bool) $s->is_active : true, 'checked' => $this->site($l->id) !== null];
        })->values()->all();
    }

    /** The recent clock lines that were not simply "ok" (and the last few that were): for the manager to look over. @return array<int, array<string, mixed>> */
    public function events(int $days = 14, bool $problemsOnly = true): array
    {
        if (! self::installed()) {
            return [];
        }
        $names = \App\Models\Menus\Chef::pluck('display_name', 'id');
        $places = Location::pluck('name', 'id');

        return DB::table('menus_clock_events')->where('created_at', '>=', now()->subDays($days))->when($problemsOnly, fn ($q) => $q->whereNotIn('result', ['ok', 'no_site']))->orderByDesc('id')->limit(100)->get()
            ->map(fn ($e) => ['id' => $e->id, 'chef' => $names[$e->chef_id] ?? null, 'branch' => $places[$e->location_id] ?? null, 'action' => $e->action, 'result' => $e->result, 'distance_m' => $e->distance_m, 'accuracy_m' => $e->accuracy_m,
                'at' => \Illuminate\Support\Carbon::parse($e->created_at)->toIso8601String()])->all();
    }
}
