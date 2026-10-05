<?php

namespace App\Services\Books;

use App\Models\Books\Ledger;
use App\Models\Books\Voucher;
use App\Models\Books\VoucherAuditLog;
use App\Models\Books\VoucherType;
use App\Models\Location;
use App\Models\User;
use App\Services\CurrencyConversionService;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * The Memorandum voucher. It is a voucher (numbered, listed in its own register, dated, with an author) that posts nothing: its debit and credit
 * lines live in the voucher's own data, never in the accounting entries, so no ledger, trial balance or report can see them. A finance user can
 * convert it into a real Journal; until then it is only a record of what is expected or agreed.
 *
 * Its state is kept in the voucher: open, converted (to a Journal) or dismissed. If the Journal it made is later cancelled, the memorandum is open again.
 */
class MemorandumService
{
    public const PURPOSES = [
        'refund' => 'Refund', 'overpayment' => 'Overpayment', 'credit_adjustment' => 'Credit adjustment', 'loyalty_adjustment' => 'Loyalty adjustment',
        'manual_payment' => 'Manual payment', 'reversal' => 'Reversal', 'agreement' => 'Agreement', 'other' => 'Other',
    ];

    public function __construct(private NumberingService $numbering, private VoucherService $vouchers, private CurrencyConversionService $money) {}

    public function type(): VoucherType
    {
        return VoucherType::byBase(VoucherType::MEMORANDUM) ?? throw new BooksException('The Memorandum voucher type is not set up yet. Run the database script 77_memorandum.sql.');
    }

    /** Check and tidy the lines. They may be empty (a quick note), but any line given must be whole. */
    private function lines(array $raw): array
    {
        $out = [];
        foreach ($raw as $l) {
            $ledger = $l['ledger_id'] ?? null;
            $amt = round((float) ($l['amount'] ?? 0), 2);
            $side = strtoupper((string) ($l['side'] ?? ''));
            if (! $ledger && $amt <= 0 && trim((string) ($l['narration'] ?? '')) === '') {
                continue;   // an empty row on the form
            }
            if (! $ledger || ! Ledger::whereKey($ledger)->exists() || ! in_array($side, ['D', 'C'], true) || $amt <= 0) {
                throw new BooksException('Every line needs a ledger, a debit or credit side and an amount.');
            }
            $out[] = ['ledger_id' => (int) $ledger, 'side' => $side, 'amount' => $amt, 'narration' => trim((string) ($l['narration'] ?? '')) ?: null];
        }

        return $out;
    }

    private function memo(array $d, ?array $existing = null): array
    {
        $purpose = $d['purpose'] ?? ($existing['purpose'] ?? 'other');
        if (! isset(self::PURPOSES[$purpose])) {
            throw new BooksException('Choose what the memorandum is for.');
        }
        $lines = array_key_exists('lines', $d) ? $this->lines((array) $d['lines']) : ($existing['lines'] ?? []);
        $about = array_key_exists('about_voucher_id', $d) ? ($d['about_voucher_id'] ? (int) $d['about_voucher_id'] : null) : ($existing['about_voucher_id'] ?? null);
        if ($about && ! Voucher::whereKey($about)->exists()) {
            throw new BooksException('The voucher this is about could not be found.');
        }
        $direction = array_key_exists('direction', $d) ? ($d['direction'] ?: null) : ($existing['direction'] ?? null);
        if ($direction && ! in_array($direction, ['in', 'out'], true)) {
            throw new BooksException('Money is either in or out.');
        }

        return ['purpose' => $purpose, 'direction' => $direction, 'about_voucher_id' => $about, 'lines' => $lines, 'state' => $existing['state'] ?? 'open'];
    }

