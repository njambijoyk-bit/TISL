<?php

namespace App\Services\Menus;

use App\Models\Books\PaymentMethod;
use App\Models\Books\Voucher;
use App\Models\Books\VoucherType;
use App\Models\Currency;
use App\Models\Location;
use App\Models\Menus\CookingRequest;
use App\Models\Menus\CookingRequestLine;
use App\Models\Menus\Dish;
use App\Models\Menus\OptionGroup;
use App\Models\User;
use App\Services\Books\BooksException;
use App\Services\Books\GatewayPaymentService;
use App\Services\Books\VoucherService;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;

/**
 * Cooking services, first slice: made-to-order cakes and catering.
 *
 * A customer asks (no sign-in needed). A cake is priced from its dishes and choices and is quoted at once; a catering request waits for staff to price it. The quote carries a deposit.
 * Accepting needs a customer account (the balance is owed on an invoice): the quote becomes a Sales Order and an invoice (no stock moves yet), and the deposit goes through the same
 * M-Pesa and card gateways as the shop. When the deposit is in, the job is confirmed. The balance is paid online or at the counter before it is handed over. The stock is taken when it is ready.
 */
class CookingService
{
    private static ?bool $installed = null;

    private const TZ_DEFAULT = 'Africa/Nairobi';

    public static function installed(): bool
    {
        if (app()->runningUnitTests()) {
            return Schema::hasTable('menus_requests') && Schema::hasTable('menus_request_lines');
        }

        return self::$installed ??= Schema::hasTable('menus_requests') && Schema::hasTable('menus_request_lines');
    }

    public function __construct(private VoucherService $vouchers, private GatewayPaymentService $gateway, private DishInfo $info, private DishPricing $pricing, private MenuOrderService $orders,
        private CookingNotices $notices)
    {
    }

    private function tz(): string
    {
        return (string) config('app.timezone', self::TZ_DEFAULT);
    }

    // ── what can be ordered ───────────────────────────────────────────────

    /** Dishes that are made to order (they have a lead time), with their choices. @return array<int, array<string, mixed>> */
    public function cakes(): array
    {
        if (! Schema::hasColumn('menus_dishes', 'lead_hours')) {
            return [];
        }
        $dishes = Dish::where('is_active', true)->where('lead_hours', '>', 0)->whereNotNull('variant_id')->orderBy('sort_order')->orderBy('name')->get();
        $groups = OptionGroup::with(['options' => fn ($q) => $q->where('is_active', true)->orderBy('sort_order')])->whereIn('dish_id', $dishes->pluck('id'))->orderBy('sort_order')->get()->groupBy('dish_id');
        $loc = Location::defaultSelling();
        $out = [];
        foreach ($dishes as $d) {
            $price = $this->info->money($d, (int) ($loc->id ?? 0))['price'];
            if ($price === null) {
                continue;
            }
            $out[] = ['id' => $d->id, 'name' => $d->name, 'description' => $d->description, 'photo' => $d->photo, 'price' => $price, 'lead_hours' => (int) $d->lead_hours,
                'groups' => ($groups[$d->id] ?? collect())->map(fn ($g) => ['name' => $g->name, 'kind' => $g->kind, 'min' => (int) $g->min_choices, 'max' => $g->max_choices,
                    'options' => $g->options->map(fn ($o) => ['id' => $o->id, 'name' => $o->name, 'price_delta' => (float) $o->price_delta, 'is_default' => (bool) $o->is_default])->values()->all()])->values()->all()];
        }

        return $out;
    }

    // ── asking ────────────────────────────────────────────────────────────

