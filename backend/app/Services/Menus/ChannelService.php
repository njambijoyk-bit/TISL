<?php

namespace App\Services\Menus;

use App\Models\Menus\Channel;
use App\Models\Menus\Menu;
use App\Models\ShippingOption;
use App\Services\Books\BooksException;

/** The rules of a way in (Settings → Menus → Ways to order). */
class ChannelService
{
    /**
     * @param array{name?: string, is_active?: bool, prep_minutes?: int, slot_minutes?: int, max_days_ahead?: int, allow_asap?: bool, payment_modes?: array, menu_ids?: ?array, shipping_option_ids?: ?array, min_order?: float, note?: ?string} $d
     */
    public function save(Channel $c, array $d): Channel
    {
        $name = array_key_exists('name', $d) ? trim((string) $d['name']) : $c->name;
        if ($name === '') {
            throw new BooksException('Give the way to order a name.');
        }
        $prep = (int) ($d['prep_minutes'] ?? $c->prep_minutes);
        $slot = (int) ($d['slot_minutes'] ?? $c->slot_minutes);
        $days = (int) ($d['max_days_ahead'] ?? $c->max_days_ahead);
        if ($prep < 0 || $prep > 240) {
            throw new BooksException('Preparation takes between 0 and 240 minutes.');
        }
        if ($slot < 5 || $slot > 120) {
            throw new BooksException('Times a customer can choose are 5 to 120 minutes apart.');
        }
        if ($days < 0 || $days > 14) {
            throw new BooksException('Customers can order up to 14 days ahead.');
        }
        $modes = array_key_exists('payment_modes', $d) ? array_values(array_unique((array) $d['payment_modes'])) : ($c->payment_modes ?? ['online', 'later']);
        if (! $modes || array_diff($modes, array_keys(Channel::PAYMENT_MODES))) {
            throw new BooksException('Choose how customers may pay: now, when it is collected or delivered, or both.');
        }
        $menus = array_key_exists('menu_ids', $d) ? $this->ids($d['menu_ids']) : $c->menu_ids;
        if ($menus !== null && Menu::whereIn('id', $menus)->count() !== count($menus)) {
            throw new BooksException('One of the menus does not exist any more.');
        }
        $ships = array_key_exists('shipping_option_ids', $d) ? $this->ids($d['shipping_option_ids']) : $c->shipping_option_ids;
        if ($ships !== null && ShippingOption::whereIn('id', $ships)->count() !== count($ships)) {
            throw new BooksException('One of the delivery methods does not exist any more.');
        }
        $min = round((float) ($d['min_order'] ?? $c->min_order), 2);
        if ($min < 0) {
            throw new BooksException('The smallest order can not be less than nothing.');
        }
        $active = (bool) ($d['is_active'] ?? $c->is_active);
        if ($active && $c->order_type === 'delivery' && ! ShippingOption::where('is_active', true)->when($ships, fn ($q) => $q->whereIn('id', $ships))->exists()) {
            throw new BooksException('Delivery needs at least one delivery method (Settings → Shipping) before it can be switched on.');
        }
        $note = array_key_exists('note', $d) ? trim((string) $d['note']) : $c->note;
        $c->fill(['name' => $name, 'is_active' => $active, 'prep_minutes' => $prep, 'slot_minutes' => $slot, 'max_days_ahead' => $days, 'allow_asap' => (bool) ($d['allow_asap'] ?? $c->allow_asap),
            'payment_modes' => $modes, 'menu_ids' => $menus, 'shipping_option_ids' => $ships, 'min_order' => $min, 'note' => $note === '' ? null : mb_substr((string) $note, 0, 300)])->save();

        return $c;
    }

    /** @return ?int[] null (or empty) = all */
    private function ids(mixed $v): ?array
    {
        $ids = array_values(array_unique(array_map('intval', (array) $v)));

        return $ids ?: null;
    }
}
