<?php

namespace App\Traits;

use App\Models\Logs\ProductActivityLog;

trait LogsProductActivity
{
    use LogsActivity;

    protected function activityLogModel(): string
    {
        return ProductActivityLog::class;
    }
}
