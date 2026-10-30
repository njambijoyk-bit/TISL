<?php

namespace App\Services\Events;

use App\Models\Events\EventOrganiser;
use App\Models\Events\EventOrganiserMember;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

/** Outside organisers: signing up, verification by admin, who acts for them, their commission and the proof they sent. TISL itself is the internal organiser. */
final class EventOrganiserService
{
    public static function ready(): bool
    {
        return Schema::hasTable('event_organisers');
    }

    private function slug(string $name): string
    {
        $base = Str::slug($name) ?: 'organiser';
        $slug = $base;
        for ($i = 2; EventOrganiser::withTrashed()->where('slug', $slug)->exists(); $i++) {
            $slug = $base . '-' . $i;
        }

        return $slug;
    }

    /** A signed-in person asks to organise events: the account waits to be verified, and they are its owner. */
    public function apply(User $user, array $in): EventOrganiser
    {
        $name = trim((string) ($in['name'] ?? ''));
        if ($name === '') {
            throw ValidationException::withMessages(['name' => 'Give the name of your business or yourself.']);
        }
        if (EventOrganiserMember::where('user_id', $user->id)->where('role', 'owner')->exists()) {
            throw ValidationException::withMessages(['name' => 'You already have an organiser account. Ask admin if you need another.']);
        }

        return DB::transaction(function () use ($user, $in, $name) {
            $o = EventOrganiser::create(['name' => $name, 'slug' => $this->slug($name), 'kind' => array_key_exists($in['kind'] ?? '', EventOrganiser::KINDS) ? $in['kind'] : 'business',
                'email' => $in['email'] ?? $user->email, 'phone' => $in['phone'] ?? null, 'website' => $in['website'] ?? null, 'description' => $in['description'] ?? null,
                'tax_pin' => $in['tax_pin'] ?? null, 'registration_no' => $in['registration_no'] ?? null, 'status' => 'pending', 'is_internal' => false, 'created_by' => $user->id]);
            EventOrganiserMember::create(['organiser_id' => $o->id, 'user_id' => $user->id, 'role' => 'owner']);

            return $o;
        });
    }

    /** The organisers a person acts for, with their role. */
    public function mine(User $user): array
    {
        return EventOrganiserMember::with('organiser')->where('user_id', $user->id)->get()->map(fn ($m) => $this->shape($m->organiser) + ['role' => $m->role])->all();
    }

    public function shape(EventOrganiser $o): array
    {
        return ['id' => (int) $o->id, 'name' => $o->name, 'slug' => $o->slug, 'kind' => $o->kind, 'email' => $o->email, 'phone' => $o->phone, 'website' => $o->website, 'logo' => $o->logo, 'description' => $o->description,
            'tax_pin' => $o->tax_pin, 'registration_no' => $o->registration_no, 'status' => $o->status, 'status_note' => $o->status_note, 'verified_at' => $o->verified_at?->toIso8601String(), 'is_internal' => (bool) $o->is_internal,
            'commission_percent' => $o->commission_percent !== null ? (float) $o->commission_percent : null, 'commission_in_force' => $this->commissionFor($o), 'in_good_standing' => $o->inGoodStanding()];
    }

    /** The organisers, for admin, with how many events and people each has. */
    public function all(?string $status = null): array
    {
        $events = DB::table('events')->whereNull('deleted_at')->selectRaw('organiser_id, COUNT(*) AS n')->groupBy('organiser_id')->pluck('n', 'organiser_id');
        $members = EventOrganiserMember::selectRaw('organiser_id, COUNT(*) AS n')->groupBy('organiser_id')->pluck('n', 'organiser_id');
        $docs = DB::table('event_documents')->where('owner_type', 'organiser')->where('status', 'pending')->selectRaw('owner_id, COUNT(*) AS n')->groupBy('owner_id')->pluck('n', 'owner_id');

        return EventOrganiser::when($status, fn ($q) => $q->where('status', $status))->orderByDesc('is_internal')->orderBy('name')->get()
            ->map(fn ($o) => $this->shape($o) + ['events' => (int) ($events[$o->id] ?? 0), 'members' => (int) ($members[$o->id] ?? 0), 'documents_waiting' => (int) ($docs[$o->id] ?? 0)])->all();
    }

