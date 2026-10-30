<?php

namespace App\Services\Events;

use App\Models\Events\Event;
use App\Services\Notify\Notifier;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

/**
 * The guest list of an event: people invited by name (a wedding, an AGM, a launch), each with their own private RSVP link. Guest, speaker, performer, sponsor, vendor, staff and volunteer are roles
 * on the same person. Answers are kept with their history; invitations and reminders go by email or WhatsApp as the company's messaging settings decide.
 */
final class EventGuests
{
    public const ROLES = ['guest', 'speaker', 'performer', 'sponsor', 'vendor', 'staff', 'volunteer'];
    public const RSVP = ['pending', 'yes', 'no', 'maybe'];

    public function __construct(private Notifier $notifier)
    {
    }

    public static function ready(): bool
    {
        return Schema::hasTable('event_guests');
    }

    public static function link(object $g): string
    {
        return rtrim((string) config('app.frontend_url', config('app.url')), '/') . '/rsvp/' . $g->token;
    }

    public function shape(object $g): array
    {
        return ['id' => (int) $g->id, 'name' => $g->name, 'email' => $g->email, 'phone' => $g->phone, 'role' => $g->role, 'group_name' => $g->group_name, 'table_label' => $g->table_label, 'plus_ones' => (int) $g->plus_ones,
            'rsvp' => $g->rsvp, 'attending' => (int) $g->attending, 'meal' => $g->meal, 'needs' => $g->needs, 'note' => $g->note, 'invited_at' => $g->invited_at, 'reminders' => (int) $g->reminders, 'responded_at' => $g->responded_at,
            'checked_in_at' => $g->checked_in_at, 'link' => self::link($g)];
    }

    public function list(Event $e, array $f = []): array
    {
        return DB::table('event_guests')->where('event_id', $e->id)->when($f['rsvp'] ?? null, fn ($q, $v) => $q->where('rsvp', $v))->when($f['group'] ?? null, fn ($q, $v) => $q->where('group_name', $v))
            ->when($f['q'] ?? null, fn ($q, $s) => $q->where(fn ($w) => $w->where('name', 'like', "%{$s}%")->orWhere('email', 'like', "%{$s}%")))->orderBy('group_name')->orderBy('name')->get()->map(fn ($g) => $this->shape($g))->all();
    }

    public function summary(Event $e): array
    {
        $rows = DB::table('event_guests')->where('event_id', $e->id)->get();
        $count = fn (string $r) => $rows->where('rsvp', $r)->count();

        return ['invited' => $rows->count(), 'sent' => $rows->whereNotNull('invited_at')->count(), 'yes' => $count('yes'), 'no' => $count('no'), 'maybe' => $count('maybe'), 'pending' => $count('pending'),
            'heads' => (int) $rows->where('rsvp', 'yes')->sum('attending'), 'checked_in' => $rows->whereNotNull('checked_in_at')->count(),
            'meals' => $rows->where('rsvp', 'yes')->whereNotNull('meal')->where('meal', '!=', '')->groupBy('meal')->map->count()->all(),
            'needs' => $rows->where('rsvp', 'yes')->filter(fn ($g) => trim((string) $g->needs) !== '')->map(fn ($g) => ['name' => $g->name, 'needs' => $g->needs])->values()->all(),
            'groups' => $rows->groupBy(fn ($g) => $g->group_name ?: 'No group')->map(fn ($g) => ['invited' => $g->count(), 'yes' => $g->where('rsvp', 'yes')->count()])->all()];
    }

    private function clean(array $in): array
    {
        $row = array_intersect_key($in, array_flip(['name', 'email', 'phone', 'role', 'group_name', 'table_label', 'plus_ones', 'meal', 'needs', 'note']));
        if (isset($row['role']) && ! in_array($row['role'], self::ROLES, true)) {
            throw ValidationException::withMessages(['role' => 'Choose ' . implode(', ', self::ROLES) . '.']);
        }
        if (! empty($row['email']) && ! filter_var($row['email'], FILTER_VALIDATE_EMAIL)) {
            throw ValidationException::withMessages(['email' => 'That email address is not valid.']);
        }
        if (isset($row['plus_ones']) && ((int) $row['plus_ones'] < 0 || (int) $row['plus_ones'] > 20)) {
            throw ValidationException::withMessages(['plus_ones' => 'Plus-ones are 0 to 20.']);
        }

        return $row;
    }

