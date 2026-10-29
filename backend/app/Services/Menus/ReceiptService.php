<?php

namespace App\Services\Menus;

use App\Models\CompanyProfile;
use App\Models\Menus\MenuOrder;
use Illuminate\Support\Facades\DB;

/**
 * The receipt, in the narrow monospaced layout the owner likes (a fast-food kiosk receipt): business and branch, order type and the number to call out, each dish with its choices
 * indented under it (a price beside a choice only when it costs something), subtotal, tax per rate, service charge, tip, total, how it was paid and the change.
 * Plain text so any thermal printer, or the browser's print, can print it; the same text is shown on the screen.
 */
class ReceiptService
{
    public const TYPES = ['dine_in' => 'Dine In', 'take_out' => 'Take Out'];

    /** @return array{text: string, width: int} */
    public function for(MenuOrder $o, int $width = 32): array
    {
        $width = in_array($width, [32, 42, 48], true) ? $width : 32;
        $o->loadMissing('lines');
        $co = CompanyProfile::current();
        $branch = $o->location_id ? DB::table('locations')->where('id', $o->location_id)->value('name') : null;
        $rule = str_repeat('-', $width);
        $out = [];
        $center = function (?string $s) use (&$out, $width) {
            foreach (array_filter(array_map('trim', explode("\n", wordwrap((string) $s, $width, "\n", true)))) as $line) {
                $out[] = str_pad($line, $width, ' ', STR_PAD_BOTH);
            }
        };
        $pair = fn (string $l, string $r) => $this->pair($l, $r, $width);

        $center(mb_strtoupper((string) ($co->name ?: config('app.name'))));
        if ($branch && count(DB::table('locations')->limit(2)->pluck('id')) > 1) {
            $center($branch);
        }
        $center(trim(implode(', ', array_filter([$co->address, $co->city]))));
        $center(trim(implode(' · ', array_filter([$co->phone, $co->tax_pin ? 'PIN '.$co->tax_pin : null]))));
        foreach ($co->taxLines() as $taxLine) {
            $center($taxLine);
        }
        $center(($o->settled_at ?? $o->placed_at ?? $o->created_at)->timezone((string) config('app.timezone', 'Africa/Nairobi'))->format('d/m/Y, h:i:s A'));
        $out[] = $rule;
        $type = in_array($o->order_type, ['counter', 'kiosk'], true) ? (self::TYPES[$o->service] ?? 'Counter') : ($o->order_type === 'delivery' ? 'Delivery' : 'Pickup');
        $out[] = $pair('Order Type', $type);
        $out[] = $pair('Order #', $o->short_no ? (string) $o->short_no : $o->number);
        if ($o->session_code) {
            $out[] = $pair('Kiosk Session', $o->session_code);
        }
        if ($o->label) {
            $out[] = $pair('Tab', $o->label);
        }
        $out[] = $rule;
        foreach ($o->lines as $l) {
            $qty = (float) $l->quantity;
            $out[] = $this->line((string) rtrim(rtrim(number_format($qty, 2, '.', ''), '0'), '.'), $l->name, $this->money((float) $l->base_price * $qty), $width);
            if ($l->serving) {   // the size and what comes with it, under the dish
                $out[] = '   '.$l->serving;
            }
            foreach ($l->sidesList() as $side) {
                $out[] = '   - '.$side;
            }
            if (! empty($l->native_price) && ($nc = \App\Models\Currency::find($l->native_currency_id))) {   // a dish priced in another currency: what it was listed at and the rate of the day
                $out[] = '   '.$nc->code.' '.$this->money((float) $l->native_price).' at '.rtrim(rtrim(number_format((float) $l->native_rate, 6, '.', ''), '0'), '.');
            }
            foreach ($l->options ?? [] as $opt) {
                $delta = (float) ($opt['price_delta'] ?? 0);
                $out[] = $delta != 0.0 ? $this->pair('   - '.$opt['name'], $this->money($delta * $qty), $width) : '   - '.$opt['name'];
            }
            if ($l->note) {
                $out[] = '   * '.$l->note;
            }
        }
        foreach (app(PackagingCheckout::class)->forOrder($o) as $p) {   // the packaging the receipt shows: what was sold, or what the switch says to show
            if ($p['quantity'] > 0 && app(PackagingCheckout::class)->shows($p['receipt'], $p['charged'])) {
                $out[] = $this->line((string) $p['quantity'], 'Packaging: '.$p['name'], $p['charged'] ? $this->money($p['amount']) : 'free', $width);
            }
        }
        $out[] = $rule;
        $out[] = $pair('Subtotal', $this->money((float) $o->subtotal - (float) $o->delivery_fee));
        if ((float) $o->delivery_fee > 0) {
            $out[] = $pair('Delivery', $this->money((float) $o->delivery_fee));
        }
        $taxes = $o->tax_breakdown ?? [];
        if ($taxes) {
            foreach ($taxes as $t) {
                $out[] = $pair(($t['label'] ?? 'Tax').(isset($t['percent']) && $t['percent'] ? ' '.rtrim(rtrim(number_format((float) $t['percent'], 2, '.', ''), '0'), '.').'%' : ''), $this->money((float) $t['amount']));
            }
        } elseif ((float) $o->tax_total > 0) {
            $out[] = $pair('Tax', $this->money((float) $o->tax_total));
        }
        if ((float) $o->service_charge > 0) {
            $out[] = $pair('Service Charge', $this->money((float) $o->service_charge));
        }
        if ((float) $o->tip > 0) {
            $out[] = $pair('Tip', $this->money((float) $o->tip));
        }
        $oc = $o->currency_id ? \App\Models\Currency::find($o->currency_id) : null;
        $out[] = $pair('TOTAL'.($oc && ! $oc->is_base ? ' '.$oc->code : ''), $this->money((float) $o->total));
        $out[] = $rule;
        if ($o->payment === 'paid' && $o->tenders) {
            foreach ($o->tenders as $t) {
                $out[] = $pair((string) $t['method'], $this->money((float) $t['amount']));
                if (! empty($t['reference'])) {
                    $out[] = '   ref '.$t['reference'];
                }
            }
            if ((float) $o->change_due > 0) {
                $out[] = $pair('Cash given', $this->money((float) $o->tendered));
                $out[] = $pair('Change', $this->money((float) $o->change_due));
            }
        } elseif ($o->payment === 'paid') {
            $out[] = 'PAID';
        } elseif ($o->payment === 'open') {
            $out[] = $o->order_type === 'kiosk' ? 'PAY AT THE COUNTER' : 'NOT PAID YET (open tab)';
        } elseif ($o->payment === 'later') {
            $out[] = 'TO PAY ON '.($o->order_type === 'delivery' ? 'DELIVERY' : 'COLLECTION');
        }
        if ($footer = trim((string) MenusSettings::all()['receipt_footer'])) {
            $out[] = $rule;
            $center($footer);
        }

        return ['text' => implode("\n", $out)."\n", 'width' => $width];
    }

    private function money(float $n): string
    {
        return number_format($n, 2, '.', ',');
    }

    private function pair(string $left, string $right, int $width): string
    {
        $room = max(1, $width - mb_strlen($right) - 1);

        return mb_str_pad(mb_strimwidth($left, 0, $room, '…'), $room).' '.$right;
    }

    private function line(string $qty, string $name, string $price, int $width): string
    {
        $left = str_pad($qty, 3).$name;

        return $this->pair($left, $price, $width);
    }
}
