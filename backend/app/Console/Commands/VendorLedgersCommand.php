<?php

namespace App\Console\Commands;

use App\Models\Books\Ledger;
use App\Models\Vendor;
use App\Services\Books\LedgerService;
use Illuminate\Console\Command;

class VendorLedgersCommand extends Command
{
    protected $signature = 'vendors:ledgers';

    protected $description = 'Give every active vendor its Sundry Creditors ledger (vendors approved before this was automatic are missing from the Purchase supplier list). Safe to re-run.';

    public function handle(LedgerService $ledgers): int
    {
        $made = 0;
        Vendor::where('status', 'active')->orderBy('id')->each(function (Vendor $v) use ($ledgers, &$made) {
            $had = Ledger::where('supplier_id', $v->id)->exists();
            $ledgers->vendorLedger($v);
            if (! $had) {
                $made++;
                $this->line("Ledger created for {$v->vendor_number} {$v->company_name}");
            }
        });
        $this->info($made ? "{$made} ledger(s) created." : 'Every active vendor already has a ledger.');

        return self::SUCCESS;
    }
}
