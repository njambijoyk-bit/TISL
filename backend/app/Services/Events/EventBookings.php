<?php

namespace App\Services\Events;

use App\Models\Books\VoucherType;
use App\Models\Currency;
use App\Models\Events\Event;
use App\Models\Notification;
use App\Models\User;
use App\Services\Books\VoucherService;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

/**
 * Booking a vendor or a venue for an event. The planner asks, the provider quotes, the planner accepts, and the deposit and balance are paid to TISL, which holds them for the provider (a liability in
 * Books), keeps its commission when the job is done, and pays the rest out. Planners review only what they actually booked.
 *
 * enquiry -> quoted -> accepted -> confirmed (deposit in) -> delivered -> completed          (declined / cancelled at any step before delivery)
 */
final class EventBookings
{
    public const STATUSES = ['enquiry', 'quoted', 'accepted', 'confirmed', 'delivered', 'completed', 'declined', 'cancelled'];

    public function __construct(private EventMarketplace $market, private VoucherService $vouchers)
    {
    }

    public static function ready(): bool
    {
        return Schema::hasTable('event_bookings') && Schema::hasTable('event_provider_ledger');
    }

    private function row(int $id): object
    {
        return DB::table('event_bookings')->where('id', $id)->first() ?? abort(404);
    }

    // ── asking ───────────────────────────────────────────────────────────

    public function request(User $by, Event $e, string $type, int $providerId, array $in): array
    {
        $p = $this->market->find($type, $providerId);
        if ($p->status !== 'verified' || ! $p->is_listed) {
            throw new EventException('That ' . $type . ' is not taking bookings.');
        }
        $start = $in['starts_on'] ?? null;
        $end = ($in['ends_on'] ?? null) ?: $start;
        if (! $start || $start < today()->toDateString()) {
            throw new EventException('Choose a date that has not passed.');
        }
        if ($end < $start) {
            throw new EventException('It ends before it starts.');
        }
        $offer = null;
        if (! empty($in['offer_id'])) {
            [$table, $col] = ['vendor' => ['event_vendor_packages', 'vendor_id'], 'venue' => ['event_venue_spaces', 'venue_id']][$type];
            $offer = DB::table($table)->where(['id' => $in['offer_id'], $col => $providerId, 'is_active' => 1])->first() ?? throw new EventException('That ' . ($type === 'vendor' ? 'package' : 'space') . ' is not on offer.');
        }
        $this->assertFree($type, $providerId, $offer?->id, $start, $end);
        $id = DB::table('event_bookings')->insertGetId(['reference' => 'EB' . strtoupper(Str::random(7)), 'event_id' => $e->id, 'provider_type' => $type, 'provider_id' => $providerId, 'offer_id' => $offer?->id, 'requested_by' => $by->id,
            'starts_on' => $start, 'ends_on' => $end, 'guests' => $in['guests'] ?? null, 'message' => $in['message'] ?? null, 'status' => 'enquiry', 'created_at' => now(), 'updated_at' => now()]);
        $this->tellProvider($type, $providerId, 'New booking enquiry', "{$by->name} asks about {$e->title} on {$start}.");

        return $this->shape($this->row($id));
    }

    /** The days are free: not blocked by the provider, and (for a space) not already taken by a confirmed booking. */
    public function assertFree(string $type, int $providerId, ?int $offerId, string $start, string $end, ?int $exceptBooking = null): void
    {
        if (DB::table('event_blocked_dates')->where(['provider_type' => $type, 'provider_id' => $providerId])->whereBetween('day_on', [$start, $end])->exists()) {
            throw new EventException('The ' . $type . ' is not available on some of those days.');
        }
        if ($type === 'venue') {
            $clash = DB::table('event_bookings')->where(['provider_type' => 'venue', 'provider_id' => $providerId])->whereIn('status', ['accepted', 'confirmed', 'delivered'])
                ->when($offerId, fn ($q) => $q->where(fn ($w) => $w->where('offer_id', $offerId)->orWhereNull('offer_id')))->when($exceptBooking, fn ($q) => $q->where('id', '!=', $exceptBooking))
                ->where('starts_on', '<=', $end)->whereRaw('COALESCE(ends_on, starts_on) >= ?', [$start])->exists();
            if ($clash) {
                throw new EventException('That space is already booked for some of those days.');
            }
        }
    }

