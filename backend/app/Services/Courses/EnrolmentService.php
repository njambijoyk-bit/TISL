<?php

namespace App\Services\Courses;

use App\Models\Books\PaymentMethod;
use App\Models\Books\Voucher;
use App\Models\Books\VoucherType;
use App\Models\Courses\Enrolment;
use App\Models\Courses\EnrolmentLine;
use App\Models\Courses\Fee;
use App\Models\Courses\Instalment;
use App\Models\Courses\Offering;
use App\Models\Currency;
use App\Models\Location;
use App\Models\User;
use App\Services\Books\BooksException;
use App\Services\Books\GatewayPaymentService;
use App\Services\Books\VoucherService;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * Enrolling a student, through the books. An enrolment is a Sales Order and an invoice with a line for each fee (the sales account of the fee decides the tax); Courses keeps only the ids, a copy of what was
 * charged and a payment schedule. Money comes in the usual ways (M-Pesa or card through the gateways, or at the counter as a receipt) and every receipt against the invoice reaches `paid()`, which fills the
 * schedule in order and opens access when the offering's rule is met (in full, or at the deposit). An instalment more than the grace period late holds access back until it is paid.
 * Refunds are credit notes in the books. Nothing here posts a journal by itself.
 */
class EnrolmentService
{
    public function __construct(private VoucherService $vouchers, private GatewayPaymentService $gateway, private CourseAccess $access, private CourseNotices $notices)
    {
    }

    public static function installed(): bool
    {
        return CourseFees::installed();
    }

    private function tz(): string
    {
        return (string) config('app.timezone', 'Africa/Nairobi');
    }

    private function today(?Carbon $now = null): Carbon
    {
        return ($now ?? Carbon::now($this->tz()))->copy()->timezone($this->tz())->startOfDay();
    }

    private function ref(Enrolment $e): string
    {
        return 'enrolment:'.$e->id;
    }

    // ── working out what an enrolment costs ───────────────────────────────

    private function charged(int $studentId, Fee $f): bool
    {
        return EnrolmentLine::query()->join('course_enrolments as e', 'e.id', '=', 'course_enrolment_lines.enrolment_id')->where('e.student_user_id', $studentId)
            ->whereIn('e.status', ['pending', 'active', 'completed'])->where('course_enrolment_lines.once_per_student', true)->where('course_enrolment_lines.kind', $f->kind)->exists();
    }

    /**
     * The lines a student would be charged: the fees that are on, the optional ones they chose, and not a once-only fee they have paid before.
     *
     * @param int[] $optionalIds
     * @return array{lines: array<int, array<string, mixed>>, skipped: string[], subtotal: float, discount: float}
     */
    public function plan(Offering $o, User $student, array $optionalIds = [], float $discountPct = 0.0): array
    {
        $fees = Fee::where('offering_id', $o->id)->where('is_active', true)->orderBy('sort_order')->orderBy('id')->get();
        $unknown = array_diff($optionalIds, $fees->where('is_optional', true)->pluck('id')->all());
        if ($unknown) {
            throw new BooksException('One of the extras you chose is not offered.');
        }
        $lines = [];
        $skipped = [];
        foreach ($fees as $f) {
            if ($f->is_optional && ! in_array($f->id, $optionalIds, true)) {
                continue;
            }
            if ($f->once_per_student && $this->charged($student->id, $f)) {
                $skipped[] = $f->name;

                continue;
            }
            $lines[] = ['fee_id' => $f->id, 'kind' => $f->kind, 'name' => $f->name, 'ledger_id' => (int) $f->ledger_id, 'amount' => round((float) $f->amount, 2), 'once_per_student' => (bool) $f->once_per_student, 'refundable' => (bool) $f->refundable];
        }
        $sub = round(array_sum(array_column($lines, 'amount')), 2);

        return ['lines' => $lines, 'skipped' => $skipped, 'subtotal' => $sub, 'discount' => round($sub * $discountPct / 100, 2)];
    }

