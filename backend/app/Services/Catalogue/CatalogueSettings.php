<?php

namespace App\Services\Catalogue;

use App\Models\User;
use App\Services\Books\BooksException;
use Illuminate\Support\Facades\DB;

/**
 * The shop-wide choices for price lists and brochures (catalogue_settings, one row): the most price lists kept, the starting earlier-price rule,
 * whether customers may download a one-item brochure and see the catalogues link, and the sections and theme each item type starts with.
 * Until script 93 is run the built-in values are used.
 */
class CatalogueSettings
{
    public const EARLIER = ['discounts', 'both', 'never'];
    public const DEFAULTS = ['max_price_lists' => 10, 'earlier_price' => 'discounts', 'customer_item_brochure' => true, 'customer_catalogue_link' => true];

    private static ?array $memo = null;

    public static function flush(): void
    {
        self::$memo = null;
    }

    public function get(): array
    {
        if (self::$memo !== null) {
            return self::$memo;
        }
        try {
            $r = DB::table('catalogue_settings')->first();
        } catch (\Throwable) {
            $r = null;
        }
        $defaults = $r && $r->brochure_defaults ? (json_decode($r->brochure_defaults, true) ?: []) : [];

        return self::$memo = [
            'max_price_lists' => $r ? max(1, min(1000, (int) $r->max_price_lists)) : self::DEFAULTS['max_price_lists'],
            'earlier_price' => $r && in_array($r->earlier_price, self::EARLIER, true) ? $r->earlier_price : self::DEFAULTS['earlier_price'],
            'customer_item_brochure' => $r ? (bool) $r->customer_item_brochure : true,
            'customer_catalogue_link' => $r ? (bool) $r->customer_catalogue_link : true,
            'brochure_defaults' => BrochureSections::cleanDefaults($defaults),
        ];
    }

    public function update(array $d, User $by): array
    {
        $cur = $this->get();
        $row = [
            'max_price_lists' => max(1, min(1000, (int) ($d['max_price_lists'] ?? $cur['max_price_lists']))),
            'earlier_price' => in_array($d['earlier_price'] ?? null, self::EARLIER, true) ? $d['earlier_price'] : $cur['earlier_price'],
            'customer_item_brochure' => (bool) ($d['customer_item_brochure'] ?? $cur['customer_item_brochure']),
            'customer_catalogue_link' => (bool) ($d['customer_catalogue_link'] ?? $cur['customer_catalogue_link']),
            'brochure_defaults' => json_encode(BrochureSections::cleanDefaults($d['brochure_defaults'] ?? $cur['brochure_defaults'])),
            'updated_by' => $by->id, 'updated_at' => now(),
        ];
        try {
            if (DB::table('catalogue_settings')->exists()) {
                DB::table('catalogue_settings')->update($row);
            } else {
                DB::table('catalogue_settings')->insert($row + ['created_at' => now()]);
            }
        } catch (\Throwable) {
            throw new BooksException('The settings table is not set up yet. Run script 93 first.');
        }
        self::flush();

        return $this->get();
    }
}