    /**
     * A customer's request. A cake is priced and quoted at once; a catering request waits for staff.
     *
     * @param array<string, mixed> $in kind, name, phone, email?, event_at, fulfil, address?, headcount?, message?, wishes?, items [{dish_id, quantity, option_ids?, note?}], location_id?
     */
    public function request(array $in, ?User $user = null, ?Carbon $now = null): CookingRequest
    {
        $this->assertOn();
        $now ??= now();
        $kind = (string) ($in['kind'] ?? '');
        if (! isset(CookingRequest::KINDS[$kind])) {
            throw new BooksException('Choose a cake or catering.');
        }
        $settings = MenusSettings::all();
        $loc = $this->orders->location($in['location_id'] ?? null);
        $contact = $this->contact($in, $user);
        $fulfil = (string) ($in['fulfil'] ?? 'pickup');
        if (! in_array($fulfil, $kind === 'cake' ? ['pickup', 'delivery'] : ['pickup', 'delivery', 'serve'], true)) {
            throw new BooksException('Choose how you would like it: '.($kind === 'cake' ? 'collect or delivered.' : 'collect, delivered or served at your venue.'));
        }
        $address = trim((string) ($in['address'] ?? ''));
        if ($fulfil !== 'pickup' && $address === '') {
            throw new BooksException($fulfil === 'serve' ? 'Enter the venue.' : 'Enter the delivery address.');
        }
        $headcount = isset($in['headcount']) && $in['headcount'] !== '' ? (int) $in['headcount'] : null;
        if (($kind === 'catering' && (! $headcount || $headcount < 1)) || ($headcount !== null && ($headcount < 1 || $headcount > 5000))) {
            throw new BooksException('How many people is it for?');
        }
        $wanted = ! empty($in['items']) ? $this->orders->wanted($in['items']) : [];
        if ($kind === 'cake' && ! $wanted) {
            throw new BooksException('Choose the cake.');
        }

        [$lines, $needHours] = $this->requestLines($kind, $loc, $wanted, (int) $settings['custom_lead_hours']);
        $at = $this->eventTime($in['event_at'] ?? null, $now);
        if ($at->lt($now->copy()->addHours($needHours))) {
            throw new BooksException($kind === 'cake' ? "We need at least {$this->hours($needHours)} notice for this cake. Choose a later date." : "We need at least {$this->hours($needHours)} notice for catering. Choose a later date.");
        }

        $message = trim((string) ($in['message'] ?? ''));
        $wishes = trim((string) ($in['wishes'] ?? ''));

        $r = DB::transaction(function () use ($kind, $loc, $contact, $at, $fulfil, $address, $headcount, $message, $wishes, $in, $user, $lines, $now) {
            $r = CookingRequest::create(['number' => 'CR-'.Str::upper(Str::random(8)), 'track_token' => Str::random(40), 'kind' => $kind, 'location_id' => $loc->id, 'customer_id' => $user?->customer?->id,
                'user_id' => $user?->id, 'name' => $contact['name'], 'email' => $contact['email'], 'phone' => $contact['phone'], 'event_at' => $at, 'fulfil' => $fulfil, 'address' => $address ?: null,
                'headcount' => $headcount, 'details' => array_filter(['message' => mb_substr($message, 0, 200), 'wishes' => mb_substr($wishes, 0, 1000)]) ?: null,
                'notes' => filled($in['notes'] ?? null) ? mb_substr(trim((string) $in['notes']), 0, 1000) : null, 'status' => 'requested', 'currency_id' => Currency::getBaseCurrency()?->id]);
            $r->update(['number' => 'CR-'.str_pad((string) $r->id, 6, '0', STR_PAD_LEFT)]);
            $this->storeLines($r, $lines);
            if ($kind === 'cake') {   // priced from the dish and its choices: quoted at once
                $this->price($r->fresh('lines'), null, null, $now);
            }

            return $r->fresh('lines');
        });
        $this->notices->requested($r);

        return $r;
    }

    private function hours(int $h): string
    {
        return $h >= 24 && $h % 24 === 0 ? ($h === 24 ? '1 day' : ($h / 24).' days') : ($h === 1 ? '1 hour' : "{$h} hours");
    }

