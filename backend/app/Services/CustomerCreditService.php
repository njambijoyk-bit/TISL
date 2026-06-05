<?php

namespace App\Services;

use App\Models\Customer;
use App\Models\CustomerCreditInvoice;
use App\Models\CustomerCreditInvoiceItem;
use App\Models\CustomerCreditSchedule;
use App\Models\CustomerCreditScheduleItem;
use App\Models\CustomerCreditTransaction;
use Carbon\Carbon;
use Illuminate\Pagination\LengthAwarePaginator;
use Illuminate\Support\Facades\DB;

class CustomerCreditService
{
    // ─────────────────────────────────────────────────────────────────────────
    // CORE LEDGER HELPERS
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Post a debit (increases credit_used).
     * Used internally — callers use recordPayment, applyInterest, etc.
     */
    private function debit(
        Customer $customer,
        string   $type,
        float    $amount,
        ?string  $note        = null,
        ?string  $referenceType = null,
        ?int     $referenceId  = null,
        ?int     $createdBy    = null,
    ): CustomerCreditTransaction {
        return DB::transaction(function () use (
            $customer, $type, $amount, $note, $referenceType, $referenceId, $createdBy
        ) {
            $before = (float) $customer->credit_used;
            $after  = $before + $amount;

            $customer->increment('credit_used', $amount);

            return CustomerCreditTransaction::create([
                'customer_id'    => $customer->id,
                'type'           => $type,
                'direction'      => 'debit',
                'amount'         => $amount,
                'balance_before' => $before,
                'balance_after'  => $after,
                'currency_id'    => $customer->credit_currency_id,
                'reference_type' => $referenceType,
                'reference_id'   => $referenceId,
                'note'           => $note,
                'created_by'     => $createdBy,
            ]);
        });
    }

