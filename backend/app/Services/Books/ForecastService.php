<?php

namespace App\Services\Books;

use App\Models\User;
use App\Services\Books\Engine\Figures;
use App\Services\Books\Engine\LedgerBalances;
use App\Services\Books\Engine\Reports\MoneyFlowReport;
use App\Services\Books\Engine\Reports\TaxReturnReport;
use App\Services\Books\Engine\Scope;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Validation\ValidationException;

/**
 * The 90-day cash forecast (database script 237). It starts from what cash and bank hold and adds every flow the books can see or a person has told it about, each
 * labelled as CONFIRMED (a supplier bill that is owed, a payment with a contract or schedule) or an ESTIMATE (when customers will really pay, a tax payment, anything
 * a person marked as a guess), so the two can be shown apart and the forecast read without the guesses. Nothing here is posted or stored except the items.
 *
 * What it counts, and how:
 *  - open customer bills: expected on the due date plus the collection delay, times the share expected to be collected (Reports settings → Cash forecast). Estimate.
 *  - open supplier bills: paid on the due date (bill date plus the supplier terms when the bill has no due date). Confirmed.
 *  - the forecast items (payroll, rent, loan repayments, a retainer ...): each as often as its frequency says, as confirmed or estimate as its owner marked it.
 *  - tax now owed: on the next filing day set in Tax control, when the setting is on. Estimate.
 * Bills already past due are placed the next day. Foreign-currency bills are in today's base currency, like every report.
 */
class ForecastService
{
    public const KINDS = ['payroll' => 'Payroll', 'rent' => 'Rent', 'loan' => 'Loan repayment', 'tax' => 'Tax payment', 'supplier' => 'Supplier or standing order', 'retainer' => 'Retainer or regular receipt', 'other' => 'Other'];
    public const FREQUENCIES = ['once' => 'Once', 'weekly' => 'Every week', 'monthly' => 'Every month', 'quarterly' => 'Every three months', 'yearly' => 'Every year'];
    public const CERTAINTY = ['confirmed' => 'Confirmed', 'estimate' => 'Estimate'];

    public static function ready(): bool
    {
        return Schema::hasTable('forecast_items');
    }

    /** @return array<int, array<string, mixed>> */
    public function items(): array
    {
        if (! self::ready()) {
            return [];
        }

        return DB::table('forecast_items')->orderBy('is_active', 'desc')->orderBy('direction')->orderBy('start_date')->orderBy('id')->get()
            ->map(fn ($r) => ['id' => (int) $r->id, 'label' => $r->label, 'kind' => $r->kind, 'direction' => $r->direction, 'amount' => (float) $r->amount, 'frequency' => $r->frequency,
                'start_date' => substr((string) $r->start_date, 0, 10), 'end_date' => $r->end_date ? substr((string) $r->end_date, 0, 10) : null, 'certainty' => $r->certainty, 'is_active' => (bool) $r->is_active, 'note' => $r->note])->all();
    }

