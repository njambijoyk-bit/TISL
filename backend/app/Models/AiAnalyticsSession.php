<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class AiAnalyticsSession extends Model
{
    public $timestamps = false; // only has created_at

    protected $fillable = [
        'api_key_id', 'module_key', 'admin_id',
        'prompt_tokens', 'completion_tokens', 'cost_estimate',
        'model_used', 'status', 'response_time_ms', 'error_message',
    ];

    protected $casts = [
        'cost_estimate' => 'float',
        'created_at'    => 'datetime',
    ];

    // ── Relationships ────────────────────────────────────────────────
    public function key()
    {
        return $this->belongsTo(AiProviderKey::class, 'api_key_id');
    }

    public function admin()
    {
        return $this->belongsTo(User::class, 'admin_id');
    }

    public function outputs()
    {
        return $this->hasMany(AiAnalyticsOutput::class, 'session_id');
    }

    public function module()
    {
        return $this->belongsTo(AiAnalyticsModule::class, 'module_key', 'key');
    }
}