<?php

namespace App\Services\Menus;

use App\Models\Books\PaymentMethod;
use App\Models\Location;
use App\Models\Menus\Kiosk;
use App\Models\Menus\MenuOrder;
use App\Models\Menus\Tip;
use App\Models\Menus\TipEvent;
use App\Models\User;
use App\Services\Books\BooksException;
use App\Services\Notify\Staff;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * The tips box (script 212). A tip taken with an order is already in the books, as a credit to the tips payable account on the sale; this keeps the other half: one pending row per order
 * that says whose tip it is, so that a person can hand it over later. Without script 212 nothing here runs and the tip is only the line it always was.
 */
class Tips
{
    /** What the books line for the tip says: the order, the customer, the kiosk and who served. */
    public function narration(MenuOrder $o): string
    {
        $who = trim((string) ($o->label ?: ''));
        $kiosk = $o->kiosk_id ? Kiosk::find($o->kiosk_id)?->name : null;
        $server = $o->cashier_id ? User::find($o->cashier_id)?->name : null;
        $parts = array_filter(['Tip', $o->number ?: null, $who !== '' ? $who : null, $kiosk ? 'kiosk '.$kiosk : null, $server ? 'served by '.$server : null]);

        return mb_substr(implode(', ', $parts), 0, 190);
    }

    /** Put the tip of a paid order into the box, once. Returns the row, or null when there is no tip or the script has not been run. */
    public function record(MenuOrder $o, ?User $by = null): ?Tip
    {
        if ((float) $o->tip <= 0 || ! Tip::installed()) {
            return null;
        }

        return Tip::firstOrCreate(['order_id' => $o->id], [
            'voucher_id' => $o->voucher_id, 'location_id' => $o->location_id, 'amount' => round((float) $o->tip, 2), 'currency_id' => $o->currency_id, 'ledger_id' => MenusSettings::tipLedgerId(),
            'payment_method_id' => $o->payment_method_id, 'customer_name' => $o->label ?: null, 'short_no' => $o->short_no, 'kiosk_id' => $o->kiosk_id, 'received_by' => $by?->id ?? $o->cashier_id,
            'served_by' => $o->cashier_id, 'status' => Tip::PENDING,
        ]);
    }

    // ── the tips screen (6.4) ────────────────────────────────────────────

    /** The window in words, for the screen and for the refusal. */
    public static function windowWords(): string
    {
        $s = MenusSettings::all();
        $names = [1 => 'Mon', 2 => 'Tue', 3 => 'Wed', 4 => 'Thu', 5 => 'Fri', 6 => 'Sat', 7 => 'Sun'];

        return match ($s['tips_window']) {
            'never' => 'Tips are held: handing them out is switched off in the Menus configuration',
            'daily' => "Tips may be handed out every day between {$s['tips_from']} and {$s['tips_to']}",
            'days' => 'Tips may be handed out on '.implode(', ', array_map(fn ($d) => $names[(int) $d] ?? '', (array) $s['tips_days']))." between {$s['tips_from']} and {$s['tips_to']}",
            default => 'Tips may be handed out at any time',
        };
    }

    /** The cash and bank accounts a tip can be paid out of: the accounts of the ways of paying. @return array<int, array{ledger_id: int, name: string}> */
    public function sources(): array
    {
        return PaymentMethod::where('is_active', true)->whereNotNull('ledger_id')->whereIn('kind', ['cash', 'bank', 'mobile_money'])->orderBy('sort_order')->get(['name', 'ledger_id'])
            ->unique('ledger_id')->map(fn ($m) => ['ledger_id' => (int) $m->ledger_id, 'name' => $m->name])->values()->all();
    }

    /** @return array<string, mixed> */
    public function screen(?User $by = null, ?Carbon $now = null): array
    {
        $now ??= Carbon::now((string) config('app.timezone', 'Africa/Nairobi'));
        if (! Tip::installed()) {
            return ['ready' => false];
        }
        $start = $now->copy()->startOfDay();
        $pending = Tip::where('status', Tip::PENDING)->orderBy('created_at')->orderBy('id')->get();
        $today = Tip::where(fn ($q) => $q->where('created_at', '>=', $start)->orWhere('issued_at', '>=', $start))->orderByDesc('created_at')->orderByDesc('id')->get();
        $names = User::whereIn('id', $pending->merge($today)->flatMap(fn ($t) => [$t->received_by, $t->served_by, $t->issued_by, $t->issued_to])->filter()->unique()->all())->pluck('name', 'id');
        $orders = MenuOrder::whereIn('id', $pending->merge($today)->pluck('order_id')->all())->pluck('number', 'id');
        $row = fn (Tip $t) => [
            'id' => $t->id, 'order_number' => $orders[$t->order_id] ?? null, 'amount' => (float) $t->amount, 'status' => $t->status, 'customer' => $t->customer_name, 'short_no' => $t->short_no,
            'received_by' => $names[$t->received_by] ?? null, 'served_by' => $names[$t->served_by] ?? null, 'taken_at' => $t->created_at?->toIso8601String(),
            'issued_at' => $t->issued_at?->toIso8601String(), 'issued_by' => $names[$t->issued_by] ?? null, 'issued_to' => $t->issued_to_name ?: ($names[$t->issued_to] ?? null), 'narration' => $t->issue_narration,
        ];

        return [
            'ready' => true, 'window' => ['open' => MenusSettings::tipsMayBeIssued($now), 'words' => self::windowWords()],
            'can' => ['issue' => (bool) $by?->hasPermission('menus.tips.issue'), 'issue_self' => (bool) $by?->hasPermission('menus.tips.issue_self'), 'reverse' => (bool) $by?->hasPermission('menus.tips.reverse')],
            'pending' => $pending->map($row)->values()->all(), 'today' => $today->map($row)->values()->all(),
            'totals' => ['pending' => round((float) $pending->sum('amount'), 2), 'taken_today' => round((float) $today->where('created_at', '>=', $start)->sum('amount'), 2), 'issued_today' => round((float) $today->where('status', Tip::ISSUED)->sum('amount'), 2)],
            'sources' => $this->sources(),
            'recipients' => app(Staff::class)->holding('menus.till')->map(fn ($u) => ['id' => $u->id, 'name' => $u->name])->sortBy('name')->values()->all(),
        ];
    }

