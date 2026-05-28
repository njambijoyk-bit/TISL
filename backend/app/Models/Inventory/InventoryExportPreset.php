<?php

namespace App\Models\Inventory;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class InventoryExportPreset extends Model
{
    protected $table = 'inventory_export_presets';

    protected $fillable = [
        'user_id', 'name', 'export_type',
        'column_config', 'filter_config', 'is_default',
    ];

    protected $casts = [
        'column_config' => 'array',
        'filter_config' => 'array',
        'is_default'    => 'boolean',
    ];

    public function user(): BelongsTo
    {
        return $this->belongsTo(\App\Models\User::class, 'user_id');
    }

    public function scopeDefault($q)              { return $q->where('is_default', true); }
    public function scopeOfType($q, string $type) { return $q->where('export_type', $type); }

    public function setAsDefault(): void
    {
        static::where('user_id', $this->user_id)
              ->where('export_type', $this->export_type)
              ->where('id', '!=', $this->id)
              ->update(['is_default' => false]);

        $this->update(['is_default' => true]);
    }
}
