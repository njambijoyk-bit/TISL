<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Models\Customer;
use App\Models\ReferralCode;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\DB;
use Laravel\Socialite\Facades\Socialite;

class OAuthController extends Controller
{
    /**
     * Redirect to OAuth provider
     */
    public function redirectToProvider(string $provider)
    {
        if (!in_array($provider, ['google', 'microsoft'])) {
            return response()->json([
                'message' => 'Invalid OAuth provider',
            ], 400);
        }

        // Check if provider is configured
        $clientId = config("services.{$provider}.client_id");
        if (empty($clientId)) {
            return response()->json([
                'message' => 'OAuth provider not configured',
                'error' => "Please configure {$provider} OAuth credentials in .env",
            ], 500);
        }

        try {
            return Socialite::driver($provider)->stateless()->redirect();
        } catch (\Exception $e) {
            return response()->json([
                'message' => 'OAuth redirect failed',
                'error' => $e->getMessage(),
            ], 500);
        }
    }

    /**
     * Handle OAuth callback
     */
    public function handleProviderCallback(string $provider)
    {
        if (!in_array($provider, ['google', 'microsoft'])) {
            Log::error('Invalid OAuth provider: ' . $provider);
            return $this->redirectToFrontend('error=invalid_provider');
        }

        try {
            Log::info("OAuth callback started for provider: {$provider}");
            
            // Get user from OAuth provider
            $socialUser = Socialite::driver($provider)->stateless()->user();
            
            Log::info('OAuth user retrieved', [
                'email' => $socialUser->getEmail(),
                'name' => $socialUser->getName(),
                'id' => $socialUser->getId(),
            ]);

            // Determine which field to use based on provider
            $oauthIdField = $provider === 'google' ? 'google_id' : 'microsoft_id';

            // Find user by email or OAuth ID
            $user = User::withTrashed()
                ->where('email', $socialUser->getEmail())
                ->orWhere($oauthIdField, $socialUser->getId())
                ->first();

            if (!$user) {
                Log::info('Creating new user from OAuth');
                
                // Create new user
                $user = User::create([
                    'name' => $socialUser->getName(),
                    'email' => $socialUser->getEmail(),
                    'password' => Hash::make(uniqid()), // Random password
                    $oauthIdField => $socialUser->getId(),
                    'oauth_provider' => $provider,
                    'role' => 'customer',
                    'status' => 'active',
                    'email_verified_at' => now(),
                ]);
                
                Log::info('User created successfully', ['user_id' => $user->id]);
                // Create Customer for OAuth user
                $nameParts = explode(' ', $socialUser->getName(), 2);
                $customer = Customer::create([
                    'user_id' => $user->id,
                    'first_name' => $nameParts[0],
                    'last_name' => $nameParts[1] ?? '',
                    'email' => $socialUser->getEmail(),
                    'phone' => null, // OAuth doesn't provide phone
                    'customer_type' => 'individual',
                    'tier' => 'bronze',
                    'status' => 'active',
                    'email_verified' => true,
                ]);

                Log::info('Customer created for OAuth user', ['customer_id' => $customer->id]);

                // Generate Personal Referral Code
                $personalCode = ReferralCode::createForCustomer($customer);
                $customer->update(['referral_code_id' => $personalCode->id]);

                Log::info('Personal referral code created for OAuth user', [
                    'customer_id' => $customer->id,
                    'code' => $personalCode->code
                ]);
            } else {
                if ($user->trashed()) {
                    $user->restore();
                    if ($user->customer()->withTrashed()->exists()) {
                        $user->customer()->withTrashed()->restore();
                    }
                    Log::info('Restored soft-deleted user via OAuth', ['user_id' => $user->id]);
                }

                if ($user->status === 'suspended') {
                    return $this->redirectToFrontend('error=account_suspended&message=' . urlencode('Your account has been suspended. Please contact support.'));
                }

                Log::info('User found', ['user_id' => $user->id]);
                
                // Update OAuth info if not set
                if (!$user->$oauthIdField) {
                    $user->update([
                        $oauthIdField => $socialUser->getId(),
                        'oauth_provider' => $provider,
                    ]);
                    Log::info('User OAuth info updated');
                }
                // Create customer if doesn't exist
                if (!$user->customer) {
                    $nameParts = explode(' ', $user->name, 2);
                    $customer = Customer::create([
                        'user_id' => $user->id,
                        'first_name' => $nameParts[0],
                        'last_name' => $nameParts[1] ?? '',
                        'email' => $user->email,
                        'phone' => $user->phone ?? null,
                        'customer_type' => 'individual',
                        'tier' => 'bronze',
                        'status' => 'active',
                        'email_verified' => !is_null($user->email_verified_at),
                    ]);

                    // Generate Personal Referral Code
                    $personalCode = ReferralCode::createForCustomer($customer);
                    $customer->update(['referral_code_id' => $personalCode->id]);

                    Log::info('Customer created for existing OAuth user', [
                        'customer_id' => $customer->id
                    ]);
                }
            }

            // Generate token using Laravel Sanctum
            $token = $user->createToken('auth_token')->plainTextToken;
            
            Log::info('Token generated successfully');

            // Redirect to frontend with token
            return $this->redirectToFrontend("token={$token}");

        } catch (\Exception $e) {
            Log::error('OAuth callback error: ' . $e->getMessage(), [
                'exception' => get_class($e),
                'file' => $e->getFile(),
                'line' => $e->getLine(),
                'trace' => $e->getTraceAsString(),
            ]);
            
            return $this->redirectToFrontend('error=oauth_failed&message=' . urlencode($e->getMessage()));
        }
    }

    /**
     * Redirect to frontend with parameters
     */
    private function redirectToFrontend(string $params)
    {
        $frontendUrl = env('APP_FRONTEND_URL', 'http://localhost:5173');
        return redirect()->away("{$frontendUrl}/auth/callback?{$params}");
    }
}