    // ── handing a tip over (6.5) ─────────────────────────────────────────

    /**
     * Hand a tip over: pay it out of a cash or bank account, in one journal (Dr tips payable, Cr that account), and mark it issued with who, to whom and why. All or nothing: the tip row is locked, checked to
     * be still pending, the journal made and the row updated in one transaction, so a failed journal leaves nothing saved. A retry that finds the tip already issued returns it as it is, with the same journal.
     *
     * @param array{to_user_id?: ?int, to_name?: ?string, from_ledger_id?: int, narration?: ?string} $in
     * @return array{tip: Tip, already: bool}
     */
    public function issue(int $tipId, array $in, User $by, ?Carbon $now = null): array
    {
        if (! Tip::installed()) {
            throw new BooksException('Run database script 212_menus_tips.sql to use the tips box.');
        }
        if (! $by->hasPermission('menus.tips.issue')) {
            throw new BooksException('You may not hand tips over.');
        }
        $now ??= Carbon::now((string) config('app.timezone', 'Africa/Nairobi'));
        if (! MenusSettings::tipsMayBeIssued($now)) {
            throw new BooksException(self::windowWords().'. It is not open now: the tip stays in the box until it is.');
        }
        $toUser = ! empty($in['to_user_id']) ? User::find((int) $in['to_user_id']) : null;
        $toName = trim((string) ($in['to_name'] ?? ''));
        if (! empty($in['to_user_id']) && ! $toUser) {
            throw new BooksException('That person could not be found.');
        }
        if (! $toUser && $toName === '') {
            throw new BooksException('Say who the tip is handed to.');
        }
        if ($toUser && $toUser->id === $by->id) {
            throw new BooksException('A tip is not handed to the person handing it over here: that comes with its own permission and a narration.');
        }
        $from = (int) ($in['from_ledger_id'] ?? 0);
        if (! in_array($from, array_column($this->sources(), 'ledger_id'), true)) {
            throw new BooksException('Choose the cash or bank account the tip is paid out of.');
        }
        $note = trim((string) ($in['narration'] ?? ''));
        if (mb_strlen($note) > 300) {
            throw new BooksException('The narration is too long (300 letters at most).');
        }

        return DB::transaction(function () use ($tipId, $toUser, $toName, $from, $note, $by, $now) {
            $tip = Tip::whereKey($tipId)->lockForUpdate()->first() ?? throw new BooksException('That tip could not be found.');
            if ($tip->status === Tip::ISSUED) {
                return ['tip' => $tip, 'already' => true];
            }
            $debit = (int) ($tip->ledger_id ?: MenusSettings::tipLedgerId());
            if (! $debit) {
                throw new BooksException('Tips are not set up: choose the account they are booked to under Menus, Configuration.');
            }
            $order = MenuOrder::find($tip->order_id);
            $who = $toUser?->name ?? $toName;
            $narration = $note !== '' ? $note : mb_substr('Tip handed to '.$who.($order ? ', '.$order->number : '').($tip->customer_name ? ', '.$tip->customer_name : ''), 0, 190);
            $journal = app(IngredientUse::class)->book($debit, $from, (float) $tip->amount, $narration, (int) ($tip->location_id ?: Location::defaultSelling()?->id), $now, $by);
            $tip->update(['status' => Tip::ISSUED, 'issued_at' => $now, 'issued_by' => $by->id, 'issued_to' => $toUser?->id, 'issued_to_name' => $toUser ? null : $toName,
                'issued_from_ledger_id' => $from, 'issue_voucher_id' => $journal->id, 'issue_narration' => $note !== '' ? $note : null]);
            TipEvent::create(['tip_id' => $tip->id, 'kind' => TipEvent::ISSUED, 'amount' => $tip->amount, 'voucher_id' => $journal->id, 'to_user_id' => $toUser?->id, 'to_name' => $toUser ? null : $toName,
                'narration' => $narration, 'done_by' => $by->id, 'done_at' => $now]);

            return ['tip' => $tip->fresh(), 'already' => false];
        });
    }
}
