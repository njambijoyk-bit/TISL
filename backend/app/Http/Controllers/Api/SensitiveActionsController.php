<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Services\Security\RiskSignals;
use App\Services\Security\SecurityLog;
use App\Services\Security\SecuritySettings;
use App\Services\Security\Sessions;
use App\Services\Security\StepUp\Catalogue;
use App\Services\Security\StepUp\StepUp;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

/**
 * Admin → Security → "Sensitive actions": for each action in the catalogue (change the payment keys, run payroll, ...), whether the person is asked for one more step (off / test / on),
 * how often it would have been asked in the last 7 days, and the same three-way switch for the unusual-sign-in check. Seeing it needs security.view; changing it needs security.manage (the owner's).
 * Switching a rule on can never be a switch the person changing it could not get through themselves.
 */
class SensitiveActionsController extends Controller
{
    private const DAYS = 7;

    private const MODES = ['off', 'log', 'enforce'];

    public function __construct(private StepUp $stepUp, private SecuritySettings $settings, private RiskSignals $risk)
    {
    }

    private function ready(): bool
    {
        return SecuritySettings::ready() && StepUp::ready();
    }

    /** GET /admin/security-policy/actions */
    public function show(Request $request): JsonResponse
    {
        return response()->json($this->payload($request->user()));
    }

    /** @return array<string, mixed> */
    private function payload(User $actor): array
    {
        $ready = $this->ready();
        $stats = $ready ? $this->ruleStats() : [];

        return [
            'ready' => $ready,
            'message' => $ready ? null : 'The extra step is not set up yet: run database scripts 125 and 128 in Workbench.',
            'kill_switch' => (bool) config('security.policy.kill_switch'),
            'days' => self::DAYS,
            'rules' => collect(Catalogue::RULES)->map(fn (array $r, string $key) => [
                'key' => $key, 'label' => $r['label'], 'class' => $r['class'], 'strength' => $r['strength'], 'reason' => $r['reason'], 'window' => $r['window'], 'fresh' => $r['fresh'], 'two' => $r['two'],
                'mode' => $this->chosen("stepup.{$key}.mode"), 'in_force' => $this->stepUp->mode($key),
                'you_could_answer' => $this->stepUp->couldAnswer($actor, $key),
                'stats' => $stats[$key] ?? ['asked' => 0, 'approved' => 0, 'failed' => 0, 'would_ask' => 0],
            ])->values()->all(),
            'risk' => [
                'ready' => Sessions::tracked(),
                'mode' => $this->chosen('risk.mode'), 'in_force' => $this->risk->mode(),
                'notice_at' => (int) config('security.risk.notice_at', 1), 'stronger_at' => (int) config('security.risk.stronger_at', 2),
                'signals' => collect(RiskSignals::WEIGHTS)->map(fn ($w, $k) => ['key' => $k, 'weight' => $w])->values()->all(),
                'stats' => $this->riskStats(),
            ],
        ];
    }

    private function chosen(string $key): string
    {
        $mode = (string) $this->settings->get($key, 'off');

        return in_array($mode, self::MODES, true) ? $mode : 'off';
    }

    /** @return array<string, array{asked: int, approved: int, failed: int, would_ask: int}> */
    private function ruleStats(): array
    {
        $out = [];
        if (! SecurityLog::ready()) {
            return $out;
        }
        $count = ['stepup_asked' => 'asked', 'stepup_approved' => 'approved', 'stepup_failed' => 'failed', 'stepup_would_ask' => 'would_ask'];
        foreach ($this->recent(array_keys($count)) as $row) {
            $rule = (string) ($row['detail']['rule'] ?? '');
            if (Catalogue::has($rule)) {
                $out[$rule] ??= ['asked' => 0, 'approved' => 0, 'failed' => 0, 'would_ask' => 0];
                $out[$rule][$count[$row['event']]]++;
            }
        }

        return $out;
    }

