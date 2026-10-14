<?php

namespace App\Services\Memberships;

use App\Models\Books\PaymentMethod;
use App\Models\Books\Voucher;
use App\Models\Books\VoucherType;
use App\Models\Currency;
use App\Models\Location;
use App\Models\Memberships\Membership;
use App\Models\Memberships\MembershipEvent;
use App\Models\Memberships\Period;
use App\Models\Memberships\Plan;
use App\Models\User;
use App\Services\Books\BooksException;
use App\Services\Books\GatewayPaymentService;
use App\Services\Books\VoucherService;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Holding a membership, through the books. Joining makes a Sales Order and an invoice (the joining fee with the first period); each renewal is invoiced a few days before the paid time runs out
 * and the member pays it (M-Pesa or card from a pay link, or at the desk as a receipt). `paid_until` is how far the money covers: paying a period moves it on by one period, with no gap. A late
 * payment keeps the benefits for the plan's grace days (the membership is "past due"), then the membership lapses and the benefits stop; paying the open invoice starts it again from that day.
 * A member may pause (the paid time moves out by the days paused), cancel (at the end of the paid time) or change plan (an upgrade is charged for the rest of the period now, a downgrade waits for the
 * next renewal). Staff may give a membership without billing. Refunds are credit notes. Nothing here posts a journal by itself.
 */
class MembershipService
{
    public function __construct(private VoucherService $vouchers, private GatewayPaymentService $gateway, private MembershipBenefits $benefits, private MembershipNotices $notices, private PlanService $plans)
    {
    }

    public static function installed(): bool
    {
        return PlanService::installed() && Schema::hasTable('memberships') && Schema::hasTable('membership_periods') && Schema::hasTable('membership_events');
    }

    private function tz(): string
    {
        return (string) config('app.timezone', 'Africa/Nairobi');
    }

    private function today(?Carbon $now = null): Carbon
    {
        return ($now ?? Carbon::now($this->tz()))->copy()->timezone($this->tz())->startOfDay();
    }

    /** The end (not included) of a period that starts on $from. */
    public function endOf(Carbon $from, Plan $p): Carbon
    {
        return PlanService::periodEnd($from, $p);
    }

    private function days(Plan $p, ?Carbon $from = null): int
    {
        $f = ($from ?? Carbon::now($this->tz()))->copy()->startOfDay();

        return max(1, (int) $f->diffInDays($this->endOf($f, $p)));
    }

    private function log(Membership $m, string $type, ?string $note = null, ?int $by = null): void
    {
        MembershipEvent::create(['membership_id' => $m->id, 'type' => $type, 'note' => $note ? mb_substr($note, 0, 300) : null, 'by_user_id' => $by, 'created_at' => now()]);
    }

    private function settings(): array
    {
        return MembershipSettings::all();
    }

    // ── benefits ──────────────────────────────────────────────────────────

    /** Hand the plan's benefits over (on) or take them back (off). A module that fails never undoes the membership. */
    private function entitle(Membership $m, bool $on, ?Plan $plan = null): void
    {
        $plan ??= Plan::with('benefits')->find($m->plan_id);
        foreach ($plan?->benefits ?? Plan::with('benefits')->find($m->plan_id)?->benefits ?? [] as $b) {
            $fn = $on ? $this->benefits->granter($b->type) : $this->benefits->revoker($b->type);
            if ($fn) {
                try {
                    $fn($m, $b->config ?? []);
                } catch (\Throwable $e) {
                    report($e);
                }
            }
        }
    }

    // ── invoicing ─────────────────────────────────────────────────────────

    private function payload(Membership $m, Period $p, array $lines, User $payer, string $narration): array
    {
        $rows = array_map(fn ($l) => ['type' => 'custom', 'description' => $l['description'], 'quantity' => 1, 'rate' => round((float) $l['amount'], 2), 'ledger_id' => (int) $l['ledger_id']], $lines);
        $loc = Location::where('is_default', true)->value('id') ?: Location::orderBy('id')->value('id');

        return ['date' => today($this->tz())->toDateString(), 'location_id' => $loc, 'currency_id' => Currency::getBaseCurrency()?->id, 'customer_id' => $m->customer_id, 'channel' => 'storefront', 'lines' => $rows,
            'narration' => $narration, 'meta' => ['contact' => ['name' => $payer->name, 'email' => $payer->email, 'phone' => $payer->customer?->phone ?? null], 'membership_id' => $m->id, 'membership_period_id' => $p->id]];
    }

    /**
     * Raise an invoice for a membership: a Sales Order converted to an invoice, with a line for each charge.
     *
     * @param array<int, array{description: string, amount: float, ledger_id: int}> $lines
     */
    private function invoice(Membership $m, Plan $plan, string $kind, string $label, array $lines, ?Carbon $from, ?Carbon $to, Carbon $due): Period
    {
        $payer = User::findOrFail($m->payer_user_id ?: $m->member_user_id);
        if (! $m->customer_id && ($c = $payer->customer)) {   // the account was made after joining
            $m->update(['customer_id' => $c->id]);
        }
        if (! $m->customer_id) {
            throw new BooksException("{$payer->name} needs a customer account to be invoiced: create it under Customers first.");
        }

        return DB::transaction(function () use ($m, $plan, $kind, $label, $lines, $from, $to, $due, $payer) {
            $p = Period::create(['membership_id' => $m->id, 'seq' => (int) Period::where('membership_id', $m->id)->max('seq') + 1, 'kind' => $kind, 'label' => mb_substr($label, 0, 160), 'plan_id' => $plan->id,
                'period_from' => $from?->toDateString(), 'period_to' => $to?->toDateString(), 'due_date' => $due->toDateString(), 'status' => 'open', 'invoiced_at' => now()]);
            $payload = $this->payload($m, $p, $lines, $payer, "Membership {$m->number}: {$label}");
            $order = $this->vouchers->placeOrder($payload, null);
            $invoice = $this->vouchers->convert($order, VoucherType::SALES, ['moves_stock' => false, 'due_date' => $due->toDateString()], null);
            $p->update(['voucher_id' => $order->id, 'invoice_id' => $invoice->id, 'amount' => round((float) $invoice->total_amount, 2)]);

            return $p->fresh();
        });
    }

