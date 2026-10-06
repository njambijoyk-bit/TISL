<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Service;
use App\Services\ServiceVideo;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** A service's video, set on its own (a pasted link or an uploaded file), so a large upload does not travel with the rest of the service form. */
class ServiceVideoController extends Controller
{
    public function __construct(private ServiceVideo $video) {}

    /** POST /admin/services/{id}/video: either `url` (a link) or `file` (mp4 or webm, up to 100 MB). */
    public function store(Request $request, int $id): JsonResponse
    {
        $s = Service::findOrFail($id);
        $request->validate(['url' => ['nullable', 'string', 'max:500'], 'file' => ['nullable', 'file', 'mimetypes:video/mp4,video/webm', 'max:' . ServiceVideo::MAX_KB]]);
        if ($request->hasFile('file')) {
            $s = $this->video->setFile($s, $request->file('file'));
        } elseif ($request->filled('url')) {
            $s = $this->video->setLink($s, (string) $request->input('url'));
        } else {
            return response()->json(['message' => 'Choose a video file or paste a link.'], 422);
        }

        return response()->json(['message' => 'Video saved.', 'video' => $s->video, 'video_url' => $s->video_url]);
    }

    /** DELETE /admin/services/{id}/video */
    public function destroy(int $id): JsonResponse
    {
        $this->video->remove(Service::findOrFail($id));

        return response()->json(['message' => 'Video removed.']);
    }
}
