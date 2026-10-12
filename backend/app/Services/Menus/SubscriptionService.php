<?php

namespace App\Services\Menus;

use App\Models\Books\PaymentMethod;
use App\Models\Books\Voucher;
use App\Models\Books\VoucherType;
use App\Models\Currency;
use App\Models\Menus\Channel;
use App\Models\Menus\Dish;
use App\Models\Menus\MenuOrder;
use App\Models\Menus\MenuOrderLine;
use App\Models\Menus\Plan;
use App\Models\Menus\PlanDay;
use App\Models\Menus\SubDelivery;
use App\Models\Menus\SubPeriod;
use App\Models\Menus\Subscription;
use App\Models\User;
use App\Services\Books\BooksException;
use App\Services\Books\GatewayPaymentService;
use App\Services\Books\VoucherService;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;

/**
 * Meal plans, the customer's side. A subscriber picks a plan, the days of the week they want it and a start day, and pays the first week at once. After that each week is billed ahead (a few days
 * before it starts) as a Sales Order the customer pays from their plan page (no sign-in: the link is the key); a week not paid in time is not cooked, and two such weeks in a row pause the plan.
 * Each paid delivery day becomes an ordinary kitchen order once its cut-off has passed (so the kitchen screens, the orders board and delivery work as for any delivery order) and takes its
 * stock then. A day can be skipped up to the plan's cut-off before it: a skipped day that was already paid for is owed (a later delivery day is free), one not yet paid for just leaves the bill.
 * Prices: the plan's price for a delivery day is shared over that day's dishes in proportion to their own prices, tax comes from the books as for any sale.
 */
class SubscriptionService
{
    public static function installed(): bool
    {
        return PlanService::installed() && Schema::hasTable('menus_sub_periods') && Schema::hasTable('menus_sub_deliveries');
    }

    public function __construct(private VoucherService $vouchers, private GatewayPaymentService $gateway, private DishInfo $info, private KitchenService $kitchen, private PlanNotices $notices)
    {
    }

    private function tz(): string
    {
        return (string) config('app.timezone', 'Africa/Nairobi');
    }

    private function today(?Carbon $now = null): Carbon
    {
        return ($now ?? Carbon::now($this->tz()))->copy()->timezone($this->tz())->startOfDay();
    }

    private function assertOn(): void
    {
        if (! self::installed()) {
            throw new BooksException('Meal plans are not set up yet.');
        }
        if (! MenusSettings::all()['plans_enabled']) {
            throw new BooksException('We are not taking meal plan subscriptions online right now.');
        }
    }

    public function monday(Carbon $d): Carbon
    {
        return $d->copy()->startOfDay()->startOfWeek(Carbon::MONDAY);
    }

    /** When a delivery day starts (its window opens), in the shop's time zone. */
    private function startsAt(Plan $p, Carbon $day): Carbon
    {
        return Carbon::parse($day->toDateString().' '.substr((string) $p->slot_from, 0, 5), $this->tz());
    }

    /** The last moment a day can still be skipped or changed. */
    private function cutoff(Plan $p, Carbon $day): Carbon
    {
        return $this->startsAt($p, $day)->subHours((int) $p->cutoff_hours);
    }

    /** Which week of the plan's rotating menu a Monday is for this subscriber: the week they start on is week 1. */
    public function weekNo(Subscription $s, Plan $p, Carbon $monday): int
    {
        $weeks = (int) round($this->monday($s->start_date)->diffInDays($monday->copy()->startOfDay()) / 7);

        return (($weeks % max(1, $p->cycle_weeks)) + max(1, $p->cycle_weeks)) % max(1, $p->cycle_weeks) + 1;
    }

    // ── subscribing ───────────────────────────────────────────────────────

