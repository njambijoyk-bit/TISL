<?php

namespace App\Services\Vault;

use App\Models\User;
use App\Models\VaultFolder;
use App\Models\VaultDocument;
use App\Models\VaultPolicy;
use App\Models\VaultPolicyCondition;
use App\Models\VaultPolicyAssignment;
use App\Models\VaultUnlockSession;
use App\Models\VaultSetting;
use App\Models\VaultAccessLog;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Request;

class VaultPolicyService
{
    // =========================================================================
    // MAIN GATE — call this before every vault action
    // =========================================================================

    /**
     * Evaluate whether a user can perform an action on a target.
     *
     * @param  User         $user
     * @param  string       $action   — view|preview|download|upload|move|copy|delete|lock|unlock|export|compress|archive
     * @param  string       $targetType — 'folder'|'document'
     * @param  VaultFolder|VaultDocument $target
     * @return bool
     */
    public function can(User $user, string $action, string $targetType, $target): bool
    {
        // 1. Global vault settings gate (time, day, IP)
        if (!$this->passesGlobalGate($user)) {
            $this->log($user, 'policy_denied', $targetType, $target->id, [
                'reason' => 'global_gate',
                'action' => $action,
            ]);
            return false;
        }

        // 2. Super admin bypasses everything except global IP if enforce_ip_globally = true
        if ($user->role === 'super_admin') {
            $settings = VaultSetting::current();
            if ($settings->enforce_ip_globally) {
                if (!$settings->isAllowedIp(Request::ip())) {
                    $this->log($user, 'policy_denied', $targetType, $target->id, [
                        'reason' => 'ip_blocked_super_admin',
                        'action' => $action,
                    ]);
                    return false;
                }
            }
            return true;
        }

        // 3. Build context
        $context = $this->buildContext($user, $targetType, $target);

        // 4. Collect applicable policies (target-specific + ancestors + vault-wide)
        $policies = $this->collectPolicies($targetType, $target);

        // 5. Evaluate — explicit deny wins, then explicit allow, then default deny
        $result = $this->evaluate($user, $policies, $context);

        // 6. Log denial
        if (!$result) {
            $this->log($user, 'policy_denied', $targetType, $target->id, [
                'reason' => 'policy_evaluation',
                'action' => $action,
            ]);
        }

        return $result;
    }

    // =========================================================================
    // GLOBAL GATE — vault_settings time / day / IP
    // =========================================================================

    public function passesGlobalGate(User $user): bool
    {
        $settings = VaultSetting::current();

        if (!$settings->isWithinAllowedTime()) return false;
        if (!$settings->isAllowedDay())        return false;
        if (!$settings->isAllowedIp(Request::ip())) return false;

        return true;
    }

    // =========================================================================
    // LOCK / UNLOCK — password-protected folders and documents
    // =========================================================================

    /**
     * Attempt to unlock a password-protected target for this user session.
     */
    public function unlock(User $user, string $targetType, int $targetId, string $password): bool
    {
        $target = $targetType === 'folder'
            ? VaultFolder::findOrFail($targetId)
            : VaultDocument::findOrFail($targetId);

        if (!$target->is_locked || !$target->password_hash) return true;

        if (!Hash::check($password, $target->password_hash)) {
            $this->log($user, 'unlock', $targetType, $targetId, [
                'success' => false,
            ]);
            return false;
        }

        $settings = VaultSetting::current();

        VaultUnlockSession::create([
            'user_id'     => $user->id,
            'target_type' => $targetType,
            'target_id'   => $targetId,
            'unlocked_at' => now(),
            'expires_at'  => now()->addMinutes($settings->unlock_session_ttl_minutes),
            'ip_address'  => Request::ip(),
        ]);

        $this->log($user, 'unlock', $targetType, $targetId, ['success' => true]);

        return true;
    }

