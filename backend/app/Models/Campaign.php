<?php

namespace App\Models;

use App\Services\Campaigns\CampaignStatus;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

/** A campaign: a scheduled "world" built from sections (the Campaigns module). Its status is worked out from its dates, see CampaignStatus. */
class Campaign extends Model
{
    use SoftDeletes;

    protected $fillable = [
        'slug', 'title', 'subtitle', 'type', 'goal', 'cover_media', 'accent_color', 'teaser_at', 'starts_at', 'ends_at', 'early_access_at', 'audience_rule', 'early_access_audience',
        'is_published', 'published_at', 'is_paused', 'archived_at', 'feature_on_home', 'approval_status', 'approved_by', 'approved_at', 'rejected_note', 'created_by', 'updated_by',
    ];

    protected $casts = [
        'teaser_at' => 'datetime', 'starts_at' => 'datetime', 'ends_at' => 'datetime', 'early_access_at' => 'datetime', 'published_at' => 'datetime', 'archived_at' => 'datetime', 'approved_at' => 'datetime',
        'audience_rule' => 'array', 'early_access_audience' => 'array', 'is_published' => 'boolean', 'is_paused' => 'boolean', 'feature_on_home' => 'boolean',
    ];

    protected $appends = ['status'];

    public function getStatusAttribute(): string
    {
        return CampaignStatus::of($this);
    }

    public function sections(): HasMany
    {
        return $this->hasMany(CampaignSection::class)->orderBy('position')->orderBy('id');
    }

    public function items(): HasMany
    {
        return $this->hasMany(CampaignItem::class)->orderBy('position')->orderBy('id');
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    /** Dates go out in the site's own time with its offset (2026-10-18T09:00:00+03:00), so what staff typed is what they see again and a browser reads it correctly. */
    protected function serializeDate(\DateTimeInterface $date): string
    {
        return \Carbon\Carbon::instance($date)->setTimezone(config('app.timezone'))->format('Y-m-d\TH:i:sP');
    }
}
