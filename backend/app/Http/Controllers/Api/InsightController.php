<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Currency;
use App\Models\UnitOfMeasure;
use App\Services\Insight\ExplainService;
use App\Services\Insight\InsightRegistry;
use App\Services\Insight\Lookback;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * The calculator's side of the house. Read-only: it hands out the currencies and units for the keypad, says which insight packs apply to
 * where the user is (only ones their role may use), and runs one. Nothing here writes to any table.
 */
class InsightController extends Controller
{
    public function __construct(private InsightRegistry $registry) {}

    /** What the plain calculator needs: currencies with their rates, units with their factors, and the look-back choices. */
    public function reference(): JsonResponse
    {
        return response()->json([
            'currencies' => Currency::where('is_active', true)->orderByDesc('is_base')->orderBy('code')->get(['id', 'code', 'name', 'symbol', 'is_base', 'conversion_rate']),
            'units' => UnitOfMeasure::where('is_active', true)->orderBy('dimension')->orderBy('to_base_factor')->get(['id', 'code', 'name', 'dimension', 'to_base_factor']),
            'lookbacks' => collect(Lookback::CHOICES)->map(fn ($label, $key) => ['key' => (string) $key, 'label' => $label])->values(),
            'default_lookback' => Lookback::DEFAULT,
        ]);
    }

    /** The packs that can say something about the page the user is on. */
    public function contexts(Request $request): JsonResponse
    {
        $request->validate(['context' => 'required|array', 'context.type' => 'required|string']);
        $packs = $this->registry->forContext($request->input('context'), $request->user());

        return response()->json(['data' => array_map(fn ($p) => ['key' => $p->key(), 'title' => $p->title()], $packs)]);
    }

    public function answer(Request $request): JsonResponse
    {
        return $this->run($request, false);
    }

    /** The same answer, with the AI putting it into words. The figures are recomputed here, never taken from the browser. */
    public function explain(Request $request): JsonResponse
    {
        return $this->run($request, true);
    }

    private function run(Request $request, bool $words): JsonResponse
    {
        $request->validate(['pack' => 'required|string', 'context' => 'required|array', 'lookback' => 'nullable|string', 'example' => 'nullable|integer|min:0|max:50']);
        $pack = $this->registry->find($request->pack);
        // not allowed looks the same as not there
        if (! $pack || ! $this->registry->allowed($pack, $request->user()) || ! $pack->applies($request->input('context'))) {
            return response()->json(['message' => 'Not found.'], 404);
        }
        $answer = $pack->answer($request->input('context'), Lookback::make($request->lookback), $request->user(), (int) $request->input('example', 0));
        $answer['pack'] = $pack->key();
        if ($words) {
            try {
                $answer['words'] = app(ExplainService::class)->words($answer);
            } catch (\RuntimeException $e) {
                return response()->json(['message' => $e->getMessage(), 'data' => $answer], 422);
            }
        }

        return response()->json(['data' => $answer]);
    }
}
