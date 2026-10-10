<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Models\Customer;
use App\Models\ReferralCode;
use App\Models\ReferralCodeUsage;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Password;
use Illuminate\Support\Facades\Validator;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\Log;
use App\Mail\WelcomeEmail;
use Illuminate\Support\Str;
use Illuminate\Auth\Events\PasswordReset;
use App\Http\Controllers\Api\Traits\LogsPolicyAcceptances;
use App\Rules\StrongPassword;
use App\Services\Security\Passkeys\PasskeyException;
use App\Services\Security\Passkeys\Passkeys;
use App\Services\Security\PasskeyPolicy;
use App\Services\Security\SecurityLog;
use App\Services\Security\SessionCookie;
use App\Services\Security\SignInGuard;
use App\Services\Security\Sessions;
use Laravel\Sanctum\PersonalAccessToken;

class AuthController extends Controller
{
    use LogsPolicyAcceptances;
    /**
     * REGISTER - Create new user account
     * UPDATED: Added referral code support
     */
    public function register(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'name' => 'required|string|max:255',
            'email' => 'required|string|email|max:255|unique:users',
            'phone' => 'required|string|unique:users',
            'company_name' => 'nullable|string|max:255',
            'password' => ['required', 'string', new StrongPassword, 'confirmed'],
            'referral_code' => 'nullable|string',
            'policy_acceptances'            => 'required|array',
            'policy_acceptances.*.key'      => 'required|string',
            'policy_acceptances.*.response' => 'required|in:accepted,disagreed',
            ], [
 // NEW: Optional referral code[
        'name.required' => 'Please enter your full name',
        'email.required' => 'Email address is required',
        'email.unique' => 'This email is already registered',
        'phone.required' => 'Phone number is required',
        'phone.min' => 'Phone number must be at least 10 digits',
        'phone.unique' => 'This phone number is already registered',
        'password.confirmed' => 'Passwords do not match',
    ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        DB::beginTransaction();
        try {
            // Create user
            $user = User::create([
                'name' => $request->name,
                'email' => $request->email,
                'phone' => $request->phone,
                'company_name' => $request->input('company_name', null),
                'password' => Hash::make($request->password),
                'role' => 'customer',
                'status' => 'pending_verification',
                'oauth_provider' => 'email'
            ]);

            // Create customer record
            $nameParts = explode(' ', $request->name, 2);
            $customer = Customer::create([
                'user_id' => $user->id,
                'customer_number' => $this->generateCustomerNumber(),
                'first_name' => $nameParts[0],
                'last_name' => $nameParts[1] ?? '',
                'email' => $user->email,
                'phone' => $user->phone,
                'company_name'=> $user->company_name,
            ]);

            // NEW: Handle Referral Code (if provided)
            if ($request->referral_code) {
                $referralCode = ReferralCode::where('code', $request->referral_code)
                                           ->where('status', 'active')
                                           ->first();
                
                if ($referralCode && $referralCode->canBeUsedBy($customer, 0, 0)) {
                    // Link customer to referral
                    $customer->update([
                        'referred_by_code_id' => $referralCode->id,
                        'referred_by_customer_id' => $referralCode->customer_id,
                        'referral_registered_at' => now(),
                    ]);
                    
                    // Create usage record (pending until first order)
                    ReferralCodeUsage::createForRegistration(
                        $referralCode,
                        $customer,
                        $referralCode->customer // referrer
                    );
                    
                    // Increment code attempts
                    $referralCode->recordAttempt();
                    
                    Log::info('Referral code applied', [
                        'customer_id' => $customer->id,
                        'referral_code' => $referralCode->code
                    ]);
                }
            }

            // NEW: Generate Personal Referral Code for new customer
            $personalCode = ReferralCode::createForCustomer($customer);
            $customer->update(['referral_code_id' => $personalCode->id]);

            Log::info('Personal referral code created', [
                'customer_id' => $customer->id,
                'code' => $personalCode->code
            ]);

            
            // Log policy acceptances
            $policyAcceptances = $request->policy_acceptances ?? [];
            foreach ($policyAcceptances as $pa) {
                $this->logPolicyAcceptance(
                    policyKey:      $pa['key'],
                    actionContext:  'register',
                    response:       $pa['response'],
                    customer:       $customer,
                    user:           $user,
                    disagreeReason: $pa['reason'] ?? null,
                    wasSuccessful:  true,
                    request:        $request
                );
            }

            // Send verification email
            //Mail::to($user->email)->send(new WelcomeEmail($user));

            // Auto login
            Auth::guard('web')->login($user);

            // Create token
            $token = app(Sessions::class)->issue($user, $request, 'auth-token', 'register');

            DB::commit();

            // NEW: Enhanced response with referral data
            return SessionCookie::respond($request, [
                'message' => 'Registration successful',
                'user' => $user->load('customer'),
                'customer' => $customer->load('myReferralCode'), // NEW: Include referral code
                'referral_code' => $personalCode->code, // NEW: Easy access to code
                'share_url' => $personalCode->share_url, // NEW: Share URL
            ], 201, $token, $user);

        } catch (\Exception $e) {
            DB::rollBack();
            Log::error('Registration failed', [
                'error' => $e->getMessage(),
                'trace' => $e->getTraceAsString()
            ]);
            
            return response()->json([
                'message' => 'Registration failed',
                'error' => $e->getMessage()
            ], 500);
        }
    }

