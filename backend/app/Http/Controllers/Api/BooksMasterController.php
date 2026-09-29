<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Books\AccountingSetting;
use App\Models\Books\FinancialYear;
use App\Models\Books\Ledger;
use App\Models\Books\LedgerGroup;
use App\Models\Books\PaymentMethod;
use App\Models\Books\VoucherEditLimit;
use App\Models\Books\VoucherSeries;
use App\Models\Books\VoucherType;
use App\Services\Books\NumberingService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/** Chart of accounts, voucher types & numbering, payment methods, period control. */
class BooksMasterController extends Controller
{
    // ── Groups ───────────────────────────────────────────────────────────

    public function groups(): JsonResponse
    {
        $all = LedgerGroup::orderBy('sort_order')->orderBy('name')->get();
        $counts = Ledger::select('group_id', DB::raw('COUNT(*) c'))->groupBy('group_id')->pluck('c', 'group_id');
        $build = function ($parent) use (&$build, $all, $counts) {
            return $all->where('parent_id', $parent)->map(fn ($g) => $g->toArray() + ['ledger_count' => (int) ($counts[$g->id] ?? 0), 'children' => $build($g->id)->values()->all()])->values();
        };

        return response()->json($build(null));
    }

    public function storeGroup(Request $request): JsonResponse
    {
        $d = $request->validate(['name' => 'required|string|max:120|unique:ledger_groups,name', 'parent_id' => 'required|integer|exists:ledger_groups,id', 'behaviour' => 'nullable|in:' . implode(',', LedgerGroup::BEHAVIOURS), 'settings' => 'nullable|array']);
        $parent = LedgerGroup::findOrFail($d['parent_id']);   // primary groups are fixed — new groups always hang under one
        $g = LedgerGroup::create(['name' => $d['name'], 'parent_id' => $parent->id, 'nature' => $parent->nature, 'is_primary' => false, 'is_system' => false, 'affects_gross_profit' => $parent->affects_gross_profit,
            'behaviour' => $d['behaviour'] ?? $parent->behaviour ?? 'standard', 'settings' => $d['settings'] ?? $parent->settings]);   // a subgroup inherits how its parent behaves

        return response()->json(['message' => 'Group added', 'data' => $g], 201);
    }

    public function updateGroup(Request $request, $id): JsonResponse
    {
        $g = LedgerGroup::findOrFail($id);
        $d = $request->validate(['name' => "sometimes|string|max:120|unique:ledger_groups,name,{$g->id}", 'parent_id' => 'sometimes|integer|exists:ledger_groups,id',
            'settings' => 'sometimes|nullable|array', 'behaviour' => 'sometimes|in:' . implode(',', LedgerGroup::BEHAVIOURS)]);
        if ($g->is_system) {   // a system group keeps its name and place; only its defaults can be tuned
            $d = array_intersect_key($d, ['settings' => 1]);
        }
        if (isset($d['parent_id'])) {
            if ($g->isSelfOrAncestorOf($d['parent_id'])) {
                return response()->json(['message' => 'A group cannot sit inside itself.'], 422);
            }
            $p = LedgerGroup::findOrFail($d['parent_id']);
            $d['nature'] = $p->nature;
            $d['behaviour'] = $d['behaviour'] ?? $p->behaviour ?? 'standard';
            $d['affects_gross_profit'] = $p->affects_gross_profit;
        }
        $g->update($d);

        return response()->json(['message' => 'Group updated', 'data' => $g]);
    }

    public function destroyGroup($id): JsonResponse
    {
        $g = LedgerGroup::findOrFail($id);
        if ($g->is_system) {
            return response()->json(['message' => 'System groups cannot be deleted.'], 422);
        }
        if ($g->children()->exists() || $g->ledgers()->exists()) {
            return response()->json(['message' => 'Move or delete the ledgers and subgroups inside it first.'], 422);
        }
        $g->delete();

        return response()->json(['message' => 'Group deleted']);
    }

    // ── Ledgers ──────────────────────────────────────────────────────────

    public function ledgers(Request $request): JsonResponse
    {
        $q = Ledger::with(['group:id,name,nature,behaviour', 'taxRateLedger:id,name,rate_value'])
            ->when($request->filled('group_id'), function ($q) use ($request) {
                $g = LedgerGroup::find($request->group_id);
                $q->whereIn('group_id', $g ? $g->selfAndDescendantIds() : [0]);
            })
            ->when($request->filled('group'), fn ($q) => $q->whereHas('group', fn ($g) => $g->where('name', $request->group)))
            ->when($request->filled('search'), fn ($q) => $q->where('name', 'like', '%' . $request->search . '%'))
            ->when($request->boolean('active_only'), fn ($q) => $q->where('is_active', true))
            ->orderBy('name');

        return response()->json($request->boolean('all') ? $q->get() : $q->paginate(min((int) $request->get('per_page', 50), 500)));
    }

