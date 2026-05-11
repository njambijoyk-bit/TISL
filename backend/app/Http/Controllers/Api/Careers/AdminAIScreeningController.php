<?php

namespace App\Http\Controllers\Api\Careers;

use App\Http\Controllers\Controller;
use App\Jobs\ScreenApplicationJob;
use App\Models\Application;
use App\Models\JobPosting;
use Illuminate\Http\Request;

class AdminAIScreeningController extends Controller
{
    /**
     * Dispatch screening for a single application.
     * Returns immediately — result is written back by the queued job.
     */
    public function screenOne(int $id)
    {
        $application = Application::with(['applicant', 'jobPosting', 'documents'])
            ->findOrFail($id);

        if ($application->hasBeenScreened()) {
            return response()->json([
                'message'    => 'Application has already been screened.',
                'screened_at'=> $application->ai_screened_at,
                'ai_score'   => $application->ai_score,
            ], 422);
        }

        ScreenApplicationJob::dispatch($application->id);

        return response()->json([
            'message' => 'Screening queued. Results will be available shortly.',
        ], 202);
    }

    /**
     * Dispatch screening for all unscreened applications on a job.
     * Hard cap at 50 per batch to avoid runaway queue floods.
     */
    public function screenBatch(Request $request, int $jobId)
    {
        $job = JobPosting::findOrFail($jobId);

        $ids = Application::forJob($jobId)
            ->unscreened()
            ->active()
            ->limit(50)
            ->pluck('id');

        if ($ids->isEmpty()) {
            return response()->json([
                'message' => 'No unscreened active applications found for this job.',
            ], 422);
        }

        foreach ($ids as $applicationId) {
            ScreenApplicationJob::dispatch($applicationId)->onQueue('screening');
        }

        return response()->json([
            'message'   => "{$ids->count()} applications queued for screening.",
            'queued_ids'=> $ids,
        ], 202);
    }

    /**
     * Re-screen a specific application (overwrite existing result).
     */
    public function rescreen(int $id)
    {
        $application = Application::findOrFail($id);

        // Clear previous result so the job starts fresh
        $application->update([
            'ai_score'          => null,
            'ai_summary'        => null,
            'ai_strengths'      => null,
            'ai_gaps'           => null,
            'ai_recommendation' => null,
            'ai_screened_at'    => null,
        ]);

        ScreenApplicationJob::dispatch($application->id);

        return response()->json([
            'message' => 'Re-screening queued.',
        ], 202);
    }
}