    private function tellProvider(string $type, int $providerId, string $title, string $body): void
    {
        try {
            $ids = DB::table('event_provider_members')->where(['provider_type' => $type, 'provider_id' => $providerId])->whereIn('role', ['owner', 'manager'])->pluck('user_id');
            foreach (User::whereIn('id', $ids)->get() as $u) {
                Notification::createFor($u, 'event_booking', $title, $body, "/organise/{$type}s/{$providerId}", 'Open', [], ['database'], 'normal');
            }
        } catch (\Throwable $e) {
            report($e);
        }
    }

    private function tellPlanner(object $b, string $title, string $body): void
    {
        try {
            if ($b->requested_by && ($u = User::find($b->requested_by))) {
                Notification::createFor($u, 'event_booking', $title, $body, "/admin/events/{$b->event_id}/plan", 'Open', [], ['database'], 'normal');
            }
        } catch (\Throwable $e) {
            report($e);
        }
    }

    // ── shapes ───────────────────────────────────────────────────────────

    public function paid(int $bookingId): float
    {
        return round((float) DB::table('event_provider_ledger')->where('booking_id', $bookingId)->where('kind', 'payment')->sum('amount') - (float) DB::table('event_provider_ledger')->where('booking_id', $bookingId)->where('kind', 'refund')->sum(DB::raw('-amount')), 2);
    }

    public function shape(object $b): array
    {
        $p = $this->market->find($b->provider_type, $b->provider_id);
        $e = Event::withTrashed()->find($b->event_id);
        $offer = $b->offer_id ? DB::table($b->provider_type === 'vendor' ? 'event_vendor_packages' : 'event_venue_spaces')->where('id', $b->offer_id)->value('name') : null;
        $total = $b->quoted_amount !== null ? (float) $b->quoted_amount : null;
        $deposit = $total !== null && $b->deposit_percent !== null ? round($total * (float) $b->deposit_percent / 100, 2) : null;
        $paid = $this->paid((int) $b->id);

        return ['id' => (int) $b->id, 'reference' => $b->reference, 'event_id' => (int) $b->event_id, 'event' => $e?->title, 'provider_type' => $b->provider_type, 'provider_id' => (int) $b->provider_id, 'provider' => $p->name,
            'offer_id' => $b->offer_id ? (int) $b->offer_id : null, 'offer' => $offer, 'starts_on' => $b->starts_on, 'ends_on' => $b->ends_on, 'guests' => $b->guests, 'message' => $b->message, 'status' => $b->status,
            'quoted_amount' => $total, 'deposit_percent' => $b->deposit_percent !== null ? (float) $b->deposit_percent : null, 'deposit_amount' => $deposit, 'commission_percent' => $b->commission_percent !== null ? (float) $b->commission_percent : null,
            'paid' => $paid, 'balance_due' => $total !== null ? round(max(0, $total - $paid), 2) : null, 'provider_note' => $b->provider_note, 'cancel_reason' => $b->cancel_reason,
            'review' => DB::table('event_reviews')->where('booking_id', $b->id)->first(['rating', 'comment']), 'created_at' => (string) $b->created_at];
    }

    public function forEvent(Event $e): array
    {
        return DB::table('event_bookings')->where('event_id', $e->id)->orderByDesc('id')->get()->map(fn ($b) => $this->shape($b))->all();
    }

    public function forProvider(string $type, int $id, ?string $status = null): array
    {
        return DB::table('event_bookings')->where(['provider_type' => $type, 'provider_id' => $id])->when($status, fn ($q, $s) => $q->where('status', $s))->orderByDesc('id')->get()->map(fn ($b) => $this->shape($b))->all();
    }

    public function adminList(?string $status): array
    {
        return DB::table('event_bookings')->when($status, fn ($q, $s) => $q->where('status', $s))->orderByDesc('id')->limit(300)->get()->map(fn ($b) => $this->shape($b))->all();
    }

