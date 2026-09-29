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

    protected $fillable = ['parent_id', 'name', 'nature', 'is_primary', 'is_system', 'affects_gross_profit', 'sort_order', 'behaviour', 'settings'];

    protected $casts = [
        'is_primary'           => 'boolean',
        'is_system'            => 'boolean',
        'affects_gross_profit' => 'boolean',
        'settings'             => 'array',
    ];

    /** What a group's ledgers *are*. Drives the ledger form and the engines that read ledgers. */
    public const BEHAVIOURS = ['standard', 'tax', 'delivery'];

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
