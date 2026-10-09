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

    /** The branch an order is placed at: one customers can buy from. None given means the branch customers land on. */
    private function sellingLocationId($asked): ?int
    {
        if ($asked === null || $asked === '') {
            return Location::defaultSelling()?->id ?? Location::default()?->id;
        }
        $loc = Location::query()->sellsToCustomers()->find((int) $asked);
        if (! $loc) {
            throw new BooksException('That branch does not take orders from customers. Choose another branch.');
        }

        return $loc->id;
    }

    /** @return array{data: array, customer: ?Customer, currency: Currency, discounts: array, notes: array} */
    private function assemble(array $in, ?User $user): array
    {
        $customer = $user?->customer;
        // Orders are always charged in the base (operating) currency; the shopper's chosen currency is only how prices are shown.
        $currency = $this->money->getBaseCurrency();
        $locationId = $this->sellingLocationId($in['location_id'] ?? null);
        $type = VoucherType::byBase(VoucherType::SALES_ORDER) ?? throw new BooksException('Ordering is switched off (the Sales Order voucher type is off).');

        $lines = [];
        foreach ($in['items'] ?? [] as $it) {
            $qty = (float) ($it['quantity'] ?? 1);
            if (! empty($it['hamper_id'])) {
                $lines[] = ['type' => 'hamper', 'hamper_id' => (int) $it['hamper_id'], 'quantity' => $qty];
            } elseif (! empty($it['product_id'])) {
                // a product with several variants must say which one — never quietly the default
                if (empty($it['variant_id']) && \App\Models\ProductVariant::where('product_id', (int) $it['product_id'])->where('status', \App\Models\ProductVariant::STATUS_ACTIVE)->count() > 1) {
                    $name = \App\Models\Product::whereKey((int) $it['product_id'])->value('name') ?? 'that product';
                    throw new BooksException("Choose an option for {$name} before you check out.");
                }
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
        $promoOnly = [];   // a hamper that takes promo codes: its price, for a promo code only
        foreach ($pre['lines'] as $i => $l) {
            $isGift = ($lines[$i]['kind'] ?? null) === 'gift_voucher';
            $gross[$i] = (! empty($l['is_header']) || $isGift) ? 0.0 : (float) $l['amount'];   // hampers are not discounted by the customer's own discounts; a gift voucher never is
            if (! empty($l['is_header']) && ! empty($l['hamper_id']) && app(HamperEditionService::class)->takesPromo((int) $l['hamper_id'])) {
                $promoOnly[$i] = (float) $l['amount'];
            }
        }
        $sub = array_sum($gross);
        $hamperGoods = array_sum($promoOnly);

        // the customer's discounts (personal / tier / type, referral, a promo code) come from one engine, are taken off
        // BEFORE tax, and are spread over the lines so every line's VAT follows
        $discounts = [];
        $perLine = array_fill(0, count($lines), []);
        $referralCodeId = null;
        $promoCodeId = null;
        $promoNet = 0.0;
        $promoReferral = 0.0;
        if ($customer && ($sub > 0 || $hamperGoods > 0)) {
            $rows = $this->discountEngine->evaluate($customer, $sub, $currency, null, ! empty($in['promo_code']) ? (string) $in['promo_code'] : null, $hamperGoods);
            foreach ($rows as $r) {
                if ($r['error']) {
                    throw new BooksException($r['error']);
                }
            }
            $sp = $this->discountEngine->spread($gross, $rows, array_replace($gross, $promoOnly));
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
            $promoNet = round($sub + $hamperGoods + $promoNet, 2);
        } elseif (! empty($in['promo_code'])) {
            throw new BooksException($customer ? 'A promo code can not be used on what is in your cart.' : 'Sign in to use a promo code.');
        }
        $promoAccepted = $sub > 0 || $hamperGoods > 0;   // false when the cart holds only hampers that take no promo codes (and gift vouchers)

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
                'attribution' => app(\App\Services\Campaigns\CampaignAttribution::class)->resolve($in['attribution'] ?? null, $in['items'] ?? []),
            ], fn ($v) => $v !== null),
        ];

        // a preorder cart: products with an open offer at this branch and hampers whose short components have one, taken on their own (never mixed with gift vouchers)
        $placeable = null;
        $buyer = null;
        if (! empty($in['preorder'])) {
            $pre = app(\App\Services\Preorders\PreorderService::class);
            $items = array_values(array_filter($final, fn ($l) => in_array($l['type'], ['product', 'hamper'], true)));
            if ($hasGift || count($items) !== count(array_filter($final, fn ($l) => ($l['kind'] ?? null) !== 'shipping'))) {
                throw new BooksException('A preorder is checked out on its own: only preorder items in the cart.');
            }
            $checks = [];
            foreach ($items as $l) {
                if ($l['type'] === 'hamper') {
                    $h = \App\Models\Hamper::findOrFail((int) $l['hamper_id']);
                    if ($pre->hamperState($h, $user)['state'] === 'buy') {
                        throw new BooksException("{$h->name} is in stock now. Order it in the normal cart.");
                    }
                    array_push($checks, ...$pre->hamperLines($h, (float) $l['quantity']));
                } else {
                    $checks[] = $l;
                }
            }
            $buyer = ['customer_id' => $customer?->id, 'email' => $contact['email'] ?? null];
            $placeable = $pre->assertPlaceable($checks, (int) $locationId, $user, false, $buyer);
            $data['series_id'] = $pre->seriesId();
            $data['meta'] = array_merge($data['meta'] ?? [], $pre->orderMeta($placeable));
        }

        return compact('data', 'customer', 'currency', 'discounts', 'hasGift', 'promoNet', 'promoReferral', 'promoAccepted', 'placeable', 'buyer') + ['option' => $option, 'locationId' => $locationId];
    }

    /**
     * The terms this cart has to be agreed to under: the order terms (products, services, gift vouchers), the hamper policy
     * (when a hamper is in it) and the auction terms (when an auction item is). Only policies the shop has switched on count.
     *
     * @return array<int, array{0: \App\Models\Policy, 1: string}> policy and the context its acceptance is logged under
     */
    private function termsFor(array $in): array
    {
        $items = $in['items'] ?? [];
        $want = [];
        if (collect($items)->contains(fn ($i) => empty($i['hamper_id']) && empty($i['auction_id']))) {
            $want['standard_order_policy'] = 'standard_checkout';
        }
        if (collect($items)->contains(fn ($i) => ! empty($i['hamper_id']))) {
            $want['hamper_policy'] = 'hamper_checkout';
        }
        if (collect($items)->contains(fn ($i) => ! empty($i['auction_id']))) {
            $want['auction_terms'] = 'auction_bidding';
        }
        $out = [];
        foreach ($want as $key => $context) {
            if ($policy = \App\Models\Policy::where('key', $key)->where('is_active', true)->first()) {
                $out[] = [$policy, $context];
            }
        }

        return $out;
    }

    /** An order can not be placed without agreeing to every set of terms that applies to it. */
    private function assertTermsAccepted(array $in): void
    {
        foreach ($this->termsFor($in) as [$policy]) {
            $agreed = collect($in['policy_acceptances'] ?? [])->contains(fn ($a) => ($a['key'] ?? null) === $policy->key && ($a['response'] ?? 'accepted') === 'accepted');
            if (! $agreed) {
                throw new BooksException('Please agree to the ' . $policy->title . ' to place your order.');
            }
        }
    }

    /** Keep the proof: who agreed to which version of which terms, on which order, from where, and what the terms said. */
    private function logTermsAcceptance(Voucher $order, array $in, ?Customer $customer, ?User $user): void
    {
        foreach ($this->termsFor($in) as [$policy, $context]) {
            \App\Models\PolicyAcceptance::create([
                'policy_id' => $policy->id, 'policy_key' => $policy->key, 'policy_version' => $policy->version, 'policy_snapshot' => $policy->content,
                'customer_id' => $customer?->id, 'user_id' => $user?->id, 'customer_number' => $customer?->customer_number,
                'action_context' => $context, 'reference_type' => 'voucher', 'reference_id' => $order->id,
                'response' => 'accepted', 'ip_address' => request()->ip(), 'user_agent' => substr((string) request()->userAgent(), 0, 500),
                'was_successful' => true, 'flagged' => false, 'accepted_at' => now(),
            ]);
        }
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
        if (! empty($in['together'])) {
            return $this->quoteTogether($in, $user);
        }
        $a = $this->assemble($in, $user);
        $p = $this->vouchers->preview($a['data'], null);

        $held = app(HamperEditionService::class)->restrictedFromLines($p['lines'] ?? [], 'allow_store_credit');   // hampers that do not accept gift vouchers
        $gifts = $this->giftApplications($this->giftCodes($in), max(0.0, round((float) $p['total'] - $held, 2)), $a['currency'], $a['customer']);
        $applied = round(array_sum(array_column($gifts, 'applied')), 2);
        $gift = $gifts ? ['code' => implode(', ', array_column($gifts, 'code')), 'applied' => $applied, 'vouchers' => $gifts,
            'note' => $held > 0 ? 'A hamper in your order does not accept gift vouchers, so they cover the rest only.' : null] : null;

        return [
            'currency' => $a['currency']->only(['id', 'code', 'symbol']), 'lines' => $p['lines'], 'subtotal' => $p['subtotal'], 'tax_total' => $p['tax_total'], 'tax_breakdown' => $p['tax_breakdown'],
            'total' => $p['total'], 'discounts' => $a['discounts'], 'gift' => $gift, 'customer' => $this->customerCard($a['customer']),
            'due_now' => round($p['total'] - $applied, 2), 'promo_accepted' => $a['promoAccepted'],
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
        if (! empty($in['together'])) {
            return $this->placeTogether($in, $user);
        }
        $a = $this->assemble($in, $user);
        $customer = $a['customer'];
        $mode = $in['payment_mode'] ?? 'pay_later';   // online | pay_later | account
        $method = ! empty($in['payment_method_id']) ? PaymentMethod::find($in['payment_method_id']) : null;

        if ($mode === 'online' && (! $method || ! PaymentMethod::offeredAtCheckout()->whereKey($method->id)->exists())) {
            throw new BooksException('Choose a payment method.');
        }
        if ($mode === 'credit') {
            if (! $customer) {
                throw new BooksException('Sign in to pay from the money you have paid us.');
            }
            if ($this->giftCodes($in)) {
                throw new BooksException('Pay with a gift voucher or with your overpayment, not both on one order.');
            }
            if (empty($a['data']['use_credit'])) {
                throw new BooksException('Tick the money you want to use.');
            }
        }
        if ($mode === 'account' && ! $customer) {
            throw new BooksException('Sign in to pay on account.');
        }
        if (! empty($in['preorder']) && $mode === 'account') {
            throw new BooksException('A preorder is paid in full when you order it. Choose how to pay.');
        }
        if ($a['hasGift']) {
            if ($mode === 'account') {
                throw new BooksException('A gift voucher can\'t be put on account — pay for it online; the code is issued when the payment arrives.');
            }
            if ($this->giftCodes($in)) {
                throw new BooksException('A gift voucher can\'t be paid for with another gift voucher.');
            }
        }
        $this->assertTermsAccepted($in);
        if (! $customer && (empty($in['customer_email']) || empty($in['customer_phone']))) {
            throw new BooksException('Enter your email and phone so we can reach you about your order.');
        }

        // How they say they will pay: a record on the order, nothing posts. An offered ledger (bank, till, cash on delivery),
        // an automatic online method, on credit, or "later". A method row stands for the ledger so converting to a
        // Cash Sale points at the right money ledger.
        $modes = app(PaymentModeService::class);
        $intent = ['kind' => 'later', 'label' => 'Pay later'];
        if ($mode === 'credit') {
            $intent = ['kind' => 'overpayment', 'label' => 'Paid from the money you had paid us'];
        } elseif ($mode === 'account') {
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
            $placeable = null;
            if ($a['placeable'] !== null) {   // the offers are locked, then the places counted again, so two customers can not take the last one
                $placeable = app(\App\Services\Preorders\PreorderService::class)->assertPlaceable(array_map(fn ($p) => ['variant_id' => $p['variant_id'], 'quantity' => $p['quantity'], 'location_id' => $p['location_id'], 'lenient' => $p['lenient'], 'hamper_ids' => $p['hamper_ids']], array_values($a['placeable'])), (int) $a['locationId'], $user, true, $a['buyer']);
            }
            $order = $this->vouchers->placeOrder($a['data'], null);
            if ($placeable !== null) {
                app(\App\Services\Preorders\PreorderService::class)->record($order, $placeable, (int) $a['locationId']);
            }
            $this->logTermsAcceptance($order, $in, $customer, $user);
            DB::afterCommit(fn () => app(\App\Services\Notify\OrderNotices::class)->placed($order));   // "we have your order", once the order is really saved
            if ($customer && ! empty($in['customer_phone'])) {   // the phone given here can become their WhatsApp number (whether it counts is the company's setting)
                app(\App\Services\Notify\NotificationPreferences::class)->noteCheckoutNumber($customer, (string) $in['customer_phone']);
            }
            $total = (float) $order->total_amount;

            $giftApplied = 0.0;
            $tenders = [];
            if ($codes = $this->giftCodes($in)) {
                $giftMethod = PaymentMethod::where('kind', 'gift_voucher')->where('is_active', true)->first() ?? throw new BooksException('Gift vouchers are not set up yet (payment method missing).');
                $held = app(HamperEditionService::class)->restrictedOn($order, 'allow_store_credit');
                foreach ($this->giftApplications($codes, max(0.0, round($total - $held, 2)), $a['currency'], $customer) as $g) {
                    if ($g['applied'] <= 0) {
                        continue;
                    }
                    $giftApplied = round($giftApplied + $g['applied'], 2);
                    $tenders[] = ['payment_method_id' => $giftMethod->id, 'amount' => $g['applied'], 'gift_voucher_code' => $g['code']];
                }
            }
            $due = round($total - $giftApplied, 2);

            // 0. paid from money they had already paid us (an overpayment or advance): the order becomes an invoice and the ticked
            //    credit settles it — nothing new is charged
            if ($mode === 'credit') {
                $held = (float) array_sum(array_column(array_filter(app(OpenBillsService::class)->forCustomer($customer->id), fn ($c) => in_array($c['voucher_id'], $a['data']['use_credit'], true)), 'amount'));
                if ($held + 0.005 < $total) {
                    throw new BooksException('The money you chose (' . number_format($held, 2) . ') does not cover this order (' . number_format($total, 2) . '). Choose another way to pay, or pay the rest when it is invoiced.');
                }
                $invoice = $this->vouchers->convert($order, VoucherType::SALES, ['due_date' => today()->toDateString()], null);   // applies the ticked credit as it is made
                $paid = $this->vouchers->outstanding($invoice) <= 0.005;

                return ['order' => $this->orderSummary($order), 'sale' => $this->orderSummary($invoice), 'status' => $paid ? 'paid' : 'invoiced',
                    'message' => $paid ? 'Paid from the money you had paid us. Thank you!' : 'Invoiced; part is still to pay.'];
            }
            // 1. a gift voucher covers everything → paid now
            if ($giftApplied > 0 && $due <= 0.005) {
                $sale = $this->settle($order, $tenders, $user);

                return ['order' => $this->orderSummary($order), 'sale' => $this->orderSummary($sale), 'status' => 'paid', 'message' => 'Paid with your gift voucher. Thank you!'];
            }
            // 2. pay online
            if ($mode === 'online') {
                if ($method->gateway === 'mpesa_stk' && ! empty($in['_defer_online'])) {   // checked out together with another order: one prompt for both is made by placeTogether
                    return ['order' => $this->orderSummary($order), 'status' => 'awaiting_payment', 'due' => $due, 'message' => ''];
                }
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

    // ── a cart with ready-now AND preorder items, checked out in one go ─────────────────────────────────

    /**
     * The cart's items split by their own `preorder` flag: [ready-now request, preorder request]. The preorder part never carries the promo code (a code is used
     * once, on the ready-now order); each part is priced, delivered and numbered exactly as if it were checked out alone.
     *
     * @return array{0: array, 1: array}
     */
    private function splitTogether(array $in): array
    {
        $ready = [];
        $pre = [];
        foreach ($in['items'] ?? [] as $it) {
            if (! empty($it['preorder'])) {
                $pre[] = $it;
            } else {
                $ready[] = $it;
            }
        }
        if (! $ready || ! $pre) {
            throw new BooksException('Checking out together needs both ready-now items and preorder items in the cart.');
        }
        if (! empty($in['gift_vouchers'])) {
            throw new BooksException('A gift voucher is bought on its own: check it out separately.');
        }
        $base = array_merge($in, ['together' => false, '_together' => true, 'gift_voucher_code' => null, 'gift_voucher_codes' => [], 'use_credit' => null]);

        return [array_merge($base, ['items' => $ready, 'preorder' => false]), array_merge($base, ['items' => $pre, 'preorder' => true, 'promo_code' => null])];
    }

    /** What the two orders will cost, as one summary with a line per part. Nothing is saved. */
    private function quoteTogether(array $in, ?User $user): array
    {
        [$readyIn, $preIn] = $this->splitTogether($in);
        $a = $this->quote($readyIn, $user);
        $b = $this->quote($preIn, $user);
        $tax = [];
        foreach (array_merge($a['tax_breakdown'] ?? [], $b['tax_breakdown'] ?? []) as $t) {
            $k = ($t['label'] ?? '') . '|' . ($t['percent'] ?? '');
            $tax[$k] ??= ['label' => $t['label'] ?? 'Tax', 'percent' => $t['percent'] ?? null, 'amount' => 0.0];
            $tax[$k]['amount'] = round($tax[$k]['amount'] + (float) $t['amount'], 2);
        }
        $available = ($a['available'] ?? []);
        $available['gift_vouchers'] = [];   // not on a combined checkout

        return [
            'currency' => $a['currency'], 'lines' => array_merge($a['lines'], array_map(fn ($l) => $l + ['preorder' => true], $b['lines'])),
            'subtotal' => round($a['subtotal'] + $b['subtotal'], 2), 'tax_total' => round($a['tax_total'] + $b['tax_total'], 2), 'tax_breakdown' => array_values($tax),
            'total' => round($a['total'] + $b['total'], 2), 'discounts' => array_merge($a['discounts'], $b['discounts']), 'gift' => null, 'customer' => $a['customer'],
            'due_now' => round($a['due_now'] + $b['due_now'], 2), 'promo_accepted' => $a['promo_accepted'], 'available' => $available,
            'parts' => [['kind' => 'ready', 'total' => $a['total']], ['kind' => 'preorder', 'total' => $b['total']]],
        ];
    }

    /**
     * Two orders from one checkout: the ready-now order and the preorder (PRE-), placed together or not at all, and paid with ONE payment. Online (M-Pesa) there is a
     * single prompt for both totals; when it is confirmed each order becomes its own Cash Sale (GatewayPaymentService::settle). Otherwise each order is placed the way it
     * would be alone. Gift vouchers and paying from credit or on account are not offered on a combined checkout: they are worked out per order, so those carts are checked
     * out separately.
     */
    private function placeTogether(array $in, ?User $user): array
    {
        [$readyIn, $preIn] = $this->splitTogether($in);
        $mode = $in['payment_mode'] ?? 'pay_later';
        if (in_array($mode, ['account', 'credit'], true)) {
            throw new BooksException('Paying on account or from your credit works on one order at a time: check out the ready-now items and the preorder separately.');
        }
        if ($this->giftCodes($in)) {
            throw new BooksException('Gift vouchers work on one order at a time: check out the ready-now items and the preorder separately.');
        }
        $defer = $mode === 'online';

        return DB::transaction(function () use ($readyIn, $preIn, $in, $user, $defer) {
            $a = $this->place($readyIn + ['_defer_online' => $defer], $user);
            $b = $this->place($preIn + ['_defer_online' => $defer], $user);
            $this->pair((int) $a['order']['id'], (int) $b['order']['id']);
            $orders = [$a['order'], $b['order']];

            if ($defer && ($a['status'] ?? null) === 'awaiting_payment') {
                $method = PaymentMethod::find($in['payment_method_id']);
                $primary = Voucher::findOrFail($a['order']['id']);
                $attempt = $this->gateway->initiateMpesa($primary, $method, (string) ($in['phone'] ?? $primary->meta['contact']['phone'] ?? ''), [], round((float) $a['due'] + (float) $b['due'], 2), $user);

                return ['order' => $a['order'], 'orders' => $orders, 'attempt' => ['id' => $attempt->id, 'status' => $attempt->status, 'amount' => (float) $attempt->amount], 'status' => 'awaiting_payment',
                    'message' => 'Check your phone and enter your M-Pesa PIN to pay for both orders.'];
            }

            return ['order' => $a['order'], 'orders' => $orders, 'status' => 'placed',
                'message' => 'Both orders are placed: ' . $a['order']['number'] . ' (ready now) and ' . $b['order']['number'] . ' (preorder). We will confirm payment and delivery with you.'];
        });
    }

    /** Each of the two orders remembers the other, so one payment can settle both. */
    private function pair(int $a, int $b): void
    {
        foreach ([[$a, $b], [$b, $a]] as [$id, $other]) {
            $v = Voucher::findOrFail($id);
            $v->meta = array_merge($v->meta ?? [], ['paired_order_id' => $other]);
            $v->save();
        }
    }

    private function orderSummary(Voucher $v): array
    {
        return ['id' => $v->id, 'number' => $v->voucher_number, 'type' => $v->type?->name ?? null, 'total' => (float) $v->total_amount, 'currency' => $v->currency?->code ?? null];
    }
}
