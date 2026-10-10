<?php

namespace App\Models\Events;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Support\Str;

/** A ticketed event. See docs/EVENTS_PLAN.md. */
class Event extends Model
{
    use SoftDeletes;

    protected $table = 'events';

    public const DRAFT = 'draft';
    public const PUBLISHED = 'published';
    public const CANCELLED = 'cancelled';
    public const POSTPONED = 'postponed';

    public const KINDS = ['in_person' => 'In person', 'online' => 'Online', 'hybrid' => 'In person and online'];

    protected $fillable = [
        'title', 'slug', 'summary', 'description', 'kind', 'venue_name', 'venue_address', 'map_url', 'online_url', 'organiser', 'main_image', 'video_url', 'status', 'is_listed', 'currency_id',
        'sales_ledger_id', 'tax_rate_id', 'location_id', 'max_per_order', 'refund_until', 'refund_policy', 'allow_name_change', 'published_at', 'created_by', 'updated_by',
    ];

    protected $casts = ['is_listed' => 'boolean', 'allow_name_change' => 'boolean', 'refund_until' => 'datetime', 'published_at' => 'datetime', 'max_per_order' => 'integer'];

    protected static function booted(): void
    {
        static::creating(function (self $e) {
            $e->slug = self::uniqueSlug($e->slug ?: $e->title);
        });
    }

    public static function uniqueSlug(string $from, ?int $exceptId = null): string
    {
        $base = Str::slug($from) ?: 'event';
        $slug = $base;
        for ($i = 2; self::withTrashed()->where('slug', $slug)->when($exceptId, fn ($q) => $q->where('id', '!=', $exceptId))->exists(); $i++) {
            $slug = $base . '-' . $i;
        }

        return $slug;
    }

    public function sessions(): HasMany
    {
        return $this->hasMany(EventSession::class)->orderBy('starts_at');
    }

    public function ticketTypes(): HasMany
    {
        return $this->hasMany(EventTicketType::class)->orderBy('sort_order')->orderBy('id');
    }

    public function tickets(): HasMany
    {
        return $this->hasMany(EventTicket::class);
    }

    public function scopePublic($q)
    {
        return $q->where('status', self::PUBLISHED)->where('is_listed', true);
    }

    /** The moment the last session ends (or starts, when it has no end): after this nothing can be bought. */
    public function endsAt(): ?\Illuminate\Support\Carbon
    {
        $last = $this->sessions->where('is_cancelled', false)->map(fn ($s) => $s->ends_at ?? $s->starts_at)->max();

        return $last ? \Illuminate\Support\Carbon::parse($last) : null;
    }

    public function isOver(): bool
    {
        $end = $this->endsAt();

        return $end !== null && $end->isPast();
    }

    /** Can tickets be bought for it at all right now (published, running, not over)? */
    public function isOnSale(): bool
    {
        return $this->status === self::PUBLISHED && ! $this->isOver() && $this->sessions->where('is_cancelled', false)->isNotEmpty();
    }

    /** May a buyer still ask for a refund? */
    public function refundOpen(): bool
    {
        return $this->refund_until === null || $this->refund_until->isFuture();
    }
}
