<?php

namespace App\Services\Notify;

use App\Models\Customer;
use App\Models\Product;
use App\Services\CurrencyConversionService;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Tells customers when a product they saved (their wishlist) gets cheaper. A product's price is compared with the price this job last saw for it (price_watch_marks):
 *  - the first time a product is seen its price is only noted;
 *  - a drop of at least the company's minimum (default 5%) on a product that can be bought tells everyone who saved it, and the new price is noted;
 *  - a smaller drop is not noted, so a run of small cuts adds up to a real one; a rise moves the note up, so the next cut is measured from there;
 *  - nobody is told twice for the same price, or a higher one, within 30 days.
 * Only the product's own price (not a personal or tier discount, not a variant's). Off until the company switches it on; email (and the bell), WhatsApp only through
 * the automatic API; a customer who said stop, or "essential only", is not emailed. Script 114.
 */
class PriceDropAlerts
{
    public const REPEAT_AFTER_DAYS = 30;

    public const PER_RUN = 500;

    public function __construct(private Notifier $notifier, private NotifySettings $settings, private ReminderPrefs $prefs, private CurrencyConversionService $money)
    {
    }

    public static function ready(): bool
    {
        return NotifySettings::ready() && ReminderPrefs::ready() && Schema::hasTable('price_watch_marks') && Schema::hasTable('price_drop_notices') && Schema::hasTable('customer_wishlists');
    }

    /** @return array{products: int, dropped: int, told: int, would_tell: int} */
    public function run(bool $dry = false): array
    {
        $out = ['products' => 0, 'dropped' => 0, 'told' => 0, 'would_tell' => 0];
        $g = $this->settings->get('general');
        if (! self::ready() || ! ($g['price_drop_enabled'] ?? false) || ! ($g['email_enabled'] ?? true)) {
            return $out;
        }
        $minPercent = (int) ($g['price_drop_min_percent'] ?? 5);

        $savedBy = [];   // product id => customer ids
        foreach (DB::table('customer_wishlists')->get(['customer_id', 'ids']) as $row) {
            foreach (json_decode((string) $row->ids, true) ?: [] as $pid) {
                $savedBy[(int) $pid][] = (int) $row->customer_id;
            }
        }
        if (! $savedBy) {
            return $out;
        }
        $marks = DB::table('price_watch_marks')->pluck('price', 'product_id');
        $currency = $this->money->getBaseCurrency()?->code ?? '';

        Product::active()->whereIn('id', array_keys($savedBy))->get(['id', 'name', 'price', 'original_price', 'in_stock'])->each(function (Product $p) use (&$out, $savedBy, $marks, $minPercent, $dry, $currency) {
            $out['products']++;
            $now = round((float) $p->price, 2);
            $was = $marks->has($p->id) ? (float) $marks[$p->id] : null;
            if ($was === null || $now > $was) {
                if (! $dry && $now > 0) {
                    DB::table('price_watch_marks')->updateOrInsert(['product_id' => $p->id], ['price' => $now, 'updated_at' => now()]);
                }

                return;
            }
            if ($now >= $was || $was <= 0 || ($was - $now) / $was * 100 < $minPercent || ! $p->in_stock || $now <= 0) {
                return;
            }
            $out['dropped']++;
            if (! $dry) {
                DB::table('price_watch_marks')->where('product_id', $p->id)->update(['price' => $now, 'updated_at' => now()]);   // noted first: a failure part way can not tell the same people again
            }
            foreach (array_unique($savedBy[$p->id]) as $customerId) {
                if ($out['told'] + $out['would_tell'] >= self::PER_RUN || ! $this->mayTell($customerId, $p->id, $now)) {
                    continue;
                }
                $customer = Customer::find($customerId);
                if (! $customer) {
                    continue;
                }
                if ($dry) {
                    $out['would_tell']++;
                    continue;
                }
                DB::table('price_drop_notices')->updateOrInsert(['customer_id' => $customerId, 'product_id' => $p->id], ['price_told' => $now, 'told_at' => now()]);
                $this->send($customer, $p, $was, $now, $currency);
                $out['told']++;
            }
        });

        return $out;
    }

    private function mayTell(int $customerId, int $productId, float $price): bool
    {
        if (! $this->prefs->allows($customerId, 'price')) {
            return false;
        }
        $n = DB::table('price_drop_notices')->where('customer_id', $customerId)->where('product_id', $productId)->first();

        return ! $n || $n->told_at < now()->subDays(self::REPEAT_AFTER_DAYS)->toDateTimeString() || $price < (float) $n->price_told;
    }

    private function send(Customer $customer, Product $p, float $was, float $now, string $currency): void
    {
        $money = fn (float $v) => trim($currency . ' ' . number_format($v, 2));
        $percent = (int) round(($was - $now) / $was * 100);
        $first = trim((string) $customer->first_name);
        $body = ($first !== '' ? "Hi {$first}, " : '') . "{$p->name}, which you saved, is now {$money($now)} (it was {$money($was)}): {$percent}% off."
            . "\n\nPrices can change again, so it is worth ordering soon."
            . "\n\nDon't want price alerts? " . $this->prefs->stopUrl((int) $customer->id, 'price');
        $this->notifier->send($customer, 'price_drop', "{$p->name} is now {$percent}% cheaper", $body, ['action_url' => '/products/' . $p->id, 'action_text' => 'See it']);
    }
}
