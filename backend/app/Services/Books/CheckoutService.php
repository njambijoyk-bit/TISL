<?php

namespace App\Services\Books;

use App\Models\Books\GiftVoucher;
use App\Models\Books\PaymentMethod;
use App\Models\Books\Voucher;
use App\Models\Books\VoucherType;
use App\Models\Currency;
use App\Models\Customer;
use App\Models\CustomerTier;
use App\Models\Location;
use App\Models\ShippingOption;
use App\Models\User;
use App\Services\CurrencyConversionService;
use App\Services\PromoCodeService;
use Illuminate\Support\Facades\DB;

/**
 * The storefront checkout on the books. Nothing is priced in the browser: the cart's
 * ids and quantities come in, the engine prices them (catalogue price, unit, tax, hamper
 * components), customer discounts / promo / referral become discount lines, delivery
 * becomes a shipping charge, and the result is a Sales Order. Paid at checkout → it is
 * converted to a Cash Sale; paid later → it stays an order for the admin to invoice.
 */
class CheckoutService
{
    public function __construct(
        private VoucherService $vouchers,
        private CurrencyConversionService $money,
        private PromoCodeService $promos,
        private GiftVoucherService $gifts,
        private GatewayPaymentService $gateway,
        private DiscountService $discountEngine,
    ) {}

    // ── Assembling ───────────────────────────────────────────────────────

