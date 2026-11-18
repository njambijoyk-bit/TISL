<?php

namespace App\Services\Notify\Replies;

use App\Services\Notify\NotifyException;

/**
 * Reads the replies mailbox over IMAP (owner's choice 1): unseen mail, each fetched whole without marking it, then marked seen once kept.
 * Plain sockets and TLS, so no PHP extension is needed. `$transport` is given only by tests, which script the server's answers.
 */
class ImapMailbox
{
    private int $tag = 0;

    /** @param array{host: string, port: int, encryption: string, username: string, password: string} $c */
    public function __construct(private array $c, private ?ImapTransport $transport = null) {}

    /** @return array<int, array{uid: string, raw: string}> up to $limit unseen messages */
    public function unseen(int $limit = 50): array
    {
        $this->open();
        $found = $this->command('UID SEARCH UNSEEN');
        $uids = [];
        foreach ($found as $line) {
            if (preg_match('/^\* SEARCH ?(.*)$/i', $line, $m)) {
                $uids = array_merge($uids, array_filter(explode(' ', trim($m[1]))));
            }
        }
        $out = [];
        foreach (array_slice($uids, 0, $limit) as $uid) {
            $raw = '';
            foreach ($this->command("UID FETCH {$uid} (BODY.PEEK[])", true) as $chunk) {
                if (is_array($chunk)) {
                    $raw = $chunk['literal'];
                }
            }
            $out[] = ['uid' => (string) $uid, 'raw' => $raw];
        }

        return $out;
    }

    public function markSeen(string $uid): void
    {
        $this->command('UID STORE ' . preg_replace('/\D+/', '', $uid) . ' +FLAGS (\Seen)');
    }

    public function close(): void
    {
        try {
            $this->transport?->write('a' . (++$this->tag) . " LOGOUT\r\n");
        } catch (\Throwable) {
        }
        $this->transport?->close();
        $this->transport = null;
    }

    // ------------------------------------------------------------------ inside

    private function open(): void
    {
        if (! $this->transport || ! $this->transport->isOpen()) {
            $this->transport ??= SocketImapTransport::connect($this->c['host'], (int) $this->c['port'], $this->c['encryption']);
        }
        $greeting = $this->transport->readLine();
        if (! str_starts_with($greeting, '* OK') && ! str_starts_with($greeting, '* PREAUTH')) {
            throw new NotifyException('The mail server did not greet us: ' . trim($greeting));
        }
        if ($this->c['encryption'] === 'tls') {
            $this->command('STARTTLS');
            $this->transport->startTls();
        }
        $this->command('LOGIN ' . $this->quote($this->c['username']) . ' ' . $this->quote($this->c['password']));
        $this->command('SELECT INBOX');
    }

    /** Send a command and read to its tagged answer. With $literals, a {n} literal is returned as ['literal' => bytes]. @return array<int, string|array{literal: string}> */
    private function command(string $cmd, bool $literals = false): array
    {
        $tag = 'a' . (++$this->tag);
        $this->transport->write("{$tag} {$cmd}\r\n");
        $out = [];
        while (true) {
            $line = $this->transport->readLine();
            if (preg_match('/\{(\d+)\}\r?\n?$/', $line, $m)) {
                $bytes = $this->transport->read((int) $m[1]);
                $out[] = $literals ? ['literal' => $bytes] : $line;
                continue;
            }
            if (str_starts_with($line, "{$tag} ")) {
                if (! preg_match("/^{$tag} OK/i", $line)) {
                    $said = trim(substr($line, strlen($tag) + 1));
                    throw new NotifyException(str_starts_with($cmd, 'LOGIN') ? "The mail server refused the sign-in: {$said}" : "The mail server said: {$said}");
                }

                return $out;
            }
            $out[] = rtrim($line, "\r\n");
        }
    }

    private function quote(string $v): string
    {
        return '"' . str_replace(['\\', '"'], ['\\\\', '\\"'], $v) . '"';
    }
}