    public function update(EventOrganiser $o, array $in): EventOrganiser
    {
        $o->update(array_intersect_key($in, array_flip(['name', 'kind', 'email', 'phone', 'website', 'logo', 'description', 'tax_pin', 'registration_no'])));

        return $o->fresh();
    }

    /** Admin: verify, suspend, reject or send back to pending. Suspending or rejecting takes the organiser's events off the public list (their sales stop; tickets already sold stay valid). */
    public function setStatus(EventOrganiser $o, string $status, ?string $note, ?User $by): EventOrganiser
    {
        if (! in_array($status, EventOrganiser::STATUSES, true)) {
            throw ValidationException::withMessages(['status' => 'Choose pending, verified, suspended or rejected.']);
        }
        if ($o->is_internal && $status !== 'verified') {
            throw ValidationException::withMessages(['status' => 'TISL itself cannot be suspended.']);
        }
        $o->update(['status' => $status, 'status_note' => $note, 'verified_at' => $status === 'verified' ? now() : $o->verified_at, 'verified_by' => $status === 'verified' ? $by?->id : $o->verified_by]);

        return $o->fresh();
    }

    public function setCommission(EventOrganiser $o, ?float $percent): EventOrganiser
    {
        if ($percent !== null && ($percent < 0 || $percent > 100)) {
            throw ValidationException::withMessages(['commission_percent' => 'A commission is between 0 and 100 percent.']);
        }
        $o->update(['commission_percent' => $percent]);

        return $o->fresh();
    }

    /** What TISL keeps of this organiser's ticket sales: its own rate, else the default in the events settings. TISL's own events pay no commission. */
    public function commissionFor(?EventOrganiser $o): float
    {
        if (! $o || $o->is_internal) {
            return 0.0;
        }

        return (float) ($o->commission_percent ?? EventSettings::all()['commission_percent'] ?? 10);
    }

    // ── people ───────────────────────────────────────────────────────────

    public function addMember(EventOrganiser $o, User $user, string $role): EventOrganiserMember
    {
        if (! in_array($role, EventOrganiser::ROLES, true)) {
            throw ValidationException::withMessages(['role' => 'Choose owner, manager, finance, door or staff.']);
        }

        return EventOrganiserMember::updateOrCreate(['organiser_id' => $o->id, 'user_id' => $user->id], ['role' => $role]);
    }

    public function removeMember(EventOrganiser $o, int $userId): void
    {
        $m = EventOrganiserMember::where('organiser_id', $o->id)->where('user_id', $userId)->first();
        if (! $m) {
            return;
        }
        if ($m->role === 'owner' && EventOrganiserMember::where('organiser_id', $o->id)->where('role', 'owner')->count() <= 1) {
            throw ValidationException::withMessages(['user' => 'An organiser needs at least one owner.']);
        }
        $m->delete();
    }

    public function members(EventOrganiser $o): array
    {
        return EventOrganiserMember::where('organiser_id', $o->id)->get()->map(function ($m) {
            $u = User::find($m->user_id);

            return ['user_id' => (int) $m->user_id, 'name' => $u?->name, 'email' => $u?->email, 'role' => $m->role];
        })->all();
    }

    // ── proof for verification ───────────────────────────────────────────

    public function addDocument(string $ownerType, int $ownerId, array $in, ?User $by): int
    {
        return (int) DB::table('event_documents')->insertGetId(['owner_type' => $ownerType, 'owner_id' => $ownerId, 'type' => $in['type'], 'title' => $in['title'] ?? null, 'path' => $in['path'], 'status' => 'pending',
            'created_at' => now(), 'updated_at' => now()]);
    }

    public function documents(string $ownerType, int $ownerId): array
    {
        return DB::table('event_documents')->where('owner_type', $ownerType)->where('owner_id', $ownerId)->orderByDesc('id')->get()->map(fn ($d) => (array) $d)->all();
    }

    public function reviewDocument(int $id, string $status, ?string $note, ?User $by): void
    {
        if (! in_array($status, ['accepted', 'rejected'], true)) {
            throw ValidationException::withMessages(['status' => 'Accept or reject it.']);
        }
        DB::table('event_documents')->where('id', $id)->update(['status' => $status, 'note' => $note, 'reviewed_by' => $by?->id, 'reviewed_at' => now(), 'updated_at' => now()]);
    }
}