    public function find(int $id): object
    {
        return $this->row($id);
    }

    // ── the steps ────────────────────────────────────────────────────────

    private function must(object $b, array $from, string $what): void
    {
        if (! in_array($b->status, $from, true)) {
            throw new EventException("A booking that is {$b->status} cannot be {$what}.");
        }
    }

    /** The provider names the price. */
    public function quote(int $id, float $amount, ?float $depositPercent, ?string $note): array
    {
        $b = $this->row($id);
        $this->must($b, ['enquiry', 'quoted'], 'quoted');
        if ($amount <= 0) {
            throw new EventException('Enter the price.');
        }
        if ($depositPercent !== null && ($depositPercent < 0 || $depositPercent > 100)) {
            throw new EventException('A deposit is between 0 and 100 percent.');
        }
        $p = $this->market->find($b->provider_type, $b->provider_id);
        DB::table('event_bookings')->where('id', $id)->update(['quoted_amount' => round($amount, 2), 'deposit_percent' => $depositPercent ?? 30, 'commission_percent' => $this->market->commissionFor($p), 'provider_note' => $note,
            'status' => 'quoted', 'updated_at' => now()]);
        $b = $this->row($id);
        $this->tellPlanner($b, 'You have a quote', "{$p->name} quoted " . number_format($amount) . " for {$b->reference}.");
        $this->syncBudget($b);

        return $this->shape($b);
    }

    /** The planner says yes. For a space, the days are held from now. */
    public function accept(int $id): array
    {
        $b = $this->row($id);
        $this->must($b, ['quoted'], 'accepted');
        $this->assertFree($b->provider_type, $b->provider_id, $b->offer_id, $b->starts_on, $b->ends_on ?: $b->starts_on, $id);
        DB::table('event_bookings')->where('id', $id)->update(['status' => 'accepted', 'updated_at' => now()]);
        $b = $this->row($id);
        $this->tellProvider($b->provider_type, $b->provider_id, 'Quote accepted', "{$b->reference} was accepted. It is confirmed when the deposit is paid.");
        $this->syncBudget($b);

        return $this->shape($b);
    }

    public function decline(int $id, ?string $note): array
    {
        $b = $this->row($id);
        $this->must($b, ['enquiry', 'quoted'], 'declined');
        DB::table('event_bookings')->where('id', $id)->update(['status' => 'declined', 'provider_note' => $note ?: $b->provider_note, 'updated_at' => now()]);
        $this->tellPlanner($this->row($id), 'Booking declined', "{$b->reference} was declined.");

        return $this->shape($this->row($id));
    }

    public function cancel(int $id, ?string $reason): array
    {
        $b = $this->row($id);
        $this->must($b, ['enquiry', 'quoted', 'accepted', 'confirmed'], 'cancelled');
        DB::table('event_bookings')->where('id', $id)->update(['status' => 'cancelled', 'cancel_reason' => $reason, 'updated_at' => now()]);
        $this->syncBudget($this->row($id));
        $this->tellProvider($b->provider_type, $b->provider_id, 'Booking cancelled', "{$b->reference} was cancelled." . ($this->paid($id) > 0 ? ' TISL will deal with money already paid.' : ''));

        return $this->shape($this->row($id));
    }

    public function deliver(int $id): array
    {
        $b = $this->row($id);
        $this->must($b, ['confirmed'], 'marked delivered');
        DB::table('event_bookings')->where('id', $id)->update(['status' => 'delivered', 'updated_at' => now()]);
        $this->tellPlanner($this->row($id), 'Service delivered', "{$b->reference} was marked delivered. Please confirm it and pay any balance.");

        return $this->shape($this->row($id));
    }