    /**
     * LOGIN - Authenticate user
     * UPDATED: Return customer data with referral code
     */
    public function login(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'email' => 'required|email',
            'password' => 'required|string',
            'remember' => 'boolean'
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        // Someone who has typed too many wrong passwords waits first; nothing about the account is looked at, so the answer is the same for any email
        $typed = (string) $request->email;
        $ip = (string) $request->ip();
        if ($wait = SignInGuard::wait($typed, $ip)) {
            return SignInGuard::refuse($wait, $request, $typed);
        }

        // Find user — include soft-deleted so they can be reactivated
        $user = User::withTrashed()->where('email', $request->email)->first();

        // The password is checked FIRST, and takes the same time whether or not the email exists; only someone who knows it is told anything about the account
        if (! SignInGuard::check((string) $request->password, $user?->password)) {
            if ($user && !$user->trashed()) $user->recordFailedLogin();
            SignInGuard::failed($typed, $ip, $request);
            SecurityLog::record('sign_in_failed', $user, $request, ['reason' => $user ? 'wrong_password' : 'unknown_email'], SecurityLog::NOTICE, $typed);
            return response()->json(['message' => 'Invalid credentials'], 401);
        }
        SignInGuard::succeeded($typed, $ip);

        // Suspended, locked by an administrator, an employee who has left, a vendor not yet approved
        if (!$user->canLogin()) {
            SecurityLog::record('sign_in_refused', $user, $request, ['reason' => $user->isLocked() ? 'locked' : 'not_allowed'], SecurityLog::WARNING, $typed);
            return response()->json([
                'message' => $user->isLocked()
                    ? 'Your account is locked. Please contact support.'
                    : 'Your account is suspended. Please contact support.'
            ], 403);
        }

        // Now restore if soft-deleted
        if ($user->trashed()) {
            $user->restore();
            if ($user->customer()->withTrashed()->exists()) {
                $user->customer()->withTrashed()->restore();
            }
        }

        // Check if password change required
        if ($user->force_password_change) {
            return response()->json([
                'message' => 'You must change your password before logging in',
                'force_password_change' => true
            ], 403);
        }

        // Customers must have accepted the current policies: asked for them, or recorded when sent along
        if ($stop = $this->policyGate($request, $user)) {
            return $stop;
        }

        return $this->finishSignIn($request, $user, 'password');
    }

