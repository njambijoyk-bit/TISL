<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ShippingActivity extends Model
{
    public $timestamps = false;

    protected $fillable = [
        'shipping_option_id',
        'actor_user_id',
        'action',
        'metadata',
        'created_at',
    ];

    protected $casts = [
        'metadata'   => 'array',
        'created_at' => 'datetime',
    ];

    public function shippingOption(): BelongsTo
    {
        return $this->belongsTo(ShippingOption::class);
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
