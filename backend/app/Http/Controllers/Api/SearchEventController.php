<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\SearchEvent;
use Illuminate\Http\Request;

class SearchEventController extends Controller
{
    /**
     * POST /api/search-events
     * Fire-and-forget from the frontend. Always returns 204.
     */
    public function store(Request $request)
    {
        $data = $request->validate([
            'session_id'         => 'nullable|string|max:64',
            'event_type'         => 'required|string|in:search,filter,product_view,service_view,product_not_found,add_to_cart,add_to_wishlist,add_to_quotelist',
            'search_context'     => 'nullable|string|in:product,service',
            'query'              => 'nullable|string|max:255',
            'filter_type'        => 'nullable|string|max:64',
            'filter_value'       => 'nullable|string|max:255',
            'results_count'      => 'nullable|integer|min:0',
            'had_results'        => 'nullable|boolean',
            'entity_type'        => 'nullable|string|in:product,service',
            'entity_id'          => 'nullable|integer',
            'entity_name'        => 'nullable|string|max:255',
            'entity_sku'         => 'nullable|string|max:64',
            'result_position'    => 'nullable|integer|min:0',
            'originating_query'  => 'nullable|string|max:255',
        ]);

        // Manually attempt token auth without requiring it
        $user = null;
        try {
            $user = \Laravel\Sanctum\PersonalAccessToken::findToken(
                $request->bearerToken()
            )?->tokenable;
        } catch (\Throwable) {}

        SearchEvent::create(array_merge([
            'user_id'     => $user?->id,
            'customer_id' => $user?->customer?->id,
            'ip_address'  => $request->ip(),
            'user_agent'  => $request->userAgent(),
            'occurred_at' => now(),
        ], $data));

        //SearchEvent::record($data, $request);

        return response()->noContent(); // 204
    }
}