    public function storeLedger(Request $request): JsonResponse
    {
        $d = $request->validate([
            'name' => 'required|string|max:160|unique:ledgers,name', 'group_id' => 'required|integer|exists:ledger_groups,id',
            'code' => 'nullable|string|max:40', 'opening_balance' => 'nullable|numeric|min:0', 'opening_side' => 'nullable|in:D,C', 'notes' => 'nullable|string', 'currency_id' => 'nullable|integer|exists:currencies,id',
            'rate_type' => 'nullable|in:percent,fixed,per_unit,per_day', 'rate_value' => 'nullable|numeric|min:0', 'valid_from' => 'nullable|date', 'valid_until' => 'nullable|date|after_or_equal:valid_from',
            'min_amount' => 'nullable|numeric|min:0', 'max_amount' => 'nullable|numeric|min:0', 'free_above' => 'nullable|numeric|min:0', 'transit_days' => 'nullable|integer|min:0|max:365',
            'tax_nature' => 'nullable|in:taxable,zero_rated,exempt,out_of_scope', 'tax_rate_ledger_id' => ['nullable', 'integer', \Illuminate\Validation\Rule::exists('ledgers', 'id')->whereNotNull('rate_type')],
            'affects_stock' => 'nullable|boolean', 'bank_name' => 'nullable|string|max:80', 'account_number' => 'nullable|string|max:60', 'branch' => 'nullable|string|max:80',
            'side' => 'nullable|in:income,expense', 'settings' => 'nullable|array',
            'settings.charge_kind' => 'nullable|in:' . implode(',', \App\Services\Books\AuctionChargeService::KINDS), 'settings.timing' => 'nullable|in:' . implode(',', \App\Services\Books\AuctionChargeService::TIMINGS),
            'settings.refundable' => 'nullable|boolean', 'settings.tax_follows' => 'nullable|in:' . implode(',', \App\Services\Books\AuctionChargeService::TAX_FOLLOWS), 'settings.default_on' => 'nullable|boolean', 'settings.free_days' => 'nullable|integer|min:0|max:3650',
        ]);
        $this->assertBehaviourFields($d, $d['group_id']);
        if (empty($d['code']) && ($d['side'] ?? null) === 'income' && LedgerGroup::whereKey($d['group_id'])->value('behaviour') === 'delivery') {
            $d['code'] = \Illuminate\Support\Str::slug($d['name'], '_');   // checkout picks a delivery method by this
        }
        $l = Ledger::create($d + ['opening_balance' => $d['opening_balance'] ?? 0, 'opening_side' => $d['opening_side'] ?? 'D', 'is_active' => true]);

        return response()->json(['message' => 'Ledger created', 'data' => $l->load('group:id,name,nature')], 201);
    }

    public function updateLedger(Request $request, $id): JsonResponse
    {
        $l = Ledger::findOrFail($id);
        $d = $request->validate([
            'name' => "sometimes|string|max:160|unique:ledgers,name,{$l->id}", 'group_id' => 'sometimes|integer|exists:ledger_groups,id',
            'code' => 'nullable|string|max:40', 'opening_balance' => 'nullable|numeric|min:0', 'opening_side' => 'nullable|in:D,C',
            'notes' => 'nullable|string', 'is_active' => 'sometimes|boolean', 'currency_id' => 'nullable|integer|exists:currencies,id',
            'rate_type' => 'nullable|in:percent,fixed,per_unit,per_day', 'rate_value' => 'nullable|numeric|min:0', 'valid_from' => 'nullable|date', 'valid_until' => 'nullable|date|after_or_equal:valid_from',
            'min_amount' => 'nullable|numeric|min:0', 'max_amount' => 'nullable|numeric|min:0', 'free_above' => 'nullable|numeric|min:0', 'transit_days' => 'nullable|integer|min:0|max:365',
            'tax_nature' => 'nullable|in:taxable,zero_rated,exempt,out_of_scope', 'tax_rate_ledger_id' => ['nullable', 'integer', \Illuminate\Validation\Rule::exists('ledgers', 'id')->whereNotNull('rate_type')],
            'affects_stock' => 'nullable|boolean', 'bank_name' => 'nullable|string|max:80', 'account_number' => 'nullable|string|max:60', 'branch' => 'nullable|string|max:80',
            'side' => 'nullable|in:income,expense', 'settings' => 'nullable|array',
            'settings.charge_kind' => 'nullable|in:' . implode(',', \App\Services\Books\AuctionChargeService::KINDS), 'settings.timing' => 'nullable|in:' . implode(',', \App\Services\Books\AuctionChargeService::TIMINGS),
            'settings.refundable' => 'nullable|boolean', 'settings.default_on' => 'nullable|boolean', 'settings.free_days' => 'nullable|integer|min:0|max:3650',
        ]);
        $this->assertBehaviourFields($d, $d['group_id'] ?? $l->group_id, $l);
        if ($l->is_system) {
            unset($d['group_id']);   // the system relies on where these sit
        }
        $l->update($d);

        return response()->json(['message' => 'Ledger updated', 'data' => $l->load('group:id,name,nature')]);
    }

