<?php

namespace App\Services\Notify;

use App\Models\Customer;
use App\Models\Hamper;
use App\Models\Product;
use Carbon\CarbonInterface;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Tells a signed-in customer who left things in their cart that they are still there. The cart lives on the server (customer_carts), so this works from it.
 * Rules, so it is a nudge and not a nag:
 *  - off until the company switches it on; only after the cart has been untouched for N hours (default 24) and not older than 14 days;
 *  - once per cart (or twice, the second 3 days after the first, when the company chose 2): a cart that changes counts as a new cart;
 *  - never after they have ordered since, never when none of what is in it can be bought, never at night (8 to 20), never to someone who said stop;
 *  - email (and the bell). WhatsApp only through the automatic API; "essential only" customers get the bell only: that is the normal channel rules.
 * Script 114.
 */
class CartReminders
{
    public const MAX_AGE_DAYS = 14;

    public const SECOND_AFTER_DAYS = 3;

    public const PER_RUN = 200;

    public function __construct(private Notifier $notifier, private NotifySettings $settings, private ReminderPrefs $prefs)
    {
    }

    public static function ready(): bool
    {
        return NotifySettings::ready() && ReminderPrefs::ready() && Schema::hasTable('cart_reminders') && Schema::hasTable('customer_carts');
    }

    /** @return array{sent: int, would_send: int, skipped: array<string,int>} */
    public function run(?CarbonInterface $now = null, bool $dry = false): array
    {
        $now ??= now();
        $out = ['sent' => 0, 'would_send' => 0, 'skipped' => []];
        $skip = function (string $why) use (&$out) { $out['skipped'][$why] = ($out['skipped'][$why] ?? 0) + 1; };
        $g = $this->settings->get('general');
        if (! self::ready() || ! ($g['cart_reminders_enabled'] ?? false) || ! ($g['email_enabled'] ?? true)) {
            return $out;
        }
        if ($now->hour < 8 || $now->hour >= 20) {
            $skip('quiet_hours');

            return $out;
        }
        $after = (int) ($g['cart_reminder_after_hours'] ?? 24);
        $max = (int) ($g['cart_reminder_count'] ?? 1);

        $carts = DB::table('customer_carts')->where('updated_at', '<=', $now->copy()->subHours($after))->where('updated_at', '>=', $now->copy()->subDays(self::MAX_AGE_DAYS))
            ->orderBy('updated_at')->limit(self::PER_RUN * 3)->get();
        foreach ($carts as $cart) {
            if ($out['sent'] + $out['would_send'] >= self::PER_RUN) {
                break;
            }
            $items = json_decode((string) $cart->items, true) ?: [];
            $customer = $items ? Customer::find($cart->customer_id) : null;
            if (! $customer) {
                $skip($items ? 'no_customer' : 'empty');
                continue;
            }
            if (! $this->prefs->allows((int) $customer->id, 'cart')) {
                $skip('stopped');
                continue;
            }
            $state = DB::table('cart_reminders')->where('customer_id', $customer->id)->first();
            $count = $state && $state->cart_updated_at === $cart->updated_at ? (int) $state->sent_count : 0;   // a cart that changed is a new cart
            if ($count >= $max) {
                $skip('already_reminded');
                continue;
            }
            if ($count >= 1 && $state->last_sent_at > $now->copy()->subDays(self::SECOND_AFTER_DAYS)->toDateTimeString()) {
                $skip('too_soon');
                continue;
            }
            if ($this->orderedSince($customer->id, $cart->updated_at)) {
                $skip('ordered');
                continue;
            }
            $names = $this->buyableNames($items);
            if (! $names) {
                $skip('nothing_buyable');
                continue;
            }
            if ($dry) {
                $out['would_send']++;
                continue;
            }
            // remembered before it is sent: a crash half way can not send it again next hour
            DB::table('cart_reminders')->updateOrInsert(['customer_id' => $customer->id], ['cart_updated_at' => $cart->updated_at, 'sent_count' => $count + 1, 'last_sent_at' => $now->toDateTimeString()]);
            $this->send($customer, $names, $count + 1);
            $out['sent']++;
        }

        return $out;
    }

    private function orderedSince(int $customerId, string $since): bool
    {
        return Schema::hasTable('vouchers') && DB::table('vouchers')->where('customer_id', $customerId)->where('created_at', '>', $since)->exists();
    }

    /** The names (with quantity) of what in the cart can still be bought: in stock, on an open preorder, or an available hamper. @return string[] */
    private function buyableNames(array $items): array
    {
        $productIds = [];
        $hamperIds = [];
        foreach ($items as $i) {
            if (! empty($i['hamper_id'])) {
                $hamperIds[] = (int) $i['hamper_id'];
            } elseif (! empty($i['id'])) {
                $productIds[] = (int) $i['id'];
            }
        }
        $ok = $productIds ? Product::active()->whereIn('id', $productIds)->get(['id', 'in_stock'])->keyBy('id') : collect();
        $hampers = $hamperIds ? Hamper::available()->whereIn('id', $hamperIds)->pluck('id')->flip() : collect();
        $names = [];
        foreach ($items as $i) {
            $isHamper = ! empty($i['hamper_id']);
            $buyable = $isHamper ? $hampers->has((int) $i['hamper_id']) : ($ok->has((int) ($i['id'] ?? 0)) && ($ok[(int) $i['id']]->in_stock || ! empty($i['preorder'])));
            if ($buyable && ! empty($i['name'])) {
                $q = (float) ($i['quantity'] ?? 1);
                $names[] = ($q > 1 ? rtrim(rtrim(number_format($q, 2, '.', ''), '0'), '.') . ' × ' : '') . $i['name'];
            }
        }

        return $names;
    }

    private function send(Customer $customer, array $names, int $nth): void
    {
        $first = trim((string) $customer->first_name);
        $shown = array_slice($names, 0, 3);
        $more = count($names) - count($shown);
        $body = ($first !== '' ? "Hi {$first}, you" : 'You') . ' left ' . (count($names) === 1 ? 'something' : 'some things') . ' in your cart:'
            . "\n\n• " . implode("\n• ", $shown) . ($more > 0 ? "\n• and {$more} more" : '')
            . "\n\nPrices and stock can change, so it is worth finishing your order soon."
            . "\n\nDon't want cart reminders? " . $this->prefs->stopUrl((int) $customer->id, 'cart');
        $title = $nth === 1 ? 'You left something in your cart' : 'Your cart is still waiting';
        $this->notifier->send($customer, 'cart_reminder', $title, $body, ['action_url' => '/cart', 'action_text' => 'Back to your cart']);
    }
}
