<?php

namespace App\Traits;

use App\Models\Logs\WithholdingActivityLog;

trait LogsWithholdingActivity
{
    use LogsActivity;

    protected function activityLogModel(): string
    {
        return WithholdingActivityLog::class;
    }
}
