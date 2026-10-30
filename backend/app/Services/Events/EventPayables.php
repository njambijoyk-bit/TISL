<?php

namespace App\Services\Events;

use App\Models\Books\Voucher;
use App\Models\Books\VoucherType;
use App\Models\Currency;
use App\Models\Events\Event;
use App\Models\Events\EventOrganiser;
use App\Models\Events\EventTicket;
use App\Models\User;
use App\Services\Books\VoucherService;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Schema;

/**
 * Ticket money for an outside organiser is collected by TISL and paid out. Each ticket sold adds the organiser's share (the price less TISL's commission) to what is owed to them; a refund
 * takes it back; a payout pays it. The movements are kept per organiser (event_organiser_ledger) and each is mirrored in Books as a journal between the event's income account and the
 * "owed to organisers" liability, so the income that stays in Books is TISL's commission alone. TISL's own events (internal organiser) owe nobody anything.
 *
 * Posting to Books never stops a ticket being issued or refunded: if it cannot be posted (no liability account chosen, a locked period) the movement is kept without a voucher and shows on the
 * payout screen as waiting to be posted.
 */
final class EventPayables
{
    public function __construct(private VoucherService $vouchers, private EventOrganiserService $organisers, private EventEditor $editor)
    {
    }

    public static function ready(): bool
    {
        return Schema::hasTable('event_organiser_ledger') && Schema::hasTable('event_organisers');
    }

    private function outside(Event $event): ?EventOrganiser
    {
        $o = $event->organiser_id ? EventOrganiser::find($event->organiser_id) : null;

        return $o && ! $o->is_internal ? $o : null;
    }

    // ── tickets sold and refunded ────────────────────────────────────────

    /** @param iterable<EventTicket> $tickets tickets that have just become valid */
    public function accrue(iterable $tickets): void
    {
        if (! self::ready()) {
            return;
        }
        $byEvent = collect($tickets)->filter(fn ($t) => (float) $t->price > 0)->groupBy('event_id');
        foreach ($byEvent as $eventId => $group) {
            $event = Event::withTrashed()->find($eventId);
            $org = $event ? $this->outside($event) : null;
            if (! $org) {
                continue;
            }
            $rate = $this->organisers->commissionFor($org);
            $rows = [];
            foreach ($group as $t) {
                if (DB::table('event_organiser_ledger')->where(['ticket_id' => $t->id, 'kind' => 'sale'])->exists()) {
                    continue;
                }
                $gross = round((float) $t->price, 2);
                $commission = round($gross * $rate / 100, 2);
                $rows[] = DB::table('event_organiser_ledger')->insertGetId(['organiser_id' => $org->id, 'event_id' => $event->id, 'ticket_id' => $t->id, 'kind' => 'sale', 'gross' => $gross, 'commission_percent' => $rate,
                    'commission' => $commission, 'amount' => round($gross - $commission, 2), 'note' => "Ticket {$t->reference}", 'created_at' => now(), 'updated_at' => now()]);
            }
            $this->post($rows, $event, "{$event->title}: tickets sold, owed to {$org->name}");
        }
    }

    /** A ticket was refunded: what was owed to the organiser for it is taken back. */
    public function reverse(EventTicket $t): void
    {
        if (! self::ready()) {
            return;
        }
        $sale = DB::table('event_organiser_ledger')->where(['ticket_id' => $t->id, 'kind' => 'sale'])->first();
        if (! $sale || DB::table('event_organiser_ledger')->where(['ticket_id' => $t->id, 'kind' => 'refund'])->exists()) {
            return;
        }
        $id = DB::table('event_organiser_ledger')->insertGetId(['organiser_id' => $sale->organiser_id, 'event_id' => $sale->event_id, 'ticket_id' => $t->id, 'kind' => 'refund', 'gross' => $sale->gross,
            'commission_percent' => $sale->commission_percent, 'commission' => $sale->commission, 'amount' => -$sale->amount, 'note' => "Ticket {$t->reference} refunded", 'created_at' => now(), 'updated_at' => now()]);
        $event = Event::withTrashed()->find($sale->event_id);
        if ($event) {
            $this->post([$id], $event, "{$event->title}: ticket refunded, taken back from {$this->organisers_name($sale->organiser_id)}");
        }
    }