    /**
     * Subscribe and pay the first week. Nothing needs signing in. The plan starts on the first delivery day chosen at or after the start day; the start must leave time before the cut-off.
     *
     * @param array{name?: mixed, phone?: mixed, email?: mixed, address?: mixed, weekdays?: mixed, start_date?: mixed, payment_method_id?: mixed, notes?: mixed} $in
     * @return array{subscription: Subscription, attempt: array, redirect_url: ?string, message: string}
     */
    public function subscribe(Plan $plan, array $in, ?User $user = null, ?Carbon $now = null): array
    {
        $this->assertOn();
        $now = ($now ?? Carbon::now($this->tz()))->copy();
        if (! $plan->is_active) {
            throw new BooksException('That plan is not taking new subscribers.');
        }
        if (! MembershipRules::qualifies($plan, $user?->id)) {
            throw new BooksException(MembershipRules::message($plan));
        }
        $name = trim((string) ($in['name'] ?? $user?->name ?? ''));
        $phone = trim((string) ($in['phone'] ?? $user?->customer?->phone ?? ''));
        $email = trim((string) ($in['email'] ?? $user?->email ?? ''));
        $address = trim((string) ($in['address'] ?? ''));
        if ($name === '') {
            throw new BooksException('Enter your name.');
        }
        if ($phone === '') {
            throw new BooksException('Enter your phone number: the rider calls it.');
        }
        if ($email !== '' && ! filter_var($email, FILTER_VALIDATE_EMAIL)) {
            throw new BooksException('That email address does not look right.');
        }
        if ($address === '') {
            throw new BooksException('Enter the address to deliver to.');
        }
        $days = array_values(array_unique(array_map('intval', (array) ($in['weekdays'] ?? []))));
        sort($days);
        if (array_diff($days, $plan->weekdays())) {
            throw new BooksException('Choose from the days this plan delivers.');
        }
        if (count($days) < $plan->min_days) {
            throw new BooksException("Choose at least {$plan->min_days} delivery day".($plan->min_days === 1 ? '' : 's').' a week.');
        }
        try {
            if (trim((string) ($in['start_date'] ?? '')) === '') {
                throw new \InvalidArgumentException('no start');
            }
            $start = Carbon::parse((string) $in['start_date'], $this->tz())->startOfDay();
        } catch (\Throwable) {
            throw new BooksException('Choose the day you want to start.');
        }
        if ($start->gt($this->today($now)->addDays(60))) {
            throw new BooksException('Choose a start within the next 60 days.');
        }
        $method = ! empty($in['payment_method_id']) ? PaymentMethod::offeredAtCheckout()->whereKey((int) $in['payment_method_id'])->first() : null;
        if (! $method || ! GatewayPaymentService::isAutomatic($method)) {
            throw new BooksException('Choose M-Pesa or a card to pay the first week.');
        }

        $result = DB::transaction(function () use ($plan, $name, $phone, $email, $address, $days, $start, $method, $user, $in, $now) {
            $s = Subscription::create(['number' => 'SB-'.Str::upper(Str::random(8)), 'manage_token' => Str::random(40), 'plan_id' => $plan->id, 'customer_id' => $user?->customer?->id, 'user_id' => $user?->id, 'name' => mb_substr($name, 0, 160),
                'email' => $email === '' ? null : $email, 'phone' => mb_substr($phone, 0, 40), 'address' => mb_substr($address, 0, 500), 'weekdays' => implode(',', $days), 'start_date' => $start->toDateString(), 'status' => 'pending',
                'notes' => filled($in['notes'] ?? null) ? mb_substr(trim((string) $in['notes']), 0, 500) : null]);
            $s->update(['number' => 'SB-'.str_pad((string) $s->id, 6, '0', STR_PAD_LEFT)]);
            $period = $this->billWeek($s->fresh(), $plan, $this->monday($start), $now, true);
            if (! $period) {
                throw new BooksException('That start leaves no delivery day with a menu yet: choose another start day or other days.');
            }
            $r = $this->gateway->start(Voucher::findOrFail($period->voucher_id), $method, ['phone' => $phone, 'email' => $email ?: null, 'name' => $name], [], (float) $period->total, $user);

            return ['subscription' => $s->fresh(), 'attempt' => $this->attempt($r), 'redirect_url' => $r['redirect_url'] ?? null];
        });
        $this->notices->staff('menu_plan_new', 'New meal plan subscriber', "{$name} subscribed to {$plan->name}.");

        return $result + ['message' => ($result['redirect_url'] ? 'Taking you to the secure payment page' : 'Check your phone and enter your M-Pesa PIN').' to pay the first week and start your plan.'];
    }

    private function attempt(array $s): array
    {
        $a = $s['attempt'];

        return ['id' => $a->id, 'status' => $a->status, 'amount' => (float) $a->amount, 'gateway' => $a->gateway, 'token' => GatewayPaymentService::returnToken((int) $a->id)];
    }

    // ── billing a week ────────────────────────────────────────────────────

    /** The dates a subscriber is delivered to in a week (Monday given): their days, from the start day, not in a pause, with a menu set for that day. @return array<string, Dish[]> date => dishes */
    private function weekDeliveries(Subscription $s, Plan $p, Carbon $monday): array
    {
        $no = $this->weekNo($s, $p, $monday);
        $menu = PlanDay::where('plan_id', $p->id)->where('week_no', $no)->orderBy('sort_order')->orderBy('id')->get()->groupBy('weekday');
        $dishes = Dish::whereIn('id', $menu->flatten()->pluck('dish_id'))->get()->keyBy('id');
        $out = [];
        foreach ($s->days() as $wd) {
            $day = $monday->copy()->addDays($wd - 1);
            if ($day->lt($s->start_date->copy()->startOfDay()) || $s->pausedOn($day) || ! isset($menu[$wd])) {
                continue;
            }
            $list = $menu[$wd]->map(fn ($m) => $dishes[$m->dish_id] ?? null)->filter(fn ($d) => $d && $d->is_active && $d->variant_id)->values()->all();
            if ($list) {
                $out[$day->toDateString()] = $list;
            }
        }

        return $out;
    }

