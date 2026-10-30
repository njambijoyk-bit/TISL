<?php

namespace App\Services\Events;

use App\Models\Events\EventVendor;
use App\Models\Events\EventVenue;
use App\Models\User;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

/**
 * Vendors (suppliers) and venues: business profiles with packages or spaces, verified by admin before they are listed, run by their own people. A provider is either a vendor or a venue; the rules are
 * the same, so one service handles both ($type is 'vendor' or 'venue'). Bookings and payments come in a later phase; this is the profile, the offer and the verification.
 */
final class EventMarketplace
{
    private const MODELS = ['vendor' => EventVendor::class, 'venue' => EventVenue::class];
    private const OFFERS = ['vendor' => ['event_vendor_packages', 'vendor_id'], 'venue' => ['event_venue_spaces', 'venue_id']];
    private const PROFILE = [
        'vendor' => ['name', 'category', 'summary', 'description', 'email', 'phone', 'website', 'logo', 'service_areas', 'tax_pin', 'registration_no', 'is_listed'],
        'venue' => ['name', 'summary', 'description', 'country', 'county', 'town', 'address', 'latitude', 'longitude', 'map_url', 'directions', 'parking', 'accessibility', 'facilities', 'email', 'phone', 'website', 'tax_pin', 'registration_no', 'is_listed'],
    ];

    public static function ready(): bool
    {
        return Schema::hasTable('event_vendors') && Schema::hasTable('event_venues') && Schema::hasTable('event_provider_members');
    }

    private function model(string $type): string
    {
        return self::MODELS[$type] ?? throw ValidationException::withMessages(['type' => 'A provider is a vendor or a venue.']);
    }

    public function find(string $type, int $id): Model
    {
        return $this->model($type)::findOrFail($id);
    }

    private function slug(string $type, string $name): string
    {
        $m = $this->model($type);
        $base = Str::slug($name) ?: $type;
        $slug = $base;
        for ($i = 2; $m::withTrashed()->where('slug', $slug)->exists(); $i++) {
            $slug = $base . '-' . $i;
        }

        return $slug;
    }

    // ── people ───────────────────────────────────────────────────────────

    public function memberRole(string $type, int $id, ?User $u): ?string
    {
        return $u ? DB::table('event_provider_members')->where(['provider_type' => $type, 'provider_id' => $id, 'user_id' => $u->id])->value('role') : null;
    }

    /** May this person run this provider (its profile, offer and people)? Its owner or a manager, or the platform's admin. */
    public function canManage(string $type, int $id, ?User $u, bool $isAdmin): bool
    {
        return $isAdmin || in_array($this->memberRole($type, $id, $u), ['owner', 'manager'], true);
    }

    public function members(string $type, int $id): array
    {
        return DB::table('event_provider_members')->where(['provider_type' => $type, 'provider_id' => $id])->get()->map(function ($m) {
            $u = User::find($m->user_id);

            return ['user_id' => (int) $m->user_id, 'name' => $u?->name, 'email' => $u?->email, 'role' => $m->role];
        })->all();
    }

    public function addMember(string $type, int $id, User $user, string $role): void
    {
        if (! in_array($role, ['owner', 'manager', 'staff'], true)) {
            throw ValidationException::withMessages(['role' => 'Choose owner, manager or staff.']);
        }
        DB::table('event_provider_members')->updateOrInsert(['provider_type' => $type, 'provider_id' => $id, 'user_id' => $user->id], ['role' => $role, 'created_at' => now(), 'updated_at' => now()]);
    }

    public function removeMember(string $type, int $id, int $userId): void
    {
        $q = DB::table('event_provider_members')->where(['provider_type' => $type, 'provider_id' => $id]);
        $mine = (clone $q)->where('user_id', $userId)->first();
        if ($mine && $mine->role === 'owner' && (clone $q)->where('role', 'owner')->count() <= 1) {
            throw ValidationException::withMessages(['user' => 'It needs at least one owner.']);
        }
        (clone $q)->where('user_id', $userId)->delete();
    }

    /** The providers a person acts for. */
    public function mine(User $u): array
    {
        return DB::table('event_provider_members')->where('user_id', $u->id)->get()->map(function ($m) {
            $p = $this->model($m->provider_type)::find($m->provider_id);

            return $p ? $this->shape($m->provider_type, $p) + ['role' => $m->role] : null;
        })->filter()->values()->all();
    }

    // ── profile ──────────────────────────────────────────────────────────

