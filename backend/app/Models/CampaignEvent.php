<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/** A view or click on a campaign, kept small; a visit is stored as a hashed key so it can be counted once. */
class CampaignEvent extends Model
{
    public const UPDATED_AT = null;

    protected $fillable = ['campaign_id', 'section_id', 'event', 'user_id', 'session_key'];
}
