<?php

namespace App\Console\Commands;

use App\Services\Books\BooksException;
use App\Services\Books\GiftVoucherService;
use Illuminate\Console\Command;

class ExpireGiftVouchers extends Command
{
    protected $signature   = 'giftvouchers:expire';
    protected $description = 'Expire unspent gift vouchers past their date into breakage income.';

    public function handle(GiftVoucherService $service): int
    {
        try {
            $count = $service->expireDue();
        } catch (BooksException $e) {
            $this->error($e->getMessage());

            return Command::FAILURE;
        }
        $this->info("Expired {$count} gift voucher(s).");

        return Command::SUCCESS;
    }
}
