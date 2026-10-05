<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/** One block of a campaign's page (hero, story, countdown, video, products, call to action), with its own optional show-from / show-until dates and audience. */
class CampaignSection extends Model
{
    public const TYPES = ['hero', 'story', 'countdown', 'video', 'products', 'cta', 'pins', 'moodboard', 'gallery'];

    protected $fillable = ['campaign_id', 'position', 'type', 'settings', 'show_from', 'show_until', 'audience_rule'];

    protected $casts = ['settings' => 'array', 'audience_rule' => 'array', 'show_from' => 'datetime', 'show_until' => 'datetime'];

    /** Dates go out in the site's own time with its offset (2026-10-18T09:00:00+03:00), so what staff typed is what they see again and a browser reads it correctly. */
    protected function serializeDate(\DateTimeInterface $date): string
    {
        return \Carbon\Carbon::instance($date)->setTimezone(config('app.timezone'))->format('Y-m-d\TH:i:sP');
    }
}
