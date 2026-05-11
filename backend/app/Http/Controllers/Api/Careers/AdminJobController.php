<?php
namespace App\Http\Controllers\Api\Careers;

use App\Http\Controllers\Controller;
use App\Models\JobPosting;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Validator;

class AdminJobController extends Controller
{
    // ── Index ─────────────────────────────────────────────────────────────────
    public function index(Request $request)
    {
        Log::info('Memory before query: ' . round(memory_get_usage(true) / 1048576, 1) . 'MB');
        // FIX: selectSub is now part of the ONE query that actually gets
        // paginated and returned. Previously a second $query was built with
        // selectSub but never paginated — it sat in memory unused while
        // $jobs (from the first, subquery-less paginate) was returned,
        // meaning applications_count never appeared in the JSON output.
        $query = JobPosting::withTrashed()
            ->with(['createdBy:id,name,email'])
            ->select([
                'id', 'title', 'slug', 'department', 'location',
                'type', 'experience_level', 'status', 'deadline',
                'published_at', 'closed_at', 'deleted_at', 'created_at', 'created_by',
            ])
            ->selectSub(
                DB::table('applications')
                    ->selectRaw('COUNT(*)')
                    ->whereColumn('job_posting_id', 'job_postings.id')
                    ->whereNull('deleted_at'),
                'application_count'
            );

        if ($request->filled('status')) {
            $query->where('status', $request->input('status'));
        } else {
            $query->whereNull('deleted_at')->where('status', '!=', 'archived');
        }

        if ($request->boolean('trashed')) {
            $query->onlyTrashed();
        }
        if ($request->filled('department')) {
            $query->byDepartment($request->input('department'));
        }
        if ($request->filled('type')) {
            $query->byType($request->input('type'));
        }
        if ($request->filled('search')) {
            $s = $request->input('search');
            $query->where(function ($q) use ($s) {
                $q->where('title', 'like', "%{$s}%")
                  ->orWhere('department', 'like', "%{$s}%")
                  ->orWhere('location', 'like', "%{$s}%");
            });
        }

        $sortBy    = $request->input('sort_by', 'created_at');
        $sortOrder = $request->input('sort_order', 'desc');
        $allowed   = ['title', 'status', 'deadline', 'created_at', 'published_at'];
        if (in_array($sortBy, $allowed)) {
            $query->orderBy($sortBy, $sortOrder);
        }

        $perPage = min((int) $request->input('per_page', 20), 50);

        return response()->json($query->paginate($perPage));
    }

    // ── Store ─────────────────────────────────────────────────────────────────
    public function store(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'title'                => 'required|string|max:200',
            'department'           => 'nullable|string|max:100',
            'location'             => 'nullable|string|max:150',
            'type'                 => 'required|in:full_time,part_time,contract,internship,temporary',
            'experience_level'     => 'nullable|in:entry,mid,senior,lead,executive',
            'description'          => 'required|string',
            'responsibilities'     => 'nullable|array',
            'responsibilities.*'   => 'string|max:500',
            'requirements'         => 'nullable|array',
            'requirements.*'       => 'string|max:500',
            'nice_to_haves'        => 'nullable|array',
            'nice_to_haves.*'      => 'string|max:500',
            'required_documents'   => 'nullable|array',
            'required_documents.*' => 'in:cv,cover_letter,certificate,portfolio,id_document,other',
            'salary_min'           => 'nullable|numeric|min:0',
            'salary_max'           => 'nullable|numeric|min:0|gte:salary_min',
            'salary_currency'      => 'nullable|string|size:3',
            'salary_visible'       => 'boolean',
            'deadline'             => 'nullable|date|after:today',
            'status'               => 'nullable|in:draft,published',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        $data = $validator->validated();
        $data['created_by'] = $request->user()->id;
        $data['status'] = $data['status'] ?? 'draft';
        if ($data['status'] === 'published' && empty($data['published_at'])) {
            $data['published_at'] = now();
        }

        $job = JobPosting::create($data);

        return response()->json(['message' => 'Job posting created.', 'data' => $job], 201);
    }

