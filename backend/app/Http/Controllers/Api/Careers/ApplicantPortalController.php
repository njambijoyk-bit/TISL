<?php

namespace App\Http\Controllers\Api\Careers;

use App\Http\Controllers\Controller;
use App\Models\Application;
use App\Models\ApplicationDocument;
use App\Models\JobPosting;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\Validator;
use Illuminate\Support\Str;

class ApplicantPortalController extends Controller
{
    // ── My Applications ───────────────────────────────────────────────────────

    public function myApplications(Request $request)
    {
        $applications = $request->user()
            ->applications()
            ->with(['jobPosting:id,title,slug,department,location,type,status,deadline', 'documents'])
            ->orderBy('created_at', 'desc')
            ->get()
            ->each(fn($a) => $a->append('status_label'));

        return response()->json(['data' => $applications]);
    }

    // ── Show single application ───────────────────────────────────────────────

    public function show(Request $request, int $id)
    {
        $application = $request->user()
            ->applications()
            ->with([
                'jobPosting',
                'documents',
                'statusHistory',
            ])
            ->findOrFail($id);

        $application->append('status_label');

        // Strip admin_notes — applicant must never see internal notes
        $application->makeHidden(['admin_notes', 'ai_score', 'ai_summary', 'ai_strengths', 'ai_gaps', 'ai_recommendation']);

        return response()->json(['data' => $application]);
    }

    // ── Apply ─────────────────────────────────────────────────────────────────

    public function apply(Request $request, int $jobId)
    {
        $job = JobPosting::open()->findOrFail($jobId);

        // One application per job per applicant
        $exists = Application::where('applicant_id', $request->user()->id)
            ->where('job_posting_id', $job->id)
            ->exists();

        if ($exists) {
            return response()->json(['message' => 'You have already applied for this position.'], 409);
        }

        $validator = Validator::make($request->all(), [
            'cover_letter' => 'nullable|string|max:5000',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        $application = Application::create([
            'applicant_id'   => $request->user()->id,
            'job_posting_id' => $job->id,
            'cover_letter'   => $request->input('cover_letter'),
            'status'         => 'submitted',
        ]);

        return response()->json([
            'message' => 'Application submitted successfully.',
            'data'    => $application->load('jobPosting:id,title,slug,department'),
        ], 201);
    }

    // ── Upload Document ───────────────────────────────────────────────────────

    public function uploadDocument(Request $request, int $applicationId)
    {
        $application = $request->user()
            ->applications()
            ->findOrFail($applicationId);

        if ($application->isTerminal()) {
            return response()->json([
                'message' => 'Documents cannot be added to a closed application.',
            ], 422);
        }

        $validator = Validator::make($request->all(), [
            'document' => ['required', 'file', 'max:5120', 'mimes:pdf,doc,docx,jpg,jpeg,png'],
            'type'     => ['required', 'in:' . implode(',', ApplicationDocument::TYPES)],
        ], [
            'document.max'   => 'File size must not exceed 5 MB.',
            'document.mimes' => 'Accepted formats: PDF, Word (doc/docx), JPG, PNG.',
            'type.in'        => 'Invalid document type.',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        $file         = $request->file('document');
        $originalName = $file->getClientOriginalName();
        $mimeType     = $file->getMimeType();
        $size         = $file->getSize();

        // Laravel handles directory creation and the move
        $path = $file->storeAs(
            "careers/applications/{$applicationId}",
            Str::uuid() . '.' . $file->getClientOriginalExtension(),
            'public'
        );

        $document = ApplicationDocument::create([
            'application_id'    => $application->id,
            'type'              => $request->input('type'),
            'original_filename' => $originalName,
            'disk'              => 'public',
            'path'              => $path,
            'mime_type'         => $mimeType,
            'size_bytes'        => $size,
        ]);

        return response()->json([
            'message' => 'Document uploaded successfully.',
            'data'    => $document->append('type_label', 'size_formatted'),
        ], 201);
    }

     // ── Update Profile ────────────────────────────────────────────────────────
 
    public function updateProfile(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'first_name'          => 'sometimes|string|max:100',
            'last_name'           => 'sometimes|string|max:100',
            'phone'               => 'nullable|string|max:30',
            'linkedin_url'        => 'nullable|url|max:500',
            'portfolio_url'       => 'nullable|url|max:500',
            'current_role'        => 'nullable|string|max:150',
            'years_of_experience' => 'nullable|integer|min:0|max:60',
            'location'            => 'nullable|string|max:150',
        ]);
 
        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }
 
        $applicant = $request->user();
        $applicant->update($validator->validated());
 
        return response()->json([
            'message'   => 'Profile updated successfully.',
            'applicant' => $applicant->fresh(),
        ]);
    }

    // ── Change Password (voluntary, from profile) ─────────────────────────────
    // Requires current password. Keeps current session alive.

    public function changePasswordSelf(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'current_password' => 'required|string',
            'password'         => 'required|string|min:8|confirmed|different:current_password',
        ], [
            'password.confirmed'  => 'Passwords do not match.',
            'password.min'        => 'Password must be at least 8 characters.',
            'password.different'  => 'New password must be different from your current password.',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        $applicant = $request->user();

        if (!\Illuminate\Support\Facades\Hash::check($request->current_password, $applicant->password)) {
            return response()->json([
                'errors' => ['current_password' => ['Current password is incorrect.']],
            ], 422);
        }

        $applicant->update([
            'password' => \Illuminate\Support\Facades\Hash::make($request->password),
        ]);

        return response()->json(['message' => 'Password updated successfully.']);
    }

    // ── Withdraw ──────────────────────────────────────────────────────────────

    public function withdraw(Request $request, int $applicationId)
    {
        $application = $request->user()
            ->applications()
            ->findOrFail($applicationId);

        if ($application->isTerminal()) {
            return response()->json(['message' => 'This application is already closed.'], 422);
        }

        $application->update(['status' => 'withdrawn']);

        return response()->json(['message' => 'Application withdrawn.']);
    }
}