    /**
     * Customers only: the policies they must have accepted (terms, privacy). Returns the answer to send back when they still have to accept or have refused; null to carry on.
     * The same gate guards every way of signing in (password, passkey).
     */
    private function policyGate(Request $request, User $user): ?\Illuminate\Http\JsonResponse
    {
        if ($user->isCustomer() && $user->customer) {
            $customer = $user->customer;
            $policyAcceptances = $request->input('policy_acceptances', []);

            // If no acceptances sent, check if re-acceptance needed
            if (empty($policyAcceptances)) {
                $needsReaccept = [];
                foreach (['terms_of_use', 'privacy_policy'] as $key) {
                    if ($this->needsReacceptance($customer, $key)) {
                        $policy = \App\Models\Policy::where('key', $key)->where('is_active', true)->first();
                        $needsReaccept[] = [
                            'key'                      => $key,
                            'title'                    => $policy?->title,
                            'content'                  => $policy?->content,
                            'version'                  => $policy?->version,
                            'sensitivity'              => $policy?->sensitivity,
                            'disagree_consequence_text'=> $policy?->disagree_consequence_text,
                        ];
                    }
                }

                if (!empty($needsReaccept)) {
                    return response()->json([
                        'requires_policy_acceptance' => true,
                        'policies'                   => $needsReaccept,
                        'message'                    => 'Policy re-acceptance required.',
                    ], 200);
                }
            }

            // Process sent acceptances
            foreach ($policyAcceptances as $pa) {
                $policyKey = $pa['key'];
                $response  = $pa['response'];
                $reason    = $pa['reason'] ?? null;

                $policy = \App\Models\Policy::where('key', $policyKey)
                    ->where('is_active', true)->first();

                $isCritical = $policy?->sensitivity === 'critical';

                // Log the acceptance/disagreement
                $this->logPolicyAcceptance(
                    policyKey:      $policyKey,
                    actionContext:  'login',
                    response:       $response,
                    customer:       $customer,
                    user:           $user,
                    disagreeReason: $reason,
                    wasSuccessful:  $response === 'accepted',
                    request:        $request
                );

                if ($response === 'disagreed') {
                    if ($isCritical) {
                        // Flag the account
                        $this->flagCustomerForPolicy($customer, $policyKey, $policy?->version ?? 'unknown');

                        // Create notification
                        \App\Models\Notification::create([
                            'notifiable_type' => \App\Models\Customer::class,
                            'notifiable_id'   => $customer->id,
                            'type'            => 'PolicyDisagreement',
                            'title'           => "Customer disagreed with {$policy?->title}",
                            'message'         => "{$customer->first_name} {$customer->last_name} ({$customer->customer_number}) disagreed with {$policy?->title} v{$policy?->version} at login." . ($reason ? " Reason: {$reason}" : ''),
                            'icon'            => 'shield-alert',
                            'color'           => '#ef4444',
                            'data'            => json_encode([
                                'customer_id'     => $customer->id,
                                'customer_number' => $customer->customer_number,
                                'policy_key'      => $policyKey,
                                'policy_version'  => $policy?->version,
                                'action_context'  => 'login',
                                'reason'          => $reason,
                                'is_critical'     => true,
                                'flagged'         => true,
                            ]),
                            'priority' => 'high',
                            'sent_at'  => now(),
                        ]);
                    }

                    return response()->json([
                        'message'             => $policy?->disagree_consequence_text ?? 'You must accept this policy to continue.',
                        'policy_disagreement' => true,
                        'policy_key'          => $policyKey,
                        'is_critical'         => $isCritical,
                    ], 403);
                }

                // Accepted — clear flag if this was the flagged policy
                if ($customer->policy_flagged && $customer->policy_flagged_policy_key === $policyKey) {
                    $this->clearPolicyFlag($customer);
                }
            }
        }

        return null;
    }