    /**
     * Bill a week: the delivery rows, a Sales Order in the books for them (a preorder: it takes the money and no stock; stock is taken day by day), and a period to follow it. Nothing is made if the
     * week has no delivery. Days owed from earlier skips are free (the first ones of the week, at no price).
     */
    public function billWeek(Subscription $s, Plan $p, Carbon $monday, ?Carbon $now = null, bool $first = false, array $skipDates = []): ?SubPeriod
    {
        $now ??= Carbon::now($this->tz());
        if (SubPeriod::where('subscription_id', $s->id)->where('week_start', $monday->toDateString())->whereIn('status', ['due', 'paid'])->exists()) {
            return null;
        }
        // a day that is already inside its cut-off can not be prepared in time: it is not part of the bill (a day the customer skipped is kept, as skipped)
        $deliveries = array_filter($this->weekDeliveries($s, $p, $monday), fn ($dishes, $date) => in_array($date, $skipDates, true) || $this->cutoff($p, Carbon::parse($date, $this->tz()))->gt($now), ARRAY_FILTER_USE_BOTH);
        if (! $deliveries) {
            return null;
        }
        $credit = (int) $s->credit_days;
        $dayPrice = round((float) $p->day_price * (1 - MembershipRules::discountPct($s->user_id) / 100), 2);   // members may get a percentage off
        $rows = [];      // the Sales Order's lines
        $plan = [];      // per day: [date, free, lines[]]
        foreach ($deliveries as $date => $dishes) {
            if (in_array($date, $skipDates, true)) {   // skipped: shown as skipped, never billed
                $plan[] = [$date, false, array_map(fn (Dish $d) => ['dish_id' => $d->id, 'name' => $d->name, 'price' => 0.0, 'base_price' => 0.0], $dishes), true];
                continue;
            }
            $free = $credit > 0;
            $credit -= $free ? 1 : 0;
            $prices = array_map(fn (Dish $d) => (float) ($this->info->money($d, (int) $p->location_id)['price'] ?? 0), $dishes);
            $sum = array_sum($prices) ?: 1.0;
            $left = $dayPrice;
            $lines = [];
            foreach ($dishes as $i => $d) {
                $rate = $free ? 0.0 : ($i === count($dishes) - 1 ? round($left, 2) : round($dayPrice * $prices[$i] / $sum, 2));
                $left -= $rate;
                $lines[] = ['dish_id' => $d->id, 'name' => $d->name, 'price' => $rate, 'base_price' => $prices[$i]];
                $rows[] = ['type' => 'product', 'product_id' => $d->product_id, 'variant_id' => $d->variant_id, 'quantity' => 1, 'rate' => $rate, 'location_id' => $p->location_id,
                    'notes' => Carbon::parse($date)->format('D j M').' — '.$d->name.($free ? ' (owed from a skipped day)' : '')];
            }
            $plan[] = [$date, $free, $lines, false];
        }
        $weekNo = $this->weekNo($s, $p, $monday);
        $period = DB::transaction(function () use ($s, $p, $monday, $rows, $plan, $weekNo, $now, $credit, $first) {
            $period = SubPeriod::updateOrCreate(['subscription_id' => $s->id, 'week_start' => $monday->toDateString()], ['week_no' => $weekNo, 'status' => 'due', 'voucher_id' => null, 'sale_id' => null, 'paid_at' => null, 'reminded_at' => null]);
            if (! $rows) {   // every day of the week was skipped: nothing to bill
                SubDelivery::where('period_id', $period->id)->delete();
                foreach ($plan as [$date, , $lines]) {
                    SubDelivery::create(['subscription_id' => $s->id, 'period_id' => $period->id, 'delivery_date' => $date, 'status' => 'skipped', 'free' => false, 'meals' => $lines, 'item_ids' => [], 'skipped_at' => now()]);
                }
                $period->update(['status' => 'paid', 'subtotal' => 0, 'tax_total' => 0, 'total' => 0, 'paid_at' => now()]);
                $s->update(['credit_days' => max(0, $credit)]);

                return $period->fresh();
            }
            $payload = ['date' => today($this->tz())->toDateString(), 'location_id' => $p->location_id, 'currency_id' => Currency::getBaseCurrency()?->id, 'customer_id' => $s->customer_id, 'channel' => 'storefront', 'lines' => $rows,
                'narration' => "Meal plan {$s->number}, week of ".$monday->format('j M Y'),
                'meta' => ['contact' => ['name' => $s->name, 'email' => $s->email, 'phone' => $s->phone], 'guest' => $s->customer_id ? null : true, 'preorder' => true, 'menu_period_id' => $period->id]];
            $pre = $this->vouchers->preview($payload, null);
            $voucher = $this->vouchers->placeOrder($payload, null);
            $items = $voucher->items()->where('is_header', false)->orderBy('id')->pluck('id')->all();
            SubDelivery::where('period_id', $period->id)->delete();
            $k = 0;
            foreach ($plan as [$date, $free, $lines, $skipped]) {
                $ids = $skipped ? [] : array_slice($items, $k, count($lines));
                $k += $skipped ? 0 : count($lines);
                SubDelivery::create(['subscription_id' => $s->id, 'period_id' => $period->id, 'delivery_date' => $date, 'status' => $skipped ? 'skipped' : 'scheduled', 'free' => $free, 'meals' => $lines, 'item_ids' => $ids, 'skipped_at' => $skipped ? now() : null]);
            }
            $live = array_values(array_filter($plan, fn ($x) => ! $x[3]));
            $first1 = Carbon::parse($live[0][0], $this->tz());
            $period->update(['subtotal' => (float) $pre['subtotal'], 'tax_total' => (float) $pre['tax_total'], 'total' => round((float) $pre['total'], 2), 'voucher_id' => $voucher->id,
                'pay_by' => $first ? $now->copy()->addMinutes(30) : max($now->copy()->addHour(), $this->cutoff($p, $first1))]);
            $s->update(['credit_days' => max(0, $credit)]);

            return $period->fresh();
        });
        if (! $first && (float) $period->total > 0) {
            $this->notices->weekReady($s->fresh(), $period);
        }

        return $period;
    }