    /** @return array{0: array<int, array<string, mixed>>, 1: int} the lines (dish, quantity, unit price, choices) and the notice needed in hours */
    private function requestLines(string $kind, Location $loc, array $wanted, int $cateringHours): array
    {
        $lines = [];
        $need = $kind === 'cake' ? 0 : $cateringHours;
        foreach ($wanted as $w) {
            $dish = Dish::find($w['dish_id']);
            if (! $dish || ! $dish->is_active || ! $dish->variant_id) {
                throw new BooksException('One of the dishes is not available any more.');
            }
            if ($kind === 'cake') {
                if (! Schema::hasColumn('menus_dishes', 'lead_hours') || ! (int) $dish->lead_hours) {
                    throw new BooksException("{$dish->name} is not made to order.");
                }
                $need = max($need, (int) $dish->lead_hours);
            }
            $base = $this->info->money($dish, (int) $loc->id)['price'];
            if ($base === null) {
                throw new BooksException("{$dish->name} has no price yet.");
            }
            $p = $this->pricing->resolve($dish, $w['option_ids']);
            $lines[] = ['dish_id' => $dish->id, 'name' => $dish->name, 'quantity' => $w['quantity'], 'per_head' => false, 'unit_price' => round($base + $p['price_delta'], 2), 'options' => $p['options'], 'note' => $w['note']];
        }

        return [$lines, $need];
    }

    private function storeLines(CookingRequest $r, array $lines): void
    {
        CookingRequestLine::where('request_id', $r->id)->delete();
        foreach ($lines as $l) {
            CookingRequestLine::create(['request_id' => $r->id, 'dish_id' => $l['dish_id'] ?? null, 'name' => mb_substr((string) $l['name'], 0, 200), 'quantity' => $l['quantity'], 'per_head' => (bool) ($l['per_head'] ?? false),
                'unit_price' => $l['unit_price'], 'options' => $l['options'] ?? null, 'note' => filled($l['note'] ?? null) ? mb_substr(trim((string) $l['note']), 0, 300) : null]);
        }
    }

    private function eventTime(mixed $v, Carbon $now): Carbon
    {
        try {
            $at = Carbon::parse((string) $v, $this->tz());
        } catch (\Throwable) {
            throw new BooksException('Choose the date and time you need it.');
        }
        if ($at->gt($now->copy()->addDays(400))) {
            throw new BooksException('That date is too far ahead.');
        }

        return $at;
    }

    /** @return array{name: string, email: ?string, phone: string} */
    private function contact(array $in, ?User $user): array
    {
        $name = trim((string) ($in['name'] ?? $user?->name ?? ''));
        $phone = trim((string) ($in['phone'] ?? $user?->customer?->phone ?? ''));
        $email = trim((string) ($in['email'] ?? $user?->email ?? ''));
        if ($name === '') {
            throw new BooksException('Enter your name.');
        }
        if ($phone === '') {
            throw new BooksException('Enter your phone number: we call or text if there is a problem.');
        }
        if ($email !== '' && ! filter_var($email, FILTER_VALIDATE_EMAIL)) {
            throw new BooksException('That email address does not look right.');
        }

        return ['name' => mb_substr($name, 0, 160), 'email' => $email === '' ? null : $email, 'phone' => mb_substr($phone, 0, 40)];
    }

    private function assertOn(): void
    {
        if (! self::installed()) {
            throw new BooksException('Cakes and catering are not set up yet.');
        }
        if (! MenusSettings::all()['custom_orders']) {
            throw new BooksException('We are not taking cake or catering requests online right now.');
        }
    }

    // ── pricing and quoting ───────────────────────────────────────────────

