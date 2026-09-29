<?php

namespace App\Services\Books;

use App\Models\Books\FinancialYear;
use App\Models\Books\Voucher;
use App\Models\Books\VoucherSeries;
use App\Models\Books\VoucherType;
use App\Models\Location;
use Carbon\CarbonInterface;

/**
 * Voucher numbers from a per-type series: prefix / suffix / start / zero-padding /
 * reset period, optionally a branch's own series. Tokens usable in prefix and
 * suffix: {YYYY} {YY} {MM} {BR} (the branch code). Call inside a transaction —
 * the series row is locked while the counter moves.
 */
class NumberingService
{
    /** @return array{0: VoucherSeries, 1: ?int, 2: string} series, sequence (null when typed by hand), number */
    public function allocate(VoucherType $type, ?int $locationId, CarbonInterface $date, ?int $seriesId = null, ?string $manual = null): array
    {
        $series = $this->pick($type, $locationId, $seriesId);
        $series = VoucherSeries::whereKey($series->id)->lockForUpdate()->first();

        $manual = $manual !== null ? trim($manual) : null;
        if ($manual !== null && $manual !== '') {
            if (! $series->allow_manual) {
                throw new BooksException("The \"{$series->name}\" series does not allow typing a number by hand.");
            }
            if (Voucher::where('voucher_type_id', $type->id)->where('voucher_number', $manual)->exists()) {
                throw new BooksException("{$type->name} number {$manual} already exists.");
            }

            return [$series, null, $manual];
        }

        $this->applyReset($series, $date);

        $seq = (int) $series->next_number;
        $number = $this->format($series, $seq, $date, $locationId);
        while (Voucher::where('voucher_type_id', $type->id)->where('voucher_number', $number)->exists()) {
            $seq++;
            $number = $this->format($series, $seq, $date, $locationId);
        }

        $series->update(['next_number' => $seq + 1]);

        return [$series, $seq, $number];
    }

    /** What the next number would look like (no counter movement). */
    public function preview(VoucherSeries $series, CarbonInterface $date, ?int $locationId = null): string
    {
        $next = (int) $series->next_number;
        $key = $this->resetKey($series, $date);
        if ($series->reset_period !== 'never' && $series->last_reset_key !== null && $key !== $series->last_reset_key) {
            $next = (int) $series->start_number;
        }

        return $this->format($series, $next, $date, $locationId);
    }

    public function format(VoucherSeries $series, int $seq, CarbonInterface $date, ?int $locationId = null): string
    {
        $branch = $locationId ? (Location::find($locationId)?->code ?? '') : '';
        $swap = fn (string $s) => strtr($s, [
            '{YYYY}' => $date->format('Y'),
            '{YY}'   => $date->format('y'),
            '{MM}'   => $date->format('m'),
            '{BR}'   => (string) $branch,
        ]);
        $n = $series->number_width > 0 ? str_pad((string) $seq, (int) $series->number_width, '0', STR_PAD_LEFT) : (string) $seq;

        return $swap((string) $series->prefix) . $n . $swap((string) $series->suffix);
    }

    private function pick(VoucherType $type, ?int $locationId, ?int $seriesId): VoucherSeries
    {
        $base = VoucherSeries::where('voucher_type_id', $type->id)->where('is_active', true);

        if ($seriesId) {
            $s = (clone $base)->whereKey($seriesId)->first();
            if (! $s) {
                throw new BooksException('That numbering series does not belong to this voucher type (or is switched off).');
            }

            return $s;
        }
        if ($locationId) {
            $s = (clone $base)->where('location_id', $locationId)->orderByDesc('is_default')->orderBy('id')->first();
            if ($s) {
                return $s;
            }
        }
        $s = (clone $base)->whereNull('location_id')->orderByDesc('is_default')->orderBy('id')->first()
            ?? (clone $base)->orderByDesc('is_default')->orderBy('id')->first();
        if (! $s) {
            throw new BooksException("{$type->name} has no numbering series — add one under Books settings.");
        }

        return $s;
    }

    private function resetKey(VoucherSeries $series, CarbonInterface $date): ?string
    {
        return match ($series->reset_period) {
            'yearly'         => $date->format('Y'),
            'monthly'        => $date->format('Y-m'),
            'financial_year' => (string) (FinancialYear::containing($date->toDateString())?->id ?? $date->format('Y')),
            default          => null,
        };
    }

    private function applyReset(VoucherSeries $series, CarbonInterface $date): void
    {
        if ($series->reset_period === 'never') {
            return;
        }
        $key = $this->resetKey($series, $date);
        if ($series->last_reset_key !== $key) {
            $series->next_number = $series->last_reset_key === null ? $series->next_number : $series->start_number;
            $series->last_reset_key = $key;
            $series->save();
        }
    }
}
