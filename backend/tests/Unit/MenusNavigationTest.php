<?php

namespace Tests\Unit;

use PHPUnit\Framework\TestCase;

/** The Menus tab row (frontend/src/_shared/navigation/adminNav.js): every shortcut is one key used once, and the pages are in the order they are built. */
class MenusNavigationTest extends TestCase
{
    /** @return array<int, array{group: string, title: string, key: ?string}> */
    private function tabs(): array
    {
        $js = file_get_contents(dirname(__DIR__, 3).'/frontend/src/_shared/navigation/adminNav.js');
        $this->assertSame(1, preg_match('/export const MENUS_TABS = \[(.*?)\n\];/s', $js, $block), 'the tab list is there');
        preg_match_all("/\{ group: '([^']+)', title: '([^']+)'(?:, key: '([A-Z])')?/", $block[1], $m, PREG_SET_ORDER);

        return array_map(fn ($r) => ['group' => $r[1], 'title' => $r[2], 'key' => $r[3] ?? null], $m);
    }

    public function test_every_shortcut_is_used_once_and_every_page_but_configuration_has_one(): void
    {
        $keys = [];
        foreach ($this->tabs() as $t) {
            if ($t['title'] !== 'Configuration') {
                $this->assertNotNull($t['key'], "{$t['title']} has a shortcut");
                $keys[] = $t['key'];
            }
        }
        $this->assertSame($keys, array_values(array_unique($keys)), 'a letter is used by two pages: '.implode(',', array_diff_assoc($keys, array_unique($keys))));
        $this->assertNotContains('G', $keys, 'G is the "go to" key itself');
    }

    public function test_the_pages_are_in_groups_in_the_order_they_are_built(): void
    {
        $tabs = $this->tabs();
        $this->assertSame(['Selling', 'Back of house', 'Build the menu', 'Setup'], array_values(array_unique(array_column($tabs, 'group'))), 'each group is together');
        $build = array_column(array_filter($tabs, fn ($t) => $t['group'] === 'Build the menu'), 'title');
        $this->assertSame(['Ingredients & Supplies', 'Stock', 'Recipes', 'Prepared food', 'Sides', 'Dishes', 'Menus', 'Allergens'], array_values($build), 'from raw ingredients to the plate');
        $keys = array_column($tabs, 'key', 'title');
        $this->assertSame(['W', 'S', 'B'], [$keys['Stock'], $keys['Sides'], $keys['Prepared food']]);
    }

    public function test_every_menus_page_that_is_an_item_of_its_own_shows_the_tab_row_of_dishes(): void
    {
        $js = file_get_contents(dirname(__DIR__, 3).'/frontend/src/_shared/navigation/adminNav.js');
        $this->assertSame(1, preg_match("/id: 'menus',\n    label: 'Menus',(.*?)\n    \],\n  \},/s", $js, $block));
        preg_match_all("/\{\s*id: '([^']+)',( inTabsOf: 'dishes',)?/", $block[1], $m, PREG_SET_ORDER);
        $without = array_values(array_filter(array_map(fn ($r) => empty($r[2]) ? $r[1] : null, $m)));
        $this->assertSame(['dishes'], $without, 'only Dishes holds the tabs; every other page names it, or the strip is lost when it comes before Dishes in the list');
    }
}
