<?php

namespace App\Services;

use App\Models\Booking;
use App\Models\Customer;
use App\Models\Policy;
use App\Models\PolicyAcceptance;
use App\Models\ServiceSetting;
use App\Services\Books\BooksException;
use App\Services\Books\ServiceFeeService;

/**
 * The booking terms: a policy a customer agrees to before booking a service — the cancellation and move windows, the deposit and the fees that apply. The wording
 * holds {{placeholders}} that are filled from Service settings and the service fee ledgers whenever it is shown, so it always says what will actually be charged.
 * Agreeing is recorded (who, which version, what it said then, from where) and holds for every booking until the policy gets a new major version. Switch it off in
 * Settings → Policies (inactive, or "requires acceptance" off).
 */
class BookingTermsService
{
    public const KEY = 'booking_terms';
    public const CONTEXT = 'booking_checkout';

    public function ensure(): Policy
    {
        return Policy::firstOrCreate(['key' => self::KEY], [
            'title' => 'Booking Terms & Cancellation Policy',
            'content' => $this->defaultContent(),
            'disagree_consequence_text' => 'Without agreeing to the booking terms you cannot book a service online.',
            'sensitivity' => 'standard', 'major_version' => 1, 'minor_version' => 0,
            'requires_acceptance' => true, 'is_active' => true,
        ]);
    }

    public function required(): ?Policy
    {
        $p = Policy::where('key', self::KEY)->first() ?? $this->ensure();

        return $p->is_active && $p->requires_acceptance ? $p : null;
    }

    public function accepted(?Customer $customer, Policy $policy): bool
    {
        if (! $customer) {
            return false;
        }
        $last = PolicyAcceptance::where('customer_id', $customer->id)->where('policy_key', self::KEY)->where('response', 'accepted')->latest('accepted_at')->first();

        return $last && (int) explode('.', (string) $last->policy_version)[0] >= (int) $policy->major_version;
    }

    /** For the booking panel: is there a policy to agree to, and has this customer already done so. */
    public function status(?Customer $customer): array
    {
        $p = $this->required();

        return ['required' => (bool) $p, 'accepted' => $p ? $this->accepted($customer, $p) : true, 'policy_key' => self::KEY, 'title' => $p?->title, 'version' => $p?->version];
    }

    /**
     * Let a customer through when they have agreed (now or before). An agreement made now is recorded, and returned so it can be tied to the booking.
     *
     * @throws BooksException
     */
    public function enforce(?Customer $customer, array $in): ?PolicyAcceptance
    {
        $p = $this->required();
        if (! $p || ($customer && $this->accepted($customer, $p))) {
            return null;
        }
        $agreed = collect($in['policy_acceptances'] ?? [])->contains(fn ($a) => ($a['key'] ?? null) === self::KEY && ($a['response'] ?? 'accepted') === 'accepted');
        if (! $agreed || ! $customer) {
            throw new BooksException('Please agree to the ' . $p->title . ' to book.');
        }

        return PolicyAcceptance::create([
            'policy_id' => $p->id, 'policy_key' => $p->key, 'policy_version' => $p->version, 'policy_snapshot' => $this->render($p)->content,
            'customer_id' => $customer->id, 'user_id' => $customer->user_id ?? null, 'customer_number' => $customer->customer_number,
            'action_context' => self::CONTEXT, 'reference_type' => null, 'reference_id' => null,
            'response' => 'accepted', 'ip_address' => request()->ip(), 'user_agent' => substr((string) request()->userAgent(), 0, 500),
            'was_successful' => true, 'flagged' => false, 'accepted_at' => now(),
        ]);
    }

    public function tie(?PolicyAcceptance $a, Booking $b): void
    {
        $a?->update(['reference_type' => 'booking', 'reference_id' => $b->id]);
    }

    // ── the wording ────────────────────────────────────────────────────────

    /** The default fees, one line each, as the fee ledgers carry them ("a service may charge its own amounts"). */
    private function feeLines(): string
    {
        try {
            $svc = app(ServiceFeeService::class);
            $cur = app(\App\Services\CurrencyConversionService::class)->getBaseCurrency();
            $label = ['deposit' => 'Deposit to hold the booking', 'booking_fee' => 'Booking fee', 'cancellation' => 'Late cancellation fee', 'no_show' => 'No-show fee', 'reschedule' => 'Late reschedule fee'];
            $out = [];
            foreach ($svc->ledgers() as $l) {
                $o = $svc->optionFromLedger($l, $cur);
                if (! isset($label[$o['kind']]) || ! $o['amount']) {
                    continue;
                }
                $amt = $o['basis'] === 'percent' ? rtrim(rtrim(number_format($o['amount'], 2), '0'), '.') . '% of the price' : $cur->code . ' ' . number_format($o['amount'], 2);
                $out[] = "- {$label[$o['kind']]}: {$amt}" . ($o['refundable'] ? ' (refundable when you cancel in time)' : '');
            }

            return $out ? implode("\n", $out) : '- Any fees are shown to you before you confirm.';
        } catch (\Throwable $e) {
            return '- Any fees are shown to you before you confirm.';
        }
    }

    /** The policy with its {{placeholders}} filled from what is set today. The model is not saved. */
    public function render(Policy $policy): Policy
    {
        if ($policy->key !== self::KEY) {
            return $policy;
        }
        $s = ServiceSetting::current();
        $policy->content = strtr((string) $policy->content, [
            '{{cancellation_window_hours}}' => (string) $s->cancellation_window_hours, '{{reschedule_window_hours}}' => (string) $s->reschedule_window_hours, '{{fees}}' => $this->feeLines(),
        ]);

        return $policy;
    }

    private function defaultContent(): string
    {
        return <<<'TXT'
## Booking Terms & Cancellation Policy

By booking a service you agree to the following.

**1. Your booking.** A booking reserves the time and the person or place for you. You will see the price, the fees and any deposit before you confirm.

**2. Deposit and fees.** Some services ask for a deposit or a booking fee when you book. A deposit is held against your booking and goes to your account (to be refunded or set against what you owe) when you cancel in time or when the service is done. These are the standard amounts — the service page shows any that differ:
{{fees}}

**3. Cancelling.** You can cancel free of charge up to {{cancellation_window_hours}} hours before the start. Cancel later than that and the late cancellation fee applies, and your deposit may be kept against it.

**4. Moving your booking.** You can move a booking free of charge up to {{reschedule_window_hours}} hours before the start. A later move may carry the reschedule fee.

**5. If you do not come.** If you do not arrive for your booking without telling us, the no-show fee applies and your deposit may be kept against it.

**6. If we cancel.** If we have to cancel or move your booking we will tell you at once and refund anything you have paid for it.

**7. Extra charges.** Some services add charges when the work is done, for example a call-out or travel fee for a visit to your place, extra people, or overtime. They are shown on the service and on your invoice.

**8. Records.** We keep a record of your agreement to these terms with every booking.

Agreeing once covers every booking until these terms change in a way that needs you to agree again.
TXT;
    }
}
