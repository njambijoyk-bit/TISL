<?php

namespace App\Console\Commands;

use App\Services\Courses\CourseAttendance;
use Illuminate\Console\Command;

class CoursesAttendanceWarnings extends Command
{
    protected $signature = 'courses:attendance-warnings';

    protected $description = 'Courses: tell students who are behind on attendance, or can no longer reach the share needed, once for each; complete enrolments whose last class has ended.';

    public function handle(CourseAttendance $attendance): int
    {
        $n = $attendance->warn();
        if ($n) {
            $this->info("Courses: {$n} attendance warning(s) sent.");
        }
        $done = $attendance->completeFinished();   // the last class ended since anyone touched the register
        if ($done) {
            $this->info("Courses: {$done} enrolment(s) completed.");
        }

        return self::SUCCESS;
    }
}
