<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Booking;
use App\Models\BookingWorksheet;
use App\Models\Currency;
use App\Models\Product;
use App\Models\WorksheetItem;
use App\Http\Controllers\Api\Traits\LogsBookingActivity;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class BookingWorksheetController extends Controller
{
    use LogsBookingActivity;

    /**
     * POST /admin/bookings/{id}/worksheets
     */
    public function store(Request $request, int $id): JsonResponse
    {
        $booking = Booking::findOrFail($id);

        $validated = $request->validate([
            'currency_code' => 'required|string|max:10|exists:currencies,code',
            'findings'      => 'nullable|string',
            'hours_worked'  => 'nullable|numeric|min:0',
            'labour_cost'   => 'nullable|numeric|min:0',
            'admin_notes'   => 'nullable|string',
        ]);

        // Snapshot exchange rate at creation time
        $rate = 1.0;
        if ($validated['currency_code'] !== 'KES') {
            try { $rate = Currency::rateToKes($validated['currency_code']); }
            catch (\Exception) { $rate = 1.0; }
        }

        $worksheet = BookingWorksheet::create(array_merge($validated, [
            'booking_id'          => $booking->id,
            'filled_by'           => auth()->id(),
            'exchange_rate_to_kes'=> $rate,
            'status'              => 'draft',
        ]));

        $this->logWorksheetCreated($booking->id, $worksheet->id);

        return response()->json([
            'message'   => 'Worksheet created.',
            'worksheet' => $worksheet->load('filledBy:id,name'),
        ], 201);
    }

    /**
     * GET /admin/bookings/{id}/worksheets/{wsId}
     */
    public function show(int $id, int $wsId): JsonResponse
    {
        $worksheet = BookingWorksheet::where('booking_id', $id)
            ->with(['filledBy:id,name', 'approvedBy:id,name', 'items.product', 'currency'])
            ->findOrFail($wsId);

        return response()->json(['worksheet' => $worksheet]);
    }

    /**
     * PUT /admin/bookings/{id}/worksheets/{wsId}
     */
    public function update(Request $request, int $id, int $wsId): JsonResponse
    {
        $worksheet = BookingWorksheet::where('booking_id', $id)->findOrFail($wsId);

        if (!$worksheet->isDraft()) {
            return response()->json(['message' => 'Only draft worksheets can be edited.'], 422);
        }

        $validated = $request->validate([
            'currency_code' => 'sometimes|string|max:10|exists:currencies,code',
            'findings'      => 'nullable|string',
            'hours_worked'  => 'nullable|numeric|min:0',
            'labour_cost'   => 'nullable|numeric|min:0',
            'admin_notes'   => 'nullable|string',
        ]);

        // Re-snapshot rate if currency changes
        if (isset($validated['currency_code']) && $validated['currency_code'] !== $worksheet->currency_code) {
            try {
                $validated['exchange_rate_to_kes'] = Currency::rateToKes($validated['currency_code']);
            } catch (\Exception) {}
        }

        $worksheet->update($validated);

        // Recalc all item KES values if rate changed
        if (isset($validated['exchange_rate_to_kes'])) {
            $worksheet->items()->each(fn($item) => $item->recalcLines($validated['exchange_rate_to_kes']));
        }

        $worksheet->recalcTotals();

        return response()->json(['message' => 'Worksheet updated.', 'worksheet' => $worksheet->fresh()->load('items.product')]);
    }

    /**
     * POST /admin/bookings/{id}/worksheets/{wsId}/submit
     */
    public function submit(int $id, int $wsId): JsonResponse
    {
        $worksheet = BookingWorksheet::where('booking_id', $id)->findOrFail($wsId);

        if (!$worksheet->isDraft()) {
            return response()->json(['message' => 'Only draft worksheets can be submitted.'], 422);
        }

        $worksheet->recalcTotals();
        $worksheet->update(['status' => 'submitted', 'submitted_at' => now()]);

        $this->logWorksheetSubmitted($id, $wsId);

        return response()->json(['message' => 'Worksheet submitted for approval.', 'worksheet' => $worksheet->fresh()]);
    }

    /**
     * POST /admin/bookings/{id}/worksheets/{wsId}/approve
     */
    public function approve(int $id, int $wsId): JsonResponse
    {
        $worksheet = BookingWorksheet::where('booking_id', $id)->findOrFail($wsId);

        if (!$worksheet->isSubmitted()) {
            return response()->json(['message' => 'Only submitted worksheets can be approved.'], 422);
        }

        $worksheet->update([
            'status'      => 'approved',
            'approved_by' => auth()->id(),
            'approved_at' => now(),
        ]);

        $this->logWorksheetApproved($id, $wsId);

        return response()->json(['message' => 'Worksheet approved.', 'worksheet' => $worksheet->fresh()->load('approvedBy:id,name')]);
    }

    /**
     * POST /admin/bookings/{id}/worksheets/{wsId}/reject
     */
    public function reject(Request $request, int $id, int $wsId): JsonResponse
    {
        $request->validate(['reason' => 'required|string|max:1000']);

        $worksheet = BookingWorksheet::where('booking_id', $id)->findOrFail($wsId);

        if (!$worksheet->isSubmitted()) {
            return response()->json(['message' => 'Only submitted worksheets can be rejected.'], 422);
        }

        $worksheet->update([
            'status'          => 'draft',   // send back to draft for correction
            'rejected_reason' => $request->reason,
        ]);

        $this->logWorksheetRejected($id, $wsId, $request->reason);

        return response()->json(['message' => 'Worksheet rejected and returned to draft.', 'worksheet' => $worksheet->fresh()]);
    }

    /**
     * GET /admin/bookings/{id}/worksheets/{wsId}/export
     * CSV export of worksheet items + summary.
     */
    public function exportCsv(int $id, int $wsId): \Symfony\Component\HttpFoundation\StreamedResponse
    {
        $worksheet = BookingWorksheet::where('booking_id', $id)
            ->with(['items.product', 'filledBy:id,name', 'booking.customer'])
            ->findOrFail($wsId);

        $filename = 'worksheet-' . $wsId . '-booking-' . $id . '.csv';

        $worksheet->update(['exported_at' => now()]);

        return response()->streamDownload(function () use ($worksheet) {
            $handle = fopen('php://output', 'w');

            // Header rows
            fputcsv($handle, ['Booking', $worksheet->booking?->booking_number]);
            fputcsv($handle, ['Customer', $worksheet->booking?->customer?->first_name . ' ' . $worksheet->booking?->customer?->last_name]);
            fputcsv($handle, ['Filled By', $worksheet->filledBy?->name]);
            fputcsv($handle, ['Currency', $worksheet->currency_code, 'Rate to KES', $worksheet->exchange_rate_to_kes]);
            fputcsv($handle, ['Status', $worksheet->status]);
            fputcsv($handle, ['Findings', $worksheet->findings]);
            fputcsv($handle, []);

            // Items header
            fputcsv($handle, ['#', 'Name', 'SKU', 'Source', 'Qty', 'UoM', 'Unit Price', 'Line Total', 'Line Total KES', 'Notes']);

            foreach ($worksheet->items()->orderBy('sort_order')->get() as $i => $item) {
                fputcsv($handle, [
                    $i + 1,
                    $item->name,
                    $item->sku ?? '',
                    $item->source,
                    $item->quantity,
                    $item->unit_of_measure,
                    $item->unit_price,
                    $item->line_total,
                    $item->line_total_kes,
                    $item->notes ?? '',
                ]);
            }

            fputcsv($handle, []);
            fputcsv($handle, ['', '', '', '', '', 'Total Materials', $worksheet->total_materials, '', $worksheet->total_materials_kes]);
            fputcsv($handle, ['', '', '', '', '', 'Labour Cost', $worksheet->labour_cost, '', $worksheet->labour_cost_kes]);
            fputcsv($handle, ['', '', '', '', '', 'Grand Total', $worksheet->grand_total, '', $worksheet->grand_total_kes]);

            fclose($handle);
        }, $filename, ['Content-Type' => 'text/csv']);
    }

    // ════════════════════════════════════════════════════════════════════════
    // WORKSHEET ITEMS
    // ════════════════════════════════════════════════════════════════════════

    /**
     * POST /admin/bookings/{id}/worksheets/{wsId}/items
     */
    public function addItem(Request $request, int $id, int $wsId): JsonResponse
    {
        $worksheet = BookingWorksheet::where('booking_id', $id)->findOrFail($wsId);

        if (!$worksheet->isDraft()) {
            return response()->json(['message' => 'Items can only be added to draft worksheets.'], 422);
        }

        $validated = $request->validate([
            'source'         => 'required|in:system,manual',
            'product_id'     => 'required_if:source,system|nullable|exists:products,id',
            'name'           => 'required_if:source,manual|nullable|string|max:255',
            'sku'            => 'nullable|string|max:100',
            'quantity'       => 'required|numeric|min:0.01',
            'unit_of_measure'=> 'required|string|max:50',
            'unit_price'     => 'required|numeric|min:0',
            'notes'          => 'nullable|string',
        ]);

        $rate      = (float) ($worksheet->exchange_rate_to_kes ?? 1.0);
        $lineTotal = round((float) $validated['quantity'] * (float) $validated['unit_price'], 2);

        $itemData = [
            'worksheet_id'    => $worksheet->id,
            'source'          => $validated['source'],
            'quantity'        => $validated['quantity'],
            'unit_of_measure' => $validated['unit_of_measure'],
            'unit_price'      => $validated['unit_price'],
            'unit_price_kes'  => round((float) $validated['unit_price'] * $rate, 2),
            'line_total'      => $lineTotal,
            'line_total_kes'  => round($lineTotal * $rate, 2),
            'notes'           => $validated['notes'] ?? null,
            'sort_order'      => WorksheetItem::where('worksheet_id', $worksheet->id)->max('sort_order') + 1,
        ];

        if ($validated['source'] === 'system') {
            $product = Product::findOrFail($validated['product_id']);
            $originalPrice = (float) $product->price;
            $isPriceOverridden = abs((float)$validated['unit_price'] - $originalPrice) > 0.001;

            $itemData = array_merge($itemData, [
                'product_id'       => $product->id,
                'name'             => $product->name,
                'sku'              => $product->sku,
                'price_overridden' => $isPriceOverridden,
                'original_price'   => $isPriceOverridden ? $originalPrice : null,
            ]);
        } else {
            $itemData = array_merge($itemData, [
                'name'             => $validated['name'],
                'sku'              => $validated['sku'] ?? null,
                'price_overridden' => false,
            ]);
        }

        $item = WorksheetItem::create($itemData);
        $worksheet->recalcTotals();

        $this->logItemAdded($id, $wsId, $item->toArray());

        return response()->json([
            'message' => 'Item added.',
            'item'    => $item->load('product:id,name,sku'),
            'totals'  => $worksheet->fresh()->only(['total_materials', 'total_materials_kes', 'grand_total', 'grand_total_kes']),
        ], 201);
    }

    /**
     * PUT /admin/bookings/{id}/worksheets/{wsId}/items/{itemId}
     */
    public function updateItem(Request $request, int $id, int $wsId, int $itemId): JsonResponse
    {
        $worksheet = BookingWorksheet::where('booking_id', $id)->findOrFail($wsId);

        if (!$worksheet->isDraft()) {
            return response()->json(['message' => 'Items can only be edited on draft worksheets.'], 422);
        }

        $item = WorksheetItem::where('worksheet_id', $wsId)->findOrFail($itemId);

        $validated = $request->validate([
            'quantity'        => 'sometimes|numeric|min:0.01',
            'unit_of_measure' => 'sometimes|string|max:50',
            'unit_price'      => 'sometimes|numeric|min:0',
            'name'            => 'sometimes|string|max:255',
            'notes'           => 'nullable|string',
        ]);

        // Track if price was overridden from original system price
        if (isset($validated['unit_price']) && $item->isFromSystem() && $item->original_price === null) {
            $product = $item->product;
            if ($product && abs((float)$validated['unit_price'] - (float)$product->price) > 0.001) {
                $validated['price_overridden'] = true;
                $validated['original_price']   = (float) $product->price;
            }
        }

        $item->update($validated);
        $item->recalcLines((float) $worksheet->exchange_rate_to_kes);
        $worksheet->recalcTotals();

        return response()->json([
            'message' => 'Item updated.',
            'item'    => $item->fresh(),
            'totals'  => $worksheet->fresh()->only(['total_materials', 'total_materials_kes', 'grand_total', 'grand_total_kes']),
        ]);
    }

    /**
     * DELETE /admin/bookings/{id}/worksheets/{wsId}/items/{itemId}
     */
    public function removeItem(int $id, int $wsId, int $itemId): JsonResponse
    {
        $worksheet = BookingWorksheet::where('booking_id', $id)->findOrFail($wsId);

        if (!$worksheet->isDraft()) {
            return response()->json(['message' => 'Items can only be removed from draft worksheets.'], 422);
        }

        $item = WorksheetItem::where('worksheet_id', $wsId)->findOrFail($itemId);
        $snapshot = $item->toArray();
        $item->delete();

        $worksheet->recalcTotals();
        $this->logItemRemoved($id, $wsId, $snapshot);

        return response()->json([
            'message' => 'Item removed.',
            'totals'  => $worksheet->fresh()->only(['total_materials', 'total_materials_kes', 'grand_total', 'grand_total_kes']),
        ]);
    }

    /**
     * POST /admin/bookings/{id}/worksheets/{wsId}/items/reorder
     * Body: { "order": [3, 1, 4, 2] }  — array of item IDs in desired order
     */
    public function reorderItems(Request $request, int $id, int $wsId): JsonResponse
    {
        $request->validate(['order' => 'required|array', 'order.*' => 'integer']);

        $worksheet = BookingWorksheet::where('booking_id', $id)->findOrFail($wsId);

        foreach ($request->order as $position => $itemId) {
            WorksheetItem::where('worksheet_id', $wsId)
                ->where('id', $itemId)
                ->update(['sort_order' => $position + 1]);
        }

        return response()->json([
            'message' => 'Items reordered.',
            'items'   => $worksheet->items()->orderBy('sort_order')->get(),
        ]);
    }
}