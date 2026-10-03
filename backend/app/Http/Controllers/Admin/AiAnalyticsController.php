<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\AiProviderKey;
use App\Models\AiAnalyticsModule;
use App\Models\AiAnalyticsSession;
use App\Models\AiAnalyticsOutput;
use App\Services\AiAnalyticsService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

class AiAnalyticsController extends Controller
{
    public function __construct(protected AiAnalyticsService $ai) {}

    // ── Keys ─────────────────────────────────────────────────────────

    public function indexKeys()
    {
        $this->authorize('manage', AiProviderKey::class);
        $gw = app(\App\Services\Ai\AiGateway::class);
        $cols = $gw::columns();

        return response()->json([
            'columns_ready' => $cols,
            'providers'     => collect($gw::PROVIDERS)->map(fn ($p, $k) => ['value' => $k] + $p)->values(),
            'purposes'      => ['analytics' => 'AI analytics', 'mimi' => 'Mimi chat', 'screening' => 'Careers screening'],
            // who is first choice for each purpose, so the screen can say so
            'first_choice'  => collect($gw::PURPOSES)->mapWithKeys(fn ($p) => [$p => $gw->keysFor($p)->first()?->id]),
            'keys'          => AiProviderKey::with('creator:id,name')->orderByRaw($cols ? 'priority, id' : 'id')->get()->map(fn ($k) => [
                'id'           => $k->id,
                'provider'     => $k->provider,
                'label'        => $k->label,
                'model'        => $k->model,
                'effective_model' => $gw->modelOf($k),
                'base_url'     => $k->base_url,
                'used_for'        => $cols ? ($k->used_for ?? 'all') : 'all',
                'priority'     => $cols ? (int) $k->priority : 0,
                'is_active'    => $k->is_active,
                'last_used_at' => $k->last_used_at,
                'last_error'   => $cols ? $k->last_error : null,
                'last_error_at' => $cols ? $k->last_error_at : null,
                'key_hint'     => $k->hint(),
                'created_by'   => $k->creator?->name,
                'created_at'   => $k->created_at,
                // the key itself is never sent
            ])->values(),
        ]);
    }

    private function keyRules(bool $creating): array
    {
        return [
            'provider' => ($creating ? 'required' : 'sometimes') . '|in:' . implode(',', array_keys(\App\Services\Ai\AiGateway::PROVIDERS)),
            'label'    => ($creating ? 'required' : 'sometimes') . '|string|max:100',
            'api_key'  => ($creating ? 'required' : 'sometimes|nullable') . '|string|max:500',
            'model'    => 'nullable|string|max:80',
            'base_url' => 'nullable|url|max:200',
            'used_for'    => 'sometimes|in:analytics,mimi,screening,all',
        ];
    }

    public function storeKey(Request $request)
    {
        $this->authorize('manage', AiProviderKey::class);
        $data = $request->validate($this->keyRules(true));
        $cols = \App\Services\Ai\AiGateway::columns();
        if (! $cols) {
            $data = array_intersect_key($data, array_flip(['provider', 'label', 'api_key']));
        }

        $key = AiProviderKey::create([
            ...$data,
            ...($cols ? ['priority' => ((int) AiProviderKey::max('priority')) + 10, 'used_for' => $data['used_for'] ?? 'all'] : []),
            'created_by' => Auth::id(),
            'is_active'  => true,   // in use as soon as it is added; switch it off on the screen
        ]);

        return response()->json(['success' => true, 'id' => $key->id], 201);
    }

    /** Change a key: its label, model, endpoint, what it is used for, or the secret itself (left empty = unchanged). */
    public function updateKey(Request $request, AiProviderKey $key)
    {
        $this->authorize('manage', AiProviderKey::class);
        $data = $request->validate($this->keyRules(false));
        if (empty($data['api_key'])) {
            unset($data['api_key']);
        }
        if (! \App\Services\Ai\AiGateway::columns()) {
            $data = array_intersect_key($data, array_flip(['provider', 'label', 'api_key']));
        }
        $key->update($data);

        return response()->json(['success' => true]);
    }

    /** Switch a key on or off. Several can be in use at once; they are tried in order. */
    public function activateKey(AiProviderKey $key)
    {
        $this->authorize('manage', AiProviderKey::class);
        $key->update(['is_active' => ! $key->is_active]);

        return response()->json(['success' => true, 'is_active' => $key->is_active]);
    }

    /** Make this key the first one tried (before every other key). */
    public function firstChoice(AiProviderKey $key)
    {
        $this->authorize('manage', AiProviderKey::class);
        if (! \App\Services\Ai\AiGateway::columns()) {
            return response()->json(['message' => 'Run script 67_ai_provider_keys.sql first.'], 422);
        }
        $key->update(['priority' => ((int) AiProviderKey::min('priority')) - 10, 'is_active' => true]);

        return response()->json(['success' => true]);
    }