    /** The Sales Order the books will hold. Free lines are booked to the sales account chosen in Menus settings (it decides their tax). */
    private function payload(CookingRequest $r): array
    {
        $rows = [];
        $ledger = MenusSettings::all()['sales_ledger_id'];
        foreach ($r->lines as $l) {
            $dish = $l->dish_id ? Dish::find($l->dish_id) : null;
            if ($dish && $dish->variant_id) {
                $row = ['type' => 'product', 'product_id' => $dish->product_id, 'variant_id' => $dish->variant_id, 'quantity' => (float) $l->quantity, 'rate' => (float) $l->unit_price, 'location_id' => $r->location_id,
                    'notes' => trim(implode(', ', array_column($l->options ?? [], 'name')).($l->note ? ($l->options ? ' — ' : '').$l->note : '')) ?: null];
                $ids = array_column($l->options ?? [], 'id');
                if ($ids) {
                    try {
                        $uses = $this->pricing->resolve($dish, $ids)['uses'];
                        if ($uses) {
                            $row['menu_uses'] = $uses;
                        }
                    } catch (BooksException) {
                        // a choice was removed since: it changes nothing in the recipe any more
                    }
                }
                $rows[] = $row;

                continue;
            }
            if (! $ledger) {
                throw new BooksException('Choose the sales account (Settings → Menus) so free lines on a quote can be booked.');
            }
            $rows[] = ['type' => 'custom', 'description' => $l->name, 'quantity' => (float) $l->quantity, 'rate' => (float) $l->unit_price, 'ledger_id' => (int) $ledger, 'notes' => $l->note];
        }

        return ['date' => today()->toDateString(), 'location_id' => $r->location_id, 'currency_id' => $r->currency_id ?: Currency::getBaseCurrency()?->id, 'customer_id' => $r->customer_id, 'channel' => 'storefront',
            'lines' => $rows, 'narration' => ($r->kind === 'cake' ? 'Cake' : 'Catering').' '.$r->number.' for '.$r->event_at->copy()->timezone($this->tz())->format('D j M H:i').($r->headcount ? ", {$r->headcount} people" : ''),
            'meta' => ['contact' => ['name' => $r->name, 'email' => $r->email, 'phone' => $r->phone], 'menu_request_id' => $r->id, 'guest' => $r->customer_id ? null : true]];
    }

    /** Work out the totals and the deposit from the lines and mark the request quoted. */
    private function price(CookingRequest $r, ?float $depositPct, ?int $validDays, ?Carbon $now = null): CookingRequest
    {
        $settings = MenusSettings::all();
        if ($r->lines->isEmpty()) {
            throw new BooksException('Add at least one line to the quote.');
        }
        $pre = $this->vouchers->preview($this->payload($r), null);
        $pct = round($depositPct ?? (float) $settings['custom_deposit_pct'], 2);
        $total = round((float) $pre['total'], 2);
        $r->update(['subtotal' => (float) $pre['subtotal'], 'tax_total' => (float) $pre['tax_total'], 'total' => $total, 'deposit_pct' => $pct, 'deposit_amount' => round($total * $pct / 100, 2),
            'status' => 'quoted', 'quoted_at' => $now ?? now(), 'valid_until' => ($now ?? now())->copy()->addDays($validDays ?? (int) $settings['custom_quote_days'])->toDateString()]);

        return $r->fresh('lines');
    }

