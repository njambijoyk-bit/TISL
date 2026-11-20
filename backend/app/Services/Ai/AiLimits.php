<?php

namespace App\Services\Ai;

use App\Models\User;
use App\Services\Notify\Notifier;
use App\Services\Notify\Staff;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Usage and monthly limits per purpose (docs/AI_PURPOSES_SPEC.md, build A.3). Everything is read from ai_calls: the calls that answered count
 * towards a purpose's month, in tokens or in estimated cost (the rough rates: an estimate, not a bill). A limit is optional and off unless set.
 * At 80% the AI admins (whoever holds ai.keys) are told once that month; at 100% the purpose stops using the AI until next month or until the
 * limit is raised, and the feature falls back as it does when it has no AI.
 */
class AiLimits
{
    public const UNITS = ['tokens', 'cost'];

    /** Why this purpose may not use the AI now, or null. */
    public function stopped(string $purpose, ?Carbon $now = null): ?string
    {
        $s = $this->setting($purpose);
        if (! $s || $s->monthly_limit === null) {
            return null;
        }
        $used = $this->used($purpose, $s->limit_unit, $now);
        if ($used < (float) $s->monthly_limit) {
            return null;
        }
        $name = AiGateway::PURPOSES[$purpose][0] ?? $purpose;

        return "{$name} has used its monthly AI limit of {$this->amount((float) $s->monthly_limit, $s->limit_unit)}. It starts again on " . ($now ?? now())->copy()->startOfMonth()->addMonth()->format('j M') . ', or the limit can be raised on AI → Keys.';
    }

    /** After a call that answered: tell the AI admins once a month when a purpose passes 80% of its limit. */
    public function check(string $purpose, ?Carbon $now = null): void
    {
        $now ??= now();
        $s = $this->setting($purpose);
        if (! $s || $s->monthly_limit === null || $s->warned_month === $now->format('Y-m')) {
            return;
        }
        $used = $this->used($purpose, $s->limit_unit, $now);
        if ($used < 0.8 * (float) $s->monthly_limit) {
            return;
        }
        DB::table('ai_purpose_settings')->where('id', $s->id)->update(['warned_month' => $now->format('Y-m'), 'updated_at' => now()]);
        $name = AiGateway::PURPOSES[$purpose][0] ?? $purpose;
        $pct = (int) floor($used / (float) $s->monthly_limit * 100);
        foreach (app(Staff::class)->holding('ai.keys') as $admin) {
            try {
                app(Notifier::class)->send($admin, 'ai_limit', "{$name} has used {$pct}% of its AI limit",
                    "{$name} has used {$this->amount($used, $s->limit_unit)} of its {$this->amount((float) $s->monthly_limit, $s->limit_unit)} this month. At 100% it stops using the AI until next month.",
                    ['action_url' => '/admin/ai-analytics/keys', 'action_text' => 'Open AI keys']);
            } catch (\Throwable $e) {
                report($e);
            }
        }
    }

    /** Set (or with null clear) a purpose's monthly limit. */
    public function save(string $purpose, ?float $limit, string $unit, User $by): void
    {
        AiGateway::ready() || throw ValidationException::withMessages(['limit' => 'Run database script 270_ai_purposes.sql first.']);
        isset(app(AiGateway::class)->purposes()[$purpose]) || throw ValidationException::withMessages(['purpose' => 'That purpose is not available.']);
        in_array($unit, self::UNITS, true) || throw ValidationException::withMessages(['limit_unit' => 'A limit is in tokens or in estimated cost.']);
        if ($limit !== null && ($limit <= 0 || $limit > 1e12)) {
            throw ValidationException::withMessages(['monthly_limit' => 'A limit is more than 0. Leave it empty for no limit.']);
        }
        $current = $this->setting($purpose);
        $warned = $current && $current->monthly_limit !== null && (float) $current->monthly_limit === $limit && $current->limit_unit === $unit ? $current->warned_month : null;   // a changed limit may warn again
        DB::table('ai_purpose_settings')->updateOrInsert(['purpose' => $purpose], ['monthly_limit' => $limit, 'limit_unit' => $unit, 'warned_month' => $warned, 'updated_by' => $by->id, 'updated_at' => now(), 'created_at' => $current->created_at ?? now()]);
    }

