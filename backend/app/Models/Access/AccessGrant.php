<?php

namespace App\Models\Access;

use Illuminate\Database\Eloquent\Model;

/** Extra access to a branch (later a cost centre or a company), optionally between two dates. */
class AccessGrant extends Model
{
    protected $table = 'user_access_grants';
    protected $fillable = ['user_id', 'resource_type', 'resource_id', 'access', 'starts_at', 'expires_at', 'granted_by', 'reason', 'status', 'revoked_by', 'revoked_at'];
    protected $casts = ['starts_at' => 'datetime', 'expires_at' => 'datetime', 'revoked_at' => 'datetime', 'resource_id' => 'integer'];

    public const TYPES = ['location'];   // cost_centre and entity are added when those exist

    public function current(?\DateTimeInterface $at = null): bool
    {
        $at ??= now();

        return $this->status === 'active' && (! $this->starts_at || $this->starts_at <= $at) && (! $this->expires_at || $this->expires_at > $at);
    }

    public function scopeActive($q)
    {
        return $q->where('status', 'active');
    }
}
