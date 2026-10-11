<?php

namespace App\Services\Menus;

use App\Models\Menus\Chef;
use App\Models\Menus\ChefCert;
use App\Models\Menus\Dish;
use App\Models\Menus\Station;
use App\Models\User;
use App\Services\Books\BooksException;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Chefs: staff with a kitchen profile (the name and bio guests may see, the stations they work, whether they teach) and the certificates they must hold, with a warning before one
 * runs out. Who is on duty comes from the attendance records that already exist.
 */
class ChefService
{
    private static ?bool $installed = null;

    public static function installed(): bool
    {
        if (app()->runningUnitTests()) {
            return Schema::hasTable('menus_chefs') && Schema::hasTable('menus_chef_certs');
        }

        return self::$installed ??= Schema::hasTable('menus_chefs') && Schema::hasTable('menus_chef_certs');
    }

    public function __construct(private ChefNotices $notices)
    {
    }

    /** Staff who could be made chefs: found by name or email, not chefs already. @return array<int, array{id: int, name: string, email: ?string}> */
    public function candidates(string $q): array
    {
        $q = trim($q);
        if (mb_strlen($q) < 2) {
            return [];
        }

        return User::query()->whereNotIn('id', Chef::pluck('user_id'))->where(fn ($w) => $w->where('name', 'like', "%{$q}%")->orWhere('email', 'like', "%{$q}%"))->orderBy('name')->limit(15)->get(['id', 'name', 'email'])
            ->map(fn ($u) => ['id' => (int) $u->id, 'name' => $u->name, 'email' => $u->email])->all();
    }

    /** @param array{user_id?: int, display_name?: string, title?: ?string, bio?: ?string, photo?: ?string, station_ids?: ?array, is_instructor?: bool, is_public?: bool, is_active?: bool, sort_order?: int} $d */
    public function save(array $d, ?int $id = null): Chef
    {
        $c = $id ? Chef::findOrFail($id) : new Chef(['is_active' => true]);
        if (! $c->exists) {
            $user = User::find($d['user_id'] ?? 0) ?? throw new BooksException('Choose the member of staff.');
            if (Chef::where('user_id', $user->id)->exists()) {
                throw new BooksException("{$user->name} is a chef already.");
            }
            $c->user_id = $user->id;
        }
        $name = trim((string) ($d['display_name'] ?? $c->display_name ?? ''));
        if ($name === '') {
            $name = (string) ($c->exists ? $c->user?->name : User::find($c->user_id)?->name);
        }
        if ($name === '') {
            throw new BooksException('Give the chef a name to show.');
        }
        $stations = array_key_exists('station_ids', $d) ? array_values(array_unique(array_map('intval', (array) $d['station_ids']))) : ($c->station_ids ?? []);
        if ($stations && KitchenService::installed() && Station::whereIn('id', $stations)->count() !== count($stations)) {
            throw new BooksException('One of those stations does not exist.');
        }
        $c->fill(['display_name' => mb_substr($name, 0, 80), 'station_ids' => $stations ?: null]
            + array_map(fn ($v) => is_string($v) ? (trim($v) === '' ? null : trim($v)) : $v, array_intersect_key($d, array_flip(['title', 'bio', 'photo'])))
            + array_intersect_key($d, array_flip(['is_instructor', 'is_public', 'is_active', 'sort_order'])));
        if (mb_strlen((string) $c->title) > 80 || mb_strlen((string) $c->bio) > 2000 || mb_strlen((string) $c->photo) > 255) {
            throw new BooksException('The title, bio or photo address is too long.');
        }
        if (! $c->is_active) {
            $c->is_public = false;
        }
        if (array_key_exists('pay_mode', $d) || array_key_exists('shift_rate', $d) || array_key_exists('hour_rate', $d)) {   // how the chef is paid (the caller only passes these on to people with payroll access)
            if (! Schema::hasColumn('menus_chefs', 'pay_mode')) {
                throw new BooksException('Run database script 149_menus_rota_more_pay.sql before setting how a chef is paid.');
            }
            $mode = (string) ($d['pay_mode'] ?? $c->pay_mode ?? 'salary');
            if (! isset(Chef::PAY_MODES[$mode])) {
                throw new BooksException('Choose how the chef is paid.');
            }
            $shift = array_key_exists('shift_rate', $d) ? ($d['shift_rate'] === null || $d['shift_rate'] === '' ? null : round((float) $d['shift_rate'], 2)) : $c->shift_rate;
            $hour = array_key_exists('hour_rate', $d) ? ($d['hour_rate'] === null || $d['hour_rate'] === '' ? null : round((float) $d['hour_rate'], 2)) : $c->hour_rate;
            foreach ([$shift, $hour] as $rate) {
                if ($rate !== null && ($rate < 0 || $rate > 10000000)) {
                    throw new BooksException('A rate can not be negative or more than 10,000,000.');
                }
            }
            if ($mode === 'per_shift' && (! $shift || $shift <= 0)) {
                throw new BooksException('Give the amount paid for each shift.');
            }
            if ($mode === 'per_hour' && (! $hour || $hour <= 0)) {
                throw new BooksException('Give the amount paid for each hour.');
            }
            $c->fill(['pay_mode' => $mode, 'shift_rate' => $shift, 'hour_rate' => $hour]);
        }
        $c->save();

        return $c->fresh();
    }