    /** Send a tiny question with this key, to prove it works and show which model answered and how fast. */
    public function testKey(AiProviderKey $key)
    {
        $this->authorize('manage', AiProviderKey::class);
        $t = microtime(true);
        try {
            $r = app(\App\Services\Ai\AiGateway::class)->chat($key, null, [['role' => 'user', 'content' => 'Reply with the single word: OK']], ['max_tokens' => 20, 'timeout' => 20]);
            $key->forceFill(\App\Services\Ai\AiGateway::columns() ? ['last_error' => null, 'last_error_at' => null] : [])->save();

            return response()->json(['ok' => true, 'model' => $r['model'], 'reply' => $r['text'], 'ms' => (int) ((microtime(true) - $t) * 1000)]);
        } catch (\App\Services\Ai\AiGatewayException $e) {
            if (\App\Services\Ai\AiGateway::columns()) {
                $key->forceFill(['last_error' => substr($e->getMessage(), 0, 250), 'last_error_at' => now()])->save();
            }

            return response()->json(['ok' => false, 'message' => $e->getMessage()]);
        }
    }

    public function destroyKey(AiProviderKey $key)
    {
        $this->authorize('manage', AiProviderKey::class);

        if ($key->is_active) {
            return response()->json(['message' => 'Switch the key off before deleting it.'], 422);
        }

        $key->delete();

        return response()->json(['success' => true]);
    }

    // ── Modules ──────────────────────────────────────────────────────

    public function indexModules()
    {
        return response()->json(
            AiAnalyticsModule::orderBy('sort_order')->get()
        );
    }

    public function toggleModule(AiAnalyticsModule $module)
    {
        $this->authorize('manage', AiProviderKey::class);

        $module->update(['is_enabled' => !$module->is_enabled]);

        return response()->json(['success' => true, 'is_enabled' => $module->is_enabled]);
    }

    // ── Sessions ─────────────────────────────────────────────────────

    public function indexSessions(Request $request)
    {
        $sessions = AiAnalyticsSession::with(['admin:id,name', 'key:id,provider,label'])
            ->when($request->module_key, fn($q) => $q->where('module_key', $request->module_key))
            ->when($request->status,     fn($q) => $q->where('status', $request->status))
            ->when($request->admin_id,   fn($q) => $q->where('admin_id', $request->admin_id))
            ->orderByDesc('created_at')
            ->paginate($request->per_page ?? 30);

        return response()->json($sessions);
    }

    public function sessionStats()
    {
        return response()->json([
            'total_sessions' => AiAnalyticsSession::count(),
            'total_cost'     => AiAnalyticsSession::sum('cost_estimate'),
            'total_tokens'   => AiAnalyticsSession::selectRaw('SUM(prompt_tokens + completion_tokens) as total')->value('total'),
            'success_rate'   => AiAnalyticsSession::where('status', 'success')->count(),
            'failed'         => AiAnalyticsSession::where('status', 'failed')->count(),
            'by_module'      => AiAnalyticsSession::selectRaw('module_key, COUNT(*) as count, SUM(cost_estimate) as cost')
                                    ->groupBy('module_key')->get(),
            'by_provider'    => AiAnalyticsSession::join('ai_provider_keys', 'ai_analytics_sessions.api_key_id', '=', 'ai_provider_keys.id')
                                    ->selectRaw('ai_provider_keys.provider, COUNT(*) as count')
                                    ->groupBy('ai_provider_keys.provider')->get(),
        ]);
    }

    // ── Analyse ──────────────────────────────────────────────────────

    public function analyse(Request $request)
    {
        $data = $request->validate([
            'module_key'    => 'required|string',
            'entity_type'   => 'nullable|string',
            'entity_id'     => 'nullable|integer',
            'output_type'   => 'nullable|in:summary,insight,risk,recommendation',
            'custom_prompt' => 'nullable|string|max:1000',  // free-form mode only
        ]);

        try {
            $output = $this->ai->analyse(
                moduleKey:    $data['module_key'],
                adminId:      Auth::id(),
                entityId:     $data['entity_id']     ?? null,
                entityType:   $data['entity_type']   ?? null,
                outputType:   $data['output_type']   ?? 'summary',
                customPrompt: $data['custom_prompt'] ?? null,
            );

            return response()->json([
                'success' => true,
                'output'  => $output,
            ]);

        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => $e->getMessage(),
            ], 500);
        }
    }

    // ── Outputs ──────────────────────────────────────────────────────

    public function dismissOutput(AiAnalyticsOutput $output)
    {
        $output->update(['is_dismissed' => true]);
        return response()->json(['success' => true]);
    }

    public function moduleOutputs(Request $request, string $moduleKey)
    {
        $outputs = AiAnalyticsOutput::whereHas('session', fn($q) =>
                $q->where('module_key', $moduleKey)->where('status', 'success')
            )
            ->where('is_dismissed', false)
            ->when($request->entity_type, fn($q) => $q->where('entity_type', $request->entity_type))
            ->when($request->entity_id,   fn($q) => $q->where('entity_id', $request->entity_id))
            ->with('session:id,created_at,admin_id,model_used')
            ->orderByDesc('created_at')
            ->paginate(20);

        return response()->json($outputs);
    }
}