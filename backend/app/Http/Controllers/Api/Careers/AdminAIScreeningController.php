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
                'message'     => 'Already screened.',
                'screened_at' => $application->ai_screened_at,
                'ai_score'    => $application->ai_score,
            ], 422);
        }

        try {
            set_time_limit(120);
            (new ScreenApplicationJob($application->id))->handle();
        } catch (\Exception $e) {
            return response()->json(['message' => 'Screening failed: ' . $e->getMessage()], 500);
        }

        return response()->json([
            'message' => 'Screening complete.',
            'data'    => $application->fresh(),
        ]);
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

        try {
            set_time_limit(120);
            (new ScreenApplicationJob($application->id))->handle();
        } catch (\Exception $e) {
            return response()->json(['message' => 'Re-screening failed: ' . $e->getMessage()], 500);
        }

        return response()->json([
            'message' => 'Re-screening complete.',
            'data'    => $application->fresh(['applicant', 'jobPosting', 'documents', 'statusHistory']),
        ]);
    }

    /**
     * Dispatch screening for all unscreened applications on a job.
     * Hard cap at 50 per batch to avoid runaway queue floods.
     */
    public function screenBatch(Request $request, int $jobId)
    {
        $job = JobPosting::findOrFail($jobId);

        $applications = Application::forJob($jobId)
            ->unscreened()
            ->active()
            ->limit(50)
            ->with(['applicant', 'jobPosting', 'documents'])
            ->get();

        if ($applications->isEmpty()) {
            return response()->json([
                'message' => 'No unscreened active applications found for this job.',
            ], 422);
        }

        $failed = [];
        foreach ($applications as $application) {
            try {
                (new ScreenApplicationJob($application->id))->handle();
            } catch (\Exception $e) {
                $failed[] = ['id' => $application->id, 'error' => $e->getMessage()];
            }
        }

        return response()->json([
            'message' => "{$applications->count()} applications screened.",
            'count'   => $applications->count(),
        ]);
    }

}