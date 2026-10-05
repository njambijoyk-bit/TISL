<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;

/** One pin: an image, a video, a featured item, a link or a note. See PinService for how they are made. */
class CampaignPin extends Model
{
    use SoftDeletes;

    public const KINDS = ['image', 'video', 'item', 'link', 'note'];

    protected $fillable = ['kind', 'owner_user_id', 'source', 'title', 'caption', 'credit', 'tags', 'media_path', 'thumb_path', 'media_width', 'media_height', 'video', 'item_type', 'item_id', 'link_url',
        'allow_download', 'status', 'hidden_reason', 'campaign_id'];

    protected $casts = ['tags' => 'array', 'video' => 'array', 'allow_download' => 'boolean', 'media_width' => 'integer', 'media_height' => 'integer'];

    public function owner(): BelongsTo
    {
        return $this->belongsTo(User::class, 'owner_user_id');
    }

    protected function serializeDate(\DateTimeInterface $date): string
    {
        return \Carbon\Carbon::instance($date)->setTimezone(config('app.timezone'))->format('Y-m-d\TH:i:sP');
    }
}
