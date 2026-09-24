<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class VaultFolder extends Model
{
    use SoftDeletes;

    protected $fillable = [
        'parent_id', 'name', 'slug', 'description',
        'folder_type', 'sensitivity_level',
        'password_hash', 'is_locked',
        'inherits_parent_policy', 'owner_user_id',
    ];

    protected $hidden = ['password_hash'];

    protected $casts = [
        'is_locked'               => 'boolean',
        'inherits_parent_policy'  => 'boolean',
    ];

    // ── Relationships ──────────────────────────────────────────────────────

    public function parent()
    {
        return $this->belongsTo(VaultFolder::class, 'parent_id');
    }

    public function children()
    {
        return $this->hasMany(VaultFolder::class, 'parent_id');
    }

    // recursive — full tree
    public function allChildren()
    {
        return $this->children()->with('allChildren');
    }

    public function documents()
    {
        return $this->hasMany(VaultDocument::class, 'folder_id');
    }

    public function owner()
    {
        return $this->belongsTo(User::class, 'owner_user_id');
    }

    public function policies()
    {
        return $this->hasMany(VaultPolicy::class, 'target_id')
                    ->where('target_type', 'folder');
    }

    public function unlockSessions()
    {
        return $this->hasMany(VaultUnlockSession::class, 'target_id')
                    ->where('target_type', 'folder');
    }

    public function accessLogs()
    {
        return $this->hasMany(VaultAccessLog::class, 'target_id')
                    ->where('target_type', 'folder');
    }

    // ── Helpers ────────────────────────────────────────────────────────────

    public function isPasswordProtected(): bool
    {
        return !is_null($this->password_hash);
    }

    public function ancestors(): array
    {
        $ancestors = [];
        $folder = $this->parent;
        while ($folder) {
            array_unshift($ancestors, $folder);
            $folder = $folder->parent;
        }
        return $ancestors;
    }
}