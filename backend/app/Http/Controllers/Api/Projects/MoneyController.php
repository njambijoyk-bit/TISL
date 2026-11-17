<?php

namespace App\Http\Controllers\Api\Projects;

use App\Http\Controllers\Controller;
use App\Services\Projects\ProjectException;
use App\Services\Projects\ProjectSettings;
use App\Services\Projects\ProjectsSetup;
use App\Services\Projects\VoucherProjects;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/** Money through Books (stage 4): the project picker on vouchers and the money settings. Later builds add the Money tab and the rest. */
class MoneyController extends Controller
{
    /** For the Books voucher form: the rule for this kind of voucher, and the projects this person may post to. */
    public function picker(Request $request): JsonResponse
    {
        $base = $request->query('base_type');
        if (! $base && $request->filled('voucher_type_id') && Schema::hasTable('voucher_types')) {
            $base = DB::table('voucher_types')->where('id', (int) $request->query('voucher_type_id'))->value('base_type');
        }
        $vp = app(VoucherProjects::class);
        $current = $vp->projectOf($request->integer('cost_centre_id') ?: null);

        return response()->json($vp->picker($request->user(), $base, $current['project_id'] ?? null) + ['current' => $current]);
    }

    /** The Money tab: every figure read from the books. */
    public function tab(Request $request, int $project): JsonResponse
    {
        try {
            $p = app(\App\Services\Projects\ProjectService::class)->findFor($request->user(), $project, 'money');
        } catch (ProjectException $e) {
            return response()->json(['message' => $e->getMessage()] + $e->extra, $e->status);
        }

        return response()->json(['money' => app(\App\Services\Projects\ProjectMoney::class)->for($p),
            'can' => ['budget' => $request->user()->hasPermission('projects.money.budget') && $request->user()->hasPermission('books.view')]]);
    }

    /** Ledgers made in Books from this project, and where a new one can go. */
    public function ledgers(Request $request, int $project): JsonResponse
    {
        try {
            $p = app(\App\Services\Projects\ProjectService::class)->findFor($request->user(), $project, 'money');
        } catch (ProjectException $e) {
            return response()->json(['message' => $e->getMessage()] + $e->extra, $e->status);
        }

        return $this->ledgerList($request, $p);
    }

    public function makeLedger(Request $request, int $project): JsonResponse
    {
        try {
            $p = app(\App\Services\Projects\ProjectService::class)->findFor($request->user(), $project, 'money');
            // bank or payee details on a new ledger are the same sensitive action as on Books' own ledger screen
            $bankFields = collect(['bank_name', 'account_number', 'account_name'])->contains(fn ($k) => trim((string) $request->input($k, '')) !== '');
            if ($held = \App\Http\Middleware\Assurance::check($request, 'bank_details', fn () => $bankFields)) {
                return $held;
            }
            app(\App\Services\Projects\ProjectLedgers::class)->make($p, $request->all(), $request->user());
        } catch (ProjectException $e) {
            return response()->json(['message' => $e->getMessage()] + $e->extra, $e->status);
        }

        return $this->ledgerList($request, $p, 201);
    }

    private function ledgerList(Request $request, object $p, int $status = 200): JsonResponse
    {
        $user = $request->user();
        $l = app(\App\Services\Projects\ProjectLedgers::class);

        return response()->json(['ledgers' => $l->of($p), 'groups' => $l->groups(), 'purposes' => \App\Services\Projects\ProjectLedgers::PURPOSES,
            'can' => ['make' => $user->hasPermission('projects.ledgers.create'), 'bank' => $user->hasPermission('projects.ledgers.create') && $user->hasPermission('projects.ledgers.bank')]], $status);
    }

    public function settings(Request $request): JsonResponse
    {
        return response()->json([
            'money' => app(ProjectSettings::class)->get('money'),
            'voucher_types' => array_map(fn ($k, $label) => ['key' => $k, 'label' => $label], array_keys(VoucherProjects::LABELS), VoucherProjects::LABELS),
            'ready' => ProjectsSetup::money(),
            'can' => ['change' => $request->user()->hasPermission('projects.config.manage')],
        ]);
    }

    public function saveSettings(Request $request): JsonResponse
    {
        try {
            app(ProjectSettings::class)->save('money', $request->only(['bill_mode', 'retention_mode', 'retention_ledger_id', 'voucher_project']), $request->user());
        } catch (ProjectException $e) {
            return response()->json(['message' => $e->getMessage()], $e->status);
        }

        return $this->settings($request);
    }
}
