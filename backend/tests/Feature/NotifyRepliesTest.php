<?php

namespace Tests\Feature;

use App\Models\NotificationDelivery;
use App\Services\Notify\Notifier;
use App\Services\Notify\NotifySettings;
use App\Services\Notify\Replies\ImapMailbox;
use App\Services\Notify\Replies\ImapTransport;
use App\Services\Notify\Replies\InboundReplies;
use App\Services\Notify\Replies\MimeMessage;
use App\Services\Notify\Replies\ReplyFiler;
use App\Services\Notify\Replies\ReplyMailboxReader;
use App\Services\Notify\WhatsApp\MetaCloud;
use App\Services\Notify\WhatsApp\Twilio;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Facades\Schema;

/** Build 6.5 (docs/PROJECTS_STAGE6_SPEC.md): replies come back in, by email (a mailbox read over IMAP) and WhatsApp, and are filed or wait. */
class NotifyRepliesTest extends NotifyTestCase
{
    public static array $filed = [];
    public static array $open = [];

    protected function setUp(): void
    {
        parent::setUp();
        Queue::fake();
        self::$filed = [];
        self::$open = [];
        Schema::create('notification_reply_routes', function ($t) { $t->id(); $t->string('token', 40)->unique(); $t->string('module', 30); $t->string('subject_type', 30); $t->unsignedBigInteger('subject_id'); $t->string('contact', 190)->nullable(); $t->string('contact_ref', 60)->nullable(); $t->string('channel', 10); $t->timestamp('created_at')->nullable(); });
        Schema::create('notification_inbound', function ($t) { $t->id(); $t->string('channel', 10); $t->string('external_id', 190)->nullable(); $t->string('from_address', 190); $t->string('from_name', 190)->nullable(); $t->string('subject', 250)->nullable(); $t->text('body')->nullable(); $t->timestamp('received_at')->nullable(); $t->unsignedBigInteger('route_id')->nullable(); $t->string('state', 10)->default('waiting'); $t->string('filed_module', 30)->nullable(); $t->string('filed_type', 30)->nullable(); $t->unsignedBigInteger('filed_id')->nullable(); $t->unsignedBigInteger('filed_by')->nullable(); $t->timestamp('filed_at')->nullable(); $t->string('note', 200)->nullable(); $t->unique(['channel', 'external_id']); });
        InboundReplies::register('test', TestFiler::class);
        app(NotifySettings::class)->save('email', ['replies_address' => 'replies@imara.test'], $this->admin());
    }

    public function test_an_answerable_email_carries_its_own_reply_address_and_the_reply_is_filed_once(): void
    {
        app(Notifier::class)->sendToContact(['name' => 'Grace', 'email' => 'grace@example.test'], 'project_message', 'Defence draft', 'Here it is.', ['reply_route' => ['module' => 'test', 'type' => 'thread', 'id' => 7, 'ref' => 3]]);
        $route = DB::table('notification_reply_routes')->first();
        $this->assertSame(['test', 'thread', 7, 'grace@example.test', '3', 'email'], [$route->module, $route->subject_type, (int) $route->subject_id, $route->contact, $route->contact_ref, $route->channel]);
        $this->assertSame("replies+{$route->token}@imara.test", NotificationDelivery::where('channel', 'email')->first()->payload['reply_to']);

        $mail = "Message-ID: <abc@mail.test>\r\nFrom: \"Grace Wambua\" <Grace@Example.test>\r\nTo: Imara <replies+{$route->token}@imara.test>\r\nSubject: Re: Defence draft\r\nDate: Wed, 18 Nov 2026 11:00:00 +0300\r\n\r\nParagraph 14 should say the 3rd.\r\n\r\nOn Wed, 18 Nov 2026 at 10:00, Imara <replies@imara.test> wrote:\r\n> Here it is.\r\n";
        $m = MimeMessage::parse($mail);
        $r = app(InboundReplies::class)->receive(['channel' => 'email', 'external_id' => $m['message_id'], 'from' => $m['from'], 'from_name' => $m['from_name'], 'subject' => $m['subject'], 'body' => $m['body'], 'to' => $m['to']]);
        $this->assertSame('filed', $r['state']);
        $this->assertSame([['thread', 7, 'Paragraph 14 should say the 3rd.', 'grace@example.test']], array_map(fn ($f) => [$f[0], $f[1], $f[2], $f[3]], self::$filed), 'the quoted message is taken off');
        $this->assertSame('seen', app(InboundReplies::class)->receive(['channel' => 'email', 'external_id' => 'abc@mail.test', 'from' => 'grace@example.test', 'body' => 'x', 'to' => []])['state'], 'never twice');

        $lost = app(InboundReplies::class)->receive(['channel' => 'email', 'external_id' => 'zzz', 'from' => 'someone@else.test', 'body' => 'Who is this for?', 'to' => ['info@imara.test']]);
        $this->assertSame('waiting', $lost['state']);
        $this->assertSame(['Who is this for?', 'No reply address it answers was found in it.'], [app(InboundReplies::class)->waiting()[0]['body'], app(InboundReplies::class)->waiting()[0]['note']]);
        app(InboundReplies::class)->discard($lost['id'], $this->admin(), 'Spam');
        $this->assertSame([], app(InboundReplies::class)->waiting());
    }