    /** This month for each purpose that shows, and for each key; the last six months per purpose. @return array<string, mixed> */
    public function usage(?Carbon $now = null): array
    {
        $now ??= now();
        if (! AiGateway::ready()) {
            return ['ready' => false];
        }
        $from = $now->copy()->startOfMonth();
        $sum = fn ($q) => $q->selectRaw("COUNT(CASE WHEN outcome = 'ok' THEN 1 END) as calls, COUNT(CASE WHEN outcome = 'failed' THEN 1 END) as failed, COUNT(CASE WHEN outcome = 'refused' THEN 1 END) as refused,
            COUNT(CASE WHEN outcome = 'ok' AND position > 1 THEN 1 END) as fell_back, COALESCE(SUM(CASE WHEN outcome = 'ok' THEN prompt_tokens + completion_tokens END), 0) as tokens,
            COALESCE(SUM(CASE WHEN outcome = 'ok' THEN cost_estimate END), 0) as cost, COALESCE(AVG(CASE WHEN outcome = 'ok' THEN ms END), 0) as ms");
        $purposes = [];
        foreach (app(AiGateway::class)->purposes() as $key => $p) {
            $r = $sum(DB::table('ai_calls')->where('purpose', $key)->where('created_at', '>=', $from))->first();
            $s = $this->setting($key);
            $limit = $s && $s->monthly_limit !== null ? (float) $s->monthly_limit : null;
            $unit = $s->limit_unit ?? 'tokens';
            $used = $unit === 'cost' ? (float) $r->cost : (float) $r->tokens;
            $purposes[] = ['key' => $key, 'name' => $p['name'], 'calls' => (int) $r->calls, 'failed' => (int) $r->failed, 'refused' => (int) $r->refused, 'fell_back' => (int) $r->fell_back,
                'tokens' => (int) $r->tokens, 'cost' => round((float) $r->cost, 4), 'ms' => (int) $r->ms,
                'limit' => $limit, 'limit_unit' => $unit, 'used_pct' => $limit ? round($used / $limit * 100, 1) : null, 'stopped' => $limit !== null && $used >= $limit];
        }
        $keys = DB::table('ai_calls as c')->join('ai_provider_keys as k', 'k.id', '=', 'c.key_id')->where('c.created_at', '>=', $from)->groupBy('c.key_id', 'k.label', 'k.provider')
            ->select('c.key_id', 'k.label', 'k.provider');
        $keys = $sum($keys)->orderByDesc('tokens')->get()->map(fn ($r) => ['key_id' => (int) $r->key_id, 'label' => $r->label, 'provider' => $r->provider, 'calls' => (int) $r->calls, 'failed' => (int) $r->failed,
            'tokens' => (int) $r->tokens, 'cost' => round((float) $r->cost, 4), 'ms' => (int) $r->ms,
            'purposes' => DB::table('ai_calls')->where('key_id', $r->key_id)->where('created_at', '>=', $from)->where('outcome', 'ok')->distinct()->orderBy('purpose')->pluck('purpose')->all()])->all();
        $months = [];
        for ($i = 5; $i >= 0; $i--) {
            $m = $now->copy()->startOfMonth()->subMonths($i);
            $months[] = ['month' => $m->format('Y-m'), 'label' => $m->format('M Y'),
                'by_purpose' => DB::table('ai_calls')->where('outcome', 'ok')->whereBetween('created_at', [$m, $m->copy()->endOfMonth()])->groupBy('purpose')
                    ->selectRaw('purpose, COUNT(*) as calls, COALESCE(SUM(prompt_tokens + completion_tokens), 0) as tokens, COALESCE(SUM(cost_estimate), 0) as cost')->get()
                    ->mapWithKeys(fn ($r) => [$r->purpose => ['calls' => (int) $r->calls, 'tokens' => (int) $r->tokens, 'cost' => round((float) $r->cost, 4)]])->all()];
        }

        return ['ready' => true, 'month' => $from->format('F Y'), 'purposes' => $purposes, 'keys' => $keys, 'months' => $months];
    }

    /** What a purpose has used this month, in its limit's unit. */
    public function used(string $purpose, string $unit, ?Carbon $now = null): float
    {
        $q = DB::table('ai_calls')->where('purpose', $purpose)->where('outcome', 'ok')->where('created_at', '>=', ($now ?? now())->copy()->startOfMonth());

        return (float) ($unit === 'cost' ? $q->sum('cost_estimate') : $q->sum(DB::raw('prompt_tokens + completion_tokens')));
    }

    private function setting(string $purpose): ?object
    {
        return AiGateway::ready() ? DB::table('ai_purpose_settings')->where('purpose', $purpose)->first() : null;
    }

    private function amount(float $n, string $unit): string
    {
        return $unit === 'cost' ? '$' . number_format($n, $n < 1 ? 4 : 2) . ' (estimated)' : number_format($n) . ' tokens';
    }
}
