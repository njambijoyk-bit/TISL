<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Location;
use App\Models\Menus\Kiosk;
use App\Services\Books\BooksException;
use App\Services\Menus\KioskService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** Menus → Settings → Kiosks. */
class MenusKioskAdminController extends Controller
{
    public function __construct(private KioskService $kiosks)
    {
    }

    private function guard(callable $fn): JsonResponse
    {
        try {
            abort_unless(KioskService::installed(), 422, 'Run database script 140_menus_kiosk.sql first.');

            return $fn();
        } catch (BooksException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }
    }

    private function row(Kiosk $k): array
    {
        return $k->makeVisible('token')->only(['id', 'name', 'location_id', 'pay_at_screen', 'pay_at_counter', 'idle_seconds', 'welcome', 'is_active']) + ['url' => $this->kiosks->url($k)];
    }

    public function index(): JsonResponse
    {
        if (! KioskService::installed()) {
            return response()->json(['ready' => false, 'kiosks' => [], 'branches' => []]);
        }

        return response()->json(['ready' => true, 'kiosks' => Kiosk::orderBy('name')->get()->map(fn ($k) => $this->row($k))->values(), 'branches' => Location::query()->active()->ordered()->get(['id', 'name'])]);
    }

    public function save(Request $request, ?int $id = null): JsonResponse
    {
        $d = $request->validate(['name' => 'required|string|max:60', 'location_id' => 'nullable|integer', 'pay_at_screen' => 'nullable|boolean', 'pay_at_counter' => 'nullable|boolean', 'idle_seconds' => 'nullable|integer',
            'welcome' => 'nullable|string|max:160', 'is_active' => 'nullable|boolean']);

        return $this->guard(fn () => response()->json(['message' => 'Kiosk saved.', 'kiosk' => $this->row($this->kiosks->save($d, $id))], $id === null ? 201 : 200));
    }

    public function renew(int $id): JsonResponse
    {
        return $this->guard(fn () => response()->json(['message' => 'New address made: open it on the screen again.', 'kiosk' => $this->row($this->kiosks->renewToken(Kiosk::findOrFail($id)))]));
    }

    public function destroy(int $id): JsonResponse
    {
        return $this->guard(function () use ($id) {
            Kiosk::findOrFail($id)->delete();

            return response()->json(['message' => 'Kiosk removed.']);
        });
    }
}