    public function test_without_a_replies_mailbox_the_email_keeps_the_usual_reply_to(): void
    {
        app(NotifySettings::class)->save('email', ['replies_address' => ''], $this->admin());
        app(Notifier::class)->sendToContact(['name' => 'Grace', 'email' => 'grace@example.test'], 'project_message', 'Defence draft', 'Here it is.', ['reply_route' => ['module' => 'test', 'type' => 'thread', 'id' => 7]]);
        $this->assertArrayNotHasKey('reply_to', NotificationDelivery::where('channel', 'email')->first()->payload ?? []);
    }

    public function test_a_whatsapp_message_goes_to_the_one_open_thing_that_wrote_to_that_number_or_waits(): void
    {
        $in = app(InboundReplies::class);
        $in->route('test', 'thread', 7, 'whatsapp', '+254722000111', '3');
        $in->route('test', 'thread', 8, 'whatsapp', '+254722000111', '3');
        self::$open = [7];
        $this->assertSame('filed', $in->receive(['channel' => 'whatsapp', 'external_id' => 'wamid.1', 'from' => '254722000111', 'body' => 'Received, thanks'])['state']);
        $this->assertSame(7, self::$filed[0][1]);
        self::$open = [7, 8];
        $this->assertSame('waiting', $in->receive(['channel' => 'whatsapp', 'external_id' => 'wamid.2', 'from' => '254722000111', 'body' => 'And the other one?'])['state']);
        $this->assertSame('More than one open conversation wrote to this number.', $in->waiting()[0]['note']);
        self::$open = [];
        $this->assertSame('Nothing open wrote to this number.', DB::table('notification_inbound')->find($in->receive(['channel' => 'whatsapp', 'external_id' => 'wamid.3', 'from' => '254722000111', 'body' => 'Hello?'])['id'])->note);
    }

    public function test_saving_only_the_replies_mailbox_does_not_test_the_mail_server_again(): void
    {
        $s = app(NotifySettings::class);
        $tested = 0;
        $tester = function () use (&$tested) { $tested++; return ['ok' => true, 'message' => 'ok']; };
        $s->save('email', ['host' => 'smtp.imara.test', 'username' => 'u', 'password' => 'p'], $this->admin(), $tester);
        $s->save('email', ['imap_host' => 'imap.imara.test', 'imap_username' => 'replies@imara.test', 'imap_password' => 'secret'], $this->admin(), $tester);
        $this->assertSame(1, $tested);
        $this->assertSame(['set' => true], array_intersect_key($s->masked('email')['imap_password'], ['set' => 1]), 'kept as a secret');
        $s->save('email', ['port' => 465, 'encryption' => 'ssl'], $this->admin(), $tester);
        $this->assertSame(2, $tested);
    }

    public function test_the_providers_read_incoming_messages_from_their_callbacks(): void
    {
        $meta = ['entry' => [['changes' => [['value' => ['contacts' => [['wa_id' => '254722000111', 'profile' => ['name' => 'Grace']]], 'messages' => [['id' => 'wamid.9', 'from' => '254722000111', 'timestamp' => '1795000000', 'type' => 'text', 'text' => ['body' => 'Noted']]]]]]]]];
        $this->assertSame([['id' => 'wamid.9', 'from' => '254722000111', 'name' => 'Grace', 'body' => 'Noted', 'at' => date('Y-m-d H:i:s', 1795000000)]], (new MetaCloud([]))->incoming($meta));
        $this->assertSame([], (new MetaCloud([]))->incoming(['entry' => [['changes' => [['value' => ['statuses' => [['id' => 'x', 'status' => 'read']]]]]]]]), 'a status is not a message');
        $tw = ['MessageSid' => 'SM1', 'SmsStatus' => 'received', 'From' => 'whatsapp:+254722000111', 'Body' => 'Noted', 'ProfileName' => 'Grace'];
        $this->assertSame([['id' => 'SM1', 'from' => '254722000111', 'name' => 'Grace', 'body' => 'Noted', 'at' => null]], (new Twilio([]))->incoming($tw));
        $this->assertSame([], (new Twilio([]))->incoming(['MessageSid' => 'SM2', 'MessageStatus' => 'delivered']));
    }

