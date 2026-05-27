<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Policy;
use App\Models\PolicyAcceptance;
use App\Models\PolicyChangeLog;
use App\Models\BookingSetting;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;

class PolicyController extends Controller
{
    // ── Public endpoints ──────────────────────────────────────────────────────

    /**
     * GET /policies
     * Public — returns all active policies (content included).
     * Used by frontend to render policy modals/checkboxes.
     */
    public function index(): JsonResponse
    {
        $policies = Policy::where('is_active', true)
            ->get(['id', 'key', 'title', 'content', 'disagree_consequence_text',
                   'sensitivity', 'major_version', 'minor_version', 'requires_acceptance']);

        $policies = $policies->map(fn($p) => $this->renderPolicy($p));

        return response()->json($policies);
    }

    /**
     * GET /policies/{key}
     * Public — returns a single policy by key.
     */
    public function show(string $key): JsonResponse
    {
        $policy = Policy::where('key', $key)->where('is_active', true)->firstOrFail();

        return response()->json($this->renderPolicy($policy));
    }

    /**
     * POST /policies/accept
     * Auth required — record a customer's acceptance or disagreement.
     */
    public function recordAcceptance(Request $request): JsonResponse
    {
        $data = $request->validate([
            'policy_key'      => 'required|string|exists:policies,key',
            'action_context'  => 'required|in:login,register,hamper_checkout,standard_checkout,booking_checkout,cookie_consent,website_policy',
            'response'        => 'required|in:accepted,disagreed',
            'disagree_reason' => 'nullable|string|max:1000',
        ]);

        // Fail fast — policy must exist and be active
        $policy   = Policy::where('key', $data['policy_key'])->where('is_active', true)->firstOrFail();
        $user     = $request->user();
        $customer = $user->customer;

        $acceptance = PolicyAcceptance::create([
            'policy_id'       => $policy->id,
            'policy_key'      => $data['policy_key'],
            'policy_version'  => $policy->version,
            'policy_snapshot' => $policy->content,
            'customer_id'     => $customer?->id,
            'user_id'         => $user->id,
            'customer_number' => $customer?->customer_number,
            'action_context'  => $data['action_context'],
            'response'        => $data['response'],
            'disagree_reason' => $data['disagree_reason'] ?? null,
            'ip_address'      => $request->ip(),
            'user_agent'      => $request->userAgent(),
            'was_successful'  => $data['response'] === 'accepted',
            'flagged'         => $data['response'] === 'disagreed' && $policy->sensitivity === 'critical',
            'accepted_at'     => now(),
        ]);

        // Handle critical disagree — flag account + create notification
        if ($data['response'] === 'disagreed' && $policy->sensitivity === 'critical' && $customer) {
            $customer->update([
                'policy_flagged'            => true,
                'policy_flagged_at'         => now(),
                'policy_flagged_policy_key' => $data['policy_key'],
                'policy_flagged_version'    => $policy->version,
            ]);

            \App\Models\Notification::create([
                'notifiable_type' => \App\Models\Customer::class,
                'notifiable_id'   => $customer->id,
                'type'            => 'PolicyDisagreement',
                'title'           => "Customer disagreed with {$policy->title}",
                'message'         => "{$customer->first_name} {$customer->last_name} ({$customer->customer_number}) disagreed with {$policy->title} v{$policy->version}."
                                     . ($data['disagree_reason'] ? " Reason: {$data['disagree_reason']}" : ''),
                'icon'            => 'shield-alert',
                'color'           => '#ef4444',
                'data'            => json_encode([
                    'customer_id' => $customer->id,
                    'policy_key'  => $data['policy_key'],
                    'flagged'     => true,
                ]),
                'priority' => 'high',
                'sent_at'  => now(),
            ]);
        }

        // Clear flag if customer accepts the previously-flagged policy
        if (
            $data['response'] === 'accepted'
            && $customer?->policy_flagged
            && $customer->policy_flagged_policy_key === $data['policy_key']
        ) {
            $customer->update([
                'policy_flagged'            => false,
                'policy_flagged_at'         => null,
                'policy_flagged_policy_key' => null,
                'policy_flagged_version'    => null,
            ]);
        }

        return response()->json(['message' => 'Response recorded', 'acceptance' => $acceptance]);
    }

