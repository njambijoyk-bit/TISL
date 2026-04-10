<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use App\Models\Customer;
use App\Services\PromoCodeService;

class GenerateVipCodes extends Command
{
    protected $signature   = 'promo:vip
                                {--customer= : Run for a specific customer ID}
                                {--tier=     : Tier to generate for (gold or platinum)}
                                {--dry-run  : Preview without creating codes}';
    protected $description = 'Generate VIP upgrade promo codes. Normally triggered on tier upgrade, but can be run in bulk.';

    public function handle(PromoCodeService $service): int
    {
        $this->info('🏆 Generating VIP upgrade codes...');

        // Single customer mode
        if ($customerId = $this->option('customer')) {
            $customer = Customer::find($customerId);
            if (!$customer) {
                $this->error("Customer {$customerId} not found.");
                return self::FAILURE;
            }

            $tier = $this->option('tier') ?? $customer->tier;

            if (!in_array($tier, ['gold', 'platinum'])) {
                $this->warn("Customer is {$customer->tier} tier — no VIP code needed.");
                return self::SUCCESS;
            }

            if ($this->option('dry-run')) {
                $this->info("Would generate {$tier} VIP code for {$customer->full_name}.");
                return self::SUCCESS;
            }

            $code = $service->generateVipCode($customer, $tier);
            $code
                ? $this->info("✓ Generated VIP code {$code->code} for {$customer->full_name}.")
                : $this->line("Code already exists or tier not eligible.");

            return self::SUCCESS;
        }

        // Bulk mode — find all gold/platinum customers without a VIP code
        $generated = 0;
        $skipped   = 0;

        $customers = Customer::whereIn('tier', ['gold', 'platinum'])
            ->where('status', 'active')
            ->get();

        foreach ($customers as $customer) {
            if ($this->option('dry-run')) {
                $this->line("Would check: {$customer->full_name} ({$customer->tier})");
                continue;
            }

            $code = $service->generateVipCode($customer, $customer->tier);
            $code ? $generated++ : $skipped++;
        }

        if (!$this->option('dry-run')) {
            $this->table(
                ['Generated', 'Already Had Code'],
                [[$generated, $skipped]]
            );
        }

        $this->info('✓ Done.');
        return self::SUCCESS;
    }
}