<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Schema;

/**
 * What a cost or income belongs to. Nested to any depth (Branch A > Utilities, Stock, Payroll, a department, a project); reports roll children up
 * into their parent. `purpose` is a free label chosen by the owner, used only to pick defaults. Script 100.
 */
class CostCentre extends Model
{
    public const TYPES = ['general' => 'General', 'head_office' => 'Head office', 'branch' => 'Branch', 'other' => 'Other'];

    protected $fillable = ['parent_id', 'location_id', 'name', 'code', 'type', 'purpose', 'description', 'is_system', 'is_active', 'sort_order'];

    protected $casts = ['is_system' => 'boolean', 'is_active' => 'boolean', 'sort_order' => 'integer'];

    /** Has script 100 been run? Before it nothing asks for a cost centre. */
    public static function ready(): bool
    {
        static $ready;

        return $ready ??= Schema::hasTable('cost_centres');
    }

    public function parent()
    {
        return $this->belongsTo(self::class, 'parent_id');
    }

    public function children()
    {
        return $this->hasMany(self::class, 'parent_id');
    }

    public function location()
    {
        return $this->belongsTo(Location::class, 'location_id');
    }

    public function scopeActive($q)
    {
        return $q->where('is_active', true);
    }
}
