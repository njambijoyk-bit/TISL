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
        // what each pack would still add (new groups, new ledgers or moves), so the screen can hide the button when nothing is left
        $todo = collect($this->starters->preview(array_column($this->starters->packs(), 'key'))['packs'])->mapWithKeys(fn ($p) => [$p['key'] => $p['counts']['new_groups'] + $p['counts']['new_ledgers'] + $p['counts']['moves']]);
        $packs = array_map(fn ($p) => $p + ['pending' => (int) ($todo[$p['key']] ?? 0)], $this->starters->packs());

        return response()->json(['packs' => $packs, 'pending' => (int) $todo->sum(), 'log_ready' => ChartStarterService::logReady()]);
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
