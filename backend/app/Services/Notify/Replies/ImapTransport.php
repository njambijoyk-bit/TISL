<?php

namespace App\Services\Notify\Replies;

/** The line-and-bytes conversation with an IMAP server: a socket in real life, a script in the tests. */
interface ImapTransport
{
    public function write(string $data): void;

    /** One line, with its line ending. */
    public function readLine(): string;

    /** Exactly $bytes bytes. */
    public function read(int $bytes): string;

    public function startTls(): void;

    public function isOpen(): bool;

    public function close(): void;
}
