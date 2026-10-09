<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\CostCentre;
use App\Services\CostCentres\CostCentreService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** Settings, Cost centres: the tree, and the defaults that mean no entry is ever without one. */
class CostCentreController extends Controller
{
    public function __construct(private CostCentreService $svc) {}

    public function index(): JsonResponse
    {
        if (! CostCentre::ready()) {
            return response()->json(['ready' => false, 'data' => [], 'settings' => (object) [], 'default_keys' => CostCentreService::DEFAULT_KEYS, 'types' => CostCentre::TYPES]);
        }

        return response()->json(['ready' => true, 'data' => $this->svc->tree(), 'settings' => $this->svc->settings(), 'default_keys' => CostCentreService::DEFAULT_KEYS, 'types' => CostCentre::TYPES]);
    }

    /** What a voucher form needs to pick a cost centre: the active ones in tree order, and whether a line may differ from its voucher. */
    public function options(): JsonResponse
    {
        if (! CostCentre::ready() || ! $this->svc->booksReady()) {
            return response()->json(['ready' => false, 'data' => [], 'line_override' => false]);
        }
        $rows = array_values(array_filter($this->svc->tree(false), fn ($r) => $r['is_active']));

        return response()->json(['ready' => true, 'line_override' => $this->svc->lineOverride(),
            'data' => array_map(fn ($r) => ['id' => $r['id'], 'name' => $r['name'], 'path' => $r['path'], 'depth' => $r['depth'], 'location_id' => $r['location_id'] ?? null], $rows)]);
    }

    private function rules(): array
    {
        return [
            'name' => 'required|string|max:120', 'code' => 'nullable|string|max:30|regex:/^[A-Za-z0-9-]+$/', 'parent_id' => 'nullable|integer|exists:cost_centres,id',
            'purpose' => 'nullable|string|max:40', 'description' => 'nullable|string|max:255', 'sort_order' => 'nullable|integer|min:0|max:9999',
        ];
    }

    public function store(Request $request): JsonResponse
    {
        $d = $request->validate($this->rules());

        return response()->json(['message' => 'Cost centre added.', 'data' => $this->svc->create($d)], 201);
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $c = CostCentre::findOrFail($id);
        $d = $request->validate(['name' => 'sometimes|required|string|max:120', 'is_active' => 'sometimes|boolean'] + array_diff_key($this->rules(), ['name' => 1]));

        return response()->json(['message' => 'Saved.', 'data' => $this->svc->update($c, $d)]);
    }

    public function destroy(int $id): JsonResponse
    {
        $this->svc->delete(CostCentre::findOrFail($id));

        return response()->json(['message' => 'Deleted.']);
    }

    public function saveSettings(Request $request): JsonResponse
    {
        $keys = array_merge(['general', 'head_office'], array_keys(CostCentreService::DEFAULT_KEYS));
        $d = $request->validate(array_fill_keys($keys, 'sometimes|integer|exists:cost_centres,id') + ['line_override' => 'sometimes|boolean']);

        return response()->json(['message' => 'Saved.', 'settings' => $this->svc->saveSettings($d, $request->user()->id)]);
    }
}
