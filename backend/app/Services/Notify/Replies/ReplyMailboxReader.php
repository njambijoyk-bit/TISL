<?php

namespace App\Services\Notify\Replies;

use App\Services\Notify\NotifySettings;
use Illuminate\Support\Facades\Cache;

/**
 * Reads the replies mailbox named in Notifications settings → Email (build 6.5) and hands each mail to InboundReplies. Run every five minutes by
 * `notifications:read-replies`. A mail is marked seen only once it is kept, so a failure part-way reads it again next time (kept once by its id).
 */
class ReplyMailboxReader
{
    public const LAST = 'notify_replies_last_read';

    public function __construct(private NotifySettings $settings, private InboundReplies $replies) {}

    public function configured(): bool
    {
        $c = $this->settings->get('email');

        return filter_var($c['replies_address'] ?? '', FILTER_VALIDATE_EMAIL) && ($c['imap_host'] ?? '') !== '' && ($c['imap_username'] ?? '') !== '';
    }

    /** @return array{read: int, filed: int, waiting: int, error: ?string} */
    public function run(?ImapMailbox $box = null): array
    {
        $out = ['read' => 0, 'filed' => 0, 'waiting' => 0, 'error' => null];
        if (! NotifySettings::ready() || ! InboundReplies::ready() || ! $this->configured()) {
            return $out;
        }
        $c = $this->settings->get('email');
        $box ??= new ImapMailbox(['host' => $c['imap_host'], 'port' => (int) ($c['imap_port'] ?: 993), 'encryption' => $c['imap_encryption'] ?: 'ssl', 'username' => $c['imap_username'], 'password' => (string) $c['imap_password']]);
        try {
            foreach ($box->unseen() as $mail) {
                $m = MimeMessage::parse($mail['raw']);
                $r = $this->replies->receive(['channel' => 'email', 'external_id' => $m['message_id'] ?: 'uid:' . $mail['uid'], 'from' => $m['from'], 'from_name' => $m['from_name'],
                    'subject' => $m['subject'], 'body' => $m['body'], 'to' => $m['to'], 'received_at' => $m['date']]);
                $box->markSeen($mail['uid']);
                $out['read']++;
                if (in_array($r['state'], ['filed', 'waiting'], true)) {
                    $out[$r['state']]++;
                }
            }
        } catch (\Throwable $e) {
            $out['error'] = mb_substr($e->getMessage(), 0, 300);
            report($e);
        } finally {
            $box->close();
        }
        Cache::put(self::LAST, $out + ['at' => now()->toIso8601String()], now()->addDays(7));

        return $out;
    }
}