    /**
     * Post a credit (decreases credit_used, floor at 0).
     */
    private function credit(
        Customer $customer,
        string   $type,
        float    $amount,
        ?string  $note        = null,
        ?string  $referenceType = null,
        ?int     $referenceId  = null,
        ?int     $createdBy    = null,
    ): CustomerCreditTransaction {
        return DB::transaction(function () use (
            $customer, $type, $amount, $note, $referenceType, $referenceId, $createdBy
        ) {
            $before = (float) $customer->credit_used;
            $after  = max(0, $before - $amount);

            $customer->decrement('credit_used', $before - $after); // only decrement by actual applied

            return CustomerCreditTransaction::create([
                'customer_id'    => $customer->id,
                'type'           => $type,
                'direction'      => 'credit',
                'amount'         => $amount,
                'balance_before' => $before,
                'balance_after'  => $after,
                'currency_id'    => $customer->credit_currency_id,
                'reference_type' => $referenceType,
                'reference_id'   => $referenceId,
                'note'           => $note,
                'created_by'     => $createdBy,
            ]);
        });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // SUMMARY
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Return a summary array for the customer's credit account.
     */
    public function getSummary(Customer $customer): array
    {
        $limit     = (float) $customer->credit_limit;
        $used      = (float) $customer->credit_used;
        $available = max(0, $limit - $used);

        // Overdue flag: any sent invoice past its due date
        $hasOverdueInvoice = $customer->creditInvoices()
            ->where('status', 'sent')
            ->whereDate('due_date', '<', now())
            ->exists();

        // Overdue flag: any schedule item past its due date still pending
        $hasOverdueInstallment = CustomerCreditScheduleItem::whereHas(
            'schedule', fn($q) => $q->where('customer_id', $customer->id)->where('status', 'active')
        )
            ->where('status', 'pending')
            ->whereDate('due_date', '<', now())
            ->exists();

        return [
            'credit_limit'         => $limit,
            'credit_used'          => $used,
            'credit_available'     => $available,
            'utilization_pct'      => $limit > 0 ? round(($used / $limit) * 100, 1) : 0,
            'interest_rate'        => (float) $customer->credit_interest_rate,
            'currency_id'          => $customer->credit_currency_id,
            'currency'             => $customer->creditCurrency,
            'is_overdue'           => $hasOverdueInvoice || $hasOverdueInstallment,
            'has_credit_account'   => (bool) $customer->has_credit_account,
        ];
    }

    public function recordPurchase(
        Customer $customer,
        float    $amount,
        ?string  $note        = null,
        ?string  $referenceType = 'order',
        ?int     $referenceId  = null,
        ?int     $createdBy    = null,
    ): CustomerCreditTransaction {
        return $this->debit(
            customer:      $customer,
            type:          'purchase',
            amount:        $amount,
            note:          $note,
            referenceType: $referenceType,
            referenceId:   $referenceId,
            createdBy:     $createdBy,
        );
    }

    // ─────────────────────────────────────────────────────────────────────────
    // STATEMENT
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Paginated ledger for a customer.
     * $filters: type, direction, from, to
     */
    public function getStatement(
        Customer $customer,
        array    $filters = [],
        int      $perPage = 20,
    ): LengthAwarePaginator {
        $query = $customer->creditTransactions()
            ->with(['currency', 'createdBy'])
            ->latest();

        if (!empty($filters['type'])) {
            $query->where('type', $filters['type']);
        }

        if (!empty($filters['direction'])) {
            $query->where('direction', $filters['direction']);
        }

        if (!empty($filters['from'])) {
            $query->whereDate('created_at', '>=', $filters['from']);
        }

        if (!empty($filters['to'])) {
            $query->whereDate('created_at', '<=', $filters['to']);
        }

        return $query->paginate($perPage);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // PAYMENT
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Record a payment — reduces credit_used.
     */
    public function recordPayment(
        Customer $customer,
        float    $amount,
        ?string  $note        = null,
        string   $referenceType = 'manual',
        ?int     $referenceId  = null,
        ?int     $createdBy    = null,
    ): CustomerCreditTransaction {
        return $this->credit(
            customer:      $customer,
            type:          'payment',
            amount:        $amount,
            note:          $note,
            referenceType: $referenceType,
            referenceId:   $referenceId,
            createdBy:     $createdBy,
        );
    }

    // ─────────────────────────────────────────────────────────────────────────
    // ADJUSTMENT
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Manual admin adjustment — direction 'debit' or 'credit'.
     */
    public function adjustment(
        Customer $customer,
        float    $amount,
        string   $direction,
        ?string  $note      = null,
        ?int     $createdBy = null,
    ): CustomerCreditTransaction {
        if ($direction === 'debit') {
            return $this->debit(
                customer:      $customer,
                type:          'adjustment',
                amount:        $amount,
                note:          $note,
                referenceType: 'manual',
                createdBy:     $createdBy,
            );
        }

        return $this->credit(
            customer:      $customer,
            type:          'adjustment',
            amount:        $amount,
            note:          $note,
            referenceType: 'manual',
            createdBy:     $createdBy,
        );
    }

    // ─────────────────────────────────────────────────────────────────────────
    // INTEREST
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Apply interest charge — posts a debit of (credit_used × rate / 100).
     * Guards belong in the controller; service just does the math and posts.
     */
    public function applyInterest(
        Customer $customer,
        ?string  $note      = null,
        ?int     $createdBy = null,
    ): CustomerCreditTransaction {
        $interestAmount = round(
            (float) $customer->credit_used * ((float) $customer->credit_interest_rate / 100),
            2
        );

        return $this->debit(
            customer:      $customer,
            type:          'interest',
            amount:        $interestAmount,
            note:          $note ?? "Interest at {$customer->credit_interest_rate}%",
            referenceType: 'manual',
            createdBy:     $createdBy,
        );
    }

    // ─────────────────────────────────────────────────────────────────────────
    // SCHEDULES
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Create an installment schedule and generate all schedule items.
     *
     * $data keys: total_amount, installments, frequency, started_at, note
     */
    public function createSchedule(
        Customer $customer,
        array    $data,
        ?int     $createdBy = null,
    ): CustomerCreditSchedule {
        return DB::transaction(function () use ($customer, $data, $createdBy) {
            $installmentCount = (int) $data['installments'];
            $totalAmount      = (float) $data['total_amount'];
            $frequency        = $data['frequency'];
            $startedAt        = Carbon::parse($data['started_at']);

            // Even split — last item absorbs any rounding remainder
            $baseAmount = floor(($totalAmount / $installmentCount) * 100) / 100;
            $lastAmount = round($totalAmount - ($baseAmount * ($installmentCount - 1)), 2);

            $firstDue = $this->nextDueDate($startedAt, $frequency);

            $schedule = CustomerCreditSchedule::create([
                'customer_id'   => $customer->id,
                'total_amount'  => $totalAmount,
                'installments'  => $installmentCount,
                'frequency'     => $frequency,
                'started_at'    => $startedAt->toDateString(),
                'next_due_date' => $firstDue->toDateString(),
                'status'        => 'active',
                'note'          => $data['note'] ?? null,
                'created_by'    => $createdBy,
            ]);

            for ($i = 1; $i <= $installmentCount; $i++) {
                $dueDate = $this->nthDueDate($startedAt, $frequency, $i);
                $amount  = ($i === $installmentCount) ? $lastAmount : $baseAmount;

                CustomerCreditScheduleItem::create([
                    'schedule_id'        => $schedule->id,
                    'installment_number' => $i,
                    'amount'             => $amount,
                    'due_date'           => $dueDate->toDateString(),
                    'status'             => 'pending',
                ]);
            }

            return $schedule->load('items');
        });
    }

    /**
     * Mark a schedule item as paid — creates a payment transaction.
     * Also advances next_due_date and auto-completes the schedule if all done.
     */
    public function markInstallmentPaid(
        Customer               $customer,
        CustomerCreditScheduleItem $item,
        ?string                $note      = null,
        ?int                   $createdBy = null,
    ): CustomerCreditScheduleItem {
        return DB::transaction(function () use ($customer, $item, $note, $createdBy) {
            $schedule = $item->schedule;

            // Post payment transaction
            $transaction = $this->recordPayment(
                customer:      $customer,
                amount:        (float) $item->amount,
                note:          $note ?? "Installment #{$item->installment_number} of schedule #{$schedule->id}",
                referenceType: 'schedule',
                referenceId:   $schedule->id,
                createdBy:     $createdBy,
            );

            // Mark item paid
            $item->update([
                'status'         => 'paid',
                'paid_at'        => now(),
                'transaction_id' => $transaction->id,
            ]);

            // Advance next_due_date to the next pending item
            $nextItem = $schedule->items()
                ->where('status', 'pending')
                ->orderBy('due_date')
                ->first();

            if ($nextItem) {
                $schedule->update(['next_due_date' => $nextItem->due_date]);
            }

            // Auto-complete schedule if all items are done
            if ($schedule->isFullySettled()) {
                $schedule->update(['status' => 'completed', 'next_due_date' => null]);
            }

            return $item->fresh('transaction');
        });
    }

    /**
     * Mark overdue: flag pending items whose due_date is past.
     * Designed to be called from a scheduled command.
     */
    public function markOverdue(): int
    {
        return CustomerCreditScheduleItem::pending()
            ->whereDate('due_date', '<', now())
            ->update(['status' => 'overdue']);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // INVOICES
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Create an invoice from transaction IDs and/or manual line items.
     *
     * $data keys: due_date?, note?, transaction_ids?: int[], line_items?: [{description, amount}]
     */
    public function createInvoice(
        Customer $customer,
        array    $data,
        ?int     $createdBy = null,
    ): CustomerCreditInvoice {
        return DB::transaction(function () use ($customer, $data, $createdBy) {
            $lines = [];

            // Lines from linked transactions
            if (!empty($data['transaction_ids'])) {
                $transactions = CustomerCreditTransaction::whereIn('id', $data['transaction_ids'])
                    ->where('customer_id', $customer->id)
                    ->get();

                foreach ($transactions as $tx) {
                    $lines[] = [
                        'transaction_id' => $tx->id,
                        'description'    => ucfirst($tx->type) . ' — ' . $tx->created_at->format('d M Y'),
                        'amount'         => (float) $tx->amount,
                        'is_interest'    => $tx->type === 'interest',
                    ];
                }
            }

            // Manual line items
            if (!empty($data['line_items'])) {
                foreach ($data['line_items'] as $li) {
                    $lines[] = [
                        'transaction_id' => null,
                        'description'    => $li['description'],
                        'amount'         => (float) $li['amount'],
                        'is_interest'    => false,
                    ];
                }
            }

            $subtotal       = collect($lines)->where('is_interest', false)->sum('amount');
            $interestAmount = collect($lines)->where('is_interest', true)->sum('amount');
            $total          = $subtotal + $interestAmount;

            $invoice = CustomerCreditInvoice::create([
                'customer_id'     => $customer->id,
                'invoice_number'  => $this->generateInvoiceNumber(),
                'currency_id'     => $customer->credit_currency_id,
                'subtotal'        => $subtotal,
                'interest_amount' => $interestAmount,
                'total'           => $total,
                'status'          => 'draft',
                'due_date'        => $data['due_date'] ?? null,
                'note'            => $data['note'] ?? null,
                'created_by'      => $createdBy,
            ]);

            foreach ($lines as $line) {
                CustomerCreditInvoiceItem::create([
                    'invoice_id'     => $invoice->id,
                    'transaction_id' => $line['transaction_id'],
                    'description'    => $line['description'],
                    'amount'         => $line['amount'],
                ]);
            }

            return $invoice->load('items');
        });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // PRIVATE HELPERS
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Generate a unique invoice number like INV-20240601-0042.
     */
    private function generateInvoiceNumber(): string
    {
        $prefix = 'INV-' . now()->format('Ymd') . '-';
        $last   = CustomerCreditInvoice::where('invoice_number', 'like', $prefix . '%')
            ->orderByDesc('invoice_number')
            ->value('invoice_number');

        $next = $last
            ? ((int) substr($last, strlen($prefix))) + 1
            : 1;

        return $prefix . str_pad($next, 4, '0', STR_PAD_LEFT);
    }

    /**
     * First due date after a schedule start, based on frequency.
     */
    private function nextDueDate(Carbon $from, string $frequency): Carbon
    {
        return $this->nthDueDate($from, $frequency, 1);
    }

    /**
     * Nth due date from a start date.
     */
    private function nthDueDate(Carbon $from, string $frequency, int $n): Carbon
    {
        $date = $from->copy();

        return match ($frequency) {
            'weekly'   => $date->addWeeks($n),
            'biweekly' => $date->addWeeks($n * 2),
            'monthly'  => $date->addMonths($n),
            default    => $date->addMonths($n),
        };
    }
}