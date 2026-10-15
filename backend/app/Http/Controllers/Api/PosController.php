<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\Books\BooksException;
use App\Services\Pos\ApprovalRequired;
use App\Services\Pos\HelpService;
use App\Services\Pos\PinService;
use App\Services\Pos\ReceiptService;
use App\Services\Pos\ShiftService;
use App\Services\Pos\SaleService;
use App\Services\Pos\StationService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** The cashier's point of sale (/api/pos): the catalogue, pricing, selling for cash, and hold and recall. Changes to Books are made by the books' own posting code, not here. */
class PosController extends Controller
{
    public function __construct(private SaleService $sales, private PinService $pins, private StationService $stations, private ReceiptService $receipts, private ShiftService $shifts, private HelpService $help)
    {
    }

    private function guard(callable $fn, int $ok = 200): JsonResponse
    {
        try {
            abort_unless(SaleService::installed(), 422, 'Run database scripts 169_pos.sql and 170_pos_sales.sql first.');

            return response()->json($fn(), $ok);
        } catch (ApprovalRequired $e) {
            return response()->json(['message' => $e->getMessage(), 'approval' => $e->purpose], 422);   // the till asks a supervisor for their PIN, then tries again
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
        $d = $request->validate(['items' => 'required|array', 'items.*.variant_id' => 'required|integer', 'items.*.quantity' => 'required|numeric', 'items.*.discount_pct' => 'nullable|numeric', 'station_id' => 'nullable|integer', 'customer_id' => 'nullable|integer', 'mode' => 'nullable|in:cash,invoice,order', 'approval_token' => 'nullable|string|max:60']);

        return $this->guard(fn () => $this->sales->price($request->user(), $d));
    }

    public function sell(Request $request): JsonResponse
    {
        $d = $request->validate(['key' => 'required|string|max:64', 'items' => 'required|array', 'items.*.variant_id' => 'required|integer', 'items.*.quantity' => 'required|numeric', 'items.*.discount_pct' => 'nullable|numeric',
            'mode' => 'nullable|in:cash,invoice,order', 'approval_token' => 'nullable|string|max:60', 'tenders' => 'nullable|array', 'tenders.*.payment_method_id' => 'required|integer', 'tenders.*.amount' => 'required|numeric', 'tenders.*.reference' => 'nullable|string|max:100', 'station_id' => 'nullable|integer', 'customer_id' => 'nullable|integer']);

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

    public function receipt(Request $request, int $id): JsonResponse
    {
        return $this->guard(fn () => $this->receipts->build($request->user(), $id, $request->filled('paper') ? (string) $request->paper : null));
    }

    // ── self-checkout help requests ──

    public function helpOpen(Request $request): JsonResponse
    {
        return response()->json(['requests' => $this->help->open($request->user())]);
    }

    public function helpDone(Request $request, int $id): JsonResponse
    {
        $this->help->done($request->user(), $id);

        return response()->json(['ok' => true]);
    }

    // ── shifts ──

    public function shifts(Request $request): JsonResponse
    {
        return $this->guard(fn () => ['shifts' => $this->shifts->list($request->user())]);
    }

    public function openShift(Request $request): JsonResponse
    {
        $d = $request->validate(['opening_float' => 'required|numeric|min:0', 'station_id' => 'nullable|integer']);

        return $this->guard(function () use ($request, $d) {
            $station = $this->stations->resolveFor($request->user(), null, $d['station_id'] ?? null) ?? throw new BooksException('You have no station to sell from.');
            $sh = $this->shifts->open($request->user(), $station, (float) $d['opening_float']);

            return ['message' => 'Shift open.', 'shift' => ['id' => (int) $sh->id]];
        }, 201);
    }

    public function closeShift(Request $request, int $id): JsonResponse
    {
        $d = $request->validate(['counted' => 'required|array', 'counted.*.payment_method_id' => 'required|integer', 'counted.*.amount' => 'required|numeric|min:0', 'note' => 'nullable|string|max:255']);

        return $this->guard(fn () => $this->shifts->close($request->user(), $id, $d['counted'], $d['note'] ?? null));
    }

    public function shiftReport(Request $request, int $id): JsonResponse
    {
        return $this->guard(fn () => $this->shifts->report($request->user(), $id));
    }

    // ── supervisor approval, returns, voids ──

    public function supervisors(Request $request): JsonResponse
    {
        return $this->guard(function () use ($request) {
            $station = $this->stations->resolveFor($request->user(), null, $request->filled('station_id') ? (int) $request->station_id : null) ?? throw new BooksException('You have no station to sell from.');

            return ['supervisors' => $this->pins->supervisors($request->user(), $station)];
        });
    }

    public function approve(Request $request): JsonResponse
    {
        $d = $request->validate(['supervisor_id' => 'required|integer', 'pin' => 'required|string|max:12', 'purpose' => 'required|in:discount,return,void', 'station_id' => 'nullable|integer']);

        return $this->guard(function () use ($request, $d) {
            $station = $this->stations->resolveFor($request->user(), null, $d['station_id'] ?? null) ?? throw new BooksException('You have no station to sell from.');

            return $this->pins->approve($request->user(), $station, (int) $d['supervisor_id'], $d['pin'], $d['purpose']);
        });
    }

    public function setPin(Request $request): JsonResponse
    {
        $d = $request->validate(['pin' => 'required|string|max:12']);

        return $this->guard(function () use ($request, $d) {
            $this->pins->setPin($request->user(), $d['pin']);

            return ['message' => 'Your PIN is saved.'];
        });
    }

    public function findReturn(Request $request): JsonResponse
    {
        $request->validate(['number' => 'required|string|max:60']);

        return $this->guard(fn () => $this->sales->findForReturn($request->user(), (string) $request->number));
    }

    public function makeReturn(Request $request): JsonResponse
    {
        $d = $request->validate(['voucher_id' => 'required|integer', 'lines' => 'required|array', 'lines.*.item_id' => 'required|integer', 'lines.*.quantity' => 'required|numeric', 'reason' => 'required|string|max:200',
            'refund_ledger_id' => 'nullable|integer', 'approval_token' => 'nullable|string|max:60', 'station_id' => 'nullable|integer']);

        return $this->guard(fn () => $this->sales->makeReturn($request->user(), $d), 201);
    }

    public function logVoid(Request $request): JsonResponse
    {
        $d = $request->validate(['what' => 'nullable|in:line,basket', 'item' => 'nullable|string|max:120', 'quantity' => 'nullable|numeric', 'amount' => 'nullable|numeric', 'approval_token' => 'nullable|string|max:60', 'station_id' => 'nullable|integer']);

        return $this->guard(function () use ($request, $d) {
            $this->sales->logVoid($request->user(), $d);

            return ['ok' => true];
        });
    }
}