    /**
     * The payments the total is split into. A deposit (a share of the total) is due now and the rest follows in equal instalments; without a deposit the instalments start today. The last payment takes any cent left over.
     *
     * @return array<int, array{label: string, due: Carbon, amount: float}>
     */
    public function schedule(Offering $o, float $total, ?Carbon $now = null): array
    {
        if ($total <= 0) {
            return [];
        }
        $today = $this->today($now);
        $dep = (float) ($o->deposit_pct ?? 0);
        $n = max(0, (int) ($o->instalments ?? 0));
        $gap = max(1, (int) ($o->instalment_days ?: 30));
        $split = function (float $amount, int $k): array {
            $base = floor($amount / $k * 100) / 100;
            $parts = array_fill(0, $k, round($base, 2));
            $parts[$k - 1] = round($amount - $base * ($k - 1), 2);

            return $parts;
        };
        $rows = [];
        if ($dep > 0) {
            $first = round($total * $dep / 100, 2);
            $rest = round($total - $first, 2);
            $rows[] = ['label' => 'Deposit', 'due' => $today->copy(), 'amount' => $first];
            if ($rest > 0) {
                $k = max(1, $n);
                foreach ($split($rest, $k) as $i => $a) {
                    $rows[] = ['label' => $k === 1 ? 'Balance' : 'Instalment '.($i + 1).' of '.$k, 'due' => $today->copy()->addDays($gap * ($i + 1)), 'amount' => $a];
                }
            }

            return $rows;
        }
        if ($n > 1) {
            foreach ($split($total, $n) as $i => $a) {
                $rows[] = ['label' => 'Instalment '.($i + 1).' of '.$n, 'due' => $today->copy()->addDays($gap * $i), 'amount' => $a];
            }

            return $rows;
        }

        return [['label' => 'Payment', 'due' => $today->copy(), 'amount' => round($total, 2)]];
    }

    /** What enrolling would cost, tax included, and when it is paid: shown before anyone commits. @return array<string, mixed> */
    public function quote(Offering $o, User $student, User $payer, array $optionalIds = [], float $discountPct = 0.0): array
    {
        $plan = $this->plan($o, $student, $optionalIds, $discountPct);
        $total = 0.0;
        $sched = [];
        if ($plan['subtotal'] - $plan['discount'] > 0) {
            $stub = new Enrolment(['number' => 'quote', 'discount_pct' => $discountPct]);
            $stub->id = 0;
            $total = round((float) $this->vouchers->preview($this->payload($stub, $o, $plan, $payer->customer?->id, $payer), null)['total'], 2);
            $sched = $this->schedule($o, $total);
        }

        return ['lines' => $plan['lines'], 'skipped' => $plan['skipped'], 'subtotal' => $plan['subtotal'], 'discount' => $plan['discount'], 'total' => $total,
            'schedule' => array_map(fn ($r) => ['label' => $r['label'], 'due_date' => $r['due']->toDateString(), 'amount' => $r['amount']], $sched), 'grant_on' => $o->grant_on ?? 'paid'];
    }

    // ── enrolling ─────────────────────────────────────────────────────────

    private function payload(Enrolment $e, Offering $o, array $plan, ?int $customerId, User $payer): array
    {
        $rows = array_map(fn ($l) => ['type' => 'custom', 'description' => $o->title.' — '.$l['name'], 'quantity' => 1, 'rate' => $l['amount'], 'ledger_id' => $l['ledger_id']], $plan['lines']);
        if ($plan['discount'] > 0) {
            $rows[] = ['type' => 'charge', 'kind' => 'discount', 'description' => 'Discount '.rtrim(rtrim(number_format((float) $e->discount_pct, 2), '0'), '.').'%'.($e->discount_note ? ': '.$e->discount_note : ''), 'amount' => $plan['discount']];
        }
        $loc = $o->location_id ?: (Location::where('is_default', true)->value('id') ?: Location::orderBy('id')->value('id'));

        return ['date' => today($this->tz())->toDateString(), 'location_id' => $loc, 'currency_id' => Currency::getBaseCurrency()?->id, 'customer_id' => $customerId, 'channel' => 'storefront', 'lines' => $rows,
            'narration' => "Enrolment {$e->number}: {$o->title}", 'meta' => ['contact' => ['name' => $payer->name, 'email' => $payer->email, 'phone' => $payer->customer?->phone ?? null], 'course_enrolment_id' => $e->id]];
    }

