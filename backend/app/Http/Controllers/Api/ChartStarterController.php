<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\Books\ChartStarterService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** Books -> Chart of accounts -> Add starter accounts. Seeing the packs and the preview needs books.view; adding them needs books.post (routes), the same as making a group or ledger by hand. */
class ChartStarterController extends Controller
{
    public function __construct(private ChartStarterService $starters) {}

    public function index(): JsonResponse
    {
        return response()->json(['packs' => $this->starters->packs(), 'log_ready' => ChartStarterService::logReady()]);
    }

    public function preview(Request $request): JsonResponse
    {
        $in = $request->validate(['packs' => 'required|array|min:1', 'packs.*' => 'string']);

        return response()->json($this->starters->preview($in['packs']));
    }

    public function apply(Request $request): JsonResponse
    {
        $in = $request->validate(['packs' => 'required|array|min:1', 'packs.*' => 'string']);

        return response()->json($this->starters->apply($in['packs'], $request->user()));
    }
}
