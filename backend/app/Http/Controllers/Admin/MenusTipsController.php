<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Services\Books\BooksException;
use App\Services\Menus\Tips;
use App\Services\Menus\TipsReport;
use Illuminate\Support\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** Menus → Tips: what is in the tips box, and handing tips over. */
class MenusTipsController extends Controller
{
    public function __construct(private Tips $tips)
    {
    }

    public function show(Request $request): JsonResponse
    {
        return response()->json($this->tips->screen($request->user()));
    }

    /** The tips report for a period (default: the last 30 days) and, if one is chosen, a branch. */
    public function report(Request $request): JsonResponse
    {
        $d = $request->validate(['from' => 'nullable|date', 'to' => 'nullable|date', 'location_id' => 'nullable|integer']);
        $to = Carbon::parse($d['to'] ?? today()->toDateString())->toDateString();
        $from = Carbon::parse($d['from'] ?? today()->subDays(30)->toDateString())->toDateString();

        return response()->json(app(TipsReport::class)->build(min($from, $to), max($from, $to), $d['location_id'] ?? null));
    }

    public function issue(Request $request, int $id): JsonResponse
    {
        $d = $request->validate(['to_user_id' => 'nullable|integer', 'to_name' => 'nullable|string|max:160', 'from_ledger_id' => 'required|integer', 'narration' => 'nullable|string|max:300']);
        try {
            $r = $this->tips->issue($id, $d, $request->user());
        } catch (BooksException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        return response()->json(['message' => $r['already'] ? 'That tip was already handed over.' : 'Tip handed over.', 'already' => $r['already']] + $this->tips->screen($request->user()));
    }

    public function reverse(Request $request, int $id): JsonResponse
    {
        $d = $request->validate(['reason' => 'required|string|max:300']);
        try {
            $r = $this->tips->reverse($id, $d['reason'], $request->user());
        } catch (BooksException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        return response()->json(['message' => $r['already'] ? 'That tip is already waiting again.' : 'Taken back: the tip is waiting to be handed over again.', 'already' => $r['already']] + $this->tips->screen($request->user()));
    }
}
