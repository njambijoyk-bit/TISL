<?php

namespace App\Console\Commands;

use App\Services\Books\VoucherTemplateService;
use Illuminate\Console\Command;

/** Leaves a draft in the inbox for every repeating voucher template that has fallen due. Posts nothing. */
class MakeVoucherTemplateDrafts extends Command
{
    protected $signature = 'books:template-drafts';

    protected $description = 'Leave drafts for the repeating voucher templates that are due';

    public function handle(VoucherTemplateService $templates): int
    {
        if (! VoucherTemplateService::ready()) {
            return self::SUCCESS;
        }
        $n = $templates->makeDue();
        $this->info($n . ' draft(s) left in the inbox.');

        return self::SUCCESS;
    }
}
