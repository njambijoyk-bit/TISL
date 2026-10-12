<?php

namespace App\Console\Commands;

use App\Services\Courses\EnrolmentService;
use Illuminate\Console\Command;

class CoursesSweep extends Command
{
    protected $signature = 'courses:sweep';

    protected $description = 'Courses: let unpaid enrolments go, hold access back for late instalments, remind of payments coming due.';

    public function handle(EnrolmentService $enrolments, \App\Services\Courses\CertificateService $certificates): int
    {
        $certificates->remindExpiring();
        $r = $enrolments->sweep();
        if ($r['released'] || $r['held'] || $r['reminded']) {
            $this->info("Courses: {$r['released']} unpaid enrolment(s) released, {$r['held']} held back for late payment, {$r['reminded']} reminder(s) sent.");
        }

        return self::SUCCESS;
    }
}
