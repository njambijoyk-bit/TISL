<?php

namespace App\Services\Menus;

use App\Models\Menus\FoodTag;
use Illuminate\Support\Facades\Schema;

/** The allergens and tags in force, read once per request (the container makes a fresh one each time): the rows an admin keeps, else the lists Menus always had. */
final class FoodTagCatalog
{
    /** @var array<int, array{kind: string, code: string, label: string, rules_out: string[]}>|null */
    private ?array $rows = null;

    public static function installed(): bool
    {
        return Schema::hasTable('menus_food_tags');
    }

    public function forget(): void
    {
        $this->rows = null;
    }

    /** @return array<int, array{kind: string, code: string, label: string, rules_out: string[]}> in the order they are shown */
    public function rows(): array
    {
        if ($this->rows !== null) {
            return $this->rows;
        }
        $kept = self::installed() ? FoodTag::orderBy('sort_order')->orderBy('id')->get() : collect();
        if ($kept->isNotEmpty()) {
            return $this->rows = $kept->map(fn (FoodTag $t) => ['kind' => $t->kind, 'code' => $t->code, 'label' => $t->label, 'rules_out' => array_values((array) $t->rules_out)])->all();
        }

        return $this->rows = array_map(fn ($d) => ['kind' => $d[0], 'code' => $d[1], 'label' => $d[2], 'rules_out' => $d[3]], FoodTags::DEFAULTS);
    }

    /** @return array<string, string> */
    public function labels(string $kind): array
    {
        $out = [];
        foreach ($this->rows() as $r) {
            if ($r['kind'] === $kind) {
                $out[$r['code']] = $r['label'];
            }
        }

        return $out;
    }

    /** @return string[] */
    public function rulesOut(string $kind, string $code): array
    {
        foreach ($this->rows() as $r) {
            if ($r['kind'] === $kind && $r['code'] === $code) {
                return $r['rules_out'];
            }
        }

        return [];
    }
}