    /**
     * Check if user has an active unlock session for this target.
     */
    public function isUnlocked(User $user, string $targetType, int $targetId): bool
    {
        return VaultUnlockSession::where('user_id', $user->id)
            ->where('target_type', $targetType)
            ->where('target_id', $targetId)
            ->where('expires_at', '>', now())
            ->exists();
    }

    /**
     * Check if target is accessible — not locked, or has active unlock session.
     */
    public function isAccessible(User $user, string $targetType, $target): bool
    {
        if (!$target->is_locked) return true;
        return $this->isUnlocked($user, $targetType, $target->id);
    }

    /**
     * Check if folder is accessible including parent lock cascade.
     */
    public function isFolderAccessible(User $user, VaultFolder $folder): bool
    {
        // Check self
        if (!$this->isAccessible($user, 'folder', $folder)) return false;

        // Check ancestors — if any ancestor is locked and not unlocked, deny
        foreach ($folder->ancestors() as $ancestor) {
            if (!$this->isAccessible($user, 'folder', $ancestor)) return false;
        }

        return true;
    }

    /**
     * Set password on a folder or document.
     */
    public function setPassword(User $user, string $targetType, int $targetId, string $password): void
    {
        $target = $targetType === 'folder'
            ? VaultFolder::findOrFail($targetId)
            : VaultDocument::findOrFail($targetId);

        $target->update([
            'password_hash' => Hash::make($password),
            'is_locked'     => true,
        ]);

        $this->log($user, 'lock', $targetType, $targetId);
    }

    /**
     * Remove password from a folder or document.
     */
    public function removePassword(User $user, string $targetType, int $targetId): void
    {
        $target = $targetType === 'folder'
            ? VaultFolder::findOrFail($targetId)
            : VaultDocument::findOrFail($targetId);

        $target->update([
            'password_hash' => null,
            'is_locked'     => false,
        ]);

        $this->log($user, 'lock', $targetType, $targetId, ['action' => 'password_removed']);
    }

    /**
     * Purge expired unlock sessions.
     */
    public function purgeExpiredSessions(): int
    {
        return VaultUnlockSession::where('expires_at', '<', now())->delete();
    }

    // =========================================================================
    // SENSITIVITY CHECK
    // =========================================================================

    /**
     * Check if target meets the sensitive threshold requiring extra auth.
     */
    public function requiresExtraAuth($target): bool
    {
        $settings = VaultSetting::current();
        if (!$settings->require_2fa_for_sensitive) return false;

        $order = ['public', 'internal', 'confidential', 'restricted', 'top_secret'];
        $threshold = array_search($settings->sensitive_threshold, $order);
        $level     = array_search($target->sensitivity_level, $order);

        return $level >= $threshold;
    }

    // =========================================================================
    // POLICY CRUD
    // =========================================================================

    public function createPolicy(User $creator, array $data): VaultPolicy
    {
        $policy = VaultPolicy::create([
            'name'        => $data['name'],
            'description' => $data['description'] ?? null,
            'target_type' => $data['target_type'],
            'target_id'   => $data['target_id'] ?? null,
            'effect'      => $data['effect'],
            'priority'    => $data['priority'] ?? 0,
            'is_active'   => $data['is_active'] ?? true,
            'created_by'  => $creator->id,
        ]);

        foreach ($data['conditions'] ?? [] as $condition) {
            $policy->conditions()->create([
                'attribute_source' => $condition['attribute_source'],
                'attribute_key'    => $condition['attribute_key'],
                'operator'         => $condition['operator'],
                'attribute_value'  => $condition['attribute_value'],
            ]);
        }

        foreach ($data['assignments'] ?? [] as $assignment) {
            $policy->assignments()->create([
                'assignee_type'  => $assignment['assignee_type'],
                'assignee_value' => $assignment['assignee_value'] ?? null,
            ]);
        }

        $this->log($creator, 'policy_created', 'policy', $policy->id);

        return $policy->load(['conditions', 'assignments']);
    }