    // ── joining ───────────────────────────────────────────────────────────

    private function live(int $userId): ?Membership
    {
        return Membership::where('member_user_id', $userId)->whereIn('status', Membership::LIVE)->first();
    }

    private function seats(Plan $p): int
    {
        return Membership::where('plan_id', $p->id)->whereIn('status', ['pending', 'trial', 'active', 'past_due', 'paused'])->count();
    }

    private function owesJoiningFee(int $userId, Plan $p): bool
    {
        return (float) $p->joining_fee > 0 && ! Membership::where('member_user_id', $userId)->where('plan_id', $p->id)->whereNotNull('started_on')->exists();
    }

    /** What joining would cost, tax included, shown before anyone commits. @return array<string, mixed> */
    public function quote(Plan $p, User $member, ?User $payer = null): array
    {
        $payer ??= $member;
        $lines = $this->joinLines($p, $member);
        $total = 0.0;
        if ($lines) {
            $stub = new Membership(['number' => 'quote', 'customer_id' => $payer->customer?->id]);
            $stub->id = 0;
            $per = new Period();
            $per->id = 0;
            $total = round((float) $this->vouchers->preview($this->payload($stub, $per, $lines, $payer, 'Membership quote'), null)['total'], 2);
        }

        return ['lines' => array_map(fn ($l) => ['description' => $l['description'], 'amount' => $l['amount']], $lines), 'total' => $total, 'trial_days' => $this->trialFor($member->id, $p) ? (int) $p->trial_days : 0, 'period_label' => $this->plans->periodLabel($p), 'free' => $lines === []];
    }

    /** A plan's free trial is given once to a person. */
    private function trialFor(int $userId, Plan $p, ?int $except = null): bool
    {
        return (int) $p->trial_days > 0 && ! Membership::where('member_user_id', $userId)->where('plan_id', $p->id)->when($except, fn ($q) => $q->where('id', '!=', $except))->whereNotNull('trial_ends_on')->exists();
    }

    /** @return array<int, array{description: string, amount: float, ledger_id: int}> */
    private function joinLines(Plan $p, User $member): array
    {
        $lines = [];
        if ($this->owesJoiningFee($member->id, $p)) {
            $lines[] = ['description' => $p->name.' — joining fee', 'amount' => (float) $p->joining_fee, 'ledger_id' => (int) ($p->joining_ledger_id ?: $p->ledger_id)];
        }
        if ((float) $p->price > 0 && ! $this->trialFor($member->id, $p)) {
            $lines[] = ['description' => $p->name.' — '.$this->plans->periodLabel($p), 'amount' => (float) $p->price, 'ledger_id' => (int) $p->ledger_id];
        }

        return $lines;
    }

    /**
     * Join a plan. The invoice goes to the payer (the member unless another is named), who needs a customer account. Free, or a trial with no joining fee: it starts at once.
     *
     * @param array{member_user_id?: mixed, payer_user_id?: mixed, notes?: mixed} $in
     */
    public function join(Plan $plan, array $in, ?User $by = null, string $channel = 'online', ?Carbon $now = null): Membership
    {
        if (! self::installed()) {
            throw new BooksException('Run database script 163_memberships_members.sql first.');
        }
        if ($plan->status !== 'published') {
            throw new BooksException('That plan is not open for new members.');
        }
        $member = User::find((int) ($in['member_user_id'] ?? 0)) ?? throw new BooksException('Choose the member.');
        $payer = ! empty($in['payer_user_id']) ? (User::find((int) $in['payer_user_id']) ?? throw new BooksException('Choose who pays.')) : $member;
        if ($this->live($member->id)) {
            throw new BooksException("{$member->name} holds a membership already: change the plan or end it first.");
        }
        if ($plan->capacity && $this->seats($plan) >= (int) $plan->capacity) {
            throw new BooksException('This plan is full.');
        }
        $lines = $this->joinLines($plan, $member);
        $customer = $payer->customer;
        if (($lines || (float) $plan->price > 0) && ! $customer) {   // a trial is free, but the periods after it are invoiced
            throw new BooksException("{$payer->name} needs a customer account to be invoiced: create it under Customers first.");
        }
        $now = ($now ?? Carbon::now($this->tz()))->copy();
        $hours = (int) $this->settings()['pending_hours'];

        $m = DB::transaction(function () use ($plan, $member, $payer, $customer, $by, $channel, $in, $lines, $now, $hours) {
            $m = Membership::create(['number' => 'MB-'.strtoupper(bin2hex(random_bytes(4))), 'plan_id' => $plan->id, 'member_user_id' => $member->id, 'payer_user_id' => $payer->id === $member->id ? null : $payer->id, 'customer_id' => $customer?->id,
                'status' => 'pending', 'billing' => 'invoice', 'channel' => $channel === 'counter' ? 'counter' : 'online', 'created_by' => $by?->id, 'notes' => filled($in['notes'] ?? null) ? mb_substr(trim((string) $in['notes']), 0, 500) : null]);
            $m->update(['number' => 'MB-'.str_pad((string) $m->id, 6, '0', STR_PAD_LEFT)]);
            $this->log($m, 'joined', $plan->name, $by?->id);
            if (! $lines) {
                $this->begin($m->fresh(), $plan, $now);

                return $m->fresh();
            }
            $kind = (float) $plan->price > 0 && ! $this->trialFor($member->id, $plan) ? 'first' : 'joining';   // 'first' carries the first period
            $this->invoice($m, $plan, $kind, $kind === 'first' ? 'Joining and first period' : 'Joining fee', $lines, null, null, $this->today($now));
            $m->update(['expires_at' => $hours > 0 ? $now->copy()->addHours($hours) : null]);

            return $m->fresh();
        });
        $this->notices->joined($m, (float) (Period::where('membership_id', $m->id)->value('amount') ?? 0));

        return $m->fresh();
    }

