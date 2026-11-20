<?php

namespace App\Services\Projects;

use App\Models\User;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Forecasts (docs/PROJECTS_STAGE12_SPEC.md, build 12.4). Nothing here is kept: every figure is worked out when asked.
 *   pipeline   open opportunities by the month they are expected to close, each at its stage's chance of winning (set by hand, or else the
 *              company's win rate); its value is the Books quotation's, or the estimate before there is one
 *   finish     when each open work will likely end at its pace, against its expected end
 *   billing    staged bills due by their dates (a share of the agreed value, from Books) and unbilled time, by month
 */
class ProjectForecasts
{
    public const MONTHS = 6;

    public function __construct(private ProjectAccess $access, private ProjectMeasures $measures) {}

    /** @return array<string, mixed> */
    public function pipeline(User $user, ?Carbon $now = null): array
    {
        $now ??= now();
        if (! ProjectsSetup::relationships() || ! $user->hasPermission('projects.pipeline')) {
            return ['ready' => false, 'months' => []];
        }
        $stages = DB::table('project_pipeline_stages')->where('kind', 'open')->orderBy('sort_order')->get(['id', 'name']);
        $set = ProjectKpis::ready() ? DB::table('project_pipeline_odds')->pluck('chance_pct', 'stage_id') : collect();
        $rate = app(ProjectMeasures::class)->company('win_rate', $now)['value'];
        $chance = fn (int $stage) => isset($set[$stage]) ? (float) $set[$stage] : ($rate ?? 0.0);
        $months = [];
        for ($i = 0; $i < self::MONTHS; $i++) {
            $m = $now->copy()->startOfMonth()->addMonths($i);
            $months[$m->format('Y-m')] = ['month' => $m->format('Y-m'), 'label' => $m->format('M Y'), 'quoted' => 0.0, 'estimated' => 0.0, 'weighted' => 0.0, 'count' => 0];
        }
        $last = $now->copy()->startOfMonth()->addMonths(self::MONTHS)->toDateString();
        $q = DB::table('project_opportunities')->whereNull('deleted_at')->whereNull('closed_at')->whereIn('stage_id', $stages->pluck('id')->all() ?: [0])->whereNotNull('expected_on')->where('expected_on', '<', $last);
        if (! $user->hasPermission('projects.leads.view')) {
            $q->where('owner_id', $user->id);   // as the pipeline board shows them (Stage 3)
        }
        $opps = $q->get(['id', 'stage_id', 'expected_on', 'estimate', 'quotation_voucher_id']);
        $quotes = $opps->pluck('quotation_voucher_id')->filter()->all() && Schema::hasTable('vouchers')
            ? DB::table('vouchers')->whereIn('id', $opps->pluck('quotation_voucher_id')->filter()->all())->where('status', '!=', 'cancelled')->get(['id', Schema::hasColumn('vouchers', 'base_total') ? DB::raw('COALESCE(base_total, total_amount) as amount') : 'total_amount as amount'])->pluck('amount', 'id')
            : collect();
        $late = 0;
        foreach ($opps as $o) {
            $key = max($now->format('Y-m'), substr((string) $o->expected_on, 0, 7));   // expected in the past still counts this month
            $late += substr((string) $o->expected_on, 0, 7) < $now->format('Y-m') ? 1 : 0;
            $quoted = $o->quotation_voucher_id && isset($quotes[$o->quotation_voucher_id]);
            $value = $quoted ? (float) $quotes[$o->quotation_voucher_id] : (float) $o->estimate;
            $months[$key][$quoted ? 'quoted' : 'estimated'] += $value;
            $months[$key]['weighted'] += $value * $chance((int) $o->stage_id) / 100;
            $months[$key]['count']++;
        }

        return ['ready' => true, 'months' => array_values(array_map(fn ($m) => array_merge($m, ['quoted' => round($m['quoted'], 2), 'estimated' => round($m['estimated'], 2), 'weighted' => round($m['weighted'], 2)]), $months)),
            'stages' => $stages->map(fn ($s) => ['id' => (int) $s->id, 'name' => $s->name, 'chance' => round($chance((int) $s->id), 1), 'set' => isset($set[$s->id])])->all(),
            'win_rate' => $rate, 'late' => $late, 'currency' => $this->currency(), 'can' => ['odds' => $user->hasPermission('projects.kpis')]];
    }