    /** @return array{data: array, customer: ?Customer, currency: Currency, discounts: array, notes: array} */
    private function assemble(array $in, ?User $user): array
    {
        $customer = $user?->customer;
        // Orders are always charged in the base (operating) currency; the shopper's chosen currency is only how prices are shown.
        $currency = $this->money->getBaseCurrency();
        $locationId = $in['location_id'] ?? Location::default()?->id;
        $type = VoucherType::byBase(VoucherType::SALES_ORDER) ?? throw new BooksException('Ordering is switched off (the Sales Order voucher type is off).');

        $lines = [];
        foreach ($in['items'] ?? [] as $it) {
            $qty = (float) ($it['quantity'] ?? 1);
            if (! empty($it['hamper_id'])) {
                $lines[] = ['type' => 'hamper', 'hamper_id' => (int) $it['hamper_id'], 'quantity' => $qty];
            } elseif (! empty($it['product_id'])) {
                $lines[] = ['type' => 'product', 'product_id' => (int) $it['product_id'], 'variant_id' => $it['variant_id'] ?? null,
                    'variant_unit_id' => $it['variant_unit_id'] ?? null, 'quantity' => $qty, 'location_id' => $locationId];
            } else {
                throw new BooksException('Services are requested as quotes, not bought from the cart.');
            }
        }
        // gift vouchers bought for someone (or for later): a money line, paid online, code issued on payment
        foreach ($in['gift_vouchers'] ?? [] as $g) {
            if (! $customer) {
                throw new BooksException('Sign in to buy a gift voucher.');
            }
            $lines[] = ['type' => 'charge', 'kind' => 'gift_voucher', 'amount' => $g['amount'] ?? 0, 'recipient_name' => $g['recipient_name'] ?? null,
                'recipient_email' => $g['recipient_email'] ?? null, 'message' => $g['message'] ?? null];
        }
        if (! $lines) {
            throw new BooksException('Your cart is empty.');
        }
        $hasGift = collect($lines)->contains(fn ($l) => ($l['kind'] ?? null) === 'gift_voucher');

        $base = [
            'voucher_type_id' => $type->id, 'date' => today()->toDateString(), 'location_id' => $locationId, 'currency_id' => $currency->id,
            'customer_id' => $customer?->id, 'channel' => 'storefront',
        ];

        // pass 1 — price the lines with no discounts so we know each line's gross
        $pre = $this->vouchers->preview($base + ['lines' => $lines], null);
        $gross = [];
        foreach ($pre['lines'] as $i => $l) {
            $isGift = ($lines[$i]['kind'] ?? null) === 'gift_voucher';
            $gross[$i] = (! empty($l['is_header']) || $isGift) ? 0.0 : (float) $l['amount'];   // hampers carry their own fixed price; a gift voucher is never discounted
        }
        $sub = array_sum($gross);

        // the customer's discounts (personal / tier / type, referral, a promo code) come from one engine, are taken off
        // BEFORE tax, and are spread over the lines so every line's VAT follows
        $discounts = [];
        $perLine = array_fill(0, count($lines), []);
        $referralCodeId = null;
        $promoCodeId = null;
        $promoNet = 0.0;
        $promoReferral = 0.0;
        if ($customer && $sub > 0) {
            $rows = $this->discountEngine->evaluate($customer, $sub, $currency, null, ! empty($in['promo_code']) ? (string) $in['promo_code'] : null);
            foreach ($rows as $r) {
                if ($r['error']) {
                    throw new BooksException($r['error']);
                }
            }
            $sp = $this->discountEngine->spread($gross, $rows);
            $perLine = $sp['perLine'] + $perLine;
            $discounts = $sp['discounts'];
            foreach ($rows as $r) {
                if (! $r['chosen']) {
                    continue;
                }
                $referralCodeId = $r['kind'] === 'referral' ? $r['referral_id'] : $referralCodeId;
                $promoCodeId = $r['kind'] === 'promo' ? $r['promo_id'] : $promoCodeId;
                if ($r['kind'] === 'referral') {
                    $promoReferral = $r['amount'];
                }
                if ($r['kind'] !== 'promo') {
                    $promoNet -= $r['amount'];
                }
            }
            $promoNet = round($sub + $promoNet, 2);
        } elseif (! empty($in['promo_code'])) {
            throw new BooksException('Sign in to use a promo code.');
        }

        $final = [];
        foreach ($lines as $i => $l) {
            $parts = $perLine[$i] ?? [];
            if ($parts) {
                usort($parts, fn ($a, $b) => $b['amount'] <=> $a['amount']);
                $l['share_discount'] = round(array_sum(array_column($parts, 'amount')), 2);   // on top of any clearance price
                $l['discount_source'] = $parts[0]['source'];
                $l['discount_ref'] = $parts[0]['ref'];
            }
            $final[] = $l;
        }

        // delivery
        $option = null;
        if (! empty($in['delivery_method'])) {
            $option = ShippingOption::where('code', $in['delivery_method'])->where('is_active', true)->first()
                ?? throw new BooksException('That delivery method is not available.');
            $netSub = $sub - array_sum(array_column($discounts, 'amount'));
            $final[] = ['type' => 'charge', 'kind' => 'shipping', 'shipping_option_id' => $option->id, 'waive' => $this->tierWaivesShipping($customer, $netSub, $currency)];
        }

        $contact = [
            'email' => $in['customer_email'] ?? $user?->email, 'phone' => $in['customer_phone'] ?? $customer?->phone, 'name' => $in['customer_name'] ?? null,
            'shipping_address' => $in['shipping_address'] ?? null, 'delivery_method' => $option?->slug,
        ];
        // an overpayment / advance they hold and meant to use: remembered on the order, applied when it becomes an invoice
        $useCredit = [];
        if ($customer && ! empty($in['use_credit']) && is_array($in['use_credit'])) {
            $mine = array_column(app(OpenBillsService::class)->forCustomer($customer->id), 'voucher_id');
            $useCredit = array_values(array_intersect(array_map('intval', $in['use_credit']), $mine));
        }
        $data = $base + [
            'use_credit' => $useCredit ?: null,
            'lines' => $final, 'narration' => $in['customer_notes'] ?? null,
            'meta' => array_filter([
                'contact' => $contact, 'discounts' => $discounts, 'promo_code_id' => $promoCodeId, 'referral_code_id' => $referralCodeId,
                'policy_acceptances' => $in['policy_acceptances'] ?? null, 'guest' => $customer ? null : true,
            ], fn ($v) => $v !== null),
        ];

        return compact('data', 'customer', 'currency', 'discounts', 'hasGift', 'promoNet', 'promoReferral') + ['option' => $option];
    }

