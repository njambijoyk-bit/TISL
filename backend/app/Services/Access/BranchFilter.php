<?php

namespace App\Services\Access;

use App\Models\User;
use Illuminate\Support\Facades\Cache;

/**
 * Branch limits for the data screens: which branches' records a person sees, and which branches they may post to.
 *
 * Who is limited: a staff member whose roles are not global, who has a default branch or grants (see Authorizer::scope). Admin, super admin and the
 * senior accountant, customers, vendors, and anything run without a person (queues, the storefront checkout) are never limited.
 * What happens is set per area (books, stock...) in access_settings: off (nobody limited), log (nothing refused; what would have been hidden or
 * refused is written to the access log, once an hour per person and screen) or on (hidden / refused).
 *
 * Records with no branch (location_id empty) stay visible to everyone: they cannot be attributed to a branch.
 */
class BranchFilter
{
    public function __construct(private Authorizer $access, private AccessSettings $settings) {}

    private function actor(?User $u = null): ?User
    {
        $u ??= auth()->user();

        return $u instanceof User ? $u : null;
    }

    /** The branch ids this person is limited to, or null when nothing limits them. Ignores the mode. */
    public function limit(?User $u = null): ?array
    {
        $u = $this->actor($u);
        if (! $u || ! $this->access->isStaff($u)) {
            return null;
        }

        return $this->access->locationIds($u);
    }

    /** Is the limit actually applied to this area (mode on) for this person? */
    public function enforcing(string $area, ?User $u = null): bool
    {
        return $this->limit($u) !== null && $this->settings->mode($area) === 'on';
    }

    /**
     * Narrow a query (Eloquent or query builder) to the person's branches. In `log` mode the query is left alone, and once an hour the
     * number of rows that would have been hidden is written to the access log.
     */
    public function apply($query, string $column, string $area, string $what)
    {
        $ids = $this->limit();
        if ($ids === null) {
            return $query;
        }
        $mode = $this->settings->mode($area);
        if ($mode === 'off') {
            return $query;
        }
        if ($mode === 'log') {
            $this->noteHidden($query, $column, $ids, $area, $what);

            return $query;
        }

        return $query->where(fn ($w) => $w->whereIn($column, $ids)->orWhereNull($column));
    }

    /** Like apply(), for a record that belongs to two branches (a transfer): visible when either end is the person's. */
    public function applyAny($query, array $columns, string $area, string $what)
    {
        $ids = $this->limit();
        if ($ids === null) {
            return $query;
        }
        $mode = $this->settings->mode($area);
        if ($mode === 'off') {
            return $query;
        }
        if ($mode === 'log') {
            $u = $this->actor();
            if ($u && Cache::add("access:would_hide:{$u->getKey()}:{$area}:{$what}", 1, 3600)) {
                try {
                    $hidden = $this->plain($query)->where(function ($w) use ($columns, $ids) {
                        foreach ($columns as $c) {
                            $w->whereNotIn($c, $ids);
                        }
                    })->count();
                } catch (\Throwable) {
                    return $query;
                }
                if ($hidden > 0) {
                    $this->note('would_hide', $area, $what, ['hidden' => $hidden, 'branches' => $ids], $u, false);
                }
            }

            return $query;
        }

        return $query->where(function ($w) use ($columns, $ids) {
            foreach ($columns as $c) {
                $w->orWhereIn($c, $ids);
            }
        });
    }

    /** A record that belongs to two branches: visible when the person has either. */
    public function assertVisibleAny(array $locationIds, string $area, string $what): void
    {
        $ids = $this->limit();
        $locationIds = array_values(array_filter(array_map('intval', $locationIds)));
        if ($ids === null || ! $locationIds || array_intersect($locationIds, $ids)) {
            return;
        }
        $mode = $this->settings->mode($area);
        if ($mode === 'on') {
            abort(404, 'Not found.');
        }
        if ($mode === 'log') {
            $this->note('would_hide', $area, $what, ['hidden' => 1, 'location_id' => $locationIds[0]]);
        }
    }

    /** A single record (a voucher): visible to this person? Hidden records are reported as not found. */
    public function assertVisible(?int $locationId, string $area, string $what): void
    {
        $ids = $this->limit();
        if ($ids === null || ! $locationId || in_array($locationId, $ids, true)) {
            return;
        }
        $mode = $this->settings->mode($area);
        if ($mode === 'on') {
            abort(404, 'Not found.');
        }
        if ($mode === 'log') {
            $this->note('would_hide', $area, $what, ['hidden' => 1, 'location_id' => $locationId]);
        }
    }

    /** Posting to a branch: needs full (not view-only) access to it. */
    public function assertWrite(?User $u, ?int $locationId, string $area, string $what): void
    {
        $u = $this->actor($u);
        if (! $u || ! $locationId || ! $this->access->isStaff($u) || $this->access->canAccessLocation($u, $locationId, true)) {
            return;
        }
        $mode = $this->settings->mode($area);
        if ($mode === 'on') {
            abort(403, 'You do not have access to post at that branch. Ask an administrator to give you the branch.');
        }
        if ($mode === 'log') {
            $this->note('would_deny', $area, $what, ['permission' => $what, 'location_id' => $locationId, 'reason' => 'outside_scope'], $u);
        }
    }

    /** A copy of the query that can be counted: no grouping, ordering, limit or custom columns (a report's totals query counts as its rows). */
    private function plain($query)
    {
        $c = clone $query;
        $base = method_exists($c, 'getQuery') ? $c->getQuery() : $c;
        $base->groups = null;
        $base->havings = null;
        $base->orders = null;
        $base->columns = null;
        $base->limit = null;
        $base->offset = null;
        $base->setBindings([], 'select');
        $base->setBindings([], 'having');
        $base->setBindings([], 'order');

        return $c;
    }

    private function noteHidden($query, string $column, array $ids, string $area, string $what): void
    {
        $u = $this->actor();
        if (! $u || ! Cache::add("access:would_hide:{$u->getKey()}:{$area}:{$what}", 1, 3600)) {
            return;
        }
        try {
            $hidden = $this->plain($query)->whereNotNull($column)->whereNotIn($column, $ids)->count();
        } catch (\Throwable) {
            return;   // a report must never fail because of the test-mode log
        }
        if ($hidden > 0) {
            $this->note('would_hide', $area, $what, ['hidden' => $hidden, 'branches' => $ids], $u, false);
        }
    }

    private function note(string $action, string $area, string $what, array $details, ?User $u = null, bool $throttle = true): void
    {
        $u ??= $this->actor();
        if (! $u || ($throttle && ! Cache::add("access:{$action}:{$u->getKey()}:{$area}:{$what}:" . ($details['location_id'] ?? ''), 1, 3600))) {
            return;
        }
        \App\Models\Access\AccessLog::record(null, (int) $u->getKey(), $action, ['area' => $area, 'screen' => $what] + $details);
    }
}