    public function delete(Chef $c): void
    {
        DB::transaction(function () use ($c) {
            if (Schema::hasColumn('menus_dishes', 'chef_id')) {
                Dish::where('chef_id', $c->id)->update(['chef_id' => null]);
            }
            ChefCert::where('chef_id', $c->id)->delete();
            $c->delete();
        });
    }

    // ── certificates ─────────────────────────────────────────────────────

    public function saveCert(Chef $c, array $d, ?int $certId = null): ChefCert
    {
        $cert = $certId ? ChefCert::where('chef_id', $c->id)->findOrFail($certId) : new ChefCert(['chef_id' => $c->id]);
        $kind = (string) ($d['kind'] ?? $cert->kind ?? 'food_handler');
        if (! isset(ChefCert::KINDS[$kind])) {
            throw new BooksException('Choose the kind of certificate.');
        }
        $name = trim((string) ($d['name'] ?? $cert->name ?? ''));
        if ($name === '') {
            $name = ChefCert::KINDS[$kind];
        }
        $issued = array_key_exists('issued_on', $d) ? ($d['issued_on'] ?: null) : $cert->issued_on?->toDateString();
        $expires = array_key_exists('expires_on', $d) ? ($d['expires_on'] ?: null) : $cert->expires_on?->toDateString();
        if ($issued && $expires && $expires < $issued) {
            throw new BooksException('The certificate runs out before it was issued.');
        }
        $dateChanged = $expires !== $cert->expires_on?->toDateString();
        $cert->fill(['kind' => $kind, 'name' => mb_substr($name, 0, 120), 'number' => array_key_exists('number', $d) ? (trim((string) $d['number']) ?: null) : $cert->number,
            'issued_on' => $issued, 'expires_on' => $expires, 'notes' => array_key_exists('notes', $d) ? (mb_substr(trim((string) $d['notes']), 0, 255) ?: null) : $cert->notes]);
        if ($dateChanged) {   // renewed or corrected: the warnings start again
            $cert->warned_at = null;
            $cert->expired_told_at = null;
        }
        $cert->save();

        return $cert->fresh();
    }

    public function deleteCert(Chef $c, int $certId): void
    {
        ChefCert::where('chef_id', $c->id)->findOrFail($certId)->delete();
    }

    /**
     * Warn about certificates that run out within a month, and say so when one has. Each warning goes once (renewing the date starts them again). @return array{warned: int, expired: int}
     */
    public function sweepCerts(?Carbon $today = null): array
    {
        $today = ($today ?? today())->copy()->startOfDay();
        $out = ['warned' => 0, 'expired' => 0];
        if (! self::installed()) {
            return $out;
        }
        $certs = ChefCert::with('chef.user')->whereNotNull('expires_on')->whereHas('chef', fn ($q) => $q->where('is_active', true))->where('expires_on', '<=', $today->copy()->addDays(ChefCert::WARN_DAYS)->toDateString())->get();
        foreach ($certs as $cert) {
            $stage = $cert->standing($today);
            if ($stage === 'expired' && ! $cert->expired_told_at) {
                $this->notices->certificate($cert->chef, $cert, 'expired');
                $cert->update(['expired_told_at' => now(), 'warned_at' => $cert->warned_at ?? now()]);
                $out['expired']++;
            } elseif ($stage === 'expiring' && ! $cert->warned_at) {
                $this->notices->certificate($cert->chef, $cert, 'expiring');
                $cert->update(['warned_at' => now()]);
                $out['warned']++;
            }
        }

        return $out;
    }