    private function tierWaivesShipping(?Customer $customer, float $netSubtotal, Currency $currency): bool
    {
        if (! $customer || ! $customer->tier) {
            return false;
        }
        $tier = CustomerTier::where('slug', $customer->tier)->first();
        if (! $tier || (float) $tier->free_shipping_threshold <= 0) {
            return false;
        }
        $inTier = $this->money->convert($netSubtotal, $currency, $this->money->currencyFrom($tier->currency_id));

        return $inTier >= (float) $tier->free_shipping_threshold;
    }

    // ── Public API ───────────────────────────────────────────────────────

    /** What the customer will be charged, worked out by the engine — nothing is saved. */
    public function quote(array $in, ?User $user): array
    {
        $a = $this->assemble($in, $user);
        $p = $this->vouchers->preview($a['data'], null);

        $gifts = $this->giftApplications($this->giftCodes($in), (float) $p['total'], $a['currency'], $a['customer']);
        $applied = round(array_sum(array_column($gifts, 'applied')), 2);
        $gift = $gifts ? ['code' => implode(', ', array_column($gifts, 'code')), 'applied' => $applied, 'vouchers' => $gifts] : null;

        return [
            'currency' => $a['currency']->only(['id', 'code', 'symbol']), 'lines' => $p['lines'], 'subtotal' => $p['subtotal'], 'tax_total' => $p['tax_total'], 'tax_breakdown' => $p['tax_breakdown'],
            'total' => $p['total'], 'discounts' => $a['discounts'], 'gift' => $gift, 'customer' => $this->customerCard($a['customer']),
            'due_now' => round($p['total'] - $applied, 2),
            'available' => $this->entitlements($a['customer'], (float) $p['total'], $a['promoNet'], $a['promoReferral'], $a['currency'], ! empty($in['promo_code']) ? (string) $in['promo_code'] : null),
        ];
    }

    /** Who is shopping, as the summary shows them: their tier and what it gives. Null for a guest. */
    private function customerCard(?Customer $c): ?array
    {
        if (! $c) {
            return null;
        }
        $tier = $c->tier_benefits ?? [];

        return ['name' => trim($c->first_name . ' ' . $c->last_name), 'tier' => $c->tier ? ucfirst((string) $c->tier) : null, 'tier_discount' => (float) ($tier['discount'] ?? 0),
            'points_multiplier' => (float) ($tier['loyalty_points_multiplier'] ?? 1), 'customer_type' => $c->customer_type ? ucfirst(str_replace('_', ' ', (string) $c->customer_type)) : null,
            'points' => (int) $c->loyalty_points];
    }

    /** Codes chosen for this order: gift_voucher_codes[] (and the older single gift_voucher_code). */
    private function giftCodes(array $in): array
    {
        $codes = array_map('trim', array_filter(array_merge((array) ($in['gift_voucher_codes'] ?? []), [$in['gift_voucher_code'] ?? null]), fn ($c) => filled($c)));

        return array_values(array_unique($codes));
    }

    /**
     * Apply the chosen gift vouchers one after another until the total is covered.
     *
     * @return array<int, array{code: string, balance: float, applied: float}>
     */
    private function giftApplications(array $codes, float $total, Currency $currency, ?Customer $customer): array
    {
        $out = [];
        $left = $total;
        foreach ($codes as $code) {
            $g = $this->giftApplication($code, $left, $currency, $customer, now());
            $out[] = $g;
            $left = round($left - $g['applied'], 2);
        }

        return $out;
    }

