<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;

class Publication extends Model
{
    protected $fillable = [
        'type', 'title', 'slug', 'status', 'cover_image',
        'template', 'style_config', 'tags', 'published_at', 'created_by'
    ];

    protected $casts = [
        'style_config' => 'array',
        'tags'         => 'array',
        'published_at' => 'datetime',
    ];

    public function blocks(): HasMany
    {
        return $this->hasMany(PublicationBlock::class)->orderBy('block_order');
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function authors(): BelongsToMany
    {
        return $this->belongsToMany(User::class, 'publication_authors', 'publication_id', 'admin_id')
            ->withPivot('role');
    }

    public function comments(): HasMany
    {
        return $this->hasMany(PublicationComment::class);
    }

    public function activeComments(): HasMany
    {
        return $this->comments()->where('status', 'approved')->whereNull('parent_id');
    }
}
