<?php

namespace App\Services\Codes\Items;

use App\Services\Codes\CodeException;
use App\Services\Codes\CodeFactory;
use App\Services\Codes\CodeSettings;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Makes the labels for the Codes page: for each chosen item, the lines to print (name, SKU, price, batch) and the picture of its code. The browser lays them out on the sheet and
 * prints; this is the one place the pictures are drawn, so a label always shows exactly what a scan will read. Every print is logged.
 */
final class LabelService
{
    public const MAX_LABELS = 2000;

    public function __construct(private CodeCatalogue $items)
    {
    }

    /**
     * @param  array<int, array{type: string, id: int, copies?: int}>  $items
     * @param  array{kind?: ?string, name?: bool, sku?: bool, price?: bool, code_text?: bool, batch?: bool, size?: ?string, template?: ?string}  $o
     * @return array{labels: array<int, array<string, mixed>>, skipped: array<int, array{type: string, id: int, label: ?string, reason: string}>, total: int}
     */
    public function build(array $items, array $o, ?int $by): array
    {
        $defaults = CodeSettings::all();
        $show = ['name' => $o['name'] ?? $defaults['label']['name'], 'sku' => $o['sku'] ?? $defaults['label']['sku'], 'price' => $o['price'] ?? $defaults['label']['price'],
            'code_text' => $o['code_text'] ?? $defaults['label']['code_text'], 'batch' => $o['batch'] ?? $defaults['label']['batch']];
        $labels = [];
        $skipped = [];
        $total = 0;
        foreach ($items as $it) {
            $copies = max(1, min(500, (int) ($it['copies'] ?? 1)));
            $item = $this->items->find($it['type'], (int) $it['id']);
            if (! $item) {
                $skipped[] = ['type' => $it['type'], 'id' => (int) $it['id'], 'label' => null, 'reason' => 'Not found.'];

                continue;
            }
            if ($item['code'] === null) {
                $skipped[] = ['type' => $it['type'], 'id' => (int) $it['id'], 'label' => $item['label'], 'reason' => 'It has no code yet: give it one first.'];

                continue;
            }
            $total += $copies;
            if ($total > self::MAX_LABELS) {
                throw new CodeException('That is more than ' . self::MAX_LABELS . ' labels at once. Print them in smaller lots.');
            }
            try {
                $kind = $this->kind($it['type'], $item['code'], $o['kind'] ?? null, $defaults);
                $svg = CodeFactory::make($kind, $item['code'], ['text' => $show['code_text'], 'level' => 'M'])->svg(['unit' => 2, 'height' => 60, 'fontSize' => 11, 'text' => (bool) $show['code_text']]);
            } catch (CodeException $e) {
                $skipped[] = ['type' => $it['type'], 'id' => (int) $it['id'], 'label' => $item['label'], 'reason' => $e->getMessage()];
                $total -= $copies;

                continue;
            }
            $lines = [];
            if ($show['name']) {
                $lines[] = ['role' => 'name', 'text' => $item['name']];
            }
            if ($show['sku'] && $item['sku']) {
                $lines[] = ['role' => 'sku', 'text' => (string) $item['sku']];
            }
            if ($show['price'] && $item['price'] !== null) {
                $lines[] = ['role' => 'price', 'text' => trim(($item['currency'] ? $item['currency'] . ' ' : '') . number_format($item['price'], 2))];
            }
            if ($show['batch'] && ($item['batch_no'] || $item['expiry'])) {
                $lines[] = ['role' => 'batch', 'text' => trim(($item['batch_no'] ? 'Batch ' . $item['batch_no'] : '') . ($item['expiry'] ? ' · exp ' . $item['expiry'] : ''), ' ·')];
            }
            $labels[] = ['type' => $it['type'], 'id' => (int) $item['id'], 'copies' => $copies, 'code' => $item['code'], 'kind' => $kind, 'lines' => $lines, 'svg' => $svg, 'two_d' => CodeFactory::KINDS[$kind][1]];
        }
        if ($labels && Schema::hasTable('code_prints')) {
            DB::table('code_prints')->insert(['user_id' => $by, 'template' => $o['template'] ?? null, 'size' => $o['size'] ?? $defaults['label']['size'], 'label_count' => $total,
                'items' => json_encode(array_map(fn ($l) => ['type' => $l['type'], 'id' => $l['id'], 'copies' => $l['copies']], $labels)), 'created_at' => now(), 'updated_at' => now()]);
        }

        return ['labels' => $labels, 'skipped' => $skipped, 'total' => $total];
    }

    /** the kind of code for an item: the one asked for, else the company's default for its type (a real GTIN keeps its retail code); a retail kind that does not fit falls back to Code 128 */
    private function kind(string $type, string $code, ?string $asked, array $defaults): string
    {
        $kind = $asked ?: ($defaults['kinds'][$type] ?? 'auto');
        if ($kind === 'auto') {
            $kind = CodeFactory::suggest($code);
        }
        if (in_array($kind, ['ean13', 'ean8', 'upca', 'upce', 'itf14'], true)) {
            try {
                CodeFactory::make($kind, $code);
            } catch (CodeException) {
                return 'code128';
            }
        }

        return $kind;
    }
}