    /**
     * What a customer could use on this order: their spendable gift vouchers (with what each would cover, in the order's
     * currency) and the promo codes they hold (with the discount each would give). Nothing for a guest.
     *
     * @return array{gift_vouchers: array, promo_codes: array}
     */
    public function entitlements(?Customer $customer, float $total, float $promoNet, float $referralDiscount, Currency $currency, ?string $chosenPromo = null): array
    {
        $out = ['gift_vouchers' => [], 'promo_codes' => []];
        if (! $customer) {
            return $out;
        }
        $left = $total;
        foreach (GiftVoucher::with('currency')->where('customer_id', $customer->id)->orderBy('expires_at')->orderBy('id')->get() as $gv) {
            if (! $gv->isSpendable()) {
                continue;
            }
            $balance = $this->money->convert((float) $gv->balance, $gv->currency, $currency);
            $applicable = round(min($balance, max($left, 0)), 2);
            $left = round($left - $applicable, 2);
            $out['gift_vouchers'][] = ['code' => $gv->code, 'balance' => round($balance, 2), 'applicable' => $applicable, 'expires_at' => $gv->expires_at?->toDateString()];
        }
        if ($promoNet > 0) {
            foreach ($this->promos->getCustomerPromoCodes($customer)['active_codes'] as $rc) {
                $res = $this->promos->validateForCheckout($rc->code, $customer, $promoNet, $currency, $referralDiscount);
                if ($res['valid'] && (float) $res['discount'] > 0) {
                    $out['promo_codes'][] = ['code' => $rc->code, 'discount' => round(min($promoNet, (float) $res['discount']), 2), 'chosen' => strcasecmp((string) $chosenPromo, $rc->code) === 0];
                }
            }
        }

        return $out;
    }

    /** How much of a gift voucher can go on this order, in the order's currency. */
    private function giftApplication(string $code, float $total, Currency $currency, ?Customer $customer, $date): array
    {
        $gv = GiftVoucher::with('currency')->where('code', trim($code))->first() ?? throw new BooksException('That gift voucher code was not found.');
        if ($gv->customer_id && (! $customer || (int) $gv->customer_id !== (int) $customer->id)) {
            throw new BooksException('That gift voucher belongs to another customer.');
        }
        if (! $gv->isSpendable()) {
            throw new BooksException('That gift voucher can not be used (' . ($gv->status !== 'active' ? $gv->status : ((float) $gv->balance <= 0 ? 'no balance left' : 'expired')) . ').');
        }
        $balanceHere = $this->money->convert((float) $gv->balance, $gv->currency, $currency);

        return ['code' => $gv->code, 'balance' => $balanceHere, 'applied' => round(min($balanceHere, $total), 2)];
    }

