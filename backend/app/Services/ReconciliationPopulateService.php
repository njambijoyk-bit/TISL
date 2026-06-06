<?php

namespace App\Services;

use App\Models\ReconciliationSession;
use App\Models\ReconciliationLine;
use App\Models\FinancialNote;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

class ReconciliationPopulateService
{
    /**
     * Main entry point. Calls the correct ledger populator.
     */
    public function populate(ReconciliationSession $session): int
    {
        if (!$session->isOpen()) {
            throw new \Exception("Cannot populate a closed reconciliation session.");
        }

        return match($session->ledger) {
            'payments'       => $this->populatePayments($session),
            'store_credit'   => $this->populateStoreCredit($session),
            'loyalty_points' => $this->populateLoyaltyPoints($session),
            'credit_account' => $this->populateCreditAccount($session),
            'vat'            => $this->populateVat($session),
            default          => throw new \Exception("Unknown ledger: {$session->ledger}"),
        };
    }

    // ── Payments ─────────────────────────────────────────────────

    private function populatePayments(ReconciliationSession $session): int
    {
        $rows = DB::table('payments')
            ->whereBetween('payments.created_at', [
                $session->period_start->startOfDay(),
                $session->period_end->endOfDay(),
            ])
            ->whereNotIn('payments.status', ['voided', 'failed'])
            ->select([
                'payments.id',
                'payments.amount_expected',
                'payments.amount_received',
                'payments.payment_number',
                'payments.status',
                'payments.method',
                'payments.mpesa_receipt_number',
                'payments.is_partial',
                'payments.customer_id',
                'payments.order_id',
            ])
            ->get();

        // Batch-resolve customers and orders in 2 queries
        $customerMap = $this->resolveCustomers(
            $rows->pluck('customer_id')->filter()->unique()->values()->all()
        );

        $orderMap = $this->resolveOrders(
            $rows->pluck('order_id')->filter()->unique()->values()->all()
        );

        return $this->insertLines($session, 'payments', $rows, function ($row) use ($customerMap, $orderMap) {
            $order = $row->order_id ? $orderMap->get($row->order_id) : null;

            return [
                'expected_amount' => $row->amount_expected,
                'actual_amount'   => $row->amount_received,
                'meta'            => [
                    'payment_number'    => $row->payment_number       ?? null,
                    'payment_status'    => $row->status               ?? null,
                    'payment_reference' => $row->mpesa_receipt_number ?? null,
                    'method'            => $row->method               ?? null,
                    'is_partial'        => (bool) $row->is_partial,
                    'customer_id'       => $row->customer_id          ?? null,
                    'customer_name'     => $row->customer_id ? ($customerMap->get($row->customer_id) ?? null) : null,
                    'order_id'          => $row->order_id             ?? null,
                    'order_number'      => $order?->order_number      ?? null,
                ],
            ];
        });
    }

