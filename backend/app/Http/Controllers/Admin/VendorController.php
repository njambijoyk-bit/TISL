<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Models\Vendor;
use App\Services\Books\LedgerService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\Rule;

/**
 * Vendors: the people we buy from. Each one is a Sundry Creditors ledger (so purchases and payments post to it) and may
 * also have a login (role "vendor"). Vendors are not notified by the system; we enter what they invoice us as a Purchase.
 */
class VendorController extends Controller
{
    public function __construct(private LedgerService $ledgers) {}

    public function index(Request $request): JsonResponse
    {
        $d = $request->validate(['search' => 'nullable|string|max:80', 'status' => 'nullable|string|max:30']);
        $rows = Vendor::with('user:id,email,last_login_at')
            ->when(! empty($d['status']), fn ($q) => $q->where('status', $d['status']))
            ->when(! empty($d['search']), fn ($q) => $q->where(fn ($w) => $w->where('company_name', 'like', "%{$d['search']}%")->orWhere('contact_name', 'like', "%{$d['search']}%")
                ->orWhere('email', 'like', "%{$d['search']}%")->orWhere('phone', 'like', "%{$d['search']}%")->orWhere('vendor_number', 'like', "%{$d['search']}%")))
            ->orderBy('company_name')->limit(300)->get();
        $ledgerIds = DB::table('ledgers')->whereIn('supplier_id', $rows->pluck('id'))->pluck('id', 'supplier_id');

        return response()->json(['rows' => $rows->map(fn (Vendor $v) => $this->row($v, $ledgerIds[$v->id] ?? null))->values()]);
    }

    public function show(int $id): JsonResponse
    {
        $v = Vendor::with('user:id,email,last_login_at')->findOrFail($id);
        $ledger = DB::table('ledgers')->where('supplier_id', $v->id)->value('id');
        $purchases = $ledger ? DB::table('vouchers as v')->join('voucher_types as t', 't.id', '=', 'v.voucher_type_id')->where('v.party_ledger_id', $ledger)
            ->whereIn('t.base_type', ['purchase', 'purchase_order', 'receipt_note', 'debit_note'])->where('v.status', '!=', 'cancelled')
            ->orderByDesc('v.date')->orderByDesc('v.id')->limit(30)
            ->get(['v.id', 'v.voucher_number', 'v.date', 'v.reference_no', 'v.supplier_invoice_no', 'v.total_amount', 't.name as type'])
            ->map(fn ($x) => ['id' => (int) $x->id, 'voucher_number' => $x->voucher_number, 'date' => (string) $x->date, 'type' => $x->type, 'reference_no' => $x->reference_no,
                'supplier_invoice_no' => $x->supplier_invoice_no, 'total' => (float) $x->total_amount])->values() : [];

        return response()->json($this->row($v, $ledger) + ['purchases' => $purchases, 'address' => $v->address, 'tax_id' => $v->tax_id, 'notes' => $v->notes, 'payment_terms_days' => $v->payment_terms_days]);
    }