    /**
     * GET /policies/check-reacceptance
     * Auth required — returns which of the two core policies the customer needs to re-accept.
     * Intentionally limited to terms_of_use and privacy_policy (called on login).
     */
    public function checkReacceptance(Request $request): JsonResponse
    {
        $user = $request->user();

        if (!$user->isCustomer() || !$user->customer) {
            return response()->json(['needs_reacceptance' => false, 'policies' => []]);
        }

        $customer = $user->customer;
        $needed   = [];

        foreach (['terms_of_use', 'privacy_policy'] as $key) {
            $policy = Policy::where('key', $key)->where('is_active', true)->first();
            if (!$policy) continue;

            $lastAccepted = PolicyAcceptance::where('customer_id', $customer->id)
                ->where('policy_key', $key)
                ->where('response', 'accepted')
                ->latest('accepted_at')
                ->first();

            $needsIt = !$lastAccepted
                || (int) explode('.', $lastAccepted->policy_version)[0] < $policy->major_version;

            if ($needsIt) {
                $needed[] = $this->renderPolicy($policy);
            }
        }

        return response()->json([
            'needs_reacceptance' => !empty($needed),
            'policies'           => $needed,
        ]);
    }

    // ── Admin endpoints ───────────────────────────────────────────────────────

    /**
     * GET /admin/policies
     * List all policies with stats.
     */
    public function adminIndex(): JsonResponse
    {
        $policies = Policy::withCount([
                'acceptances as total_acceptances',
                'acceptances as total_disagreements' => fn($q) => $q->where('response', 'disagreed'),
            ])
            ->with(['createdBy:id,name', 'updatedBy:id,name'])
            ->get();

        return response()->json($policies);
    }

    /**
     * GET /admin/policies/{id}
     * Single policy with recent change logs.
     */
    public function adminShow(int $id): JsonResponse
    {
        $policy = Policy::with(['changeLogs' => fn($q) => $q->orderByDesc('changed_at')->limit(50)])
            ->findOrFail($id);

        return response()->json($this->renderPolicy($policy));
    }

    /**
     * PUT /admin/policies/{id}
     * Update policy content. Handles version bumping and change log.
     */
    public function update(Request $request, int $id): JsonResponse
    {
        $policy = Policy::findOrFail($id);

        $data = $request->validate([
            'title'                     => 'sometimes|string|max:255',
            'content'                   => 'sometimes|string',
            'disagree_consequence_text' => 'sometimes|nullable|string',
            'sensitivity'               => 'sometimes|in:critical,standard,soft',
            'requires_acceptance'       => 'sometimes|boolean',
            'is_active'                 => 'sometimes|boolean',
            'is_major_bump'             => 'sometimes|boolean',
            'major_bump_note'           => 'required_if:is_major_bump,true|nullable|string',
        ]);

        $contentChanged  = isset($data['content']) && $data['content'] !== $policy->content;
        $isMajorBump     = ($data['is_major_bump'] ?? false) && $contentChanged;
        $previousVersion = $policy->version;
        $previousContent = $policy->content;

        DB::beginTransaction();
        try {
            $user = Auth::user();

            if ($contentChanged) {
                if ($isMajorBump) {
                    $policy->major_version += 1;
                    $policy->minor_version  = 0;
                } else {
                    $policy->minor_version += 1;
                }
            }

            // Use isset checks instead of array_filter so nullable fields
            // (e.g. disagree_consequence_text) can be intentionally cleared to null.
            if (isset($data['title']))                     $policy->title                     = $data['title'];
            if (isset($data['content']))                   $policy->content                   = $data['content'];
            if (array_key_exists('disagree_consequence_text', $data)) $policy->disagree_consequence_text = $data['disagree_consequence_text'];
            if (isset($data['sensitivity']))               $policy->sensitivity               = $data['sensitivity'];
            if (isset($data['requires_acceptance']))       $policy->requires_acceptance       = $data['requires_acceptance'];
            if (isset($data['is_active']))                 $policy->is_active                 = $data['is_active'];
            $policy->updated_by = $user->id;

            $policy->save();

            if ($contentChanged) {
                PolicyChangeLog::create([
                    'policy_id'        => $policy->id,
                    'policy_key'       => $policy->key,
                    'changed_by'       => $user->id,
                    'changed_by_name'  => $user->name,
                    'previous_version' => $previousVersion,
                    'new_version'      => $policy->version,
                    'is_major_bump'    => $isMajorBump,
                    'major_bump_note'  => $isMajorBump ? $data['major_bump_note'] : null,
                    'previous_content' => $previousContent,
                    'new_content'      => $policy->content,
                    'changed_at'       => now(),
                ]);
            }

            DB::commit();

            return response()->json([
                'message' => 'Policy updated successfully',
                'policy'  => $this->renderPolicy($policy->fresh()),
            ]);

        } catch (\Exception $e) {
            DB::rollBack();
            return response()->json(['message' => 'Failed to update policy', 'error' => $e->getMessage()], 500);
        }
    }