    /** The person is in: open the session (cookie or code), record it, and answer with who they are and what they may do. */
    private function finishSignIn(Request $request, User $user, string $method, ?\App\Models\Security\AuthCredential $credential = null): \Illuminate\Http\JsonResponse
    {
        // Login successful
        Auth::guard('web')->login($user, $request->remember ?? false);
        $user->recordLogin($request);

        // Create API token (a passkey sign-in is the strongest kind of proof we accept, and the session says so)
        $token = app(Sessions::class)->issue($user, $request, 'auth-token', $method, $credential?->id, $credential ? 2 : 0);

        // NEW: Load customer with referral code
        $customer = null;
        if ($user->isCustomer() && $user->customer) {
            $customer = $user->customer->load('myReferralCode');
        }

        return SessionCookie::respond($request, [
            'message' => 'Login successful',
            'user' => $user->load('customer'),
            'access' => $user->accessSummary(),
            'customer' => $customer, // NEW: Separate customer data
            'security' => app(PasskeyPolicy::class)->reportForToken($user, $token),   // where the person stands with the passkey rule (a reminder, or "one more step")
        ], 200, $token, $user);
    }

    /** The question a device is asked to sign to sign in with a passkey: it names no one, so it tells a stranger nothing about who has an account. */
    public function passkeyOptions(Request $request)
    {
        try {
            $q = app(Passkeys::class)->loginOptions($request);
        } catch (PasskeyException $e) {
            return response()->json(['message' => $e->getMessage()], $e->httpStatus);
        }

        return response()->json(['challenge_id' => $q['id'], 'options' => $q['options']]);
    }

    /** SIGN IN WITH A PASSKEY: the strongest proof we take. A genuine answer to a question we asked, for our website, with the person verified on their device. */
    public function passkeyLogin(Request $request)
    {
        $request->validate(['challenge_id' => 'required|string|size:40', 'credential' => 'required|array']);
        try {
            ['user' => $user, 'credential' => $credential] = app(Passkeys::class)->login((string) $request->input('challenge_id'), (array) $request->input('credential'), $request);
        } catch (PasskeyException $e) {
            SecurityLog::record('sign_in_failed', null, $request, ['reason' => 'passkey_'.$e->reason, 'door' => 'passkey'], SecurityLog::NOTICE);

            return response()->json(['message' => $e->getMessage()], $e->httpStatus);
        }
        if (! $user->canLogin()) {   // suspended, locked, a left employee... (a passkey does not get past that)
            SecurityLog::record('sign_in_refused', $user, $request, ['reason' => $user->isLocked() ? 'locked' : 'not_allowed', 'door' => 'passkey'], SecurityLog::WARNING);

            return response()->json(['message' => $user->isLocked() ? 'Your account is locked. Please contact support.' : 'Your account is suspended. Please contact support.'], 403);
        }
        // the passkey is itself the proof, so a pending "choose a new password" does not stand in its way; the policies still must be accepted
        if ($stop = $this->policyGate($request, $user)) {
            return $stop;
        }

        return $this->finishSignIn($request, $user, 'passkey', $credential);
    }

    /**
     * LOGOUT - Revoke current token
     */
    public function logout(Request $request)
    {
        // End this session (the record keeps why)
        $current = $request->user()->currentAccessToken();
        if ($current instanceof PersonalAccessToken) {
            app(Sessions::class)->revokeOne($request->user(), (int) $current->id, 'logout');
            SecurityLog::record('sign_out', $request->user(), $request);
        }
        
        // A token login has no browser session to close; a cookie login does. (The token guard has no logout() at all, which used to turn every sign-out into an error after the token was already gone.)
        try {
            Auth::guard('web')->logout();
        } catch (\Throwable) {
            // nothing to close
        }

        $response = response()->json([
            'message' => 'Logout successful'
        ], 200);
        $response->headers->setCookie(SessionCookie::forget($request));   // the browser drops the sign-in cookie

        return $response;
    }