    /** Rate fields only make sense in a group that behaves as tax or delivery, and a percentage cannot be a foreign-currency amount. */
    private function assertBehaviourFields(array $d, int $groupId, ?Ledger $existing = null): void
    {
        $behaviour = LedgerGroup::whereKey($groupId)->value('behaviour') ?? 'standard';
        $rated = ! empty($d['rate_type']) || ! empty($d['rate_value']);
        if ($behaviour === 'charge') {
            $type = array_key_exists('rate_type', $d) ? $d['rate_type'] : $existing?->rate_type;
            $value = array_key_exists('rate_value', $d) ? $d['rate_value'] : $existing?->rate_value;
            if (empty($type) || $value === null || $value === '') {
                throw \Illuminate\Validation\ValidationException::withMessages(['rate_type' => 'A charge needs how it is worked out (percentage of the winning bid, fixed amount or per day) and its rate.']);
            }
            $cur = array_key_exists('currency_id', $d) ? $d['currency_id'] : $existing?->currency_id;
            if ($type !== 'percent' && $type !== 'per_unit' && empty($cur)) {
                throw \Illuminate\Validation\ValidationException::withMessages(['currency_id' => 'A fixed or per-day charge needs a currency.']);
            }
        }
        if ($behaviour === 'standard' && $rated) {
            throw \Illuminate\Validation\ValidationException::withMessages(['rate_type' => 'Rates are only kept on ledgers in a tax, delivery or charge group.']);
        }
        if (in_array($behaviour, ['tax', 'delivery'], true) && ! empty($d['rate_type']) && $d['rate_type'] !== 'percent' && empty($d['currency_id'])) {
            throw \Illuminate\Validation\ValidationException::withMessages(['currency_id' => 'A fixed or per-unit rate needs a currency.']);
        }
        // a sales / purchase account cannot exist without its tax treatment: a rate from the system, exempt or out of scope
        $nature = array_key_exists('tax_nature', $d) ? $d['tax_nature'] : $existing?->tax_nature;
        if (in_array($behaviour, ['sales', 'purchase', 'charge'], true) && empty($nature)) {
            throw \Illuminate\Validation\ValidationException::withMessages(['tax_nature' => 'Choose the tax for this account — a tax rate from the system, exempt, or out of scope.']);
        }
        if (! empty($d['tax_nature'])) {
            if (! in_array($behaviour, ['sales', 'purchase', 'charge'], true)) {
                throw \Illuminate\Validation\ValidationException::withMessages(['tax_nature' => 'A tax nature belongs on a sales, purchase or charge account.']);
            }
            if ($d['tax_nature'] === 'taxable' && empty($d['tax_rate_ledger_id'])) {
                throw \Illuminate\Validation\ValidationException::withMessages(['tax_rate_ledger_id' => 'A taxable account needs its tax rate.']);
            }
        }
        if (! empty($d['rate_type']) && $d['rate_type'] === 'percent' && (float) ($d['rate_value'] ?? 0) > 100) {
            throw \Illuminate\Validation\ValidationException::withMessages(['rate_value' => 'A percentage cannot exceed 100.']);
        }
    }

