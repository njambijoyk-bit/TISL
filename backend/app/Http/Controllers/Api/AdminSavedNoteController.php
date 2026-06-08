<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Throwable;

class AdminSavedNoteController extends Controller
{
    // ══════════════════════════════════════════════════════════════════════
    // VIEW LIVE NOTE (read customer's current scratch pad)
    // ══════════════════════════════════════════════════════════════════════

    /**
     * GET /api/admin/customers/{customerId}/note
     * Returns the customer's live note — null if cleared.
     * Admin read-only; never exposes saved snapshots here.
     */
    public function show(int $customerId)
    {
        try {
            $row = DB::table('customer_notes')
                ->where('customer_id', $customerId)
                ->first();

            return response()->json([
                'customer_id' => $customerId,
                'note'        => $row?->note ?? null,
                'updated_at'  => $row?->updated_at ?? null,
            ]);
        } catch (Throwable) {
            return response()->json(['note' => null]);
        }
    }

    // ══════════════════════════════════════════════════════════════════════
    // SAVE / FLAG A SNAPSHOT
    // ══════════════════════════════════════════════════════════════════════

    /**
     * POST /api/admin/customers/{customerId}/note/save
     * Copies the customer's current note into admin_saved_notes.
     * Fails gracefully if the note is null/empty — nothing to save.
     *
     * Body (optional):
     *   { "internal_tag": "suspicious" }
     */
    public function save(Request $request, int $customerId)
    {
        try {
            $adminId = $request->user()?->id;
            if (!$adminId) return response()->json(['success' => false, 'reason' => 'unauthenticated'], 401);

            $request->validate([
                'internal_tag' => 'nullable|string|max:100',
            ]);

            // Fetch the live note
            $row = DB::table('customer_notes')
                ->where('customer_id', $customerId)
                ->whereNotNull('note')
                ->first();

            if (!$row || !trim($row->note)) {
                return response()->json([
                    'success' => false,
                    'reason'  => 'note_empty',
                    'message' => 'Customer has no active note to save.',
                ], 422);
            }

            $savedId = DB::table('admin_saved_notes')->insertGetId([
                'customer_id'   => $customerId,
                'saved_by'      => $adminId,
                'note_snapshot' => $row->note,
                'internal_tag'  => $request->internal_tag ?? null,
                'saved_at'      => now(),
            ]);

            return response()->json([
                'success'  => true,
                'saved_id' => $savedId,
            ]);
        } catch (Throwable) {
            return response()->json(['success' => false]);
        }
    }

    // ══════════════════════════════════════════════════════════════════════
    // LIST SAVED SNAPSHOTS FOR A CUSTOMER
    // ══════════════════════════════════════════════════════════════════════

    /**
     * GET /api/admin/customers/{customerId}/note/saved
     * Returns all saved snapshots for this customer, newest first.
     * Includes who saved it and their optional tag.
     */
    public function index(int $customerId)
    {
        try {
            $snapshots = DB::table('admin_saved_notes as asn')
                ->join('users as u', 'u.id', '=', 'asn.saved_by')
                ->where('asn.customer_id', $customerId)
                ->orderByDesc('asn.saved_at')
                ->select([
                    'asn.id',
                    'asn.note_snapshot',
                    'asn.internal_tag',
                    'asn.saved_at',
                    'u.id   as admin_id',
                    'u.name as admin_name',
                ])
                ->get();

            return response()->json([
                'customer_id' => $customerId,
                'snapshots'   => $snapshots,
            ]);
        } catch (Throwable) {
            return response()->json(['snapshots' => []]);
        }
    }

    // ══════════════════════════════════════════════════════════════════════
    // DELETE A SAVED SNAPSHOT (admin only — their own record)
    // ══════════════════════════════════════════════════════════════════════

    /**
     * DELETE /api/admin/customers/{customerId}/note/saved/{snapshotId}
     * Admin can remove a snapshot they no longer need.
     * Has zero effect on the customer's live note.
     */
    public function destroy(Request $request, int $customerId, int $snapshotId)
    {
        try {
            $adminId = $request->user()?->id;
            if (!$adminId) return response()->json(['success' => false, 'reason' => 'unauthenticated'], 401);

            $deleted = DB::table('admin_saved_notes')
                ->where('id', $snapshotId)
                ->where('customer_id', $customerId) // scoped for safety
                ->delete();

            return response()->json(['success' => (bool) $deleted]);
        } catch (Throwable) {
            return response()->json(['success' => false]);
        }
    }
}