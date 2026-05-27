<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Notification;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class NotificationController extends Controller
{
    private function user() { return auth()->user(); }

    /** GET /notifications */
    public function index(Request $request): JsonResponse
    {
        $query = Notification::forNotifiable($this->user())
            ->latest();

        if ($request->filter === 'unread') $query->unread();
        if ($request->filter === 'read')   $query->read();

        $notifications = $query->paginate($request->input('per_page', 15));

        return response()->json($notifications);
    }

    /** GET /notifications/unread-count */
    public function unreadCount(): JsonResponse
    {
        return response()->json([
            'count' => Notification::unreadCountFor($this->user()),
        ]);
    }

    /** POST /notifications/{id}/read */
    public function markAsRead(int $id): JsonResponse
    {
        $notification = Notification::forNotifiable($this->user())
            ->findOrFail($id);

        $notification->markAsRead();

        return response()->json(['message' => 'Marked as read']);
    }

    /** POST /notifications/mark-all-read */
    public function markAllRead(): JsonResponse
    {
        Notification::markAllAsReadFor($this->user());

        return response()->json(['message' => 'All notifications marked as read']);
    }

    /** DELETE /notifications/{id} */
    public function destroy(int $id): JsonResponse
    {
        $notification = Notification::forNotifiable($this->user())
            ->findOrFail($id);

        $notification->delete();

        return response()->json(['message' => 'Notification deleted']);
    }
}