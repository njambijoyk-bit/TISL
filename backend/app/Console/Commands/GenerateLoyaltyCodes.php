<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use App\Models\Customer;
use App\Services\PromoCodeService;

class GenerateLoyaltyCodes extends Command
{
    protected $signature   = 'promo:loyalty
                                {--customer= : Run for a specific customer ID only}
                                {--dry-run  : Preview without creating codes}';
    protected $description = 'Generate loyalty milestone codes. Normally called per-customer on order confirm, but can be run in bulk.';

    public function handle(PromoCodeService $service): int
    {
        $this->info('🎯 Checking loyalty milestones...');

        $milestones = array_keys(PromoCodeService::LOYALTY_MILESTONES);

        // Single customer mode (called programmatically from OrderController)
        if ($customerId = $this->option('customer')) {
            $customer = Customer::find($customerId);
            if (!$customer) {
                $this->error("Customer {$customerId} not found.");
                return self::FAILURE;
            }

            if ($this->option('dry-run')) {
                $this->info("Customer #{$customer->id} has {$customer->total_orders} orders.");
                $this->info(in_array($customer->total_orders, $milestones)
                    ? "Would generate loyalty code for milestone {$customer->total_orders}."
                    : "No milestone reached.");
                return self::SUCCESS;
            }

            $code = $service->checkAndGenerateLoyaltyCode($customer);
            $code
                ? $this->info("✓ Generated loyalty code {$code->code} for {$customer->full_name}.")
                : $this->line("No milestone reached for {$customer->full_name}.");

            return self::SUCCESS;
        }

        // Bulk mode — check all customers at milestone counts
        $generated = 0;
        $skipped   = 0;

        $customers = Customer::whereIn('total_orders', $milestones)
            ->where('status', 'active')
            ->get();

        foreach ($customers as $customer) {
            if ($this->option('dry-run')) {
                $this->line("Would check: {$customer->full_name} ({$customer->total_orders} orders)");
                continue;
            }

            $code = $service->checkAndGenerateLoyaltyCode($customer);
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