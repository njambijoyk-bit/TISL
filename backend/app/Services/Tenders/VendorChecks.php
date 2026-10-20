<?php

namespace App\Services\Tenders;

use App\Models\Vendor;

/**
 * What the system can prove is wrong or missing about a vendor, from the data alone. The result is a list of flags with a plain reason each.
 * A flag never approves or refuses anyone: a person decides, and writes why.
 */
class VendorChecks
{
    /** @return array<int, array{code: string, text: string}> */
    public function flags(Vendor $v): array
    {
        $flags = [];
        $add = function (string $code, string $text) use (&$flags) {
            $flags[] = ['code' => $code, 'text' => $text];
        };

        if (! trim((string) $v->tax_id)) {
            $add('no_tax_pin', 'The tax PIN is missing.');
        }
        if (! trim((string) $v->registration_number)) {
            $add('no_registration', 'The company registration number is missing.');
        }
        if (! $v->is_verified) {
            $add('not_verified', 'The vendor has not been verified yet.');
        }
        if ($v->status === 'suspended') {
            $add('suspended', 'The vendor is suspended.');
        }
        if ($v->special_group) {
            if (! trim((string) $v->special_group_certificate)) {
                $add('no_group_certificate', 'A people category is set but no certificate number is recorded.');
            }
            if (! $v->special_group_valid_until) {
                $add('no_group_expiry', 'A people category is set but the certificate has no expiry date.');
            } elseif ($v->special_group_valid_until->isPast()) {
                $add('group_certificate_expired', 'The people-category certificate expired on ' . $v->special_group_valid_until->format('j M Y') . '.');
            }
        }

        return $flags;
    }

    /** Extra checks on a pre-qualification record being made. */
    public function forDecision(Vendor $v, string $status, ?string $validUntil): array
    {
        $flags = $this->flags($v);
        if ($status === 'qualified' && $validUntil) {
            $until = \Carbon\Carbon::parse($validUntil);
            if ($until->isPast()) {
                $flags[] = ['code' => 'already_expired', 'text' => 'The valid-until date is already in the past.'];
            } elseif ($until->gt(now()->addYears(3))) {
                $flags[] = ['code' => 'very_long', 'text' => 'The valid-until date is more than 3 years away.'];
            }
        }

        return $flags;
    }
}