    /**
     * Staff price a request (or change a quote that has not been accepted): the lines, the deposit share and how long it stays open. The quantity of a per-head line follows the headcount.
     *
     * @param array{lines?: array, deposit_pct?: mixed, valid_days?: mixed, headcount?: mixed} $in lines [{dish_id?, name, quantity, per_head?, unit_price, note?}]
     */
    public function quote(CookingRequest $r, array $in, ?User $by = null): CookingRequest
    {
        if (! in_array($r->status, ['requested', 'quoted'], true)) {
            throw new BooksException('This request is '.strtolower(CookingRequest::STATUSES[$r->status] ?? $r->status).': its quote can not be changed now.');
        }
        if (array_key_exists('headcount', $in) && $in['headcount'] !== null && $in['headcount'] !== '') {
            $hc = (int) $in['headcount'];
            if ($hc < 1 || $hc > 5000) {
                throw new BooksException('The headcount must be between 1 and 5000.');
            }
            $r->headcount = $hc;
        }
        $lines = [];
        foreach ((array) ($in['lines'] ?? []) as $l) {
            $dish = ! empty($l['dish_id']) ? Dish::find((int) $l['dish_id']) : null;
            if (! empty($l['dish_id']) && (! $dish || ! $dish->variant_id)) {
                throw new BooksException('One of the dishes does not exist.');
            }
            $name = trim((string) ($l['name'] ?? $dish?->name ?? ''));
            $perHead = ! empty($l['per_head']);
            $qty = $perHead ? (float) ($r->headcount ?: 0) : round((float) ($l['quantity'] ?? 0), 2);
            $price = round((float) ($l['unit_price'] ?? -1), 2);
            if ($name === '') {
                throw new BooksException('Every line needs a name.');
            }
            if ($qty <= 0 || $qty > 100000) {
                throw new BooksException($perHead ? 'Set the headcount before using a per-head line.' : "{$name}: the quantity must be more than nothing.");
            }
            if ($price < 0 || $price > 100000000) {
                throw new BooksException("{$name}: enter the price.");
            }
            $lines[] = ['dish_id' => $dish?->id, 'name' => $name, 'quantity' => $qty, 'per_head' => $perHead, 'unit_price' => $price, 'options' => null, 'note' => $l['note'] ?? null];
        }
        $pct = array_key_exists('deposit_pct', $in) && $in['deposit_pct'] !== null && $in['deposit_pct'] !== '' ? (float) $in['deposit_pct'] : null;
        if ($pct !== null && ($pct < 0 || $pct > 100)) {
            throw new BooksException('The deposit is between 0 and 100 percent.');
        }
        $days = array_key_exists('valid_days', $in) && $in['valid_days'] !== null && $in['valid_days'] !== '' ? (int) $in['valid_days'] : null;
        if ($days !== null && ($days < 1 || $days > 90)) {
            throw new BooksException('A quote stays open between 1 and 90 days.');
        }
        $r = DB::transaction(function () use ($r, $lines, $pct, $days) {
            $r->save();
            $this->storeLines($r, $lines);

            return $this->price($r->fresh('lines'), $pct, $days);
        });
        $this->notices->quoted($r);

        return $r;
    }

    // ── saying yes, paying ────────────────────────────────────────────────

    /**
     * The customer accepts the quote: it becomes a Sales Order and an invoice, and the deposit is asked for. Needs a customer account (the balance is owed on the invoice).
     *
     * @return array{request: CookingRequest, attempt?: array, redirect_url?: ?string, message: string}
     */
    public function accept(CookingRequest $r, array $in, ?User $user): array
    {
        if ($r->status !== 'quoted') {
            throw new BooksException($r->status === 'accepted' ? 'You have accepted this already: pay the deposit to confirm it.' : 'This quote can not be accepted now.');
        }
        if ($r->valid_until && $r->valid_until->endOfDay()->isPast()) {
            $r->update(['status' => 'expired']);
            throw new BooksException('This quote ran out on '.$r->valid_until->format('j M').'. Ask us for a new one.');
        }
        $customer = $user?->customer;
        if (! $customer) {
            throw new BooksException('Sign in to accept the quote: the balance is kept on your account.');
        }
        if ($r->customer_id && (int) $r->customer_id !== (int) $customer->id) {
            throw new BooksException('This quote was made for another account. Sign in with the one you asked with.');
        }
        $deposit = (float) $r->deposit_amount;
        $method = $deposit > 0 ? $this->method($in) : null;
        $contact = ['phone' => $r->phone, 'email' => $r->email, 'name' => $r->name];

        $result = DB::transaction(function () use ($r, $customer, $deposit, $method, $contact, $user) {
            $r->customer_id = $customer->id;
            $r->user_id = $user->id;
            $order = $this->vouchers->placeOrder($this->payload($r->loadMissing('lines')), null);
            $invoice = $this->vouchers->convert($order, VoucherType::SALES, ['moves_stock' => false, 'due_date' => $r->event_at->copy()->timezone($this->tz())->toDateString()], null);
            $r->update(['customer_id' => $customer->id, 'user_id' => $user->id, 'voucher_id' => $order->id, 'invoice_id' => $invoice->id, 'status' => 'accepted', 'accepted_at' => now()]);
            if ($deposit <= 0) {
                return ['request' => $this->confirm($r->fresh('lines'))];
            }
            $s = $this->gateway->start($invoice, $method, $contact, [], $deposit, $user);

            return ['request' => $r->fresh('lines')] + $this->attempt($s);
        });

        if (! isset($result['attempt'])) {
            return $result + ['message' => 'Thank you! Your booking is confirmed.'];
        }

        return $result + ['message' => $this->prompt($result, $deposit)];
    }