    /**
     * Place the order. $in adds: payment_method_id | pay_later | account, gift_voucher_code, phone (for M-Pesa).
     *
     * @return array{order: array, status: string, sale?: array, attempt?: array, message: string}
     */
    public function place(array $in, ?User $user): array
    {
        $a = $this->assemble($in, $user);
        $customer = $a['customer'];
        $mode = $in['payment_mode'] ?? 'pay_later';   // online | pay_later | account
        $method = ! empty($in['payment_method_id']) ? PaymentMethod::find($in['payment_method_id']) : null;

        if ($mode === 'online' && (! $method || ! PaymentMethod::offeredAtCheckout()->whereKey($method->id)->exists())) {
            throw new BooksException('Choose a payment method.');
        }
        if ($mode === 'account' && ! $customer) {
            throw new BooksException('Sign in to pay on account.');
        }
        if ($a['hasGift']) {
            if ($mode === 'account') {
                throw new BooksException('A gift voucher can\'t be put on account — pay for it online; the code is issued when the payment arrives.');
            }
            if ($this->giftCodes($in)) {
                throw new BooksException('A gift voucher can\'t be paid for with another gift voucher.');
            }
        }
        if (! $customer && (empty($in['customer_email']) || empty($in['customer_phone']))) {
            throw new BooksException('Enter your email and phone so we can reach you about your order.');
        }

        // How they say they will pay: a record on the order, nothing posts. An offered ledger (bank, till, cash on delivery),
        // an automatic online method, on credit, or "later". A method row stands for the ledger so converting to a
        // Cash Sale points at the right money ledger.
        $modes = app(PaymentModeService::class);
        $intent = ['kind' => 'later', 'label' => 'Pay later'];
        if ($mode === 'account') {
            $intent = ['kind' => 'credit', 'label' => 'On credit (charged to your account)'];
        } elseif ($mode === 'online' && $method) {
            $intent = ['kind' => 'online', 'label' => $method->name, 'instructions' => $method->instructions, 'method_id' => $method->id, 'ledger_id' => $method->ledger_id];
            $a['data']['payment_method_id'] = $method->id;
        } elseif (! empty($in['payment_ledger_id'])) {
            $intent = $modes->intentFor((int) $in['payment_ledger_id']);
            $a['data']['payment_method_id'] = $modes->methodFor((int) $in['payment_ledger_id'])->id;
        }
        $a['data']['meta'] = array_merge($a['data']['meta'] ?? [], ['payment_intent' => $intent]);

        return DB::transaction(function () use ($a, $in, $user, $customer, $mode, $method) {
            // Pay later: nothing is spent now; the order only remembers which gift vouchers the customer meant to use
            if ($mode === 'pay_later' && ($codes = $this->giftCodes($in)) && $customer) {
                $a['data']['gift_codes'] = $codes;
            }
            $order = $this->vouchers->placeOrder($a['data'], null);
            $total = (float) $order->total_amount;

            $giftApplied = 0.0;
            $tenders = [];
            if ($codes = $this->giftCodes($in)) {
                $giftMethod = PaymentMethod::where('kind', 'gift_voucher')->where('is_active', true)->first() ?? throw new BooksException('Gift vouchers are not set up yet (payment method missing).');
                foreach ($this->giftApplications($codes, $total, $a['currency'], $customer) as $g) {
                    if ($g['applied'] <= 0) {
                        continue;
                    }
                    $giftApplied = round($giftApplied + $g['applied'], 2);
                    $tenders[] = ['payment_method_id' => $giftMethod->id, 'amount' => $g['applied'], 'gift_voucher_code' => $g['code']];
                }
            }
            $due = round($total - $giftApplied, 2);

            // 1. a gift voucher covers everything → paid now
            if ($giftApplied > 0 && $due <= 0.005) {
                $sale = $this->settle($order, $tenders, $user);

                return ['order' => $this->orderSummary($order), 'sale' => $this->orderSummary($sale), 'status' => 'paid', 'message' => 'Paid with your gift voucher. Thank you!'];
            }
            // 2. pay online
            if ($mode === 'online') {
                if ($method->gateway === 'mpesa_stk') {
                    $attempt = $this->gateway->initiateMpesa($order, $method, (string) ($in['phone'] ?? $order->meta['contact']['phone'] ?? ''), $tenders, $due, $user);

                    return ['order' => $this->orderSummary($order), 'attempt' => ['id' => $attempt->id, 'status' => $attempt->status, 'amount' => (float) $attempt->amount], 'status' => 'awaiting_payment',
                        'message' => 'Check your phone and enter your M-Pesa PIN to finish paying.'];
                }
                // any other online method with no gateway: the customer pays offline and we confirm it
                throw new BooksException("{$method->name} can't be charged automatically yet — choose another way to pay.");
            }
            if ($giftApplied > 0 && $mode !== 'pay_later') {
                throw new BooksException('A gift voucher can\'t be used on account — pay now, or choose pay later and we\'ll apply it when the order is paid.');
            }
            // 3. on account
            if ($mode === 'account') {
                $invoice = $this->onAccount($order, $customer, $user);

                return ['order' => $this->orderSummary($order), 'sale' => $this->orderSummary($invoice), 'status' => 'invoiced', 'message' => 'Invoiced to your account.'];
            }

            return ['order' => $this->orderSummary($order), 'status' => 'placed', 'message' => ($giftApplied > 0 ? 'Order placed. Your gift voucher will be applied when the order is paid.' : 'Order placed. We will confirm payment and delivery with you.')];
        });
    }

