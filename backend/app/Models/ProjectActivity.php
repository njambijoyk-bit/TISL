<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ProjectActivity extends Model
{
    public $timestamps = false;

    protected $fillable = [
        'project_id',
        'actor_user_id', // nullable; NULL = system
        'action',
        'entity_type',
        'entity_id',
        'metadata',
        'created_at',
    ];

    protected $casts = [
        'metadata' => 'array',
        'created_at' => 'datetime',
    ];

    public function project(): BelongsTo
    {
        return $this->belongsTo(Project::class);
    }

    public function actor(): BelongsTo
    {
        return $this->belongsTo(User::class, 'actor_user_id');
    }

    public function getIsSystemAttribute(): bool
    {
        return $this->actor_user_id === null;
    }
}