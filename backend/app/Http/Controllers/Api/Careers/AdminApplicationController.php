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
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\DB;

class AdminApplicationController extends Controller
{
    // ── Index: all applications with filters ──────────────────────────────────

    public function index(Request $request)
    {
        $query = Application::with([
            'applicant:id,first_name,last_name,email,phone,current_role,years_of_experience,location',
            'jobPosting:id,title,slug,department,type',
            'documents:id,application_id,type,original_filename,mime_type,size_bytes',
        ]);

        if ($request->filled('status')) {
            $query->byStatus($request->input('status'));
        }

        if ($request->filled('job_id')) {
            $query->forJob((int) $request->input('job_id'));
        }

        if ($request->filled('department')) {
            $query->whereHas('jobPosting', fn($q) => $q->where('department', $request->input('department')));
        }

        if ($request->boolean('screened')) {
            $query->screened();
        }

        if ($request->boolean('unscreened')) {
            $query->unscreened();
        }

        if ($request->filled('ai_recommendation')) {
            $query->where('ai_recommendation', $request->input('ai_recommendation'));
        }

        if ($request->filled('search')) {
            $s = $request->input('search');
            $query->whereHas('applicant', function ($q) use ($s) {
                $q->where('first_name', 'like', "%{$s}%")
                  ->orWhere('last_name',  'like', "%{$s}%")
                  ->orWhere('email',      'like', "%{$s}%")
                  ->orWhere('phone',      'like', "%{$s}%");
            });
        }

        $sortBy    = $request->input('sort_by', 'created_at');
        $sortOrder = $request->input('sort_order', 'desc');
        $allowed   = ['created_at', 'status', 'ai_score'];
        if (in_array($sortBy, $allowed)) {
            $query->orderBy($sortBy, $sortOrder);
        }

        $applications = $query->paginate((int) $request->input('per_page', 20));
        $applications->getCollection()->each(fn($a) => $a->append('status_label'));

        return response()->json($applications);
    }

    // ── Applications for a specific job ───────────────────────────────────────

    public function byJob(Request $request, int $jobId)
    {
        $job = JobPosting::withTrashed()->findOrFail($jobId);

        $query = Application::forJob($jobId)
            ->with([
                'applicant:id,first_name,last_name,email,phone,current_role,years_of_experience,location,linkedin_url',
                'documents:id,application_id,type,original_filename,size_bytes',
            ])
            ->orderBy('created_at', 'desc');

        if ($request->filled('status')) {
            $query->byStatus($request->input('status'));
        }

        if ($request->boolean('screened')) {
            $query->screened();
        }

        $applications = $query->paginate((int) $request->input('per_page', 20));
        $applications->getCollection()->each(fn($a) => $a->append('status_label'));

        return response()->json([
            'job'  => $job->only(['id', 'title', 'slug', 'department', 'status']),
            'data' => $applications,
        ]);
    }

    // ── Show single application ───────────────────────────────────────────────

    public function show(int $id)
    {
        $application = Application::with([
            'applicant',
            'jobPosting',
            'documents',
            'statusHistory',
        ])->findOrFail($id);

        $application->append('status_label');

        // Append temporary download URLs for each document
        $application->documents->each(function (ApplicationDocument $doc) {
            $doc->append('type_label', 'size_formatted');
            $doc->download_url = $doc->getTemporaryUrl(30);
        });

        return response()->json(['data' => $application]);
    }

    // ── Update Status ─────────────────────────────────────────────────────────

    public function updateStatus(Request $request, int $id)
    {
        $application = Application::findOrFail($id);

        $validator = Validator::make($request->all(), [
            'status' => 'required|in:' . implode(',', Application::STATUSES),
            'note'   => 'nullable|string|max:1000',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        $application->setStatusBy($request->user(), $request->input('status'), $request->input('note'));

        return response()->json([
            'message' => 'Status updated.',
            'data'    => $application->fresh(['statusHistory'])->append('status_label'),
        ]);
    }

    // ── Add Admin Note ────────────────────────────────────────────────────────

    public function addNote(Request $request, int $id)
    {
        $application = Application::findOrFail($id);

        $validator = Validator::make($request->all(), [
            'note' => 'required|string|max:5000',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        $application->update(['admin_notes' => $request->input('note')]);

        return response()->json(['message' => 'Note saved.']);
    }

    // ── Stats ─────────────────────────────────────────────────────────────────
    public function stats(Request $request)
    {
        $jobId = $request->filled('job_id') ? (int) $request->input('job_id') : null;

        // ← Use raw DB query for aggregates (single query, no Eloquent overhead)
        $agg = DB::table('applications')
            ->when($jobId, fn($q) => $q->where('job_posting_id', $jobId))
            ->whereNull('deleted_at')
            ->selectRaw("
                COUNT(*) as total,
                SUM(CASE WHEN status = 'hired' THEN 1 ELSE 0 END) as hired_count,
                SUM(CASE WHEN ai_screened_at IS NOT NULL THEN 1 ELSE 0 END) as screened_count,
                SUM(CASE WHEN ai_screened_at IS NULL THEN 1 ELSE 0 END) as unscreened_count,
                AVG(CASE WHEN ai_screened_at IS NOT NULL THEN ai_score END) as avg_ai_score
            ")
            ->first();

        $total = (int) ($agg->total ?? 0);

        // ← Status breakdown: single grouped query
        $byStatus = DB::table('applications')
            ->when($jobId, fn($q) => $q->where('job_posting_id', $jobId))
            ->whereNull('deleted_at')
            ->selectRaw('status, COUNT(*) as count')
            ->groupBy('status')
            ->pluck('count', 'status');

        // ← AI recommendation breakdown
        $byRecommendation = DB::table('applications')
            ->when($jobId, fn($q) => $q->where('job_posting_id', $jobId))
            ->whereNull('deleted_at')
            ->whereNotNull('ai_recommendation')
            ->selectRaw('ai_recommendation, COUNT(*) as count')
            ->groupBy('ai_recommendation')
            ->pluck('count', 'ai_recommendation');

        // ← Top jobs: limit to 5 to reduce load
        $byJob = DB::table('applications')
            ->selectRaw('job_posting_id, COUNT(*) as count')
            ->when($jobId, fn($q) => $q->where('job_posting_id', $jobId))
            ->whereNull('deleted_at')
            ->groupBy('job_posting_id')
            ->orderByDesc('count')
            ->limit(5)
            ->get()
            ->map(fn($row) => [
                'job' => \App\Models\JobPosting::find($row->job_posting_id)?->only(['id', 'title', 'department']),
                'count' => (int) $row->count,
            ]);

        return response()->json([
            'total' => $total,
            'by_status' => $byStatus,
            'by_ai_recommendation' => $byRecommendation,
            'screened' => (int) ($agg->screened_count ?? 0),
            'unscreened' => (int) ($agg->unscreened_count ?? 0),
            'avg_ai_score' => $agg->avg_ai_score ? round($agg->avg_ai_score, 2) : null,
            'top_jobs' => $byJob,
            'conversion_rate' => $total > 0 ? round(($agg->hired_count / $total) * 100, 1) : 0,
        ]);
    }

    // ── Download Document (signed local URL handler) ──────────────────────────

    public function downloadDocument(Request $request, int $documentId)
    {
        $document = ApplicationDocument::findOrFail($documentId);

        if (!Storage::disk($document->disk)->exists($document->path)) {
            return response()->json(['message' => 'File not found.'], 404);
        }

        return Storage::disk($document->disk)->download(
            $document->path,
            $document->original_filename
        );
    }
}