    /**
     * The customer changes their Sales Order before it has been converted: the cart is priced again from scratch at today's
     * prices and discounts and the order is altered in place (the edit log keeps the old version). Contact details and
     * anything the customer does not resend stay as they were.
     */
    public function updateOrder(Voucher $order, array $in, ?User $user): Voucher
    {
        if ($order->status === Voucher::CANCELLED) {
            throw new BooksException('A cancelled order can not be changed.');
        }
        if ($order->children()->where('status', Voucher::POSTED)->exists()) {
            throw new BooksException('This order has already been turned into an invoice or sale, so it can no longer be changed here. Ask us for a review instead.');
        }
        $old = $order->meta['contact'] ?? [];
        $in += [
            'customer_email' => $old['email'] ?? null, 'customer_phone' => $old['phone'] ?? null, 'customer_name' => $old['name'] ?? null,
            'shipping_address' => $old['shipping_address'] ?? null, 'customer_notes' => $order->narration,
        ];
        if (! array_key_exists('delivery_method', $in)) {
            $in['delivery_method'] = $old['delivery_method'] ?? null;   // unchanged unless they chose another
        }
        if (! array_key_exists('promo_code', $in) && ! empty($order->meta['promo_code_id'])) {
            $in['promo_code'] = \App\Models\ReferralCode::whereKey($order->meta['promo_code_id'])->value('code');
        }
        $a = $this->assemble($in, $user);
        if ($a['hasGift']) {
            throw new BooksException('A gift voucher is paid for when it is bought; remove it and buy it again at checkout.');
        }
        $drop = ['discounts', 'promo_code_id', 'referral_code_id', 'rounding', 'contact'];
        if (array_key_exists('use_credit', $in)) {
            $drop[] = 'use_credit';   // they changed the tick; what is sent now replaces what was remembered
        }
        $keep = array_diff_key($order->meta ?? [], array_flip($drop));
        $a['data']['meta'] = array_merge($keep, $a['data']['meta']);

        return $this->vouchers->alter($order, $a['data'], null);
    }

    /** Paid at checkout: the order becomes a Cash Sale. If stock can't be taken right now the sale is still recorded; delivery moves the stock. */
    public function settle(Voucher $order, array $tenders, ?User $user): Voucher
    {
        try {
            $sale = $this->vouchers->convert($order, VoucherType::CASH_SALE, ['tenders' => $tenders, 'reference_no' => $order->voucher_number], null);
        } catch (BooksException $e) {
            if (! str_contains(strtolower($e->getMessage()), 'stock')) {
                throw $e;
            }
            $sale = $this->vouchers->convert($order, VoucherType::CASH_SALE, ['tenders' => $tenders, 'reference_no' => $order->voucher_number, 'moves_stock' => false,
                'meta' => ['stock_pending' => true]], null);
        }
        return $sale;
    }

    private function onAccount(Voucher $order, Customer $customer, ?User $user): Voucher
    {
        $limit = (float) ($customer->credit_limit ?? 0);
        if (! $customer->has_credit_account || $limit <= 0) {
            throw new BooksException('You do not have a credit account. Choose another way to pay.');
        }
        $ledger = \App\Models\Books\Ledger::where('customer_id', $customer->id)->first();
        $owed = $ledger ? app(LedgerService::class)->balance($ledger->id) : 0.0;   // debit balance = what they owe (base)
        $orderBase = (float) $order->base_total;
        $limitBase = $this->money->convert($limit, $this->money->currencyFrom($customer->credit_currency_id ?? $customer->currency_id), $this->money->getBaseCurrency());
        if ($owed + $orderBase - $limitBase > 0.005) {
            throw new BooksException('This order would take you over your credit limit. Pay part now or settle an outstanding invoice first.');
        }
        $days = (int) ($customer->credit_terms_days ?: 30);
        $invoice = $this->vouchers->convert($order, VoucherType::SALES, ['due_date' => today()->addDays($days)->toDateString()], null);
        return $invoice;
    }

    private function orderSummary(Voucher $v): array
    {
        return ['id' => $v->id, 'number' => $v->voucher_number, 'type' => $v->type?->name ?? null, 'total' => (float) $v->total_amount, 'currency' => $v->currency?->code ?? null];
    }
}
