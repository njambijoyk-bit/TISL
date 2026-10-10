<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Product;
use App\Services\ServiceVideo;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** A product's video, set on its own (a pasted link or an uploaded file), so a large upload does not travel with the rest of the product form. Same rules as a service's video. */
class ProductVideoController extends Controller
{
    public function __construct(private ServiceVideo $video) {}

    /** POST /admin/products/{id}/video: either `url` (a link) or `file` (mp4 or webm, up to 100 MB). */
    public function store(Request $request, int $id): JsonResponse
    {
        $p = Product::findOrFail($id);
        $request->validate(['url' => ['nullable', 'string', 'max:500'], 'file' => ['nullable', 'file', 'mimetypes:video/mp4,video/webm', 'max:' . ServiceVideo::MAX_KB]]);
        if ($request->hasFile('file')) {
            $p = $this->video->setFile($p, $request->file('file'));
        } elseif ($request->filled('url')) {
            $p = $this->video->setLink($p, (string) $request->input('url'));
        } else {
            return response()->json(['message' => 'Choose a video file or paste a link.'], 422);
        }

        return response()->json(['message' => 'Video saved.', 'video' => $p->video]);
    }

    /** DELETE /admin/products/{id}/video */
    public function destroy(int $id): JsonResponse
    {
        $this->video->remove(Product::findOrFail($id));

        return response()->json(['message' => 'Video removed.']);
    }
}