    /** The planner (or staff) confirms the job is done: TISL's commission is taken from what it holds for the provider. */
    public function complete(int $id, ?User $by): array
    {
        $b = $this->row($id);
        $this->must($b, ['delivered', 'confirmed'], 'completed');
        $total = (float) $b->quoted_amount;
        $due = round(max(0, $total - $this->paid($id)), 2);
        if ($due > 0.009) {
            throw new EventException('The balance of ' . number_format($due, 2) . ' has not been paid yet.');
        }
        $commission = round($total * (float) $b->commission_percent / 100, 2);
        DB::transaction(function () use ($b, $id, $commission, $by) {
            if ($commission > 0) {
                $voucher = $this->journal(EventSettings::all()['provider_payable_ledger_id'] ?? null, EventSettings::all()['commission_income_ledger_id'] ?? null, $commission, "Commission on {$b->reference}", $by, 'Choose the "owed to vendors and venues" and "commission income" accounts in Events → Configuration.');
                DB::table('event_provider_ledger')->insert(['provider_type' => $b->provider_type, 'provider_id' => $b->provider_id, 'booking_id' => $id, 'kind' => 'commission', 'amount' => -$commission, 'voucher_id' => $voucher,
                    'note' => "{$b->commission_percent}% of {$b->reference}", 'created_by' => $by?->id, 'created_at' => now(), 'updated_at' => now()]);
            }
            DB::table('event_bookings')->where('id', $id)->update(['status' => 'completed', 'updated_at' => now()]);
        });
        $this->tellProvider($b->provider_type, $b->provider_id, 'Job completed', "{$b->reference} is complete; your payout is ready.");

        return $this->shape($this->row($id));
    }

    // ── money ────────────────────────────────────────────────────────────

    /** Dr $dr / Cr $cr for $amount; returns the voucher id. */
    private function journal(?int $dr, ?int $cr, float $amount, string $narration, ?User $by, string $help): int
    {
        $type = VoucherType::byBase(VoucherType::JOURNAL);
        if (! $dr || ! $cr || ! $type) {
            throw new EventException($type ? $help : 'The Journal voucher type is switched off in Books.');
        }

        return (int) $this->vouchers->create(['voucher_type_id' => $type->id, 'date' => today()->toDateString(), 'currency_id' => Currency::getBaseCurrency()?->id, 'narration' => $narration,
            'entries' => [['ledger_id' => $dr, 'side' => 'D', 'amount' => $amount], ['ledger_id' => $cr, 'side' => 'C', 'amount' => $amount]]], $by)->id;
    }

    /** Money from the planner reached TISL (bank, till or M-Pesa): TISL holds it for the provider. The booking is confirmed once the deposit is in. */
    public function recordPayment(int $id, float $amount, int $receivedLedgerId, ?string $reference, ?User $by): array
    {
        $b = $this->row($id);
        $this->must($b, ['accepted', 'confirmed', 'delivered'], 'paid for');
        $amount = round($amount, 2);
        $outstanding = round((float) $b->quoted_amount - $this->paid($id), 2);
        if ($amount <= 0 || $amount > $outstanding + 0.001) {
            throw new EventException('Enter an amount up to the ' . number_format($outstanding, 2) . ' still due.');
        }
        DB::transaction(function () use ($b, $id, $amount, $receivedLedgerId, $reference, $by) {
            $v = $this->journal($receivedLedgerId, EventSettings::all()['provider_payable_ledger_id'] ?? null, $amount, "Payment held for {$b->reference}" . ($reference ? " ({$reference})" : ''), $by, 'Choose the "owed to vendors and venues" account in Events → Configuration.');
            DB::table('event_provider_ledger')->insert(['provider_type' => $b->provider_type, 'provider_id' => $b->provider_id, 'booking_id' => $id, 'kind' => 'payment', 'amount' => $amount, 'voucher_id' => $v, 'reference' => $reference,
                'created_by' => $by?->id, 'created_at' => now(), 'updated_at' => now()]);
            $deposit = round((float) $b->quoted_amount * (float) $b->deposit_percent / 100, 2);
            if ($b->status === 'accepted' && $this->paid($id) + 0.001 >= $deposit) {
                DB::table('event_bookings')->where('id', $id)->update(['status' => 'confirmed', 'updated_at' => now()]);
            }
        });
        $nb = $this->row($id);
        $this->syncBudget($nb);
        if ($nb->status === 'confirmed') {
            $this->tellProvider($b->provider_type, $b->provider_id, 'Booking confirmed', "{$b->reference} is confirmed: the deposit is paid.");
        }

        return $this->shape($nb);
    }

