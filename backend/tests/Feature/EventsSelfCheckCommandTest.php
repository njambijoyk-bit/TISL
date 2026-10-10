<?php

namespace Tests\Feature;

use Tests\TestCase;

/** `events:selfcheck` is meant to be run on the real database (the books' own tables are not in the repo, so a test can not stand them up): what is proved here is that it refuses to run without what it needs. */
class EventsSelfCheckCommandTest extends TestCase
{
    use Concerns\CreatesEventTables;

    public function test_it_refuses_to_run_without_the_accounts_it_needs(): void
    {
        $this->createEventTables();
        $this->artisan('events:selfcheck')->expectsOutputToContain('Give --income')->assertExitCode(2);
        $this->artisan('events:selfcheck', ['--income' => 40, '--till' => 999])->expectsOutputToContain('Give --income')->assertExitCode(2);
    }
}
