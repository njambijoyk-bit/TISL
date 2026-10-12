<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Location;
use App\Models\Memberships\Plan;
use App\Services\Books\BooksException;
use App\Services\Courses\MembershipBenefit as CourseBenefit;
use App\Services\Memberships\MembershipBenefits;
use App\Services\Memberships\MembershipSettings;
use App\Services\Memberships\PlanService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** Memberships → plans and settings. */
class MembershipPlanController extends Controller
{
    public function __construct(private PlanService $plans, private MembershipBenefits $benefits)
    {
    }

    private function guard(callable $fn): JsonResponse
    {
        try {
            abort_unless(PlanService::installed(), 422, 'Run database script 162_memberships.sql first.');

            return $fn();
        } catch (BooksException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }
    }

    public function meta(): JsonResponse
    {
        return response()->json(['ready' => PlanService::installed(), 'units' => Plan::UNITS, 'statuses' => Plan::STATUSES, 'benefit_types' => $this->benefits->types(), 'course_modes' => CourseBenefit::MODES,
            'offering_kinds' => \App\Models\Courses\Offering::KINDS, 'locations' => Location::orderBy('name')->get(['id', 'name']), 'settings' => MembershipSettings::all(),
            'payment_methods' => \App\Models\Books\PaymentMethod::where('is_active', true)->orderBy('sort_order')->get(['id', 'name', 'kind', 'requires_reference'])]);
    }

    public function index(Request $request): JsonResponse
    {
        return response()->json(['ready' => PlanService::installed(), 'plans' => $this->plans->list($request->query('status'), $request->query('q'))]);
    }

    public function show(int $id): JsonResponse
    {
        return $this->guard(fn () => response()->json(['plan' => $this->plans->row(Plan::with('benefits')->findOrFail($id))]));
    }

    private const RULES = ['name' => 'sometimes|string|max:120', 'summary' => 'sometimes|nullable|string|max:300', 'description' => 'sometimes|nullable|string|max:20000', 'cover' => 'sometimes|nullable|string|max:255',
        'period_unit' => 'sometimes|string|max:6', 'period_count' => 'sometimes|integer', 'price' => 'sometimes|numeric', 'joining_fee' => 'sometimes|numeric', 'ledger_id' => 'sometimes|nullable|integer', 'joining_ledger_id' => 'sometimes|nullable|integer',
        'trial_days' => 'sometimes|integer', 'grace_days' => 'sometimes|integer', 'auto_renew' => 'sometimes|boolean', 'capacity' => 'sometimes|nullable|integer', 'all_branches' => 'sometimes|boolean', 'branch_ids' => 'sometimes|nullable|array',
        'branch_ids.*' => 'integer', 'sort_order' => 'sometimes|integer', 'benefits' => 'sometimes|array', 'benefits.*.type' => 'required_with:benefits|string|max:20', 'benefits.*.config' => 'nullable|array'];

    public function store(Request $request): JsonResponse
    {
        $d = $request->validate(self::RULES);

        return $this->guard(fn () => response()->json(['message' => 'Plan saved.', 'plan' => $this->plans->row($this->plans->save($d, null, $request->user()?->id))]));
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $d = $request->validate(self::RULES);

        return $this->guard(fn () => response()->json(['message' => 'Plan saved.', 'plan' => $this->plans->row($this->plans->save($d, Plan::findOrFail($id), $request->user()?->id))]));
    }

    public function benefitsUpdate(Request $request, int $id): JsonResponse
    {
        $d = $request->validate(['benefits' => 'present|array', 'benefits.*.type' => 'required|string|max:20', 'benefits.*.config' => 'nullable|array']);

        return $this->guard(fn () => response()->json(['message' => 'Benefits saved.', 'plan' => $this->plans->row($this->plans->setBenefits(Plan::findOrFail($id), $d['benefits']))]));
    }

    public function status(int $id, string $action): JsonResponse
    {
        abort_unless(in_array($action, ['publish', 'unpublish', 'archive', 'restore'], true), 404);

        return $this->guard(fn () => response()->json(['message' => 'Done.', 'plan' => $this->plans->row($this->plans->{$action}(Plan::findOrFail($id)))]));
    }

    public function destroy(int $id): JsonResponse
    {
        return $this->guard(function () use ($id) {
            $this->plans->delete(Plan::findOrFail($id));

            return response()->json(['message' => 'Plan removed.']);
        });
    }

    public function saveSettings(Request $request): JsonResponse
    {
        $d = $request->validate(['pending_hours' => 'sometimes|integer', 'renewal_lead_days' => 'sometimes|integer', 'remind_before_days' => 'sometimes|integer', 'remind_after_days' => 'sometimes|integer', 'pause_days_per_year' => 'sometimes|integer', 'allow_member_cancel' => 'sometimes|boolean']);

        return $this->guard(fn () => response()->json(['message' => 'Memberships settings saved.', 'settings' => MembershipSettings::save($d, $request->user()?->id)]));
    }
}