    public function updatePolicy(User $editor, VaultPolicy $policy, array $data): VaultPolicy
    {
        $policy->update([
            'name'        => $data['name']        ?? $policy->name,
            'description' => $data['description'] ?? $policy->description,
            'target_type' => $data['target_type'] ?? $policy->target_type,
            'target_id'   => $data['target_id']   ?? $policy->target_id,
            'effect'      => $data['effect']       ?? $policy->effect,
            'priority'    => $data['priority']     ?? $policy->priority,
            'is_active'   => $data['is_active']    ?? $policy->is_active,
        ]);

        if (isset($data['conditions'])) {
            $policy->conditions()->delete();
            foreach ($data['conditions'] as $condition) {
                $policy->conditions()->create($condition);
            }
        }

        if (isset($data['assignments'])) {
            $policy->assignments()->delete();
            foreach ($data['assignments'] as $assignment) {
                $policy->assignments()->create($assignment);
            }
        }

        $this->log($editor, 'policy_updated', 'policy', $policy->id);

        return $policy->fresh(['conditions', 'assignments']);
    }

    public function deletePolicy(User $deleter, VaultPolicy $policy): void
    {
        $this->log($deleter, 'policy_deleted', 'policy', $policy->id, [
            'policy_name' => $policy->name,
        ]);
        $policy->delete();
    }

    // =========================================================================
    // INTERNAL — POLICY EVALUATION ENGINE
    // =========================================================================

    /**
     * Collect all policies that apply to this target.
     * Order: vault-wide → ancestor folders → target-specific
     * Deny policies always travel down regardless of inherits_parent_policy.
     */
    private function collectPolicies(string $targetType, $target): \Illuminate\Support\Collection
    {
        $policyIds = collect();

        // Vault-wide policies
        $vaultWide = VaultPolicy::where('target_type', 'vault')
            ->where('is_active', true)
            ->pluck('id');
        $policyIds = $policyIds->merge($vaultWide);

        // Ancestor folder policies
        if ($targetType === 'folder') {
            $ancestors = $target->ancestors();
        } elseif ($targetType === 'document' && $target->folder_id) {
            $folder    = VaultFolder::find($target->folder_id);
            $ancestors = $folder ? array_merge($folder->ancestors(), [$folder]) : [];
        } else {
            $ancestors = [];
        }

        foreach ($ancestors as $ancestor) {
            // Always collect deny policies; only collect allow if inherits
            $ancestorPolicies = VaultPolicy::where('target_type', 'folder')
                ->where('target_id', $ancestor->id)
                ->where('is_active', true);

            if (!$ancestor->inherits_parent_policy) {
                // Only denies cascade through isolation boundary
                $ancestorPolicies = $ancestorPolicies->where('effect', 'deny');
            }

            $policyIds = $policyIds->merge($ancestorPolicies->pluck('id'));
        }

        // Target-specific policies
        $targetPolicies = VaultPolicy::where('target_type', $targetType)
            ->where('target_id', $target->id)
            ->where('is_active', true)
            ->pluck('id');
        $policyIds = $policyIds->merge($targetPolicies);

        return VaultPolicy::whereIn('id', $policyIds->unique())
            ->with(['conditions', 'assignments'])
            ->orderByDesc('priority')
            ->get();
    }

    /**
     * Evaluate collected policies against user + context.
     * Explicit deny always wins. First allow grants access.
     * No match = deny.
     */
    private function evaluate(User $user, \Illuminate\Support\Collection $policies, array $context): bool
    {
        $hasAllow = false;

        foreach ($policies as $policy) {
            // Check if this policy applies to this user
            if (!$this->policyAppliesToUser($user, $policy)) continue;

            // Check if all conditions pass
            if (!$this->conditionsPass($policy->conditions, $context)) continue;

            // Explicit deny — immediately return false
            if ($policy->isDeny()) return false;

            // Explicit allow — mark it but keep checking for denies
            if ($policy->isAllow()) $hasAllow = true;
        }

        return $hasAllow;
    }

