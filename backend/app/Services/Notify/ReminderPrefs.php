<?php

namespace App\Services\Notify;

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;

/**
 * A customer's say over the two reminders the shop starts itself: items left in the cart (`cart`) and price drops on saved items (`price`). Everyone is in until they
 * say no, here or through the stop link at the bottom of every reminder (a token, so it works from the email without signing in). Script 114.
 */
class ReminderPrefs
{
    public const KINDS = ['cart', 'price'];

    public static function ready(): bool
    {
        static $ready;
        $check = fn () => Schema::hasTable('customer_reminder_prefs');

        return app()->runningUnitTests() ? $check() : ($ready ??= $check());
    }

    /** May this customer be sent this kind of reminder? (No row yet means yes.) */
    public function allows(int $customerId, string $kind): bool
    {
        $row = DB::table('customer_reminder_prefs')->where('customer_id', $customerId)->first();

        return ! $row || (bool) $row->{$kind};
    }

    /** The row for a customer, made on first use (it holds the token the stop link needs). */
    public function forCustomer(int $customerId): object
    {
        $row = DB::table('customer_reminder_prefs')->where('customer_id', $customerId)->first();
        if (! $row) {
            DB::table('customer_reminder_prefs')->insertOrIgnore(['customer_id' => $customerId, 'cart' => 1, 'price' => 1, 'token' => Str::random(40), 'updated_at' => now()]);
            $row = DB::table('customer_reminder_prefs')->where('customer_id', $customerId)->first();
        }

        return $row;
    }

    /** The link at the bottom of a reminder. */
    public function stopUrl(int $customerId, string $kind): string
    {
        return rtrim((string) config('app.frontend_url'), '/') . '/reminders/stop/' . $this->forCustomer($customerId)->token . '?kind=' . $kind;
    }

    /** @return array{cart: bool, price: bool} */
    public function show(int $customerId): array
    {
        $row = DB::table('customer_reminder_prefs')->where('customer_id', $customerId)->first();

        return ['cart' => ! $row || (bool) $row->cart, 'price' => ! $row || (bool) $row->price];
    }

    /** The customer's own choice, from their profile. @param array{cart?: bool, price?: bool} $in */
    public function save(int $customerId, array $in): array
    {
        $this->forCustomer($customerId);
        $set = [];
        foreach (self::KINDS as $k) {
            if (array_key_exists($k, $in)) {
                $set[$k] = $in[$k] ? 1 : 0;
            }
        }
        if ($set) {
            DB::table('customer_reminder_prefs')->where('customer_id', $customerId)->update($set + ['updated_at' => now()]);
        }

        return $this->show($customerId);
    }

    /** What the stop link is about, or null when the token is not known. */
    public function peek(string $token): ?array
    {
        $row = strlen($token) === 40 ? DB::table('customer_reminder_prefs')->where('token', $token)->first() : null;

        return $row ? ['cart' => (bool) $row->cart, 'price' => (bool) $row->price] : null;
    }

    /** Stop one kind (or `all`) from the link. Doing it again changes nothing. */
    public function stop(string $token, string $kind): ?array
    {
        $row = strlen($token) === 40 ? DB::table('customer_reminder_prefs')->where('token', $token)->first() : null;
        if (! $row || ! in_array($kind, [...self::KINDS, 'all'], true)) {
            return null;
        }
        $set = $kind === 'all' ? ['cart' => 0, 'price' => 0] : [$kind => 0];
        DB::table('customer_reminder_prefs')->where('token', $token)->update($set + ['updated_at' => now()]);

        return $this->show((int) $row->customer_id);
    }
}
