<?php

namespace App\Services\Courses;

use App\Models\Courses\Access;
use App\Models\Courses\CourseFile;
use App\Models\Courses\Lesson;
use App\Models\Courses\Offering;
use App\Models\User;
use App\Services\Access\Authorizer;
use App\Services\Books\BooksException;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Schema;

/**
 * Who may open what. An access grant says: this person may open this offering from a date until a date, because of an invoice (a paid enrolment), a membership (later) or a person at the desk.
 * Courses only *receives* grants; it never takes money. Granting is safe to repeat: the same source and reference twice is one grant, and a grant that was ended is brought back.
 * Staff who manage or teach can always look at an offering to prepare it; everybody else needs an active grant (or a free preview of a lesson the offering allows).
 */
class CourseAccess
{
    public static function installed(): bool
    {
        return Schema::hasTable('course_offerings') && Schema::hasTable('course_access');
    }

    public function __construct(private Authorizer $authz)
    {
    }

    /**
     * Give a person access. Idempotent for the same source and reference.
     *
     * @param string $source invoice | membership | staff
     * @param ?Carbon $until empty = the offering's access window (or for ever)
     */
    public function grant(int $userId, int $offeringId, string $source, string $sourceRef = '', ?Carbon $until = null, ?string $note = null, ?int $by = null): Access
    {
        if (! isset(Access::SOURCES[$source])) {
            throw new BooksException('Choose who gives the access: an invoice, a membership or staff.');
        }
        if (! User::whereKey($userId)->exists()) {
            throw new BooksException('That person does not exist.');
        }
        $o = Offering::find($offeringId) ?? throw new BooksException('That offering does not exist.');
        if ($o->status === 'archived') {
            throw new BooksException('That offering is archived: nobody can be added to it.');
        }
        $now = now();
        if (! $until && $source !== 'membership') {   // a membership decides for itself when access ends
            $days = $o->access_days ?: CourseSettings::all()['default_access_days'];
            $until = $days ? $now->copy()->addDays((int) $days) : null;
        }
        if ($until && $until->lte($now)) {
            throw new BooksException('The access must end in the future.');
        }
        $ref = mb_substr(trim($sourceRef), 0, 60);
        $a = Access::firstOrNew(['user_id' => $userId, 'offering_id' => $offeringId, 'source' => $source, 'source_ref' => $ref]);
        $a->fill(['starts_at' => $a->exists && ! $a->revoked_at ? $a->starts_at : $now, 'ends_at' => $until, 'revoked_at' => null, 'granted_by' => $by ?? $a->granted_by,
            'note' => $note !== null && trim($note) !== '' ? mb_substr(trim($note), 0, 300) : $a->note])->save();

        return $a->fresh();
    }

    /** End every grant a source made (an invoice cancelled or refunded, a membership ended). @return int how many were ended */
    public function revoke(string $source, string $sourceRef): int
    {
        return Access::where('source', $source)->where('source_ref', mb_substr(trim($sourceRef), 0, 60))->whereNull('revoked_at')->update(['revoked_at' => now(), 'updated_at' => now()]);
    }

    public function revokeOne(Access $a): Access
    {
        if ($a->revoked_at) {
            throw new BooksException('That access has been ended already.');
        }
        $a->update(['revoked_at' => now()]);

        return $a->fresh();
    }

    /** Is this person staff for this offering: may they look at it whatever the grants say? Managers see all; a teacher sees their own. */
    public function staffMay(?User $u, Offering $o): bool
    {
        if (! $u) {
            return false;
        }

        return $this->authz->allows($u, 'courses.manage') || ($this->authz->allows($u, 'courses.teach') && (int) $o->instructor_user_id === (int) $u->id);
    }

    /** May this person open the offering (its paid content)? */
    public function can(?User $u, Offering $o): bool
    {
        if ($this->staffMay($u, $o)) {
            return true;
        }
        if (! $u || $o->status !== 'published') {
            return false;
        }

        return $this->active($u->id, $o->id) !== null;
    }

    public function active(int $userId, int $offeringId, ?Carbon $at = null): ?Access
    {
        $at ??= now();

        return Access::where('user_id', $userId)->where('offering_id', $offeringId)->whereNull('revoked_at')->where('starts_at', '<=', $at)
            ->where(fn ($q) => $q->whereNull('ends_at')->orWhere('ends_at', '>', $at))->orderByRaw('ends_at IS NULL DESC')->orderByDesc('ends_at')->first();
    }

    /** May this person open this lesson? A free preview is open to anyone (when the offering allows it); drip holds a lesson back for some days after access began. */
    public function canLesson(?User $u, Offering $o, Lesson $l, ?Carbon $at = null): bool
    {
        $at ??= now();
        if ($this->staffMay($u, $o)) {
            return true;
        }
        if ($o->status !== 'published') {
            return false;
        }
        if ($l->is_preview && $o->free_preview) {
            return true;
        }
        $a = $u ? $this->active($u->id, $o->id, $at) : null;
        if (! $a) {
            return false;
        }

        return ! $l->drip_days || $a->starts_at->copy()->addDays((int) $l->drip_days)->lte($at);
    }

    /** May this person download this file? Only if it sits in a lesson they may open. */
    public function canFile(?User $u, CourseFile $f, ?Carbon $at = null): bool
    {
        if ($u && $f->offering_id && ($o = Offering::find($f->offering_id)) && $this->staffMay($u, $o)) {
            return true;
        }
        foreach (Lesson::where('file_id', $f->id)->get() as $l) {
            $o = Offering::find($l->offering_id);
            if ($o && $this->canLesson($u, $o, $l, $at)) {
                return true;
            }
        }

        return false;
    }

    /** The offerings a source unlocks (Memberships asks: what has this plan given?). @return int[] offering ids with a live grant from it */
    public function offeringsFor(string $source, string $sourceRef): array
    {
        return Access::where('source', $source)->where('source_ref', $sourceRef)->whereNull('revoked_at')->pluck('offering_id')->unique()->values()->all();
    }

    /** @return array<int, array<string, mixed>> the people with access to an offering (staff screen) */
    public function rows(int $offeringId): array
    {
        $accesses = Access::where('offering_id', $offeringId)->orderByDesc('id')->limit(300)->get();
        $users = User::whereIn('id', $accesses->pluck('user_id')->merge($accesses->pluck('granted_by'))->filter()->unique())->pluck('name', 'id');
        $emails = User::whereIn('id', $accesses->pluck('user_id'))->pluck('email', 'id');

        return $accesses->map(fn (Access $a) => ['id' => $a->id, 'user_id' => $a->user_id, 'name' => $users[$a->user_id] ?? null, 'email' => $emails[$a->user_id] ?? null, 'source' => $a->source, 'source_label' => Access::SOURCES[$a->source] ?? $a->source,
            'source_ref' => $a->source_ref, 'starts_at' => $a->starts_at->toIso8601String(), 'ends_at' => $a->ends_at?->toIso8601String(), 'revoked_at' => $a->revoked_at?->toIso8601String(), 'active' => $a->active(),
            'note' => $a->note, 'granted_by' => $a->granted_by ? ($users[$a->granted_by] ?? null) : null])->values()->all();
    }
}
