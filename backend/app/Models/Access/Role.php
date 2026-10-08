<?php

namespace App\Models\Access;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

/** A role: identity, the lowest clearance that may hold it, which branches and records it covers, its permissions, modules, approvals and restrictions. */
class Role extends Model
{
    protected $table = 'roles';

    protected $fillable = ['key', 'name', 'kind', 'min_clearance', 'scope_type', 'data_scope', 'module_key', 'acts_as', 'restrictions', 'description', 'is_system', 'is_active', 'sort_order'];

    protected $casts = ['acts_as' => 'array', 'restrictions' => 'array', 'is_system' => 'boolean', 'is_active' => 'boolean', 'min_clearance' => 'integer', 'sort_order' => 'integer'];

    public const SCOPES = ['global', 'assigned', 'own'];
    public const DATA_SCOPES = ['all', 'assigned', 'own'];
    public const KINDS = ['staff', 'portal'];

    /** The owner's role holds every permission there is, including ones added later. */
    public function holdsEverything(): bool
    {
        return $this->key === 'super_admin';
    }

    public function permissionKeys(): array
    {
        return $this->relationLoaded('rolePermissions')
            ? $this->rolePermissions->pluck('permission_key')->all()
            : RolePermission::where('role_id', $this->id)->pluck('permission_key')->all();
    }

    public function rolePermissions(): HasMany
    {
        return $this->hasMany(RolePermission::class, 'role_id');
    }

    public function modules(): HasMany
    {
        return $this->hasMany(RoleModule::class, 'role_id');
    }

    public function approvals(): HasMany
    {
        return $this->hasMany(RoleApproval::class, 'role_id');
    }

    /** The old role names this role also counts as, plus its own key. */
    public function legacyKeys(): array
    {
        return array_values(array_unique(array_merge([$this->key], $this->acts_as ?? [])));
    }
}
