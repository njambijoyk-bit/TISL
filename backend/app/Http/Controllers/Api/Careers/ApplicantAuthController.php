<?php

namespace App\Http\Controllers\Api\Careers;

use App\Http\Controllers\Controller;
use App\Models\Applicant;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Password;
use Illuminate\Support\Facades\Validator;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;
use Illuminate\Auth\Events\PasswordReset;

class ApplicantAuthController extends Controller
{
    // ── Register ──────────────────────────────────────────────────────────────

    public function register(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'first_name'          => 'required|string|max:100',
            'last_name'           => 'required|string|max:100',
            'email'               => 'required|email|max:255|unique:applicants,email',
            'password'            => 'required|string|min:8|confirmed',
            'phone'               => 'nullable|string|max:30',
            'linkedin_url'        => 'nullable|url|max:500',
            'portfolio_url'       => 'nullable|url|max:500',
            'current_role'        => 'nullable|string|max:150',
            'years_of_experience' => 'nullable|integer|min:0|max:60',
            'location'            => 'nullable|string|max:150',
        ], [
            'email.unique'       => 'An account with this email already exists.',
            'password.confirmed' => 'Passwords do not match.',
            'password.min'       => 'Password must be at least 8 characters.',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        DB::beginTransaction();
        try {
            $applicant = Applicant::create([
                'first_name'          => $request->first_name,
                'last_name'           => $request->last_name,
                'email'               => $request->email,
                'password'            => Hash::make($request->password),
                'phone'               => $request->phone,
                'linkedin_url'        => $request->linkedin_url,
                'portfolio_url'       => $request->portfolio_url,
                'current_role'        => $request->current_role,
                'years_of_experience' => $request->years_of_experience,
                'location'            => $request->location,
                'status'              => 'active',
            ]);

            $token = $applicant->createToken('applicant-token')->plainTextToken;

            DB::commit();

            return response()->json([
                'message'   => 'Registration successful.',
                'applicant' => $applicant,
                'token'     => $token,
            ], 201);

        } catch (\Exception $e) {
            DB::rollBack();
            Log::error('Applicant registration failed', [
                'error' => $e->getMessage(),
                'email' => $request->email,
            ]);
            return response()->json(['message' => 'Registration failed. Please try again.'], 500);
        }
    }

    // ── Login ─────────────────────────────────────────────────────────────────

    public function login(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'email'    => 'required|email',
            'password' => 'required|string',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        $applicant = Applicant::where('email', $request->email)->first();

        if (!$applicant || !Hash::check($request->password, $applicant->password)) {
            return response()->json(['message' => 'Invalid credentials.'], 401);
        }

        if ($applicant->status === 'suspended') {
            return response()->json(['message' => 'Your account has been suspended. Please contact support.'], 403);
        }

        // Revoke previous tokens (one active session at a time)
        $applicant->tokens()->delete();

        $token = $applicant->createToken('applicant-token')->plainTextToken;

        return response()->json([
            'message'              => 'Login successful.',
            'applicant'            => $applicant,
            'must_change_password' => (bool) $applicant->must_change_password,
            'token'                => $token,
        ]);
    }

    // ── Force change password (admin-initiated reset) ─────────────────────────

    public function changePassword(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'password' => 'required|string|min:8|confirmed',
        ], [
            'password.confirmed' => 'Passwords do not match.',
            'password.min'       => 'Password must be at least 8 characters.',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        $applicant = $request->user();

        $applicant->update([
            'password'             => Hash::make($request->password),
            'must_change_password' => false,
        ]);

        return response()->json(['message' => 'Password changed successfully.']);
    }

    // ── Logout ────────────────────────────────────────────────────────────────

    public function logout(Request $request)
    {
        $request->user()->currentAccessToken()->delete();

        return response()->json(['message' => 'Logged out successfully.']);
    }

    // ── Me ────────────────────────────────────────────────────────────────────

    public function me(Request $request)
    {
        $applicant = $request->user()->load('activeApplications.jobPosting');

        return response()->json(['applicant' => $applicant]);
    }

    // ── Forgot Password ───────────────────────────────────────────────────────

    // ── Forgot Password ───────────────────────────────────────────────────────

    public function forgotPassword(Request $request)
    {
        $request->validate(['email' => 'required|email|max:255']);

        $applicant = \App\Models\Applicant::where('email', $request->email)->first();

        if ($applicant) {
            // Generate a real token via the broker and store it
            $token = Password::broker('applicants')->createToken($applicant);
            $applicant->sendPasswordResetNotification($token);
        }

        // Always return 200 to prevent email enumeration
        return response()->json([
            'message' => 'If that email is registered, a reset link is on its way.',
        ]);
    }

    // ── Reset Password (token from email link) ────────────────────────────────

    public function resetPassword(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'token'    => 'required',
            'email'    => 'required|email',
            'password' => 'required|string|min:8|confirmed',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        $status = Password::broker('applicants')->reset(
            $request->only('email', 'password', 'password_confirmation', 'token'),
            function (Applicant $applicant, string $password) {
                $applicant->forceFill([
                    'password'             => Hash::make($password),
                    'must_change_password' => false,
                    'remember_token'       => Str::random(60),
                ])->save();

                event(new PasswordReset($applicant));
            }
        );

        if ($status === Password::PASSWORD_RESET) {
            return response()->json(['message' => 'Password reset successfully. You can now log in.']);
        }

        return response()->json(['message' => 'Invalid or expired reset token.'], 422);
    }
}