    /** The first money is in (or there was none to take): the membership starts, with a trial first when the plan has one. */
    private function begin(Membership $m, Plan $plan, ?Carbon $now = null): void
    {
        $today = $this->today($now);
        $trial = ! $m->trial_ends_on && $this->trialFor((int) $m->member_user_id, $plan, $m->id);
        if ($trial) {
            $m->update(['status' => 'trial', 'started_on' => $today, 'trial_ends_on' => $today->copy()->addDays((int) $plan->trial_days), 'period_from' => $today, 'paid_until' => $today->copy()->addDays((int) $plan->trial_days), 'expires_at' => null]);
        } else {
            $to = $this->endOf($today, $plan);
            $m->update(['status' => 'active', 'started_on' => $today, 'period_from' => $today, 'paid_until' => $to, 'expires_at' => null]);
            Period::where('membership_id', $m->id)->where('kind', 'first')->update(['period_from' => $today->toDateString(), 'period_to' => $to->toDateString()]);
        }
        $this->log($m, 'started', $trial ? 'trial' : null);
        $this->entitle($m->fresh(), true, $plan);
        $this->notices->started($m->fresh());
    }

    // ── money in ──────────────────────────────────────────────────────────

    /** The next amount to pay on a membership: its oldest open invoice. */
    public function openPeriod(Membership $m): ?Period
    {
        return Period::where('membership_id', $m->id)->where('status', 'open')->orderBy('seq')->first();
    }

    private function method(array $in): PaymentMethod
    {
        $pm = ! empty($in['payment_method_id']) ? PaymentMethod::offeredAtCheckout()->whereKey((int) $in['payment_method_id'])->first() : null;
        if (! $pm) {
            throw new BooksException('Choose how to pay.');
        }
        if (! GatewayPaymentService::isAutomatic($pm)) {
            throw new BooksException("{$pm->name} can't be charged automatically: choose M-Pesa or a card.");
        }

        return $pm;
    }

    /** Start an M-Pesa or card payment for an open invoice. @return array{attempt: array, redirect_url: ?string, message: string} */
    public function pay(Period $p, array $in, ?User $user = null): array
    {
        if ($p->status !== 'open' || ! $p->invoice_id) {
            throw new BooksException('There is nothing to pay on this.');
        }
        $m = Membership::findOrFail($p->membership_id);
        $amount = $p->owing();
        $pm = $this->method($in);
        $payer = User::find($m->payer_user_id ?: $m->member_user_id);
        $r = $this->gateway->start(Voucher::findOrFail($p->invoice_id), $pm, ['phone' => $in['phone'] ?? $payer?->customer?->phone, 'email' => $payer?->email, 'name' => $payer?->name], [], $amount, $user);
        $a = $r['attempt'];

        return ['attempt' => ['id' => $a->id, 'status' => $a->status, 'amount' => (float) $a->amount, 'gateway' => $a->gateway, 'token' => GatewayPaymentService::returnToken((int) $a->id)], 'redirect_url' => $r['redirect_url'] ?? null,
            'message' => ($r['redirect_url'] ? 'Taking you to the secure payment page' : 'Check your phone and enter your M-Pesa PIN').' to pay '.number_format($amount, 2).'.'];
    }

    /**
     * Staff take money at the desk: a Receipt against the invoice.
     *
     * @param array<int, array{payment_method_id: int, amount: float, reference?: ?string}> $tenders
     */
    public function takePayment(Period $p, array $tenders, ?User $by = null): Period
    {
        if ($p->status !== 'open' || ! $p->invoice_id) {
            throw new BooksException('There is nothing to pay on this.');
        }
        $tenders = array_map(fn ($t) => ['payment_method_id' => (int) $t['payment_method_id'], 'amount' => round((float) ($t['amount'] ?? 0), 2), 'reference' => $t['reference'] ?? null], $tenders);
        $sum = round(array_sum(array_column($tenders, 'amount')), 2);
        if (! $tenders || $sum <= 0) {
            throw new BooksException('Enter the amount received.');
        }
        if ($sum - $p->owing() > 0.009) {
            throw new BooksException('That is more than the '.number_format($p->owing(), 2).' still to pay.');
        }
        DB::transaction(function () use ($p, $tenders, $sum, $by) {
            $this->vouchers->receive(Voucher::findOrFail($p->invoice_id), ['tenders' => $tenders, 'amount' => $sum, 'payment_method_id' => $tenders[0]['payment_method_id'], 'channel' => 'admin'], $by);
            $this->received($p, $sum);
        });

        return $p->fresh();
    }

