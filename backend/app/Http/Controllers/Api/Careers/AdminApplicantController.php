<?php

namespace App\Http\Controllers\Api\Careers;

use App\Http\Controllers\Controller;
use App\Models\Applicant;
use App\Notifications\AdminTemporaryPasswordNotification;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;

class AdminApplicantController extends Controller
{
    // ── Index: paginated list with search + status filter ─────────────────────

    public function index(Request $request)
    {
        $query = Applicant::withCount(['applications', 'activeApplications'])
            ->orderBy('created_at', 'desc');

        if ($request->filled('search')) {
            $s = $request->input('search');
            $query->where(function ($q) use ($s) {
                $q->where('first_name',  'like', "%{$s}%")
                  ->orWhere('last_name',  'like', "%{$s}%")
                  ->orWhere('email',       'like', "%{$s}%")
                  ->orWhere('current_role','like', "%{$s}%")
                  ->orWhere('location',    'like', "%{$s}%");
            });
        }

        if ($request->filled('status')) {
            $query->where('status', $request->input('status'));
        }

        $perPage = min((int) $request->input('per_page', 20), 50);

        return response()->json([
            'data' => $query->paginate($perPage),
        ]);
    }

    // ── Show: single applicant with applications ──────────────────────────────

    public function show(int $id)
    {
        $applicant = Applicant::withCount(['applications', 'activeApplications'])
            ->with([
                'applications' => fn ($q) => $q
                    ->with('jobPosting:id,title,slug,department,status')
                    ->orderBy('created_at', 'desc'),
            ])
            ->findOrFail($id);

        return response()->json(['data' => $applicant]);
    }

    // ── Admin reset password: set temp password + flag force-change ───────────

    public function resetPassword(Request $request, int $id)
    {
        $request->validate([
            'temporary_password' => 'required|string|min:8',
        ]);

        $applicant = Applicant::findOrFail($id);

        $applicant->update([
            'password'             => Hash::make($request->temporary_password),
            'must_change_password' => true,
        ]);

        // Revoke all tokens — applicant must log in fresh with the temp password
        $applicant->tokens()->delete();

        // Email the applicant their temporary password
        $applicant->notify(new AdminTemporaryPasswordNotification($request->temporary_password));

        return response()->json(['message' => 'Temporary password set and emailed to the applicant.']);
    }

    // ── Update status: active | suspended ────────────────────────────────────

    public function updateStatus(Request $request, int $id)
    {
        $request->validate([
            'status' => 'required|in:active,suspended',
        ]);

        $applicant = Applicant::findOrFail($id);
        $applicant->update(['status' => $request->input('status')]);

        // Revoke all tokens on suspend
        if ($request->input('status') === 'suspended') {
            $applicant->tokens()->delete();
        }

        return response()->json([
            'message'   => 'Applicant status updated.',
            'applicant' => $applicant->fresh(),
        ]);
    }
}