    /**
     * GET /admin/policies/{id}/acceptances
     * Paginated list of acceptances for a policy.
     */
    public function acceptances(Request $request, int $id): JsonResponse
    {
        Policy::findOrFail($id);

        $acceptances = PolicyAcceptance::where('policy_id', $id)
            ->when($request->filled('response'),       fn($q) => $q->where('response', $request->response))
            ->when($request->filled('action_context'), fn($q) => $q->where('action_context', $request->action_context))
            ->when($request->filled('flagged'),        fn($q) => $q->where('flagged', $request->boolean('flagged')))
            ->with(['customer:id,first_name,last_name,customer_number,email'])
            ->orderByDesc('accepted_at')
            ->paginate($request->integer('per_page', 50));

        return response()->json($acceptances);
    }

    /**
     * GET /admin/policies/{id}/change-logs
     * Change history for a policy.
     */
    public function changeLogs(int $id): JsonResponse
    {
        Policy::findOrFail($id);

        $logs = PolicyChangeLog::where('policy_id', $id)
            ->orderByDesc('changed_at')
            ->get();

        return response()->json($logs);
    }

    /**
     * GET /admin/policies/reports
     * Aggregate stats across all policies.
     */
    public function reports(Request $request): JsonResponse
    {
        $acceptancesOverTime = PolicyAcceptance::selectRaw(
                'DATE(accepted_at) as date, policy_key, response, COUNT(*) as count'
            )
            ->where('accepted_at', '>=', now()->subDays(30))
            ->groupBy('date', 'policy_key', 'response')
            ->orderBy('date')
            ->get();

        $disagreements = PolicyAcceptance::where('response', 'disagreed')
            ->selectRaw('policy_key, COUNT(*) as total')
            ->groupBy('policy_key')
            ->get();

        $flagged = \App\Models\Customer::where('policy_flagged', true)
            ->select('id', 'first_name', 'last_name', 'customer_number', 'email',
                     'policy_flagged_policy_key', 'policy_flagged_version', 'policy_flagged_at')
            ->orderByDesc('policy_flagged_at')
            ->get();

        $outdated = [];
        foreach (['terms_of_use', 'privacy_policy'] as $key) {
            $policy = Policy::where('key', $key)->where('is_active', true)->first();
            if (!$policy) continue;

            $outdatedCount = DB::select("
                SELECT COUNT(DISTINCT pa.customer_id) as count
                FROM policy_acceptances pa
                INNER JOIN (
                    SELECT customer_id, MAX(accepted_at) as latest
                    FROM policy_acceptances
                    WHERE policy_key = ? AND response = 'accepted'
                    GROUP BY customer_id
                ) latest_pa ON pa.customer_id = latest_pa.customer_id
                    AND pa.accepted_at = latest_pa.latest
                    AND pa.policy_key = ?
                WHERE CAST(SUBSTRING_INDEX(pa.policy_version, '.', 1) AS UNSIGNED) < ?
            ", [$key, $key, $policy->major_version]);

            $outdated[] = [
                'policy_key'      => $key,
                'current_version' => $policy->version,
                'outdated_count'  => $outdatedCount[0]->count ?? 0,
            ];
        }

        return response()->json([
            'acceptances_over_time' => $acceptancesOverTime,
            'disagreements'         => $disagreements,
            'flagged_customers'     => $flagged,
            'outdated_acceptances'  => $outdated,
            'totals'                => [
                'total_acceptances'   => PolicyAcceptance::where('response', 'accepted')->count(),
                'total_disagreements' => PolicyAcceptance::where('response', 'disagreed')->count(),
                'flagged_customers'   => \App\Models\Customer::where('policy_flagged', true)->count(),
            ],
        ]);
    }

    // ── Private helpers ───────────────────────────────────────────────────────

    /**
     * Render {{placeholders}} in the booking cancellation policy
     * using live values from booking_settings.
     */
    private function renderPolicy(Policy $policy): Policy
    {
        if ($policy->key !== 'booking_cancellation_policy') return $policy;

        $settings   = BookingSetting::instance();
        $feeDisplay = $settings->cancellation_fee_type === 'percent'
            ? "{$settings->cancellation_fee}%"
            : "{$settings->cancellation_currency_code} {$settings->cancellation_fee}";

        $policy->content = str_replace(
            ['{{cancellation_fee}}', '{{cancellation_fee_type}}', '{{cancellation_window_hours}}'],
            [$feeDisplay, $settings->cancellation_fee_type, $settings->cancellation_window_hours],
            $policy->content
        );

        return $policy;
    }
}