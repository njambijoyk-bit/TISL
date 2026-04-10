<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ProjectMilestone extends Model
{
    protected $fillable = [
        'project_id',
        'title',
        'description',
        'due_date',
        'currency',
        'amount',
        'exchange_rate_to_kes',
        'amount_kes',
        'converted_currency_at',
        'status', // pending|ready_for_review|approved|completed|rejected
        'approved_by',
        'approved_at',
        'approval_notes',
    ];

    protected $casts = [
        'due_date' => 'datetime',
        'amount' => 'decimal:2',
        'exchange_rate_to_kes' => 'decimal:8',
        'amount_kes' => 'decimal:2',
        'converted_currency_at' => 'datetime',
        'approved_at' => 'datetime',
    ];

    public function project(): BelongsTo
    {
        return $this->belongsTo(Project::class);
    }

    public function approvedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'approved_by');
    }
}