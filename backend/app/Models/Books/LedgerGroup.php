<?php

namespace App\Models\Books;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * A node in the chart of accounts. Primary groups (parent_id NULL) are fixed and
 * carry the nature (asset / liability / income / expense); every subgroup
 * inherits its primary's nature.
 */
class LedgerGroup extends Model
{
    protected $table = 'ledger_groups';

    protected $fillable = ['parent_id', 'name', 'nature', 'is_primary', 'is_system', 'sort_order', 'behaviour', 'settings',
        'statement_id', 'code', 'is_active', 'application_mode', 'is_compound', 'kind', 'control_ledger_id', 'payable_ledger_id', 'receivable_ledger_id',
        'tax_category', 'application_method', 'jurisdiction_id', 'input_ledger_id', 'cost_ledger_id', 'recovery', 'company_role'];

    protected $casts = [
        'is_primary'           => 'boolean',
        'is_system'            => 'boolean',
        'settings'             => 'array',
        'is_active'            => 'boolean',
        'is_compound'          => 'boolean',
    ];

    /** A new subgroup reports under its parent's statement line unless one was given (database/sql/227_statements.sql). */
    protected static function booted(): void
    {
        static::creating(function (self $group) {
            if ($group->getAttribute('statement_id') === null && $group->parent_id && \App\Services\Books\Engine\LedgerBalances::hasColumn('ledger_groups', 'statement_id')) {
                $group->setAttribute('statement_id', static::whereKey($group->parent_id)->value('statement_id'));
            }
        });
    }

    /** What a group's ledgers *are*. Drives the ledger form and the engines that read ledgers. */
    public const BEHAVIOURS = ['standard', 'tax', 'delivery', 'sales', 'purchase', 'party', 'bank', 'charge'];

    public const NATURES = ['asset', 'liability', 'income', 'expense'];

    public function parent(): BelongsTo
    {
        return $this->belongsTo(self::class, 'parent_id');
    }

    public function children(): HasMany
    {
        return $this->hasMany(self::class, 'parent_id')->orderBy('sort_order')->orderBy('name');
    }

    public function ledgers(): HasMany
    {
        return $this->hasMany(Ledger::class, 'group_id');
    }

    /** What a group (or the group it sits under) is reserved for: 'service' for Service Income and everything below it, else null. */
    public static function appliesTo(?int $groupId): ?string
    {
        $seen = [];
        while ($groupId && ! in_array($groupId, $seen, true)) {
            $seen[] = $groupId;
            $g = self::find($groupId, ['id', 'parent_id', 'settings']);
            if (! $g) {
                return null;
            }
            if (! empty(($g->settings ?? [])['applies_to'])) {
                return (string) $g->settings['applies_to'];
            }
            $groupId = $g->parent_id ? (int) $g->parent_id : null;
        }

        return null;
    }

    /** This group's id plus every descendant's. */
    public function selfAndDescendantIds(): array
    {
        $ids = [$this->id];
        $frontier = [$this->id];
        while ($frontier) {
            $frontier = self::whereIn('parent_id', $frontier)->pluck('id')->all();
            $ids = array_merge($ids, $frontier);
        }

        return $ids;
    }

    /** True when $candidateId is this group or sits below it (guards against cycles when moving a group). */
    public function isSelfOrAncestorOf(int $candidateId): bool
    {
        return in_array($candidateId, $this->selfAndDescendantIds(), true);
    }
}
