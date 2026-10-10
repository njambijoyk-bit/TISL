<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Services\Access\Authorizer;
use App\Services\Access\Catalog;
use App\Services\Security\PasskeyPolicy;
use App\Services\Security\SecurityLog;
use App\Services\Security\SecuritySettings;
use App\Services\Security\Sessions;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Validation\Rule;
use Laravel\Sanctum\PersonalAccessToken;

/**
 * Admin → Security → "Who must use a passkey": the switch (off / log / enforce), the date, which roles and permissions it is for, and the list of staff with where each stands.
 * Seeing it needs security.view; changing it needs security.manage (the owner's). Changing it can never lock the person changing it out.
 */
class SecurityPolicyController extends Controller
{
    public function __construct(private PasskeyPolicy $policy, private SecuritySettings $settings, private Authorizer $auth)
    {
    }

    private function ready(): bool
    {
        return SecuritySettings::ready() && Sessions::strongTracked() && Schema::hasTable('auth_credentials');
    }

    /** GET /admin/security-policy */
    public function show(): JsonResponse
    {
        return response()->json($this->payload());
    }

    /** @return array<string, mixed> */
    private function payload(): array
    {
        $ready = $this->ready();

        return [
            'ready' => $ready,
            'message' => $ready ? null : 'The passkey rule is not set up yet: run database scripts 124 and 125 in Workbench.',
            'kill_switch' => (bool) config('security.policy.kill_switch'),
            'mode' => $this->policy->mode(),   // what is actually in force (off when the emergency switch is set)
            'settings' => [
                'mode' => (string) $this->settings->get('passkeys.mode', 'off'),
                'enforce_from' => $this->settings->get('passkeys.enforce_from'),
                'roles' => array_values((array) $this->settings->get('passkeys.roles', [])),
                'permissions' => array_values((array) $this->settings->get('passkeys.permissions', [])),
                'owner_roles' => array_values((array) $this->settings->get('passkeys.owner_roles', [])),
                'owner_device_bound' => (bool) $this->settings->get('passkeys.owner_device_bound', true),
            ],
            'roster' => $ready ? $this->policy->roster() : null,
            'choices' => [
                'roles' => collect($this->auth->roleInfo())->filter(fn ($r) => $r['kind'] === 'staff')->map(fn ($r, $k) => ['key' => $k, 'name' => $r['name']])->values(),
                'permissions' => collect(Catalog::PERMISSIONS)->map(fn ($p, $k) => ['key' => $k, 'group' => $p[1], 'label' => $p[2]])->values(),
            ],
        ];
    }

    /** PUT /admin/security-policy */
    public function update(Request $request): JsonResponse
    {
        if (! $this->ready()) {
            return response()->json(['message' => 'The passkey rule is not set up yet: run database scripts 124 and 125 in Workbench.'], 409);
        }
        $roleKeys = array_keys($this->auth->roleInfo());
        $data = $request->validate([
            'mode' => 'required|in:off,log,enforce',
            'enforce_from' => 'nullable|date_format:Y-m-d|required_if:mode,enforce',
            'roles' => 'sometimes|array|max:60', 'roles.*' => ['string', Rule::in($roleKeys)],
            'permissions' => 'sometimes|array|max:200', 'permissions.*' => ['string', Rule::in(array_keys(Catalog::PERMISSIONS))],
            'owner_roles' => 'sometimes|array|max:10', 'owner_roles.*' => ['string', Rule::in($roleKeys)],
            'owner_device_bound' => 'sometimes|boolean',
            'confirm' => 'sometimes|boolean',
        ]);

        /** @var User $actor */
        $actor = $request->user();
        $before = $this->payload()['settings'];
        $after = ['mode' => $data['mode'], 'enforce_from' => $data['enforce_from'] ?? null] + array_intersect_key($data, array_flip(['roles', 'permissions', 'owner_roles', 'owner_device_bound']));

        DB::beginTransaction();
        try {
            foreach ($after as $key => $value) {
                $this->settings->set('passkeys.'.$key, is_array($value) ? array_values(array_unique($value)) : $value, $actor->id);
            }

            if ($data['mode'] === 'enforce') {
                // never lock out the person who is changing it: they must already do what the rule asks (a passkey on this very sign-in, if it is for them)
                $token = $actor->currentAccessToken();
                $mine = $this->policy->report($actor, app(Sessions::class)->recordOf($token instanceof PersonalAccessToken ? $token : null));
                if ($mine['gate'] !== null) {
                    DB::rollBack();
                    SecuritySettings::forget();

                    return response()->json(['message' => 'You would be locked out by this rule yourself. Add your own passkey (and sign in with it) first, then turn it on.', 'reason' => 'would_lock_you_out', 'gate' => $mine['gate']], 422);
                }
                // and make it deliberate when others still have something to do
                $missing = $this->policy->roster()['summary']['missing'];
                if ($missing > 0 && ! $request->boolean('confirm')) {
                    DB::rollBack();
                    SecuritySettings::forget();

                    return response()->json(['message' => "{$missing} ".($missing === 1 ? 'person has' : 'people have').' not added the passkeys this rule asks for yet. From the date on, they can only add a passkey until they do. Confirm to go ahead.',
                        'reason' => 'confirm_needed', 'missing' => $missing], 422);
                }
            }
            DB::commit();
        } catch (\Throwable $e) {
            DB::rollBack();
            SecuritySettings::forget();
            throw $e;
        }

        SecurityLog::record('passkey_policy_changed', $actor, $request, ['before' => $before, 'after' => $this->payload()['settings']], SecurityLog::WARNING);

        return response()->json(['message' => 'Saved.'] + $this->payload());
    }
}