    /** Give planner money back (a cancelled booking): the reverse of a payment. */
    public function refund(int $id, float $amount, int $paidFromLedgerId, ?string $reference, ?User $by): array
    {
        $b = $this->row($id);
        $amount = round($amount, 2);
        if ($amount <= 0 || $amount > $this->paid($id) + 0.001) {
            throw new EventException('That is more than was paid.');
        }
        DB::transaction(function () use ($b, $id, $amount, $paidFromLedgerId, $reference, $by) {
            $v = $this->journal(EventSettings::all()['provider_payable_ledger_id'] ?? null, $paidFromLedgerId, $amount, "Refund on {$b->reference}", $by, 'Choose the "owed to vendors and venues" account in Events → Configuration.');
            DB::table('event_provider_ledger')->insert(['provider_type' => $b->provider_type, 'provider_id' => $b->provider_id, 'booking_id' => $id, 'kind' => 'refund', 'amount' => -$amount, 'voucher_id' => $v, 'reference' => $reference,
                'created_by' => $by?->id, 'created_at' => now(), 'updated_at' => now()]);
        });

        return $this->shape($this->row($id));
    }

    public function owed(string $type, int $id): float
    {
        return round((float) DB::table('event_provider_ledger')->where(['provider_type' => $type, 'provider_id' => $id])->sum('amount'), 2);
    }

    /** Who is owed what: only money from completed jobs can be paid out (what is held for jobs not done yet is not theirs yet). */
    public function balances(): array
    {
        $rows = DB::table('event_provider_ledger')->selectRaw('provider_type, provider_id, SUM(amount) AS held')->groupBy('provider_type', 'provider_id')->get();

        return $rows->map(function ($r) {
            $p = $this->market->find($r->provider_type, $r->provider_id);
            $open = DB::table('event_provider_ledger as l')->join('event_bookings as b', 'b.id', '=', 'l.booking_id')->where(['l.provider_type' => $r->provider_type, 'l.provider_id' => $r->provider_id])
                ->whereNotIn('b.status', ['completed', 'cancelled', 'declined'])->sum('l.amount');

            return ['provider_type' => $r->provider_type, 'provider_id' => (int) $r->provider_id, 'provider' => $p->name, 'held' => round((float) $r->held, 2), 'not_yet_due' => round((float) $open, 2), 'payable' => round(max(0, (float) $r->held - (float) $open), 2)];
        })->sortByDesc('payable')->values()->all();
    }

    public function payout(string $type, int $id, float $amount, int $fromLedgerId, ?string $reference, ?User $by): array
    {
        $row = collect($this->balances())->first(fn ($r) => $r['provider_type'] === $type && $r['provider_id'] === $id);
        $amount = round($amount, 2);
        if (! $row || $amount <= 0 || $amount > $row['payable'] + 0.001) {
            throw new EventException('That is more than can be paid out now (' . number_format($row['payable'] ?? 0, 2) . ').');
        }
        $p = $this->market->find($type, $id);

        return DB::transaction(function () use ($type, $id, $amount, $fromLedgerId, $reference, $by, $p) {
            $v = $this->journal(EventSettings::all()['provider_payable_ledger_id'] ?? null, $fromLedgerId, $amount, "Payout to {$p->name}", $by, 'Choose the "owed to vendors and venues" account in Events → Configuration.');
            DB::table('event_provider_ledger')->insert(['provider_type' => $type, 'provider_id' => $id, 'kind' => 'payout', 'amount' => -$amount, 'voucher_id' => $v, 'reference' => $reference, 'created_by' => $by?->id, 'created_at' => now(), 'updated_at' => now()]);

            return ['voucher_id' => $v, 'owed' => $this->owed($type, $id)];
        });
    }

