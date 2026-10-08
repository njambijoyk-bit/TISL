<?php

namespace App\Models\Access;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** A role a person holds, optionally between two dates. */
class UserRole extends Model
{
    protected $table = 'user_roles';
    protected $fillable = ['user_id', 'role_id', 'is_primary', 'starts_at', 'expires_at', 'assigned_by'];
    protected $casts = ['is_primary' => 'boolean', 'starts_at' => 'datetime', 'expires_at' => 'datetime'];

    public function role(): BelongsTo
    {
        return $this->belongsTo(Role::class, 'role_id');
    }

    /** Is it in force at this moment? */
    public function current(?\DateTimeInterface $at = null): bool
    {
        $at ??= now();

        return (! $this->starts_at || $this->starts_at <= $at) && (! $this->expires_at || $this->expires_at > $at);
    }
}
