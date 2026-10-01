<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\Books\DashboardService;
use Illuminate\Http\Request;

/** The dashboard tabs: sales, purchases, pending documents and funnels. Read-only. */
class BooksDashboardController extends Controller
{
    public function __construct(private DashboardService $dash) {}

    public function show(Request $r, string $tab)
    {
        $loc = $r->filled('location_id') ? (int) $r->location_id : null;
        $data = match ($tab) {
            'sales', 'purchases' => $this->dash->side($tab, $r->from, $r->to, $loc),
            'pending' => $this->dash->pending($loc),
            'funnels' => $this->dash->funnels($r->from, $r->to, $loc),
            default => null,
        };

        return $data === null ? response()->json(['message' => 'Unknown dashboard tab.'], 404) : response()->json($data);
    }
}
