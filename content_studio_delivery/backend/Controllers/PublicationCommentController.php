<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Publication;
use App\Models\PublicationComment;
use Illuminate\Http\Request;

class PublicationCommentController extends Controller
{
    /**
     * PUBLIC: Submit a comment
     */
    public function store(Request $request, $publicationId)
    {
        $publication = Publication::findOrFail($publicationId);

        $request->validate([
            'body' => 'required|string|max:1000',
            'author_name' => 'nullable|required_without:user_id|string|max:100',
            'author_email' => 'nullable|required_without:user_id|email|max:255',
            'parent_id' => 'nullable|exists:publication_comments,id',
        ]);

        $comment = PublicationComment::create([
            'publication_id' => $publicationId,
            'user_id' => $request->user()?->id,
            'parent_id' => $request->parent_id,
            'author_name' => $request->author_name,
            'author_email' => $request->author_email,
            'body' => $request->body,
            'status' => 'pending', // Admins must approve
        ]);

        return response()->json(['message' => 'Comment submitted for moderation', 'comment' => $comment], 201);
    }

    /**
     * ADMIN: List comments for a publication
     */
    public function index($publicationId)
    {
        $comments = PublicationComment::where('publication_id', $publicationId)
            ->with('user')
            ->orderBy('created_at', 'desc')
            ->get();

        return response()->json($comments);
    }

    /**
     * ADMIN: Approve/Reject comment
     */
    public function updateStatus(Request $request, $id)
    {
        $request->validate(['status' => 'required|in:approved,rejected']);
        $comment = PublicationComment::findOrFail($id);
        $comment->update(['status' => $request->status]);

        return response()->json($comment);
    }

    /**
     * ADMIN: Delete comment
     */
    public function destroy($id)
    {
        $comment = PublicationComment::findOrFail($id);
        $comment->delete();
        return response()->json(['message' => 'Comment deleted']);
    }
}