    private function populateVat(ReconciliationSession $session): int
    {
        // ── Regular orders ────────────────────────────────────────
        $orders = DB::table('orders')
            ->whereBetween('orders.created_at', [
                $session->period_start->startOfDay(),
                $session->period_end->endOfDay(),
            ])
            ->whereNull('orders.deleted_at')
            ->select([
                'orders.id',
                'orders.order_number',
                'orders.customer_id',
                'orders.currency',
                'orders.subtotal_kes',
                'orders.total_kes',
                'orders.tax',
                'orders.snapshot_tax_kes',
                'orders.exchange_rate_to_kes',
                'orders.payment_status',
                'orders.status',
            ])
            ->get();

        $customerMap = $this->resolveCustomers(
            $orders->pluck('customer_id')->filter()->unique()->values()->all()
        );

        $count = $this->insertLines($session, 'orders', $orders, function ($row) use ($customerMap) {
            $isKes     = strtoupper($row->currency) === 'KES';
            $taxAmount = $isKes ? $row->tax : $row->snapshot_tax_kes;
            $isExempt  = is_null($row->tax) || (float) $row->tax === 0.0;

            $meta = [
                'order_number'   => $row->order_number,
                'customer_name'  => $customerMap->get($row->customer_id) ?? null,
                'currency'       => $row->currency,
                'subtotal_kes'   => $row->subtotal_kes,
                'total_kes'      => $row->total_kes,
                'tax'            => $row->tax,
                'payment_status' => $row->payment_status,
                'order_status'   => $row->status,
                'is_exempt'      => $isExempt,
                'source'         => 'order',
            ];

            if (!$isKes) {
                $meta['snapshot_tax_kes']     = $row->snapshot_tax_kes;
                $meta['exchange_rate_to_kes'] = $row->exchange_rate_to_kes;
            }

            return [
                'expected_amount' => $isExempt ? 0.00 : $taxAmount,
                'actual_amount'   => null,
                'meta'            => $meta,
            ];
        });

        // ── Auction orders ────────────────────────────────────────
        $auctionOrders = DB::table('auction_orders')
            ->whereBetween('auction_orders.created_at', [
                $session->period_start->startOfDay(),
                $session->period_end->endOfDay(),
            ])
            ->whereNull('auction_orders.deleted_at')
            ->select([
                'auction_orders.id',
                'auction_orders.order_number',
                'auction_orders.customer_id',
                'auction_orders.currency',
                'auction_orders.subtotal_kes',
                'auction_orders.total_kes',
                'auction_orders.tax',
                'auction_orders.tax_kes',
                'auction_orders.exchange_rate_to_kes',
                'auction_orders.payment_status',
                'auction_orders.status',
            ])
            ->get();

        $auctionCustomerMap = $this->resolveCustomers(
            $auctionOrders->pluck('customer_id')->filter()->unique()->values()->all()
        );

        $count += $this->insertLines($session, 'auction_orders', $auctionOrders, function ($row) use ($auctionCustomerMap) {
            $isExempt  = is_null($row->tax) || (float) $row->tax === 0.0;
            // auction_orders always has tax_kes pre-computed
            $taxAmount = $row->tax_kes;

            $meta = [
                'order_number'   => $row->order_number,
                'customer_name'  => $auctionCustomerMap->get($row->customer_id) ?? null,
                'currency'       => $row->currency,
                'subtotal_kes'   => $row->subtotal_kes,
                'total_kes'      => $row->total_kes,
                'tax'            => $row->tax,
                'tax_kes'        => $row->tax_kes,
                'payment_status' => $row->payment_status,
                'order_status'   => $row->status,
                'is_exempt'      => $isExempt,
                'source'         => 'auction_order',
            ];

            if (strtoupper($row->currency) !== 'KES') {
                $meta['exchange_rate_to_kes'] = $row->exchange_rate_to_kes;
            }

            return [
                'expected_amount' => $isExempt ? 0.00 : $taxAmount,
                'actual_amount'   => null,
                'meta'            => $meta,
            ];
        });

        return $count;
    }

    // ── Store Credit ─────────────────────────────────────────────

    private function populateStoreCredit(ReconciliationSession $session): int
    {
        $rows = DB::table('store_credit_transactions')
            ->whereBetween('created_at', [
                $session->period_start->startOfDay(),
                $session->period_end->endOfDay(),
            ])
            ->select([
                'id',
                'customer_id',
                'amount',
                'balance_after',
                'type',
                'reference_type',
                'reference_id',
                'note',
                'created_by',
                'expires_at',
            ])
            ->get();

        $customerMap = $this->resolveCustomers(
            $rows->pluck('customer_id')->filter()->unique()->values()->all()
        );

        $orderIds = $rows
            ->filter(fn($r) => $this->isOrderReference($r->reference_type))
            ->pluck('reference_id')->filter()->unique()->values()->all();

        $orderMap = $this->resolveOrders($orderIds);

        return $this->insertLines($session, 'store_credit_transactions', $rows, function ($row) use ($customerMap, $orderMap) {
            $isOrder = $this->isOrderReference($row->reference_type);
            $order   = ($isOrder && $row->reference_id) ? $orderMap->get($row->reference_id) : null;

            return [
                'expected_amount' => $row->amount,
                'actual_amount'   => null,
                'meta'            => [
                    'type'           => $row->type           ?? null,
                    'balance_after'  => $row->balance_after  ?? null,
                    'customer_id'    => $row->customer_id    ?? null,
                    'customer_name'  => $row->customer_id ? ($customerMap->get($row->customer_id) ?? null) : null,
                    'reference_type' => $row->reference_type ?? null,
                    'reference_id'   => $row->reference_id   ?? null,
                    'order_number'   => $order?->order_number ?? null,
                    'note'           => $row->note            ?? null,
                    'created_by'     => $row->created_by     ?? null,
                    'expires_at'     => $row->expires_at     ?? null,
                ],
            ];
        });
    }

