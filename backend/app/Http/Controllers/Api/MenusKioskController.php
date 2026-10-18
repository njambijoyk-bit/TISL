<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\Books\BooksException;
use App\Services\Menus\KioskService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** What a self-order kiosk screen asks for. Open to everyone: the secret in the address is the key. */
class MenusKioskController extends Controller
{
    public function __construct(private KioskService $kiosks)
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

    private function rules(): array
    {
        return ['service' => 'required|string|in:dine_in,take_out', 'items' => 'required|array|min:1|max:60', 'items.*.dish_id' => 'required|integer', 'items.*.quantity' => 'required|integer|min:1|max:20',
            'items.*.mods' => 'nullable|array|max:30', 'items.*.mods.*.ingredient_id' => 'required|integer', 'items.*.mods.*.kind' => 'required|string|in:remove,extra', 'items.*.serving_id' => 'nullable|integer', 'items.*.picks' => 'nullable|array', 'items.*.picks.*' => 'array', 'items.*.option_ids' => 'nullable|array|max:40', 'items.*.option_ids.*' => 'integer', 'items.*.note' => 'nullable|string|max:200'];
    }

    public function show(string $token): JsonResponse
    {
        return $this->guard(fn () => response()->json($this->kiosks->config($this->kiosks->forToken($token))));
    }

    public function quote(Request $request, string $token): JsonResponse
    {
        $d = $request->validate($this->rules());

        return $this->guard(fn () => response()->json($this->kiosks->quote($this->kiosks->forToken($token), $d)));
    }

    public function order(Request $request, string $token): JsonResponse
    {
        $d = $request->validate($this->rules() + ['pay' => 'required|string|in:screen,counter', 'payment_method_id' => 'nullable|integer', 'phone' => 'nullable|string|max:40']);

        return $this->guard(function () use ($d, $token) {
            $r = $this->kiosks->place($this->kiosks->forToken($token), $d);

            return response()->json(['session' => $r['order']->session_code, 'number' => $r['order']->short_no, 'payment' => $r['order']->payment, 'total' => (float) $r['order']->total, 'attempt' => $r['attempt'] ?? null], 201);
        });
    }

    public function status(string $token, string $session): JsonResponse
    {
        return $this->guard(fn () => response()->json($this->kiosks->status($this->kiosks->forToken($token), $session)));
    }

    public function cancel(string $token, string $session): JsonResponse
    {
        return $this->guard(function () use ($token, $session) {
            $this->kiosks->cancel($this->kiosks->forToken($token), $session);

            return response()->json(['message' => 'Cancelled.']);
        });
    }

    public function receipt(string $token, string $session): JsonResponse
    {
        return $this->guard(fn () => response()->json($this->kiosks->receipt($this->kiosks->forToken($token), $session)));
    }
}
