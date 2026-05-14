<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class PublicationComment extends Model
{
    protected $fillable = [
        'publication_id', 'user_id', 'parent_id', 'author_name', 'author_email', 'body', 'status'
    ];

    public function publication(): BelongsTo
    {
        return $this->belongsTo(Publication::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function replies(): HasMany
    {
        return $this->hasMany(PublicationComment::class, 'parent_id')->where('status', 'approved');
    }
}
