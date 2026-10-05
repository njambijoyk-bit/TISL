<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;

/** A review or comment (a reply is a comment with a parent) on anything the Engagement Engine covers. */
class EngagementPost extends Model
{
    use SoftDeletes;

    protected $fillable = ['target_type', 'target_id', 'kind', 'parent_id', 'user_id', 'guest_name', 'guest_key', 'rating', 'title', 'body', 'images', 'verified_purchase', 'proof_voucher_id',
        'status', 'held_reason', 'decided_by', 'decided_at', 'edited_at'];

    protected $casts = ['images' => 'array', 'verified_purchase' => 'boolean', 'rating' => 'integer', 'decided_at' => 'datetime', 'edited_at' => 'datetime'];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    protected function serializeDate(\DateTimeInterface $date): string
    {
        return \Carbon\Carbon::instance($date)->setTimezone(config('app.timezone'))->format('Y-m-d\TH:i:sP');
    }
}