    public function create(array $d, ?User $user): Voucher
    {
        $type = $this->type();
        $narration = trim((string) ($d['narration'] ?? ''));
        if ($narration === '') {
            throw new BooksException('Say what the memorandum is about.');
        }
        $memo = $this->memo($d);
        $debit = round(array_sum(array_map(fn ($l) => $l['side'] === 'D' ? $l['amount'] : 0, $memo['lines'])), 2);
        $amount = ! empty($d['amount']) ? round((float) $d['amount'], 2) : $debit;
        $date = Carbon::parse($d['date'] ?? today());
        $locationId = $d['location_id'] ?? Location::default()?->id;
        $currency = $this->money->getBaseCurrency();

        return DB::transaction(function () use ($type, $narration, $memo, $amount, $date, $locationId, $currency, $user, $d) {
            [$series, $seq, $number] = $this->numbering->allocate($type, $locationId, $date);
            $v = Voucher::create([
                'voucher_type_id' => $type->id, 'series_id' => $series->id, 'voucher_number' => $number, 'sequence_number' => $seq, 'date' => $date->toDateString(),
                'status' => Voucher::POSTED, 'posted_at' => now(), 'created_by' => $user?->id, 'location_id' => $locationId, 'currency_id' => $currency->id, 'exchange_rate' => 1,
                'reference_no' => $d['reference_no'] ?? null, 'narration' => $narration, 'subtotal' => 0, 'tax_total' => 0, 'total_amount' => $amount, 'base_total' => $amount,
                'channel' => 'admin', 'meta' => ['memo' => $memo + ['amount' => $amount]],
            ]);
            $this->audit($v, 'created', $user);

            return $v;
        });
    }

    /** Finance only (the controller checks): change an open memorandum. */
    public function update(Voucher $v, array $d, ?User $user): Voucher
    {
        $cur = $this->state($v);
        if ($cur !== 'open') {
            throw new BooksException('Only an open memorandum can be edited.');
        }
        $existing = $v->meta['memo'] ?? [];
        $memo = $this->memo($d, $existing);
        $debit = round(array_sum(array_map(fn ($l) => $l['side'] === 'D' ? $l['amount'] : 0, $memo['lines'])), 2);
        $amount = array_key_exists('amount', $d) ? round((float) ($d['amount'] ?: $debit), 2) : ($debit ?: (float) ($existing['amount'] ?? $v->total_amount));
        $meta = $v->meta ?? [];
        $meta['memo'] = $memo + ['amount' => $amount];
        $v->update([
            'date' => isset($d['date']) ? Carbon::parse($d['date'])->toDateString() : $v->date, 'narration' => isset($d['narration']) ? trim((string) $d['narration']) : $v->narration,
            'reference_no' => array_key_exists('reference_no', $d) ? $d['reference_no'] : $v->reference_no, 'total_amount' => $amount, 'base_total' => $amount, 'meta' => $meta,
        ]);
        $this->audit($v, 'edited', $user);

        return $v->fresh();
    }

    public function dismiss(Voucher $v, ?string $reason, ?User $user): Voucher
    {
        if ($this->state($v) === 'converted') {
            throw new BooksException('This memorandum was converted. Cancel the journal it made first, then dismiss it.');
        }
        $meta = $v->meta ?? [];
        $meta['memo']['state'] = 'dismissed';
        $v->update(['status' => Voucher::CANCELLED, 'cancelled_at' => now(), 'cancelled_by' => $user?->id, 'cancel_reason' => $reason, 'meta' => $meta]);
        $this->audit($v, 'cancelled', $user, ['reason' => $reason]);

        return $v->fresh();
    }