    /** Sign up as a vendor or venue: pending until admin verifies, the person is its owner. */
    public function apply(string $type, User $u, array $in): Model
    {
        $name = trim((string) ($in['name'] ?? ''));
        if ($name === '') {
            throw ValidationException::withMessages(['name' => 'Give the name of the business.']);
        }
        if ($type === 'vendor' && ! array_key_exists($in['category'] ?? 'other', EventVendor::CATEGORIES)) {
            throw ValidationException::withMessages(['category' => 'Choose what kind of vendor this is.']);
        }

        return DB::transaction(function () use ($type, $u, $in, $name) {
            $p = $this->model($type)::create(array_intersect_key($in, array_flip(self::PROFILE[$type])) + ['name' => $name, 'slug' => $this->slug($type, $name), 'status' => 'pending', 'is_listed' => true, 'created_by' => $u->id]);
            $this->addMember($type, $p->id, $u, 'owner');

            return $p;
        });
    }

    public function update(string $type, Model $p, array $in): Model
    {
        $p->update(array_intersect_key($in, array_flip(self::PROFILE[$type])));

        return $p->fresh();
    }

    public function setStatus(string $type, Model $p, string $status, ?string $note, ?User $by): Model
    {
        if (! in_array($status, ['pending', 'verified', 'suspended', 'rejected'], true)) {
            throw ValidationException::withMessages(['status' => 'Choose pending, verified, suspended or rejected.']);
        }
        $p->update(['status' => $status, 'status_note' => $note, 'verified_at' => $status === 'verified' ? now() : $p->verified_at, 'verified_by' => $status === 'verified' ? $by?->id : $p->verified_by]);

        return $p->fresh();
    }

    public function setCommission(Model $p, ?float $percent): Model
    {
        if ($percent !== null && ($percent < 0 || $percent > 100)) {
            throw ValidationException::withMessages(['commission_percent' => 'A commission is between 0 and 100 percent.']);
        }
        $p->update(['commission_percent' => $percent]);

        return $p->fresh();
    }

    /** What TISL keeps of a booking: the provider's own rate, else the events default. */
    public function commissionFor(Model $p): float
    {
        return (float) ($p->commission_percent ?? EventSettings::all()['commission_percent'] ?? 10);
    }

    public function shape(string $type, Model $p): array
    {
        $base = ['type' => $type, 'id' => (int) $p->id, 'name' => $p->name, 'slug' => $p->slug, 'summary' => $p->summary, 'description' => $p->description, 'email' => $p->email, 'phone' => $p->phone, 'website' => $p->website,
            'status' => $p->status, 'status_note' => $p->status_note, 'is_listed' => (bool) $p->is_listed, 'verified_at' => $p->verified_at?->toIso8601String(),
            'commission_percent' => $p->commission_percent !== null ? (float) $p->commission_percent : null, 'commission_in_force' => $this->commissionFor($p), 'tax_pin' => $p->tax_pin, 'registration_no' => $p->registration_no];
        if ($type === 'vendor') {
            return $base + ['category' => $p->category, 'category_name' => EventVendor::CATEGORIES[$p->category] ?? $p->category, 'logo' => $p->logo, 'service_areas' => $p->service_areas ?? []];
        }

        return $base + ['country' => $p->country, 'county' => $p->county, 'town' => $p->town, 'address' => $p->address, 'latitude' => $p->latitude, 'longitude' => $p->longitude, 'map_url' => $p->map_url, 'directions' => $p->directions,
            'parking' => $p->parking, 'accessibility' => $p->accessibility, 'facilities' => $p->facilities ?? []];
    }

    // ── the offer: packages and spaces ───────────────────────────────────

    public function offers(string $type, int $id, bool $onlyActive): array
    {
        [$table, $col] = self::OFFERS[$type];

        return DB::table($table)->where($col, $id)->when($onlyActive, fn ($q) => $q->where('is_active', 1))->orderBy('sort_order')->orderBy('id')->get()->map(function ($r) {
            $r = (array) $r;
            foreach (['inclusions', 'layouts'] as $k) {
                if (isset($r[$k]) && is_string($r[$k])) {
                    $r[$k] = json_decode($r[$k], true);
                }
            }

            return $r;
        })->all();
    }

