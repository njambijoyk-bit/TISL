<?php

namespace App\Services\Books;

use App\Models\Books\Voucher;
use App\Models\Books\VoucherType;
use App\Models\Location;
use App\Models\User;
use Illuminate\Support\Facades\Schema;

/**
 * The admin notes of a voucher: a system-made record of its own metadata, kept as JSON and rebuilt on every save. Nobody types it (it is not fillable, and the form only shows it), and it is
 * shown to staff only: on the voucher form, the admin voucher view and the admin export, never on a customer's copy or in anything a customer can fetch (the model hides it).
 */
class VoucherAdminNotes
{
    private static ?bool $ready = null;

    public const NOTE = 'System metadata: made by the system on every save. It cannot be edited by hand and is never shown on a customer copy.';

    private const TREATMENTS = [
        'exempt' => 'Exempt: no tax is charged on this voucher',
        'out_of_scope' => 'Out of scope: no tax is charged on this voucher',
        'zero_rated' => 'Zero-rated: lines show a tax of nothing',
    ];

    public static function ready(): bool
    {
        return self::$ready ??= Schema::hasColumn('vouchers', 'admin_notes');
    }

    /** For tests, after the column is added or dropped. */
    public static function forget(): void
    {
        self::$ready = null;
    }

    /**
     * @param  array  $plan  the planned voucher (type, party, currency, location_id)
     * @param  array  $taxes  the tax breakdown of its lines: [['label' => , 'amount' => ]]
     * @param  ?array  $before  the notes the voucher had, when it is being edited
     */
    public function build(array $plan, array $data, array $taxes, ?User $by, ?array $before = null): array
    {
        /** @var VoucherType $type */
        $type = $plan['type'];
        $party = $plan['party'] ?? null;
        $treatment = $party?->tax_nature;
        $now = now()->toIso8601String();
        $who = $by ? ['id' => $by->id, 'name' => $by->name ?? null] : null;

        $notes = [
            'voucher_type' => $type->name,
            'invoice_mode' => ($data['meta']['invoice_mode'] ?? null) === AccountingInvoiceGuard::MODE ? 'accounting' : ($type->has_items ? 'item' : null),
            'party' => $party ? [
                'ledger' => $party->name,
                // what the customer's or supplier's own account says about tax; empty means the sales or purchase account decides
                'tax_treatment' => isset(self::TREATMENTS[$treatment]) ? $treatment : 'follows_account',
                'tax_treatment_note' => self::TREATMENTS[$treatment] ?? "Follows the account's own tax",
            ] : null,
            'taxes_charged' => array_values(array_map(fn ($t) => ['label' => $t['label'], 'amount' => round((float) $t['amount'], 2)], $taxes)),
            'currency' => $plan['currency']->code ?? null,
            'branch' => ($plan['location_id'] ?? null) ? Location::whereKey($plan['location_id'])->value('name') : null,
            'channel' => (string) ($data['channel'] ?? 'admin'),
            'created' => $before['created'] ?? ['by' => $who, 'at' => $now],
            'last_saved' => ['by' => $who, 'at' => $now],
            'times_edited' => $before ? ((int) ($before['times_edited'] ?? 0)) + 1 : 0,
        ];

        return array_filter($notes, fn ($v) => $v !== null && $v !== []) + ['_note' => self::NOTE];   // the note stays the last thing in it
    }

    /** The notes as staff see them: what to print or show, in order, one line each. */
    public static function lines(?array $notes): array
    {
        if (! $notes) {
            return [];
        }
        $out = [];
        if (! empty($notes['invoice_mode'])) {
            $out[] = ['Invoice mode', $notes['invoice_mode'] === 'accounting' ? 'Accounting invoice (ledger lines)' : 'Item invoice'];
        }
        if (! empty($notes['party'])) {
            $out[] = ['Customer / supplier tax', $notes['party']['ledger'] . ': ' . $notes['party']['tax_treatment_note']];
        }
        if (! empty($notes['taxes_charged'])) {
            $out[] = ['Taxes charged', implode('; ', array_map(fn ($t) => $t['label'] . ' ' . number_format($t['amount'], 2), $notes['taxes_charged']))];
        }
        foreach (['branch' => 'Branch', 'currency' => 'Currency', 'channel' => 'Made from'] as $k => $label) {
            if (! empty($notes[$k])) {
                $out[] = [$label, $notes[$k]];
            }
        }
        if (! empty($notes['created'])) {
            $out[] = ['Made', ($notes['created']['by']['name'] ?? 'the system') . ' · ' . ($notes['created']['at'] ?? '')];
        }
        if (! empty($notes['last_saved'])) {
            $out[] = ['Last saved', ($notes['last_saved']['by']['name'] ?? 'the system') . ' · ' . ($notes['last_saved']['at'] ?? '') . ' · edited ' . (int) ($notes['times_edited'] ?? 0) . ' time(s)'];
        }
        $out[] = ['', $notes['_note'] ?? self::NOTE];

        return $out;
    }
}
