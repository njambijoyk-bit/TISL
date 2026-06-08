<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\SearchAnalyticsService;
use Illuminate\Http\Request;

class SearchAnalyticsController extends Controller
{
    public function __construct(private SearchAnalyticsService $analytics) {}

    // GET /admin/analytics/dashboard?from=2026-01-01&to=2026-06-07
    public function dashboard(Request $request)
    {
        return response()->json(
            $this->analytics->dashboardStats(
                $request->query('from'),
                $request->query('to'),
            )
        );
    }

    // GET /admin/analytics/sessions?from=&to=&page=1&per_page=30
    public function sessions(Request $request)
    {
        return response()->json(
            $this->analytics->sessionsList(
                $request->query('from'),
                $request->query('to'),
                (int) $request->query('page', 1),
                (int) $request->query('per_page', 30),
            )
        );
    }

    // GET /admin/analytics/sessions/{sessionId}
    public function sessionDetail(string $sessionId)
    {
        return response()->json(
            $this->analytics->sessionJourney($sessionId)
        );
    }

    // GET /admin/analytics/customers?from=&to=&page=1
    public function customers(Request $request)
    {
        return response()->json(
            $this->analytics->customersList(
                $request->query('from'),
                $request->query('to'),
                (int) $request->query('page', 1),
                (int) $request->query('per_page', 30),
            )
        );
    }

    // GET /admin/analytics/customers/{customerId}?from=&to=
    public function customerDetail(Request $request, int $customerId)
    {
        return response()->json(
            $this->analytics->customerDetail(
                $customerId,
                $request->query('from'),
                $request->query('to'),
            )
        );
    }
}