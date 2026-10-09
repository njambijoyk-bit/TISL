<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/** Something a campaign features, by reference (a product, service, hamper or auction). Names, prices and stock are always read live, never copied. */
class CampaignItem extends Model
{
    public const TYPES = ['product', 'service', 'hamper', 'auction'];

    protected $fillable = ['campaign_id', 'section_id', 'item_type', 'item_id', 'variant_id', 'position', 'available_from', 'label_override'];

    protected $casts = ['available_from' => 'datetime', 'variant_id' => 'integer'];

    /** Has script 106 been run? Until then an item can only be a whole product, exactly as before. */
    public static function hasVariants(): bool
    {
        static $has;
        try {
            return $has ??= \Illuminate\Support\Facades\Schema::hasColumn('campaign_items', 'variant_id');
        } catch (\Throwable) {
            return false;
        }
    }

    /** The key an item is known by everywhere: "product:12" for the whole product, "product:12:v34" for one of its options. */
    public static function keyOf(string $type, int $id, int $variantId = 0): string
    {
        return $variantId > 0 ? "{$type}:{$id}:v{$variantId}" : "{$type}:{$id}";
    }

    /** @return array{item_type:string,item_id:int,variant_id:int} what the catalogue adapter needs to describe it */
    public function ref(): array
    {
        return ['item_type' => $this->item_type, 'item_id' => (int) $this->item_id, 'variant_id' => (int) ($this->variant_id ?? 0)];
    }

    /** Dates go out in the site's own time with its offset (2026-10-18T09:00:00+03:00), so what staff typed is what they see again and a browser reads it correctly. */
    protected function serializeDate(\DateTimeInterface $date): string
    {
        return \Carbon\Carbon::instance($date)->setTimezone(config('app.timezone'))->format('Y-m-d\TH:i:sP');
    }
}