    /** A receipt reached the invoice (called by the payment service for every one). Safe to call for an invoice that is not a membership's. */
    public function paid(Voucher $invoice, float $amount): void
    {
        if (empty($invoice->meta['membership_period_id']) || ! self::installed()) {
            return;
        }
        if ($p = Period::where('invoice_id', $invoice->id)->first()) {
            $this->received($p, $amount);
        }
    }

    private function received(Period $p, float $amount, ?Carbon $now = null): void
    {
        $done = DB::transaction(function () use ($p, $amount) {
            $p = Period::whereKey($p->id)->lockForUpdate()->firstOrFail();
            $p->paid_amount = round((float) $p->paid_amount + $amount, 2);
            $full = $p->owing() <= 0.004 && $p->status === 'open';
            if ($full) {
                $p->status = 'paid';
                $p->paid_at = now();
            }
            $p->save();

            return [$p, $full];
        });
        [$p, $full] = $done;
        $m = Membership::find($p->membership_id);
        if (! $m) {
            return;
        }
        $this->notices->paid($m, $amount);
        if (! $full) {
            return;
        }
        $plan = Plan::with('benefits')->find($p->plan_id) ?? Plan::with('benefits')->findOrFail($m->plan_id);
        $today = $this->today($now);
        if (in_array($p->kind, ['first', 'joining'], true)) {
            if ($m->status === 'pending') {
                $this->begin($m->fresh(), $plan, $now);
            }
        } elseif ($p->kind === 'period') {
            $this->extend($m->fresh(), $p, $plan, $today);
        } elseif ($p->kind === 'upgrade' && $m->change_to_plan_id) {
            $old = Plan::with('benefits')->find($m->plan_id);
            $new = Plan::with('benefits')->findOrFail($m->change_to_plan_id);
            if ($old) {
                $this->entitle($m, false, $old);
            }
            $m->update(['plan_id' => $new->id, 'change_to_plan_id' => null]);
            $this->entitle($m->fresh(), true, $new);
            $this->log($m, 'upgraded', $new->name);
        }
    }

    /** A renewal was paid: the covered time moves on by one period; a lapsed membership starts again from today. */
    private function extend(Membership $m, Period $p, Plan $plan, Carbon $today): void
    {
        $wasGood = in_array($m->status, Membership::GOOD, true);
        if ($m->status === 'lapsed' || ! $m->paid_until || $today->gte($p->period_to ?? $today)) {
            $to = $this->endOf($today, $plan);
            $p->update(['period_from' => $today->toDateString(), 'period_to' => $to->toDateString()]);
            $m->update(['period_from' => $today, 'paid_until' => $to]);
        } else {
            $m->update(['period_from' => $p->period_from, 'paid_until' => $p->period_to]);
        }
        $m->update(['status' => $m->trial_ends_on && $today->lt($m->trial_ends_on) ? 'trial' : 'active']);
        $this->log($m, 'renewed', $p->label);
        $this->entitle($m->fresh(), true, $plan);   // every paid period: a benefit that is given each period (credits) gives it again
        if (! $wasGood) {
            $this->log($m, 'reactivated');
        }
    }

    // ── pause, cancel, change ────────────────────────────────────────────

    public function pause(Membership $m, int $days, ?User $by = null, bool $staff = false, ?Carbon $now = null): Membership
    {
        if (! in_array($m->status, ['trial', 'active'], true)) {
            throw new BooksException('Only a running membership can be paused.');
        }
        if ($days < 1 || $days > 365) {
            throw new BooksException('Pause for 1 to 365 days.');
        }
        if (Period::where('membership_id', $m->id)->where('status', 'open')->exists()) {
            throw new BooksException('Pay the open invoice first, then pause.');
        }
        $today = $this->today($now);
        $year = (int) $today->format('Y');
        $used = (int) ($m->pause_year === $year ? $m->pause_days_used : 0);
        $allow = (int) $this->settings()['pause_days_per_year'];
        if (! $staff && ($allow < 1 || $used + $days > $allow)) {
            throw new BooksException($allow < 1 ? 'Members cannot pause their own membership.' : 'You can pause up to '.$allow.' days a year; '.max(0, $allow - $used).' are left.');
        }
        $m->update(['status' => 'paused', 'paused_from' => $today, 'paused_until' => $today->copy()->addDays($days), 'pause_year' => $year, 'pause_days_used' => $used + $days]);
        $this->entitle($m->fresh(), false);
        $this->log($m, 'paused', "{$days} days", $by?->id);
        $this->notices->paused($m->fresh());

        return $m->fresh();
    }

    public function resume(Membership $m, ?User $by = null, ?Carbon $now = null): Membership
    {
        if ($m->status !== 'paused') {
            throw new BooksException('This membership is not paused.');
        }
        $today = $this->today($now);
        $planned = (int) $m->paused_from->diffInDays($m->paused_until);
        $actual = max(0, min($planned, (int) $m->paused_from->diffInDays($today)));
        $m->update(['status' => $m->trial_ends_on && $today->lt($m->trial_ends_on) ? 'trial' : 'active', 'paid_until' => $m->paid_until->copy()->addDays($actual), 'pause_days_used' => max(0, (int) $m->pause_days_used - ($planned - $actual)), 'paused_from' => null, 'paused_until' => null]);
        $this->entitle($m->fresh(), true);
        $this->log($m, 'resumed', "{$actual} days", $by?->id);
        $this->notices->resumed($m->fresh());

        return $m->fresh();
    }

