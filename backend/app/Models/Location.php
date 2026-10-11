<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Facades\Schema;

/**
 * A branch / physical location (Core, multi-location).
 *
 * A single-branch business has exactly one row ("Main") and never sees the
 * location UI. A branch carries its own currency and tax district, which is
 * what lets price and tax resolve per branch (see PriceResolver). Stock is NOT
 * here — it lives in the Inventory (Extras) tier, keyed by location_id.
 */
class Location extends Model
{
    protected $table = 'locations';

    protected $fillable = [
        'name', 'code', 'cost_centre_id', 'currency_id', 'tax_district_id',
        'phone', 'email',
        'address_line1', 'address_line2', 'city', 'state', 'country', 'postal_code',
        'latitude', 'longitude', 'timezone', 'opening_hours',
        'price_display_default', 'accepts_pickup', 'accepts_delivery', 'delivery_zone',
        'is_default', 'is_active', 'sort_order',
        'kind', 'sells_to_customers', 'fulfils_orders', 'receives_purchases', 'produces',
    ];

    protected $casts = [
        'opening_hours'    => 'array',
        'delivery_zone'    => 'array',
        'latitude'         => 'decimal:7',
        'longitude'        => 'decimal:7',
        'accepts_pickup'   => 'boolean',
        'accepts_delivery' => 'boolean',
        'is_default'       => 'boolean',
        'is_active'        => 'boolean',
        'sort_order'       => 'integer',
        'sells_to_customers' => 'boolean',
        'fulfils_orders'     => 'boolean',
        'receives_purchases' => 'boolean',
        'produces'           => 'boolean',
    ];

    /** The longest a kind can be (the column is VARCHAR(20)). */
    public const KIND_MAX = 20;

    /** What a location may do: customers can buy from it, delivery notes can come from it, goods can be received into it, production can run in it. */
    public const CAPABILITIES = ['sells_to_customers', 'fulfils_orders', 'receives_purchases', 'produces'];

    /**
     * What the form offers as clickable suggestions for the free-text "What is it?" box: code => label, the module that makes it worth suggesting (null = always),
     * and the capabilities it starts with. A kind is only a label the owner types; it fills in these four switches, which are what the app actually checks.
     * Anything typed that is not here is allowed and starts with the "other" switches.
     */
    public const KIND_SUGGESTIONS = [
        'shop'       => ['label' => 'Shop',        'module' => null,             'defaults' => ['sells_to_customers' => true,  'fulfils_orders' => true,  'receives_purchases' => true,  'produces' => false]],
        'warehouse'  => ['label' => 'Warehouse',   'module' => null,             'defaults' => ['sells_to_customers' => false, 'fulfils_orders' => true,  'receives_purchases' => true,  'produces' => false]],
        'depot'      => ['label' => 'Depot',       'module' => null,             'defaults' => ['sells_to_customers' => false, 'fulfils_orders' => true,  'receives_purchases' => true,  'produces' => false]],
        'office'     => ['label' => 'Office',      'module' => null,             'defaults' => ['sells_to_customers' => false, 'fulfils_orders' => false, 'receives_purchases' => false, 'produces' => false]],
        'factory'    => ['label' => 'Factory',     'module' => null,             'defaults' => ['sells_to_customers' => false, 'fulfils_orders' => false, 'receives_purchases' => true,  'produces' => true]],
        'other'      => ['label' => 'Other',       'module' => null,             'defaults' => ['sells_to_customers' => false, 'fulfils_orders' => false, 'receives_purchases' => true,  'produces' => false]],
        'restaurant' => ['label' => 'Restaurant',  'module' => 'menus',          'defaults' => ['sells_to_customers' => true,  'fulfils_orders' => true,  'receives_purchases' => true,  'produces' => true]],
        'cafe'       => ['label' => 'Cafe',        'module' => 'menus',          'defaults' => ['sells_to_customers' => true,  'fulfils_orders' => true,  'receives_purchases' => true,  'produces' => true]],
        'bakery'     => ['label' => 'Bakery',      'module' => 'menus',          'defaults' => ['sells_to_customers' => true,  'fulfils_orders' => true,  'receives_purchases' => true,  'produces' => true]],
        'bar'        => ['label' => 'Bar',         'module' => 'menus',          'defaults' => ['sells_to_customers' => true,  'fulfils_orders' => false, 'receives_purchases' => true,  'produces' => false]],
        'kitchen'    => ['label' => 'Central kitchen', 'module' => 'menus',      'defaults' => ['sells_to_customers' => false, 'fulfils_orders' => true,  'receives_purchases' => true,  'produces' => true]],
        'food truck' => ['label' => 'Food truck',  'module' => 'menus',          'defaults' => ['sells_to_customers' => true,  'fulfils_orders' => false, 'receives_purchases' => true,  'produces' => true]],
        'venue'      => ['label' => 'Venue',       'module' => 'events',         'defaults' => ['sells_to_customers' => false, 'fulfils_orders' => false, 'receives_purchases' => false, 'produces' => false]],
        'property'   => ['label' => 'Property',    'module' => 'accommodations', 'defaults' => ['sells_to_customers' => false, 'fulfils_orders' => false, 'receives_purchases' => true,  'produces' => false]],
    ];

