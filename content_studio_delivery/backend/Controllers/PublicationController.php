<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Publication;
use App\Models\PublicationBlock;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Illuminate\Support\Facades\DB;

class PublicationController extends Controller
{
    /**
     * PUBLIC: List publications by type
     */
    public function publicIndex(Request $request)
    {
        $type = $request->query('type');
        $query = Publication::where('status', 'published');

        if ($type) {
            $query->where('type', $type);
        }

        $publications = $query->with('authors')
            ->orderBy('published_at', 'desc')
            ->paginate(12);

        return response()->json($publications);
    }

    /**
     * PUBLIC: Show single publication by slug
     */
    public function publicShow($slug)
    {
        $publication = Publication::where('slug', $slug)
            ->where('status', 'published')
            ->with(['blocks', 'authors', 'activeComments.replies'])
            ->firstOrFail();

        return response()->json($publication);
    }

    /**
     * ADMIN: List all publications
     */
    public function index(Request $request)
    {
        $type = $request->query('type');
        $status = $request->query('status');

        $query = Publication::query();

        if ($type) $query->where('type', $type);
        if ($status) $query->where('status', $status);

        $publications = $query->with('creator')
            ->orderBy('created_at', 'desc')
            ->get();

        return response()->json($publications);
    }

    /**
     * ADMIN: Create publication
     */
    public function store(Request $request)
    {
        $request->validate([
            'type' => 'required|in:brochure,news,blog',
            'title' => 'required|string|max:255',
        ]);

        $publication = Publication::create([
            'type' => $request->type,
            'title' => $request->title,
            'slug' => Str::slug($request->title) . '-' . Str::random(5),
            'status' => 'draft',
            'created_by' => $request->user()->id,
            'template' => $request->type === 'brochure' ? 'minimal' : null,
        ]);

        return response()->json($publication, 201);
    }

    /**
     * ADMIN: Show publication for editing
     */
    public function show($id)
    {
        $publication = Publication::with(['blocks', 'authors'])->findOrFail($id);
        return response()->json($publication);
    }

    /**
     * ADMIN: Update publication metadata and blocks
     */
    public function update(Request $request, $id)
    {
        $publication = Publication::findOrFail($id);

        $request->validate([
            'title'        => 'sometimes|required|string|max:255',
            'slug'         => 'sometimes|required|string|unique:publications,slug,' . $id,
            'status'       => 'sometimes|required|in:draft,published,archived',
            'template'     => 'nullable|string',
            'style_config' => 'nullable|array',
            'tags'         => 'nullable|array',
            'blocks'       => 'nullable|array',
        ]);

        DB::transaction(function () use ($publication, $request) {
            $data = $request->only(['title', 'slug', 'status', 'cover_image', 'template', 'style_config', 'tags']);

            if (isset($data['status']) && $data['status'] === 'published' && !$publication->published_at) {
                $data['published_at'] = now();
            }

            $publication->update($data);

            if ($request->has('blocks')) {
                // Simplest approach: delete and recreate blocks to maintain order and structure
                $publication->blocks()->delete();

                foreach ($request->blocks as $index => $blockData) {
                    $publication->blocks()->create([
                        'type' => $blockData['type'],
                        'block_order' => $index,
                        'content' => $blockData['content'],
                        'style' => $blockData['style'] ?? null,
                    ]);
                }
            }
        });

        return response()->json($publication->load('blocks'));
    }

    /**
     * ADMIN: Delete publication
     */
    public function destroy($id)
    {
        $publication = Publication::findOrFail($id);
        $publication->delete();
        return response()->json(['message' => 'Publication deleted']);
    }
}