    private function voidUnpaid(Membership $m, string $why, ?User $by = null): void
    {
        foreach (Period::where('membership_id', $m->id)->where('status', 'open')->get() as $p) {
            if ((float) $p->paid_amount > 0.004) {
                continue;
            }
            foreach ([$p->invoice_id, $p->voucher_id] as $id) {
                $v = $id ? Voucher::find($id) : null;
                if ($v && $v->status !== Voucher::CANCELLED) {
                    $this->vouchers->cancel($v, "Membership {$m->number}: {$why}", $by);
                }
            }
            $p->update(['status' => 'void']);
        }
    }

    /**
     * End a membership. By default at the end of the paid time (the benefits stay until then); `$now` ends it today (staff only). A membership nobody has paid for is cancelled with its invoice.
     */
    public function cancel(Membership $m, ?string $reason = null, bool $immediate = false, ?User $by = null): Membership
    {
        if (! in_array($m->status, Membership::LIVE, true)) {
            throw new BooksException('This membership is over already.');
        }
        $reason = trim((string) $reason) === '' ? null : mb_substr(trim((string) $reason), 0, 300);
        if ($m->status === 'pending' && $this->hasMoney($m)) {
            throw new BooksException('Part of the first payment is in: take the rest, or refund it in the books.');
        }
        if ($m->status === 'pending' || $immediate) {
            DB::transaction(function () use ($m, $reason, $by) {
                $this->voidUnpaid($m, 'cancelled'.($reason ? ": {$reason}" : ''), $by);
                $m->update(['status' => 'cancelled', 'cancelled_at' => now(), 'cancel_reason' => $reason, 'expires_at' => null, 'paid_until' => $m->status === 'pending' ? null : $this->today(), 'cancel_at_end' => false]);
            });
            $this->entitle($m->fresh(), false);
            $this->log($m, 'cancelled', $reason, $by?->id);
            $this->notices->ended($m->fresh());

            return $m->fresh();
        }
        if ($m->cancel_at_end) {
            throw new BooksException('It is set to end when the paid time runs out already.');
        }
        DB::transaction(function () use ($m, $reason, $by) {
            $this->voidUnpaid($m, 'cancelled at the end of the paid time', $by);
            $m->update(['cancel_at_end' => true, 'cancel_reason' => $reason, 'cancelled_at' => now(), 'change_to_plan_id' => null]);
        });
        $this->log($m, 'cancel_requested', $reason, $by?->id);

        return $m->fresh();
    }

    private function hasMoney(Membership $m): bool
    {
        return Period::where('membership_id', $m->id)->where('paid_amount', '>', 0)->exists();
    }

    /** Take back a cancellation made for the end of the paid time. */
    public function keep(Membership $m, ?User $by = null): Membership
    {
        if (! $m->cancel_at_end || ! in_array($m->status, Membership::GOOD, true)) {
            throw new BooksException('This membership is not set to end.');
        }
        $m->update(['cancel_at_end' => false, 'cancel_reason' => null, 'cancelled_at' => null]);
        $this->log($m, 'kept', null, $by?->id);

        return $m->fresh();
    }

    /** Move to another plan: an upgrade is charged now for the rest of the period; a downgrade waits for the next renewal. */
    public function changePlan(Membership $m, Plan $new, ?User $by = null, ?Carbon $now = null): Membership
    {
        if (! in_array($m->status, ['trial', 'active'], true) || $m->billing !== 'invoice') {
            throw new BooksException('Only a running membership that is billed can change plan.');
        }
        if ($m->cancel_at_end) {
            throw new BooksException('This membership is set to end: keep it first.');
        }
        if ($new->id === $m->plan_id) {
            throw new BooksException('It is on this plan already.');
        }
        if ($new->status !== 'published') {
            throw new BooksException('That plan is not open.');
        }
        if ($new->capacity && $this->seats($new) >= (int) $new->capacity) {
            throw new BooksException('That plan is full.');
        }
        if ($m->change_to_plan_id || Period::where('membership_id', $m->id)->where('status', 'open')->exists()) {
            throw new BooksException('Settle the open invoice or the change already waiting first.');
        }
        $old = Plan::with('benefits')->findOrFail($m->plan_id);
        $today = $this->today($now);
        $oldDay = (float) $old->price / $this->days($old, $m->period_from ?? $today);
        $newDay = (float) $new->price / $this->days($new, $today);
        $left = max(0, (int) $today->diffInDays($m->paid_until, false));
        $diff = round(($newDay - $oldDay) * $left, 2);
        if ($newDay <= $oldDay) {
            $m->update(['change_to_plan_id' => $new->id]);
            $this->log($m, 'downgrade_scheduled', $new->name, $by?->id);

            return $m->fresh();
        }
        if ($diff < 1) {
            $this->entitle($m, false, $old);
            $m->update(['plan_id' => $new->id]);
            $this->entitle($m->fresh(), true, Plan::with('benefits')->find($new->id));
            $this->log($m, 'upgraded', $new->name, $by?->id);

            return $m->fresh();
        }
        $m->update(['change_to_plan_id' => $new->id]);
        $this->invoice($m, $new, 'upgrade', "Upgrade to {$new->name}", [['description' => "{$new->name} — upgrade for {$left} days", 'amount' => $diff, 'ledger_id' => (int) $new->ledger_id]], $today, $m->paid_until, $today);
        $this->log($m, 'upgrade_invoiced', $new->name, $by?->id);

        return $m->fresh();
    }

