<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\Books\BooksException;
use App\Services\Pos\SelfCheckoutService;
use App\Services\Pos\StationService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** What a self-checkout screen asks for. Open to everyone: the secret in the screen's address is the key, and nothing here reaches the staff side. */
class PosSelfController extends Controller
{
    public function __construct(private SelfCheckoutService $self, private StationService $stations)
    {
    }

    private function guard(callable $fn, int $ok = 200): JsonResponse
    {
        try {
            return response()->json($fn(), $ok);
        } catch (BooksException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }
    }

    private function items(): array
    {
        return ['items' => 'required|array|min:1|max:60', 'items.*.variant_id' => 'required|integer', 'items.*.quantity' => 'required|integer|min:1|max:20'];
    }

    public function show(string $token): JsonResponse
    {
        return $this->guard(fn () => $this->self->config($this->stations->forToken($token)));
    }

    public function catalogue(Request $request, string $token): JsonResponse
    {
        $s = $this->stations->forToken($token);

        return $this->guard(fn () => ['items' => $this->self->catalogue($s, mb_substr((string) $request->get('q', ''), 0, 60))]);
    }

    public function scan(Request $request, string $token): JsonResponse
    {
        $s = $this->stations->forToken($token);
        $request->validate(['code' => 'required|string|max:80']);

        return $this->guard(fn () => ['item' => $this->self->scan($s, (string) $request->code)]);
    }

    public function quote(Request $request, string $token): JsonResponse
    {
        $s = $this->stations->forToken($token);
        $d = $request->validate($this->items());

        return $this->guard(fn () => $this->self->quote($s, $d['items']));
    }

    public function order(Request $request, string $token): JsonResponse
    {
        $s = $this->stations->forToken($token);
        $d = $request->validate($this->items() + ['pay' => 'required|in:screen,counter', 'payment_method_id' => 'nullable|integer', 'phone' => 'nullable|string|max:40']);

        return $this->guard(fn () => $this->self->place($s, $d), 201);
    }

    public function status(string $token, string $session): JsonResponse
    {
        $s = $this->stations->forToken($token);

        return $this->guard(fn () => $this->self->status($s, $session));
    }

    public function cancel(string $token, string $session): JsonResponse
    {
        $s = $this->stations->forToken($token);

        return $this->guard(function () use ($s, $session) {
            $this->self->cancel($s, $session);

            return ['message' => 'Cancelled.'];
        });
    }

    public function assist(Request $request, string $token, string $session): JsonResponse
    {
        $s = $this->stations->forToken($token);
        $d = $request->validate(['email' => 'required|email|max:120', 'pin' => 'required|string|max:12']);

        return $this->guard(function () use ($s, $session, $d) {
            $this->self->assist($s, $session, $d['email'], $d['pin']);

            return ['message' => 'Cleared.'];
        });
    }

    public function help(string $token): JsonResponse
    {
        $s = $this->stations->forToken($token);

        return $this->guard(fn () => $this->self->callForHelp($s));
    }

    public function helpCancel(string $token): JsonResponse
    {
        $s = $this->stations->forToken($token);

        return $this->guard(function () use ($s) {
            $this->self->cancelHelp($s);

            return $this->self->helpStatus($s);
        });
    }

    public function helpStatus(string $token): JsonResponse
    {
        $s = $this->stations->forToken($token);

        return $this->guard(fn () => $this->self->helpStatus($s));
    }

    public function receipt(string $token, string $session): JsonResponse
    {
        $s = $this->stations->forToken($token);

        return $this->guard(fn () => $this->self->receipt($s, $session));
    }
}