    public function destroyLedger($id): JsonResponse
    {
        $l = Ledger::findOrFail($id);
        if ($l->is_system || $l->customer_id) {
            return response()->json(['message' => 'System and customer ledgers cannot be deleted — switch them off instead.'], 422);
        }
        if ($l->entries()->exists()) {
            return response()->json(['message' => 'This ledger has postings. Switch it off instead of deleting it.'], 422);
        }
        if (PaymentMethod::where('ledger_id', $l->id)->exists()) {
            return response()->json(['message' => 'A payment method points at this ledger. Re-map it first.'], 422);
        }
        $l->delete();

        return response()->json(['message' => 'Ledger deleted']);
    }

    // ── Which account an item sells to / buys from ───────────────────────

    private function itemModel(string $type): string
    {
        return ['product' => \App\Models\Product::class, 'service' => \App\Models\Service::class, 'hamper' => \App\Models\Hamper::class][$type]
            ?? abort(422, 'Unknown item type.');
    }

    public function itemAccounts(Request $request): JsonResponse
    {
        $request->validate(['type' => 'required|in:product,service,hamper', 'id' => 'required|integer']);
        $m = $this->itemModel($request->type)::findOrFail($request->id);

        return response()->json(['sales_ledger_id' => $m->sales_ledger_id, 'purchase_ledger_id' => $m->purchase_ledger_id ?? null]);
    }

    public function updateItemAccounts(Request $request): JsonResponse
    {
        $d = $request->validate(['type' => 'required|in:product,service,hamper', 'id' => 'required|integer', 'sales_ledger_id' => 'nullable|integer|exists:ledgers,id', 'purchase_ledger_id' => 'nullable|integer|exists:ledgers,id']);
        $m = $this->itemModel($d['type'])::findOrFail($d['id']);
        foreach (['sales_ledger_id' => 'sales', 'purchase_ledger_id' => 'purchase'] as $col => $behaviour) {
            if (! empty($d[$col]) && LedgerGroup::whereKey(Ledger::whereKey($d[$col])->value('group_id'))->value('behaviour') !== $behaviour) {
                return response()->json(['message' => 'Choose an account from a ' . $behaviour . ' group.', 'errors' => [$col => ['Not a ' . $behaviour . ' account.']]], 422);
            }
        }
        $m->forceFill(['sales_ledger_id' => $d['sales_ledger_id'] ?? null] + ($d['type'] === 'product' ? ['purchase_ledger_id' => $d['purchase_ledger_id'] ?? null] : []))->save();

        return response()->json(['message' => 'Accounts saved']);
    }

    // ── Voucher types & numbering ────────────────────────────────────────

    public function types(): JsonResponse
    {
        return response()->json(VoucherType::with(['series' => fn ($q) => $q->orderByDesc('is_default')->orderBy('id')])->orderBy('id')->get());
    }

    public function updateType(Request $request, $id): JsonResponse
    {
        $t = VoucherType::findOrFail($id);
        $d = $request->validate(['name' => 'sometimes|string|max:80', 'is_active' => 'sometimes|boolean', 'default_ledger_id' => 'sometimes|nullable|exists:ledgers,id']);
        $t->update($d);

        return response()->json(['message' => 'Voucher type updated', 'data' => $t]);
    }

    private function seriesRules(): array
    {
        return [
            'name' => 'required|string|max:80', 'prefix' => 'nullable|string|max:40', 'suffix' => 'nullable|string|max:40',
            'number_width' => 'required|integer|min:0|max:12', 'start_number' => 'required|integer|min:0',
            'reset_period' => 'required|in:' . implode(',', VoucherSeries::RESETS), 'location_id' => 'nullable|integer|exists:locations,id',
            'allow_manual' => 'boolean', 'is_default' => 'boolean', 'is_active' => 'boolean',
        ];
    }

    public function storeSeries(Request $request, $typeId): JsonResponse
    {
        $type = VoucherType::findOrFail($typeId);
        $d = $request->validate($this->seriesRules());
        $s = DB::transaction(function () use ($d, $type) {
            if (! empty($d['is_default'])) {
                VoucherSeries::where('voucher_type_id', $type->id)->update(['is_default' => false]);
            }

            return VoucherSeries::create($d + ['voucher_type_id' => $type->id, 'next_number' => $d['start_number']]);
        });

        return response()->json(['message' => 'Numbering series added', 'data' => $s, 'example' => app(NumberingService::class)->preview($s, now(), $s->location_id)], 201);
    }

