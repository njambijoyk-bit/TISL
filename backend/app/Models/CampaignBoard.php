<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Support\Str;

/** A board: a collection of pins. Official boards are made by staff for the brand; customers keep personal ones (public or private). */
class CampaignBoard extends Model
{
    use SoftDeletes;

    protected $fillable = ['owner_user_id', 'title', 'description', 'cover_pin_id', 'visibility', 'is_official', 'approval_status', 'approved_by', 'approved_at', 'rejected_note', 'campaign_id', 'status', 'hidden_reason'];

    protected $casts = ['is_official' => 'boolean', 'approved_at' => 'datetime'];

    public function owner(): BelongsTo
    {
        return $this->belongsTo(User::class, 'owner_user_id');
    }

    public function pins(): BelongsToMany
    {
        return $this->belongsToMany(CampaignPin::class, 'campaign_board_pins', 'board_id', 'pin_id')->withPivot(['position', 'note'])->orderBy('campaign_board_pins.position')->orderBy('campaign_board_pins.id');
    }

    /** The public address part: id then a slug of the title (/boards/12-after-dark). */
    public function slugPath(): string
    {
        return $this->id . '-' . (Str::slug($this->title) ?: 'board');
    }

    protected function serializeDate(\DateTimeInterface $date): string
    {
        return \Carbon\Carbon::instance($date)->setTimezone(config('app.timezone'))->format('Y-m-d\TH:i:sP');
    }
}
