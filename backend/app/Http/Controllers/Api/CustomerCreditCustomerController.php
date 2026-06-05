<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\CustomerCreditInvoice;
use App\Models\CustomerCreditSchedule;
use App\Services\CustomerCreditService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

class CustomerCreditCustomerController extends Controller
{
    public function __construct(protected CustomerCreditService $credit) {}

    // ── Helper — resolve customer from the authenticated user ─────────────────

    private function resolveCustomer()
    {
        $customer = Auth::user()->customer;

        if (!$customer) {
            abort(404, 'Customer profile not found.');
        }

        if (!$customer->has_credit_account) {
            abort(404, 'You do not have a credit account.');
        }

        return $customer;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // SUMMARY
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * GET /customer/credit/summary
     */
    public function summary()
    {
        $customer = $this->resolveCustomer();

        return response()->json($this->credit->getSummary($customer));
    }

    // ─────────────────────────────────────────────────────────────────────────
    // STATEMENT
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * GET /customer/credit/statement
     * Paginated ledger — read only, no filters exposed except date range and page.
     * Supports ?from=&to=&page=&per_page=
     */
    public function statement(Request $request)
    {
        $customer = $this->resolveCustomer();

        // Customers can only filter by date — type/direction filtering is admin-only
        $filters = $request->only(['from', 'to']);
        $perPage = min((int) $request->get('per_page', 15), 50); // cap at 50

        return response()->json(
            $this->credit->getStatement($customer, $filters, $perPage)
        );
    }

    // ─────────────────────────────────────────────────────────────────────────
    // INVOICES
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * GET /customer/credit/invoices
     * List own invoices — excludes drafts and voided.
     * Supports ?status=&page=&per_page=
     */
    public function invoices(Request $request)
    {
        $customer = $this->resolveCustomer();

        $query = $customer->creditInvoices()
            ->with('items')
            ->whereNotIn('status', ['draft', 'void']); // customers only see sent/paid/overdue

        if ($request->filled('status')) {
            // Only allow safe statuses — prevent customers from querying draft/void
            $allowed = ['sent', 'paid', 'overdue'];
            if (in_array($request->status, $allowed)) {
                $query->where('status', $request->status);
            }
        }

        $perPage = min((int) $request->get('per_page', 10), 50);

        return response()->json($query->latest()->paginate($perPage));
    }

    /**
     * GET /customer/credit/invoices/{inv}
     * Show a single invoice — only if it belongs to this customer and is not draft/void.
     */
    public function showInvoice(string $inv)
    {
        $customer = $this->resolveCustomer();

        $invoice = CustomerCreditInvoice::where('customer_id', $customer->id)
            ->whereNotIn('status', ['draft', 'void'])
            ->with(['items', 'currency'])
            ->findOrFail($inv);

        return response()->json($invoice);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // SCHEDULES
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * GET /customer/credit/schedules
     * List own schedules with items — active and completed only.
     * Supports ?status=&page=&per_page=
     */
    public function schedules(Request $request)
    {
        $customer = $this->resolveCustomer();

        $query = $customer->creditSchedules()
            ->with('items')
            ->whereIn('status', ['active', 'completed']); // hide cancelled/defaulted? adjust if needed

        if ($request->filled('status')) {
            $allowed = ['active', 'completed'];
            if (in_array($request->status, $allowed)) {
                $query->where('status', $request->status);
            }
        }

        $perPage = min((int) $request->get('per_page', 10), 50);

        return response()->json($query->latest()->paginate($perPage));
    }
}