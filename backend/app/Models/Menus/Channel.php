<?php

namespace App\Models\Menus;

use Illuminate\Database\Eloquent\Model;

/** A way in: online pickup, online delivery (later the till, tables, kiosk). Its rules say how soon, when, and how it may be paid. */
class Channel extends Model
{
    public const PAYMENT_MODES = ['online' => 'Pay now', 'later' => 'Pay when it is collected or delivered'];

    protected $table = 'menus_channels';

    protected $fillable = ['code', 'name', 'order_type', 'is_active', 'prep_minutes', 'slot_minutes', 'max_days_ahead', 'allow_asap', 'payment_modes', 'menu_ids', 'shipping_option_ids', 'min_order', 'note', 'sort_order'];

    protected $casts = ['is_active' => 'boolean', 'allow_asap' => 'boolean', 'payment_modes' => 'array', 'menu_ids' => 'array', 'shipping_option_ids' => 'array', 'min_order' => 'decimal:2',
        'prep_minutes' => 'integer', 'slot_minutes' => 'integer', 'max_days_ahead' => 'integer', 'sort_order' => 'integer'];

    public function acceptsPayment(string $mode): bool
    {
        return in_array($mode, $this->payment_modes ?? ['online', 'later'], true);
    }
}
