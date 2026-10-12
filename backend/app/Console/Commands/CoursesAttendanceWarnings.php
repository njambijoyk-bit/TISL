<?php

namespace App\Console\Commands;

use App\Services\Courses\CourseAttendance;
use Illuminate\Console\Command;

class CoursesAttendanceWarnings extends Command
{
    protected $signature = 'courses:attendance-warnings';

    protected $description = 'Courses: tell students who are behind on attendance, or can no longer reach the share needed, once for each.';

    public function handle(CourseAttendance $attendance): int
    {
        $n = $attendance->warn();
        if ($n) {
            $this->info("Courses: {$n} attendance warning(s) sent.");
        }

        return self::SUCCESS;
    }
}
