<?php

namespace App\Console\Commands;

use App\Services\Notify\Replies\ReplyMailboxReader;
use Illuminate\Console\Command;

/** Reads the replies mailbox and files what came in (docs/PROJECTS_STAGE6_SPEC.md, build 6.5). Nothing happens until a mailbox is named in Notifications settings. */
class ReadReplies extends Command
{
    protected $signature = 'notifications:read-replies';

    protected $description = 'Read the replies mailbox and file each reply into what it answers';

    public function handle(ReplyMailboxReader $reader): int
    {
        $r = $reader->run();
        $this->info("Read {$r['read']}: filed {$r['filed']}, waiting {$r['waiting']}." . ($r['error'] ? " Problem: {$r['error']}" : ''));

        return $r['error'] ? self::FAILURE : self::SUCCESS;
    }
}
