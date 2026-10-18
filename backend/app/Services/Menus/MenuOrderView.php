<?php

namespace App\Services\Menus;

use App\Models\Menus\MenuOrder;

/** How an order is shown: to the customer who placed it (by their link) and to the kitchen. */
class MenuOrderView
{
    /** @return array<string, mixed> */
    public function customer(MenuOrder $o): array
    {
        $o->loadMissing('lines');

        return $this->base($o) + ['can_cancel' => $o->status === 'placed' && $o->payment !== 'paid', 'steps' => $this->steps($o)];
    }

    /** @return array<string, mixed> */
    public function staff(MenuOrder $o): array
    {
        $o->loadMissing('lines', 'channel');

        return $this->base($o) + [
            'id' => $o->id, 'phone' => $o->phone, 'email' => $o->email, 'channel' => $o->channel?->name, 'payment_method_id' => $o->payment_method_id, 'location_id' => $o->location_id,
            'next' => $o->payment === 'pending' ? [] : array_values(array_filter(MenuOrderService::NEXT[$o->status] ?? [], fn ($s) => ! ($s === 'out' && $o->order_type !== 'delivery')
                && ! ($s === 'completed' && ($o->payment === 'later' || ($o->order_type === 'delivery' && $o->status === 'ready'))))),
            'needs_payment' => $o->payment === 'later' && in_array($o->status, ['ready', 'out'], true), 'refund_due' => $o->refundDue(), 'voucher_id' => $o->voucher_id, 'sale_id' => $o->sale_id,
        ];
    }

    /** @return array<string, mixed> */
    private function base(MenuOrder $o): array
    {
        return [
            'number' => $o->number, 'status' => $o->status, 'status_label' => MenuOrder::STATUSES[$o->status] ?? $o->status, 'order_type' => $o->order_type, 'payment' => $o->payment, 'name' => $o->name,
            'asap' => $o->asap, 'fulfil_at' => $o->fulfil_at?->toIso8601String(), 'delivery_address' => $o->delivery_address, 'notes' => $o->notes, 'cancel_reason' => $o->cancel_reason,
            'delivery_fee' => (float) $o->delivery_fee, 'subtotal' => (float) $o->subtotal, 'tax_total' => (float) $o->tax_total, 'total' => (float) $o->total, 'placed_at' => $o->placed_at?->toIso8601String(),
            'lines' => $o->lines->map(fn ($l) => ['name' => $l->name, 'quantity' => (int) $l->quantity, 'unit_price' => round((float) $l->unit_price + $l->apartFee(), 2), 'options' => array_column($l->options ?? [], 'name'), 'serving' => $l->serving ?? null, 'sides' => $l->sidesList(), 'note' => $l->note])->all(),
        ];
    }

    /** @return array<int, array{key: string, label: string, done: bool, current: bool}> the steps the customer sees */
    private function steps(MenuOrder $o): array
    {
        if ($o->status === 'cancelled') {
            return [];
        }
        $keys = $o->order_type === 'delivery' ? ['placed', 'preparing', 'ready', 'out', 'completed'] : ['placed', 'preparing', 'ready', 'completed'];
        $labels = ['placed' => 'Order received', 'preparing' => 'Being prepared', 'ready' => $o->order_type === 'delivery' ? 'Ready' : 'Ready to collect', 'out' => 'On its way', 'completed' => $o->order_type === 'delivery' ? 'Delivered' : 'Collected'];
        $rank = ['placed' => 0, 'accepted' => 0, 'preparing' => 1, 'ready' => 2, 'out' => 3, 'completed' => 4];
        $at = $rank[$o->status] ?? 0;
        if ($o->order_type !== 'delivery') {
            $at = min($at === 4 ? 3 : $at, 3);
            $at = $o->status === 'completed' ? 3 : $at;
        }

        return array_map(fn ($k, $i) => ['key' => $k, 'label' => $labels[$k], 'done' => $i < $at || $o->status === 'completed', 'current' => $i === $at && $o->status !== 'completed'], $keys, array_keys($keys));
    }
}
