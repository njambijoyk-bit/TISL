<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** One saved version of a part of the payment settings: the whole part, encrypted. Never serialised: the snapshot holds keys. */
class PaymentSettingVersion extends Model
{
    public const UPDATED_AT = null;

    protected $guarded = [];

    protected $hidden = ['snapshot_enc'];

    protected $casts = ['changed_keys' => 'array', 'has_secrets' => 'boolean', 'tested_ok' => 'boolean', 'secrets_purged_at' => 'datetime'];

    public function author(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }
}
