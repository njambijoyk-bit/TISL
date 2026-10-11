<?php

namespace App\Services\Menus;

use App\Models\Menus\Dish;
use App\Models\Menus\Menu;
use App\Models\Menus\MenuSection;
use App\Services\Books\BooksException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/** Making and changing menus: the card itself, its serving times, its sections and the dishes under each. */
class MenuService
{
    /**
     * @param array{name: string, description?: ?string, days?: ?array, starts_at?: ?string, ends_at?: ?string, sort_order?: int, is_active?: bool,
     *              sections?: array<int, array{name: string, description?: ?string, dishes?: array<int, int>}>} $d the sections and dishes are in the order they are shown
     */
    public function save(array $d, ?int $id = null): Menu
    {
        $name = trim((string) ($d['name'] ?? ''));
        if ($name === '') {
            throw new BooksException('Give the menu a name.');
        }
        [$from, $to] = [$this->time($d['starts_at'] ?? null), $this->time($d['ends_at'] ?? null)];
        if (($from === null) !== ($to === null)) {
            throw new BooksException('Give both the time it starts and the time it ends, or neither for all day.');
        }
        $days = null;
        if (! empty($d['days'])) {
            $days = array_values(array_unique(array_map('intval', (array) $d['days'])));
            if (array_diff($days, array_keys(MenuSchedule::DAYS))) {
                throw new BooksException('The days must be 0 (Sunday) to 6 (Saturday).');
            }
            sort($days);
            if (count($days) === 7) {
                $days = null;   // every day
            }
        }
        $sections = array_values($d['sections'] ?? []);
        $dishIds = [];
        foreach ($sections as $s) {
            if (trim((string) ($s['name'] ?? '')) === '') {
                throw new BooksException('Every section needs a name.');
            }
            $ids = array_map('intval', $s['dishes'] ?? []);
            if (count($ids) !== count(array_unique($ids))) {
                throw new BooksException("A dish is listed twice in {$s['name']}.");
            }
            $dishIds = array_merge($dishIds, $ids);
        }
        if ($dishIds && Dish::whereIn('id', array_unique($dishIds))->count() !== count(array_unique($dishIds))) {
            throw new BooksException('One of the dishes does not exist any more.');
        }

        return DB::transaction(function () use ($d, $id, $name, $from, $to, $days, $sections) {
            $menu = $id ? Menu::findOrFail($id) : new Menu(['slug' => $this->slug($name)]);
            $menu->fill(['name' => $name, 'description' => isset($d['description']) && trim((string) $d['description']) !== '' ? mb_substr(trim((string) $d['description']), 0, 500) : null,
                'days' => $days, 'starts_at' => $from, 'ends_at' => $to, 'sort_order' => (int) ($d['sort_order'] ?? $menu->sort_order ?? 0), 'is_active' => (bool) ($d['is_active'] ?? true)])->save();
            if (array_key_exists('sections', $d)) {
                $this->dropSections($menu);
                foreach ($sections as $i => $s) {
                    $section = MenuSection::create(['menu_id' => $menu->id, 'name' => trim($s['name']), 'description' => isset($s['description']) && trim((string) $s['description']) !== '' ? mb_substr(trim((string) $s['description']), 0, 300) : null, 'sort_order' => $i]);
                    foreach (array_values($s['dishes'] ?? []) as $n => $dishId) {
                        DB::table('menus_section_dishes')->insert(['section_id' => $section->id, 'dish_id' => (int) $dishId, 'sort_order' => $n]);
                    }
                }
            }

            return $menu->load('sections.dishes');
        });
    }

    public function delete(Menu $menu): void
    {
        DB::transaction(function () use ($menu) {
            $this->dropSections($menu);
            $menu->delete();
        });
    }

    private function dropSections(Menu $menu): void
    {
        $ids = MenuSection::where('menu_id', $menu->id)->pluck('id');
        DB::table('menus_section_dishes')->whereIn('section_id', $ids)->delete();
        MenuSection::whereIn('id', $ids)->delete();
    }

    private function time(mixed $t): ?string
    {
        $t = is_string($t) ? trim($t) : '';
        if ($t === '') {
            return null;
        }
        if (! preg_match('/^([01]?\d|2[0-3]):([0-5]\d)(:[0-5]\d)?$/', $t, $x)) {
            throw new BooksException('Times are written like 06:30.');
        }

        return sprintf('%02d:%02d:00', $x[1], $x[2]);
    }

    private function slug(string $name): string
    {
        $base = Str::slug($name) ?: 'menu';
        $slug = $base;
        for ($i = 2; Menu::where('slug', $slug)->exists(); $i++) {
            $slug = $base.'-'.$i;
        }

        return $slug;
    }
}