    /** The customer pays a week from their plan page: the same M-Pesa and card gateways as the shop. @return array{attempt: array, redirect_url: ?string, message: string} */
    public function pay(Subscription $s, SubPeriod $period, array $in, ?User $user = null): array
    {
        if ((int) $period->subscription_id !== (int) $s->id || $period->status !== 'due' || ! $period->voucher_id) {
            throw new BooksException('There is nothing to pay on that week.');
        }
        $method = ! empty($in['payment_method_id']) ? PaymentMethod::offeredAtCheckout()->whereKey((int) $in['payment_method_id'])->first() : null;
        if (! $method || ! GatewayPaymentService::isAutomatic($method)) {
            throw new BooksException('Choose M-Pesa or a card.');
        }
        if ($period->total <= 0) {
            $this->settleFree($s, $period);   // a week of owed days costs nothing: it is simply confirmed

            return ['attempt' => [], 'redirect_url' => null, 'message' => 'That week is free: it is confirmed.'];
        }
        $r = $this->gateway->start(Voucher::findOrFail($period->voucher_id), $method, ['phone' => $s->phone, 'email' => $s->email, 'name' => $s->name], [], (float) $period->total, $user);

        return ['attempt' => $this->attempt($r), 'redirect_url' => $r['redirect_url'] ?? null, 'message' => ($r['redirect_url'] ? 'Taking you to the secure payment page' : 'Check your phone and enter your M-Pesa PIN').' to pay '.number_format((float) $period->total, 2).'.'];
    }

    /** A week that costs nothing (all its days were owed): paid without a payment. */
    private function settleFree(Subscription $s, SubPeriod $period): void
    {
        $period->update(['status' => 'paid', 'paid_at' => now()]);
        if ($s->status === 'pending') {
            $s->update(['status' => 'active']);
        }
    }

    /** The money is in (called by the payment service): the week is paid, the plan is active. Safe to call twice. */
    public function paid(Voucher $order, Voucher $sale): void
    {
        $period = SubPeriod::where('voucher_id', $order->id)->first();
        if (! $period || $period->status === 'paid') {
            return;
        }
        $period->update(['status' => 'paid', 'paid_at' => now(), 'sale_id' => $sale->id]);
        $s = Subscription::find($period->subscription_id);
        if (! $s) {
            return;
        }
        $s->update(['lapsed' => 0] + ($s->status === 'pending' ? ['status' => 'active'] : []));
        $this->notices->paid($s, $period);
        $this->makeDueOrders();   // a day already inside its cut-off goes to the kitchen now
    }

    // ── making the day's meals ────────────────────────────────────────────

    /** Paid delivery days whose cut-off has passed become kitchen orders (once each). @return int how many */
    public function makeDueOrders(?Carbon $now = null): int
    {
        if (! self::installed()) {
            return 0;
        }
        $now ??= Carbon::now($this->tz());
        $n = 0;
        $q = SubDelivery::where('status', 'scheduled')->where('delivery_date', '>=', $this->today($now)->toDateString())->where('delivery_date', '<=', $this->today($now)->addDays(8)->toDateString())
            ->whereIn('period_id', SubPeriod::where('status', 'paid')->select('id'))->orderBy('delivery_date');
        foreach ($q->get() as $d) {
            $s = Subscription::find($d->subscription_id);
            $p = $s ? Plan::find($s->plan_id) : null;
            if (! $s || ! $p || $s->status === 'cancelled' || $this->cutoff($p, $d->delivery_date->copy())->gt($now)) {
                continue;
            }
            try {
                $this->makeOrder($s, $p, $d);
                $n++;
            } catch (\Throwable $e) {
                report($e);
            }
        }

        return $n;
    }

