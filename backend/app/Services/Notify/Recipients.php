<?php

namespace App\Services\Notify;

use App\Models\Customer;
use App\Models\User;
use Illuminate\Database\Eloquent\Model;

/** Who a message is for, in the shape the ChannelResolver wants. Accepts a customer, or a user (who may be a customer's login). */
class Recipients
{
    /**
     * @param  array{email?: ?string, whatsapp?: ?string, whatsapp_source?: ?string}  $override  a number or address known from this very event (the phone given at checkout)
     * @return array{person: array, bell: ?Model, customer: ?Customer}
     */
    public function for(Model $to, array $override = []): array
    {
        $customer = $to instanceof Customer ? $to : ($to instanceof User ? $to->customer : null);
        $user = $to instanceof User ? $to : ($customer?->user);

        if ($customer) {
            if (! empty($override['whatsapp'])) {
                $number = $override['whatsapp'];
                $source = $override['whatsapp_source'] ?? 'checkout';
            } else {
                $number = $customer->whatsapp;
                $source = $customer->whatsapp_consent_source ?: ($number ? 'profile' : null);
            }

            return ['bell' => $user ?? $customer, 'customer' => $customer, 'person' => [
                'kind' => 'customer', 'has_account' => (bool) ($user ?? $customer), 'email' => $override['email'] ?? ($customer->email ?: $user?->email),
                'whatsapp' => $number, 'whatsapp_source' => $source, 'mode' => $customer->notify_mode ?? null, 'essential_only' => $customer->notify_essential_only === null ? null : (bool) $customer->notify_essential_only,
            ]];
        }
        $isStaff = $to instanceof User && rescue(fn () => $to->isStaff(), false, false);

        return ['bell' => $to, 'customer' => null, 'person' => ['kind' => $isStaff ? 'staff' : 'other', 'has_account' => true, 'email' => $override['email'] ?? ($to->email ?? null), 'whatsapp' => null]];
    }
}
