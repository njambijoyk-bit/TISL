<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ProjectMessage extends Model
{
    public $timestamps = false;

    protected static function booted(): void
    {
        static::creating(function (self $model) {
            $model->created_at ??= now();
        });
    }

    protected $fillable = [
        'project_id',
        'visibility', // customer|admin|internal
        'sender_user_id',
        'message',
        'attachments',
        'created_at',
        'edited_at',  // ← added
    ];

    protected $casts = [
        'attachments' => 'array',
        'created_at'  => 'datetime',
        'edited_at'   => 'datetime',  // ← added
    ];

    public function project(): BelongsTo
    {
        return $this->belongsTo(Project::class);
    }

    public function sender(): BelongsTo
    {
        // role is needed by the controller's delete-permission check
        return $this->belongsTo(User::class, 'sender_user_id')
                    ->select(['id', 'name', 'email', 'role']);  // ← added role
    }
}