<?php

namespace App\Traits;

use App\Models\Logs\CurrencyActivityLog;

trait LogsCurrencyActivity
{
    use LogsActivity;

    protected function activityLogModel(): string
    {
        return CurrencyActivityLog::class;
    }
}