    /** @return array{sign_ins: int, would_ask: int, told: int, held: int, by_signal: array<string, int>} */
    private function riskStats(): array
    {
        $out = ['sign_ins' => 0, 'would_ask' => 0, 'told' => 0, 'held' => 0, 'by_signal' => []];
        if (! SecurityLog::ready()) {
            return $out;
        }
        $key = ['risk_would_ask' => 'would_ask', 'risk_notice' => 'told', 'risk_stronger' => 'held'];
        foreach ($this->recent(['sign_in', ...array_keys($key)]) as $row) {
            if ($row['event'] === 'sign_in') {
                $out['sign_ins']++;

                continue;
            }
            $out[$key[$row['event']]]++;
            foreach ((array) ($row['detail']['signals'] ?? []) as $signal) {
                $out['by_signal'][(string) $signal] = ($out['by_signal'][(string) $signal] ?? 0) + 1;
            }
        }
        arsort($out['by_signal']);

        return $out;
    }

    /** @param string[] $events @return array<int, array{event: string, detail: array<string, mixed>}> */
    private function recent(array $events): array
    {
        return DB::table('security_events')->whereIn('event', $events)->where('created_at', '>=', now()->subDays(self::DAYS))->limit(50000)->get(['event', 'detail'])
            ->map(fn ($r) => ['event' => $r->event, 'detail' => (array) json_decode((string) $r->detail, true)])->all();
    }

    /** PUT /admin/security-policy/actions {rules: {rule: off|log|enforce}, risk_mode} */
    public function update(Request $request): JsonResponse
    {
        if (! $this->ready()) {
            return response()->json(['message' => 'The extra step is not set up yet: run database scripts 125 and 128 in Workbench.'], 409);
        }
        $data = $request->validate([
            'rules' => 'sometimes|array', 'rules.*' => ['string', Rule::in(self::MODES)],
            'risk_mode' => ['sometimes', 'string', Rule::in(self::MODES)],
        ]);
        foreach (array_keys((array) ($data['rules'] ?? [])) as $rule) {
            if (! Catalogue::has((string) $rule)) {
                return response()->json(['message' => "There is no sensitive action called {$rule}.", 'errors' => ['rules' => ["Unknown action {$rule}."]]], 422);
            }
        }
        if (! isset($data['rules']) && ! isset($data['risk_mode'])) {
            return response()->json(['message' => 'Nothing to change.', 'errors' => ['rules' => ['Choose at least one.']]], 422);
        }

        /** @var User $actor */
        $actor = $request->user();
        $changes = [];
        foreach ((array) ($data['rules'] ?? []) as $rule => $mode) {
            $from = $this->chosen("stepup.{$rule}.mode");
            if ($from !== $mode) {
                // never a switch the person changing it could not get through themselves
                if ($mode === 'enforce' && ! $this->stepUp->couldAnswer($actor, (string) $rule)) {
                    return response()->json(['message' => 'You could not answer this question yourself yet: '.Catalogue::rule((string) $rule)['label'].'. Add a passkey (and wait out the first day for serious actions) first, then turn it on.',
                        'reason' => 'you_could_not_answer', 'rule' => $rule], 422);
                }
                $changes["stepup.{$rule}.mode"] = [$from, $mode];
            }
        }
        if (isset($data['risk_mode']) && $this->chosen('risk.mode') !== $data['risk_mode']) {
            $changes['risk.mode'] = [$this->chosen('risk.mode'), $data['risk_mode']];
        }

        DB::transaction(function () use ($changes, $actor) {
            foreach ($changes as $key => [, $to]) {
                $this->settings->set($key, $to, $actor->id);
            }
        });
        if ($changes) {
            SecurityLog::record('stepup_rules_changed', $actor, $request, ['changes' => collect($changes)->map(fn ($c) => ['from' => $c[0], 'to' => $c[1]])->all()], SecurityLog::WARNING);
        }

        return response()->json(['message' => $changes ? 'Saved.' : 'Nothing was different, so nothing was saved.'] + $this->payload($actor));
    }
}