    /**
     * Enrol a student. The invoice goes to the payer (the student unless another is named) who needs a customer account. Free: enrolled at once.
     *
     * @param array{student_user_id?: mixed, payer_user_id?: mixed, optional_fee_ids?: mixed, discount_pct?: mixed, discount_note?: mixed, notes?: mixed} $in
     */
    public function enrol(Offering $o, array $in, ?User $by = null, string $channel = 'online', ?Carbon $now = null): Enrolment
    {
        if (! self::installed()) {
            throw new BooksException('Run database script 153_courses_fees.sql first.');
        }
        if ($o->status !== 'published') {
            throw new BooksException('That is not open for enrolment.');
        }
        $student = User::find((int) ($in['student_user_id'] ?? 0)) ?? throw new BooksException('Choose the student.');
        $payer = ! empty($in['payer_user_id']) ? (User::find((int) $in['payer_user_id']) ?? throw new BooksException('Choose who pays.')) : $student;
        $held = Enrolment::where('offering_id', $o->id)->whereIn('status', ['pending', 'active', 'completed']);
        if ((clone $held)->where('student_user_id', $student->id)->exists()) {
            throw new BooksException("{$student->name} is enrolled in this already.");
        }
        if ($o->capacity && (clone $held)->count() >= (int) $o->capacity) {
            throw new BooksException('Every place is taken.');
        }
        $pct = round((float) ($in['discount_pct'] ?? 0), 2);
        $note = trim((string) ($in['discount_note'] ?? ''));
        if ($pct > 0) {
            if (! $by) {
                throw new BooksException('Only staff can give a discount.');
            }
            if ($pct > (float) CourseSettings::all()['max_discount_pct']) {
                throw new BooksException('The most that can be taken off is '.CourseSettings::all()['max_discount_pct'].' percent.');
            }
            if ($note === '') {
                throw new BooksException('Say why the discount is given.');
            }
        } elseif ($pct < 0) {
            throw new BooksException('A discount can not be negative.');
        }
        $plan = $this->plan($o, $student, array_map('intval', (array) ($in['optional_fee_ids'] ?? [])), $pct);
        $customer = $payer->customer;
        if ($plan['subtotal'] > 0 && ! $customer) {
            throw new BooksException("{$payer->name} needs a customer account to be invoiced: create it under Customers first.");
        }
        $now = ($now ?? Carbon::now($this->tz()))->copy();

        $e = DB::transaction(function () use ($o, $student, $payer, $customer, $plan, $pct, $note, $by, $channel, $in, $now) {
            $e = Enrolment::create(['number' => 'EN-'.strtoupper(bin2hex(random_bytes(5))), 'offering_id' => $o->id, 'student_user_id' => $student->id, 'payer_user_id' => $payer->id === $student->id ? null : $payer->id,
                'customer_id' => $customer?->id, 'status' => 'pending', 'channel' => $channel === 'counter' ? 'counter' : 'online', 'discount_pct' => $pct, 'discount_note' => $note === '' ? null : mb_substr($note, 0, 200),
                'created_by' => $by?->id, 'notes' => filled($in['notes'] ?? null) ? mb_substr(trim((string) $in['notes']), 0, 500) : null]);
            $e->update(['number' => 'EN-'.str_pad((string) $e->id, 6, '0', STR_PAD_LEFT)]);
            foreach ($plan['lines'] as $l) {
                EnrolmentLine::create(['enrolment_id' => $e->id] + $l);
            }
            if ($plan['subtotal'] - $plan['discount'] <= 0) {   // free
                $e->update(['total' => 0]);
                $this->open($e->fresh(), $o);

                return $e->fresh();
            }
            $payload = $this->payload($e, $o, $plan, $customer->id, $payer);
            $pre = $this->vouchers->preview($payload, null);
            $sched = $this->schedule($o, round((float) $pre['total'], 2), $now);
            $order = $this->vouchers->placeOrder($payload, null);
            $invoice = $this->vouchers->convert($order, VoucherType::SALES, ['moves_stock' => false, 'due_date' => end($sched)['due']->toDateString()], null);
            $total = round((float) $invoice->total_amount, 2);
            $sched = $this->schedule($o, $total, $now);
            foreach ($sched as $i => $row) {
                Instalment::create(['enrolment_id' => $e->id, 'seq' => $i + 1, 'label' => $row['label'], 'due_date' => $row['due']->toDateString(), 'amount' => $row['amount']]);
            }
            $hours = (int) CourseSettings::all()['pending_hours'];
            $e->update(['voucher_id' => $order->id, 'invoice_id' => $invoice->id, 'total' => $total, 'expires_at' => $hours > 0 ? $now->copy()->addHours($hours) : null]);

            return $e->fresh();
        });
        $this->notices->enrolled($e, $o, (float) ($e->instalments()->value('amount') ?? 0));

        return $e->fresh(['lines', 'instalments']);
    }

