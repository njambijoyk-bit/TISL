<?php

namespace App\Models\Inventory;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class InventoryExportLog extends Model
{
    const UPDATED_AT = null;

    protected $table = 'inventory_export_logs';

    protected $fillable = [
        'exported_by', 'exported_at', 'export_type',
        'filters_applied', 'columns_included', 'columns_excluded',
        'row_count', 'file_name',
    ];

    protected $casts = [
        'exported_at'      => 'datetime',
        'filters_applied'  => 'array',
        'columns_included' => 'array',
        'columns_excluded' => 'array',
    ];

    public static function boot(): void
    {
        parent::boot();
        static::updating(fn() => throw new \LogicException('Export logs are immutable.'));
        static::deleting(fn() => throw new \LogicException('Export logs cannot be deleted.'));
    }

    public function exportedBy(): BelongsTo
    {
        return $this->belongsTo(\App\Models\User::class, 'exported_by');
    }

    public function scopeOfType($q, string $type) { return $q->where('export_type', $type); }
}
