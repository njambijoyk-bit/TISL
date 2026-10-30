<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\Events\EventMedia;
use App\Services\Events\EventOwnerAccess;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** The media gallery of an event, organiser, vendor, venue, package or space: for its own team to manage (images, videos, embeds, documents; public or private). */
class EventMediaController extends Controller
{
    public function __construct(private EventMedia $media, private EventOwnerAccess $access)
    {
    }

    private function work(Request $request, string $type, int $id): void
    {
        abort_unless(EventMedia::ready(), 409, 'Run script 253 to turn on the media gallery.');
        abort_unless($this->access->canWork($request->user(), $type, $id), 404);   // not found, so another owner's items are not confirmed to exist
    }

    private function ownerOf(int $mediaId): object
    {
        return $this->media->find($mediaId) ?? abort(404);
    }

    public function index(Request $request, string $type, int $id): JsonResponse
    {
        $this->work($request, $type, $id);

        return response()->json(['data' => $this->media->list($type, $id, true)]);
    }

    public function upload(Request $request, string $type, int $id): JsonResponse
    {
        $this->work($request, $type, $id);
        $in = $request->validate(['file' => 'required|file', 'role' => 'nullable|in:' . implode(',', EventMedia::ROLES), 'visibility' => 'nullable|in:public,private', 'title' => 'nullable|string|max:160', 'caption' => 'nullable|string|max:300']);

        return response()->json(['data' => $this->media->addFile($type, $id, $request->file('file'), $in, $request->user()?->id)], 201);
    }

    public function embed(Request $request, string $type, int $id): JsonResponse
    {
        $this->work($request, $type, $id);
        $in = $request->validate(['url' => 'required|string|max:500', 'role' => 'nullable|in:gallery,poster,cover', 'title' => 'nullable|string|max:160', 'caption' => 'nullable|string|max:300']);

        return response()->json(['data' => $this->media->addEmbed($type, $id, $in['url'], $in, $request->user()?->id)], 201);
    }

    public function update(Request $request, int $mediaId): JsonResponse
    {
        $m = $this->ownerOf($mediaId);
        $this->work($request, $m->owner_type, (int) $m->owner_id);
        $in = $request->validate(['title' => 'nullable|string|max:160', 'caption' => 'nullable|string|max:300', 'role' => 'nullable|in:' . implode(',', EventMedia::ROLES), 'visibility' => 'nullable|in:public,private']);

        return response()->json(['data' => $this->media->update($mediaId, $in)]);
    }

    public function destroy(Request $request, int $mediaId): JsonResponse
    {
        $m = $this->ownerOf($mediaId);
        $this->work($request, $m->owner_type, (int) $m->owner_id);
        $this->media->remove($mediaId);

        return response()->json(['message' => 'Removed.']);
    }

    public function reorder(Request $request, string $type, int $id): JsonResponse
    {
        $this->work($request, $type, $id);
        $d = $request->validate(['ids' => 'required|array|max:500', 'ids.*' => 'integer']);
        $this->media->reorder($type, $id, $d['ids']);

        return response()->json(['data' => $this->media->list($type, $id, true)]);
    }

    /** A private file, for the owner's team. */
    public function download(Request $request, int $mediaId)
    {
        $m = $this->ownerOf($mediaId);
        $this->work($request, $m->owner_type, (int) $m->owner_id);

        return $this->media->download($m);
    }
}
