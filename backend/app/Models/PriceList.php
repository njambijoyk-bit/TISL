<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

/** A dated, frozen list of selling prices (products and services). Draft, waiting for activation, or published (and live from its Active-from date). */
class PriceList extends Model
{
    use SoftDeletes;

    public const STATUSES = ['draft', 'pending', 'published'];

    protected $fillable = ['name', 'description', 'status', 'active_from', 'access', 'customer_types', 'earlier_price', 'as_at', 'picks', 'item_count', 'created_by', 'submitted_at', 'published_by', 'published_at'];

    protected $casts = ['active_from' => 'datetime', 'as_at' => 'datetime', 'submitted_at' => 'datetime', 'published_at' => 'datetime', 'customer_types' => 'array', 'picks' => 'array', 'item_count' => 'integer'];

    public function items(): HasMany
    {
        return $this->hasMany(PriceListItem::class)->orderBy('position');
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    /** Published and past its Active-from date: what customers can see (subject to who it is for). */
    public function scopeLive($q)
    {
        return $q->where('status', 'published')->where(fn ($w) => $w->whereNull('active_from')->orWhere('active_from', '<=', now()));
    }

    public function isLive(): bool
    {
        return $this->status === 'published' && (! $this->active_from || $this->active_from->lte(now()));
    }

    protected function serializeDate(\DateTimeInterface $date): string
    {
        return \Carbon\Carbon::instance($date)->setTimezone(config('app.timezone'))->format('Y-m-d\TH:i:sP');
    }
}
