<?php

namespace App\Traits\Ecommerce;

use App\Models\Logs\ProductActivityLog;
use App\Traits\LogsActivity;

trait LogsProductActivity
{
    use LogsActivity;

    protected function activityLogModel(): string
    {
        return ProductActivityLog::class;
    }
}
