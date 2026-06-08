<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\FinancialNote;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

class FinancialNoteController extends Controller
{
    // GET /admin/financial-notes
    public function index(Request $request)
    {
        $query = FinancialNote::with('author')
            ->latest();

        if ($request->filled('note_type')) {
            $query->ofType($request->note_type);
        }

        if ($request->filled('subject_table') && $request->filled('subject_id')) {
            $query->forSubject($request->subject_table, $request->subject_id);
        }

        if ($request->filled('from') && $request->filled('to')) {
            $query->inPeriod($request->from, $request->to);
        }

        if ($request->filled('direction')) {
            $query->where('direction', $request->direction);
        }

        if ($request->filled('search')) {
            $query->where('body', 'like', '%' . $request->search . '%')
                  ->orWhere('reference_label', 'like', '%' . $request->search . '%')
                  ->orWhere('note_number', 'like', '%' . $request->search . '%');
        }

        $notes = $query->paginate($request->get('per_page', 30));

        return response()->json($notes);
    }

    // POST /admin/financial-notes
    public function store(Request $request)
    {
        $validated = $request->validate([
            'note_type'       => 'required|in:refund,overpayment,credit_adjustment,loyalty_adjustment,manual_payment,reversal,other',
            'amount'          => 'nullable|numeric|min:0',
            'currency'        => 'nullable|string|max:8',
            'direction'       => 'nullable|in:in,out',
            'subject_table'   => 'nullable|string|max:64',
            'subject_id'      => 'nullable|integer|min:1',
            'reference_label' => 'nullable|string|max:255',
            'body'            => 'required|string',
        ]);

        $validated['written_by'] = Auth::id();
        $validated['currency']   = $validated['currency'] ?? 'KES';

        $note = FinancialNote::create($validated);
        $note->load('author');

        return response()->json($note, 201);
    }

    // GET /admin/financial-notes/{id}
    public function show(FinancialNote $financialNote)
    {
        $financialNote->load('author', 'reconciliationLines.session');
        return response()->json($financialNote);
    }

    // PUT /admin/financial-notes/{id}
    public function update(Request $request, FinancialNote $financialNote)
    {
        $validated = $request->validate([
            'note_type'       => 'sometimes|in:refund,overpayment,credit_adjustment,loyalty_adjustment,manual_payment,reversal,other',
            'amount'          => 'nullable|numeric|min:0',
            'currency'        => 'nullable|string|max:8',
            'direction'       => 'nullable|in:in,out',
            'subject_table'   => 'nullable|string|max:64',
            'subject_id'      => 'nullable|integer|min:1',
            'reference_label' => 'nullable|string|max:255',
            'body'            => 'sometimes|required|string',
        ]);

        $financialNote->update($validated);
        $financialNote->load('author');

        return response()->json($financialNote);
    }

    // DELETE /admin/financial-notes/{id}
    public function destroy(FinancialNote $financialNote)
    {
        // block delete if note is linked to any reconciliation line
        if ($financialNote->reconciliationLines()->exists()) {
            return response()->json([
                'message' => 'Cannot delete a note that is linked to a reconciliation session.'
            ], 422);
        }

        $financialNote->delete();
        return response()->json(['message' => 'Note deleted.']);
    }

    // GET /admin/financial-notes/for-subject?subject_table=payments&subject_id=142
    // lightweight endpoint for the floating modal and reconciliation workbench
    public function forSubject(Request $request)
    {
        $request->validate([
            'subject_table' => 'required|string',
            'subject_id'    => 'required|integer',
        ]);

        $notes = FinancialNote::with('author')
            ->forSubject($request->subject_table, $request->subject_id)
            ->latest()
            ->get();

        return response()->json($notes);
    }

    // GET /admin/financial-notes/resolve-subject?table=orders&q=ORD-2026-001
    public function resolveSubject(Request $request)
    {
        $request->validate([
            'table' => 'required|in:orders,payments,auction_orders,hamper_orders,quotes,store_credit_transactions,loyalty_point_transactions,customer_credit_transactions',
            'q'     => 'required|string|max:100',
        ]);

        $table = $request->table;
        $q     = $request->q;

        $numberColumn = match($table) {
            'orders'         => 'order_number',
            'payments'       => 'payment_number',
            'auction_orders' => 'order_number',
            'hamper_orders'  => 'order_number',
            'quotes'         => 'quote_number',
            default          => null,
        };

        if ($numberColumn) {
            $rows = \DB::table($table)
                ->where($numberColumn, 'like', "%{$q}%")
                ->whereNull('deleted_at')  // soft delete guard where applicable
                ->select('id', $numberColumn . ' as label')
                ->limit(8)
                ->get();
        } else {
            // ID-only tables — match by numeric ID
            if (!is_numeric($q)) {
                return response()->json([]);
            }
            $rows = \DB::table($table)
                ->where('id', $q)
                ->select('id', \DB::raw("CONCAT('#', id) as label"))
                ->limit(1)
                ->get();
        }

        return response()->json($rows);
    }
}