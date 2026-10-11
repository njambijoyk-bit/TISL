<?php

namespace App\Models\Menus;

use App\Models\User;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/** A member of staff with a kitchen profile. */
class Chef extends Model
{
    protected $table = 'menus_chefs';

    protected $fillable = ['user_id', 'display_name', 'title', 'bio', 'photo', 'station_ids', 'is_instructor', 'is_public', 'is_active', 'sort_order'];

    protected $casts = ['station_ids' => 'array', 'is_instructor' => 'boolean', 'is_public' => 'boolean', 'is_active' => 'boolean', 'sort_order' => 'integer'];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function certs(): HasMany
    {
        return $this->hasMany(ChefCert::class, 'chef_id')->orderBy('expires_on')->orderBy('id');
    }
}