    /** Staff give a membership without billing, for a time. */
    public function give(Plan $plan, User $member, ?Carbon $until = null, ?string $reason = null, ?User $by = null, ?Carbon $now = null): Membership
    {
        if (! self::installed()) {
            throw new BooksException('Run database script 163_memberships_members.sql first.');
        }
        if ($this->live($member->id)) {
            throw new BooksException("{$member->name} holds a membership already.");
        }
        $reason = trim((string) $reason);
        if ($reason === '') {
            throw new BooksException('Say why the membership is given without billing.');
        }
        $today = $this->today($now);
        $end = $until ? $until->copy()->startOfDay() : $this->endOf($today, $plan);
        if ($end->lte($today)) {
            throw new BooksException('Choose an end date after today.');
        }
        $m = Membership::create(['number' => 'MB-'.strtoupper(bin2hex(random_bytes(4))), 'plan_id' => $plan->id, 'member_user_id' => $member->id, 'status' => 'active', 'billing' => 'none', 'channel' => 'counter',
            'started_on' => $today, 'period_from' => $today, 'paid_until' => $end, 'created_by' => $by?->id, 'notes' => mb_substr($reason, 0, 500)]);
        $m->update(['number' => 'MB-'.str_pad((string) $m->id, 6, '0', STR_PAD_LEFT)]);
        $this->log($m, 'given', $reason, $by?->id);
        $this->entitle($m->fresh(), true, Plan::with('benefits')->find($plan->id));
        $this->notices->started($m->fresh());

        return $m->fresh();
    }

    /**
     * Refund a paid invoice: a credit note returns its lines and the membership ends today. An upgrade is refunded in the books by hand.
     */
    public function refund(Period $p, ?User $by = null, ?string $reason = null, ?int $refundLedgerId = null): Membership
    {
        if ($p->status !== 'paid' || ! $p->invoice_id || $p->kind === 'upgrade') {
            throw new BooksException('Only a paid joining or renewal invoice can be refunded here.');
        }
        $m = Membership::findOrFail($p->membership_id);
        $invoice = Voucher::with('type')->findOrFail($p->invoice_id);
        $ret = $this->vouchers->returnable($invoice);
        $take = [];
        foreach ($ret['lines'] as $row) {
            if (($row['item_type'] ?? '') === 'custom' && ($row['available_quantity'] ?? 0) >= 0.9999) {
                $take[] = ['item_id' => $row['id'], 'mode' => 'return', 'quantity' => 1];
            }
        }
        if (! $take) {
            throw new BooksException('Nothing is left on the invoice to credit: it has been credited already.');
        }
        $reason = trim((string) $reason) === '' ? 'Membership refunded' : mb_substr(trim((string) $reason), 0, 300);
        $opts = ['lines' => $take, 'reason' => $reason, 'narration' => "Membership {$m->number} refunded"];
        if ($this->vouchers->paidAtOnce($invoice)) {
            $opts['refund_ledger_id'] = $refundLedgerId ?: ($ret['refund']['default_id'] ?? null) ?: throw new BooksException('Choose where the refund is paid from.');
        }
        DB::transaction(function () use ($p, $m, $opts, $by, $reason) {
            $credit = $this->vouchers->createReturn(Voucher::findOrFail($p->invoice_id), $opts, $by);
            $p->update(['status' => 'refunded', 'credit_note_id' => $credit->id]);
            $this->voidUnpaid($m, 'refunded', $by);
            $m->update(['status' => 'cancelled', 'cancelled_at' => now(), 'cancel_reason' => $reason, 'paid_until' => $this->today(), 'cancel_at_end' => false, 'change_to_plan_id' => null]);
        });
        $this->entitle($m->fresh(), false);
        $this->log($m, 'refunded', $reason, $by?->id);
        $this->notices->ended($m->fresh(), true);

        return $m->fresh();
    }

    // ── the daily job ─────────────────────────────────────────────────────

