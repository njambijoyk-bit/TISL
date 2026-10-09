<?php

namespace App\Services\Stock;

use App\Models\Customer;
use App\Models\Product;
use App\Models\ProductVariant;
use App\Models\StockWatch;
use App\Models\StockWatchRun;
use App\Models\User;
use App\Services\Location\VariantStockService;
use App\Services\Notify\Notifier;
use App\Services\Notify\NotifySettings;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;

/**
 * "Tell me when it is back". Anyone with an email address can ask on an out-of-stock product (signed in or not); when it can be bought again they are told, by the
 * same channels and with the same preferences as every other message (the Notifier). Who is told, set by the company (Settings → Notifications → General) and
 * overridable by staff for one product at a time:
 *   stock  as many people as there is stock for, first come first served (the people told in the last few hours count as holding stock, so a stray return does not
 *          tell another batch while the first is still deciding)
 *   all    everyone waiting
 * Telling is never a reservation. Each request is told once. See docs/BACK_IN_STOCK_PLAN.md.
 */
class BackInStock
{
    public const MAX_WAITING_PER_EMAIL = 20;

    /** A request nobody has acted on for this long is let go. */
    public const EXPIRES_AFTER_DAYS = 365;

    public function __construct(private Notifier $notifier, private NotifySettings $settings, private VariantStockService $stock)
    {
    }

    /** Has script 112 been run? */
    public static function ready(): bool
    {
        static $ready;

        return $ready ??= Schema::hasTable('stock_watches') && Schema::hasTable('stock_watch_runs');
    }

    private function general(): array
    {
        return NotifySettings::ready() ? $this->settings->get('general') : NotifySettings::DEFAULTS['general'];
    }

    public function enabled(): bool
    {
        return self::ready() && (bool) ($this->general()['back_in_stock_enabled'] ?? true);
    }

    /** What customers can buy of a variant right now (selling branches, minus what is promised to preorders). */
    public function buyable(ProductVariant $v): float
    {
        return (float) ($v->getAttribute('sellable_quantity') ?? $v->stock_quantity ?? 0);
    }

    // ------------------------------------------------------------ asking

    /**
     * @param  array{product_id: int, variant_id?: ?int, email?: ?string, name?: ?string}  $in
     * @return array{watch: StockWatch, already: bool}
     */
    public function watch(array $in, ?User $user): array
    {
        if (! $this->enabled()) {
            throw new BackInStockException('Stock alerts are not available right now.');
        }
        $product = Product::find((int) $in['product_id']) ?? throw new BackInStockException('That product was not found.');
        $variantId = ! empty($in['variant_id']) ? (int) $in['variant_id'] : $this->stock->defaultVariantId($product->id);
        $variant = $variantId ? ProductVariant::where('product_id', $product->id)->find($variantId) : null;
        if (! $variant) {
            throw new BackInStockException('That option was not found.');
        }
        if ($this->buyable($variant) > 0) {
            throw new BackInStockException('It is in stock now: you can order it.');
        }
        $customer = $user?->customer;
        $email = Str::lower(trim((string) ($in['email'] ?? $customer?->email ?? $user?->email ?? '')));
        if (! filter_var($email, FILTER_VALIDATE_EMAIL)) {
            throw new BackInStockException('Enter a valid email address.');
        }

        $existing = StockWatch::where('variant_id', $variant->id)->where('email', $email)->where('status', StockWatch::WAITING)->first();
        if ($existing) {
            return ['watch' => $existing, 'already' => true];
        }
        if (StockWatch::where('email', $email)->where('status', StockWatch::WAITING)->count() >= self::MAX_WAITING_PER_EMAIL) {
            throw new BackInStockException('That email is already waiting for ' . self::MAX_WAITING_PER_EMAIL . ' products. Stop some of those alerts first.');
        }
        $name = trim((string) ($in['name'] ?? '')) ?: ($customer ? trim($customer->first_name . ' ' . $customer->last_name) : '');
        $watch = StockWatch::create(['product_id' => $product->id, 'variant_id' => $variant->id, 'customer_id' => $customer?->id, 'email' => $email,
            'name' => $name !== '' ? Str::limit($name, 120, '') : null, 'token' => Str::random(40), 'status' => StockWatch::WAITING]);

        return ['watch' => $watch, 'already' => false];
    }