    // ── Show ──────────────────────────────────────────────────────────────────
    public function show(int $id)
    {
        $job = JobPosting::withTrashed()
            ->with(['createdBy:id,name,email'])
            ->select([
                'id', 'title', 'slug', 'department', 'location', 'type',
                'experience_level', 'description', 'responsibilities',
                'requirements', 'nice_to_haves', 'required_documents',
                'salary_min', 'salary_max', 'salary_currency', 'salary_visible',
                'status', 'deadline', 'published_at', 'closed_at',
                'deleted_at', 'created_at', 'updated_at', 'created_by',
            ])
            ->findOrFail($id);

        $job->setAttribute('application_count', $job->applications()->count());
        $job->append(['salary_range', 'is_open', 'is_expired']);

        return response()->json(['data' => $job]);
    }

    // ── Update ────────────────────────────────────────────────────────────────
    public function update(Request $request, int $id)
    {
        $job = JobPosting::findOrFail($id);

        $validator = Validator::make($request->all(), [
            'title'                => 'sometimes|string|max:200',
            'slug'                 => 'sometimes|string|max:220|unique:job_postings,slug,' . $id,
            'department'           => 'nullable|string|max:100',
            'location'             => 'nullable|string|max:150',
            'type'                 => 'sometimes|in:full_time,part_time,contract,internship,temporary',
            'experience_level'     => 'nullable|in:entry,mid,senior,lead,executive',
            'description'          => 'sometimes|string',
            'responsibilities'     => 'nullable|array',
            'responsibilities.*'   => 'string|max:500',
            'requirements'         => 'nullable|array',
            'requirements.*'       => 'string|max:500',
            'nice_to_haves'        => 'nullable|array',
            'nice_to_haves.*'      => 'string|max:500',
            'required_documents'   => 'nullable|array',
            'required_documents.*' => 'in:cv,cover_letter,certificate,portfolio,id_document,other',
            'salary_min'           => 'nullable|numeric|min:0',
            'salary_max'           => 'nullable|numeric|min:0|gte:salary_min',
            'salary_currency'      => 'nullable|string|size:3',
            'salary_visible'       => 'boolean',
            'deadline'             => 'nullable|date',
            'status'               => 'sometimes|in:draft,published,closed,archived',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        $data = $validator->validated();

        if (isset($data['status']) && $data['status'] === 'published' && !$job->published_at) {
            $data['published_at'] = now();
        }

        $job->update($data);

        return response()->json([
            'message' => 'Job posting updated.',
            'data'    => $job->fresh(['createdBy']),
        ]);
    }

    // ── Publish ───────────────────────────────────────────────────────────────
    public function publish(int $id)
    {
        $job = JobPosting::findOrFail($id);

        if ($job->status === 'published') {
            return response()->json(['message' => 'Job is already published.'], 422);
        }

        $job->publish();

        return response()->json(['message' => 'Job published.', 'data' => $job]);
    }

    // ── Close ─────────────────────────────────────────────────────────────────
    public function close(int $id)
    {
        $job = JobPosting::findOrFail($id);

        if ($job->status === 'closed') {
            return response()->json(['message' => 'Job is already closed.'], 422);
        }

        $job->close();

        return response()->json(['message' => 'Job closed.', 'data' => $job]);
    }

    // ── Destroy (soft) ────────────────────────────────────────────────────────
    public function destroy(int $id)
    {
        $job = JobPosting::findOrFail($id);
        $job->delete();

        return response()->json(['message' => 'Job posting deleted.']);
    }

    // ── Restore ───────────────────────────────────────────────────────────────
    public function restore(int $id)
    {
        $job = JobPosting::onlyTrashed()->findOrFail($id);
        $job->restore();

        return response()->json(['message' => 'Job posting restored.', 'data' => $job]);
    }
}