    /**
     * Invoice renewals, move memberships through past due and lapsed, end cancelled ones, resume paused ones, let unpaid new ones go and send reminders.
     *
     * @return array{renewed: int, past_due: int, lapsed: int, ended: int, resumed: int, released: int, reminded: int}
     */
    public function sweep(?Carbon $now = null): array
    {
        $r = ['renewed' => 0, 'past_due' => 0, 'lapsed' => 0, 'ended' => 0, 'resumed' => 0, 'released' => 0, 'reminded' => 0];
        if (! self::installed()) {
            return $r;
        }
        $nowC = ($now ?? Carbon::now($this->tz()))->copy();
        $today = $this->today($nowC);
        $s = $this->settings();

        foreach (Membership::where('status', 'pending')->whereNotNull('expires_at')->where('expires_at', '<', $nowC)->get() as $m) {
            if (! $this->hasMoney($m)) {
                $this->guarded(fn () => $this->cancel($m, 'Not paid in time: the membership was released.'));
                $r['released']++;
            }
        }
        foreach (Membership::where('status', 'paused')->whereNotNull('paused_until')->where('paused_until', '<=', $today)->get() as $m) {
            $this->guarded(fn () => $this->resume($m, null, $nowC));
            $r['resumed']++;
        }
        foreach (Membership::whereIn('status', ['trial', 'active', 'past_due', 'lapsed'])->get() as $m) {
            $this->guarded(function () use ($m, $today, $s, &$r, $nowC) {
                $plan = Plan::with('benefits')->find($m->plan_id);
                if (! $plan) {
                    return;
                }
                // cancelled for the end of the paid time, or given for a time: over when the time is
                if ($m->paid_until && $today->gte($m->paid_until) && ($m->cancel_at_end || $m->billing === 'none' || ! $plan->auto_renew)) {
                    $m->update(['status' => $m->cancel_at_end ? 'cancelled' : 'ended', 'cancelled_at' => $m->cancelled_at ?? now()]);
                    $this->voidUnpaid($m, 'the membership ended');
                    $this->entitle($m->fresh(), false, $plan);
                    $this->log($m, 'ended');
                    $this->notices->ended($m->fresh());
                    $r['ended']++;

                    return;
                }
                if ($m->status === 'lapsed' || $m->billing !== 'invoice' || ! $m->paid_until) {   // a lapsed one starts again when its open invoice is paid
                    return;
                }
                // invoice the next period a few days ahead
                $open = Period::where('membership_id', $m->id)->where('status', 'open')->whereIn('kind', ['period'])->first();
                if (! $open && ! $m->cancel_at_end && $plan->auto_renew && $today->copy()->addDays((int) $s['renewal_lead_days'])->gte($m->paid_until)) {
                    $next = ($m->change_to_plan_id ? Plan::with('benefits')->find($m->change_to_plan_id) : null) ?? $plan;   // a downgrade waiting for this renewal
                    if ($next->id !== $plan->id) {
                        $this->entitle($m, false, $plan);
                        $m->update(['plan_id' => $next->id, 'change_to_plan_id' => null]);
                        $this->entitle($m->fresh(), true, $next);
                        $this->log($m, 'plan_changed', $next->name);
                        $plan = $next;
                    }
                    $from = $m->paid_until->copy();
                    $to = $this->endOf($from, $plan);
                    if ((float) $plan->price <= 0) {
                        $m->update(['period_from' => $from, 'paid_until' => $to]);
                        $this->log($m, 'renewed', 'free');
                    } else {
                        $label = $plan->name.' — '.$from->format('j M').' to '.$to->copy()->subDay()->format('j M Y');
                        try {
                            $open = $this->invoice($m->fresh(), $plan, 'period', $label, [['description' => $label, 'amount' => (float) $plan->price, 'ledger_id' => (int) $plan->ledger_id]], $from, $to, $from);
                            $this->notices->renewalInvoiced($m, $open);
                            $this->log($m, 'renewal_invoiced', $label);
                            $r['renewed']++;
                        } catch (\Throwable $e) {   // not invoiced (no customer account, the books refused): it still runs out below, it is never free for ever
                            report($e);
                        }
                    }
                    $m = $m->fresh();
                }
                // the covered time has run out: past due, then lapsed
                if ($today->gte($m->paid_until) && ($open || (float) $plan->price > 0)) {   // unpaid (or the renewal could not even be invoiced)
                    $m = $m->fresh();
                    $lapseOn = $m->paid_until->copy()->addDays((int) $plan->grace_days);
                    if ($today->gt($lapseOn) && $m->status !== 'lapsed') {
                        $m->update(['status' => 'lapsed']);
                        $this->entitle($m->fresh(), false, $plan);
                        $this->log($m, 'lapsed');
                        $this->notices->lapsed($m->fresh());
                        $r['lapsed']++;
                    } elseif ($today->lte($lapseOn) && $m->status !== 'past_due') {
                        $m->update(['status' => 'past_due']);
                        $this->log($m, 'past_due');
                        $this->notices->pastDue($m->fresh());
                        $r['past_due']++;
                    }
                } elseif ($m->status === 'trial' && $m->trial_ends_on && $today->gte($m->trial_ends_on)) {
                    $m->update(['status' => 'active']);
                }
                // reminders
                if ($open && $open->due_date) {
                    $open = $open->fresh();
                    if (! $open->reminded_before_at && $today->gte($open->due_date->copy()->subDays((int) $s['remind_before_days'])) && $today->lte($open->due_date)) {
                        $this->notices->reminder($m, $open, false);
                        $open->update(['reminded_before_at' => now()]);
                        $r['reminded']++;
                    } elseif (! $open->reminded_after_at && $today->gte($open->due_date->copy()->addDays((int) $s['remind_after_days'])) && $open->due_date->lt($today)) {
                        $this->notices->reminder($m, $open, true);
                        $open->update(['reminded_after_at' => now()]);
                        $r['reminded']++;
                    }
                }
            });
        }

        $this->guarded(fn () => $this->resync());
        $this->guarded(fn () => app(Credits::class)->expire($nowC));

        return $r;
    }

    /** Hand every running member their plan's benefits again: a course published after they joined, a benefit added to the plan. Handlers are safe to repeat. */
    public function resync(): int
    {
        if (! self::installed()) {
            return 0;
        }
        $n = 0;
        foreach (Membership::whereIn('status', Membership::GOOD)->get() as $m) {
            $this->entitle($m, true);
            $n++;
        }

        return $n;
    }

    private function guarded(callable $fn): void
    {
        try {
            $fn();
        } catch (\Throwable $e) {
            report($e);
        }
    }

    // ── showing ───────────────────────────────────────────────────────────