    // ── Loyalty Points ───────────────────────────────────────────

    private function populateLoyaltyPoints(ReconciliationSession $session): int
    {
        $rows = DB::table('loyalty_point_transactions')
            ->whereBetween('created_at', [
                $session->period_start->startOfDay(),
                $session->period_end->endOfDay(),
            ])
            ->select([
                'id',
                'customer_id',
                'points',
                'balance_after',
                'type',
                'point_type',
                'reference_type',
                'reference_id',
                'note',
                'created_by',
                'expires_at',
            ])
            ->get();

        $customerMap = $this->resolveCustomers(
            $rows->pluck('customer_id')->filter()->unique()->values()->all()
        );

        $orderIds = $rows
            ->filter(fn($r) => $this->isOrderReference($r->reference_type))
            ->pluck('reference_id')->filter()->unique()->values()->all();

        $orderMap = $this->resolveOrders($orderIds);

        return $this->insertLines($session, 'loyalty_point_transactions', $rows, function ($row) use ($customerMap, $orderMap) {
            $isOrder = $this->isOrderReference($row->reference_type);
            $order   = ($isOrder && $row->reference_id) ? $orderMap->get($row->reference_id) : null;

            return [
                'expected_amount' => $row->points,
                'actual_amount'   => null,
                'meta'            => [
                    'type'           => $row->type           ?? null,
                    'point_type'     => $row->point_type     ?? null,
                    'balance_after'  => $row->balance_after  ?? null,
                    'customer_id'    => $row->customer_id    ?? null,
                    'customer_name'  => $row->customer_id ? ($customerMap->get($row->customer_id) ?? null) : null,
                    'reference_type' => $row->reference_type ?? null,
                    'reference_id'   => $row->reference_id   ?? null,
                    'order_number'   => $order?->order_number ?? null,
                    'note'           => $row->note            ?? null,
                    'created_by'     => $row->created_by     ?? null,
                    'expires_at'     => $row->expires_at     ?? null,
                ],
            ];
        });
    }

    // ── Credit Account ───────────────────────────────────────────

    private function populateCreditAccount(ReconciliationSession $session): int
    {
        $rows = DB::table('customer_credit_transactions')
            ->whereBetween('created_at', [
                $session->period_start->startOfDay(),
                $session->period_end->endOfDay(),
            ])
            ->select([
                'id',
                'customer_id',
                'amount',
                'direction',
                'type',
                'balance_before',
                'balance_after',
                'reference_type',
                'reference_id',
                'note',
                'created_by',
            ])
            ->get();

        $customerMap = $this->resolveCustomers(
            $rows->pluck('customer_id')->filter()->unique()->values()->all()
        );

        $orderIds = $rows
            ->filter(fn($r) => $this->isOrderReference($r->reference_type))
            ->pluck('reference_id')->filter()->unique()->values()->all();

        $orderMap = $this->resolveOrders($orderIds);

        return $this->insertLines($session, 'customer_credit_transactions', $rows, function ($row) use ($customerMap, $orderMap) {
            $isOrder = $this->isOrderReference($row->reference_type);
            $order   = ($isOrder && $row->reference_id) ? $orderMap->get($row->reference_id) : null;

            return [
                'expected_amount' => $row->amount,
                'actual_amount'   => null,
                'meta'            => [
                    'type'           => $row->type           ?? null,
                    'direction'      => $row->direction      ?? null,
                    'balance_before' => $row->balance_before ?? null,
                    'balance_after'  => $row->balance_after  ?? null,
                    'customer_id'    => $row->customer_id    ?? null,
                    'customer_name'  => $row->customer_id ? ($customerMap->get($row->customer_id) ?? null) : null,
                    'reference_type' => $row->reference_type ?? null,
                    'reference_id'   => $row->reference_id   ?? null,
                    'order_number'   => $order?->order_number ?? null,
                    'note'           => $row->note            ?? null,
                    'created_by'     => $row->created_by     ?? null,
                ],
            ];
        });
    }

