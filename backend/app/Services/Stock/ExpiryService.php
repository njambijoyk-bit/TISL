<?php

namespace App\Services\Stock;

use App\Models\Notification;
use App\Models\StockBatch;
use App\Models\User;
use App\Services\Books\BooksException;
use App\Services\Location\VariantStockService;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Throwable;

/**
 * The daily expiry check (`stock:expire`):
 *  1. batches past their expiry date are marked expired, and the shop's stock numbers follow (expired stock
 *     no longer counts as available);
 *  2. expired batches whose rules say "write off after N days" are written off once the days are up;
 *  3. staff are told — once per warning band — about batches about to expire, and about what expired today,
 *     for the branches they work at.
 * The rules come from Settings → Stock & expiry, with category / product exceptions (StockPolicy).
 */
class ExpiryService
{
    public function __construct(
        private StockPolicy $policy,
        private VariantStockService $stock,
        private StockWriteOffService $writeOffs,
    ) {}

    /** @return array{marked:int, written_off:int, warned:int, errors:array<int,string>} */
    public function run(): array
    {
        $expired = $this->markExpired();
        [$writtenOff, $errors] = $this->autoWriteOff();
        $warned = $this->warn($expired);

        return ['marked' => $expired->count(), 'written_off' => $writtenOff, 'warned' => $warned, 'errors' => $errors];
    }

    /** Mark batches past their date as expired and refresh the shop numbers of their products. @return Collection<StockBatch> those that still hold stock */
    public function markExpired(): Collection
    {
        $batches = StockBatch::where('status', StockBatch::ACTIVE)->whereNotNull('expiry_date')->whereDate('expiry_date', '<', today())->get();
        if ($batches->isEmpty()) {
            return StockBatch::whereRaw('1 = 0')->get();
        }
        StockBatch::whereIn('id', $batches->pluck('id'))->update(['status' => StockBatch::EXPIRED]);
        foreach ($batches->pluck('variant_id')->unique() as $variantId) {
            $this->stock->refreshVariant((int) $variantId);
        }

        $withStock = $batches->filter(fn ($b) => $this->held($b->id) > 0.00005)->pluck('id');

        return StockBatch::with('variant.product:id,name')->whereIn('id', $withStock)->get();
    }

    /** Write off expired batches whose "write off after N days" is up. @return array{0:int, 1:array<int,string>} */
    public function autoWriteOff(): array
    {
        $n = 0;
        $errors = [];
        foreach (StockBatch::with('variant')->where('status', StockBatch::EXPIRED)->whereNotNull('expiry_date')->get() as $b) {
            if ($this->held($b->id) < 0.00005) {
                continue;
            }
            $rules = $this->policy->forProduct($b->variant?->product_id);
            if ($rules['expiry_action'] !== 'write_off' || $b->expiry_date->diffInDays(today(), false) < (int) $rules['write_off_after_days']) {
                continue;
            }
            try {
                $this->writeOffs->writeOff($b, null, null, 'Expired on ' . $b->expiry_date->format('d M Y') . ' — written off automatically', null);
                $n++;
            } catch (BooksException|Throwable $e) {
                $errors[] = 'Batch ' . ($b->batch_no ?: '#' . $b->id) . ': ' . $e->getMessage();
            }
        }

        return [$n, $errors];
    }

    /**
     * Warn once per band: a batch that comes within a product's warning days (say 90 / 60 / 30) is reported when it
     * first enters each band. `$expiredToday` is what the marking step just expired.
     *
     * @return int notifications created
     */
    public function warn(Collection $expiredToday): int
    {
        $due = [];
        foreach (StockBatch::with('variant.product:id,name')->where('status', StockBatch::ACTIVE)->whereNotNull('expiry_date')->whereDate('expiry_date', '>=', today())->get() as $b) {
            if ($this->held($b->id) < 0.00005) {
                continue;
            }
            $bands = collect($this->policy->forProduct($b->variant?->product_id)['warning_days'])->map(fn ($x) => (int) $x)->sort()->values();
            $left = (int) today()->diffInDays($b->expiry_date, false);
            $band = $bands->first(fn ($x) => $x >= $left);
            if ($band !== null && ($b->last_warned_days === null || $band < (int) $b->last_warned_days)) {
                $due[] = ['batch' => $b, 'band' => $band, 'days' => $left];
            }
        }

        $made = 0;
        $roles = $this->policy->global()['notify_roles'];
        if ($roles) {
            $made += $this->notify($roles, collect($due)->pluck('batch'), 'stock_expiring', fn ($n) => "{$n} " . ($n === 1 ? 'batch expires' : 'batches expire') . ' soon', fn ($b) => 'expires ' . $b->expiry_date->format('d M Y'));
            $made += $this->notify($roles, $expiredToday, 'stock_expired', fn ($n) => "{$n} " . ($n === 1 ? 'batch has' : 'batches have') . ' expired', fn ($b) => 'expired ' . $b->expiry_date->format('d M Y'));
        }
        foreach ($due as $d) {
            $d['batch']->forceFill(['last_warned_days' => $d['band']])->saveQuietly();   // each band warns once, even if nobody could be told
        }

        return $made;
    }

    /** One notification per person, listing the batches at the branches they cover. */
    private function notify(array $roles, Collection $batches, string $type, \Closure $title, \Closure $when): int
    {
        if ($batches->isEmpty()) {
            return 0;
        }
        $rows = DB::table('stock_batch_balances')->whereIn('batch_id', $batches->pluck('id'))->where('quantity', '>', 0)->get(['batch_id', 'location_id', 'quantity']);
        $locNames = DB::table('locations')->pluck('name', 'id');
        $byBatch = $batches->keyBy('id');
        $made = 0;

        foreach (User::whereIn('role', $roles)->get() as $user) {
            $cleared = DB::table('location_user')->where('user_id', $user->id)->pluck('location_id')->map(fn ($x) => (int) $x)->all();
            $mine = $rows->filter(fn ($r) => ! $cleared || in_array((int) $r->location_id, $cleared, true));   // no branch clearance = every branch
            if ($mine->isEmpty()) {
                continue;
            }
            $lines = $mine->map(function ($r) use ($byBatch, $locNames, $when) {
                $b = $byBatch[$r->batch_id];

                return ($b->variant?->product?->name ?? 'Product') . ($b->batch_no ? ", batch {$b->batch_no}" : '') . ' — ' . $when($b) . ', ' . round((float) $r->quantity, 4) . ' at ' . ($locNames[$r->location_id] ?? 'a branch');
            })->values();
            $shown = $lines->take(5)->implode("\n") . ($lines->count() > 5 ? "\nand " . ($lines->count() - 5) . ' more.' : '');
            Notification::createFor($user, $type, $title($mine->pluck('batch_id')->unique()->count()), $shown, '/admin/stock/expiry', 'Open the expiry list',
                ['batches' => $mine->pluck('batch_id')->unique()->values()->all()], ['database'], $type === 'stock_expired' ? 'high' : 'normal');
            $made++;
        }

        return $made;
    }

    private function held(int $batchId): float
    {
        return (float) DB::table('stock_batch_balances')->where('batch_id', $batchId)->sum('quantity');
    }
}
