<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Books\PaymentMethod;
use App\Services\Books\BooksException;
use App\Services\Menus\TableGuest;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** The page a guest gets by scanning the QR on their table. Open to everyone; the code in the link is the key. */
class MenusTableController extends Controller
{
    public function __construct(private TableGuest $guest)
    {
    }

    private function guard(callable $fn): JsonResponse
    {
        try {
            return $fn();
        } catch (BooksException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }
    }

    public function show(string $qr): JsonResponse
    {
        return response()->json($this->guest->show($qr));
    }

    public function order(Request $request, string $qr): JsonResponse
    {
        $d = $request->validate(['items' => 'required|array|min:1|max:40', 'items.*.dish_id' => 'required|integer', 'items.*.quantity' => 'required|integer|min:1|max:20', 'items.*.mods' => 'nullable|array|max:30', 'items.*.mods.*.ingredient_id' => 'required|integer', 'items.*.mods.*.kind' => 'required|string|in:remove,extra', 'items.*.serving_id' => 'nullable|integer', 'items.*.picks' => 'nullable|array', 'items.*.picks.*' => 'array', 'items.*.option_ids' => 'nullable|array|max:40',
            'items.*.option_ids.*' => 'integer', 'items.*.note' => 'nullable|string|max:200', 'guests' => 'nullable|integer|min:1|max:50']);

        return $this->guard(function () use ($d, $qr) {
            $this->guest->order($qr, $d['items'], $d['guests'] ?? null);

            return response()->json($this->guest->show($qr) + ['message' => 'Sent to the kitchen.'], 201);
        });
    }

    public function bill(string $qr): JsonResponse
    {
        return $this->guard(function () use ($qr) {
            $this->guest->askBill($qr);

            return response()->json($this->guest->show($qr) + ['message' => 'We are bringing the bill.']);
        });
    }

    public function pay(Request $request, string $qr): JsonResponse
    {
        $d = $request->validate(['payment_method_id' => 'required|integer', 'phone' => 'required|string|max:40', 'tip' => 'nullable|numeric|min:0|max:10000000']);

        return $this->guard(function () use ($d, $qr) {
            $method = PaymentMethod::find($d['payment_method_id']) ?? throw new BooksException('Choose how to pay.');
            $r = $this->guest->pay($qr, $method, $d['phone'], (float) ($d['tip'] ?? 0));

            return response()->json(['attempt' => $r['attempt'], 'redirect_url' => $r['redirect_url'], 'total' => (float) $r['order']->total,
                'message' => $r['redirect_url'] ? 'Taking you to the secure payment page…' : 'Check your phone and enter your M-Pesa PIN.']);
        });
    }
}