    public function test_a_multipart_mail_gives_its_plain_text_and_quoted_text_is_taken_off(): void
    {
        $raw = "From: =?UTF-8?B?R3JhY2UgV2FtYnVh?= <grace@example.test>\nTo: replies+abc@imara.test\nSubject: =?UTF-8?Q?Re:_Caf=C3=A9?=\nContent-Type: multipart/alternative; boundary=\"b1\"\n\n--b1\nContent-Type: text/plain; charset=UTF-8\nContent-Transfer-Encoding: quoted-printable\n\nYes, Friday works =E2=80=94 see you.\n\n-----Original Message-----\nFrom: Imara\n--b1\nContent-Type: text/html\n\n<p>Yes</p>\n--b1--\n";
        $m = MimeMessage::parse($raw);
        $this->assertSame(['Grace Wambua', 'grace@example.test', 'Re: Café', ['replies+abc@imara.test']], [$m['from_name'], $m['from'], $m['subject'], $m['to']]);
        $this->assertSame('Yes, Friday works — see you.', InboundReplies::clean($m['body']));
        $this->assertSame("Fine.\n\nKamau", InboundReplies::clean("Fine.\n\nKamau\n\nOn Tue, 17 Nov 2026, Imara\n<replies@imara.test> wrote:\n> old"));
        $html = MimeMessage::parse("From: a@b.test\nContent-Type: text/html; charset=UTF-8\n\n<div>Fine &amp; thanks<br>K</div><blockquote>old</blockquote>");
        $this->assertSame("Fine & thanks\nK", $html['body']);
    }

    public function test_the_mailbox_is_read_over_imap_and_each_mail_marked_seen_once_kept(): void
    {
        app(NotifySettings::class)->save('email', ['replies_address' => 'replies@imara.test', 'imap_host' => 'mail.imara.test', 'imap_username' => 'replies@imara.test', 'imap_password' => 's3cret'], $this->admin());
        $token = app(InboundReplies::class)->route('test', 'thread', 7, 'email', 'grace@example.test', '3');
        $mail = "Message-ID: <m1@x>\r\nFrom: grace@example.test\r\nTo: replies+{$token}@imara.test\r\nSubject: Re: x\r\n\r\nThanks.\r\n";
        $t = new ScriptedImap(["* OK ready\r\n"], [
            'LOGIN' => ["a1 OK\r\n"], 'SELECT' => ["* 1 EXISTS\r\n", "a2 OK\r\n"], 'UID SEARCH' => ["* SEARCH 41\r\n", "a3 OK\r\n"],
            'UID FETCH 41' => ['* 1 FETCH (UID 41 BODY[] {' . strlen($mail) . "}\r\n", $mail, ")\r\n", "a4 OK\r\n"], 'UID STORE 41' => ["a5 OK\r\n"],
        ]);
        $r = app(ReplyMailboxReader::class)->run(new ImapMailbox(['host' => 'x', 'port' => 993, 'encryption' => 'ssl', 'username' => 'replies@imara.test', 'password' => 'p"w'], $t));
        $this->assertSame(['read' => 1, 'filed' => 1, 'waiting' => 0, 'error' => null], $r);
        $this->assertSame('a1 LOGIN "replies@imara.test" "p\\"w"', $t->sent[0]);
        $this->assertContains('a5 UID STORE 41 +FLAGS (\Seen)', $t->sent);
        $this->assertSame('Thanks.', self::$filed[0][2]);

        $bad = new ScriptedImap(["* OK ready\r\n"], ['LOGIN' => ["a1 NO [AUTHENTICATIONFAILED] Invalid credentials\r\n"]]);
        $this->assertSame('The mail server refused the sign-in: NO [AUTHENTICATIONFAILED] Invalid credentials', app(ReplyMailboxReader::class)->run(new ImapMailbox(['host' => 'x', 'port' => 993, 'encryption' => 'ssl', 'username' => 'u', 'password' => 'p'], $bad))['error']);
    }
}

class TestFiler implements ReplyFiler
{
    public function file(object $route, array $reply): bool
    {
        NotifyRepliesTest::$filed[] = [$route->subject_type, (int) $route->subject_id, $reply['body'], $reply['from']];

        return true;
    }

    public function isOpen(object $route): bool
    {
        return in_array((int) $route->subject_id, NotifyRepliesTest::$open, true);
    }

    public function describe(object $route): ?string
    {
        return "Thread {$route->subject_id}";
    }
}

/** An IMAP server's answers, keyed by the start of each command. */
class ScriptedImap implements ImapTransport
{
    public array $sent = [];
    private array $queue;

    public function __construct(array $greeting, private array $answers)
    {
        $this->queue = $greeting;
    }

    public function write(string $data): void
    {
        $cmd = trim($data);
        $this->sent[] = $cmd;
        $body = preg_replace('/^a\d+ /', '', $cmd);
        foreach ($this->answers as $start => $lines) {
            if (str_starts_with($body, $start)) {
                array_push($this->queue, ...$lines);

                return;
            }
        }
        $this->queue[] = preg_replace('/ .*/', '', $cmd) . " OK\r\n";
    }

    public function readLine(): string
    {
        return array_shift($this->queue) ?? throw new \RuntimeException('nothing more from the server');
    }

    public function read(int $bytes): string
    {
        return array_shift($this->queue);
    }

    public function startTls(): void {}

    public function isOpen(): bool
    {
        return true;
    }

    public function close(): void {}
}
