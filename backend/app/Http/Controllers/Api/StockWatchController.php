<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\Stock\BackInStock;
use App\Services\Stock\BackInStockException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** "Tell me when it is back": the public side (ask, look up, stop) and the staff side (who is waiting, tell them now, the record). */
class StockWatchController extends Controller
{
    public function __construct(private BackInStock $alerts)
    {
    }

    private function guard(callable $fn): JsonResponse
    {
        try {
            return $fn();
        } catch (BackInStockException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }
    }

    /** POST /stock-watches — open to guests; a signed-in customer's token (if sent) links the request to them. */
    public function store(Request $request): JsonResponse
    {
        $d = $request->validate(['product_id' => 'required|integer|min:1', 'variant_id' => 'nullable|integer|min:1', 'email' => 'nullable|email|max:190', 'name' => 'nullable|string|max:120']);

        return $this->guard(function () use ($d, $request) {
            $r = $this->alerts->watch($d, $request->user('sanctum'));

            return response()->json(['message' => $r['already'] ? 'You are already on the list. We will email you when it is back.' : 'Done. We will email you as soon as it is back in stock.', 'already' => $r['already']], $r['already'] ? 200 : 201);
        });
    }

    /** GET /stock-watches/enabled — should the product page offer "tell me when it is back"? */
    public function enabled(): JsonResponse
    {
        return response()->json(['enabled' => $this->alerts->enabled()]);
    }

    /** GET /stock-watches/{token} — what the "stop" link is about. */
    public function show(string $token): JsonResponse
    {
        $r = $this->alerts->peek($token);

        return $r ? response()->json($r) : response()->json(['message' => 'This link is not valid.'], 404);
    }

    /** POST /stock-watches/{token}/stop */
    public function stop(string $token): JsonResponse
    {
        $r = $this->alerts->stop($token);

        return $r ? response()->json($r + ['message' => 'Done. You will not get these alerts any more.']) : response()->json(['message' => 'This link is not valid.'], 404);
    }

    /** GET /admin/notifications/stock-alerts */
    public function overview(): JsonResponse
    {
        return response()->json(['ready' => BackInStock::ready(), 'products' => BackInStock::ready() ? $this->alerts->overview() : [], 'runs' => BackInStock::ready() ? $this->alerts->runs() : []]);
    }

    /** POST /admin/notifications/stock-alerts/{variant}/tell — mode: stock (as many as there is stock) or all */
    public function tell(Request $request, int $variant): JsonResponse
    {
        $d = $request->validate(['mode' => 'required|in:stock,all']);

        return $this->guard(function () use ($d, $variant, $request) {
            if (! BackInStock::ready()) {
                throw new BackInStockException('Stock alerts are not set up yet (run database script 112).');
            }
            $r = $this->alerts->tell($variant, $d['mode'], $request->user());
            $msg = $r['stock'] <= 0 ? 'Nobody was told: it is not in stock yet.' : ($r['told'] === 0 ? 'Nobody new could be told: the people already told in the last hours are counted against the stock.'
                : "Told {$r['told']} " . ($r['told'] === 1 ? 'person' : 'people') . ($r['left'] ? ", {$r['left']} still waiting." : '.'));

            return response()->json($r + ['message' => $msg]);
        });
    }
}
