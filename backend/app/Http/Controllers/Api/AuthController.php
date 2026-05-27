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
            'password' => 'required|string|min:8|confirmed',
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
        'password.min' => 'Password must be at least 8 characters',
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
            Auth::login($user);

            // Create token
            $token = $user->createToken('auth-token')->plainTextToken;

            DB::commit();

            // NEW: Enhanced response with referral data
            return response()->json([
                'message' => 'Registration successful',
                'user' => $user->load('customer'),
                'customer' => $customer->load('myReferralCode'), // NEW: Include referral code
                'token' => $token,
                'referral_code' => $personalCode->code, // NEW: Easy access to code
                'share_url' => $personalCode->share_url, // NEW: Share URL
            ], 201);

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

        // Find user — include soft-deleted so they can be reactivated
        $user = User::withTrashed()->where('email', $request->email)->first();

        if (!$user) {
            return response()->json(['message' => 'Invalid credentials'], 401);
        }

        // Check if account is locked
        if ($user->isLocked()) {
            return response()->json([
                'message' => 'Account is locked due to multiple failed login attempts. Please try again later.'
            ], 423);
        }

        // Check if user can login
        if (!$user->canLogin()) {
            return response()->json([
                'message' => 'Your account is suspended. Please contact support.'
            ], 403);
        }
        
        // Verify password FIRST before restoring anything
        if (!Hash::check($request->password, $user->password)) {
            if (!$user->trashed()) $user->recordFailedLogin();
            return response()->json(['message' => 'Invalid credentials'], 401);
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

        // ── Policy acceptance check (customers only) ──────────────────────────────
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

        // Login successful
        Auth::login($user, $request->remember ?? false);
        $user->recordLogin($request);

        // Create API token
        $token = $user->createToken('auth-token')->plainTextToken;

        // NEW: Load customer with referral code
        $customer = null;
        if ($user->isCustomer() && $user->customer) {
            $customer = $user->customer->load('myReferralCode');
        }

        return response()->json([
            'message' => 'Login successful',
            'user' => $user->load('customer'),
            'customer' => $customer, // NEW: Separate customer data
            'token' => $token
        ], 200);
    }

    /**
     * LOGOUT - Revoke current token
     */
    public function logout(Request $request)
    {
        // Revoke current token
        $request->user()->currentAccessToken()->delete();
        
        // Logout from session
        Auth::logout();

        return response()->json([
            'message' => 'Logout successful'
        ], 200);
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
            'customer' => $customer, // NEW: Separate customer data
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
            'password' => 'required|string|min:8|confirmed',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        $status = Password::reset(
            $request->only('email', 'password', 'password_confirmation', 'token'),
            function (User $user, string $password) {
                $user->forceFill([
                    'password' => Hash::make($password),
                    'password_changed_at' => now(),
                    'force_password_change' => false,
                    'remember_token' => Str::random(60),
                ])->save();

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
            'new_password' => 'required|string|min:8|confirmed',
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

        return response()->json([
            'message' => 'Password changed successfully'
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
            'new_password'  => 'required|string|min:8|confirmed',
        ], [
            'new_password.min'       => 'New password must be at least 8 characters',
            'new_password.confirmed' => 'Passwords do not match',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        $user = User::where('email', $request->email)->first();

        // Guard: user must exist AND actually have the flag set
        if (!$user || !$user->force_password_change) {
            return response()->json(['message' => 'Invalid request'], 403);
        }

        if (!Hash::check($request->current_password, $user->password)) {
            return response()->json(['message' => 'Current password is incorrect'], 401);
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

        event(new PasswordReset($user));

        Auth::login($user);
        $token = $user->createToken('auth-token')->plainTextToken;
        $user->recordLogin($request);

        $customer = null;
        if ($user->isCustomer() && $user->customer) {
            $customer = $user->customer->load('myReferralCode');
        }

        return response()->json([
            'message'  => 'Password changed. Welcome back.',
            'user'     => $user->load('customer'),
            'customer' => $customer,
            'token'    => $token,
        ], 200);
    }

    /**
     * Get admin users for assignment
     * Used by AssignModal and other admin features
     */
    public function getAdminUsers(Request $request)
    {
        // Simplified version for testing
        $users = User::whereIn('role', ['super_admin', 'admin', 'manager', 'sales_rep'])
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