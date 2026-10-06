<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Service;
use App\Services\Books\BooksException;
use App\Services\Brochures\BrochureData;
use App\Services\Brochures\BrochureSettings;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Service brochures. The public route gives a customer what the brochure says, but only when the service is on sale and its settings let customers download it.
 * Staff can preview any service's brochure, see every service's settings in one list, and change the shop-wide defaults or many services at once.
 */
class ServiceBrochureController extends Controller
{
    public function __construct(private BrochureSettings $settings, private BrochureData $data) {}

    /** GET /services/{id}/brochure */
    public function publicShow(int $id): JsonResponse
    {
        $s = Service::where('is_visible', true)->where('status', 'active')->findOrFail($id);
        $set = $this->settings->effective($s);
        abort_unless($set['download'], 403, 'A brochure is not available for this service.');

        return response()->json(['data' => $this->data->build($s, $set), 'templates' => BrochureSettings::TEMPLATES]);
    }

    /** GET /admin/services/{id}/brochure: the same, for staff, whatever the download switch says. */
    public function preview(int $id): JsonResponse
    {
        $s = Service::findOrFail($id);

        return response()->json(['data' => $this->data->build($s, $this->settings->effective($s)), 'templates' => BrochureSettings::TEMPLATES, 'preview' => true]);
    }

    /** GET /admin/brochures: the defaults, the templates and every service with its own choices and what it ends up using. */
    public function index(Request $request): JsonResponse
    {
        $defaults = $this->settings->defaults();
        $rows = Service::with('category:id,name')->orderBy('name')->limit(1000)->get()->map(fn (Service $s) => [
            'id' => $s->id, 'name' => $s->name, 'sku' => $s->sku, 'status' => $s->status, 'category' => $s->category?->name,
            'own' => (object) $this->settings->own($s), 'effective' => $this->settings->effective($s, $defaults),
        ])->all();

        return response()->json(['defaults' => $defaults, 'builtin' => BrochureSettings::DEFAULTS, 'templates' => BrochureSettings::TEMPLATES, 'ready' => $this->settings->ready(), 'max_images' => BrochureSettings::MAX_IMAGES, 'services' => $rows]);
    }

    /** PUT /admin/brochures/defaults */
    public function saveDefaults(Request $request): JsonResponse
    {
        try {
            $new = $this->settings->saveDefaults($request->input('settings', []), $request->user());
        } catch (BooksException $e) {
            return response()->json(['message' => $e->getMessage()], 503);
        }

        return response()->json(['message' => 'Defaults saved.', 'defaults' => $new]);
    }

    /** PUT /admin/brochures/services: { ids: [..], settings: {..}, clear: [..] } */
    public function saveServices(Request $request): JsonResponse
    {
        $d = $request->validate(['ids' => ['required', 'array', 'min:1', 'max:1000'], 'ids.*' => ['integer'], 'settings' => ['nullable', 'array'], 'clear' => ['nullable', 'array'], 'clear.*' => ['string', 'max:20']]);
        try {
            $n = $this->settings->saveForServices($d['ids'], $d['settings'] ?? [], $d['clear'] ?? []);
        } catch (BooksException $e) {
            return response()->json(['message' => $e->getMessage()], 503);
        }

        return response()->json(['message' => $n === 1 ? 'Saved for 1 service.' : "Saved for {$n} services."]);
    }
}