    private function organisers_name(int $id): string
    {
        return (string) EventOrganiser::whereKey($id)->value('name');
    }

    /** One journal for these movements: a sale is Dr income / Cr owed; a refund is the other way round. Quietly leaves them unposted when it cannot. */
    private function post(array $ids, Event $event, string $narration): void
    {
        $rows = DB::table('event_organiser_ledger')->whereIn('id', $ids)->whereNull('voucher_id')->get();
        $net = round((float) $rows->sum('amount'), 2);
        if ($rows->isEmpty() || $net == 0.0) {
            return;
        }
        try {
            $owed = EventSettings::all()['organiser_payable_ledger_id'] ?? null;
            $income = $this->editor->salesLedgerId($event);
            $journal = VoucherType::byBase(VoucherType::JOURNAL);
            if (! $owed || ! $income || ! $journal) {
                return;   // shown as waiting to be posted
            }
            [$dr, $cr] = $net > 0 ? [(int) $income, (int) $owed] : [(int) $owed, (int) $income];
            $v = $this->vouchers->create(['voucher_type_id' => $journal->id, 'date' => today()->toDateString(), 'location_id' => $event->location_id, 'currency_id' => $event->currency_id ?: Currency::getBaseCurrency()?->id,
                'narration' => $narration, 'meta' => ['event_payable' => ['event_id' => $event->id]], 'entries' => [['ledger_id' => $dr, 'side' => 'D', 'amount' => abs($net)], ['ledger_id' => $cr, 'side' => 'C', 'amount' => abs($net)]]]);
            DB::table('event_organiser_ledger')->whereIn('id', $rows->pluck('id'))->update(['voucher_id' => $v->id, 'updated_at' => now()]);
        } catch (\Throwable $e) {
            Log::warning('Events: could not post what is owed to an organiser', ['event' => $event->id, 'error' => $e->getMessage()]);
        }
    }

    /** Post every movement that is still waiting (after the liability account has been chosen). Returns how many were posted. */
    public function postWaiting(): int
    {
        $n = 0;
        $groups = DB::table('event_organiser_ledger')->whereNull('voucher_id')->whereIn('kind', ['sale', 'refund'])->whereNotNull('event_id')->get()->groupBy('event_id');
        foreach ($groups as $eventId => $rows) {
            $event = Event::withTrashed()->find($eventId);
            if (! $event) {
                continue;
            }
            foreach (['sale', 'refund'] as $kind) {
                $ids = $rows->where('kind', $kind)->pluck('id')->all();
                if ($ids) {
                    $this->post($ids, $event, "{$event->title}: " . ($kind === 'sale' ? 'tickets sold' : 'tickets refunded') . ' (posted later)');
                    $n += DB::table('event_organiser_ledger')->whereIn('id', $ids)->whereNotNull('voucher_id')->count();
                }
            }
        }

        return $n;
    }

    // ── what is owed, and paying it out ──────────────────────────────────

