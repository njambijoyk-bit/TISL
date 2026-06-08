<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class SearchEvent extends Model
{
    public $timestamps = false; // we use occurred_at manually

    protected $fillable = [
        'user_id', 'customer_id', 'session_id',
        'event_type', 'search_context',
        'query', 'filter_type', 'filter_value',
        'results_count', 'had_results',
        'entity_type', 'entity_id', 'entity_name', 'entity_sku',
        'result_position', 'originating_query',
        'ip_address', 'user_agent', 'occurred_at',
    ];

    protected $casts = [
        'had_results'     => 'boolean',
        'occurred_at'     => 'datetime',
    ];

    // ── Static helper so any controller can fire-and-forget ──────────────
    public static function record(array $data, $request = null): void
    {
        try {
            $user = $request ? $request->user() : null;
            static::create(array_merge([
                'user_id'     => $user?->id,
                'customer_id' => $user?->customer?->id,
                'ip_address'  => $request?->ip(),
                'user_agent'  => $request?->userAgent(),
                'occurred_at' => now(),
            ], $data));
        } catch (\Throwable) {
            // never crash the real request
        }
    }
}