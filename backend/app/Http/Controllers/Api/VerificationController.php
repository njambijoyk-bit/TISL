<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;

class VerificationController extends Controller
{
    // ================================================
    // EMAIL VERIFICATION
    // ================================================
    public function verifyEmail(Request $request, $id, $hash)
    {
        $user = User::findOrFail($id);

        if (!hash_equals(sha1($user->getEmailForVerification()), $hash)) {
            return redirect(env('FRONTEND_URL', 'http://localhost:5173') . '/verify-email?error=invalid_link');
        }

        if ($user->hasVerifiedEmail()) {
            return redirect(env('FRONTEND_URL', 'http://localhost:5173') . '/verify-email?already=verified');
        }

        $user->markEmailAsVerified();

        return redirect(env('FRONTEND_URL', 'http://localhost:5173') . '/verify-email?verified=1');
    }

     /**
     * Resend verification email (customer self-service)
     */
    public function resendEmailVerification(Request $request)
    {
        $user = $request->user();

        if ($user->hasVerifiedEmail()) {
            return response()->json(['message' => 'Email already verified.'], 422);
        }

        $user->sendEmailVerificationNotification();

        return response()->json(['message' => 'Verification email sent.']);
    }

    /**
     * Admin manually verify a user's email
     */
    public function adminVerifyEmail(Request $request, $id)
    {
        $user = User::findOrFail($id);
        $this->authorize('manageAccount', $user);

        $user->forceFill(['email_verified_at' => now()])->save();

        return response()->json(['message' => 'Email verified.', 'data' => $user]);
    }

    /**
     * Admin manually unverify a user's email
     */
    public function adminUnverifyEmail(Request $request, $id)
    {
        $user = User::findOrFail($id);
        $this->authorize('manageAccount', $user);

        $user->forceFill(['email_verified_at' => null])->save();

        return response()->json(['message' => 'Email verification removed.', 'data' => $user]);
    }

    // ================================================
    // PHONE VERIFICATION
    // ================================================

    /**
     * Send OTP to user's phone (customer self-service)
     */
    public function sendPhoneOtp(Request $request)
    {
        $user = $request->user();

        if (!$user->phone) {
            return response()->json(['message' => 'No phone number on your account.'], 422);
        }

        if ($user->hasVerifiedPhone()) {
            return response()->json(['message' => 'Phone already verified.'], 422);
        }

        // Generate 6-digit OTP
        $otp = str_pad(random_int(0, 999999), 6, '0', STR_PAD_LEFT);

        $user->forceFill([
            'phone_otp'            => $otp,
            'phone_otp_expires_at' => now()->addMinutes(10),
        ])->save();

        // TODO: Integrate with SMS provider (Twilio, Africa's Talking, etc.)
        // For now we log it for testing
        Log::info('Phone OTP generated', [
            'user_id' => $user->id,
            'phone'   => $user->phone,
            'otp'     => $otp, // Remove in production
        ]);

        // Uncomment when SMS provider is configured:
        // SmsService::send($user->phone, "Your TISL verification code is: {$otp}. Expires in 10 minutes.");

        return response()->json(['message' => 'OTP sent to your phone number.']);
    }

    /**
     * Verify phone OTP (customer self-service)
     */
    public function verifyPhoneOtp(Request $request)
    {
        $request->validate([
            'otp' => 'required|string|size:6',
        ]);

        $user = $request->user();

        if ($user->hasVerifiedPhone()) {
            return response()->json(['message' => 'Phone already verified.'], 422);
        }

        if (!$user->phone_otp || !$user->phone_otp_expires_at) {
            return response()->json(['message' => 'No OTP found. Please request a new one.'], 422);
        }

        if ($user->phone_otp_expires_at->isPast()) {
            return response()->json(['message' => 'OTP has expired. Please request a new one.'], 422);
        }

        if ($request->otp !== $user->phone_otp) {
            return response()->json(['message' => 'Invalid OTP.'], 422);
        }

        $user->forceFill([
            'phone_verified_at'    => now(),
            'phone_otp'            => null,
            'phone_otp_expires_at' => null,
        ])->save();

        return response()->json(['message' => 'Phone verified successfully.', 'data' => $user]);
    }

    /**
     * Admin manually verify a user's phone
     */
    public function adminVerifyPhone(Request $request, $id)
    {
        $user = User::findOrFail($id);
        $this->authorize('manageAccount', $user);

        $user->forceFill([
            'phone_verified_at'    => now(),
            'phone_otp'            => null,
            'phone_otp_expires_at' => null,
        ])->save();

        return response()->json(['message' => 'Phone verified.', 'data' => $user]);
    }

    /**
     * Admin manually unverify a user's phone
     */
    public function adminUnverifyPhone(Request $request, $id)
    {
        $user = User::findOrFail($id);
        $this->authorize('manageAccount', $user);

        $user->forceFill(['phone_verified_at' => null])->save();

        return response()->json(['message' => 'Phone verification removed.', 'data' => $user]);
    }

    // ================================================
    // ACCOUNT LOCK (Admin manual lock)
    // ================================================

    /**
     * Admin manually lock an account
     */
    public function lockAccount(Request $request, $id)
    {
        $user = User::findOrFail($id);
        $this->authorize('manageAccount', $user);

        $request->validate([
            'duration_minutes' => 'nullable|integer|min:1|max:10080', // max 1 week
            'reason'           => 'nullable|string|max:255',
        ]);

        $duration = $request->input('duration_minutes', 60);

        $user->forceFill([
            'locked_until'          => now()->addMinutes($duration),
            'failed_login_attempts' => 5,
        ])->save();

        // Revoke tokens so they're kicked out immediately
        $user->tokens()->delete();

        Log::info('Account manually locked by admin', [
            'target_user_id' => $user->id,
            'admin_id'       => $request->user()->id,
            'duration'       => $duration,
            'reason'         => $request->reason,
        ]);

        return response()->json([
            'message'      => "Account locked for {$duration} minutes.",
            'locked_until' => $user->locked_until,
            'data'         => $user,
        ]);
    }
}