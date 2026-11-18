<?php

namespace App\Services\Notify\Replies;

use App\Models\User;
use App\Services\Notify\NotifySettings;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;

/**
 * Replies come back in (docs/PROJECTS_STAGE6_SPEC.md, build 6.5). A message sent with a reply route carries a token: in the reply address of an
 * email (replies+TOKEN@domain), or, for WhatsApp, remembered against the number it went to. A reply that comes in is kept in
 * `notification_inbound` and handed to the module that sent the message, which files it. Anything that cannot be matched waits in a list for a
 * person to file or throw away: nothing is lost silently. Modules register here (AppServiceProvider); Core knows nothing about what they file into.
 */
class InboundReplies
{
    /** @var array<string, class-string<ReplyFiler>> */
    private static array $filers = [];

    public function __construct(private NotifySettings $settings) {}

    public static function register(string $module, string $class): void
    {
        self::$filers[$module] = $class;
    }

    public static function ready(): bool
    {
        return Schema::hasTable('notification_reply_routes') && Schema::hasTable('notification_inbound');
    }

    /** Make a route for one message to one person. @return string the token */
    public function route(string $module, string $type, int $id, string $channel, ?string $contact, ?string $ref = null): string
    {
        $token = Str::lower(Str::random(24));
        DB::table('notification_reply_routes')->insert(['token' => $token, 'module' => $module, 'subject_type' => $type, 'subject_id' => $id, 'contact' => $contact ? mb_substr($contact, 0, 190) : null,
            'contact_ref' => $ref, 'channel' => $channel, 'created_at' => now()]);

        return $token;
    }

    /** The reply address for a token, from the mailbox named in Notifications settings; null when none is named (the email then has the usual reply-to). */
    public function address(string $token): ?string
    {
        $box = trim((string) ($this->settings->get('email')['replies_address'] ?? ''));
        if (! filter_var($box, FILTER_VALIDATE_EMAIL)) {
            return null;
        }
        [$local, $domain] = explode('@', $box, 2);

        return "{$local}+{$token}@{$domain}";
    }

    /**
     * A reply that came in. Kept once (by its message id), matched to a route and filed, or left waiting.
     * @param array{channel: string, external_id?: ?string, from: string, from_name?: ?string, subject?: ?string, body: string, to?: string[], received_at?: ?string} $m
     * @return array{id: ?int, state: string}
     */
    public function receive(array $m): array
    {
        if (! self::ready()) {
            return ['id' => null, 'state' => 'not_ready'];
        }
        $channel = $m['channel'] === 'whatsapp' ? 'whatsapp' : 'email';
        $from = $channel === 'whatsapp' ? '+' . preg_replace('/\D+/', '', (string) $m['from']) : Str::lower(trim((string) $m['from']));
        $body = $channel === 'email' ? self::clean((string) $m['body']) : trim((string) $m['body']);
        if (! empty($m['external_id']) && DB::table('notification_inbound')->where('channel', $channel)->where('external_id', $m['external_id'])->exists()) {
            return ['id' => null, 'state' => 'seen'];   // read before: never twice
        }
        $id = DB::table('notification_inbound')->insertGetId(['channel' => $channel, 'external_id' => $m['external_id'] ?? null, 'from_address' => mb_substr($from, 0, 190),
            'from_name' => isset($m['from_name']) ? mb_substr((string) $m['from_name'], 0, 190) : null, 'subject' => isset($m['subject']) ? mb_substr((string) $m['subject'], 0, 250) : null,
            'body' => mb_substr($body, 0, 20000), 'received_at' => $m['received_at'] ?? now(), 'state' => 'waiting']);
        if ($body === '') {
            DB::table('notification_inbound')->where('id', $id)->update(['note' => 'Empty after the quoted text was taken off.']);

            return ['id' => $id, 'state' => 'waiting'];
        }
        [$route, $why] = $channel === 'email' ? $this->byToken((array) ($m['to'] ?? [])) : $this->byNumber($from);
        if (! $route) {
            DB::table('notification_inbound')->where('id', $id)->update(['note' => $why]);

            return ['id' => $id, 'state' => 'waiting'];
        }

        return ['id' => $id, 'state' => $this->fileVia($id, $route) ? 'filed' : 'waiting'];
    }

    /** Waiting replies, newest first. @return array<int, array<string, mixed>> */
    public function waiting(int $limit = 100): array
    {
        if (! self::ready()) {
            return [];
        }

        return DB::table('notification_inbound')->where('state', 'waiting')->orderByDesc('id')->limit($limit)->get()
            ->map(fn ($r) => ['id' => (int) $r->id, 'channel' => $r->channel, 'from' => $r->from_address, 'from_name' => $r->from_name, 'subject' => $r->subject, 'body' => $r->body,
                'received_at' => $r->received_at, 'note' => $r->note])->all();
    }

