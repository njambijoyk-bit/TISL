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

    protected $fillable = ['owner_user_id', 'source', 'visibility', 'title', 'template_key', 'layout', 'contents', 'is_template', 'campaign_id', 'approval_status', 'approved_by', 'approved_at', 'rejected_note', 'status'];

    protected $casts = ['layout' => 'array', 'contents' => 'array', 'is_template' => 'boolean', 'approved_at' => 'datetime'];

    /** What a visitor may see: an approved, visible, public moodboard (not a template). */
    public function scopePublic($q)
    {
        return $q->where('is_template', false)->where('status', 'visible')->where('approval_status', 'approved')->where('visibility', 'public');
    }

    /** What staff may open: all staff moodboards, and a customer's once it is public. A customer's private one is only for admin and super admin (every look is logged). */
    public function scopeForStaff($q, ?User $by = null)
    {
        if ($by && $by->holdsAny(['admin', 'super_admin'])) {
            return $q;
        }

        return $q->where(fn ($w) => $w->where('source', '!=', 'customer')->orWhere('visibility', 'public'));
    }

    /** A customer's moodboard that is still private. */
    public function isPrivateCustomer(): bool
    {
        return $this->source === 'customer' && $this->visibility === 'private';
    }

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