    /** The kitchen order for one delivery day: an ordinary delivery order (paid), fired to the kitchen stations; its stock is taken from the Sales Order the week was billed on. */
    public function makeOrder(Subscription $s, Plan $p, SubDelivery $d): MenuOrder
    {
        $channel = Channel::where('order_type', 'delivery')->orderByDesc('is_active')->orderBy('id')->first() ?? throw new BooksException('Set up a delivery way to order under Menus → Settings first.');
        $period = SubPeriod::findOrFail($d->period_id);
        $lines = (array) $d->meals;
        $sub = round(array_sum(array_column($lines, 'price')), 2);
        $share = (float) $period->subtotal > 0 ? $sub / (float) $period->subtotal : 0.0;
        $tax = round((float) $period->tax_total * $share, 2);
        $order = DB::transaction(function () use ($s, $p, $d, $channel, $period, $lines, $sub, $tax) {
            $o = MenuOrder::create(['number' => 'MO-'.Str::upper(Str::random(8)), 'track_token' => Str::random(40), 'channel_id' => $channel->id, 'order_type' => 'delivery', 'location_id' => $p->location_id, 'voucher_id' => $period->voucher_id,
                'sale_id' => $period->sale_id, 'customer_id' => $s->customer_id, 'user_id' => $s->user_id, 'name' => $s->name, 'email' => $s->email, 'phone' => $s->phone, 'status' => 'placed', 'payment' => 'paid', 'asap' => false,
                'fulfil_at' => $this->startsAt($p, $d->delivery_date->copy()), 'delivery_address' => $s->address, 'delivery_fee' => 0, 'subtotal' => $sub, 'tax_total' => $tax, 'total' => round($sub + $tax, 2), 'currency_id' => Currency::getBaseCurrency()?->id,
                'notes' => "Meal plan {$s->number}: deliver between ".substr((string) $p->slot_from, 0, 5).' and '.substr((string) $p->slot_to, 0, 5).($d->free ? ' (a day owed: not charged)' : ''), 'placed_at' => now()]);
            $o->update(['number' => 'MO-'.str_pad((string) $o->id, 6, '0', STR_PAD_LEFT)]);
            foreach ($lines as $l) {
                $dish = Dish::find($l['dish_id']);
                MenuOrderLine::create(['order_id' => $o->id, 'dish_id' => $l['dish_id'], 'variant_id' => $dish?->variant_id ?? 0, 'name' => $l['name'], 'quantity' => 1, 'base_price' => $l['base_price'] ?? $l['price'], 'unit_price' => $l['price'], 'options' => null, 'note' => null]);
            }
            $d->update(['status' => 'ordered', 'order_id' => $o->id]);

            return $o;
        });
        try {
            $this->kitchen->fire($order);
        } catch (\Throwable $e) {
            report($e);   // a problem with the kitchen screens must never undo an order that was made
        }
        $this->takeStock($d->fresh());
        $this->notices->orderMade($s, $d->fresh(), substr((string) $p->slot_from, 0, 5), substr((string) $p->slot_to, 0, 5));

        return $order;
    }

    /** The stock of the day's dishes goes out on a delivery note made from the week's Sales Order; a shortage is noted and never stops the meal. */
    private function takeStock(SubDelivery $d): void
    {
        $period = SubPeriod::find($d->period_id);
        $ids = array_filter((array) $d->item_ids);
        if (! $period?->voucher_id || ! $ids) {
            return;
        }
        try {
            $this->vouchers->convert(Voucher::findOrFail($period->voucher_id), VoucherType::DELIVERY_NOTE, ['lines' => array_fill_keys(array_map('intval', $ids), 1), 'reference_no' => 'Plan '.$d->delivery_date->format('j M')], null);
            $d->update(['stock_note' => 'taken']);
        } catch (\Throwable $e) {
            $d->update(['stock_note' => 'Stock was not taken: '.mb_substr($e->getMessage(), 0, 250)]);
            report($e);
        }
    }

    // ── skipping, pausing, cancelling ─────────────────────────────────────

    private function beforeCutoff(Subscription $s, SubDelivery $d, ?Carbon $now = null): bool
    {
        $p = Plan::find($s->plan_id);

        return $p && $this->cutoff($p, $d->delivery_date->copy())->gt($now ?? Carbon::now($this->tz()));
    }

    /** Skip a day (up to the plan's cut-off before it). A paid day that is skipped is owed: a later day is free. A day not paid for yet just leaves the week's bill. */
    public function skip(Subscription $s, SubDelivery $d, ?Carbon $now = null, bool $force = false): SubDelivery
    {
        if ((int) $d->subscription_id !== (int) $s->id || $d->status !== 'scheduled') {
            throw new BooksException('That day can not be skipped.');
        }
        if (! $force && ! $this->beforeCutoff($s, $d, $now)) {
            throw new BooksException('It is too late to skip that day: the kitchen has it already.');
        }
        $period = SubPeriod::findOrFail($d->period_id);
        $d->update(['status' => 'skipped', 'skipped_at' => now()]);
        if ($period->status === 'paid') {   // a paid day that is skipped is owed (a day owed that is skipped stays owed)
            $s->increment('credit_days');
        } elseif ($period->status === 'due') {
            $this->rebuild($s, $period);
        }

        return $this->again($d);
    }

    /** The delivery as it is now: a re-billed week makes its rows again, so it is found by its day. */
    private function again(SubDelivery $d): SubDelivery
    {
        return SubDelivery::where('subscription_id', $d->subscription_id)->where('delivery_date', $d->delivery_date->toDateString())->firstOrFail();
    }

    /** Change your mind: put a skipped day back (before its cut-off). */
    public function unskip(Subscription $s, SubDelivery $d, ?Carbon $now = null): SubDelivery
    {
        if ((int) $d->subscription_id !== (int) $s->id || $d->status !== 'skipped') {
            throw new BooksException('That day is not skipped.');
        }
        if (! $this->beforeCutoff($s, $d, $now)) {
            throw new BooksException('It is too late to put that day back.');
        }
        $period = SubPeriod::findOrFail($d->period_id);
        if ($period->status === 'paid') {
            if ($s->credit_days < 1) {
                throw new BooksException('That day was already used for another day you were owed.');
            }
            $s->decrement('credit_days');
            $d->update(['status' => 'scheduled', 'skipped_at' => null]);
        } elseif ($period->status === 'due') {
            $d->update(['status' => 'scheduled', 'skipped_at' => null]);
            $this->rebuild($s, $period);
        } else {
            throw new BooksException('That week can no longer be changed.');
        }

        return $this->again($d);
    }

