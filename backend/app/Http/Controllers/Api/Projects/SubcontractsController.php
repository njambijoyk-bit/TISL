<?php

namespace App\Http\Controllers\Api\Projects;

use App\Http\Controllers\Controller;
use App\Services\Projects\ProjectAccess;
use App\Services\Projects\ProjectException;
use App\Services\Projects\ProjectSerious;
use App\Services\Projects\ProjectService;
use App\Services\Projects\ProjectSettings;
use App\Services\Projects\ProjectsSetup;
use App\Services\Projects\ProjectSubcontracts;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/** Subcontracts and claims (stage 10, build 10.3), and the site's settings in Configuration. */
class SubcontractsController extends Controller
{
    public function __construct(private ProjectSubcontracts $subs) {}

    public function index(Request $request, int $project): JsonResponse
    {
        return $this->guard(fn () => response()->json($this->subs->page($this->project($request, $project), $request->user())));
    }

    public function store(Request $request, int $project): JsonResponse
    {
        return $this->after($request, $project, fn ($p) => $this->subs->create($p, $request->all(), $request->user()), 201);
    }

    public function update(Request $request, int $project, int $sub): JsonResponse
    {
        return $this->after($request, $project, fn ($p) => $this->subs->update($p, $sub, $request->only(['title', 'scope', 'starts_on', 'ends_on', 'state', 'vendor_order_id', 'retention_pct']), $request->user()));
    }

    public function claim(Request $request, int $project, int $sub): JsonResponse
    {
        return $this->after($request, $project, fn ($p) => $this->subs->claim($p, $sub, $request->only(['claimed_pct', 'period_to', 'note']), $request->user()), 201);
    }

    public function certify(Request $request, int $project, int $claim): JsonResponse
    {
        return $this->after($request, $project, function ($p) use ($request, $claim) {
            app(ProjectAccess::class)->authorize($request->user(), 'subcontracts', $p);   // allowed first, then the serious action is asked
            $pct = (float) $request->input('certified_pct');
            $done = app(ProjectSerious::class)->gate($request, 'sub.certify', $p, ['claim' => $claim, 'pct' => round($pct, 4)], "certify subcontract claim to {$pct}% on {$p->number}");
            $this->subs->certify($p, $claim, $pct, $request->input('note'), $request->user());
            $done();
        });
    }

    public function reject(Request $request, int $project, int $claim): JsonResponse
    {
        return $this->after($request, $project, fn ($p) => $this->subs->reject($p, $claim, (string) $request->input('note'), $request->user()));
    }

    public function release(Request $request, int $project, int $sub): JsonResponse
    {
        return $this->after($request, $project, function ($p) use ($request, $sub) {
            app(ProjectAccess::class)->authorize($request->user(), 'subcontracts', $p);
            $done = app(ProjectSerious::class)->gate($request, 'sub.certify', $p, ['release' => $sub], "release subcontract retention on {$p->number}");
            $this->subs->release($p, $sub, $request->user());
            $done();
        });
    }

    public function settings(Request $request): JsonResponse
    {
        $ledgers = fn (array $natures) => Schema::hasTable('ledgers') && Schema::hasTable('ledger_groups')
            ? DB::table('ledgers as l')->join('ledger_groups as g', 'g.id', '=', 'l.group_id')->whereIn('g.nature', $natures)->where('l.is_active', 1)->orderBy('l.name')->get(['l.id', 'l.name'])
                ->map(fn ($l) => ['id' => (int) $l->id, 'name' => $l->name])->all() : [];

        return response()->json(['site' => app(ProjectSettings::class)->get('site'), 'ready' => ProjectsSetup::site(), 'cost_ledgers' => $ledgers(['expense']), 'retention_ledgers' => $ledgers(['liability']),
            'can' => ['change' => $request->user()->hasPermission('projects.config.manage')]]);
    }

    public function saveSettings(Request $request): JsonResponse
    {
        return $this->guard(function () use ($request) {
            app(ProjectSettings::class)->save('site', $request->only(array_keys(ProjectSettings::DEFAULTS['site'])), $request->user());

            return $this->settings($request);
        });
    }

    private function after(Request $request, int $project, callable $do, int $status = 200): JsonResponse
    {
        return $this->guard(function () use ($request, $project, $do, $status) {
            $p = $this->project($request, $project);
            $do($p);

            return response()->json($this->subs->page($p, $request->user()), $status);
        });
    }

    private function project(Request $request, int $id): object
    {
        return app(ProjectService::class)->findFor($request->user(), $id);
    }

    private function guard(callable $do): JsonResponse
    {
        try {
            return $do();
        } catch (ProjectException $e) {
            return response()->json(['message' => $e->getMessage()] + $e->extra, $e->status);
        }
    }
}
