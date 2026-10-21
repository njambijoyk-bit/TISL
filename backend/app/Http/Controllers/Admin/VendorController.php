<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Vendor;
use App\Services\Books\LedgerService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;
use App\Models\User;
use App\Services\Security\PasswordPolicy;
use App\Services\Security\SecurityLog;
use App\Services\Security\Sessions;

/**
 * Vendors: the people we buy from. Each one is a Sundry Creditors ledger (so purchases and payments post to it).
 * A vendor may also have a login to the vendor portal (Extras): they register themselves, or an admin makes the login (see createPortalLogin).
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
        $loginEmails = User::whereIn('id', $rows->pluck('user_id')->filter())->pluck('email', 'id');

        return response()->json(['rows' => $rows->map(fn (Vendor $v) => $this->row($v, $ledgerIds[$v->id] ?? null) + ['has_login' => $v->user_id !== null, 'login_email' => $loginEmails[$v->user_id] ?? null])->values()]);
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

        return response()->json($this->row($v, $ledger) + ['scan_urls' => $v->scanUrls(), 'registration_number' => $v->registration_number, 'purchases' => $purchases, 'address' => $v->address, 'tax_id' => $v->tax_id, 'notes' => $v->notes, 'payment_terms_days' => $v->payment_terms_days]);
    }

    /** Body: company_name, contact_name?, email?, phone?, tax_id?, address?, payment_terms_days?, notes?. */
    public function store(Request $request): JsonResponse
    {
        $d = $request->validate([
            'company_name' => 'required|string|max:255', 'contact_name' => 'nullable|string|max:255', 'email' => 'nullable|email|max:255', 'phone' => 'nullable|string|max:50',
            'tax_id' => 'nullable|string|max:50', 'address' => 'nullable|string', 'payment_terms_days' => 'nullable|integer|min:0|max:365', 'notes' => 'nullable|string',
            'special_group' => 'nullable|in:youth,women,pwd,sme', 'special_group_certificate' => 'nullable|string|max:120', 'special_group_valid_until' => 'nullable|date', 'registration_number' => 'nullable|string|max:100',
        ]);

        return DB::transaction(function () use ($d, $request) {
            $v = Vendor::create([
                'vendor_number' => Vendor::generateVendorNumber(), 'company_name' => $d['company_name'], 'contact_name' => $d['contact_name'] ?? null,
                'email' => $d['email'] ?? null, 'phone' => $d['phone'] ?? '', 'tax_id' => $d['tax_id'] ?? null, 'registration_number' => $d['registration_number'] ?? null, 'address' => $d['address'] ?? null,
                'payment_terms_days' => $d['payment_terms_days'] ?? 30, 'notes' => $d['notes'] ?? null, 'status' => 'active',
                'special_group' => $d['special_group'] ?? null, 'special_group_status' => ! empty($d['special_group']) ? 'confirmed' : 'unconfirmed', 'special_group_certificate' => $d['special_group_certificate'] ?? null, 'special_group_valid_until' => $d['special_group_valid_until'] ?? null, 'created_by' => $request->user()?->id,
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
            'special_group' => 'nullable|in:youth,women,pwd,sme', 'special_group_certificate' => 'nullable|string|max:120', 'special_group_valid_until' => 'nullable|date', 'registration_number' => 'nullable|string|max:100',
        ]);

        // a people category staff type in themselves is confirmed by that; clearing it clears its certificate too
        if (array_key_exists('special_group', $d) && ($d['special_group'] !== $v->special_group)) {
            $d += $d['special_group']
                ? ['special_group_status' => 'confirmed', 'special_group_confirmed_by' => request()->user()?->id, 'special_group_confirmed_at' => now()]
                : ['special_group_status' => 'unconfirmed', 'special_group_confirmed_by' => null, 'special_group_confirmed_at' => null, 'special_group_certificate' => null, 'special_group_valid_until' => null];
        }

        return DB::transaction(function () use ($v, $d) {
            $v->update($d);
            // a vendor with a portal login: suspending the vendor suspends the login (sign-in is refused and open sessions end at once); activating lifts it
            if (array_key_exists('status', $d) && $v->user_id && ($user = \App\Models\User::find($v->user_id))) {
                if ($d['status'] === 'suspended' && $user->status !== 'suspended') {
                    $user->forceFill(['status' => 'suspended'])->save();
                } elseif ($d['status'] === 'active' && $user->status === 'suspended') {
                    $user->forceFill(['status' => 'active'])->save();
                }
            }
            // an active vendor is someone we can buy from, so it needs its Sundry Creditors ledger (self-registered vendors get theirs here, once approved)
            if ($v->status === 'active') {
                $this->ledgers->vendorLedger($v);
            }
            $ledger = array_filter(['name' => $d['company_name'] ?? null, 'address' => array_key_exists('address', $d) ? $d['address'] : null], fn ($x) => $x !== null);
            if ($ledger) {
                DB::table('ledgers')->where('supplier_id', $v->id)->update($ledger);
            }

            return response()->json(['message' => 'Vendor updated.']);
        });
    }

    /** Body: confirmed (bool). Staff check the certificate scan, then confirm (or take back) the vendor's people category. */
    public function confirmPeopleCategory(Request $request, int $id): JsonResponse
    {
        $v = Vendor::findOrFail($id);
        $d = $request->validate(['confirmed' => 'required|boolean']);
        if (! $v->special_group) {
            return response()->json(['message' => 'This vendor has no people category.'], 422);
        }
        $v->forceFill($d['confirmed']
            ? ['special_group_status' => 'confirmed', 'special_group_confirmed_by' => $request->user()->id, 'special_group_confirmed_at' => now()]
            : ['special_group_status' => 'unconfirmed', 'special_group_confirmed_by' => null, 'special_group_confirmed_at' => null])->save();

        return response()->json(['message' => $d['confirmed'] ? 'People category confirmed.' : 'People category set back to unconfirmed.']);
    }

    /**
     * Give a vendor we created ourselves a login to the vendor portal (Extras).
     * Body: email? (blank = the vendor's own), password? (blank = one is made and returned once). They must choose their own password at first sign-in.
     */
    public function createPortalLogin(Request $request, int $id): JsonResponse
    {
        $v = Vendor::findOrFail($id);
        if ($v->user_id) {
            return response()->json(['message' => 'This vendor already has a portal login. Use "Reset password" instead.'], 422);
        }
        $d = $request->validate(['email' => 'nullable|email|max:255', 'password' => 'nullable|string|max:200']);

        $email = trim((string) ($d['email'] ?? '')) ?: (string) $v->email;
        if ($email === '') {
            throw ValidationException::withMessages(['email' => 'Enter the vendor\'s email: it is their username.']);
        }
        if (User::where('email', $email)->exists()) {
            throw ValidationException::withMessages(['email' => 'A login with this email already exists.']);
        }
        $name = trim((string) $v->contact_name) ?: (string) $v->company_name;
        $phone = $v->phone ?: null;
        if ($phone && User::where('phone', $phone)->exists()) {
            $phone = null;   // a phone number belongs to one login: leave it off rather than refuse
        }

        [$password, $generated] = $this->initialPassword($d['password'] ?? null, [$name, $email, $phone], 'password');

        $user = DB::transaction(function () use ($v, $name, $email, $phone, $password) {
            $user = new User();
            $user->forceFill([
                'name' => $name, 'email' => $email, 'phone' => $phone, 'company_name' => $v->company_name, 'role' => 'vendor', 'oauth_provider' => 'email',
                'status' => $v->status === 'suspended' ? 'suspended' : 'active', 'password' => Hash::make($password),
                'force_password_change' => true, 'password_changed_at' => now(), 'email_verified_at' => now(),
            ])->save();
            $v->update(['user_id' => $user->id, 'email' => $v->email ?: $email]);

            return $user;
        });
        SecurityLog::record('vendor_login_made', $user, $request, ['vendor_id' => $v->id, 'by' => $request->user()?->id, 'password_generated' => $generated]);

        return response()->json([
            'message' => "Portal login made for {$v->company_name}. They must choose their own password when they first sign in.",
            'email' => $email, 'password' => $generated ? $password : null, 'generated' => $generated,
        ], 201);
    }

    /** Body: password? (blank = one is made and returned once). Ends their open sessions; they must choose their own password at next sign-in. */
    public function resetPortalPassword(Request $request, int $id): JsonResponse
    {
        $v = Vendor::findOrFail($id);
        $user = $v->user_id ? User::find($v->user_id) : null;
        if (! $user) {
            return response()->json(['message' => 'This vendor has no portal login yet. Use "Create login" first.'], 422);
        }
        $d = $request->validate(['password' => 'nullable|string|max:200']);

        [$password, $generated] = $this->initialPassword($d['password'] ?? null, [$user->name, $user->email, $user->phone], 'password');

        DB::transaction(fn () => $user->forceFill(['password' => Hash::make($password), 'force_password_change' => true, 'password_changed_at' => now()])->save());
        $ended = app(Sessions::class)->revokeAll($user, null, 'vendor_password_reset');
        SecurityLog::record('vendor_password_reset', $user, $request, ['vendor_id' => $v->id, 'by' => $request->user()?->id, 'sessions_ended' => $ended, 'password_generated' => $generated]);

        return response()->json([
            'message' => "New password set for {$v->company_name}. They must choose their own when they next sign in.",
            'email' => $user->email, 'password' => $generated ? $password : null, 'generated' => $generated,
        ]);
    }

    /** @return array{0: string, 1: bool} the password to use and whether we made it (a typed one must pass the password rules) */
    private function initialPassword(?string $typed, array $personal, string $field): array
    {
        $typed = trim((string) $typed);
        if ($typed === '') {
            return [Str::password(16, true, true, false, false), true];
        }
        if ($problem = PasswordPolicy::problem($typed, $personal)) {
            throw ValidationException::withMessages([$field => $problem]);
        }

        return [$typed, false];
    }

    private function row(Vendor $v, $ledgerId): array
    {
        $owed = $ledgerId ? (round(-$this->ledgers->balance((int) $ledgerId), 2) ?: 0.0) : 0.0;   // credit balance = what we owe; ?: stops a -0.00

        return [
            'id' => $v->id, 'vendor_number' => $v->vendor_number, 'company_name' => $v->company_name, 'contact_name' => $v->contact_name, 'email' => $v->email, 'phone' => $v->phone,
            'status' => $v->status, 'ledger_id' => $ledgerId ? (int) $ledgerId : null, 'owed' => $owed,
            'flags' => $v->status === 'active' ? [] : app(\App\Services\Tenders\VendorChecks::class)->flags($v),
            'special_group' => $v->special_group, 'special_group_status' => $v->special_group_status, 'special_group_certificate' => $v->special_group_certificate, 'special_group_valid_until' => $v->special_group_valid_until?->toDateString(),
        ];
    }
}
