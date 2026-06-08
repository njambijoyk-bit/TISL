<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Customer;
use App\Models\CustomerCreditInvoice;
use App\Models\CustomerCreditSchedule;
use App\Models\CustomerCreditScheduleItem;
use App\Services\CustomerCreditService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

class CustomerCreditController extends Controller
{
    public function __construct(protected CustomerCreditService $credit) {}

    // ── Helpers ───────────────────────────────────────────────────────────────

    private function customer(string $id): Customer
    {
        return Customer::findOrFail($id);
    }

    private function admin(): int
    {
        return Auth::id();
    }

    // ─────────────────────────────────────────────────────────────────────────
    // SUMMARY
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * GET /admin/customers/{id}/credit/summary
     * Returns limit, used, available, interest rate, currency, overdue flag.
     */
    public function summary(string $id)
    {
        $customer = $this->customer($id);

        if (!$customer->has_credit_account) {
            return response()->json(['message' => 'Customer does not have a credit account.'], 404);
        }

        return response()->json($this->credit->getSummary($customer));
    }

    // ─────────────────────────────────────────────────────────────────────────
    // STATEMENT
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * GET /admin/customers/{id}/credit/statement
     * Paginated ledger. Supports ?type=&direction=&from=&to=&per_page=&page=
     */
    public function statement(Request $request, string $id)
    {
        $customer = $this->customer($id);

        $filters = $request->only(['type', 'direction', 'from', 'to']);
        $perPage = (int) $request->get('per_page', 20);

        return response()->json(
            $this->credit->getStatement($customer, $filters, $perPage)
        );
    }