    // ── what the screens show ────────────────────────────────────────────

    /** Staff signed in and not yet out today (from the attendance records). @return int[] user ids */
    public function onDuty(?Carbon $today = null): array
    {
        if (! Schema::hasTable('attendance_days')) {
            return [];
        }

        return DB::table('attendance_days')->where('work_date', ($today ?? today())->toDateString())->whereNotNull('sign_in_at')->whereNull('sign_out_at')->pluck('user_id')->map(fn ($i) => (int) $i)->all();
    }

    /** @return array<int, array<string, mixed>> every chef with certificates and whether they are on duty (Menus → Chefs) */
    public function roster(?Carbon $today = null): array
    {
        $today ??= today();
        $duty = $this->onDuty($today);
        $stations = KitchenService::installed() ? Station::pluck('name', 'id') : collect();
        $rostered = app(RotaService::class)->rosteredOn($today);   // (script 145; empty until it is run)

        return Chef::with('user:id,name,email', 'certs')->orderBy('sort_order')->orderBy('display_name')->get()->map(function (Chef $c) use ($today, $duty, $stations, $rostered) {
            $certs = $c->certs->map(fn (ChefCert $x) => ['id' => $x->id, 'kind' => $x->kind, 'kind_label' => ChefCert::KINDS[$x->kind] ?? $x->kind, 'name' => $x->name, 'number' => $x->number, 'issued_on' => $x->issued_on?->toDateString(),
                'expires_on' => $x->expires_on?->toDateString(), 'standing' => $x->standing($today), 'days_left' => $x->expires_on ? (int) $today->copy()->startOfDay()->diffInDays($x->expires_on, false) : null, 'notes' => $x->notes])->values()->all();

            return ['id' => $c->id, 'user_id' => $c->user_id, 'user' => $c->user?->name, 'email' => $c->user?->email, 'display_name' => $c->display_name, 'title' => $c->title, 'bio' => $c->bio, 'photo' => $c->photo,
                'station_ids' => $c->station_ids ?? [], 'stations' => collect($c->station_ids ?? [])->map(fn ($id) => $stations[$id] ?? null)->filter()->values()->all(), 'is_instructor' => $c->is_instructor, 'is_public' => $c->is_public,
                'is_active' => $c->is_active, 'sort_order' => $c->sort_order, 'pay_mode' => $c->pay_mode ?? 'salary', 'shift_rate' => $c->shift_rate ?? null, 'hour_rate' => $c->hour_rate ?? null, 'on_duty' => in_array((int) $c->user_id, $duty, true), 'rostered_today' => $rostered[$c->id] ?? null, 'certs' => $certs,
                'attention' => count(array_filter($certs, fn ($x) => in_array($x['standing'], ['expiring', 'expired'], true))), 'dishes' => Schema::hasColumn('menus_dishes', 'chef_id') ? Dish::where('chef_id', $c->id)->count() : 0];
        })->values()->all();
    }

    /** The chefs a guest may see. @return array<int, array<string, mixed>> */
    public function publicList(): array
    {
        if (! self::installed()) {
            return [];
        }
        $stations = KitchenService::installed() ? Station::pluck('name', 'id') : collect();
        $hasDishes = Schema::hasColumn('menus_dishes', 'chef_id');

        return Chef::where('is_public', true)->where('is_active', true)->orderBy('sort_order')->orderBy('display_name')->get()->map(fn (Chef $c) => [
            'id' => $c->id, 'name' => $c->display_name, 'title' => $c->title, 'bio' => $c->bio, 'photo' => $c->photo, 'instructor' => $c->is_instructor,
            'stations' => collect($c->station_ids ?? [])->map(fn ($id) => $stations[$id] ?? null)->filter()->values()->all(),
            'dishes' => $hasDishes ? Dish::where('chef_id', $c->id)->where('is_active', true)->orderBy('name')->limit(8)->pluck('name')->all() : [],
        ])->values()->all();
    }
}