    /** An unpaid week is billed again after a change (a skipped day leaves it, a put-back day returns): the old Sales Order is cancelled and a new one made. */
    private function rebuild(Subscription $s, SubPeriod $period): void
    {
        $p = Plan::findOrFail($s->plan_id);
        $keep = SubDelivery::where('period_id', $period->id)->where('status', 'skipped')->pluck('delivery_date')->map(fn ($x) => $x->toDateString())->all();
        if ($period->voucher_id && ($v = Voucher::find($period->voucher_id)) && $v->status !== Voucher::CANCELLED) {
            $this->vouchers->cancel($v, 'Meal plan week changed', null);
        }
        $s->increment('credit_days', (int) SubDelivery::where('period_id', $period->id)->where('free', true)->count());   // days owed that were used in the old bill come back, and are used again in the new one
        $period->update(['status' => 'void']);
        $this->billWeek($s->fresh(), $p, $period->week_start->copy(), null, false, $keep);
    }

    /** Pause from a day (at least the cut-off away) until a day (empty: until resumed). Days inside it that are still to come are skipped (paid ones are owed). */
    public function pause(Subscription $s, mixed $from = null, mixed $until = null, ?Carbon $now = null): Subscription
    {
        if (! in_array($s->status, ['active', 'paused'], true)) {
            throw new BooksException('Only a running plan can be paused.');
        }
        $p = Plan::findOrFail($s->plan_id);
        $now ??= Carbon::now($this->tz());
        $earliest = $this->today($now)->addDays((int) ceil($p->cutoff_hours / 24));
        $f = $from ? Carbon::parse((string) $from, $this->tz())->startOfDay() : $earliest;
        $u = $until ? Carbon::parse((string) $until, $this->tz())->startOfDay() : null;
        if ($f->lt($earliest)) {
            $f = $earliest;   // the kitchen already has the days before that
        }
        if ($u && $u->lt($f)) {
            throw new BooksException('The plan can not resume before it pauses.');
        }
        $s->update(['status' => 'paused', 'paused_from' => $f->toDateString(), 'paused_until' => $u?->toDateString()]);
        foreach (SubDelivery::where('subscription_id', $s->id)->where('status', 'scheduled')->where('delivery_date', '>=', $f->toDateString())->when($u, fn ($q) => $q->where('delivery_date', '<=', $u->toDateString()))->get() as $d) {
            if ($this->beforeCutoff($s, $d, $now)) {
                $this->skip($s->fresh(), $d, $now);
            }
        }

        return $s->fresh();
    }

    public function resume(Subscription $s): Subscription
    {
        if ($s->status !== 'paused') {
            throw new BooksException('The plan is not paused.');
        }
        if (($plan = Plan::find($s->plan_id)) && ! MembershipRules::qualifies($plan, $s->user_id)) {
            throw new BooksException(MembershipRules::message($plan));
        }
        $s->update(['status' => 'active', 'paused_from' => null, 'paused_until' => null]);

        return $s->fresh();
    }

    /** Stop the plan. Unpaid weeks are cancelled in the books; paid days not yet delivered are given back (staff are shown the amount). */
    public function cancel(Subscription $s, ?string $reason = null): Subscription
    {
        if ($s->status === 'cancelled') {
            throw new BooksException('This plan is cancelled already.');
        }
        DB::transaction(function () use ($s, $reason) {
            foreach (SubPeriod::where('subscription_id', $s->id)->where('status', 'due')->get() as $p) {
                if ($p->voucher_id && ($v = Voucher::find($p->voucher_id)) && $v->status !== Voucher::CANCELLED) {
                    $this->vouchers->cancel($v, "Meal plan {$s->number} cancelled", null);
                }
                $p->update(['status' => 'void']);
            }
            SubDelivery::where('subscription_id', $s->id)->where('status', 'scheduled')->update(['status' => 'cancelled']);
            $r = trim((string) $reason);
            $s->update(['status' => 'cancelled', 'cancelled_at' => now(), 'cancel_reason' => $r === '' ? null : mb_substr($r, 0, 300)]);
        });
        $this->notices->cancelled($s->fresh());

        return $s->fresh();
    }

    /** @param array{address?: mixed, phone?: mixed, email?: mixed, weekdays?: mixed} $in What the customer may change: where to deliver, their phone, and (from weeks not yet billed) the days. */
    public function update(Subscription $s, array $in): Subscription
    {
        if ($s->status === 'cancelled') {
            throw new BooksException('This plan is cancelled.');
        }
        $row = [];
        if (array_key_exists('address', $in)) {
            $a = trim((string) $in['address']);
            if ($a === '') {
                throw new BooksException('Enter the address to deliver to.');
            }
            $row['address'] = mb_substr($a, 0, 500);
        }
        if (array_key_exists('phone', $in)) {
            $ph = trim((string) $in['phone']);
            if ($ph === '') {
                throw new BooksException('Enter your phone number.');
            }
            $row['phone'] = mb_substr($ph, 0, 40);
        }
        if (array_key_exists('weekdays', $in)) {
            $p = Plan::findOrFail($s->plan_id);
            $days = array_values(array_unique(array_map('intval', (array) $in['weekdays'])));
            sort($days);
            if (array_diff($days, $p->weekdays()) || count($days) < $p->min_days) {
                throw new BooksException("Choose at least {$p->min_days} of the days this plan delivers.");
            }
            $row['weekdays'] = implode(',', $days);   // weeks already billed keep their days; the next weeks follow these
        }
        $s->update($row);

        return $s->fresh();
    }