    /** @param  array<string, mixed>  $in */
    public function saveItem(array $in, ?User $by, ?int $id = null): int
    {
        abort_unless(self::ready(), 409, 'Run database script 237_planning.sql first.');
        $errors = [];
        $label = trim((string) ($in['label'] ?? ''));
        if ($label === '' || mb_strlen($label) > 120) {
            $errors['label'] = 'Give it a name of up to 120 characters.';
        }
        if (! isset(self::KINDS[$in['kind'] ?? ''])) {
            $errors['kind'] = 'Choose what kind of payment or receipt it is.';
        }
        if (! in_array($in['direction'] ?? '', ['in', 'out'], true)) {
            $errors['direction'] = 'Say whether money comes in or goes out.';
        }
        if (! isset($in['amount']) || ! is_numeric($in['amount']) || (float) $in['amount'] <= 0) {
            $errors['amount'] = 'Enter an amount above zero (each time it happens).';
        }
        if (! isset(self::FREQUENCIES[$in['frequency'] ?? ''])) {
            $errors['frequency'] = 'Choose how often it happens.';
        }
        if (! isset(self::CERTAINTY[$in['certainty'] ?? ''])) {
            $errors['certainty'] = 'Say whether it is confirmed or an estimate.';
        }
        $start = $in['start_date'] ?? null;
        if (! $start || ! preg_match('/^\d{4}-\d{2}-\d{2}$/', (string) $start) || ! Carbon::hasFormat((string) $start, 'Y-m-d')) {
            $errors['start_date'] = 'Give the first date, like 2026-11-05.';
        }
        $end = ($in['end_date'] ?? null) ?: null;
        if ($end && (! preg_match('/^\d{4}-\d{2}-\d{2}$/', (string) $end) || ($start && $end < $start))) {
            $errors['end_date'] = 'The last date cannot be before the first.';
        }
        if ($errors) {
            throw ValidationException::withMessages($errors);
        }
        $row = ['label' => $label, 'kind' => $in['kind'], 'direction' => $in['direction'], 'amount' => round((float) $in['amount'], 2), 'frequency' => $in['frequency'], 'start_date' => $start,
            'end_date' => $in['frequency'] === 'once' ? null : $end, 'certainty' => $in['certainty'], 'is_active' => array_key_exists('is_active', $in) ? (bool) $in['is_active'] : true,
            'note' => isset($in['note']) ? mb_substr(trim((string) $in['note']), 0, 255) ?: null : null, 'updated_at' => now()];
        if ($id) {
            abort_unless(DB::table('forecast_items')->where('id', $id)->exists(), 404);
            DB::table('forecast_items')->where('id', $id)->update($row);

            return $id;
        }

        return (int) DB::table('forecast_items')->insertGetId($row + ['created_by' => $by?->id, 'created_at' => now()]);
    }

    public function deleteItem(int $id): void
    {
        abort_unless(self::ready(), 409, 'Run database script 237_planning.sql first.');
        DB::table('forecast_items')->where('id', $id)->delete();
    }

    /** The dates an item happens on inside (from, to]. @return string[] */
    public static function occurrences(array $item, string $from, string $to): array
    {
        $out = [];
        $start = Carbon::parse($item['start_date']);
        $stop = Carbon::parse($item['end_date'] ?? '9999-12-31');
        $end = Carbon::parse($to);
        if ($item['frequency'] === 'once') {
            return $start->gt(Carbon::parse($from)) && $start->lte($end) ? [$start->toDateString()] : [];
        }
        for ($i = 0; $i < 4000; $i++) {
            $d = match ($item['frequency']) {
                'weekly' => $start->copy()->addWeeks($i),
                'monthly' => $start->copy()->addMonthsNoOverflow($i),
                'quarterly' => $start->copy()->addMonthsNoOverflow($i * 3),
                default => $start->copy()->addYearsNoOverflow($i),
            };
            if ($d->gt($end) || $d->gt($stop)) {
                break;
            }
            if ($d->gt(Carbon::parse($from))) {
                $out[] = $d->toDateString();
            }
        }

        return $out;
    }

    /** The assumptions the forecast runs on, with their current values. @return array<string, mixed> */
    public function settings(): array
    {
        $v = ReportSettings::ready() ? app(ReportSettings::class)->values() : [];

        return ['delay' => (int) ($v['forecast_collection_delay_days'] ?? 0), 'percent' => (float) ($v['forecast_collect_percent'] ?? 100), 'terms' => (int) ($v['forecast_supplier_terms_days'] ?? 0),
            'tax' => (bool) ($v['forecast_include_tax'] ?? true)];
    }