    /**
     * ME - Get authenticated user
     * UPDATED: Include customer with referral code
     */
    public function me(Request $request)
    {
        $user = $request->user();
        
        // NEW: Load customer with referral code
        $customer = null;
        if ($user->isCustomer() && $user->customer) {
            $customer = $user->customer->load('myReferralCode');
        }

        return response()->json([
            'user' => $user->load('customer'),
            'access' => $user->accessSummary(),
            'customer' => $customer, // NEW: Separate customer data
            'security' => app(PasskeyPolicy::class)->report($user, app(Sessions::class)->recordOf($user->currentAccessToken() instanceof PersonalAccessToken ? $user->currentAccessToken() : null)),
            'csrf' => SessionCookie::csrfOf($request),   // for a page signed in by cookie: the code its changes must carry (null for any other client)
        ], 200);
    }

    /**
     * FORGOT PASSWORD - Send reset link
     */
    public function forgotPassword(Request $request)
    {
        $request->validate([
            'email' => 'required|email|max:255',
        ]);

        try {
            $status = Password::sendResetLink($request->only('email'));

            // Always return success to prevent email enumeration
            return response()->json([
                'message' => 'If this email exists in our system, you will receive a password reset link shortly.'
            ], 200);

        } catch (\Exception $e) {
            Log::error('Password reset error', [
                'email' => $request->email,
                'error' => $e->getMessage(),
                'ip' => $request->ip()
            ]);

            // Still return "success" to prevent enumeration
            return response()->json([
                'message' => 'If this email exists in our system, you will receive a password reset link shortly.'
            ], 200);
        }
    }

    /**
     * RESET PASSWORD
     */
    public function resetPassword(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'token' => 'required',
            'email' => 'required|email',
            'password' => ['required', 'string', new StrongPassword, 'confirmed'],
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        $status = Password::reset(
            $request->only('email', 'password', 'password_confirmation', 'token'),
            function (User $user, string $password) use ($request) {
                $user->forceFill([
                    'password' => Hash::make($password),
                    'password_changed_at' => now(),
                    'force_password_change' => false,
                    'remember_token' => Str::random(60),
                ])->save();

                $ended = app(Sessions::class)->revokeAll($user, null, 'password_reset');   // a reset ends every session, so whoever held the old password or a stolen session is out
                SecurityLog::record('password_reset', $user, $request, ['sessions_ended' => $ended], SecurityLog::WARNING);

                event(new PasswordReset($user));
            }
        );

        if ($status === Password::PASSWORD_RESET) {
            return response()->json([
                'message' => 'Password has been reset successfully'
            ], 200);
        }

        return response()->json([
            'message' => 'Failed to reset password'
        ], 500);
    }

    /**
     * CHANGE PASSWORD (when logged in)
     */
    public function changePassword(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'current_password' => 'required|string',
            'new_password' => ['required', 'string', new StrongPassword([$request->user()?->name, $request->user()?->email, $request->user()?->phone]), 'confirmed'],
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        $user = $request->user();

        // Verify current password
        if (!Hash::check($request->current_password, $user->password)) {
            return response()->json([
                'message' => 'Current password is incorrect'
            ], 401);
        }

        if (Hash::check($request->new_password, $user->password)) {
            return response()->json([
                'errors' => ['new_password' => ['New password must be different from your current password.']]
            ], 422);
        }

        // Update password
        $user->update([
            'password' => Hash::make($request->new_password),
            'password_changed_at' => now(),
            'force_password_change' => false,
        ]);

        // Whoever else is signed in as this person (a stolen session, a forgotten laptop) is signed out now; this browser stays
        $current = $request->user()->currentAccessToken();
        $ended = app(Sessions::class)->revokeAll($user, $current instanceof PersonalAccessToken ? (int) $current->id : null, 'password_changed');
        SecurityLog::record('password_changed', $user, $request, ['sessions_ended' => $ended], SecurityLog::NOTICE);

        return response()->json([
            'message' => 'Password changed successfully' . ($ended ? ". {$ended} other " . ($ended === 1 ? 'device was' : 'devices were') . ' signed out.' : '')
        ], 200);
    }

