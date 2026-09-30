<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Production extends Model
{

    protected $table = 'productions';

    protected $fillable = ['number', 'recipe_id', 'variant_id', 'location_id', 'quantity', 'unit_cost', 'batch_id', 'status', 'note', 'created_by'];

    protected $casts = ['quantity' => 'decimal:4', 'unit_cost' => 'decimal:4'];

    public function lines(): \Illuminate\Database\Eloquent\Relations\HasMany
    {
        return $this->hasMany(ProductionLine::class, 'production_id');
    }
}