    /** Pay what is due: the deposit (accepted) or the balance (confirmed and later). @return array{request: CookingRequest, attempt: array, redirect_url: ?string, message: string} */
    public function pay(CookingRequest $r, array $in, ?User $user): array
    {
        if (! $r->invoice_id || ! in_array($r->status, ['accepted', 'confirmed', 'preparing', 'ready'], true)) {
            throw new BooksException('There is nothing to pay on this request right now.');
        }
        $due = $r->status === 'accepted' ? round((float) $r->deposit_amount - (float) $r->paid_total, 2) : $r->balance();
        if ($due <= 0.004) {
            throw new BooksException('Nothing more is due.');
        }
        $method = $this->method($in);
        $invoice = Voucher::findOrFail($r->invoice_id);
        $s = $this->gateway->start($invoice, $method, ['phone' => $r->phone, 'email' => $r->email, 'name' => $r->name], [], $due, $user);
        $res = ['request' => $r] + $this->attempt($s);

        return $res + ['message' => $this->prompt($res, $due)];
    }

    private function method(array $in): PaymentMethod
    {
        $m = ! empty($in['payment_method_id']) ? PaymentMethod::offeredAtCheckout()->whereKey((int) $in['payment_method_id'])->first() : null;
        if (! $m) {
            throw new BooksException('Choose how to pay.');
        }
        if (! GatewayPaymentService::isAutomatic($m)) {
            throw new BooksException("{$m->name} can't be charged automatically: choose M-Pesa or a card.");
        }

        return $m;
    }

    private function attempt(array $s): array
    {
        $a = $s['attempt'];

        return ['attempt' => ['id' => $a->id, 'status' => $a->status, 'amount' => (float) $a->amount, 'gateway' => $a->gateway, 'token' => GatewayPaymentService::returnToken((int) $a->id)], 'redirect_url' => $s['redirect_url'] ?? null];
    }

    private function prompt(array $res, float $amount): string
    {
        return ($res['redirect_url'] ? 'Taking you to the secure payment page' : 'Check your phone and enter your M-Pesa PIN').' to pay '.number_format($amount, 2).'.';
    }

    /** The deposit is in (called by the payment service for every receipt against the invoice). Safe to call for an invoice that is not a cooking job. */
    public function paid(Voucher $invoice, float $amount): void
    {
        if (empty($invoice->meta['menu_request_id']) || ! self::installed()) {
            return;
        }
        $r = CookingRequest::where('invoice_id', $invoice->id)->first();
        if (! $r) {
            return;
        }
        $this->received($r, $amount);
    }

    private function received(CookingRequest $r, float $amount): void
    {
        $r->paid_total = round((float) $r->paid_total + $amount, 2);
        $r->save();
        if ($r->status === 'accepted' && (float) $r->paid_total + 0.009 >= (float) $r->deposit_amount) {
            $this->confirm($r);
        }
    }

    private function confirm(CookingRequest $r): CookingRequest
    {
        $r->update(['status' => 'confirmed', 'confirmed_at' => now()]);
        $this->notices->confirmed($r->fresh());

        return $r->fresh('lines');
    }

    /**
     * Staff take money for the job at the counter (the deposit or the balance): a Receipt against the invoice.
     *
     * @param array<int, array{payment_method_id: int, amount: float, reference?: ?string}> $tenders
     */
    public function takePayment(CookingRequest $r, array $tenders, ?User $by = null): CookingRequest
    {
        if (! $r->invoice_id || ! in_array($r->status, ['accepted', 'confirmed', 'preparing', 'ready'], true)) {
            throw new BooksException('Money can be taken once the quote is accepted.');
        }
        $tenders = array_map(fn ($t) => ['payment_method_id' => (int) $t['payment_method_id'], 'amount' => round((float) ($t['amount'] ?? 0), 2), 'reference' => $t['reference'] ?? null], $tenders);
        $sum = round(array_sum(array_column($tenders, 'amount')), 2);
        if (! $tenders || $sum <= 0) {
            throw new BooksException('Enter the amount received.');
        }
        if ($sum - $r->balance() > 0.009) {
            throw new BooksException('That is more than the '.number_format($r->balance(), 2).' still to pay.');
        }
        DB::transaction(function () use ($r, $tenders, $sum, $by) {
            $this->vouchers->receive(Voucher::findOrFail($r->invoice_id), ['tenders' => $tenders, 'amount' => $sum, 'payment_method_id' => $tenders[0]['payment_method_id'], 'channel' => 'admin'], $by);
            $this->received($r->fresh(), $sum);
        });

        return $r->fresh('lines');
    }