    /**
     * UPLOAD PROFILE PICTURE (when logged in)
     */
    public function uploadProfilePicture(Request $request)
    {
        $request->validate(['image' => 'required|image|max:2048']);

        $user = $request->user();

        // Delete old image if it's a local file
        if ($user->profile_picture &&
            !str_starts_with($user->profile_picture, 'http')) {
            Storage::disk('public')->delete($user->profile_picture);
        }

        $path = $request->file('image')->store('users', 'public');
        $user->update(['profile_picture' => $path]);
        $fresh = $user->fresh();

        return response()->json([
            'message'             => 'Profile picture updated',
            'profile_picture_url' => $fresh->profile_picture_url,
            'user'                => $fresh,
        ]);
    }

    /**
     * FORCE CHANGE PASSWORD
     * Called when force_password_change = true.
     * Public route — user has no token yet.
     */
    public function forceChangePassword(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'email'         => 'required|email',
            'current_password'  => 'required|string',
            'new_password'  => ['required', 'string', new StrongPassword, 'confirmed'],
        ], [
            'new_password.confirmed' => 'Passwords do not match',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        // The same waits as signing in (this door also takes a password), and the same answer for every way of being wrong
        $typed = (string) $request->email;
        $ip = (string) $request->ip();
        if ($wait = SignInGuard::wait($typed, $ip)) {
            return SignInGuard::refuse($wait, $request, $typed);
        }

        $user = User::where('email', $request->email)->first();

        // Guard: the account must exist, hold a temporary password that fits, AND actually have the flag set; which of these failed is not said
        $passwordFits = SignInGuard::check((string) $request->current_password, $user?->password);
        if (! $passwordFits || ! $user->force_password_change) {
            SignInGuard::failed($typed, $ip, $request);
            SecurityLog::record('sign_in_failed', $user, $request, ['reason' => 'temporary_password'], SecurityLog::NOTICE, $typed);
            return response()->json(['message' => 'The email or the temporary password is not right.'], 401);
        }
        SignInGuard::succeeded($typed, $ip);

        if (!$user->canLogin()) {
            SecurityLog::record('sign_in_refused', $user, $request, ['reason' => 'not_allowed', 'door' => 'temporary_password'], SecurityLog::WARNING, $typed);
            return response()->json(['message' => 'Your account is suspended. Please contact support.'], 403);
        }

        if (Hash::check($request->new_password, $user->password)) {
            return response()->json([
                'errors' => ['new_password' => ['New password must be different from your current password.']]
            ], 422);
        }

        $user->update([
            'password'              => Hash::make($request->new_password),
            'password_changed_at'   => now(),
            'force_password_change' => false,
            'remember_token'        => Str::random(60),
        ]);

        $ended = app(Sessions::class)->revokeAll($user, null, 'password_changed');
        SecurityLog::record('password_changed', $user, $request, ['sessions_ended' => $ended, 'forced' => true], SecurityLog::NOTICE);

        event(new PasswordReset($user));

        Auth::guard('web')->login($user);
        $token = app(Sessions::class)->issue($user, $request, 'auth-token', 'reset');
        $user->recordLogin($request);

        $customer = null;
        if ($user->isCustomer() && $user->customer) {
            $customer = $user->customer->load('myReferralCode');
        }

        return SessionCookie::respond($request, [
            'message'  => 'Password changed. Welcome back.',
            'user'     => $user->load('customer'),
            'access'   => $user->accessSummary(),
            'customer' => $customer,
        ], 200, $token, $user);
    }

    /**
     * Get admin users for assignment
     * Used by AssignModal and other admin features
     */
    public function getAdminUsers(Request $request)
    {
        // staff who can be picked in an assign dialog: every staff account except drivers
        $users = User::staffAccounts(app(\App\Services\Access\Authorizer::class)->driverRoleKeys())
            ->select('id', 'name', 'email', 'role')
            ->get();
        
        return response()->json([
            'data' => $users,
            'total' => $users->count()
        ]);
    }

    /**
     * Helper: Generate Customer Number
     */
    private function generateCustomerNumber()
    {
        return 'CUST-' . date('Y') . '-' . str_pad((Customer::withTrashed()->max('id') ?? 0) + 1, 4, '0', STR_PAD_LEFT);
    }
}