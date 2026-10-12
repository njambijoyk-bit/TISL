<?php

namespace App\Models\Menus;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

/** A customer on a meal plan. */
class Subscription extends Model
{
    public const STATUSES = ['pending' => 'Waiting for the first payment', 'active' => 'Active', 'paused' => 'Paused', 'cancelled' => 'Cancelled'];

    protected $table = 'menus_subscriptions';

    protected $guarded = [];

    protected $hidden = ['manage_token'];

    protected $casts = ['start_date' => 'date:Y-m-d', 'paused_from' => 'date:Y-m-d', 'paused_until' => 'date:Y-m-d', 'cancelled_at' => 'datetime', 'credit_days' => 'integer', 'lapsed' => 'integer'];

    public function periods(): HasMany
    {
        return $this->hasMany(SubPeriod::class, 'subscription_id')->orderBy('week_start');
    }

    public function deliveries(): HasMany
    {
        return $this->hasMany(SubDelivery::class, 'subscription_id')->orderBy('delivery_date');
    }

    /** @return int[] the weekdays this customer chose */
    public function days(): array
    {
        return array_values(array_filter(array_map('intval', explode(',', (string) $this->weekdays)), fn ($d) => $d >= 1 && $d <= 7));
    }

    /** Is this day inside a pause? */
    public function pausedOn(\Illuminate\Support\Carbon $day): bool
    {
        if ($this->status === 'paused' && ! $this->paused_from) {
            return true;
        }

        return $this->paused_from && $day->toDateString() >= $this->paused_from->toDateString() && (! $this->paused_until || $day->toDateString() <= $this->paused_until->toDateString());
    }
}