    // ── the job ───────────────────────────────────────────────────────────

    /** Move a confirmed job along. When it is ready the stock is taken (a delivery note on the Sales Order); a shortage is noted for staff, it never stops the job. */
    public function advance(CookingRequest $r, string $to, ?User $by = null): CookingRequest
    {
        if (! in_array($to, CookingRequest::NEXT[$r->status] ?? [], true)) {
            throw new BooksException('A job that is '.strtolower(CookingRequest::STATUSES[$r->status] ?? $r->status).' can not become '.strtolower(CookingRequest::STATUSES[$to] ?? $to).'.');
        }
        if ($to === 'completed' && $r->balance() > 0.009) {
            throw new BooksException('Take the balance of '.number_format($r->balance(), 2).' first.');
        }
        $r->update(['status' => $to] + ($to === 'completed' ? ['completed_at' => now()] : []));
        if ($to === 'ready') {
            $this->takeStock($r->fresh());
            $this->notices->ready($r->fresh());
        }

        return $r->fresh('lines');
    }

    private function takeStock(CookingRequest $r): void
    {
        if (! $r->voucher_id) {
            return;
        }
        $details = $r->details ?? [];
        try {
            $this->vouchers->convert(Voucher::findOrFail($r->voucher_id), VoucherType::DELIVERY_NOTE, ['reference_no' => $r->number], null);
            $details['stock'] = 'taken';
        } catch (\Throwable $e) {
            $details['stock'] = 'Stock was not taken: '.$e->getMessage();
            report($e);
        }
        $r->update(['details' => $details]);
    }

    public function decline(CookingRequest $r, ?string $reason = null): CookingRequest
    {
        if (! in_array($r->status, ['requested', 'quoted'], true)) {
            throw new BooksException('This request can not be turned down now.');
        }
        $r->update(['status' => 'declined', 'cancel_reason' => $this->reason($reason), 'cancelled_at' => now()]);
        $this->notices->cancelled($r->fresh());

        return $r->fresh('lines');
    }

    /** Cancel a job. Nothing paid: the books are cancelled with it. Money already in: it is flagged so the deposit is given back (it is in the books as a receipt). */
    public function cancel(CookingRequest $r, ?string $reason = null, ?User $by = null): CookingRequest
    {
        if (! $r->open()) {
            throw new BooksException('This request can not be cancelled now.');
        }
        if (in_array($r->status, ['requested', 'quoted'], true)) {
            return $this->decline($r, $reason);
        }
        if ($r->status === 'ready') {
            throw new BooksException('A job that is ready can not be cancelled: complete it or call the customer.');
        }
        $reason = $this->reason($reason);
        DB::transaction(function () use ($r, $reason, $by) {
            if ((float) $r->paid_total <= 0) {
                foreach ([$r->invoice_id, $r->voucher_id] as $id) {
                    $v = $id ? Voucher::find($id) : null;
                    if ($v && $v->status !== Voucher::CANCELLED) {
                        $this->vouchers->cancel($v, "Cooking job {$r->number} cancelled".($reason ? ": {$reason}" : ''), $by);
                    }
                }
            }
            $r->update(['status' => 'cancelled', 'cancel_reason' => $reason, 'cancelled_at' => now()]);
        });
        $this->notices->cancelled($r->fresh());

        return $r->fresh('lines');
    }