    /** Set (or with null clear) a pipeline stage's chance of winning. */
    public function setOdds(int $stageId, ?float $pct, User $by): void
    {
        $by->hasPermission('projects.kpis') || throw new ProjectException('Setting the chance of winning needs the KPI permission.', 403);
        ProjectKpis::ready() || throw new ProjectException('Forecasts need database script 269.', 409);
        DB::table('project_pipeline_stages')->where('id', $stageId)->where('kind', 'open')->exists() || throw new ProjectException('Choose an open pipeline stage.');
        if ($pct === null) {
            DB::table('project_pipeline_odds')->where('stage_id', $stageId)->delete();
        } else {
            ($pct >= 0 && $pct <= 100) || throw new ProjectException('A chance is between 0% and 100%.');
            DB::table('project_pipeline_odds')->updateOrInsert(['stage_id' => $stageId], ['chance_pct' => round($pct, 2), 'updated_by' => $by->id, 'updated_at' => now()]);
        }
        ProjectLog::record(null, $by, 'pipeline.odds_set', 'pipeline_stage', $stageId, null, ['chance' => $pct]);
    }

    /** When the open works the person can see will likely end. @return array<int, array<string, mixed>> */
    public function finish(User $user, ?Carbon $now = null): array
    {
        $now ??= now();
        $q = $this->access->visible(DB::table('projects as p'), $user)->whereIn('p.state', ['open', 'on_hold'])->whereNull('p.deleted_at')->whereNotNull('p.due_date');
        $out = [];
        foreach ($q->orderBy('p.due_date')->limit(200)->get(['p.id', 'p.number', 'p.title', 'p.due_date', 'p.state']) as $p) {
            $f = $this->measures->finish($p, $now);
            $days = $f ? (int) Carbon::parse($p->due_date)->startOfDay()->diffInDays(Carbon::parse($f['day']), false) : null;
            $out[] = ['id' => (int) $p->id, 'number' => $p->number, 'title' => $p->title, 'due' => substr((string) $p->due_date, 0, 10), 'likely' => $f['day'] ?? null, 'days' => $days,
                'left' => $f['left'] ?? null, 'per_week' => $f['per_week'] ?? null, 'state' => $days === null ? 'none' : ($days <= 0 ? 'good' : ($days <= 14 ? 'warn' : 'bad'))];
        }
        usort($out, fn ($a, $b) => ($b['days'] ?? -9999) <=> ($a['days'] ?? -9999));

        return $out;
    }

    /** Staged bills due by month and unbilled time, for the works whose money the person may see. @return array<string, mixed> */
    public function billing(User $user, ?Carbon $now = null): array
    {
        $now ??= now();
        if (! $user->hasPermission('projects.money.view') || ! Schema::hasTable('project_billing_stages')) {
            return ['ready' => false, 'months' => []];
        }
        $months = [];
        for ($i = 0; $i < self::MONTHS; $i++) {
            $m = $now->copy()->startOfMonth()->addMonths($i);
            $months[$m->format('Y-m')] = ['month' => $m->format('Y-m'), 'label' => $m->format('M Y'), 'staged' => 0.0, 'bills' => 0];
        }
        $works = $this->access->visible(DB::table('projects as p'), $user)->whereIn('p.state', ['open', 'on_hold'])->whereNull('p.deleted_at')->get(['p.*']);
        $works = $works->filter(fn ($p) => $this->access->decide($user, 'money', $p)['allowed']);
        $last = $now->copy()->startOfMonth()->addMonths(self::MONTHS)->toDateString();
        $unbilled = 0.0;
        foreach ($works as $p) {
            $stages = DB::table('project_billing_stages')->where('project_id', $p->id)->where('kind', 'plan')->whereNull('voucher_id')->where('due_kind', 'date')->whereNotNull('due_on')->where('due_on', '<', $last)->get(['share', 'due_on']);
            if ($stages->isNotEmpty()) {
                $agreed = (float) (app(ProjectMoney::class)->for($p)['agreed']['amount'] ?? 0);
                foreach ($stages as $s) {
                    $key = max($now->format('Y-m'), substr((string) $s->due_on, 0, 7));
                    $months[$key]['staged'] += round($agreed * (float) $s->share / 100, 2);
                    $months[$key]['bills']++;
                }
            }
            $unbilled += (float) $this->measures->work('unbilled_hours', $p, $now)['value'];
        }

        return ['ready' => true, 'months' => array_values(array_map(fn ($m) => array_merge($m, ['staged' => round($m['staged'], 2)]), $months)), 'unbilled_hours' => round($unbilled, 1), 'currency' => $this->currency()];
    }

    private function currency(): ?string
    {
        return Schema::hasTable('currencies') ? DB::table('currencies')->where('is_base', 1)->value('code') : null;
    }
}