    public function save(Event $e, array $in, ?int $id): array
    {
        $row = $this->clean($in);
        if ($id) {
            DB::table('event_guests')->where(['id' => $id, 'event_id' => $e->id])->update($row + ['updated_at' => now()]);
        } else {
            if (trim((string) ($row['name'] ?? '')) === '') {
                throw ValidationException::withMessages(['name' => 'Give the guest a name.']);
            }
            $id = DB::table('event_guests')->insertGetId($row + ['event_id' => $e->id, 'token' => Str::random(24), 'created_at' => now(), 'updated_at' => now()]);
        }

        return $this->shape(DB::table('event_guests')->find($id));
    }

    public function delete(Event $e, int $id): void
    {
        DB::table('event_guest_history')->where('guest_id', $id)->delete();
        DB::table('event_guests')->where(['id' => $id, 'event_id' => $e->id])->delete();
    }

    /**
     * Many at once: one guest a line, "name, email, phone, role, group, plus-ones". Duplicates (same email) are skipped. @return array{added: int, skipped: int, errors: string[]}
     */
    public function import(Event $e, string $text): array
    {
        $added = $skipped = 0;
        $errors = [];
        $have = DB::table('event_guests')->where('event_id', $e->id)->whereNotNull('email')->pluck('email')->map(fn ($m) => strtolower($m))->flip();
        foreach (preg_split('/\R/', $text) as $n => $line) {
            if (trim($line) === '') {
                continue;
            }
            $p = array_map('trim', str_getcsv($line));
            $email = $p[1] ?? '';
            if ($email !== '' && isset($have[strtolower($email)])) {
                $skipped++;
                continue;
            }
            try {
                $this->save($e, ['name' => $p[0] ?? '', 'email' => $email ?: null, 'phone' => $p[2] ?? null, 'role' => ($p[3] ?? '') ?: 'guest', 'group_name' => ($p[4] ?? '') ?: null, 'plus_ones' => (int) ($p[5] ?? 0)], null);
                $added++;
                if ($email !== '') {
                    $have[strtolower($email)] = true;
                }
            } catch (ValidationException $ex) {
                $errors[] = 'Line ' . ($n + 1) . ': ' . collect($ex->errors())->flatten()->first();
            }
        }

        return compact('added', 'skipped', 'errors');
    }

    // ── sending ──────────────────────────────────────────────────────────

    private function when(Event $e): string
    {
        $first = DB::table('event_sessions')->where('event_id', $e->id)->orderBy('starts_at')->value('starts_at');

        return $first ? \Illuminate\Support\Carbon::parse($first)->format('D j M Y, H:i') : 'a date to be announced';
    }

    /** Send the invitation (or a reminder to those who have not answered). $only: guest ids, else everyone not yet invited. @return array{sent: int, skipped: int} */
    public function invite(Event $e, ?array $only = null, bool $reminder = false): array
    {
        $q = DB::table('event_guests')->where('event_id', $e->id);
        if ($only) {
            $q->whereIn('id', $only);
        } elseif ($reminder) {
            $q->where('rsvp', 'pending')->whereNotNull('invited_at');
        } else {
            $q->whereNull('invited_at');
        }
        $sent = $skipped = 0;
        foreach ($q->get() as $g) {
            if (! $g->email && ! $g->phone) {
                $skipped++;
                continue;
            }
            $title = $reminder ? "Please reply: {$e->title}" : "You are invited: {$e->title}";
            $msg = ($reminder ? "A reminder to answer your invitation to {$e->title}" : "You are invited to {$e->title}") . ' on ' . $this->when($e) . '.' . ($e->venue_name ? " Venue: {$e->venue_name}." : '') . ' Please let us know if you can come.';
            $this->notifier->sendToContact(['name' => $g->name, 'email' => $g->email, 'phone' => $g->phone], $reminder ? 'event_invite_reminder' : 'event_invite', $title, $msg, ['action_url' => '/rsvp/' . $g->token, 'action_text' => 'Reply']);
            DB::table('event_guests')->where('id', $g->id)->update($reminder ? ['reminded_at' => now(), 'reminders' => $g->reminders + 1] : ['invited_at' => now()]);
            $sent++;
        }

        return compact('sent', 'skipped');
    }