    // ─────────────────────────────────────────────────────────────────────────
    // PAYMENT
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * POST /admin/customers/{id}/credit/payment
     * Record a payment — reduces credit_used.
     *
     * Body: { amount, note?, reference_type?, reference_id? }
     */
    public function recordPayment(Request $request, string $id)
    {
        $customer = $this->customer($id);

        if (!$customer->has_credit_account) {
            return response()->json(['message' => 'Customer does not have a credit account.'], 422);
        }

        $validated = $request->validate([
            'amount'         => 'required|numeric|min:0.01',
            'note'           => 'nullable|string|max:500',
            'reference_type' => 'nullable|string|max:50',
            'reference_id'   => 'nullable|integer',
        ]);

        $transaction = $this->credit->recordPayment(
            customer:      $customer,
            amount:        $validated['amount'],
            note:          $validated['note'] ?? null,
            referenceType: $validated['reference_type'] ?? 'manual',
            referenceId:   $validated['reference_id'] ?? null,
            createdBy:     $this->admin(),
        );

        return response()->json([
            'message'     => 'Payment recorded successfully.',
            'transaction' => $transaction,
            'summary'     => $this->credit->getSummary($customer->fresh()),
        ], 201);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // ADJUSTMENT
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * POST /admin/customers/{id}/credit/adjustment
     * Manual admin correction — can be a debit or credit.
     *
     * Body: { amount, direction (debit|credit), note? }
     */
    public function adjustment(Request $request, string $id)
    {
        $customer = $this->customer($id);

        if (!$customer->has_credit_account) {
            return response()->json(['message' => 'Customer does not have a credit account.'], 422);
        }

        $validated = $request->validate([
            'amount'    => 'required|numeric|min:0.01',
            'direction' => 'required|in:debit,credit',
            'note'      => 'nullable|string|max:500',
        ]);

        $transaction = $this->credit->adjustment(
            customer:  $customer,
            amount:    $validated['amount'],
            direction: $validated['direction'],
            note:      $validated['note'] ?? null,
            createdBy: $this->admin(),
        );

        return response()->json([
            'message'     => 'Adjustment applied successfully.',
            'transaction' => $transaction,
            'summary'     => $this->credit->getSummary($customer->fresh()),
        ], 201);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // INTEREST
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * POST /admin/customers/{id}/credit/interest
     * Apply interest charge based on customer's credit_interest_rate.
     *
     * Body: { note? }
     */
    public function applyInterest(Request $request, string $id)
    {
        $customer = $this->customer($id);

        if (!$customer->has_credit_account) {
            return response()->json(['message' => 'Customer does not have a credit account.'], 422);
        }

        if ($customer->credit_interest_rate <= 0) {
            return response()->json(['message' => 'Customer has no interest rate configured.'], 422);
        }

        if ($customer->credit_used <= 0) {
            return response()->json(['message' => 'No outstanding balance to apply interest to.'], 422);
        }

        $validated = $request->validate([
            'note' => 'nullable|string|max:500',
        ]);

        $transaction = $this->credit->applyInterest(
            customer:  $customer,
            note:      $validated['note'] ?? null,
            createdBy: $this->admin(),
        );

        return response()->json([
            'message'          => 'Interest applied successfully.',
            'interest_charged' => $transaction->amount,
            'transaction'      => $transaction,
            'summary'          => $this->credit->getSummary($customer->fresh()),
        ], 201);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // SCHEDULES
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * GET /admin/customers/{id}/credit/schedules
     * List all schedules for a customer. Supports ?status=
     */
    public function schedules(Request $request, string $id)
    {
        $customer = $this->customer($id);

        $query = $customer->creditSchedules()->with('items');

        if ($request->filled('status')) {
            $query->where('status', $request->status);
        }

        return response()->json(
            $query->latest()->paginate((int) $request->get('per_page', 15))
        );
    }

    /**
     * POST /admin/customers/{id}/credit/schedules
     * Create an installment schedule.
     *
     * Body: { total_amount, installments, frequency, started_at, note? }
     */
    public function createSchedule(Request $request, string $id)
    {
        $customer = $this->customer($id);

        if (!$customer->has_credit_account) {
            return response()->json(['message' => 'Customer does not have a credit account.'], 422);
        }

        $validated = $request->validate([
            'total_amount'  => 'required|numeric|min:0.01',
            'installments'  => 'required|integer|min:1|max:60',
            'frequency'     => 'required|in:weekly,biweekly,monthly',
            'started_at'    => 'required|date',
            'note'          => 'nullable|string|max:500',
        ]);

        $schedule = $this->credit->createSchedule(
            customer:  $customer,
            data:      $validated,
            createdBy: $this->admin(),
        );

        return response()->json([
            'message'  => 'Schedule created successfully.',
            'schedule' => $schedule->load('items'),
        ], 201);
    }

    /**
     * GET /admin/customers/{id}/credit/schedules/{sid}
     * Show a single schedule with all its items.
     */
    public function showSchedule(string $id, string $sid)
    {
        $schedule = CustomerCreditSchedule::where('customer_id', $id)
            ->with('items.transaction')
            ->findOrFail($sid);

        return response()->json($schedule);
    }

    /**
     * PATCH /admin/customers/{id}/credit/schedules/{sid}/cancel
     * Cancel an active schedule.
     */
    public function cancelSchedule(string $id, string $sid)
    {
        $schedule = CustomerCreditSchedule::where('customer_id', $id)
            ->findOrFail($sid);

        if ($schedule->status !== 'active') {
            return response()->json(['message' => 'Only active schedules can be cancelled.'], 422);
        }

        $schedule->update(['status' => 'cancelled']);

        return response()->json([
            'message'  => 'Schedule cancelled.',
            'schedule' => $schedule->fresh('items'),
        ]);
    }

    /**
     * PATCH /admin/customers/{id}/credit/schedules/{sid}/items/{iid}/pay
     * Mark an installment as paid — creates a payment transaction automatically.
     */
    public function payInstallment(Request $request, string $id, string $sid, string $iid)
    {
        $customer = $this->customer($id);

        $item = CustomerCreditScheduleItem::whereHas('schedule', fn($q) => $q->where('customer_id', $id))
            ->where('schedule_id', $sid)
            ->findOrFail($iid);

        if ($item->status === 'paid') {
            return response()->json(['message' => 'Installment already paid.'], 422);
        }

        $validated = $request->validate([
            'note' => 'nullable|string|max:500',
        ]);

        $item = $this->credit->markInstallmentPaid(
            customer:  $customer,
            item:      $item,
            note:      $validated['note'] ?? null,
            createdBy: $this->admin(),
        );

        return response()->json([
            'message' => 'Installment marked as paid.',
            'item'    => $item->fresh('transaction'),
            'summary' => $this->credit->getSummary($customer->fresh()),
        ]);
    }

    /**
     * PATCH /admin/customers/{id}/credit/schedules/{sid}/items/{iid}/waive
     * Waive an installment — does not create a payment transaction.
     */
    public function waiveInstallment(Request $request, string $id, string $sid, string $iid)
    {
        $item = CustomerCreditScheduleItem::whereHas('schedule', fn($q) => $q->where('customer_id', $id))
            ->where('schedule_id', $sid)
            ->findOrFail($iid);

        if (in_array($item->status, ['paid', 'waived'])) {
            return response()->json(['message' => 'Installment is already ' . $item->status . '.'], 422);
        }

        $item->update(['status' => 'waived']);

        // Check if all items are now done — auto-complete schedule
        $schedule   = $item->schedule;
        $allDone    = $schedule->items()->whereNotIn('status', ['paid', 'waived'])->doesntExist();
        if ($allDone) {
            $schedule->update(['status' => 'completed']);
        }

        return response()->json([
            'message' => 'Installment waived.',
            'item'    => $item->fresh(),
        ]);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // INVOICES
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * GET /admin/customers/{id}/credit/invoices
     * List invoices. Supports ?status=&page=&per_page=
     */
    public function invoices(Request $request, string $id)
    {
        $customer = $this->customer($id);

        $query = $customer->creditInvoices()->with('items');

        if ($request->filled('status')) {
            $query->where('status', $request->status);
        }

        return response()->json(
            $query->latest()->paginate((int) $request->get('per_page', 15))
        );
    }

    /**
     * POST /admin/customers/{id}/credit/invoices
     * Create an invoice, optionally linking existing transaction IDs.
     *
     * Body: {
     *   due_date?,
     *   note?,
     *   transaction_ids?: int[],         // link existing transactions
     *   line_items?: [{description, amount}]  // or manual line items
     * }
     */
    public function createInvoice(Request $request, string $id)
    {
        $customer = $this->customer($id);

        if (!$customer->has_credit_account) {
            return response()->json(['message' => 'Customer does not have a credit account.'], 422);
        }

        $validated = $request->validate([
            'due_date'                   => 'nullable|date',
            'note'                       => 'nullable|string|max:1000',
            'transaction_ids'            => 'nullable|array',
            'transaction_ids.*'          => 'integer|exists:customer_credit_transactions,id',
            'line_items'                 => 'nullable|array',
            'line_items.*.description'   => 'required_with:line_items|string|max:255',
            'line_items.*.amount'        => 'required_with:line_items|numeric|min:0.01',
        ]);

        if (empty($validated['transaction_ids']) && empty($validated['line_items'])) {
            return response()->json(['message' => 'Provide at least one transaction_id or line_item.'], 422);
        }

        $invoice = $this->credit->createInvoice(
            customer:  $customer,
            data:      $validated,
            createdBy: $this->admin(),
        );

        return response()->json([
            'message' => 'Invoice created successfully.',
            'invoice' => $invoice->load('items'),
        ], 201);
    }

    /**
     * GET /admin/customers/{id}/credit/invoices/{inv}
     * Show a single invoice with all line items.
     */
    public function showInvoice(string $id, string $inv)
    {
        $invoice = CustomerCreditInvoice::where('customer_id', $id)
            ->with(['items.transaction', 'customer', 'currency', 'createdBy'])
            ->findOrFail($inv);

        return response()->json($invoice);
    }

    /**
     * PATCH /admin/customers/{id}/credit/invoices/{inv}/status
     * Manually update invoice status.
     *
     * Body: { status: draft|sent|paid|overdue|void }
     */
    public function updateInvoiceStatus(Request $request, string $id, string $inv)
    {
        $invoice = CustomerCreditInvoice::where('customer_id', $id)->findOrFail($inv);

        $validated = $request->validate([
            'status' => 'required|in:draft,sent,paid,overdue,void',
        ]);

        $updates = ['status' => $validated['status']];

        // Auto-stamp paid_at when marking paid
        if ($validated['status'] === 'paid' && !$invoice->paid_at) {
            $updates['paid_at'] = now();
        }

        $invoice->update($updates);

        return response()->json([
            'message' => 'Invoice status updated.',
            'invoice' => $invoice->fresh('items'),
        ]);
    }

    /**
     * POST /admin/customers/{id}/credit/invoices/{inv}/send
     * Mark invoice as sent (and optionally fire a notification/email later).
     */
    public function sendInvoice(string $id, string $inv)
    {
        $invoice = CustomerCreditInvoice::where('customer_id', $id)->findOrFail($inv);

        if ($invoice->status === 'void') {
            return response()->json(['message' => 'Cannot send a voided invoice.'], 422);
        }

        $invoice->update([
            'status'  => 'sent',
            'sent_at' => now(),
        ]);

        // TODO: fire CreditInvoiceMail when mail is implemented

        return response()->json([
            'message' => 'Invoice marked as sent.',
            'invoice' => $invoice->fresh(),
        ]);
    }

    /**
     * GET /api/admin/credit/global-summary
     * Unified credit metrics across the entire application.
     */
    public function globalSummary()
    {
        // Add appropriate authorize checks here if needed (e.g., $this->authorize('viewAny', ...))
        return response()->json($this->credit->getGlobalSummary());
    }

    /**
     * GET /api/admin/credit/global-customers
     * Listing of all customers filterable and sortable by credit standing.
     */
    public function globalCustomers(Request $request)
    {
        $filters = $request->only(['has_credit_account', 'search', 'is_overdue', 'sort_by', 'sort_dir']);
        $perPage = min((int) $request->get('per_page', 15), 100);

        return response()->json($this->credit->getGlobalCustomers($filters, $perPage));
    }
}