    public function updateSeries(Request $request, $id): JsonResponse
    {
        $s = VoucherSeries::findOrFail($id);
        $rules = $this->seriesRules();
        $rules['next_number'] = 'sometimes|integer|min:0';
        $d = $request->validate(array_map(fn ($r) => str_replace('required|', 'sometimes|', $r), $rules));
        DB::transaction(function () use ($s, $d) {
            if (! empty($d['is_default'])) {
                VoucherSeries::where('voucher_type_id', $s->voucher_type_id)->where('id', '!=', $s->id)->update(['is_default' => false]);
            }
            $s->update($d);
        });

        return response()->json(['message' => 'Numbering series updated', 'data' => $s->fresh(), 'example' => app(NumberingService::class)->preview($s->fresh(), now(), $s->location_id)]);
    }

    public function destroySeries($id): JsonResponse
    {
        $s = VoucherSeries::findOrFail($id);
        if (DB::table('vouchers')->where('series_id', $s->id)->exists()) {
            return response()->json(['message' => 'Vouchers already use this series. Switch it off instead.'], 422);
        }
        if (VoucherSeries::where('voucher_type_id', $s->voucher_type_id)->count() <= 1) {
            return response()->json(['message' => 'Every voucher type needs at least one series.'], 422);
        }
        $s->delete();

        return response()->json(['message' => 'Series deleted']);
    }

    /** Live "what will the numbers look like" for the form. */
    public function previewSeries(Request $request): JsonResponse
    {
        $d = $request->validate(['prefix' => 'nullable|string', 'suffix' => 'nullable|string', 'number_width' => 'required|integer|min:0|max:12', 'start_number' => 'required|integer|min:0', 'location_id' => 'nullable|integer']);
        $s = new VoucherSeries($d);
        $svc = app(NumberingService::class);

        return response()->json(['examples' => [
            $svc->format($s, (int) $d['start_number'], now(), $d['location_id'] ?? null),
            $svc->format($s, (int) $d['start_number'] + 1, now(), $d['location_id'] ?? null),
        ]]);
    }

    // ── Payment methods ──────────────────────────────────────────────────

    public function paymentMethods(): JsonResponse
    {
        return response()->json(PaymentMethod::with('ledger:id,name')->orderBy('sort_order')->orderBy('name')->get());
    }

    private function methodRules(bool $new): array
    {
        $s = $new ? 'required' : 'sometimes';

        return [
            'name' => "$s|string|max:80", 'code' => 'nullable|string|max:30', 'kind' => "$s|in:cash,bank,mobile,mobile_money,card,cheque,online,gift_voucher,other",
            'ledger_id' => "$s|integer|exists:ledgers,id", 'is_online' => 'boolean', 'gateway' => 'nullable|in:mpesa_stk', 'requires_reference' => 'boolean',
            'instructions' => 'nullable|string', 'sort_order' => 'nullable|integer', 'is_active' => 'boolean',
        ];
    }

    private function assertMoneyLedger(?int $ledgerId, ?string $kind = null): ?JsonResponse
    {
        if (! $ledgerId) {
            return null;
        }
        $l = Ledger::with('group:id,nature')->find($ledgerId);
        if ($kind === 'gift_voucher') {
            return $l && $l->group?->nature === 'liability' ? null : response()->json(['message' => 'A gift voucher method spends from the Gift Vouchers Liability ledger.'], 422);
        }

        return $l && $l->group?->nature === 'asset' ? null : response()->json(['message' => 'Map a payment method to an asset ledger (cash, bank, wallet…).'], 422);
    }

    public function storeMethod(Request $request): JsonResponse
    {
        $d = $request->validate($this->methodRules(true));
        if ($err = $this->assertMoneyLedger($d['ledger_id'], $d['kind'])) {
            return $err;
        }
        $d['code'] = $d['code'] ?? \Illuminate\Support\Str::slug($d['name'], '_');
        if (PaymentMethod::where('code', $d['code'])->exists()) {
            return response()->json(['message' => "A payment method with code '{$d['code']}' already exists."], 422);
        }

        return response()->json(['message' => 'Payment method added', 'data' => PaymentMethod::create($d + ['is_active' => true])->load('ledger:id,name')], 201);
    }

    public function updateMethod(Request $request, $id): JsonResponse
    {
        $m = PaymentMethod::findOrFail($id);
        $d = $request->validate($this->methodRules(false));
        if (isset($d['ledger_id']) && ($err = $this->assertMoneyLedger($d['ledger_id'], $d['kind'] ?? $m->kind))) {
            return $err;
        }
        $m->update($d);

        return response()->json(['message' => 'Payment method updated', 'data' => $m->load('ledger:id,name')]);
    }