    // ── Lookup Helpers ────────────────────────────────────────────

    /**
     * Bulk-resolve user names by ID.
     * Returns a Collection keyed by user id → name.
     */
    private function resolveCustomers(array $ids): Collection
    {
        if (empty($ids)) return collect();

        return DB::table('customers')
            ->whereIn('id', $ids)
            ->select(['id', 'first_name', 'last_name'])
            ->get()
            ->mapWithKeys(fn($c) => [$c->id => trim("{$c->first_name} {$c->last_name}")]);
    }

    /**
     * Bulk-resolve orders by ID.
     * Returns a Collection keyed by order id → stdClass { id, order_number, customer_id }.
     */
    private function resolveOrders(array $ids): Collection
    {
        if (empty($ids)) return collect();

        return DB::table('orders')
            ->whereIn('id', $ids)
            ->select(['id', 'order_number', 'customer_id'])
            ->get()
            ->keyBy('id');
    }

    /**
     * Checks whether a reference_type string points to the Order model.
     * Handles full class names (App\Models\Order), short names (order, orders), etc.
     */
    private function isOrderReference(?string $referenceType): bool
    {
        if (!$referenceType) return false;
        return str_contains(strtolower($referenceType), 'order');
    }

    // ── Shared Insert Logic ───────────────────────────────────────

    /**
     * Loops rows, resolves any linked financial note, inserts lines.
     * Skips rows already in this session (safe to re-populate).
     * Returns count of newly inserted lines.
     *
     * $amountResolver must return:
     *   ['expected_amount' => ..., 'actual_amount' => ..., 'meta' => array|null]
     */
    private function insertLines(
        ReconciliationSession $session,
        string $table,
        Collection $rows,
        callable $amountResolver
    ): int {
        $existingSubjectIds = ReconciliationLine::where('session_id', $session->id)
            ->where('subject_table', $table)
            ->pluck('subject_id')
            ->flip();

        // Pull all financial notes for this table in the period once
        $noteMap = FinancialNote::where('subject_table', $table)
            ->whereBetween('created_at', [
                $session->period_start->startOfDay(),
                $session->period_end->endOfDay(),
            ])
            ->get()
            ->keyBy('subject_id');

        $toInsert = [];
        $now      = now();

        foreach ($rows as $row) {
            if (isset($existingSubjectIds[$row->id])) continue;

            $resolved = $amountResolver($row);

            $toInsert[] = [
                'session_id'        => $session->id,
                'subject_table'     => $table,
                'subject_id'        => $row->id,
                'financial_note_id' => $noteMap->get($row->id)?->id,
                'meta'              => isset($resolved['meta']) && $resolved['meta'] !== null
                                            ? json_encode($resolved['meta'])
                                            : null,
                'expected_amount'   => $resolved['expected_amount'],
                'actual_amount'     => $resolved['actual_amount'],
                'status'            => 'pending',
                'reviewed_by'       => null,
                'reviewed_at'       => null,
                'dispute_note'      => null,
                'resolution_note'   => null,
                'created_at'        => $now,
                'updated_at'        => $now,
            ];
        }

        if (empty($toInsert)) return 0;

        foreach (array_chunk($toInsert, 500) as $chunk) {
            ReconciliationLine::insert($chunk);
        }

        return count($toInsert);
    }
}