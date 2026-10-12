<?php

namespace App\Console\Commands;

use App\Services\Courses\LiveReminders;
use Illuminate\Console\Command;

class CoursesLiveReminders extends Command
{
    protected $signature = 'courses:live-reminders';

    protected $description = 'Courses: remind students of a live class a day before and within the hour before it starts.';

    public function handle(LiveReminders $reminders): int
    {
        $n = $reminders->run();
        if ($n) {
            $this->info("Courses: {$n} live class reminder(s) sent.");
        }

        return self::SUCCESS;
    }
}
