<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreContentPageRequest;
use App\Http\Requests\UpdateContentPageRequest;
use App\Models\ContentPage;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ContentPageController extends Controller
{
    // ─────────────────────────────────────────────────────────────
    // ADMIN
    // ─────────────────────────────────────────────────────────────

    /**
     * GET /admin/content-pages
     * List all pages with section counts.
     */
    public function index(Request $request): JsonResponse
    {
        $query = ContentPage::withCount('sections');

        if ($request->filled('page_type')) {
            $query->where('page_type', $request->page_type);
        }

        if ($request->filled('is_active')) {
            $query->where('is_active', (bool) $request->is_active);
        }

        if ($request->filled('search')) {
            $search = '%' . $request->search . '%';
            $query->where(function ($q) use ($search) {
                $q->where('title', 'like', $search)
                  ->orWhere('slug', 'like', $search);
            });
        }

        $pages = $query->orderBy('page_type')->orderBy('title')->get();

        return response()->json(['data' => $pages]);
    }

    /**
     * GET /admin/content-pages/{contentPage}
     * Show a single page with all its sections.
     */
    public function show(ContentPage $contentPage): JsonResponse
    {
        $contentPage->load('sections');

        return response()->json(['data' => $contentPage]);
    }

    /**
     * POST /admin/content-pages
     * Create a new content page.
     */
    public function store(StoreContentPageRequest $request): JsonResponse
    {
        $page = ContentPage::create($request->validated());

        return response()->json([
            'message' => 'Page created successfully.',
            'data'    => $page,
        ], 201);
    }

    /**
     * PUT /admin/content-pages/{contentPage}
     * Update page metadata/settings (not sections).
     */
    public function update(UpdateContentPageRequest $request, ContentPage $contentPage): JsonResponse
    {
        $contentPage->update($request->validated());

        return response()->json([
            'message' => 'Page updated successfully.',
            'data'    => $contentPage->fresh('sections'),
        ]);
    }

    /**
     * PATCH /admin/content-pages/{contentPage}/toggle
     * Activate or deactivate a page.
     */
    public function toggle(ContentPage $contentPage): JsonResponse
    {
        $contentPage->update(['is_active' => ! $contentPage->is_active]);

        return response()->json([
            'message' => $contentPage->is_active ? 'Page activated.' : 'Page deactivated.',
            'data'    => $contentPage,
        ]);
    }

    /**
     * DELETE /admin/content-pages/{contentPage}
     * Delete a page and all its sections (CASCADE handles sections in DB).
     */
    public function destroy(ContentPage $contentPage): JsonResponse
    {
        $contentPage->delete();

        return response()->json(['message' => 'Page deleted successfully.']);
    }

    // ─────────────────────────────────────────────────────────────
    // PUBLIC
    // ─────────────────────────────────────────────────────────────

    /**
     * GET /content/{slug}
     * Public-facing: fetch an active page with only its active sections.
     */
    public function showBySlug(string $slug): JsonResponse
    {
        $page = ContentPage::active()
            ->where('slug', $slug)
            ->with('activeSections')
            ->firstOrFail();

        return response()->json(['data' => $page]);
    }

    /**
     * GET /content
     * Public: list all active pages (for footer/nav link generation).
     */
    public function publicIndex(): JsonResponse
    {
        $pages = ContentPage::active()
            ->select(['id', 'slug', 'title', 'page_type'])
            ->orderBy('page_type')
            ->get();

        return response()->json(['data' => $pages]);
    }
}