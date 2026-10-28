<?php

namespace App\Services\Books;

use App\Models\Books\Ledger;
use App\Models\Books\LedgerGroup;
use App\Models\User;
use App\Services\Access\Authorizer;
use App\Services\Books\Engine\LedgerBalances;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Validation\ValidationException;

/**
 * Which statement line a ledger or ledger group reports under (database/sql/227_statements.sql).
 *
 *  - A new ledger takes its group's line, and a new subgroup its parent's, unless the form chose another.
 *  - Choosing a line that differs from the one it would inherit, or changing the line later, needs `books.statements`.
 *  - A line must be an active line (not a section heading) that accepts the nature of the group the ledger is in.
 *  - When a group's line changes, its ledgers and subgroups that were still on the old line can be moved with it.
 * Until script 227 has been run none of this does anything.
 */
class StatementLines
{
    public const PERMISSION = 'books.statements';

    public static function available(): bool
    {
        return Schema::hasTable('statements') && LedgerBalances::hasColumn('ledgers', 'statement_id') && LedgerBalances::hasColumn('ledger_groups', 'statement_id');
    }

    /** The active lines the forms offer: id, code, name, nature and the path of sections above it. */
    public function lines(): array
    {
        if (! Schema::hasTable('statements')) {
            return [];
        }
        $rows = DB::table('statements')->where('is_active', 1)->orderBy('sort_order')->orderBy('id')->get(['id', 'parent_id', 'code', 'name', 'kind', 'nature'])->keyBy('id');
        $path = function ($r) use ($rows) {
            $names = [];
            $guard = 0;
            while ($r->parent_id && isset($rows[$r->parent_id]) && $guard++ < 8) {
                $r = $rows[$r->parent_id];
                array_unshift($names, $r->name);
            }

            return implode(' › ', $names);
        };

        return $rows->where('kind', 'line')->map(fn ($r) => ['id' => (int) $r->id, 'code' => $r->code, 'name' => $r->name, 'nature' => $r->nature, 'path' => $path($r)])
            ->sortBy(fn ($r) => $r['path'] . '|' . $r['name'], SORT_NATURAL | SORT_FLAG_CASE)->values()->all();
    }

    /**
     * The line for a ledger being created: what the form chose, else its group's. Returns what to store.
     *
     * @throws ValidationException
     */
    public function forNewLedger(?int $requested, int $groupId, ?User $user): ?int
    {
        $group = LedgerGroup::find($groupId, ['id', 'nature', 'statement_id']);
        $default = $group?->statement_id ? (int) $group->statement_id : null;

        return $this->choose($requested, $default, $group?->nature, $user);
    }

    /**
     * The line for a ledger being changed. `$given` says whether the form sent a line at all (null can mean "back to my group's line").
     * Moving the ledger to another group moves it to that group's line too, when it was following its old group's.
     *
     * @throws ValidationException
     */
    public function forExistingLedger(Ledger $ledger, bool $given, ?int $requested, ?int $newGroupId, ?User $user): ?int
    {
        $groupId = $newGroupId ?: (int) $ledger->group_id;
        $group = LedgerGroup::find($groupId, ['id', 'nature', 'statement_id']);
        $default = $group?->statement_id ? (int) $group->statement_id : null;
        $current = $ledger->statement_id ? (int) $ledger->statement_id : null;

        if ($given) {
            return $this->choose($requested, $default, $group?->nature, $user, $current);
        }
        if ($newGroupId && $newGroupId !== (int) $ledger->group_id) {
            $old = LedgerGroup::whereKey($ledger->group_id)->value('statement_id');
            $following = $current === null || ($old !== null && $current === (int) $old);
            if ($following || ! $this->accepts($current, $group?->nature)) {
                return $default;   // it followed its old group, or its line does not fit the new group's nature
            }
        }

        return $current;
    }

    /**
     * The line for a subgroup being created.
     *
     * @throws ValidationException
     */
    public function forNewGroup(?int $requested, int $parentId, ?User $user): ?int
    {
        $parent = LedgerGroup::find($parentId, ['id', 'nature', 'statement_id']);

        return $this->choose($requested, $parent?->statement_id ? (int) $parent->statement_id : null, $parent?->nature, $user);
    }