    /** Add or change a package (vendor) or a space (venue). */
    public function saveOffer(string $type, int $providerId, array $in, ?int $offerId = null): array
    {
        [$table, $col] = self::OFFERS[$type];
        $name = trim((string) ($in['name'] ?? ''));
        if ($name === '') {
            throw ValidationException::withMessages(['name' => 'Give it a name.']);
        }
        $price = (float) ($in['price'] ?? 0);
        if ($price < 0) {
            throw ValidationException::withMessages(['price' => 'A price cannot be negative.']);
        }
        $units = $type === 'vendor' ? ['fixed', 'per_guest', 'per_hour', 'per_day'] : ['fixed', 'per_hour', 'per_day'];
        $unit = $in['price_unit'] ?? ($type === 'vendor' ? 'fixed' : 'per_day');
        if (! in_array($unit, $units, true)) {
            throw ValidationException::withMessages(['price_unit' => 'Choose ' . implode(', ', $units) . '.']);
        }
        $dep = isset($in['deposit_percent']) && $in['deposit_percent'] !== '' ? (float) $in['deposit_percent'] : null;
        if ($dep !== null && ($dep < 0 || $dep > 100)) {
            throw ValidationException::withMessages(['deposit_percent' => 'A deposit is between 0 and 100 percent.']);
        }
        $row = ['name' => $name, 'description' => $in['description'] ?? null, 'price' => $price, 'price_unit' => $unit, 'currency_id' => $in['currency_id'] ?? null, 'deposit_percent' => $dep,
            'cancellation_policy' => $in['cancellation_policy'] ?? null, 'is_active' => (bool) ($in['is_active'] ?? true), 'sort_order' => (int) ($in['sort_order'] ?? 0), 'updated_at' => now()];
        if ($type === 'vendor') {
            $row += ['min_guests' => $in['min_guests'] ?? null, 'max_guests' => $in['max_guests'] ?? null, 'inclusions' => isset($in['inclusions']) ? json_encode(array_values((array) $in['inclusions'])) : null];
        } else {
            $row += ['capacity' => $in['capacity'] ?? null, 'layouts' => isset($in['layouts']) ? json_encode((array) $in['layouts']) : null];
        }
        if ($offerId) {
            abort_unless(DB::table($table)->where($col, $providerId)->where('id', $offerId)->update($row), 404);
        } else {
            $offerId = (int) DB::table($table)->insertGetId($row + [$col => $providerId, 'created_at' => now()]);
        }

        return collect($this->offers($type, $providerId, false))->firstWhere('id', $offerId);
    }

    public function removeOffer(string $type, int $providerId, int $offerId): void
    {
        [$table, $col] = self::OFFERS[$type];
        DB::table($table)->where($col, $providerId)->where('id', $offerId)->delete();   // bookings (a later phase) will switch off rather than delete
    }

    // ── the public directory ─────────────────────────────────────────────

    /** Verified and listed providers, searchable. $f: q, category (vendor), county (venue), area (vendor service area), min_capacity (venue). */
    public function directory(string $type, array $f): array
    {
        $rows = $this->model($type)::query()->where('status', 'verified')->where('is_listed', true)
            ->when($f['q'] ?? null, fn ($q, $s) => $q->where(fn ($w) => $w->where('name', 'like', "%{$s}%")->orWhere('summary', 'like', "%{$s}%")))
            ->when($type === 'vendor' ? ($f['category'] ?? null) : null, fn ($q, $c) => $q->where('category', $c))
            ->when($type === 'venue' ? ($f['county'] ?? null) : null, fn ($q, $c) => $q->where('county', $c))
            ->orderBy('name')->get();
        if ($type === 'vendor' && ! empty($f['area'])) {
            $area = mb_strtolower((string) $f['area']);
            $rows = $rows->filter(fn ($v) => collect($v->service_areas ?? [])->contains(fn ($a) => mb_strtolower((string) $a) === $area));
        }
        $spaces = $type === 'venue' ? DB::table('event_venue_spaces')->whereIn('venue_id', $rows->pluck('id'))->where('is_active', 1)->get()->groupBy('venue_id') : collect();
        $ratings = Schema::hasTable('event_reviews') ? DB::table('event_reviews')->where('provider_type', $type)->selectRaw('provider_id, ROUND(AVG(rating),1) AS r')->groupBy('provider_id')->pluck('r', 'provider_id') : collect();
        $out = $rows->map(function ($p) use ($type, $spaces, $ratings) {
            $row = $this->shape($type, $p) + ['rating' => isset($ratings[$p->id]) ? (float) $ratings[$p->id] : null];
            if ($type === 'venue') {
                $row['max_capacity'] = (int) ($spaces[$p->id] ?? collect())->max('capacity');
            }

            return $row;
        });
        if ($type === 'venue' && ! empty($f['min_capacity'])) {
            $out = $out->filter(fn ($r) => $r['max_capacity'] >= (int) $f['min_capacity']);
        }

        return $out->values()->all();
    }
}