    public function find(int $id): ?object
    {
        return self::ready() ? DB::table('notification_inbound')->where('id', $id)->first() : null;
    }

    /** A person filed a waiting reply themselves (the module did the filing). */
    public function markFiled(int $id, string $module, string $type, int $subjectId, User $by): void
    {
        DB::table('notification_inbound')->where('id', $id)->update(['state' => 'filed', 'filed_module' => $module, 'filed_type' => $type, 'filed_id' => $subjectId, 'filed_by' => $by->id, 'filed_at' => now()]);
    }

    public function discard(int $id, User $by, ?string $note = null): void
    {
        DB::table('notification_inbound')->where('id', $id)->where('state', 'waiting')->update(['state' => 'discarded', 'filed_by' => $by->id, 'filed_at' => now(), 'note' => $note ? mb_substr($note, 0, 200) : 'Thrown away']);
    }

    /** The reply without the quoted message under it, the signature dashes, or the "On … wrote:" line. */
    public static function clean(string $body): string
    {
        $body = str_replace(["\r\n", "\r"], "\n", $body);
        $keep = [];
        $lines = explode("\n", $body);
        foreach ($lines as $i => $line) {
            $t = trim($line);
            $next = trim($lines[$i + 1] ?? '');
            if (preg_match('/^(-{2,}\s*Original Message\s*-{2,}|_{10,}|-- ?)$/i', $t) || preg_match('/^On .{4,200}wrote:$/i', $t) || preg_match('/^On .{4,200}$/i', $t) && preg_match('/wrote:$/i', $next)
                || preg_match('/^(From|Kutoka|De|Von):\s.+/i', $t) && $keep && trim(end($keep)) === '' && preg_match('/^(Sent|Date|To|Subject):/i', $next)) {
                break;
            }
            if (str_starts_with($t, '>')) {
                continue;
            }
            $keep[] = rtrim($line);
        }

        return trim(preg_replace("/\n{3,}/", "\n\n", implode("\n", $keep)));
    }

    // ------------------------------------------------------------------ inside

    /** @return array{0: ?object, 1: string} */
    private function byToken(array $to): array
    {
        foreach ($to as $address) {
            if (preg_match('/\+([a-z0-9]{16,40})@/i', (string) $address, $mm)) {
                $route = DB::table('notification_reply_routes')->where('token', Str::lower($mm[1]))->first();
                if ($route) {
                    return [$route, ''];
                }
            }
        }

        return [null, 'No reply address it answers was found in it.'];
    }

    /** The one open thing that last wrote to this number; none, or more than one, and it waits. @return array{0: ?object, 1: string} */
    private function byNumber(string $from): array
    {
        $routes = DB::table('notification_reply_routes')->where('channel', 'whatsapp')->where('contact', $from)->where('created_at', '>=', now()->subDays(90))->orderByDesc('id')->limit(200)->get();
        $open = [];
        foreach ($routes as $r) {
            $key = "{$r->module}:{$r->subject_type}:{$r->subject_id}";
            if (! isset($open[$key]) && ($f = $this->filer($r->module)) && $f->isOpen($r)) {
                $open[$key] = $r;
            }
        }
        if (count($open) === 1) {
            return [reset($open), ''];
        }

        return [null, $open ? 'More than one open conversation wrote to this number.' : 'Nothing open wrote to this number.'];
    }

    private function fileVia(int $id, object $route): bool
    {
        $f = $this->filer($route->module);
        $in = DB::table('notification_inbound')->where('id', $id)->first();
        $reply = ['channel' => $in->channel, 'from' => $in->from_address, 'from_name' => $in->from_name, 'subject' => $in->subject, 'body' => (string) $in->body, 'received_at' => (string) $in->received_at];
        try {
            $ok = $f && $f->file($route, $reply);
        } catch (\Throwable $e) {
            report($e);
            $ok = false;
        }
        DB::table('notification_inbound')->where('id', $id)->update($ok
            ? ['state' => 'filed', 'route_id' => $route->id, 'filed_module' => $route->module, 'filed_type' => $route->subject_type, 'filed_id' => $route->subject_id, 'filed_at' => now()]
            : ['route_id' => $route->id, 'note' => $f ? 'What it answers no longer takes replies.' : "Nothing files replies for \"{$route->module}\"."]);

        return $ok;
    }

    private function filer(string $module): ?ReplyFiler
    {
        $class = self::$filers[$module] ?? null;

        return $class ? app($class) : null;
    }
}
