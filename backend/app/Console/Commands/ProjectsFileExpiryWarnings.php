<?php

namespace App\Console\Commands;

use App\Services\Projects\ProjectRegisters;
use Illuminate\Console\Command;

/** Tells the lead and whoever added it about a file on a piece of work running out (Projects build 9.4). */
class ProjectsFileExpiryWarnings extends Command
{
    protected $signature = 'projects:file-expiry-warnings';

    protected $description = 'Warn about files on pieces of work running out (permits, certificates)';

    public function handle(ProjectRegisters $registers): int
    {
        $this->info($registers->warnExpiry() . ' warnings sent.');

        return self::SUCCESS;
    }
}