    // ── the daily and hourly job ──────────────────────────────────────────

    /**
     * Bill the coming weeks, let unpaid weeks lapse, remind, end pauses that are over, give up on a first payment never made and make the kitchen orders that are due.
     *
     * @return array{billed: int, lapsed: int, orders: int}
     */
    public function run(?Carbon $now = null): array
    {
        if (! self::installed()) {
            return ['billed' => 0, 'lapsed' => 0, 'orders' => 0];
        }
        $now = ($now ?? Carbon::now($this->tz()))->copy();
        $ahead = (int) MenusSettings::all()['plans_bill_ahead_days'];
        $billed = 0;
        foreach (Subscription::where('status', 'paused')->whereNotNull('paused_until')->where('paused_until', '<', $this->today($now)->toDateString())->get() as $s) {
            $s->update(['status' => 'active', 'paused_from' => null, 'paused_until' => null]);
        }
        foreach (Subscription::whereIn('status', ['active', 'paused'])->get() as $s) {
            $p = Plan::find($s->plan_id);
            if (! $p) {
                continue;
            }
            if ($s->status === 'active' && ! MembershipRules::qualifies($p, $s->user_id)) {   // the membership this plan needs has ended
                $s->update(['status' => 'paused', 'paused_from' => $this->today($now)->toDateString(), 'paused_until' => null]);
                $this->notices->membershipNeeded($s->fresh(), $p);

                continue;
            }
            for ($i = 0; $i < 3; $i++) {
                $monday = $this->monday($now)->addWeeks($i);
                if ($monday->copy()->subDays($ahead)->gt($this->today($now))) {
                    break;
                }
                $has = SubPeriod::where('subscription_id', $s->id)->where('week_start', $monday->toDateString())->exists();
                if (! $has && $this->billWeek($s->fresh(), $p, $monday, $now)) {
                    $billed++;
                }
            }
        }
        $lapsed = $this->lapse($now);
        $this->remind($now);
        $orders = $this->makeDueOrders($now);

        return ['billed' => $billed, 'lapsed' => $lapsed, 'orders' => $orders];
    }

    /** Weeks not paid by their time lapse: those days are not made; a plan never paid for is dropped; two weeks in a row pause the plan. @return int how many weeks lapsed */
    private function lapse(Carbon $now): int
    {
        $n = 0;
        foreach (SubPeriod::where('status', 'due')->where('pay_by', '<', $now)->get() as $p) {
            $s = Subscription::find($p->subscription_id);
            if (! $s) {
                continue;
            }
            if ($p->voucher_id && ($v = Voucher::find($p->voucher_id)) && $v->status !== Voucher::CANCELLED) {
                try {
                    $this->vouchers->cancel($v, "Meal plan {$s->number}: week not paid in time", null);
                } catch (\Throwable $e) {
                    report($e);
                }
            }
            $p->update(['status' => 'lapsed']);
            SubDelivery::where('period_id', $p->id)->whereIn('status', ['scheduled'])->update(['status' => 'missed']);
            // the days owed that were meant to be used in that week come back
            $s->increment('credit_days', (int) SubDelivery::where('period_id', $p->id)->where('free', true)->where('status', 'missed')->count());
            $n++;
            if ($s->status === 'pending') {
                $s->update(['status' => 'cancelled', 'cancelled_at' => now(), 'cancel_reason' => 'The first week was not paid.']);
                continue;
            }
            $s->increment('lapsed');
            $pause = $s->fresh()->lapsed >= 2;
            if ($pause) {
                $s->update(['status' => 'paused', 'paused_from' => $this->today($now)->toDateString(), 'paused_until' => null]);
                $this->notices->staff('menu_plan_paused', "{$s->name}'s meal plan was paused", 'Two weeks in a row were not paid.');
            }
            $this->notices->lapsed($s->fresh(), $p, $pause);
        }

        return $n;
    }

    private function remind(Carbon $now): void
    {
        foreach (SubPeriod::where('status', 'due')->whereNull('reminded_at')->where('pay_by', '<=', $now->copy()->addDay())->where('pay_by', '>', $now)->get() as $p) {
            $s = Subscription::find($p->subscription_id);
            if ($s && $s->status !== 'pending' && (float) $p->total > 0) {
                $this->notices->reminder($s, $p);
            }
            $p->update(['reminded_at' => $now]);
        }
    }

    // ── what the screens show ─────────────────────────────────────────────

