<?php

namespace App\Services\Notify;

use App\Models\CompanyProfile;
use App\Models\Customer;
use Illuminate\Support\Facades\Schema;
use Illuminate\Validation\ValidationException;

/**
 * A customer's own say in how they are reached (Profile → Notification settings). The company sets the default way (email, WhatsApp or both) and which numbers
 * count (profile, checkout or both); the customer may override the way, choose "essential messages only", and give or remove their WhatsApp number.
 * A number from a source the company accepts is taken as willingness to get updates there; its time and source are stored. Choosing "email only" always wins.
 */
class NotificationPreferences
{
    public function __construct(private NotifySettings $settings, private ChannelResolver $resolver, private Recipients $recipients) {}

    /** Has script 108 been run (the customer columns exist)? */
    public static function ready(): bool
    {
        return Schema::hasColumn('customers', 'notify_mode');
    }

    /** @return array<string,mixed> what the screen shows */
    public function show(Customer $c): array
    {
        $g = $this->settings->get('general');
        $person = $this->recipients->for($c)['person'];
        $plan = $this->resolver->resolve($g, [], true, $person);

        return [
            'ready' => self::ready(),
            'mode' => $c->notify_mode ?? null,
            'essential_only' => $c->notify_essential_only,
            'whatsapp' => $c->whatsapp,
            'whatsapp_source' => $c->whatsapp_consent_source,
            'whatsapp_since' => $c->whatsapp_consent_at?->toIso8601String(),
            'company' => ['default_mode' => $g['default_mode'], 'email_enabled' => (bool) $g['email_enabled'], 'whatsapp_enabled' => (bool) $g['whatsapp_enabled'],
                'number_sources' => $g['whatsapp_number_sources'], 'essential_only_default' => (bool) $g['essential_only_default']],
            // what an order update would use right now, so the choice can be checked at a glance
            'now' => ['email' => in_array('email', $plan['channels'], true), 'whatsapp' => in_array('whatsapp', $plan['channels'], true), 'skipped' => $plan['skipped']],
        ];
    }

    /**
     * @param  array{mode?: ?string, essential_only?: ?bool, whatsapp?: ?string}  $in  mode default|email|whatsapp|both ("default" = follow the company); essential_only null = follow the company
     * @return array<string,mixed>
     */
    public function save(Customer $c, array $in): array
    {
        if (! self::ready()) {
            throw new NotifyException('Notification settings are not switched on yet.');
        }
        if (array_key_exists('mode', $in)) {
            $mode = $in['mode'] === 'default' || $in['mode'] === '' ? null : $in['mode'];
            if ($mode !== null && ! in_array($mode, ['email', 'whatsapp', 'both'], true)) {
                throw ValidationException::withMessages(['mode' => 'Choose email, WhatsApp, both, or the company default.']);
            }
            $c->notify_mode = $mode;
        }
        if (array_key_exists('essential_only', $in)) {
            $c->notify_essential_only = $in['essential_only'] === null ? null : (bool) $in['essential_only'];
        }
        if (array_key_exists('whatsapp', $in)) {
            $number = trim((string) $in['whatsapp']);
            if ($number === '') {
                $c->whatsapp = null;
                $c->whatsapp_consent_at = null;
                $c->whatsapp_consent_source = null;
            } else {
                if (CompanyProfile::waDigits($number) === null) {
                    throw ValidationException::withMessages(['whatsapp' => 'Enter the number with its country code, for example +254 712 345 678.']);
                }
                if ($number !== trim((string) $c->whatsapp)) {
                    $c->whatsapp = $number;
                    $c->whatsapp_consent_at = now();
                    $c->whatsapp_consent_source = 'profile';
                }
            }
        }
        $c->save();

        return $this->show($c->fresh());
    }

    /**
     * The phone given at checkout: if the customer has no WhatsApp number yet (and has not chosen "email only"), it becomes their WhatsApp number from the "checkout"
     * source. Whether that source counts is the company's setting (General → which numbers count); it is only recorded here.
     */
    public function noteCheckoutNumber(Customer $c, ?string $phone): void
    {
        try {
            if (! self::ready() || $c->notify_mode === 'email' || trim((string) $c->whatsapp) !== '' || CompanyProfile::waDigits($phone) === null) {
                return;
            }
            $c->forceFill(['whatsapp' => trim((string) $phone), 'whatsapp_consent_at' => now(), 'whatsapp_consent_source' => 'checkout'])->save();
        } catch (\Throwable $e) {
            report($e);
        }
    }
}
