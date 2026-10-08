<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\EngagementSetting;
use App\Services\Books\BooksException;
use App\Services\Engagement\EngagementPresets;
use App\Services\Engagement\EngagementRules;
use App\Services\Engagement\EngagementTargets;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** The Engagement Engine's settings page (admin and super admin) and the small public config the storefront reads to show or hide its controls. */
class EngagementSettingsController extends Controller
{
    public function __construct(private EngagementRules $rules) {}

    private function admin(Request $r): void
    {
        abort_unless($r->user()->hasPermission('engagement.settings'), 403, 'You do not have permission to change the Engagement settings.');
    }

    private function payload(): array
    {
        $s = $this->rules->settings();
        $targets = [];
        foreach (EngagementTargets::all() as $key => $t) {
            $targets[] = ['key' => $key, 'label' => $t['label'], 'module' => $t['module'], 'commerce' => $t['commerce'], 'actions' => $t['actions'], 'available' => EngagementTargets::available($key)];
        }

        return [
            'ready' => EngagementSetting::ready() && \Illuminate\Support\Facades\Schema::hasTable('engagement_rules'),
            'settings' => ['enabled' => $s->enabled, 'preset' => $s->preset, 'paid_required' => $s->paid_required, 'delivered_required' => $s->delivered_required,
                'service_completed_counts' => $s->service_completed_counts, 'service_late_fee_counts' => $s->service_late_fee_counts, 'service_noshow_counts' => $s->service_noshow_counts,
                'service_free_cancel_counts' => $s->service_free_cancel_counts, 'auto_hide_reports' => $s->auto_hide_reports, 'notify_author' => $s->notify_author,
                'notify_approvers' => $s->notify_approvers, 'blocked_words' => $s->blocked_words ?? []],
            'rules' => $this->rules->rules(),
            'reasons' => $this->rules->reasons(),
            'targets' => $targets,
            'actions' => collect(EngagementTargets::ACTIONS)->map(fn ($a, $k) => ['key' => $k] + $a)->values()->all(),
            'who' => EngagementTargets::WHO,
            'hold' => EngagementTargets::HOLD,
            'presets' => collect(EngagementPresets::ALL)->map(fn ($p, $k) => ['key' => $k] + $p)->values()->all(),
        ];
    }

    public function show(Request $request): JsonResponse
    {
        $this->admin($request);

        return response()->json($this->payload());
    }

    public function update(Request $request): JsonResponse
    {
        $this->admin($request);
        $request->validate(['settings' => ['sometimes', 'array'], 'rules' => ['sometimes', 'array'], 'reasons' => ['sometimes', 'array', 'max:20'], 'reasons.*' => ['string', 'max:60']]);
        try {
            $this->rules->save($request->only(['settings', 'rules', 'reasons']), $request->user());
        } catch (BooksException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        return response()->json(['message' => 'Engagement settings saved.'] + $this->payload());
    }

    public function preset(Request $request): JsonResponse
    {
        $this->admin($request);
        $d = $request->validate(['preset' => ['required', 'string', 'max:30']]);
        try {
            $this->rules->applyPreset($d['preset'], $request->user());
        } catch (BooksException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        return response()->json(['message' => 'Preset applied.'] + $this->payload());
    }

    /** GET /engagement/config: which controls to show. Nothing when the engine is off. A rule only says what the page needs, never the settings behind it. */
    public function config(): JsonResponse
    {
        if (! $this->rules->settings()->enabled) {
            return response()->json(['enabled' => false]);
        }
        $out = [];
        foreach ($this->rules->rules() as $type => $actions) {
            if (! EngagementTargets::available($type)) {
                continue;
            }
            foreach ($actions as $a => $r) {
                if ($r['enabled']) {
                    $out[$type][$a] = ['who' => $r['who'], 'must_have_bought' => $r['must_have_bought'], 'min_words' => $r['min_words'], 'photos' => $r['photos'], 'hold' => $r['hold'] !== 'never'];
                }
            }
        }

        return response()->json(['enabled' => true, 'rules' => (object) $out, 'reasons' => $this->rules->reasons()]);
    }
}