    /**
     * The forecast for `days` after `$start`.
     *
     * @return array{start: string, end: string, opening: float, flows: array, weeks: array, days: array, summary: array, assumptions: array}
     */
    public function build(Scope $scope, string $start, int $days = 90): array
    {
        $days = max(7, min(180, $days));
        $end = Carbon::parse($start)->addDays($days)->toDateString();
        $a = $this->settings();
        $flows = [];
        $add = function (string $date, string $label, float $amount, string $dir, string $certainty, string $source) use (&$flows) {
            if ($amount > 0.004) {
                $flows[] = ['date' => $date, 'label' => $label, 'amount' => round($amount, 2), 'direction' => $dir, 'certainty' => $certainty, 'source' => $source];
            }
        };
        $first = Carbon::parse($start)->addDay()->toDateString();
        $placed = fn (string $date) => max($date, $first);   // a date already gone is the next day

        $figures = app(Figures::class);
        $custCount = $custTotal = $suppCount = $suppTotal = 0;
        foreach ($figures->ageing('receivables', $start)['rows'] as $p) {
            foreach ($p['bills'] as $b) {
                $date = $placed(Carbon::parse($b['due_date'])->addDays($a['delay'])->toDateString());
                $custCount++;
                $custTotal += $b['open'];
                if ($date <= $end) {
                    $add($date, "{$p['party']}: {$b['voucher_number']}", $b['open'] * $a['percent'] / 100, 'in', 'estimate', 'customer');
                }
            }
        }
        foreach ($figures->ageing('payables', $start)['rows'] as $p) {
            foreach ($p['bills'] as $b) {
                $date = $b['due_date'] === $b['date'] && $a['terms'] > 0 ? Carbon::parse($b['date'])->addDays($a['terms'])->toDateString() : $b['due_date'];
                $date = $placed($date);
                $suppCount++;
                $suppTotal += $b['open'];
                if ($date <= $end) {
                    $add($date, "{$p['party']}: {$b['voucher_number']}", $b['open'], 'out', 'confirmed', 'supplier');
                }
            }
        }
        $items = array_filter($this->items(), fn ($i) => $i['is_active']);
        foreach ($items as $it) {
            foreach (self::occurrences($it, $start, $end) as $d) {
                $add($d, $it['label'], $it['amount'], $it['direction'], $it['certainty'], 'item');
            }
        }
        $taxNote = null;
        if ($a['tax']) {
            try {
                $day = TaxControlSettings::ready() ? (int) app(TaxControlSettings::class)->get('filing_due_day') : 20;
                $r = app(TaxReturnReport::class)->run(Scope::dates(Carbon::parse($start)->startOfMonth()->toDateString(), $start, $scope->area), []);
                $owed = (float) ($r['totals']['owed'] ?? 0);
                $due = Carbon::parse($start)->startOfMonth()->addDays(min(max($day, 1), 28) - 1);
                if ($due->lte(Carbon::parse($start))) {
                    $due = $due->addMonthNoOverflow();
                }
                if ($owed > 0.004 && $due->toDateString() <= $end) {
                    $add($due->toDateString(), 'Tax owed, paid on the filing day', $owed, 'out', 'estimate', 'tax');
                }
                $taxNote = $owed > 0.004 ? 'Tax owed now ' . number_format($owed, 2) . ', paid on day ' . $day . ' of the month.' : 'No tax is owed now.';
            } catch (\Throwable $e) {
                $taxNote = 'The tax owed could not be worked out, so it is not counted.';
            }
        }
        usort($flows, fn ($x, $y) => [$x['date'], $x['direction']] <=> [$y['date'], $y['direction']]);

        $whole = Scope::dates(null, null, $scope->area);
        $money = app(MoneyFlowReport::class)->moneyLedgerIds();
        $opening = round(array_sum(array_map(fn ($id) => app(LedgerBalances::class)->balance($id, $start, $whole), $money)), 2);

        // day by day: the balance with every flow, and the balance with only the confirmed ones
        $byDay = [];
        foreach ($flows as $f) {
            $sign = $f['direction'] === 'in' ? 1 : -1;
            $byDay[$f['date']]['all'] = ($byDay[$f['date']]['all'] ?? 0) + $sign * $f['amount'];
            if ($f['certainty'] === 'confirmed') {
                $byDay[$f['date']]['confirmed'] = ($byDay[$f['date']]['confirmed'] ?? 0) + $sign * $f['amount'];
            }
        }
        $all = $conf = $opening;
        $dayRows = [];
        $low = ['all' => ['balance' => $opening, 'date' => $start], 'confirmed' => ['balance' => $opening, 'date' => $start]];
        $short = null;
        for ($d = Carbon::parse($first); $d->lte(Carbon::parse($end)); $d->addDay()) {
            $k = $d->toDateString();
            $all += $byDay[$k]['all'] ?? 0;
            $conf += $byDay[$k]['confirmed'] ?? 0;
            $dayRows[] = ['date' => $k, 'balance' => round($all, 2), 'confirmed_only' => round($conf, 2)];
            if ($all < $low['all']['balance']) {
                $low['all'] = ['balance' => round($all, 2), 'date' => $k];
            }
            if ($conf < $low['confirmed']['balance']) {
                $low['confirmed'] = ['balance' => round($conf, 2), 'date' => $k];
            }
            if ($short === null && $all < 0) {
                $short = $k;
            }
        }

        $weeks = [];
        $n = (int) ceil($days / 7);
        for ($w = 0; $w < $n; $w++) {
            $ws = Carbon::parse($first)->addDays($w * 7)->toDateString();
            $we = min(Carbon::parse($first)->addDays($w * 7 + 6)->toDateString(), $end);
            $row = ['start' => $ws, 'end' => $we, 'in_confirmed' => 0.0, 'in_estimate' => 0.0, 'out_confirmed' => 0.0, 'out_estimate' => 0.0];
            foreach ($flows as $f) {
                if ($f['date'] >= $ws && $f['date'] <= $we) {
                    $row[$f['direction'] . '_' . $f['certainty']] += $f['amount'];
                }
            }
            $last = collect($dayRows)->last(fn ($r) => $r['date'] <= $we);
            $weeks[] = array_map(fn ($v) => is_float($v) ? round($v, 2) : $v, $row) + ['balance' => $last['balance'] ?? $opening, 'confirmed_only' => $last['confirmed_only'] ?? $opening];
        }

        $sum = fn (string $dir, string $cert) => round(array_sum(array_map(fn ($f) => $f['direction'] === $dir && $f['certainty'] === $cert ? $f['amount'] : 0, $flows)), 2);

        return [
            'start' => $start, 'end' => $end, 'opening' => $opening, 'flows' => $flows, 'weeks' => $weeks, 'days' => $dayRows,
            'summary' => ['in_confirmed' => $sum('in', 'confirmed'), 'in_estimate' => $sum('in', 'estimate'), 'out_confirmed' => $sum('out', 'confirmed'), 'out_estimate' => $sum('out', 'estimate'),
                'closing' => end($dayRows)['balance'] ?? $opening, 'closing_confirmed_only' => end($dayRows)['confirmed_only'] ?? $opening, 'lowest' => $low['all'], 'lowest_confirmed_only' => $low['confirmed'], 'shortfall_from' => $short],
            'assumptions' => [
                ['key' => 'opening', 'label' => 'Starting cash', 'value' => number_format($opening, 2), 'detail' => 'What the cash and bank accounts hold on ' . $start . '.'],
                ['key' => 'customers', 'label' => 'Customer bills', 'value' => $custCount . ' bills · ' . number_format($custTotal, 2), 'detail' => "Expected {$a['delay']} day(s) after the due date, {$a['percent']}% collected. An estimate of timing."],
                ['key' => 'suppliers', 'label' => 'Supplier bills', 'value' => $suppCount . ' bills · ' . number_format($suppTotal, 2), 'detail' => 'Paid on the due date' . ($a['terms'] > 0 ? ", or {$a['terms']} day(s) after the bill date when there is no due date" : '') . '. Confirmed.'],
                ['key' => 'items', 'label' => 'Recurring and one-off items', 'value' => count($items) . ' active', 'detail' => collect($items)->groupBy('certainty')->map(fn ($g, $c) => count($g) . ' ' . $c)->implode(', ') ?: 'None entered under Planning.'],
                ['key' => 'tax', 'label' => 'Tax', 'value' => $a['tax'] ? 'Included' : 'Left out', 'detail' => $a['tax'] ? ($taxNote . ' An estimate.') : 'The tax payment is not in this forecast (Reports settings → Cash forecast).'],
                ['key' => 'late', 'label' => 'Bills already late', 'value' => 'The next day', 'detail' => 'A bill past its date is placed on the day after the forecast starts.'],
            ],
        ];
    }
}
