<?php

namespace App\Services\Notify;

/**
 * Which channels a message uses for a person (the rules in docs/NOTIFICATIONS_PLAN.md, "Who gets what"). Pure: no database, so the whole table of cases can be tested.
 *
 * $company  the general settings: default_mode, email_enabled, whatsapp_enabled, whatsapp_number_sources, essential_only_default
 * $rule     this type's company rule: enabled (bool), channels (null = any)
 * $person   kind customer|staff|other, has_account, email, whatsapp (number), whatsapp_source profile|checkout|null, mode (null = company default), essential_only (null = company default)
 *
 * @return array{channels: string[], skipped: array<string,string>, staff_list: bool}
 */
class ChannelResolver
{
    public function resolve(array $company, array $rule, bool $essential, array $person): array
    {
        $channels = [];
        $skipped = [];
        if (! empty($person['has_account'])) {
            $channels[] = 'database';
        }
        if (($rule['enabled'] ?? true) === false) {
            return ['channels' => $channels, 'skipped' => $skipped, 'staff_list' => false];   // the company switched this type off: the bell only
        }
        $allowed = $rule['channels'] ?? ['email', 'whatsapp'];
        $email = $this->emailOk($company, $person);
        $wa = $this->whatsappOk($company, $person);

        if (($person['kind'] ?? 'other') !== 'customer') {
            // staff and other accounts: email when allowed and possible; no personal preferences
            if (in_array('email', $allowed, true)) {
                $email === true ? $channels[] = 'email' : $skipped['email'] = $email;
            }

            return ['channels' => $channels, 'skipped' => $skipped, 'staff_list' => false];
        }

        $essentialOnly = $person['essential_only'] ?? (bool) ($company['essential_only_default'] ?? false);
        if (! $essential && $essentialOnly) {
            $skipped['email'] = $skipped['whatsapp'] = 'essential_only';

            return ['channels' => $channels, 'skipped' => $skipped, 'staff_list' => false];
        }
        $mode = $person['mode'] ?: ($company['default_mode'] ?? 'both');
        $wanted = match ($mode) { 'email' => ['email'], 'whatsapp' => ['whatsapp'], default => ['email', 'whatsapp'] };

        $use = [];
        foreach ($wanted as $ch) {
            if (! in_array($ch, $allowed, true)) {
                $skipped[$ch] = 'type_channels';
                continue;
            }
            $ok = $ch === 'email' ? $email : $wa;
            $ok === true ? $use[] = $ch : $skipped[$ch] = $ok;
        }
        // an essential message is never silent: if the chosen way can not be used, try the other one
        if (! $use && $essential) {
            foreach (['email', 'whatsapp'] as $ch) {
                if (! in_array($ch, $wanted, true) && in_array($ch, $allowed, true) && ($ch === 'email' ? $email : $wa) === true) {
                    $use[] = $ch;
                    unset($skipped[$ch]);
                }
            }
        }
        $channels = array_merge($channels, $use);

        return ['channels' => $channels, 'skipped' => $skipped, 'staff_list' => $essential && ! $use];
    }

    /** true, or the reason it can not be used. */
    private function emailOk(array $company, array $person): bool|string
    {
        if (! ($company['email_enabled'] ?? true)) {
            return 'email_off';
        }

        return filter_var($person['email'] ?? '', FILTER_VALIDATE_EMAIL) ? true : 'no_email';
    }

    private function whatsappOk(array $company, array $person): bool|string
    {
        if (! ($company['whatsapp_enabled'] ?? false)) {
            return 'whatsapp_off';
        }
        if (strlen(preg_replace('/\D+/', '', (string) ($person['whatsapp'] ?? ''))) < 8) {
            return 'no_number';
        }
        $source = $person['whatsapp_source'] ?? null;
        $counts = $company['whatsapp_number_sources'] ?? 'both';
        if (! in_array($source, ['profile', 'checkout'], true) || ($counts !== 'both' && $counts !== $source)) {
            return 'number_source';
        }

        return true;
    }
}
