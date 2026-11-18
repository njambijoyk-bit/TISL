<?php

namespace App\Services\Notify\Replies;

use App\Services\Notify\NotifyException;

/** IMAP over a socket: ssl (port 993) straight away, tls by STARTTLS, or none. */
class SocketImapTransport implements ImapTransport
{
    /** @param resource $s */
    private function __construct(private $s) {}

    public static function connect(string $host, int $port, string $encryption): self
    {
        $ctx = stream_context_create(['ssl' => ['verify_peer' => true, 'verify_peer_name' => true, 'SNI_enabled' => true, 'peer_name' => $host]]);
        $s = @stream_socket_client(($encryption === 'ssl' ? 'ssl://' : 'tcp://') . "{$host}:{$port}", $no, $err, 20, STREAM_CLIENT_CONNECT, $ctx);
        if (! $s) {
            throw new NotifyException("The mail server {$host}:{$port} could not be reached: {$err}");
        }
        stream_set_timeout($s, 30);

        return new self($s);
    }

    public function write(string $data): void
    {
        if (@fwrite($this->s, $data) === false) {
            throw new NotifyException('The connection to the mail server was lost.');
        }
    }

    public function readLine(): string
    {
        $line = fgets($this->s);
        if ($line === false) {
            throw new NotifyException('The mail server stopped answering.');
        }

        return $line;
    }

    public function read(int $bytes): string
    {
        $out = '';
        while (strlen($out) < $bytes) {
            $chunk = fread($this->s, $bytes - strlen($out));
            if ($chunk === false || $chunk === '') {
                throw new NotifyException('The mail server stopped answering in the middle of a message.');
            }
            $out .= $chunk;
        }

        return $out;
    }

    public function startTls(): void
    {
        if (! @stream_socket_enable_crypto($this->s, true, STREAM_CRYPTO_METHOD_TLS_CLIENT)) {
            throw new NotifyException('The mail server would not start a secure connection.');
        }
    }

    public function isOpen(): bool
    {
        return is_resource($this->s) && ! feof($this->s);
    }

    public function close(): void
    {
        if (is_resource($this->s)) {
            fclose($this->s);
        }
    }
}