    public function destroyMethod($id): JsonResponse
    {
        $m = PaymentMethod::findOrFail($id);
        if (DB::table('vouchers')->where('payment_method_id', $m->id)->exists()) {
            return response()->json(['message' => 'Vouchers already use this method. Switch it off instead.'], 422);
        }
        $m->delete();

        return response()->json(['message' => 'Payment method deleted']);
    }

    // ── Settings, period control, financial years ────────────────────────

    public function settings(): JsonResponse
    {
        return response()->json([
            'settings' => AccountingSetting::current(),
            'edit_limits' => VoucherEditLimit::orderBy('role')->orderBy('voucher_type_id')->get(),
            'years' => FinancialYear::orderByDesc('start_date')->get(),
            'roles' => DB::table('users')->whereNotNull('role')->distinct()->pluck('role')->merge(['super_admin', 'admin', 'finance', 'manager'])->unique()->values(),
        ]);
    }

    public function updateSettings(Request $request): JsonResponse
    {
        $ledger = 'nullable|integer|exists:ledgers,id';
        $d = $request->validate([
            'walkin_ledger_id' => $ledger, 'fx_gain_ledger_id' => $ledger, 'fx_loss_ledger_id' => $ledger, 'gift_voucher_ledger_id' => $ledger, 'loyalty_liability_ledger_id' => $ledger, 'breakage_income_ledger_id' => $ledger, 'rewards_expense_ledger_id' => $ledger, 'interest_income_ledger_id' => $ledger, 'default_sales_ledger_id' => $ledger, 'default_purchase_ledger_id' => $ledger, 'sales_returns_ledger_id' => $ledger,
            'purchase_returns_ledger_id' => $ledger, 'shipping_income_ledger_id' => $ledger, 'discount_ledger_id' => $ledger, 'rounding_ledger_id' => $ledger,
            'default_payment_method_id' => 'nullable|integer|exists:payment_methods,id',
            'edit_window_days' => 'nullable|integer|min:0|max:3650', 'locked_before' => 'nullable|date',
        ]);
        $s = AccountingSetting::current();
        $s->fill($d + ['updated_by' => $request->user()->id, 'updated_at' => now()])->save();

        return response()->json(['message' => 'Settings saved', 'data' => $s->fresh()]);
    }

    /** Per-role edit windows. Body: {limits: [{role, voucher_type_id?, max_days_back (null = unlimited), can_edit, can_cancel}]} — replaces the set. */
    public function saveEditLimits(Request $request): JsonResponse
    {
        $d = $request->validate([
            'limits' => 'required|array', 'limits.*.role' => 'required|string|max:40', 'limits.*.voucher_type_id' => 'nullable|integer|exists:voucher_types,id',
            'limits.*.max_days_back' => 'nullable|integer|min:0|max:36500', 'limits.*.can_edit' => 'boolean', 'limits.*.can_cancel' => 'boolean',
        ]);
        DB::transaction(function () use ($d) {
            VoucherEditLimit::query()->delete();
            foreach ($d['limits'] as $l) {
                VoucherEditLimit::create(['role' => $l['role'], 'voucher_type_id' => $l['voucher_type_id'] ?? null, 'max_days_back' => $l['max_days_back'] ?? null,
                    'can_edit' => $l['can_edit'] ?? true, 'can_cancel' => $l['can_cancel'] ?? true]);
            }
        });

        return response()->json(['message' => 'Edit limits saved', 'data' => VoucherEditLimit::orderBy('role')->get()]);
    }

    public function storeYear(Request $request): JsonResponse
    {
        $d = $request->validate(['name' => 'required|string|max:40|unique:financial_years,name', 'start_date' => 'required|date', 'end_date' => 'required|date|after:start_date']);
        if (FinancialYear::where('start_date', '<=', $d['end_date'])->where('end_date', '>=', $d['start_date'])->exists()) {
            return response()->json(['message' => 'That overlaps an existing financial year.'], 422);
        }

        return response()->json(['message' => 'Financial year added', 'data' => FinancialYear::create($d)], 201);
    }

    public function closeYear(Request $request, $id): JsonResponse
    {
        $y = FinancialYear::findOrFail($id);
        $close = $request->boolean('closed', true);
        $y->update(['is_closed' => $close, 'closed_by' => $close ? $request->user()->id : null, 'closed_at' => $close ? now() : null]);

        return response()->json(['message' => $close ? 'Year closed — no voucher in it can change.' : 'Year reopened.', 'data' => $y]);
    }
}
