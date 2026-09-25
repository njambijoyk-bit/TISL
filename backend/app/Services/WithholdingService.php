<?php

namespace App\Services;

use App\Models\Customer;
use App\Models\TaxApplication;
use App\Models\TaxLegitimacyCertificate;
use App\Models\WithholdingCertificate;
use App\Models\WithholdingCredit;
use Illuminate\Support\Facades\DB;

/**
 * Resolves and applies withheld-mode tax for a payment to a verified
 * withholding agent, writing the matching TaxApplication (audit row),
 * WithholdingCertificate (proof of this specific deduction), and
 * WithholdingCredit (the claimable side) atomically.
 */
class WithholdingService
{
    /**
     * @return array{
     *   certificate: ?WithholdingCertificate,
     *   credit: ?WithholdingCredit,
     *   application: ?TaxApplication,
     *   gross_amount: float,
     *   withheld_amount: float,
     *   net_amount: float,
     * }|null  Null when withholding does not apply at all: not an agent,
     *         not a currently-verified agent, no classification assigned,
     *         or no current rate exists for that classification.
     */
    public function process(
        Customer $customer,
        float $grossAmount,
        ?int $orderId = null,
        ?int $orderItemId = null,
        $on = null,
        bool $persist = true
    ): ?array {
        if (!$customer->is_withholding_agent || !$customer->isVerifiedWithholdingAgent($on)) {
            return null;
        }

        $classification = $customer->withholdingClassification;
        if ($classification === null) {
            return null;
        }

        $rate = $classification->currentRate($on);
        if ($rate === null) {
            return null;
        }

        $withheldAmount = $rate->calculate($grossAmount);
        $netAmount      = round($grossAmount - $withheldAmount, 2);

        if (!$persist) {
            return [
                'certificate'     => null,
                'credit'          => null,
                'application'     => null,
                'gross_amount'    => $grossAmount,
                'withheld_amount' => $withheldAmount,
                'net_amount'      => $netAmount,
            ];
        }

        $authorizingCertificate = $this->resolveAgentCertificate($customer, $on);

        return DB::transaction(function () use (
            $customer, $rate, $classification, $grossAmount, $withheldAmount, $netAmount,
            $orderId, $orderItemId, $authorizingCertificate
        ) {
            $application = TaxApplication::create([
                'order_id'       => $orderId,
                'order_item_id'  => $orderItemId,
                'tax_rate_id'    => $rate->id,
                'classification' => $classification->code,
                'base_amount'    => $grossAmount,
                'tax_amount'     => $withheldAmount,
            ]);

            $certificate = WithholdingCertificate::create([
                'tax_application_id'         => $application->id,
                'customer_id'                => $customer->id,
                'authorizing_certificate_id' => $authorizingCertificate?->id,
                'certificate_number'         => $this->generateCertificateNumber(),
                'gross_amount'               => $grossAmount,
                'withheld_amount'            => $withheldAmount,
                'net_amount'                 => $netAmount,
                'status'                     => WithholdingCertificate::STATUS_PENDING,
            ]);

            $credit = WithholdingCredit::create([
                'withholding_certificate_id' => $certificate->id,
                'customer_id'                => $customer->id,
                'amount'                     => $withheldAmount,
                'status'                     => WithholdingCredit::STATUS_HELD,
            ]);

            return [
                'certificate'     => $certificate,
                'credit'          => $credit,
                'application'     => $application,
                'gross_amount'    => $grossAmount,
                'withheld_amount' => $withheldAmount,
                'net_amount'      => $netAmount,
            ];
        });
    }

    private function resolveAgentCertificate(Customer $customer, $on = null): ?TaxLegitimacyCertificate
    {
        return TaxLegitimacyCertificate::query()
            ->forHolder($customer)
            ->withholdingAgent()
            ->currentlyValid($on)
            ->latest('issued_at')
            ->first();
    }

    /** WHT-YYYYMMDD-XXXXXX, retried on the rare collision since certificate_number is unique. */
    private function generateCertificateNumber(): string
    {
        do {
            $candidate = 'WHT-' . now()->format('Ymd') . '-' . str_pad((string) random_int(0, 999999), 6, '0', STR_PAD_LEFT);
        } while (WithholdingCertificate::where('certificate_number', $candidate)->exists());

        return $candidate;
    }
}
