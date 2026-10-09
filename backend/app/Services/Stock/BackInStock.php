<?php

namespace App\Services\Stock;

use App\Models\Customer;
use App\Models\Hamper;
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
        $check = fn () => Schema::hasTable('stock_watches') && Schema::hasTable('stock_watch_runs');

        return app()->runningUnitTests() ? $check() : ($ready ??= $check());   // (tests build their own tables, so they must not be told yesterday's answer)
    }

    /** Has script 113 been run (alerts for hampers)? */
    public static function hampersReady(): bool
    {
        static $ready;
        $check = fn () => self::ready() && Schema::hasColumn('stock_watches', 'hamper_id') && Schema::hasColumn('stock_watch_runs', 'hamper_id');

        return app()->runningUnitTests() ? $check() : ($ready ??= $check());
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
     * Ask for a product (an option of it) or a hamper. A product with several options needs to be told which: the exception then lists the ones that are out.
     *
     * @param  array{product_id?: ?int, variant_id?: ?int, hamper_id?: ?int, email?: ?string, name?: ?string}  $in
     * @return array{watch: StockWatch, already: bool, option: ?string}
     */
    public function watch(array $in, ?User $user): array
    {
        if (! $this->enabled()) {
            throw new BackInStockException('Stock alerts are not available right now.');
        }
        $hamper = null;
        $variant = null;
        $option = null;
        if (! empty($in['hamper_id'])) {
            if (! self::hampersReady()) {
                throw new BackInStockException('Stock alerts for hampers are not set up yet.');
            }
            $hamper = Hamper::find((int) $in['hamper_id']);
            if (! $hamper || $hamper->status !== 'active' || ! $hamper->is_visible) {
                throw new BackInStockException('That hamper is not available.');
            }
            if ($this->hamperSets($hamper) >= 1) {
                throw new BackInStockException('It is in stock now: you can order it.');
            }
        } else {
            $product = Product::find((int) ($in['product_id'] ?? 0)) ?? throw new BackInStockException('That product was not found.');
            $variant = $this->resolveVariant($product, ! empty($in['variant_id']) ? (int) $in['variant_id'] : null);
            $option = $product->productVariants()->count() > 1 ? $variant->name : null;
        }
        $customer = $user?->customer;
        $email = Str::lower(trim((string) ($in['email'] ?? $customer?->email ?? $user?->email ?? '')));
        if (! filter_var($email, FILTER_VALIDATE_EMAIL)) {
            throw new BackInStockException('Enter a valid email address.');
        }

        $same = fn ($q) => $hamper ? $q->where('hamper_id', $hamper->id) : $q->where('variant_id', $variant->id);   // (product requests have variant_id > 0, hamper requests 0)
        $existing = $same(StockWatch::where('email', $email)->where('status', StockWatch::WAITING))->first();
        if ($existing) {
            return ['watch' => $existing, 'already' => true, 'option' => $option];
        }
        if (StockWatch::where('email', $email)->where('status', StockWatch::WAITING)->count() >= self::MAX_WAITING_PER_EMAIL) {
            throw new BackInStockException('That email is already waiting for ' . self::MAX_WAITING_PER_EMAIL . ' items. Stop some of those alerts first.');
        }
        $name = trim((string) ($in['name'] ?? '')) ?: ($customer ? trim($customer->first_name . ' ' . $customer->last_name) : '');
        $watch = StockWatch::create(['product_id' => $variant?->product_id ?? 0, 'variant_id' => $variant?->id ?? 0, 'customer_id' => $customer?->id, 'email' => $email,
            'name' => $name !== '' ? Str::limit($name, 120, '') : null, 'token' => Str::random(40), 'status' => StockWatch::WAITING]
            + (self::hampersReady() ? ['hamper_id' => $hamper?->id] : []));

        return ['watch' => $watch, 'already' => false, 'option' => $option];
    }

    /** The option asked for, or (none named) the only one that is out of stock; when several are, the person is asked which. */
    private function resolveVariant(Product $product, ?int $variantId): ProductVariant
    {
        $all = $product->productVariants()->get();
        if ($variantId) {
            $v = $all->firstWhere('id', $variantId) ?? throw new BackInStockException('That option was not found.');
        } else {
            $out = $all->filter(fn ($v) => $this->buyable($v) <= 0)->values();
            if ($all->isEmpty()) {
                $v = ($id = $this->stock->defaultVariantId($product->id)) ? ProductVariant::find($id) : null;
                $v ?? throw new BackInStockException('That option was not found.');
            } elseif ($out->isEmpty()) {
                throw new BackInStockException('It is in stock now: you can order it.');
            } elseif ($out->count() > 1) {
                throw new BackInStockException('Which option do you want to be told about?', $out->map(fn ($o) => ['id' => (int) $o->id, 'name' => (string) ($o->name ?: $product->name)])->all());
            } else {
                $v = $out->first();
            }
        }
        if ($this->buyable($v) > 0) {
            throw new BackInStockException('It is in stock now: you can order it.');
        }

        return $v;
    }

    /** The link in the email: stop these alerts. Returns what it was for, or null when the link is not known. */
    public function stop(string $token): ?array
    {
        $w = strlen($token) === 40 ? StockWatch::with(['product:id,name', 'hamper:id,name'])->where('token', $token)->first() : null;
        if (! $w) {
            return null;
        }
        if (in_array($w->status, [StockWatch::WAITING, StockWatch::NOTIFIED], true)) {
            $w->forceFill(['status' => StockWatch::STOPPED, 'stopped_at' => now()])->save();
        }

        return ['product' => $w->hamper?->name ?? $w->product?->name, 'status' => $w->status];
    }

    public function peek(string $token): ?array
    {
        $w = strlen($token) === 40 ? StockWatch::with(['product:id,name', 'hamper:id,name'])->where('token', $token)->first() : null;

        return $w ? ['product' => $w->hamper?->name ?? $w->product?->name, 'status' => $w->status] : null;
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

        return $this->tellWaiting('variant_id', $variantId, $this->buyable($variant), $mode, $by, fn (StockWatch $w) => $this->message($w, $variant->product?->name ?? 'Your item', $this->optionOf($variant), '/products/' . $w->product_id . '?variant=' . $w->variant_id));
    }

    /** The same for a hamper: how many hampers can be made up now, from what its parts have at its branch. */
    public function tellHamper(int $hamperId, string $mode, ?User $by): array
    {
        $hamper = Hamper::findOrFail($hamperId);

        return $this->tellWaiting('hamper_id', $hamperId, (float) $this->hamperSets($hamper), $mode, $by, fn (StockWatch $w) => $this->message($w, $hamper->name, '', '/hampers/' . ($hamper->slug ?: $hamper->id)));   // (the shop finds a hamper by its slug)
    }

    private function tellWaiting(string $column, int $id, float $stock, string $mode, ?User $by, \Closure $send): array
    {
        $hold = (int) ($this->general()['back_in_stock_hold_hours'] ?? 24);

        $picked = DB::transaction(function () use ($column, $id, $mode, $stock, $hold) {
            $waiting = StockWatch::where($column, $id)->where('status', StockWatch::WAITING)->orderBy('id')->lockForUpdate()->get();
            if ($stock <= 0 || $waiting->isEmpty()) {
                return collect();
            }
            $pick = $waiting;
            if ($mode === 'stock') {
                $held = StockWatch::where($column, $id)->where('status', StockWatch::NOTIFIED)->where('notified_at', '>=', now()->subHours($hold))->count();
                $pick = $waiting->take(max(0, (int) floor($stock) - $held));
            }
            if ($pick->isNotEmpty()) {
                StockWatch::whereIn('id', $pick->pluck('id'))->update(['status' => StockWatch::NOTIFIED, 'notified_at' => now()]);   // marked before anything is sent: two runs at once can not tell the same person twice
            }

            return $pick->values();
        });

        $left = StockWatch::where($column, $id)->where('status', StockWatch::WAITING)->count();
        if ($picked->isNotEmpty() || $by) {
            StockWatchRun::create(['variant_id' => $column === 'variant_id' ? $id : 0, 'trigger_by' => $by ? 'staff' : 'auto', 'mode' => $mode, 'stock' => $stock, 'told' => $picked->count(), 'left_waiting' => $left, 'user_id' => $by?->id]
                + ($column === 'hamper_id' ? ['hamper_id' => $id] : []));
        }
        foreach ($picked as $w) {
            $send($w);
        }

        return ['told' => $picked->count(), 'left' => $left, 'stock' => $stock, 'mode' => $mode];
    }

    /** How many of a hamper can be made up now: the fewest of what each part allows at the hamper's branch (the shop's own rule: nothing promised to preorders counts). */
    public function hamperSets(Hamper $h): int
    {
        $preorders = app(\App\Services\Preorders\PreorderService::class);
        $needs = $preorders->hamperNeeds((int) $h->id);
        if (! $needs) {
            return 0;
        }
        $sets = PHP_INT_MAX;
        foreach ($needs as $vid => $q) {
            $variant = $h->location_id ? null : ProductVariant::find($vid);
            $have = $h->location_id ? $preorders->buyable((int) $vid, (int) $h->location_id) : ($variant ? $this->buyable($variant) : 0.0);
            $sets = min($sets, (int) floor(($have + 0.00005) / max($q, 0.0001)));
        }

        return max(0, $sets);
    }

    /** A part of some hamper went up in stock: tell the people waiting for any hamper that now can be made up. */
    public function restockedPart(int $variantId): void
    {
        if (! $this->enabled() || ! self::hampersReady()) {
            return;
        }
        $mode = $this->general()['back_in_stock_mode'] ?? 'stock';
        if (! in_array($mode, ['stock', 'all'], true)) {
            return;
        }
        $hamperIds = StockWatch::where('status', StockWatch::WAITING)->whereNotNull('hamper_id')->distinct()->pluck('hamper_id');
        foreach ($hamperIds as $hid) {
            if (array_key_exists($variantId, app(\App\Services\Preorders\PreorderService::class)->hamperNeeds((int) $hid))) {
                $this->tellHamper((int) $hid, $mode, null);
            }
        }
    }

    private function optionOf(ProductVariant $v): string
    {
        return $v->product && $v->product->productVariants()->count() > 1 && $v->name ? " ({$v->name})" : '';
    }

    private function message(StockWatch $w, string $name, string $option, string $path): void
    {
        $stop = rtrim((string) config('app.frontend_url'), '/') . '/stock-alerts/stop/' . $w->token;
        $title = "{$name}{$option} is back in stock";
        $who = trim(explode(' ', (string) $w->name)[0] ?? '');
        $body = 'Good news' . ($who !== '' ? ", {$who}" : '') . ": {$name}{$option} is back in stock.\n\nStock is shared first come, first served, and this message does not hold one for you, so order soon."
            . "\n\nDon't want these alerts any more? {$stop}";
        $o = ['action_url' => $path, 'action_text' => 'Order now'];
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

    /** What people are waiting for (products and hampers): how many wait, how many were told lately, what can be bought now, and the last time they were told. */
    public function overview(): array
    {
        $hampers = self::hampersReady();
        $col = $hampers ? ', hamper_id' : '';
        $rows = StockWatch::query()->select(DB::raw('variant_id, product_id' . ($hampers ? ', hamper_id' : '')), DB::raw("SUM(CASE WHEN status = 'waiting' THEN 1 ELSE 0 END) AS waiting"), DB::raw("SUM(CASE WHEN status = 'notified' THEN 1 ELSE 0 END) AS told"))
            ->groupBy(DB::raw('variant_id, product_id' . $col))->havingRaw("SUM(CASE WHEN status = 'waiting' THEN 1 ELSE 0 END) > 0")->orderByDesc('waiting')->limit(200)->get();
        $variants = ProductVariant::with('product:id,name')->whereIn('id', $rows->pluck('variant_id')->filter())->get()->keyBy('id');
        $hamperModels = $hampers ? Hamper::whereIn('id', $rows->pluck('hamper_id')->filter())->get()->keyBy('id') : collect();
        $runs = StockWatchRun::orderByDesc('id')->limit(500)->get();

        return $rows->map(function ($r) use ($variants, $hamperModels, $runs, $hampers) {
            $hid = $hampers ? (int) ($r->hamper_id ?? 0) : 0;
            $last = $hid ? $runs->first(fn ($x) => (int) ($x->hamper_id ?? 0) === $hid) : $runs->first(fn ($x) => (int) $x->variant_id === (int) $r->variant_id && (int) $r->variant_id > 0);
            $v = $variants->get($r->variant_id);
            $h = $hamperModels->get($hid);

            return ['kind' => $hid ? 'hamper' : 'product', 'variant_id' => (int) $r->variant_id, 'hamper_id' => $hid ?: null, 'product_id' => (int) $r->product_id,
                'product' => $hid ? ($h?->name ?? 'Removed hamper') : ($v?->product?->name ?? 'Removed product'), 'option' => $hid ? null : $v?->name,
                'waiting' => (int) $r->waiting, 'told' => (int) $r->told, 'stock' => $hid ? ($h ? (float) $this->hamperSets($h) : 0.0) : ($v ? $this->buyable($v) : 0.0),
                'last_run' => $last ? ['at' => $last->created_at?->toIso8601String(), 'told' => (int) $last->told, 'mode' => $last->mode, 'by' => $last->trigger_by] : null];
        })->values()->all();
    }

    /** The record of who was told, newest first. */
    public function runs(int $limit = 100): array
    {
        $runs = StockWatchRun::orderByDesc('id')->limit($limit)->get();
        $variants = ProductVariant::with('product:id,name')->whereIn('id', $runs->pluck('variant_id')->filter())->get()->keyBy('id');
        $hampers = self::hampersReady() ? Hamper::whereIn('id', $runs->pluck('hamper_id')->filter())->pluck('name', 'id') : collect();
        $users = User::whereIn('id', $runs->pluck('user_id')->filter())->pluck('name', 'id');

        return $runs->map(function ($r) use ($variants, $hampers, $users) {
            $hid = (int) ($r->hamper_id ?? 0);

            return ['id' => $r->id, 'at' => $r->created_at?->toIso8601String(),
                'product' => $hid ? ($hampers[$hid] ?? 'Removed hamper') : ($variants->get($r->variant_id)?->product?->name ?? 'Removed product'), 'option' => $hid ? null : $variants->get($r->variant_id)?->name,
                'by' => $r->user_id ? ($users[$r->user_id] ?? 'Staff') : 'Automatic', 'mode' => $r->mode, 'stock' => $r->stock, 'told' => (int) $r->told, 'left_waiting' => (int) $r->left_waiting];
        })->all();
    }

    /** Daily: requests nobody acted on for a year are let go. */
    public function expireOld(): int
    {
        return self::ready() ? StockWatch::where('status', StockWatch::WAITING)->where('created_at', '<', now()->subDays(self::EXPIRES_AFTER_DAYS))->update(['status' => StockWatch::EXPIRED]) : 0;
    }
}
