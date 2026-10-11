<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Menus\Chef;
use App\Models\Menus\ChefCert;
use App\Models\Menus\Station;
use App\Services\Books\BooksException;
use App\Services\Menus\ChefService;
use App\Services\Menus\KitchenService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** Menus → Chefs. */
class MenusChefController extends Controller
{
    public function __construct(private ChefService $chefs)
    {
    }

    private function guard(callable $fn): JsonResponse
    {
        try {
            abort_unless(ChefService::installed(), 422, 'Run database script 141_menus_chefs.sql first.');

            return $fn();
        } catch (BooksException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }
    }

    public function index(): JsonResponse
    {
        if (! ChefService::installed()) {
            return response()->json(['ready' => false, 'chefs' => [], 'stations' => [], 'kinds' => ChefCert::KINDS]);
        }

        return response()->json(['ready' => true, 'chefs' => $this->chefs->roster(), 'kinds' => ChefCert::KINDS, 'warn_days' => ChefCert::WARN_DAYS,
            'stations' => KitchenService::installed() ? Station::where('is_active', true)->orderBy('sort_order')->orderBy('name')->get(['id', 'name']) : []]);
    }

    public function candidates(Request $request): JsonResponse
    {
        return $this->guard(fn () => response()->json(['users' => $this->chefs->candidates((string) $request->query('q', ''))]));
    }

    public function save(Request $request, ?int $id = null): JsonResponse
    {
        $d = $request->validate(['user_id' => 'nullable|integer', 'display_name' => 'nullable|string|max:80', 'title' => 'nullable|string|max:80', 'bio' => 'nullable|string|max:2000', 'photo' => 'nullable|string|max:255',
            'station_ids' => 'nullable|array|max:30', 'station_ids.*' => 'integer', 'is_instructor' => 'nullable|boolean', 'is_public' => 'nullable|boolean', 'is_active' => 'nullable|boolean', 'sort_order' => 'nullable|integer|min:0|max:9999']);

        return $this->guard(fn () => response()->json(['message' => 'Chef saved.', 'chef' => $this->chefs->save($d, $id)], $id === null ? 201 : 200));
    }

    public function destroy(int $id): JsonResponse
    {
        return $this->guard(function () use ($id) {
            $this->chefs->delete(Chef::findOrFail($id));

            return response()->json(['message' => 'Chef removed.']);
        });
    }

    public function saveCert(Request $request, int $id, ?int $cert = null): JsonResponse
    {
        $d = $request->validate(['kind' => 'nullable|string|max:20', 'name' => 'nullable|string|max:120', 'number' => 'nullable|string|max:60', 'issued_on' => 'nullable|date', 'expires_on' => 'nullable|date', 'notes' => 'nullable|string|max:255']);

        return $this->guard(fn () => response()->json(['message' => 'Certificate saved.', 'cert' => $this->chefs->saveCert(Chef::findOrFail($id), $d, $cert)], $cert === null ? 201 : 200));
    }

    public function destroyCert(int $id, int $cert): JsonResponse
    {
        return $this->guard(function () use ($id, $cert) {
            $this->chefs->deleteCert(Chef::findOrFail($id), $cert);

            return response()->json(['message' => 'Certificate removed.']);
        });
    }
}
