<?php

namespace App\Models\Menus;

use Illuminate\Database\Eloquent\Model;

/** A dish ordered, with its name, price and choices as they were when ordered. */
class MenuOrderLine extends Model
{
    protected $table = 'menus_order_lines';

    protected $guarded = [];

    /** Has script 203 been run: can a line keep the size and the sides it was ordered with? */
    public static function keepsSelection(): bool
    {
        return \Illuminate\Support\Facades\Schema::hasColumn('menus_order_lines', 'selection');
    }

    /**
     * The columns that keep the size and sides of a line ordered with a make-up (empty for a plain dish, and before script 203, when only a line with a make-up can not be kept).
     *
     * @param array<string, mixed> $l a priced line: serving_id, serving, selection
     * @return array{serving_id?: ?int, serving?: ?string, selection?: ?array}
     */
    public static function kept(array $l): array
    {
        if (empty($l['serving_id']) && empty($l['selection'])) {
            return [];
        }
        if (! self::keepsSelection()) {
            throw new \App\Services\Books\BooksException('Run database script 203_menus_order_lines_selection.sql first: until then an order can not keep the size and sides picked.');
        }

        return ['serving_id' => $l['serving_id'] ?? null, 'serving' => $l['serving'] ?? null, 'selection' => $l['selection'] ?? null];
    }

    /** The sides this line came with, as they are written on a ticket or a receipt: "Choma", "Egg x2". @return string[] */
    public function sidesList(): array
    {
        return array_values(array_map(fn ($s) => $s['side'].((int) ($s['qty'] ?? 1) > 1 ? ' x'.(int) $s['qty'] : ''), (array) ($this->selection ?? [])));
    }

    protected $casts = ['quantity' => 'decimal:2', 'base_price' => 'decimal:2', 'unit_price' => 'decimal:2', 'options' => 'array', 'uses' => 'array', 'linked' => 'array', 'selection' => 'array', 'round' => 'integer'];
}