    /** The link in the email: stop these alerts. Returns what it was for, or null when the link is not known. */
    public function stop(string $token): ?array
    {
        $w = strlen($token) === 40 ? StockWatch::with('product:id,name')->where('token', $token)->first() : null;
        if (! $w) {
            return null;
        }
        if (in_array($w->status, [StockWatch::WAITING, StockWatch::NOTIFIED], true)) {
            $w->forceFill(['status' => StockWatch::STOPPED, 'stopped_at' => now()])->save();
        }

        return ['product' => $w->product?->name, 'status' => $w->status];
    }

    public function peek(string $token): ?array
    {
        $w = strlen($token) === 40 ? StockWatch::with('product:id,name')->where('token', $token)->first() : null;

        return $w ? ['product' => $w->product?->name, 'status' => $w->status] : null;
    }

    // ------------------------------------------------------------ telling

    /** Stock of a variant went up: tell the waiting people the way the company chose. Nothing happens when the company set it to "staff tell them". */
    public function restocked(int $variantId): ?array
    {
        if (! $this->enabled()) {
            return null;
        }
        $mode = $this->general()['back_in_stock_mode'] ?? 'stock';
        if (! in_array($mode, ['stock', 'all'], true)) {
            return null;
        }

        return $this->tell($variantId, $mode, null);
    }

    /**
     * @param  string  $mode  stock | all
     * @return array{told: int, left: int, stock: float, mode: string}
     */
    public function tell(int $variantId, string $mode, ?User $by): array
    {
        $variant = ProductVariant::with('product')->findOrFail($variantId);
        $stock = $this->buyable($variant);
        $hold = (int) ($this->general()['back_in_stock_hold_hours'] ?? 24);

        $picked = DB::transaction(function () use ($variantId, $mode, $stock, $hold) {
            $waiting = StockWatch::where('variant_id', $variantId)->where('status', StockWatch::WAITING)->orderBy('id')->lockForUpdate()->get();
            if ($stock <= 0 || $waiting->isEmpty()) {
                return collect();
            }
            $pick = $waiting;
            if ($mode === 'stock') {
                $held = StockWatch::where('variant_id', $variantId)->where('status', StockWatch::NOTIFIED)->where('notified_at', '>=', now()->subHours($hold))->count();
                $pick = $waiting->take(max(0, (int) floor($stock) - $held));
            }
            if ($pick->isNotEmpty()) {
                StockWatch::whereIn('id', $pick->pluck('id'))->update(['status' => StockWatch::NOTIFIED, 'notified_at' => now()]);   // marked before anything is sent: two runs at once can not tell the same person twice
            }

            return $pick->values();
        });

        $left = StockWatch::where('variant_id', $variantId)->where('status', StockWatch::WAITING)->count();
        if ($picked->isNotEmpty() || $by) {
            StockWatchRun::create(['variant_id' => $variantId, 'trigger_by' => $by ? 'staff' : 'auto', 'mode' => $mode, 'stock' => $stock, 'told' => $picked->count(), 'left_waiting' => $left, 'user_id' => $by?->id]);
        }
        foreach ($picked as $w) {
            $this->message($w, $variant);
        }

        return ['told' => $picked->count(), 'left' => $left, 'stock' => $stock, 'mode' => $mode];
    }

