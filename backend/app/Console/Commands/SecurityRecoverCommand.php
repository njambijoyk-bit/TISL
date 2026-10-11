<?php

namespace App\Console\Commands;

use App\Models\User;
use App\Services\Security\BreakGlass;
use Illuminate\Console\Command;

/** The owner's last way back in: see docs/HOSTING_SECURITY.md ("When nobody can sign in"). Runs on the server only; every use is logged and told to the people who manage security. */
class SecurityRecoverCommand extends Command
{
    protected $signature = 'security:recover {email : the account to give a way back to} {--keep-passkeys : leave its passkeys as they are} {--temporary-password : also set a temporary password (shown once, must be changed at the next sign-in)} {--yes : do not ask}';

    protected $description = 'Emergency recovery for an account nobody can get into: ends its sign-ins, removes its passkeys, makes new recovery codes';

    public function handle(BreakGlass $glass): int
    {
        $user = User::where('email', strtolower(trim((string) $this->argument('email'))))->first();
        if (! $user) {
            $this->error('There is no account with that email.');

            return self::FAILURE;
        }
        $this->line("Account: {$user->name} <{$user->email}> ({$user->role})");
        $this->line('This will: end every sign-in of the account'.($this->option('keep-passkeys') ? '' : ', take away all its passkeys').', make a new set of recovery codes'.($this->option('temporary-password') ? ', set a temporary password' : '').'.');
        $this->line('The person, and everyone who can change the security rules, will be told, and it is written to the sign-in log.');
        if (! $this->option('yes') && ! $this->confirm('Go ahead?', false)) {
            $this->line('Nothing was changed.');

            return self::SUCCESS;
        }

        $r = $glass->run($user, (bool) $this->option('keep-passkeys'), (bool) $this->option('temporary-password'), 'the server console ('.(get_current_user() ?: 'unknown user').')');

        $this->info("Done. {$r['sessions_ended']} sign-in(s) ended, {$r['passkeys_removed']} passkey(s) taken away.");
        if ($r['codes']) {
            $this->line('');
            $this->line('Recovery codes (shown once, each works once; give them to the person in person, not by email):');
            foreach ($r['codes'] as $code) {
                $this->line('  '.$code);
            }
        }
        if ($r['password'] !== null) {
            $this->line('');
            $this->line("Temporary password (shown once, must be changed at the next sign-in): {$r['password']}");
        }
        foreach ($r['notes'] as $note) {
            $this->warn($note);
        }
        $this->line('');
        $this->line('Next: they sign in with their password (or the temporary one), use a code to add a new passkey, and make fresh recovery codes.');

        return self::SUCCESS;
    }
}
