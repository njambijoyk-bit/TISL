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

        return response()->json(
            AiProviderKey::with('creator:id,name')
                ->orderByDesc('created_at')
                ->get()
                ->map(fn($k) => [
                    'id'           => $k->id,
                    'provider'     => $k->provider,
                    'label'        => $k->label,
                    'is_active'    => $k->is_active,
                    'last_used_at' => $k->last_used_at,
                    'created_by'   => $k->creator?->name,
                    'created_at'   => $k->created_at,
                    // api_key intentionally omitted
                ])
        );
    }

    public function storeKey(Request $request)
    {
        $this->authorize('manage', AiProviderKey::class);

        $data = $request->validate([
            'provider' => 'required|in:anthropic,gemini,openai,mistral,cohere',
            'label'    => 'required|string|max:100',
            'api_key'  => 'required|string',
        ]);

        $key = AiProviderKey::create([
            ...$data,
            'created_by' => Auth::id(),
            'is_active'  => false,
        ]);

        return response()->json(['success' => true, 'id' => $key->id], 201);
    }

    public function activateKey(AiProviderKey $key)
    {
        $this->authorize('manage', AiProviderKey::class);

        AiProviderKey::query()->update(['is_active' => false]);
        $key->update(['is_active' => true]);

        return response()->json(['success' => true]);
    }

    public function destroyKey(AiProviderKey $key)
    {
        $this->authorize('manage', AiProviderKey::class);

        if ($key->is_active) {
            return response()->json(['message' => 'Cannot delete the active key.'], 422);
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