    /** @return array<int, array<string, mixed>> one row per outside organiser with a balance or any history */
    public function balances(): array
    {
        if (! self::ready()) {
            return [];
        }
        $rows = DB::table('event_organiser_ledger')->selectRaw("organiser_id, SUM(CASE WHEN kind IN ('sale','refund') THEN gross * (CASE WHEN kind='sale' THEN 1 ELSE -1 END) ELSE 0 END) AS gross,
            SUM(CASE WHEN kind IN ('sale','refund') THEN commission * (CASE WHEN kind='sale' THEN 1 ELSE -1 END) ELSE 0 END) AS commission, SUM(CASE WHEN kind='payout' THEN -amount ELSE 0 END) AS paid,
            SUM(amount) AS balance, SUM(CASE WHEN voucher_id IS NULL THEN 1 ELSE 0 END) AS unposted")->groupBy('organiser_id')->get();
        $orgs = EventOrganiser::whereIn('id', $rows->pluck('organiser_id'))->get()->keyBy('id');

        return $rows->map(fn ($r) => ['organiser_id' => (int) $r->organiser_id, 'organiser' => $orgs[$r->organiser_id]?->name, 'status' => $orgs[$r->organiser_id]?->status, 'gross' => round((float) $r->gross, 2), 'commission' => round((float) $r->commission, 2),
            'paid' => round((float) $r->paid, 2), 'balance' => round((float) $r->balance, 2), 'unposted' => (int) $r->unposted])->sortByDesc('balance')->values()->all();
    }

    public function balanceOf(int $organiserId): float
    {
        return round((float) DB::table('event_organiser_ledger')->where('organiser_id', $organiserId)->sum('amount'), 2);
    }

    /** @return array<int, array<string, mixed>> */
    public function statement(int $organiserId): array
    {
        $run = 0.0;

        return DB::table('event_organiser_ledger as l')->leftJoin('events as e', 'e.id', '=', 'l.event_id')->where('l.organiser_id', $organiserId)->orderBy('l.id')
            ->get(['l.*', 'e.title as event'])->map(function ($r) use (&$run) {
                $run = round($run + (float) $r->amount, 2);

                return ['id' => (int) $r->id, 'date' => (string) $r->created_at, 'kind' => $r->kind, 'event' => $r->event, 'note' => $r->note, 'reference' => $r->reference, 'gross' => (float) $r->gross, 'commission' => (float) $r->commission,
                    'amount' => (float) $r->amount, 'balance' => $run, 'voucher_id' => $r->voucher_id ? (int) $r->voucher_id : null];
            })->reverse()->values()->all();
    }

    /** Pay an organiser some of what they are owed: Dr owed to organisers / Cr the bank or till the money leaves from. */
    public function payout(EventOrganiser $o, float $amount, int $fromLedgerId, ?string $reference, ?string $note, ?User $by): array
    {
        $amount = round($amount, 2);
        if ($amount <= 0) {
            throw new EventException('Enter an amount to pay.');
        }
        if ($amount > $this->balanceOf($o->id) + 0.001) {
            throw new EventException('That is more than is owed to ' . $o->name . '.');
        }
        $owed = EventSettings::all()['organiser_payable_ledger_id'] ?? null;
        $journal = VoucherType::byBase(VoucherType::JOURNAL);
        if (! $owed) {
            throw new EventException('Choose the "owed to organisers" account in Events → Configuration first.');
        }
        if (! $journal) {
            throw new EventException('The Journal voucher type is switched off.');
        }

        return DB::transaction(function () use ($o, $amount, $fromLedgerId, $reference, $note, $by, $owed, $journal) {
            $v = $this->vouchers->create(['voucher_type_id' => $journal->id, 'date' => today()->toDateString(), 'currency_id' => Currency::getBaseCurrency()?->id, 'reference_no' => $reference,
                'narration' => "Payout to {$o->name} for ticket sales" . ($note ? ": {$note}" : ''), 'meta' => ['event_payout' => ['organiser_id' => $o->id]],
                'entries' => [['ledger_id' => (int) $owed, 'side' => 'D', 'amount' => $amount], ['ledger_id' => $fromLedgerId, 'side' => 'C', 'amount' => $amount]]], $by);
            $id = DB::table('event_organiser_ledger')->insertGetId(['organiser_id' => $o->id, 'kind' => 'payout', 'amount' => -$amount, 'voucher_id' => $v->id, 'reference' => $reference, 'note' => $note,
                'created_by' => $by?->id, 'created_at' => now(), 'updated_at' => now()]);

            return ['id' => $id, 'voucher_id' => (int) $v->id, 'voucher' => $v->voucher_number, 'balance' => $this->balanceOf($o->id)];
        });
    }
}