    /**
     * Change a group's line. With `$moveMembers`, the group's ledgers and subgroups (and their ledgers) that were on the old line move to the new one.
     *
     * @return array{statement_id: ?int, moved_groups: int, moved_ledgers: int}
     *
     * @throws ValidationException
     */
    public function changeGroup(LedgerGroup $group, ?int $requested, bool $moveMembers, ?User $user): array
    {
        $old = $group->statement_id ? (int) $group->statement_id : null;
        $parent = $group->parent_id ? LedgerGroup::find($group->parent_id, ['id', 'statement_id']) : null;
        $new = $this->choose($requested, $parent?->statement_id ? (int) $parent->statement_id : null, $group->nature, $user, $old);
        $movedGroups = $movedLedgers = 0;
        if ($new !== $old) {
            DB::transaction(function () use ($group, $old, $new, $moveMembers, &$movedGroups, &$movedLedgers) {
                $ids = $group->selfAndDescendantIds();
                DB::table('ledger_groups')->where('id', $group->id)->update(['statement_id' => $new]);
                if ($moveMembers && $old !== null) {
                    $movedGroups = DB::table('ledger_groups')->whereIn('id', $ids)->where('id', '<>', $group->id)->where('statement_id', $old)->update(['statement_id' => $new]);
                    $movedLedgers = DB::table('ledgers')->whereIn('group_id', $ids)->where('statement_id', $old)->update(['statement_id' => $new]);
                }
            });
        }

        return ['statement_id' => $new, 'moved_groups' => $movedGroups, 'moved_ledgers' => $movedLedgers];
    }

    /** After a group moves under another primary group its nature may change; a line that no longer accepts it gives way to the new parent's. */
    public function realign(LedgerGroup $group): void
    {
        if (! $this->accepts($group->statement_id ? (int) $group->statement_id : null, $group->nature)) {
            $parent = $group->parent_id ? LedgerGroup::whereKey($group->parent_id)->value('statement_id') : null;
            DB::table('ledger_groups')->where('id', $group->id)->update(['statement_id' => $parent]);
        }
    }

    /** Does this line accept a group of this nature? (A null line fits anything: it means "not set".) */
    private function accepts(?int $statementId, ?string $nature): bool
    {
        if ($statementId === null || $nature === null) {
            return true;
        }
        $line = DB::table('statements')->where('id', $statementId)->first(['kind', 'nature', 'is_active']);

        return $line && $line->kind === 'line' && $line->nature === $nature;
    }

    /**
     * What to store. The target is the requested line, or the default (the group's / parent's line) when none was asked for.
     * No permission is needed to keep what is there, to take the default on a new row, or to fill in a row that has no line yet.
     * Anything else (another line, or putting an own line back to the default) needs books.statements, and a line that exists, is active, is a
     * line rather than a section, and accepts the nature of the group.
     */
    private function choose(?int $requested, ?int $default, ?string $nature, ?User $user, ?int $current = null): ?int
    {
        $target = $requested ?? $default;
        if ($target === $current || ($target === $default && $current === null)) {
            return $target;
        }
        if ($user && ! app(Authorizer::class)->allows($user, self::PERMISSION)) {
            throw ValidationException::withMessages(['statement_id' => 'You do not have the permission to change which statement line this reports under.']);
        }
        if ($target === null) {
            return null;
        }
        $line = DB::table('statements')->where('id', $target)->first(['kind', 'nature', 'is_active', 'name']);
        if (! $line || ! $line->is_active) {
            throw ValidationException::withMessages(['statement_id' => 'That statement line does not exist or is hidden.']);
        }
        if ($line->kind !== 'line') {
            throw ValidationException::withMessages(['statement_id' => "{$line->name} is a section: choose one of the lines under it."]);
        }
        if ($nature !== null && $line->nature !== $nature) {
            throw ValidationException::withMessages(['statement_id' => "{$line->name} cannot hold a {$nature} account. Choose a line for a {$nature} account."]);
        }

        return $target;
    }
}