    /** Make a real Journal (or a Contra, when every line is cash or bank) from the lines. They must balance. */
    public function convert(Voucher $v, array $opts, ?User $user): Voucher
    {
        if ($this->state($v) !== 'open') {
            throw new BooksException('Only an open memorandum can be converted.');
        }
        $lines = $v->meta['memo']['lines'] ?? [];
        $debit = round(array_sum(array_map(fn ($l) => $l['side'] === 'D' ? $l['amount'] : 0, $lines)), 2);
        $credit = round(array_sum(array_map(fn ($l) => $l['side'] === 'C' ? $l['amount'] : 0, $lines)), 2);
        if (count($lines) < 2 || abs($debit - $credit) > 0.005) {
            throw new BooksException('The debits and credits must be equal, with at least two lines, before it can be converted.');
        }
        $base = ($opts['to'] ?? 'journal') === 'contra' ? VoucherType::CONTRA : VoucherType::JOURNAL;
        $target = VoucherType::byBase($base) ?? throw new BooksException('That voucher type is switched off.');

        return DB::transaction(function () use ($v, $lines, $target, $opts, $user) {
            $made = $this->vouchers->create([
                'voucher_type_id' => $target->id, 'date' => $opts['date'] ?? today()->toDateString(), 'location_id' => $v->location_id, 'reference_no' => $v->voucher_number,
                'narration' => trim($v->narration . ' (from ' . $v->voucher_number . ')'), 'source_voucher_id' => $v->id, 'channel' => 'admin',
                'entries' => array_map(fn ($l) => ['ledger_id' => $l['ledger_id'], 'side' => $l['side'], 'amount' => $l['amount'], 'narration' => $l['narration']], $lines),
            ], $user);
            $meta = $v->meta ?? [];
            $meta['memo']['state'] = 'converted';
            $meta['memo']['converted_to'] = $made->id;
            $meta['memo']['converted_at'] = now()->toDateTimeString();
            $v->update(['meta' => $meta]);
            $this->audit($v, 'converted', $user, ['voucher' => $made->voucher_number]);

            return $made;
        });
    }

    /** open | converted | dismissed. A converted one whose journal was cancelled is open again. */
    public function state(Voucher $v): string
    {
        $m = $v->meta['memo'] ?? [];
        if ($v->status === Voucher::CANCELLED || ($m['state'] ?? '') === 'dismissed') {
            return 'dismissed';
        }
        if (($m['state'] ?? 'open') === 'converted') {
            $target = ! empty($m['converted_to']) ? Voucher::find($m['converted_to']) : null;

            return $target && $target->status !== Voucher::CANCELLED ? 'converted' : 'open';
        }

        return 'open';
    }

    /** The memorandum as the screens want it. */
    public function present(Voucher $v): array
    {
        $v->loadMissing(['creator:id,name', 'currency:id,code,symbol']);
        $m = $v->meta['memo'] ?? [];
        $lines = $m['lines'] ?? [];
        $names = Ledger::whereIn('id', array_column($lines, 'ledger_id') ?: [0])->pluck('name', 'id');
        $debit = round(array_sum(array_map(fn ($l) => $l['side'] === 'D' ? $l['amount'] : 0, $lines)), 2);
        $credit = round(array_sum(array_map(fn ($l) => $l['side'] === 'C' ? $l['amount'] : 0, $lines)), 2);
        $about = ! empty($m['about_voucher_id']) ? Voucher::with('type:id,name')->find($m['about_voucher_id']) : null;
        $made = ! empty($m['converted_to']) ? Voucher::find($m['converted_to']) : null;
        $state = $this->state($v);

        return [
            'id' => $v->id, 'number' => $v->voucher_number, 'date' => $v->date?->toDateString(), 'narration' => $v->narration, 'reference_no' => $v->reference_no,
            'purpose' => $m['purpose'] ?? 'other', 'purpose_label' => self::PURPOSES[$m['purpose'] ?? 'other'] ?? 'Other', 'direction' => $m['direction'] ?? null,
            'amount' => (float) ($m['amount'] ?? $v->total_amount), 'currency' => $v->currency?->code, 'symbol' => $v->currency?->symbol, 'state' => $state,
            'lines' => array_map(fn ($l) => $l + ['ledger' => $names[$l['ledger_id']] ?? '—'], $lines), 'debit' => $debit, 'credit' => $credit,
            'balanced' => count($lines) >= 2 && abs($debit - $credit) <= 0.005,
            'about' => $about ? ['id' => $about->id, 'number' => $about->voucher_number, 'type' => $about->type?->name] : null,
            'converted' => $made && $state === 'converted' ? ['id' => $made->id, 'number' => $made->voucher_number] : null,
            'created_by' => $v->creator?->name, 'created_by_id' => $v->created_by, 'created_at' => $v->created_at?->toDateTimeString(), 'cancel_reason' => $v->cancel_reason,
        ];
    }

    private function audit(Voucher $v, string $action, ?User $user, array $detail = []): void
    {
        VoucherAuditLog::create(['voucher_id' => $v->id, 'action' => $action, 'user_id' => $user?->id, 'detail' => $detail ?: null, 'created_at' => now()]);
    }
}