    /** @return array<string, mixed> */
    public function row(Membership $m, bool $staff = true, bool $detail = false): array
    {
        $plan = Plan::find($m->plan_id);
        $open = $this->openPeriod($m);
        $names = User::whereIn('id', array_filter([$m->member_user_id, $m->payer_user_id]))->pluck('name', 'id');
        $s = $this->settings();
        $good = in_array($m->status, Membership::GOOD, true);
        $out = ['id' => $m->id, 'number' => $m->number, 'plan_id' => $m->plan_id, 'plan' => $plan?->name, 'plan_slug' => $plan?->slug, 'period_label' => $plan ? $this->plans->periodLabel($plan) : null, 'member_user_id' => $m->member_user_id, 'member' => $names[$m->member_user_id] ?? null,
            'payer' => $m->payer_user_id ? ($names[$m->payer_user_id] ?? null) : null, 'status' => $m->status, 'status_label' => Membership::STATUSES[$m->status] ?? $m->status, 'billing' => $m->billing, 'channel' => $m->channel,
            'started_on' => $m->started_on?->toDateString(), 'trial_ends_on' => $m->trial_ends_on?->toDateString(), 'paid_until' => $m->paid_until?->toDateString(), 'last_day' => $m->paid_until?->copy()->subDay()->toDateString(), 'cancel_at_end' => (bool) $m->cancel_at_end,
            'paused_until' => $m->paused_until?->toDateString(), 'change_to' => $m->change_to_plan_id ? Plan::whereKey($m->change_to_plan_id)->value('name') : null, 'has_benefits' => $good,
            'open' => $open ? ['id' => $open->id, 'label' => $open->label, 'amount' => (float) $open->amount, 'owing' => $open->owing(), 'due_date' => $open->due_date?->toDateString(), 'kind' => $open->kind] : null,
            'can_pause' => in_array($m->status, ['trial', 'active'], true) && (int) $s['pause_days_per_year'] > 0, 'can_cancel' => in_array($m->status, Membership::LIVE, true) && ! $m->cancel_at_end && (bool) $s['allow_member_cancel'], 'created_at' => $m->created_at?->toIso8601String()];
        if ($detail) {
            $out['periods'] = $m->periods()->get()->map(fn (Period $p) => ['id' => $p->id, 'seq' => $p->seq, 'kind' => $p->kind, 'label' => $p->label, 'period_from' => $p->period_from?->toDateString(), 'period_to' => $p->period_to?->toDateString(), 'due_date' => $p->due_date?->toDateString(),
                'amount' => (float) $p->amount, 'paid_amount' => (float) $p->paid_amount, 'status' => $p->status, 'can_refund' => $staff && $p->status === 'paid' && $p->kind !== 'upgrade'])->values()->all();
            if (Credits::installed()) {
                $out['credits'] = app(Credits::class)->summary((int) $m->member_user_id);
            }
            if ($staff && MemberCheckIn::installed()) {
                $out['checkins'] = app(MemberCheckIn::class)->recent(null, (int) $m->member_user_id, 10);
            }
            if ($staff) {
                $out['events'] = $m->events()->limit(60)->get()->map(fn (MembershipEvent $e) => ['type' => $e->type, 'note' => $e->note, 'at' => $e->created_at?->toIso8601String()])->values()->all();
                $out['notes'] = $m->notes;
            }
        }

        return $out;
    }

    /** The plans a visitor can join, in words they understand. @return array<int, array<string, mixed>> */
    public function publicPlans(?User $u = null): array
    {
        if (! PlanService::installed()) {
            return [];
        }
        $mine = $u && self::installed() ? $this->live($u->id) : null;

        return Plan::with('benefits')->where('status', 'published')->orderBy('sort_order')->orderBy('name')->get()->map(function (Plan $p) use ($u, $mine) {
            $left = $p->capacity ? max(0, (int) $p->capacity - (self::installed() ? $this->seats($p) : 0)) : null;

            return ['id' => $p->id, 'slug' => $p->slug, 'name' => $p->name, 'summary' => $p->summary, 'description' => $p->description, 'cover' => $p->cover, 'price' => (float) $p->price, 'period_label' => $this->plans->periodLabel($p), 'joining_fee' => $u && self::installed() ? ($this->owesJoiningFee($u->id, $p) ? (float) $p->joining_fee : 0.0) : (float) $p->joining_fee,
                'trial_days' => (int) $p->trial_days, 'places_left' => $left, 'full' => $left !== null && $left < 1, 'all_branches' => (bool) $p->all_branches,
                'benefits' => $p->benefits->filter(fn ($b) => $this->benefits->has($b->type))->map(fn ($b) => $this->benefits->describe($b->type, $b->config ?? []))->values()->all(),
                'current' => $mine && (int) $mine->plan_id === (int) $p->id];
        })->values()->all();
    }

    /** Memberships a person holds or pays for, newest first. @return array<int, array<string, mixed>> */
    public function mine(User $u): array
    {
        if (! self::installed()) {
            return [];
        }

        return Membership::where(fn ($w) => $w->where('member_user_id', $u->id)->orWhere('payer_user_id', $u->id))->orderByDesc('id')->limit(20)->get()
            ->map(fn (Membership $m) => $this->row($m, false, true) + ['as_payer' => (int) $m->member_user_id !== (int) $u->id])->values()->all();
    }

    /** @return array{memberships: array<int, array<string, mixed>>, total: int} */
    public function list(array $f = []): array
    {
        $q = Membership::query()->orderByDesc('id');
        foreach (['status', 'plan_id'] as $k) {
            if (! empty($f[$k])) {
                $q->where($k, $f[$k]);
            }
        }
        if (! empty($f['q'])) {
            $like = '%'.str_replace(['%', '_'], ['\\%', '\\_'], trim((string) $f['q'])).'%';
            $q->where(fn ($w) => $w->where('number', 'like', $like)->orWhereIn('member_user_id', User::where('name', 'like', $like)->orWhere('email', 'like', $like)->pluck('id')));
        }
        $total = (clone $q)->count();
        $rows = $q->limit(200)->get();

        return ['memberships' => $rows->map(fn (Membership $m) => $this->row($m))->values()->all(), 'total' => $total];
    }
}
