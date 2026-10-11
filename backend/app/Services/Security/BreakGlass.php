<?php

namespace App\Services\Security;

use App\Models\Security\AuthCredential;
use App\Models\User;
use App\Services\Notify\Staff;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

/**
 * The last way back in: for the day the owner and every backup (other passkeys, recovery codes, two administrators) are gone. It is not a screen, so nobody who only has a browser can use it:
 * it runs on the server (`php artisan security:recover`), by someone who can already run commands there. It ends every sign-in of the account, takes away its passkeys (unless told to keep them),
 * makes a fresh set of recovery codes (shown once, here, and nowhere else) and, if asked, a temporary password that must be changed at the next sign-in. With the codes the person signs in, adds a new
 * passkey, and is back. Every use is written to the sign-in log as an alert and the person and everyone who can change the security rules are told.
 */
final class BreakGlass
{
    public function __construct(private Sessions $sessions, private RecoveryCodes $codes, private SecurityAlerts $alerts, private Staff $staff)
    {
    }

    /**
     * @return array{sessions_ended: int, passkeys_removed: int, codes: string[], password: ?string, notes: string[]}
     */
    public function run(User $user, bool $keepPasskeys = false, bool $temporaryPassword = false, string $by = 'the server console'): array
    {
        $notes = [];
        $password = null;
        $removed = 0;
        $codes = [];

        $ended = $this->sessions->revokeAll($user, null, 'break_glass');
        if (Sessions::strongTracked() && ! $keepPasskeys) {
            $removed = AuthCredential::where('user_id', $user->id)->active()->update(['revoked_at' => now(), 'revoked_reason' => 'break_glass']);
        }
        if (RecoveryCodes::ready()) {
            $codes = $this->codes->generate($user);
        } else {
            $notes[] = 'Recovery codes are not set up (database script 126), so none were made.';
        }
        if ($temporaryPassword) {
            $password = Str::password(16, true, true, false, false);
            DB::transaction(fn () => $user->forceFill(['password' => Hash::make($password), 'password_changed_at' => now(), 'force_password_change' => true])->save());
        }
        if (! $codes && ! $password) {
            $notes[] = 'The person has no way back in from this: make a temporary password with --temporary-password.';
        }

        SecurityLog::record('break_glass_used', $user, null, ['by' => $by, 'sessions_ended' => $ended, 'passkeys_removed' => $removed, 'codes_made' => count($codes), 'temporary_password' => $password !== null, 'kept_passkeys' => $keepPasskeys], SecurityLog::ALERT);
        $this->alerts->breakGlassUsed($user, ['sessions_ended' => $ended, 'passkeys_removed' => $removed, 'codes_made' => count($codes), 'temporary_password' => $password !== null], $this->staff->holding('security.manage'));

        return ['sessions_ended' => $ended, 'passkeys_removed' => $removed, 'codes' => $codes, 'password' => $password, 'notes' => $notes];
    }
}