    // ── the guest's own page ─────────────────────────────────────────────

    public function byToken(string $token): ?object
    {
        return strlen($token) === 24 ? DB::table('event_guests')->where('token', $token)->first() : null;
    }

    public function publicView(object $g): array
    {
        $e = Event::withTrashed()->find($g->event_id);
        $first = DB::table('event_sessions')->where('event_id', $g->event_id)->orderBy('starts_at')->first();

        return ['guest' => ['name' => $g->name, 'rsvp' => $g->rsvp, 'attending' => (int) $g->attending, 'plus_ones' => (int) $g->plus_ones, 'meal' => $g->meal, 'needs' => $g->needs, 'responded_at' => $g->responded_at],
            'event' => ['title' => $e?->title, 'when' => $first?->starts_at, 'venue' => $e?->venue_name, 'address' => $e?->venue_address, 'map_url' => $e?->map_url, 'status' => $e?->status]];
    }

    public function respond(object $g, array $in): array
    {
        $rsvp = $in['rsvp'] ?? '';
        if (! in_array($rsvp, ['yes', 'no', 'maybe'], true)) {
            throw ValidationException::withMessages(['rsvp' => 'Please say yes, no or maybe.']);
        }
        $with = $rsvp === 'no' ? 0 : min(1 + (int) $g->plus_ones, max(1, (int) ($in['attending'] ?? 1)));
        DB::table('event_guests')->where('id', $g->id)->update(['rsvp' => $rsvp, 'attending' => $with, 'meal' => mb_substr((string) ($in['meal'] ?? ''), 0, 80) ?: null,
            'needs' => mb_substr((string) ($in['needs'] ?? ''), 0, 300) ?: null, 'responded_at' => now(), 'updated_at' => now()]);
        DB::table('event_guest_history')->insert(['guest_id' => $g->id, 'rsvp' => $rsvp, 'attending' => $with, 'created_at' => now()]);

        return $this->publicView(DB::table('event_guests')->find($g->id));
    }

    // ── the door, also without internet ──────────────────────────────────

    /** Everything the door needs to check people in while offline: tickets and guests. */
    public function doorPack(Event $e): array
    {
        $tickets = Schema::hasTable('event_tickets') ? DB::table('event_tickets')->where('event_id', $e->id)->where('state', 'valid')->get(['id', 'reference', 'holder_name', 'buyer_name'])
            ->map(fn ($t) => ['kind' => 'ticket', 'id' => (int) $t->id, 'code' => $t->reference, 'name' => $t->holder_name ?: $t->buyer_name])->all() : [];
        $guests = DB::table('event_guests')->where('event_id', $e->id)->where('rsvp', '!=', 'no')->get(['id', 'name', 'token', 'attending', 'table_label'])
            ->map(fn ($g) => ['kind' => 'guest', 'id' => (int) $g->id, 'code' => $g->token, 'name' => $g->name, 'party' => max(1, (int) $g->attending), 'table' => $g->table_label])->all();

        return ['generated_at' => now()->toIso8601String(), 'event' => $e->title, 'entries' => array_merge($tickets, $guests)];
    }

    /** Check guests in (a list of {id, at}) as the door syncs after being offline. */
    public function checkIn(Event $e, array $ids): int
    {
        return DB::table('event_guests')->where('event_id', $e->id)->whereIn('id', $ids)->whereNull('checked_in_at')->update(['checked_in_at' => now(), 'updated_at' => now()]);
    }
}
