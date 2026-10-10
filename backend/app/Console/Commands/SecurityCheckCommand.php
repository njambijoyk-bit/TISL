<?php

namespace App\Console\Commands;

use App\Services\Security\SecurityCheck;
use Illuminate\Console\Command;

/** Is this server set up safely? Looks at the settings, the database and the accounts, and says what to fix. Exit code 1 when something that must work does not. */
class SecurityCheckCommand extends Command
{
    protected $signature = 'security:check {--fix : make accounts still on a well-known password choose a new one at the next sign-in} {--no-passwords : skip the slow check of every account\'s password}';

    protected $description = 'Check the server and accounts for unsafe settings and well-known passwords';

    public function handle(SecurityCheck $check): int
    {
        $failed = 0;
        foreach ($check->run(! $this->option('no-passwords')) as $r) {
            $tag = ['ok' => '<info>  OK  </info>', 'warn' => '<comment> WARN </comment>', 'fail' => '<error> FAIL </error>', 'note' => ' NOTE '][$r['status']];
            $this->line("{$tag} {$r['label']}");
            if ($r['advice']) {
                $this->line("         {$r['advice']}");
            }
            $failed += $r['status'] === SecurityCheck::FAIL ? 1 : 0;
        }
        if ($this->option('fix') && ! $this->option('no-passwords')) {
            $n = $check->fix($check->accountsOnDefaultPasswords());
            $this->info($n ? "{$n} account(s) must now choose a new password at their next sign-in, and were signed out. (They still count above until they have chosen one.)" : 'No account needed fixing.');
        }

        return $failed ? self::FAILURE : self::SUCCESS;
    }
}
