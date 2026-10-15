<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\Books\BooksException;
use App\Services\Pos\SaleService;
use App\Services\Pos\StationService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** The cashier's point of sale (/api/pos): the catalogue, pricing, selling for cash, and hold and recall. Changes to Books are made by the books' own posting code, not here. */
class PosController extends Controller
{
    public function __construct(private SaleService $sales)
    {
    }

    private function guard(callable $fn, int $ok = 200): JsonResponse
    {
        try {
            abort_unless(SaleService::installed(), 422, 'Run database scripts 169_pos.sql and 170_pos_sales.sql first.');

            return response()->json($fn(), $ok);
        } catch (BooksException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }
    }

    public function context(Request $request): JsonResponse
    {
        if (! StationService::installed()) {
            return response()->json(['ready' => false, 'message' => 'Run database scripts 169_pos.sql and 170_pos_sales.sql first.']);
        }

        return $this->guard(fn () => ['ready' => SaleService::installed()] + $this->sales->context($request->user(), $request->filled('station_id') ? (int) $request->station_id : null));
    }

    public function catalogue(Request $request): JsonResponse
    {
        return $this->guard(fn () => ['items' => $this->sales->catalogue((string) $request->get('q', ''))]);
    }

    public function scan(Request $request): JsonResponse
    {
        $request->validate(['code' => 'required|string|max:80']);

        return $this->guard(fn () => ['item' => $this->sales->scan((string) $request->code)]);
    }

    public function price(Request $request): JsonResponse
    {
        $d = $request->validate(['items' => 'required|array', 'items.*.variant_id' => 'required|integer', 'items.*.quantity' => 'required|numeric', 'items.*.discount_pct' => 'nullable|numeric', 'station_id' => 'nullable|integer', 'customer_id' => 'nullable|integer', 'mode' => 'nullable|in:cash,invoice,order']);

        return $this->guard(fn () => $this->sales->price($request->user(), $d));
    }

    public function sell(Request $request): JsonResponse
    {
        $d = $request->validate(['key' => 'required|string|max:64', 'items' => 'required|array', 'items.*.variant_id' => 'required|integer', 'items.*.quantity' => 'required|numeric', 'items.*.discount_pct' => 'nullable|numeric',
            'mode' => 'nullable|in:cash,invoice,order', 'tenders' => 'nullable|array', 'tenders.*.payment_method_id' => 'required|integer', 'tenders.*.amount' => 'required|numeric', 'tenders.*.reference' => 'nullable|string|max:100', 'station_id' => 'nullable|integer', 'customer_id' => 'nullable|integer']);

        return $this->guard(fn () => $this->sales->sell($request->user(), $d), 201);
    }

    public function customers(Request $request): JsonResponse
    {
        return $this->guard(fn () => ['customers' => $this->sales->customers((string) $request->get('q', ''))]);
    }

    public function mine(Request $request): JsonResponse
    {
        return $this->guard(fn () => ['sales' => $this->sales->mine($request->user())]);
    }

    public function holds(Request $request): JsonResponse
    {
        return $this->guard(fn () => ['holds' => $this->sales->holds($request->user())]);
    }

    public function hold(Request $request): JsonResponse
    {
        $d = $request->validate(['items' => 'required|array', 'items.*.variant_id' => 'required|integer', 'items.*.quantity' => 'required|numeric', 'items.*.name' => 'nullable|string|max:120', 'items.*.discount_pct' => 'nullable|numeric',
            'label' => 'nullable|string|max:80', 'station_id' => 'nullable|integer', 'customer_id' => 'nullable|integer', 'customer_name' => 'nullable|string|max:120', 'mode' => 'nullable|in:cash,invoice,order']);

        return $this->guard(fn () => $this->sales->hold($request->user(), $d), 201);
    }

    public function recall(Request $request, int $id): JsonResponse
    {
        return $this->guard(fn () => $this->sales->recall($request->user(), $id));
    }

    public function dropHold(Request $request, int $id): JsonResponse
    {
        return $this->guard(function () use ($request, $id) {
            $this->sales->dropHold($request->user(), $id);

            return ['message' => 'Held sale removed.'];
        });
    }
}
