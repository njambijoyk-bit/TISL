<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Throwable;

class CustomerSyncController extends Controller
{
    // ── Helper ────────────────────────────────────────────────────────────
    private function customerId(Request $request): ?int
    {
        try {
            return $request->user()?->customer?->id ?? null;
        } catch (Throwable) {
            return null;
        }
    }

    // ══════════════════════════════════════════════════════════════════════
    // CART
    // ══════════════════════════════════════════════════════════════════════

    public function getCart(Request $request)
    {
        try {
            $customerId = $this->customerId($request);
            if (!$customerId) return response()->json(['items' => []]);

            $row = DB::table('customer_carts')
                ->where('customer_id', $customerId)
                ->first();

            return response()->json([
                'items' => $row ? json_decode($row->items, true) : [],
            ]);
        } catch (Throwable) {
            return response()->json(['items' => []]);
        }
    }

    public function syncCart(Request $request)
    {
        try {
            $customerId = $this->customerId($request);
            if (!$customerId) return response()->json(['success' => false, 'reason' => 'no_customer']);

            $request->validate(['items' => 'required|array']);

            DB::table('customer_carts')->upsert(
                [
                    'customer_id' => $customerId,
                    'items'       => json_encode($request->items),
                    'updated_at'  => now(),
                ],
                ['customer_id'],
                ['items', 'updated_at']
            );

            return response()->json(['success' => true]);
        } catch (Throwable) {
            return response()->json(['success' => false]);
        }
    }

    // ══════════════════════════════════════════════════════════════════════
    // WISHLIST
    // ══════════════════════════════════════════════════════════════════════

    public function getWishlist(Request $request)
    {
        try {
            $customerId = $this->customerId($request);
            if (!$customerId) return response()->json(['ids' => []]);

            $row = DB::table('customer_wishlists')
                ->where('customer_id', $customerId)
                ->first();

            return response()->json([
                'ids' => $row ? json_decode($row->ids, true) : [],
            ]);
        } catch (Throwable) {
            return response()->json(['ids' => []]);
        }
    }

    public function syncWishlist(Request $request)
    {
        try {
            $customerId = $this->customerId($request);
            if (!$customerId) return response()->json(['success' => false, 'reason' => 'no_customer']);

            $request->validate([
                'ids'   => 'required|array',
                'ids.*' => 'integer',
            ]);

            DB::table('customer_wishlists')->upsert(
                [
                    'customer_id' => $customerId,
                    'ids'         => json_encode($request->ids),
                    'updated_at'  => now(),
                ],
                ['customer_id'],
                ['ids', 'updated_at']
            );

            return response()->json(['success' => true]);
        } catch (Throwable) {
            return response()->json(['success' => false]);
        }
    }

    // ══════════════════════════════════════════════════════════════════════
    // QUOTE LIST
    // ══════════════════════════════════════════════════════════════════════

    public function getQuoteList(Request $request)
    {
        try {
            $customerId = $this->customerId($request);
            if (!$customerId) return response()->json(['items' => []]);

            $row = DB::table('customer_quote_lists')
                ->where('customer_id', $customerId)
                ->first();

            return response()->json([
                'items' => $row ? json_decode($row->items, true) : [],
            ]);
        } catch (Throwable) {
            return response()->json(['items' => []]);
        }
    }

    public function syncQuoteList(Request $request)
    {
        try {
            $customerId = $this->customerId($request);
            if (!$customerId) return response()->json(['success' => false, 'reason' => 'no_customer']);

            $request->validate(['items' => 'required|array']);

            DB::table('customer_quote_lists')->upsert(
                [
                    'customer_id' => $customerId,
                    'items'       => json_encode($request->items),
                    'updated_at'  => now(),
                ],
                ['customer_id'],
                ['items', 'updated_at']
            );

            return response()->json(['success' => true]);
        } catch (Throwable) {
            return response()->json(['success' => false]);
        }
    }

    // ══════════════════════════════════════════════════════════════════════
    // CUSTOMER NOTE
    // ══════════════════════════════════════════════════════════════════════
 
    const NOTE_MAX_LENGTH = 2000;
 
    /**
     * GET /api/customer/note
     * Returns the customer's current note (null if cleared or never set).
     */
    public function getNote(Request $request)
    {
        try {
            $customerId = $this->customerId($request);
            if (!$customerId) return response()->json(['note' => null]);
 
            $row = DB::table('customer_notes')
                ->where('customer_id', $customerId)
                ->first();
 
            return response()->json([
                'note' => $row?->note ?? null,
            ]);
        } catch (Throwable) {
            return response()->json(['note' => null]);
        }
    }
 
    /**
     * POST /api/customer/note/sync
     * Upserts the note. Enforces 2000-char limit server-side.
     */
    public function syncNote(Request $request)
    {
        try {
            $customerId = $this->customerId($request);
            if (!$customerId) return response()->json(['success' => false, 'reason' => 'no_customer']);
 
            $request->validate([
                'note' => [
                    'required',
                    'string',
                    'max:' . self::NOTE_MAX_LENGTH,
                ],
            ]);
 
            DB::table('customer_notes')->upsert(
                [
                    'customer_id' => $customerId,
                    'note'        => $request->note,
                    'updated_at'  => now(),
                ],
                ['customer_id'],
                ['note', 'updated_at']
            );
 
            return response()->json(['success' => true]);
        } catch (Throwable) {
            return response()->json(['success' => false]);
        }
    }
 
    /**
     * DELETE /api/customer/note
     * Sets note to NULL — row is kept, customer's text is gone.
     * Admin saved snapshots are NOT touched.
     */
    public function clearNote(Request $request)
    {
        try {
            $customerId = $this->customerId($request);
            if (!$customerId) return response()->json(['success' => false, 'reason' => 'no_customer']);
 
            DB::table('customer_notes')
                ->where('customer_id', $customerId)
                ->update([
                    'note'       => null,
                    'updated_at' => now(),
                ]);
 
            return response()->json(['success' => true]);
        } catch (Throwable) {
            return response()->json(['success' => false]);
        }
    }
}