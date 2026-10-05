<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Support\Str;

/** A moodboard: a collage on an artboard made from a layout (slots) and what fills them. A template is the same record with is_template set. */
class CampaignMoodboard extends Model
{
    use SoftDeletes;

    protected $fillable = ['owner_user_id', 'title', 'template_key', 'layout', 'contents', 'is_template', 'campaign_id', 'approval_status', 'approved_by', 'approved_at', 'rejected_note', 'status'];

    protected $casts = ['layout' => 'array', 'contents' => 'array', 'is_template' => 'boolean', 'approved_at' => 'datetime'];

    public function owner(): BelongsTo
    {
        return $this->belongsTo(User::class, 'owner_user_id');
    }

    public function slugPath(): string
    {
        return $this->id . '-' . (Str::slug($this->title) ?: 'moodboard');
    }

    protected function serializeDate(\DateTimeInterface $date): string
    {
        return \Carbon\Carbon::instance($date)->setTimezone(config('app.timezone'))->format('Y-m-d\TH:i:sP');
    }
}