    /** @return array<string, mixed> what the customer sees at their link */
    public function customerView(Subscription $s): array
    {
        $p = Plan::findOrFail($s->plan_id);
        $now = Carbon::now($this->tz());
        $periods = SubPeriod::where('subscription_id', $s->id)->orderBy('week_start')->get();
        $deliveries = SubDelivery::where('subscription_id', $s->id)->where('delivery_date', '>=', $this->today($now)->toDateString())->orderBy('delivery_date')->limit(30)->get();

        return ['number' => $s->number, 'status' => $s->status, 'status_label' => Subscription::STATUSES[$s->status] ?? $s->status, 'plan' => ['name' => $p->name, 'day_price' => (float) $p->day_price, 'slot_from' => substr((string) $p->slot_from, 0, 5),
            'slot_to' => substr((string) $p->slot_to, 0, 5), 'cutoff_hours' => $p->cutoff_hours, 'delivery_weekdays' => $p->weekdays(), 'min_days' => $p->min_days], 'name' => $s->name, 'phone' => $s->phone, 'address' => $s->address, 'weekdays' => $s->days(),
            'start_date' => $s->start_date->toDateString(), 'paused_from' => $s->paused_from?->toDateString(), 'paused_until' => $s->paused_until?->toDateString(), 'credit_days' => (int) $s->credit_days, 'cancel_reason' => $s->cancel_reason,
            'to_pay' => $periods->where('status', 'due')->map(fn (SubPeriod $x) => ['id' => $x->id, 'week_start' => $x->week_start->toDateString(), 'total' => (float) $x->total, 'pay_by' => $x->pay_by?->toIso8601String()])->values()->all(),
            'deliveries' => $deliveries->map(fn (SubDelivery $d) => ['id' => $d->id, 'date' => $d->delivery_date->toDateString(), 'status' => $d->status, 'status_label' => SubDelivery::STATUSES[$d->status] ?? $d->status, 'free' => $d->free,
                'dishes' => array_column((array) $d->meals, 'name'), 'can_skip' => $d->status === 'scheduled' && $this->beforeCutoff($s, $d, $now), 'can_unskip' => $d->status === 'skipped' && $this->beforeCutoff($s, $d, $now),
                'skip_until' => $this->cutoff($p, $d->delivery_date->copy())->toIso8601String()])->values()->all()];
    }

    /** @return array<string, mixed> one subscriber for the staff list */
    public function staffRow(Subscription $s, ?Plan $p = null): array
    {
        $p ??= Plan::find($s->plan_id);
        $next = SubDelivery::where('subscription_id', $s->id)->whereIn('status', ['scheduled', 'ordered'])->where('delivery_date', '>=', $this->today()->toDateString())->orderBy('delivery_date')->first();
        $due = SubPeriod::where('subscription_id', $s->id)->where('status', 'due')->sum('total');
        $refund = 0.0;
        if ($s->status === 'cancelled') {   // paid days never delivered: what to give back (tax in the same proportion as the week)
            foreach (SubDelivery::where('subscription_id', $s->id)->where('status', 'cancelled')->where('free', false)->get() as $d) {
                $period = SubPeriod::find($d->period_id);
                if ($period && $period->status === 'paid' && (float) $period->subtotal > 0) {
                    $refund += array_sum(array_column((array) $d->meals, 'price')) * (float) $period->total / (float) $period->subtotal;
                }
            }
        }

        return ['id' => $s->id, 'number' => $s->number, 'plan' => $p?->name, 'plan_id' => $s->plan_id, 'location_id' => $p?->location_id, 'status' => $s->status, 'status_label' => Subscription::STATUSES[$s->status] ?? $s->status, 'name' => $s->name, 'phone' => $s->phone, 'email' => $s->email,
            'address' => $s->address, 'weekdays' => $s->days(), 'start_date' => $s->start_date->toDateString(), 'paused_from' => $s->paused_from?->toDateString(), 'paused_until' => $s->paused_until?->toDateString(), 'credit_days' => (int) $s->credit_days,
            'lapsed' => (int) $s->lapsed, 'next_delivery' => $next?->delivery_date->toDateString(), 'unpaid' => round((float) $due, 2), 'refund_due' => round($refund, 2), 'cancel_reason' => $s->cancel_reason];
    }

    /**
     * What the kitchen makes and who to deliver to on a day: the dishes counted, and each customer's address in order.
     *
     * @return array{date: string, dishes: array<int, array{name: string, count: int}>, stops: array<int, array<string, mixed>>}
     */
    public function dayPlan(Carbon $day, ?callable $scope = null): array
    {
        $q = SubDelivery::where('delivery_date', $day->toDateString())->whereIn('status', ['scheduled', 'ordered'])->whereIn('period_id', SubPeriod::where('status', 'paid')->select('id'));
        $rows = $q->get();
        $subs = Subscription::whereIn('id', $rows->pluck('subscription_id'))->get()->keyBy('id');
        $plans = Plan::whereIn('id', $subs->pluck('plan_id'))->get()->keyBy('id');
        $count = [];
        $stops = [];
        foreach ($rows as $d) {
            $s = $subs[$d->subscription_id] ?? null;
            $p = $s ? ($plans[$s->plan_id] ?? null) : null;
            if (! $s || ! $p || ($scope && ! $scope($p))) {
                continue;
            }
            foreach ((array) $d->meals as $l) {
                $count[$l['name']] = ($count[$l['name']] ?? 0) + 1;
            }
            $stops[] = ['subscription' => $s->number, 'name' => $s->name, 'phone' => $s->phone, 'address' => $s->address, 'window' => substr((string) $p->slot_from, 0, 5).'–'.substr((string) $p->slot_to, 0, 5), 'plan' => $p->name,
                'dishes' => array_column((array) $d->meals, 'name'), 'status' => $d->status, 'order_id' => $d->order_id, 'stock_note' => $d->stock_note && $d->stock_note !== 'taken' ? $d->stock_note : null];
        }
        ksort($count);

        return ['date' => $day->toDateString(), 'dishes' => array_map(fn ($n, $c) => ['name' => $n, 'count' => $c], array_keys($count), $count), 'stops' => $stops];
    }
}