    private function message(StockWatch $w, ProductVariant $variant): void
    {
        $name = $variant->product?->name ?? 'Your item';
        $option = $variant->product && $variant->product->productVariants()->count() > 1 && $variant->name ? " ({$variant->name})" : '';
        $stop = rtrim((string) config('app.frontend_url'), '/') . '/stock-alerts/stop/' . $w->token;
        $title = "{$name}{$option} is back in stock";
        $who = trim(explode(' ', (string) $w->name)[0] ?? '');
        $body = 'Good news' . ($who !== '' ? ", {$who}" : '') . ": {$name}{$option} is back in stock.\n\nStock is shared first come, first served, and this message does not hold one for you, so order soon."
            . "\n\nDon't want these alerts any more? {$stop}";
        $o = ['action_url' => '/products/' . $w->product_id . '?variant=' . $w->variant_id, 'action_text' => 'Order now'];
        try {
            $customer = $w->customer_id ? Customer::find($w->customer_id) : null;
            if ($customer) {
                $this->notifier->send($customer, 'back_in_stock', $title, $body, $o);
            } else {
                $this->notifier->sendToContact(['name' => $w->name, 'email' => $w->email, 'phone' => null], 'back_in_stock', $title, $body, $o);
            }
        } catch (\Throwable $e) {
            report($e);   // the person stays "told": telling must never raise
        }
    }

    // ------------------------------------------------------------ for staff

    /** Products people are waiting for: how many wait, how many were told lately, what can be bought now, and the last time they were told. */
    public function overview(): array
    {
        $rows = StockWatch::query()->select('variant_id', 'product_id', DB::raw("SUM(CASE WHEN status = 'waiting' THEN 1 ELSE 0 END) AS waiting"), DB::raw("SUM(CASE WHEN status = 'notified' THEN 1 ELSE 0 END) AS told"))
            ->groupBy('variant_id', 'product_id')->havingRaw("SUM(CASE WHEN status = 'waiting' THEN 1 ELSE 0 END) > 0")->orderByDesc('waiting')->limit(200)->get();
        $variants = ProductVariant::with('product:id,name')->whereIn('id', $rows->pluck('variant_id'))->get()->keyBy('id');
        $runs = StockWatchRun::whereIn('variant_id', $rows->pluck('variant_id'))->orderByDesc('id')->get()->groupBy('variant_id');

        return $rows->map(function ($r) use ($variants, $runs) {
            $v = $variants->get($r->variant_id);
            $last = $runs->get($r->variant_id)?->first();

            return ['variant_id' => (int) $r->variant_id, 'product_id' => (int) $r->product_id, 'product' => $v?->product?->name ?? 'Removed product', 'option' => $v?->name,
                'waiting' => (int) $r->waiting, 'told' => (int) $r->told, 'stock' => $v ? $this->buyable($v) : 0.0,
                'last_run' => $last ? ['at' => $last->created_at?->toIso8601String(), 'told' => (int) $last->told, 'mode' => $last->mode, 'by' => $last->trigger_by] : null];
        })->values()->all();
    }

    /** The record of who was told, newest first. */
    public function runs(int $limit = 100): array
    {
        $runs = StockWatchRun::orderByDesc('id')->limit($limit)->get();
        $variants = ProductVariant::with('product:id,name')->whereIn('id', $runs->pluck('variant_id'))->get()->keyBy('id');
        $users = User::whereIn('id', $runs->pluck('user_id')->filter())->pluck('name', 'id');

        return $runs->map(fn ($r) => ['id' => $r->id, 'at' => $r->created_at?->toIso8601String(), 'product' => $variants->get($r->variant_id)?->product?->name ?? 'Removed product', 'option' => $variants->get($r->variant_id)?->name,
            'by' => $r->user_id ? ($users[$r->user_id] ?? 'Staff') : 'Automatic', 'mode' => $r->mode, 'stock' => $r->stock, 'told' => (int) $r->told, 'left_waiting' => (int) $r->left_waiting])->all();
    }

    /** Daily: requests nobody acted on for a year are let go. */
    public function expireOld(): int
    {
        return self::ready() ? StockWatch::where('status', StockWatch::WAITING)->where('created_at', '<', now()->subDays(self::EXPIRES_AFTER_DAYS))->update(['status' => StockWatch::EXPIRED]) : 0;
    }
}
