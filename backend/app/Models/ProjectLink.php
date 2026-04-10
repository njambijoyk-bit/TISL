<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ProjectLink extends Model
{
    public $timestamps = false; // if your table only has created_at; set true if you add updated_at

    protected $fillable = [
        'project_id',
        'link_type',   // quote_request|quote|order
        'link_id',
        'name',
        'relation',    // primary|addendum|revision|phase
        'notes',
        'created_at',
    ];

    protected $casts = [
        'created_at' => 'datetime',
    ];

    public function project(): BelongsTo
    {
        return $this->belongsTo(Project::class);
    }

    /**
     * Soft-polymorphic resolver. DB can’t FK this, so we resolve by type.
     */
    public function getLinkedModelAttribute()
    {
        return match ($this->link_type) {
            'quote_request' => QuoteRequest::query()->find($this->link_id),
            'quote'         => Quote::query()->find($this->link_id),
            'order'         => Order::query()->find($this->link_id),
            default         => null,
        };
    }
}