    /** Body: company_name, contact_name?, email?, phone?, tax_id?, address?, payment_terms_days?, notes?, login?{email, password}. */
    public function store(Request $request): JsonResponse
    {
        $d = $request->validate([
            'company_name' => 'required|string|max:255', 'contact_name' => 'nullable|string|max:255', 'email' => 'nullable|email|max:255', 'phone' => 'nullable|string|max:50',
            'tax_id' => 'nullable|string|max:50', 'address' => 'nullable|string', 'payment_terms_days' => 'nullable|integer|min:0|max:365', 'notes' => 'nullable|string',
            'login' => 'nullable|array', 'login.email' => ['required_with:login', 'email', Rule::unique('users', 'email')], 'login.password' => 'required_with:login|string|min:8',
        ]);

        return DB::transaction(function () use ($d, $request) {
            $user = null;
            if (! empty($d['login'])) {
                $user = User::create([
                    'name' => $d['contact_name'] ?? $d['company_name'], 'email' => $d['login']['email'], 'password' => Hash::make($d['login']['password']), 'role' => 'vendor',
                    'phone' => $d['phone'] ?? null, 'company_name' => $d['company_name'], 'status' => 'active', 'oauth_provider' => 'email', 'force_password_change' => true, 'password_changed_at' => now(),
                ]);
            }
            $v = Vendor::create([
                'user_id' => $user?->id, 'vendor_number' => Vendor::generateVendorNumber(), 'company_name' => $d['company_name'], 'contact_name' => $d['contact_name'] ?? null,
                'email' => $d['email'] ?? ($d['login']['email'] ?? null), 'phone' => $d['phone'] ?? '', 'tax_id' => $d['tax_id'] ?? null, 'address' => $d['address'] ?? null,
                'payment_terms_days' => $d['payment_terms_days'] ?? 30, 'notes' => $d['notes'] ?? null, 'status' => 'active', 'created_by' => $request->user()?->id,
            ]);
            $ledger = $this->ledgers->vendorLedger($v);

            return response()->json(['message' => "Vendor {$v->vendor_number} added.", 'id' => $v->id, 'ledger_id' => $ledger->id], 201);
        });
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $v = Vendor::findOrFail($id);
        $d = $request->validate([
            'company_name' => 'sometimes|required|string|max:255', 'contact_name' => 'nullable|string|max:255', 'email' => 'nullable|email|max:255', 'phone' => 'nullable|string|max:50',
            'tax_id' => 'nullable|string|max:50', 'address' => 'nullable|string', 'payment_terms_days' => 'nullable|integer|min:0|max:365', 'notes' => 'nullable|string',
            'status' => 'sometimes|in:active,suspended', 'new_password' => 'nullable|string|min:8',
        ]);

        return DB::transaction(function () use ($v, $d) {
            $v->update(collect($d)->except('new_password')->all());
            if (isset($d['status']) && $v->user) {
                $v->user->update(['status' => $d['status'] === 'active' ? 'active' : 'suspended']);
            }
            if (! empty($d['new_password']) && $v->user) {
                $v->user->update(['password' => Hash::make($d['new_password']), 'force_password_change' => true, 'password_changed_at' => now()]);
            }
            if (isset($d['company_name'])) {
                DB::table('ledgers')->where('supplier_id', $v->id)->update(['name' => $d['company_name']]);
            }

            return response()->json(['message' => 'Vendor updated.']);
        });
    }

    /** Give an existing vendor a login. Body: email, password. */
    public function createLogin(Request $request, int $id): JsonResponse
    {
        $v = Vendor::findOrFail($id);
        if ($v->user_id) {
            return response()->json(['message' => 'This vendor already has a login.'], 422);
        }
        $d = $request->validate(['email' => ['required', 'email', Rule::unique('users', 'email')], 'password' => 'required|string|min:8']);
        $user = User::create(['name' => $v->contact_name ?: $v->company_name, 'email' => $d['email'], 'password' => Hash::make($d['password']), 'role' => 'vendor', 'phone' => $v->phone,
            'company_name' => $v->company_name, 'status' => 'active', 'oauth_provider' => 'email', 'force_password_change' => true, 'password_changed_at' => now()]);
        $v->update(['user_id' => $user->id]);

        return response()->json(['message' => 'Login created. They must change the password when they first sign in.']);
    }

    private function row(Vendor $v, $ledgerId): array
    {
        $owed = $ledgerId ? round(-$this->ledgers->balance((int) $ledgerId), 2) : 0.0;   // credit balance = what we owe

        return [
            'id' => $v->id, 'vendor_number' => $v->vendor_number, 'company_name' => $v->company_name, 'contact_name' => $v->contact_name, 'email' => $v->email, 'phone' => $v->phone,
            'status' => $v->status, 'ledger_id' => $ledgerId ? (int) $ledgerId : null, 'has_login' => (bool) $v->user_id, 'login_email' => $v->user?->email, 'last_login_at' => $v->user?->last_login_at ? (string) $v->user->last_login_at : null,
            'owed' => $owed,
        ];
    }
}
