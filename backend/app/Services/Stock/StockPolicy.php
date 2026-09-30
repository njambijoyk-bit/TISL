<?php

namespace App\Services\Stock;

use App\Models\Category;
use App\Models\Product;
use App\Models\StockSetting;
use App\Models\StockSettingOverride;
use Throwable;

/**
 * The stock & expiry rules as the code reads them.
 *
 * Shop-wide rules live in stock_settings; a category or a product can override some of them
 * (stock_setting_overrides). A product's own exception beats its category's, a category's beats
 * its parent category's, and anything not overridden falls back to the shop-wide rule.
 *
 * If the tables are not there yet (the SQL script has not been run) every read returns the
 * built-in defaults, so nothing that asks a question here can break an installation.
 */
class StockPolicy
{
    /** Built-in defaults, also what a new installation starts with. */
    public const DEFAULTS = [
        'expired_on_storefront' => 'hide',        // hide | unavailable
        'show_expiry_badge'     => true,
        'sell_expired'          => 'never',       // never | override | allowed
        'override_roles'        => ['manager', 'admin', 'super_admin'],
        'min_days_online'       => 0,
        'min_days_till'         => 0,
        'expiry_action'         => 'list',        // list | write_off
        'write_off_after_days'  => 30,
        'warning_days'          => [90, 60, 30],
        'notify_roles'          => ['manager', 'admin'],
        'pick_order'            => 'fefo',        // fefo | fifo
    ];

    /** What a category or a product may override. The rest is shop-wide only. */
    public const OVERRIDABLE = ['sell_expired', 'min_days_online', 'min_days_till', 'expiry_action', 'warning_days', 'show_expiry_badge'];

    private ?array $global = null;
    private array $overrides = [];

    /** The shop-wide rules, with defaults filled in for anything missing. */
    public function global(): array
    {
        if ($this->global !== null) {
            return $this->global;
        }
        try {
            $row = StockSetting::find(1);
            $vals = $row ? array_intersect_key($row->attributesToArray(), self::DEFAULTS) : [];
        } catch (Throwable $e) {
            $vals = [];
        }
        // null (an empty JSON column) means "not chosen": use the default
        return $this->global = array_replace(self::DEFAULTS, array_filter($vals, fn ($v) => $v !== null));
    }

    /** The rules that apply to one product: shop-wide, then its category chain (far to near), then the product's own. */
    public function forProduct(int|Product|null $product): array
    {
        $rules = $this->global();
        if ($product === null) {
            return $rules;
        }
        try {
            $p = $product instanceof Product ? $product : Product::withTrashed()->find($product);
            if (! $p) {
                return $rules;
            }
            $chain = [];
            $cat = $p->category_id;
            for ($i = 0; $cat && $i < 10; $i++) {
                array_unshift($chain, ['category', (int) $cat]);
                $cat = Category::whereKey($cat)->value('parent_id');
            }
            $chain[] = ['product', (int) $p->id];
        } catch (Throwable $e) {
            return $rules;
        }

        foreach ($chain as [$scope, $id]) {
            $over = $this->override($scope, $id);
            if ($over) {
                $rules = array_replace($rules, array_intersect_key($over, array_flip(self::OVERRIDABLE)));
            }
        }

        return $rules;
    }

    /** The order stock is taken in: 'fefo' (first expiring, then oldest) or 'fifo' (oldest). */
    public function pickOrder(): string
    {
        return $this->global()['pick_order'] === 'fifo' ? 'fifo' : 'fefo';
    }

    /** Forget what was read (after settings change, and in tests). */
    public function flush(): void
    {
        $this->global = null;
        $this->overrides = [];
    }

    private function override(string $scope, int $id): ?array
    {
        $key = "$scope:$id";
        if (! array_key_exists($key, $this->overrides)) {
            try {
                $row = StockSettingOverride::where('scope', $scope)->where('scope_id', $id)->first();
                $vals = $row?->settings;
            } catch (Throwable $e) {
                $vals = null;
            }
            $this->overrides[$key] = is_array($vals) ? array_filter($vals, fn ($v) => $v !== null) : null;
        }

        return $this->overrides[$key];
    }
}
