<?php

namespace App\Console\Commands;

use App\Services\Projects\ProjectCertificates;
use Illuminate\Console\Command;

/** Tells people and their managers about certificates running out (Projects build 8.2): 60, 30 and 7 days before, and on the day. */
class ProjectsCertificateWarnings extends Command
{
    protected $signature = 'projects:certificate-warnings';

    protected $description = 'Warn people and their managers about certificates running out';

    public function handle(ProjectCertificates $certificates): int
    {
        $this->info($certificates->warn() . ' warnings sent.');

        return self::SUCCESS;
    }
}