    private function reason(?string $s): ?string
    {
        $s = trim((string) $s);

        return $s === '' ? null : mb_substr($s, 0, 300);
    }

    /** Quotes nobody answered lapse; a deposit never paid within a day lets the job go. @return int how many */
    public function sweep(?Carbon $now = null): int
    {
        if (! self::installed()) {
            return 0;
        }
        $now ??= now();
        $n = CookingRequest::where('status', 'quoted')->whereDate('valid_until', '<', $now->toDateString())->update(['status' => 'expired']);
        foreach (CookingRequest::where('status', 'accepted')->where('paid_total', '<=', 0)->where('accepted_at', '<', $now->copy()->subDay())->get() as $r) {
            try {
                $this->cancel($r, 'The deposit did not arrive in time.');
                $n++;
            } catch (\Throwable $e) {
                report($e);
            }
        }

        return $n;
    }

    // ── how a request is shown ────────────────────────────────────────────

    /** @return array<string, mixed> what the customer sees at their link (no cost, no notes of ours) */
    public function customerView(CookingRequest $r): array
    {
        $r->loadMissing('lines');
        $quoted = $r->status === 'quoted' && ! ($r->valid_until && $r->valid_until->endOfDay()->isPast());

        return $this->base($r) + ['can_accept' => $quoted, 'can_decline' => $quoted || $r->status === 'requested',
            'pay_due' => $r->status === 'accepted' ? round(max(0.0, (float) $r->deposit_amount - (float) $r->paid_total), 2) : (in_array($r->status, ['confirmed', 'preparing', 'ready'], true) ? $r->balance() : 0.0)];
    }

    /** @return array<string, mixed> */
    public function staffView(CookingRequest $r): array
    {
        $r->loadMissing('lines');

        return $this->base($r) + ['id' => $r->id, 'phone' => $r->phone, 'email' => $r->email, 'location_id' => $r->location_id, 'customer_id' => $r->customer_id, 'notes' => $r->notes,
            'voucher_id' => $r->voucher_id, 'invoice_id' => $r->invoice_id, 'refund_due' => $r->refundDue(), 'stock' => $r->details['stock'] ?? null,
            'next' => CookingRequest::NEXT[$r->status] ?? [], 'can_quote' => in_array($r->status, ['requested', 'quoted'], true),
            'can_take_payment' => $r->invoice_id && in_array($r->status, ['accepted', 'confirmed', 'preparing', 'ready'], true) && $r->balance() > 0, 'created_at' => $r->created_at?->toIso8601String()];
    }

    /** @return array<string, mixed> */
    private function base(CookingRequest $r): array
    {
        return ['number' => $r->number, 'kind' => $r->kind, 'kind_label' => CookingRequest::KINDS[$r->kind] ?? $r->kind, 'status' => $r->status, 'status_label' => CookingRequest::STATUSES[$r->status] ?? $r->status,
            'name' => $r->name, 'event_at' => $r->event_at?->toIso8601String(), 'fulfil' => $r->fulfil, 'address' => $r->address, 'headcount' => $r->headcount,
            'message' => $r->details['message'] ?? null, 'wishes' => $r->details['wishes'] ?? null, 'cancel_reason' => $r->cancel_reason,
            'valid_until' => $r->valid_until?->toDateString(), 'subtotal' => (float) $r->subtotal, 'tax_total' => (float) $r->tax_total, 'total' => (float) $r->total, 'deposit_pct' => (float) $r->deposit_pct,
            'deposit_amount' => (float) $r->deposit_amount, 'paid_total' => (float) $r->paid_total, 'balance' => $r->balance(),
            'lines' => $r->lines->map(fn ($l) => ['id' => $l->id, 'dish_id' => $l->dish_id, 'name' => $l->name, 'quantity' => (float) $l->quantity, 'per_head' => (bool) $l->per_head, 'unit_price' => (float) $l->unit_price,
                'amount' => round((float) $l->quantity * (float) $l->unit_price, 2), 'options' => array_column($l->options ?? [], 'name'), 'note' => $l->note])->all()];
    }
}
