<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreContentSectionRequest;
use App\Http\Requests\UpdateContentSectionRequest;
use App\Models\ContentPage;
use App\Models\ContentSection;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;


class ContentSectionController extends Controller
{
    /**
     * GET /admin/content-pages/{contentPage}/sections
     * List all sections for a page ordered by sort_order.
     */
    public function index(ContentPage $contentPage): JsonResponse
    {
        return response()->json([
            'data' => $contentPage->sections,
        ]);
    }

    /**
     * POST /admin/content-pages/{contentPage}/sections
     * Add a new section to a page.
     */
    public function store(StoreContentSectionRequest $request, ContentPage $contentPage): JsonResponse
    {
        $validated = $request->validated();

        // Auto-assign sort_order to end if not provided
        if (!isset($validated['sort_order'])) {
            $validated['sort_order'] = $contentPage->sections()->max('sort_order') + 1;
        }

        $section = $contentPage->sections()->create($validated);

        return response()->json([
            'message' => 'Section created successfully.',
            'data'    => $section,
        ], 201);
    }

    /**
     * PUT /admin/content-pages/{contentPage}/sections/{section}
     * Update a section's content, items, or settings.
     */
    public function update(UpdateContentSectionRequest $request, ContentPage $contentPage, ContentSection $section): JsonResponse
    {
        $this->abortIfMismatch($contentPage, $section);

        $section->update($request->validated());

        return response()->json([
            'message' => 'Section updated successfully.',
            'data'    => $section->fresh(),
        ]);
    }

    /**
     * POST /admin/content-pages/{contentPage}/sections/reorder
     * Accepts [{ id: n, sort_order: n }, ...] and bulk-updates sort_order.
     */
    public function reorder(Request $request, ContentPage $contentPage): JsonResponse
    {
        $request->validate([
            'sections'              => 'required|array|min:1',
            'sections.*.id'         => 'required|integer|exists:content_sections,id',
            'sections.*.sort_order' => 'required|integer|min:0',
        ]);

        DB::transaction(function () use ($request, $contentPage) {
            foreach ($request->sections as $item) {
                ContentSection::where('id', $item['id'])
                    ->where('page_id', $contentPage->id)
                    ->update(['sort_order' => $item['sort_order']]);
            }
        });

        return response()->json([
            'message' => 'Sections reordered successfully.',
            'data'    => $contentPage->sections()->get(),
        ]);
    }

    /**
     * PATCH /admin/content-pages/{contentPage}/sections/{section}/toggle
     * Activate or deactivate a single section.
     */
    public function toggle(ContentPage $contentPage, ContentSection $section): JsonResponse
    {
        $this->abortIfMismatch($contentPage, $section);

        $section->update(['is_active' => ! $section->is_active]);

        return response()->json([
            'message' => $section->is_active ? 'Section activated.' : 'Section deactivated.',
            'data'    => $section,
        ]);
    }

    /**
     * DELETE /admin/content-pages/{contentPage}/sections/{section}
     * Permanently delete a section.
     */
    public function destroy(ContentPage $contentPage, ContentSection $section): JsonResponse
    {
        $this->abortIfMismatch($contentPage, $section);

        $section->delete();

        return response()->json(['message' => 'Section deleted successfully.']);
    }

    public function uploadImage(Request $request, ContentPage $contentPage): JsonResponse
    {
        $request->validate([
            'image' => 'required|image|max:4096', // 4 MB cap
        ]);

        $file      = $request->file('image');
        $filename  = Str::uuid() . '.' . $file->getClientOriginalExtension();
        $path      = $file->storeAs("content/{$contentPage->id}", $filename, 'public');

        return response()->json([
            'url' => Storage::disk('public')->url($path),
        ], 201);
    }

    // ─────────────────────────────────────────────────────────────
    // Helpers
    // ─────────────────────────────────────────────────────────────

    /**
     * Ensure the section actually belongs to the resolved page.
     * Prevents cross-page section manipulation via crafted URLs.
     */
    private function abortIfMismatch(ContentPage $page, ContentSection $section): void
    {
        if ($section->page_id !== $page->id) {
            abort(404, 'Section not found on this page.');
        }
    }
}