    /** Keep the planner's budget line for this booking in step with it: committed when accepted, actual as it is paid. */
    private function syncBudget(object $b): void
    {
        if (! Schema::hasTable('event_budget_lines') || $b->quoted_amount === null) {
            return;
        }
        $p = $this->market->find($b->provider_type, $b->provider_id);
        $dead = in_array($b->status, ['declined', 'cancelled'], true);
        $vals = ['category' => $b->provider_type === 'venue' ? 'Venue' : 'Vendors', 'item' => ($b->provider_type === 'venue' ? 'Venue: ' : 'Vendor: ') . $p->name, 'supplier' => $p->name, 'estimated' => (float) $b->quoted_amount,
            'committed' => $dead || in_array($b->status, ['enquiry', 'quoted'], true) ? 0 : (float) $b->quoted_amount, 'actual' => $this->paid((int) $b->id), 'updated_at' => now()];
        $line = DB::table('event_budget_lines')->where('booking_id', $b->id)->first();
        $line ? DB::table('event_budget_lines')->where('id', $line->id)->update($vals) : DB::table('event_budget_lines')->insert($vals + ['event_id' => $b->event_id, 'booking_id' => $b->id, 'created_at' => now()]);
    }

    // ── reviews ──────────────────────────────────────────────────────────

    public function review(int $bookingId, User $by, int $rating, ?string $comment): array
    {
        $b = $this->row($bookingId);
        if ($b->requested_by != $by->id) {
            abort(403, 'Only the person who booked can review.');
        }
        $this->must($b, ['completed'], 'reviewed');
        if ($rating < 1 || $rating > 5) {
            throw ValidationException::withMessages(['rating' => 'Give 1 to 5 stars.']);
        }
        if (DB::table('event_reviews')->where('booking_id', $bookingId)->exists()) {
            throw new EventException('You already reviewed this booking.');
        }
        DB::table('event_reviews')->insert(['booking_id' => $bookingId, 'provider_type' => $b->provider_type, 'provider_id' => $b->provider_id, 'user_id' => $by->id, 'rating' => $rating, 'comment' => $comment ? mb_substr($comment, 0, 1000) : null, 'created_at' => now(), 'updated_at' => now()]);

        return $this->shape($this->row($bookingId));
    }

    public function reviews(string $type, int $id): array
    {
        if (! Schema::hasTable('event_reviews')) {
            return ['average' => null, 'count' => 0, 'items' => []];
        }
        $q = DB::table('event_reviews')->where(['provider_type' => $type, 'provider_id' => $id]);
        $items = (clone $q)->orderByDesc('id')->limit(20)->get();
        $names = User::whereIn('id', $items->pluck('user_id'))->pluck('name', 'id');

        return ['average' => $q->count() ? round((float) (clone $q)->avg('rating'), 1) : null, 'count' => (clone $q)->count(),
            'items' => $items->map(fn ($r) => ['rating' => (int) $r->rating, 'comment' => $r->comment, 'by' => Str::before((string) ($names[$r->user_id] ?? 'A planner'), ' '), 'at' => (string) $r->created_at])->all()];
    }

    // ── availability ─────────────────────────────────────────────────────

    public function availability(string $type, int $id, string $from, string $to): array
    {
        return ['blocked' => DB::table('event_blocked_dates')->where(['provider_type' => $type, 'provider_id' => $id])->whereBetween('day_on', [$from, $to])->pluck('day_on')->all(),
            'booked' => $type === 'venue' ? DB::table('event_bookings')->where(['provider_type' => 'venue', 'provider_id' => $id])->whereIn('status', ['accepted', 'confirmed', 'delivered'])->where('starts_on', '<=', $to)
                ->whereRaw('COALESCE(ends_on, starts_on) >= ?', [$from])->get(['starts_on', 'ends_on'])->all() : []];
    }

    public function block(string $type, int $id, array $days, bool $on): void
    {
        foreach ($days as $d) {
            if (! preg_match('/^\d{4}-\d{2}-\d{2}$/', (string) $d)) {
                continue;
            }
            $on ? DB::table('event_blocked_dates')->updateOrInsert(['provider_type' => $type, 'provider_id' => $id, 'day_on' => $d], []) : DB::table('event_blocked_dates')->where(['provider_type' => $type, 'provider_id' => $id, 'day_on' => $d])->delete();
        }
    }
}