    /**
     * Check if a policy's assignments include this user.
     */
    private function policyAppliesToUser(User $user, VaultPolicy $policy): bool
    {
        foreach ($policy->assignments as $assignment) {
            switch ($assignment->assignee_type) {
                case 'all':
                    return true;

                case 'all_except':
                    // assignee_value is a comma-separated list of user_ids or roles
                    $excluded = explode(',', $assignment->assignee_value ?? '');
                    if (in_array((string) $user->id, $excluded)) return false;
                    if (in_array($user->role, $excluded))         return false;
                    return true;

                case 'role':
                    if ($user->role === $assignment->assignee_value) return true;
                    break;

                case 'user':
                    if ((string) $user->id === $assignment->assignee_value) return true;
                    break;
            }
        }

        return false;
    }

    /**
     * Evaluate all conditions for a policy — all must pass (AND logic).
     */
    private function conditionsPass(\Illuminate\Support\Collection $conditions, array $context): bool
    {
        foreach ($conditions as $condition) {
            if (!$this->evaluateCondition($condition, $context)) return false;
        }
        return true;
    }

    /**
     * Evaluate a single condition against context.
     */
    private function evaluateCondition(VaultPolicyCondition $condition, array $context): bool
    {
        $value = $context[$condition->attribute_source][$condition->attribute_key] ?? null;
        $expected = $condition->attribute_value; // already cast to array

        switch ($condition->operator) {
            case 'equals':
                return $value == ($expected[0] ?? null);

            case 'not_equals':
                return $value != ($expected[0] ?? null);

            case 'in':
                return in_array($value, $expected);

            case 'not_in':
                return !in_array($value, $expected);

            case 'contains':
                return is_array($value)
                    ? in_array($expected[0] ?? null, $value)
                    : str_contains((string) $value, (string) ($expected[0] ?? ''));

            case 'between':
                return isset($expected[0], $expected[1])
                    && $value >= $expected[0]
                    && $value <= $expected[1];

            case 'matches_cidr':
                foreach ($expected as $cidr) {
                    if ($this->ipMatchesCidr((string) $value, $cidr)) return true;
                }
                return false;

            default:
                return false;
        }
    }

    /**
     * Build the context object for policy evaluation.
     */
    private function buildContext(User $user, string $targetType, $target): array
    {
        return [
            'user' => [
                'role'          => $user->role,
                'user_id'       => (string) $user->id,
                'department'    => $user->department ?? null,
                'is_verified'   => $user->email_verified_at ? 'true' : 'false',
            ],
            'resource' => [
                'sensitivity_level' => $target->sensitivity_level,
                'document_type'     => $target->document_type    ?? null,
                'folder_type'       => $target->folder_type      ?? null,
                'tags'              => $target->tags              ?? [],
                'owner_user_id'     => (string) ($target->owner_user_id ?? $target->uploaded_by ?? ''),
            ],
            'context' => [
                'ip'          => Request::ip(),
                'time'        => now()->format('H:i'),
                'day_of_week' => strtolower(now()->format('l')),
                'hour'        => (int) now()->format('H'),
            ],
        ];
    }

    private function ipMatchesCidr(string $ip, string $cidr): bool
    {
        if (!str_contains($cidr, '/')) return $ip === $cidr;
        [$subnet, $mask] = explode('/', $cidr);
        return (ip2long($ip) & ~((1 << (32 - (int)$mask)) - 1)) === ip2long($subnet);
    }

    // =========================================================================
    // AUDIT LOGGING
    // =========================================================================

    public function log(User $user, string $action, string $targetType, ?int $targetId, array $extra = []): void
    {
        VaultAccessLog::create([
            'user_id'          => $user->id,
            'action'           => $action,
            'target_type'      => $targetType,
            'target_id'        => $targetId,
            'ip_address'       => Request::ip(),
            'user_agent'       => Request::userAgent(),
            'context_snapshot' => array_merge([
                'user_role' => $user->role,
                'user_name' => $user->name,
                'timestamp' => now()->toISOString(),
            ], $extra),
        ]);
    }
}