    // ── money in ──────────────────────────────────────────────────────────

    /** What to pay now: the first instalment not yet paid in full. */
    public function nextDue(Enrolment $e): float
    {
        $i = $e->instalments()->get()->first(fn (Instalment $x) => $x->owing() > 0.004);

        return $i ? $i->owing() : $e->balance();
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

    /** Start an M-Pesa or card payment for the next amount due (or a chosen amount, up to the balance). @return array{attempt: array, redirect_url: ?string, message: string} */
    public function pay(Enrolment $e, array $in, ?User $user = null): array
    {
        if (! $e->invoice_id || ! in_array($e->status, ['pending', 'active'], true)) {
            throw new BooksException('There is nothing to pay on this enrolment.');
        }
        $due = $this->nextDue($e);
        $amount = isset($in['amount']) && $in['amount'] !== '' ? round((float) $in['amount'], 2) : $due;
        if ($amount < 1 || $amount - $e->balance() > 0.009) {
            throw new BooksException('Enter an amount between 1 and '.number_format($e->balance(), 2).'.');
        }
        $method = $this->method($in);
        $payer = User::find($e->payer_user_id ?: $e->student_user_id);
        $r = $this->gateway->start(Voucher::findOrFail($e->invoice_id), $method, ['phone' => $in['phone'] ?? $payer?->customer?->phone, 'email' => $payer?->email, 'name' => $payer?->name], [], $amount, $user);
        $a = $r['attempt'];

        return ['attempt' => ['id' => $a->id, 'status' => $a->status, 'amount' => (float) $a->amount, 'gateway' => $a->gateway, 'token' => GatewayPaymentService::returnToken((int) $a->id)], 'redirect_url' => $r['redirect_url'] ?? null,
            'message' => ($r['redirect_url'] ? 'Taking you to the secure payment page' : 'Check your phone and enter your M-Pesa PIN').' to pay '.number_format($amount, 2).'.'];
    }

    /**
     * Staff take money at the counter: a Receipt against the invoice.
     *
     * @param array<int, array{payment_method_id: int, amount: float, reference?: ?string}> $tenders
     */
    public function takePayment(Enrolment $e, array $tenders, ?User $by = null): Enrolment
    {
        if (! $e->invoice_id || ! in_array($e->status, ['pending', 'active'], true)) {
            throw new BooksException('Money can be taken for an enrolment that is waiting for payment or running.');
        }
        $tenders = array_map(fn ($t) => ['payment_method_id' => (int) $t['payment_method_id'], 'amount' => round((float) ($t['amount'] ?? 0), 2), 'reference' => $t['reference'] ?? null], $tenders);
        $sum = round(array_sum(array_column($tenders, 'amount')), 2);
        if (! $tenders || $sum <= 0) {
            throw new BooksException('Enter the amount received.');
        }
        if ($sum - $e->balance() > 0.009) {
            throw new BooksException('That is more than the '.number_format($e->balance(), 2).' still to pay.');
        }
        DB::transaction(function () use ($e, $tenders, $sum, $by) {
            $this->vouchers->receive(Voucher::findOrFail($e->invoice_id), ['tenders' => $tenders, 'amount' => $sum, 'payment_method_id' => $tenders[0]['payment_method_id'], 'channel' => 'admin'], $by);
            $this->received($e, $sum);
        });

        return $e->fresh(['lines', 'instalments']);
    }

    /** A receipt reached the invoice (called by the payment service for every one). Safe to call for an invoice that is not an enrolment's. */
    public function paid(Voucher $invoice, float $amount): void
    {
        if (empty($invoice->meta['course_enrolment_id']) || ! self::installed()) {
            return;
        }
        $e = Enrolment::where('invoice_id', $invoice->id)->first();
        if ($e) {
            $this->received($e, $amount);
        }
    }

    private function received(Enrolment $e, float $amount): void
    {
        $e = DB::transaction(function () use ($e, $amount) {
            $e = Enrolment::whereKey($e->id)->lockForUpdate()->firstOrFail();
            $e->paid_total = round((float) $e->paid_total + $amount, 2);
            $e->expires_at = null;
            $e->save();
            $left = $amount;
            foreach ($e->instalments()->get() as $i) {
                if ($left <= 0.004) {
                    break;
                }
                $take = min($left, $i->owing());
                if ($take > 0) {
                    $i->update(['paid_amount' => round((float) $i->paid_amount + $take, 2)]);
                    $left = round($left - $take, 2);
                }
            }

            return $e;
        });
        $o = Offering::find($e->offering_id);
        if ($o) {
            $this->notices->paid($e, $o, $amount);
            $this->sync($e->fresh(), $o);
        }
    }

    // ── access ────────────────────────────────────────────────────────────

    /** Is the rule for opening access met: in full, or at the deposit (the first payment)? */
    private function enough(Enrolment $e, Offering $o): bool
    {
        $i = $e->instalments()->get();
        if ($i->isEmpty()) {
            return true;
        }

        return $o->grant_on === 'deposit' ? $i->first()->owing() <= 0.004 : $i->every(fn (Instalment $x) => $x->owing() <= 0.004);
    }

    private function overdue(Enrolment $e, Offering $o, ?Carbon $now = null): ?Instalment
    {
        $limit = $this->today($now)->subDays((int) ($o->grace_days ?? 7));

        return $e->instalments()->get()->first(fn (Instalment $x) => $x->owing() > 0.004 && $x->due_date->lt($limit));
    }

    /** Open access when the rule is met, hold it back for an overdue instalment, give it back when that is paid. */
    private function sync(Enrolment $e, Offering $o, ?Carbon $now = null): void
    {
        if (! in_array($e->status, ['pending', 'active'], true)) {
            return;
        }
        if ($e->status === 'pending' && $this->enough($e, $o)) {
            $this->open($e, $o);
            $e = $e->fresh();
        }
        if ($e->status !== 'active') {
            return;
        }
        $late = $this->overdue($e, $o, $now);
        if ($late && ! $e->access_paused) {
            $this->access->revoke('invoice', $this->ref($e));
            $e->update(['access_paused' => true]);
        } elseif (! $late && $e->access_paused) {
            $e->update(['access_paused' => false]);
            $this->access->grant($e->student_user_id, $e->offering_id, 'invoice', $this->ref($e), null, null, null);
        }
    }

    private function open(Enrolment $e, Offering $o): void
    {
        $this->access->grant($e->student_user_id, $e->offering_id, 'invoice', $this->ref($e), null, null, null);
        $e->update(['status' => 'active', 'activated_at' => now(), 'access_paused' => false, 'expires_at' => null]);
        $this->notices->opened($e->fresh(), $o);
    }

    // ── ending an enrolment ───────────────────────────────────────────────

    private function reason(?string $s): ?string
    {
        $s = trim((string) $s);

        return $s === '' ? null : mb_substr($s, 0, 300);
    }

    /** Cancel an enrolment nobody has paid for: the books are cancelled with it and the place is free. Money already in goes through a refund instead. */
    public function cancel(Enrolment $e, ?string $reason = null, ?User $by = null): Enrolment
    {
        if (! in_array($e->status, ['pending', 'active'], true)) {
            throw new BooksException('This enrolment can not be cancelled now.');
        }
        if ((float) $e->paid_total > 0.004) {
            throw new BooksException('Money has been paid on this: refund it, which also ends the enrolment.');
        }
        $reason = $this->reason($reason);
        DB::transaction(function () use ($e, $reason, $by) {
            foreach ([$e->invoice_id, $e->voucher_id] as $id) {
                $v = $id ? Voucher::find($id) : null;
                if ($v && $v->status !== Voucher::CANCELLED) {
                    $this->vouchers->cancel($v, "Enrolment {$e->number} cancelled".($reason ? ": {$reason}" : ''), $by);
                }
            }
            $this->access->revoke('invoice', $this->ref($e));
            $e->update(['status' => 'cancelled', 'cancelled_at' => now(), 'cancel_reason' => $reason, 'expires_at' => null]);
        });
        if ($o = Offering::find($e->offering_id)) {
            $this->notices->cancelled($e->fresh(), $o, false);
        }

        return $e->fresh(['lines', 'instalments']);
    }

    /** May this enrolment still be refunded under the offering's refund window? */
    public function refundOpen(Enrolment $e, Offering $o, ?Carbon $now = null): bool
    {
        if ($o->refund_days === null) {
            return true;
        }

        return ($now ?? Carbon::now())->lte($e->created_at->copy()->addDays((int) $o->refund_days)->endOfDay());
    }

    /**
     * Refund an enrolment: a credit note returns the refundable fee lines and the enrolment ends. A fee marked non-refundable (a registration fee) stays charged. After the offering's refund window only
     * `$force` (a decision of a person who may refund) goes ahead. The money then owed back to the payer is settled in the books like any credit note.
     */
    public function refund(Enrolment $e, ?User $by = null, bool $force = false, ?string $reason = null, ?int $refundLedgerId = null): Enrolment
    {
        if (! in_array($e->status, ['pending', 'active', 'completed'], true) || ! $e->invoice_id) {
            throw new BooksException('This enrolment can not be refunded.');
        }
        $o = Offering::find($e->offering_id);
        if ($o && ! $force && ! $this->refundOpen($e, $o)) {
            throw new BooksException('The refund window of '.$o->refund_days.' days has closed. A person who may refund can still do it as an exception.');
        }
        $lines = $e->lines()->get();
        $refundable = $lines->where('refundable', true);
        if ($refundable->isEmpty()) {
            throw new BooksException('Every fee on this enrolment is non-refundable.');
        }
        if ((float) $e->discount_pct > 0 && $refundable->count() !== $lines->count()) {
            throw new BooksException('This enrolment has a discount and a fee that is not refundable: make the credit note in the books by hand.');
        }
        $invoice = Voucher::with('type')->findOrFail($e->invoice_id);
        $ret = $this->vouchers->returnable($invoice);
        $take = [];
        $wanted = $refundable->map(fn (EnrolmentLine $l) => ($o?->title ?? '').' — '.$l->name)->values()->all();
        foreach ($ret['lines'] as $row) {
            $isDiscount = str_starts_with((string) ($row['description'] ?? ''), 'Discount ');
            if ((($row['item_type'] ?? '') === 'custom' && in_array($row['description'] ?? '', $wanted, true)) || ($isDiscount && (float) $e->discount_pct > 0)) {
                if (($row['available_quantity'] ?? 0) < 0.9999) {
                    throw new BooksException('Part of this has been credited already: finish it in the books.');
                }
                $take[] = ['item_id' => $row['id'], 'mode' => 'return', 'quantity' => 1];
            }
        }
        if (count($take) < count($wanted)) {
            throw new BooksException('The invoice no longer matches the enrolment: make the credit note in the books by hand.');
        }
        $reason = $this->reason($reason) ?? 'Course fees refunded';
        $opts = ['lines' => $take, 'reason' => $reason, 'narration' => "Enrolment {$e->number} refunded"];
        if ($this->vouchers->paidAtOnce($invoice)) {
            $opts['refund_ledger_id'] = $refundLedgerId ?: ($ret['refund']['default_id'] ?? null) ?: throw new BooksException('Choose where the refund is paid from.');
        }
        DB::transaction(function () use ($e, $opts, $by, $reason) {
            $credit = $this->vouchers->createReturn(Voucher::findOrFail($e->invoice_id), $opts, $by);
            $this->access->revoke('invoice', $this->ref($e));
            $e->update(['status' => 'refunded', 'refunded_at' => now(), 'credit_note_id' => $credit->id, 'cancel_reason' => $reason, 'access_paused' => false]);
        });
        if ($o) {
            $this->notices->cancelled($e->fresh(), $o, true);
        }

        return $e->fresh(['lines', 'instalments']);
    }

    // ── the hourly job ────────────────────────────────────────────────────

    /**
     * Let unpaid enrolments go, hold access back for late instalments, remind of payments coming due.
     *
     * @return array{released: int, held: int, reminded: int}
     */
    public function sweep(?Carbon $now = null): array
    {
        if (! self::installed()) {
            return ['released' => 0, 'held' => 0, 'reminded' => 0];
        }
        $now = ($now ?? Carbon::now($this->tz()))->copy();
        $released = $held = $reminded = 0;
        foreach (Enrolment::where('status', 'pending')->whereNotNull('expires_at')->where('expires_at', '<', $now)->where('paid_total', '<=', 0)->get() as $e) {
            try {
                $this->cancel($e, 'Not paid in time: the place was released.');
                $released++;
            } catch (\Throwable $x) {
                report($x);
            }
        }
        $released += app(BookSales::class)->sweep($now);   // unpaid book orders let go too
        $days = (int) CourseSettings::all()['reminder_days'];
        foreach (Enrolment::whereIn('status', ['pending', 'active'])->get() as $e) {
            $o = Offering::find($e->offering_id);
            if (! $o) {
                continue;
            }
            $late = $this->overdue($e, $o, $now);
            if ($late && ! $e->access_paused) {
                $this->sync($e, $o, $now);
                $held++;
                if (! $late->lapsed_told_at) {
                    $late->update(['lapsed_told_at' => now()]);
                    $this->notices->lapsed($e, $o, $late);
                }
            }
            foreach ($e->instalments()->get() as $i) {
                if ($i->owing() > 0.004 && ! $i->reminded_at && $days > 0 && $i->due_date->between($this->today($now), $this->today($now)->addDays($days))) {
                    $i->update(['reminded_at' => now()]);
                    $this->notices->reminder($e, $o, $i);
                    $reminded++;
                }
            }
        }

        return ['released' => $released, 'held' => $held, 'reminded' => $reminded];
    }

    // ── what the screens show ─────────────────────────────────────────────

    /** @return array<string, mixed> */
    public function row(Enrolment $e, bool $staff = true): array
    {
        $o = Offering::find($e->offering_id);
        $names = User::whereIn('id', array_filter([$e->student_user_id, $e->payer_user_id]))->pluck('name', 'id');
        $emails = User::whereIn('id', array_filter([$e->student_user_id, $e->payer_user_id]))->pluck('email', 'id');
        $ins = $e->instalments()->get();

        return ['id' => $e->id, 'number' => $e->number, 'status' => $e->status, 'status_label' => Enrolment::STATUSES[$e->status] ?? $e->status, 'channel' => $e->channel, 'offering_id' => $e->offering_id, 'offering' => $o?->title,
            'student_user_id' => $e->student_user_id, 'student' => $names[$e->student_user_id] ?? null, 'student_email' => $emails[$e->student_user_id] ?? null, 'payer_user_id' => $e->payer_user_id, 'payer' => $e->payer_user_id ? ($names[$e->payer_user_id] ?? null) : null,
            'total' => (float) $e->total, 'paid_total' => (float) $e->paid_total, 'balance' => $e->balance(), 'next_due' => in_array($e->status, ['pending', 'active'], true) ? $this->nextDue($e) : 0.0, 'access_paused' => $e->access_paused,
            'discount_pct' => (float) $e->discount_pct, 'discount_note' => $e->discount_note, 'expires_at' => $e->expires_at?->toIso8601String(), 'activated_at' => $e->activated_at?->toIso8601String(), 'cancel_reason' => $e->cancel_reason,
            'invoice_id' => $staff ? $e->invoice_id : null, 'credit_note_id' => $staff ? $e->credit_note_id : null, 'created_at' => $e->created_at?->toIso8601String(),
            'lines' => $e->lines()->get()->map(fn (EnrolmentLine $l) => ['name' => $l->name, 'kind' => $l->kind, 'amount' => (float) $l->amount, 'refundable' => $l->refundable])->values()->all(),
            'instalments' => $ins->map(fn (Instalment $i) => ['id' => $i->id, 'label' => $i->label, 'due_date' => $i->due_date->toDateString(), 'amount' => (float) $i->amount, 'paid_amount' => (float) $i->paid_amount, 'paid' => $i->owing() <= 0.004,
                'late' => $i->owing() > 0.004 && $i->due_date->lt($this->today())])->values()->all(),
            'can_refund' => $staff && $o && in_array($e->status, ['pending', 'active', 'completed'], true) && $e->invoice_id && $e->lines()->where('refundable', true)->exists(), 'refund_open' => $o ? $this->refundOpen($e, $o) : false];
    }
}
