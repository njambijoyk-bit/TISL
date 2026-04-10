<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ProjectItem extends Model
{
    protected $fillable = [
        'project_id',
        'item_type', // product|service|fee|custom_product|custom_service
        'product_id',
        'service_id',
        'description',
        'quantity',
        'unit_of_measure',
        'currency',
        'unit_price',
        'line_total',
        'exchange_rate_to_kes',
        'unit_price_kes',
        'line_total_kes',
        'converted_currency_at',
        'variant_details',
        'notes',
        'status',
        'source_type',
        'source_id',
        'metadata',
        'display_order',
    ];

    protected $casts = [
        'quantity' => 'decimal:2',
        'unit_price' => 'decimal:2',
        'line_total' => 'decimal:2',
        'exchange_rate_to_kes' => 'decimal:8',
        'unit_price_kes' => 'decimal:2',
        'line_total_kes' => 'decimal:2',
        'converted_currency_at' => 'datetime',
        'variant_details' => 'array',
        'metadata' => 'array',
    ];

    public function project(): BelongsTo
    {
        return $this->belongsTo(Project::class);
    }

    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class);
    }

    public function service(): BelongsTo
    {
        return $this->belongsTo(Service::class);
    }
}