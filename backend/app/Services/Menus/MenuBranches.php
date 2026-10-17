<?php

namespace App\Services\Menus;

use App\Services\Access\BranchFilter;

/**
 * The branches a person may use in Menus. Someone limited to some branches is only offered those, and when no branch is asked for (or the one remembered on their device is no longer
 * theirs) the pages open on the first of theirs, not on the company's default. Everyone else sees every branch, as before.
 */
final class MenuBranches
{
    public function __construct(private BranchFilter $filter)
    {
    }

    /** The branch ids this person is held to in Menus, or null when nothing holds them. */
    public function only(): ?array
    {
        return $this->filter->enforcing('stock') ? $this->filter->limit() : null;
    }

    /** Narrow a query on the branches (a query builder or Eloquent builder) to the ones they may use. */
    public function narrow($query, string $column = 'id')
    {
        $only = $this->only();

        return $only === null ? $query : $query->whereIn($column, $only);
    }
}
