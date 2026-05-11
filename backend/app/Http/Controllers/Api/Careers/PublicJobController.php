<?php

namespace App\Http\Controllers\Api\Careers;

use App\Http\Controllers\Controller;
use App\Models\JobPosting;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class PublicJobController extends Controller
{
    // ── Index: public job board ───────────────────────────────────────────────
    public function index(Request $request)
    {
        // FIX: selectSub is now part of the single query that actually gets
        // paginated and returned. The original code called paginate() twice
        // on the same $query (4 DB round-trips, 2× collection in memory),
        // then built a second $query with selectSub that was never paginated
        // or returned — pure dead allocation.
        $query = JobPosting::open()
            ->select([
                'id', 'title', 'slug', 'department', 'location',
                'type', 'experience_level', 'salary_min', 'salary_max',
                'salary_currency', 'salary_visible', 'deadline', 'published_at',
            ])
            ->selectSub(
                DB::table('applications')
                    ->selectRaw('COUNT(*)')
                    ->whereColumn('job_posting_id', 'job_postings.id')
                    ->whereNull('deleted_at'),
                'applications_count'
            );

        if ($request->filled('department')) {
            $query->byDepartment($request->input('department'));
        }
        if ($request->filled('type')) {
            $query->byType($request->input('type'));
        }
        if ($request->filled('experience_level')) {
            $query->where('experience_level', $request->input('experience_level'));
        }
        if ($request->filled('search')) {
            $s = $request->input('search');
            $query->where(function ($q) use ($s) {
                $q->where('title', 'like', "%{$s}%")
                  ->orWhere('department', 'like', "%{$s}%")
                  ->orWhere('location', 'like', "%{$s}%");
            });
        }

        $query->orderBy('published_at', 'desc');

        $perPage = min((int) $request->input('per_page', 12), 24);
        $jobs = $query->paginate($perPage);
        $jobs->getCollection()->each(fn ($job) => $job->append('salary_range'));

        // FIX: Collapsed 3 separate full-table scans (one per filter column)
        // into a single query. The original code issued:
        //   JobPosting::open()->pluck('department')   -- query 1
        //   JobPosting::open()->pluck('type')         -- query 2
        //   JobPosting::open()->pluck('experience_level') -- query 3
        // Now it's one SELECT DISTINCT that fetches all three columns at once.
        $filterRows = JobPosting::open()
            ->select(['department', 'type', 'experience_level'])
            ->distinct()
            ->get();

        $filters = [
            'departments'       => $filterRows->pluck('department')->filter()->unique()->sort()->values(),
            'types'             => $filterRows->pluck('type')->filter()->unique()->sort()->values(),
            'experience_levels' => $filterRows->pluck('experience_level')->filter()->unique()->values(),
        ];

        return response()->json(['data' => $jobs, 'filters' => $filters]);
    }

    // ── Show: single job detail ───────────────────────────────────────────────
    public function show(string $slug)
    {
        // FIX: Added explicit select() so withCount() does not force a SELECT *
        // that pulls large JSON columns (description, responsibilities, etc.)
        // into memory alongside the count subquery.
        $job = JobPosting::open()
            ->select([
                'id', 'title', 'slug', 'department', 'location', 'type',
                'experience_level', 'description', 'responsibilities',
                'requirements', 'nice_to_haves', 'required_documents',
                'salary_min', 'salary_max', 'salary_currency', 'salary_visible',
                'status', 'deadline', 'published_at',
            ])
            ->withCount('applications')
            ->where('slug', $slug)
            ->firstOrFail();

        $job->append(['salary_range', 'is_open']);

        return response()->json(['data' => $job]);
    }
}