<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Vendor;
use App\Services\Books\LedgerService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * Vendors: the people we buy from. Each one is a Sundry Creditors ledger (so purchases and payments post to it).
 * There is no vendor login or portal: what a vendor invoices us is entered by us as a Purchase.
 */
class VendorController extends Controller
{
    public function __construct(private LedgerService $ledgers) {}

    public function index(Request $request): JsonResponse
    {
        $d = $request->validate(['search' => 'nullable|string|max:80', 'status' => 'nullable|string|max:30']);
        $rows = Vendor::query()
            ->when(! empty($d['status']), fn ($q) => $q->where('status', $d['status']))
            ->when(! empty($d['search']), fn ($q) => $q->where(fn ($w) => $w->where('company_name', 'like', "%{$d['search']}%")->orWhere('contact_name', 'like', "%{$d['search']}%")
                ->orWhere('email', 'like', "%{$d['search']}%")->orWhere('phone', 'like', "%{$d['search']}%")->orWhere('vendor_number', 'like', "%{$d['search']}%")))
            ->orderBy('company_name')->limit(300)->get();
        $ledgerIds = DB::table('ledgers')->whereIn('supplier_id', $rows->pluck('id'))->pluck('id', 'supplier_id');

        return response()->json(['rows' => $rows->map(fn (Vendor $v) => $this->row($v, $ledgerIds[$v->id] ?? null))->values()]);
    }

    public function show(int $id): JsonResponse
    {
        $v = Vendor::query()->findOrFail($id);
        $ledger = DB::table('ledgers')->where('supplier_id', $v->id)->value('id');
        $purchases = $ledger ? DB::table('vouchers as v')->join('voucher_types as t', 't.id', '=', 'v.voucher_type_id')->where('v.party_ledger_id', $ledger)
            ->whereIn('t.base_type', ['purchase', 'purchase_order', 'receipt_note', 'debit_note'])->where('v.status', '!=', 'cancelled')
            ->orderByDesc('v.date')->orderByDesc('v.id')->limit(30)
            ->get(['v.id', 'v.voucher_number', 'v.date', 'v.reference_no', 'v.supplier_invoice_no', 'v.total_amount', 't.name as type'])
            ->map(fn ($x) => ['id' => (int) $x->id, 'voucher_number' => $x->voucher_number, 'date' => (string) $x->date, 'type' => $x->type, 'reference_no' => $x->reference_no,
                'supplier_invoice_no' => $x->supplier_invoice_no, 'total' => (float) $x->total_amount])->values() : [];

        return response()->json($this->row($v, $ledger) + ['purchases' => $purchases, 'address' => $v->address, 'tax_id' => $v->tax_id, 'notes' => $v->notes, 'payment_terms_days' => $v->payment_terms_days]);
    }

    /** Body: company_name, contact_name?, email?, phone?, tax_id?, address?, payment_terms_days?, notes?. */
    public function store(Request $request): JsonResponse
    {
        $d = $request->validate([
            'company_name' => 'required|string|max:255', 'contact_name' => 'nullable|string|max:255', 'email' => 'nullable|email|max:255', 'phone' => 'nullable|string|max:50',
            'tax_id' => 'nullable|string|max:50', 'address' => 'nullable|string', 'payment_terms_days' => 'nullable|integer|min:0|max:365', 'notes' => 'nullable|string',
        ]);

        return DB::transaction(function () use ($d, $request) {
            $v = Vendor::create([
                'vendor_number' => Vendor::generateVendorNumber(), 'company_name' => $d['company_name'], 'contact_name' => $d['contact_name'] ?? null,
                'email' => $d['email'] ?? null, 'phone' => $d['phone'] ?? '', 'tax_id' => $d['tax_id'] ?? null, 'address' => $d['address'] ?? null,
                'payment_terms_days' => $d['payment_terms_days'] ?? 30, 'notes' => $d['notes'] ?? null, 'status' => 'active', 'created_by' => $request->user()?->id,
            ]);
            $ledger = $this->ledgers->vendorLedger($v);
            if (! empty($d['address'])) {
                $ledger->update(['address' => $d['address']]);
            }

            return response()->json(['message' => "Vendor {$v->vendor_number} added.", 'id' => $v->id, 'ledger_id' => $ledger->id], 201);
        });
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $v = Vendor::findOrFail($id);
        $d = $request->validate([
            'company_name' => 'sometimes|required|string|max:255', 'contact_name' => 'nullable|string|max:255', 'email' => 'nullable|email|max:255', 'phone' => 'nullable|string|max:50',
            'tax_id' => 'nullable|string|max:50', 'address' => 'nullable|string', 'payment_terms_days' => 'nullable|integer|min:0|max:365', 'notes' => 'nullable|string',
            'status' => 'sometimes|in:active,suspended',
        ]);

        return DB::transaction(function () use ($v, $d) {
            $v->update($d);
            $ledger = array_filter(['name' => $d['company_name'] ?? null, 'address' => array_key_exists('address', $d) ? $d['address'] : null], fn ($x) => $x !== null);
            if ($ledger) {
                DB::table('ledgers')->where('supplier_id', $v->id)->update($ledger);
            }

            return response()->json(['message' => 'Vendor updated.']);
        });
    }

    private function row(Vendor $v, $ledgerId): array
    {
        $owed = $ledgerId ? round(-$this->ledgers->balance((int) $ledgerId), 2) : 0.0;   // credit balance = what we owe

        return [
            'id' => $v->id, 'vendor_number' => $v->vendor_number, 'company_name' => $v->company_name, 'contact_name' => $v->contact_name, 'email' => $v->email, 'phone' => $v->phone,
            'status' => $v->status, 'ledger_id' => $ledgerId ? (int) $ledgerId : null, 'owed' => $owed,
        ];
    }
}