    /** Tidy what was typed: no stray spaces, one space between words. */
    public static function cleanKind(?string $kind): string
    {
        return trim((string) preg_replace('/\s+/', ' ', (string) $kind));
    }

    /** The four switches a kind starts with (the match ignores capital letters). */
    public static function defaultsFor(?string $kind): array
    {
        $key = mb_strtolower(self::cleanKind($kind));

        return (self::KIND_SUGGESTIONS[$key] ?? self::KIND_SUGGESTIONS['other'])['defaults'];
    }

    /**
     * The suggestions to show now: the always-on ones, plus those of modules that are licensed and switched on.
     *
     * @param callable(string): bool $moduleIsActive
     * @return array<int, array{kind: string, label: string, module: ?string, defaults: array<string, bool>}>
     */
    public static function suggestions(callable $moduleIsActive): array
    {
        $out = [];
        foreach (self::KIND_SUGGESTIONS as $kind => $s) {
            if ($s['module'] === null || $moduleIsActive($s['module'])) {
                $out[] = ['kind' => $kind, 'label' => $s['label'], 'module' => $s['module'], 'defaults' => $s['defaults']];
            }
        }

        return $out;
    }

    /**
     * Has the capabilities script (97) been run? Until it has, every location counts as a shop that does everything but produce,
     * so nothing that asks a question here can break an installation that has the new code but not yet the new columns.
     */
    public static function hasCapabilities(): bool
    {
        return self::$hasCapabilities ??= Schema::hasColumn('locations', 'sells_to_customers');
    }

    private static ?bool $hasCapabilities = null;

    /** Ask the database again (after the script was run; and between tests). */
    public static function forgetCapabilities(): void
    {
        self::$hasCapabilities = null;
    }

    // ── Relationships ───────────────────────────────────────────────────────

    public function currency(): BelongsTo
    {
        return $this->belongsTo(Currency::class);
    }

    public function taxDistrict(): BelongsTo
    {
        return $this->belongsTo(TaxDistrict::class, 'tax_district_id');
    }

    /** Staff assigned to (cleared for) this branch. */
    public function staff(): BelongsToMany
    {
        return $this->belongsToMany(User::class, 'location_user')
            ->withPivot('role_scope')
            ->withTimestamps();
    }

    public function offerings(): HasMany
    {
        return $this->hasMany(LocationOffering::class);
    }

    public function priceOverrides(): HasMany
    {
        return $this->hasMany(LocationPrice::class);
    }

    // ── Scopes ──────────────────────────────────────────────────────────────

    public function scopeActive(Builder $q): Builder
    {
        return $q->where('is_active', true);
    }

    /** Branches customers may pick and buy from: active and marked "sells to customers". */
    public function scopeSellsToCustomers(Builder $q): Builder
    {
        $q->where('is_active', true);

        return self::hasCapabilities() ? $q->where('sells_to_customers', true) : $q;
    }

    /** Branches delivery notes may be made from. */
    public function scopeFulfilsOrders(Builder $q): Builder
    {
        return self::hasCapabilities() ? $q->where('fulfils_orders', true) : $q;
    }

    /** Branches goods may be received into. */
    public function scopeReceivesPurchases(Builder $q): Builder
    {
        return self::hasCapabilities() ? $q->where('receives_purchases', true) : $q;
    }

    /** Branches production can run in. Before the script is run nothing is marked, so none are. */
    public function scopeProduces(Builder $q): Builder
    {
        return self::hasCapabilities() ? $q->where('produces', true) : $q->whereRaw('1 = 0');
    }

    public function scopeOrdered(Builder $q): Builder
    {
        return $q->orderBy('sort_order')->orderBy('name');
    }

    public function costCentre()
    {
        return $this->belongsTo(CostCentre::class, 'cost_centre_id');
    }

    // ── Helpers ─────────────────────────────────────────────────────────────

    /** The default branch (or the first active one, or any). */
    public static function default(): ?self
    {
        return static::query()->where('is_default', true)->first()
            ?? static::query()->active()->ordered()->first()
            ?? static::query()->ordered()->first();
    }

    /** The branch customers land on: the default one if customers can buy from it, else the first one that sells to them. */
    public static function defaultSelling(): ?self
    {
        return static::query()->sellsToCustomers()->where('is_default', true)->first()
            ?? static::query()->sellsToCustomers()->ordered()->first();
    }

    /** True once the business runs more than one branch (drives the UI). */
    public static function isMultiBranch(): bool
    {
        return static::query()->count() > 1;
    }
}
