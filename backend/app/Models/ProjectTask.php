<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ProjectTask extends Model
{
    protected $fillable = [
        'project_id',
        'title',
        'description',
        'status',    // todo|doing|blocked|done
        'priority',  // low|medium|high|urgent
        'assigned_to',
        'due_date',
        'related_type', // project_item|quote_request|quote|order|milestone
        'related_id',
    ];

    protected $casts = [
        'due_date' => 'datetime',
    ];

    public function project(): BelongsTo
    {
        return $this->belongsTo(Project::class);
    }

    public function assignedTo(): BelongsTo
    {
        return $this->belongsTo(User::class, 'assigned_to');
    }

    public function getRelatedModelAttribute()
    {
        if (!$this->related_type || !$this->related_id) return null;

        return match ($this->related_type) {
            'project_item' => ProjectItem::query()->find($this->related_id),
            'milestone'    => ProjectMilestone::query()->find($this->related_id),
            'quote_request'=> QuoteRequest::query()->find($this->related_id),
            'quote'        => Quote::query()->find($this->related_id),
            'order'        => Order::query()->find($this->related_id),
            default        => null,
        };
    }
}