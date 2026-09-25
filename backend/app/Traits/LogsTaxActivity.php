<?php

namespace App\Traits;

use App\Models\Logs\TaxActivityLog;

trait LogsTaxActivity
{
    use LogsActivity;

    protected function activityLogModel(): string
    {
        return TaxActivityLog::class;
    }
}
