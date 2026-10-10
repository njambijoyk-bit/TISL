<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\Codes\CodeException;
use App\Services\Codes\CodeSettings;
use App\Services\Codes\Items\CodeCatalogue;
use App\Services\Codes\Items\LabelService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/** The Codes page: what has a code and what does not, giving codes, printing labels, and finding what a scanned code is. */
class CodesAdminController extends Controller
{
    public function __construct(private CodeCatalogue $items, private LabelService $labels)
    {
    }

    private function guard(callable $fn): JsonResponse
    {
        try {
            return $fn();
        } catch (CodeException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }
    }

    /** GET /admin/codes/items?type=variant&q=&missing=1&page= */
    public function items(Request $request): JsonResponse
    {
        $d = $request->validate(['type' => 'required|in:variant,pack,asset,batch', 'q' => 'nullable|string|max:100', 'missing' => 'nullable|boolean', 'page' => 'nullable|integer|min:1', 'per_page' => 'nullable|integer|min:1|max:100']);

        return $this->guard(fn () => response()->json($this->items->list($d['type'], ['q' => $d['q'] ?? null, 'missing' => $request->boolean('missing'), 'page' => $d['page'] ?? 1, 'per_page' => $d['per_page'] ?? 25])
            + ['ready' => Schema::hasTable('code_sequences'), 'packs_ready' => CodeCatalogue::packsReady()]));
    }

    /** POST /admin/codes/assign {items: [{type, id}]}: give a code to each that has none. */
    public function assign(Request $request): JsonResponse
    {
        $d = $request->validate(['items' => 'required|array|min:1|max:500', 'items.*.type' => 'required|in:variant,pack,asset,batch', 'items.*.id' => 'required|integer']);

        return $this->guard(fn () => response()->json($this->items->assign($d['items'], $request->user()?->id)));
    }

    /** PUT /admin/codes/item {type, id, code, reason?}: set or replace one item's code by hand (the old code stays findable). */
    public function setCode(Request $request): JsonResponse
    {
        $d = $request->validate(['type' => 'required|in:variant,pack,asset,batch', 'id' => 'required|integer', 'code' => 'required|string|max:64', 'reason' => 'nullable|string|max:200']);

        return $this->guard(function () use ($d, $request) {
            $this->items->setCode($d['type'], (int) $d['id'], $d['code'], $request->user()?->id, $d['reason'] ?? null);

            return response()->json(['message' => 'Saved.', 'item' => $this->items->find($d['type'], (int) $d['id'])]);
        });
    }

    /** GET /admin/codes/lookup?code= */
    public function lookup(Request $request): JsonResponse
    {
        $d = $request->validate(['code' => 'required|string|max:200']);
        $matches = $this->items->lookup($d['code']);

        return response()->json(['code' => $d['code'], 'matches' => $matches, 'found' => count($matches) > 0, 'ambiguous' => count(array_filter($matches, fn ($m) => ! $m['retired'])) > 1]);
    }

    /** POST /admin/codes/labels {items: [{type, id, copies}], …options}: the labels to print. Logged. */
    public function labels(Request $request): JsonResponse
    {
        $d = $request->validate([
            'items' => 'required|array|min:1|max:500', 'items.*.type' => 'required|in:variant,pack,asset,batch', 'items.*.id' => 'required|integer', 'items.*.copies' => 'nullable|integer|min:1|max:500',
            'kind' => 'nullable|string|max:12', 'name' => 'nullable|boolean', 'sku' => 'nullable|boolean', 'price' => 'nullable|boolean', 'code_text' => 'nullable|boolean', 'batch' => 'nullable|boolean',
            'size' => 'nullable|string|max:40', 'template' => 'nullable|string|max:40',
        ]);
        $o = array_filter(['kind' => $d['kind'] ?? null, 'size' => $d['size'] ?? null, 'template' => $d['template'] ?? null], fn ($v) => $v !== null);
        foreach (['name', 'sku', 'price', 'code_text', 'batch'] as $k) {
            if ($request->has($k)) {
                $o[$k] = $request->boolean($k);
            }
        }

        return $this->guard(fn () => response()->json($this->labels->build($d['items'], $o, $request->user()?->id)));
    }

    /** GET /admin/codes/prints: the print log. */
    public function prints(Request $request): JsonResponse
    {
        if (! Schema::hasTable('code_prints')) {
            return response()->json(['data' => []]);
        }
        $rows = DB::table('code_prints as p')->leftJoin('users as u', 'u.id', '=', 'p.user_id')->orderByDesc('p.id')->limit(50)->get(['p.id', 'p.created_at', 'p.label_count', 'p.size', 'p.template', 'u.name as by']);

        return response()->json(['data' => $rows]);
    }

    /** GET/PUT /admin/codes/settings */
    public function settings(Request $request): JsonResponse
    {
        return response()->json(['settings' => CodeSettings::all(), 'ready' => CodeSettings::ready()]);
    }

    public function saveSettings(Request $request): JsonResponse
    {
        $d = $request->validate(['internal_prefix' => 'nullable|string|size:2', 'kinds' => 'nullable|array', 'label' => 'nullable|array']);

        return $this->guard(fn () => response()->json(['settings' => CodeSettings::save($d, $request->user()?->id), 'message' => 'Saved.']));
    }
}
