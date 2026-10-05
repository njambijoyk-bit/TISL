<?php

namespace App\Services\Engagement;

use App\Models\EngagementPost;
use App\Models\User;
use App\Services\Books\BooksException;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;

/**
 * Reviews, comments and replies: write, change, delete, list. What is allowed comes from EngagementAccess (the rules); this applies the rest of the rule
 * (one per person, daily limit, shortest, photos, held for approval) and keeps the review average on products and services up to date.
 */
class PostService
{
    public const BODY_MAX = 2000;

    public function __construct(private EngagementAccess $access, private EngagementRules $rules, private TargetResolver $targets, private ReviewSummary $summary) {}

    private function words(string $text): int
    {
        return count(preg_split('/\s+/u', trim($text), -1, PREG_SPLIT_NO_EMPTY));
    }

    public function guestKey(?string $ip, ?string $agent): string
    {
        return sha1('guest|' . $ip . '|' . mb_substr((string) $agent, 0, 80));
    }

    private function blocked(string $text): bool
    {
        $lower = mb_strtolower($text);
        foreach ($this->rules->settings()->blocked_words ?? [] as $w) {
            if ($w !== '' && str_contains($lower, $w)) {
                return true;
            }
        }

        return false;
    }

    /** @return array{0:string,1:?string} status and why it is held */
    private function holdFor(array $rule, ?User $u, ?string $guestKey, string $text, string $kind): array
    {
        if ($this->blocked($text)) {
            return ['held', 'blocked_word'];
        }
        $held = match ($rule['hold']) {
            'always' => 'rule',
            'guests' => $u ? null : 'guest',
            'first' => ! DB::table('engagement_posts')->where('kind', $kind)->where('status', 'published')->whereNull('deleted_at')
                ->when($u, fn ($q) => $q->where('user_id', $u->id), fn ($q) => $q->where('guest_key', $guestKey))->exists() ? 'first' : null,
            default => null,
        };

        return $held ? ['held', $held] : ['published', null];
    }

    private function fail(string $message): never
    {
        throw new BooksException($message);
    }

    private function mine($q, ?User $u, ?string $guestKey)
    {
        return $q->when($u, fn ($w) => $w->where('user_id', $u->id), fn ($w) => $w->where('guest_key', $guestKey));
    }

    /**
     * @param array{rating?:mixed,title?:?string,body?:?string,guest_name?:?string} $d
     * @param UploadedFile[] $photos
     */
    public function create(?User $u, string $type, int $id, string $kind, array $d, array $photos, ?string $ip, ?string $agent): EngagementPost
    {
        $action = $kind === 'review' ? 'review' : 'comment';
        if (! $this->targets->exists($type, $id)) {
            $this->fail('That is not available.');
        }
        $dec = $this->access->decide($u, $type, $action, $id);
        if (! $dec['allowed']) {
            $this->fail($dec['reason'] ?? 'You cannot do this.');
        }

        return $this->store($u, $dec, $type, $id, $kind, null, $d, $photos, $ip, $agent);
    }

    public function reply(?User $u, int $parentId, array $d, ?string $ip, ?string $agent): EngagementPost
    {
        $parent = EngagementPost::where('status', 'published')->find($parentId);
        if (! $parent || $parent->parent_id) {
            $this->fail('You can only reply to a review or comment that is showing.');
        }
        $dec = $this->access->decide($u, 'post', 'reply', $parent->id);
        if (! $dec['allowed']) {
            $this->fail($dec['reason'] ?? 'You cannot do this.');
        }

        return $this->store($u, $dec, 'post', $parent->id, 'comment', $parent->id, $d, [], $ip, $agent);
    }

    private function store(?User $u, array $dec, string $type, int $id, string $kind, ?int $parentId, array $d, array $photos, ?string $ip, ?string $agent): EngagementPost
    {
        $rule = $dec['rule'];
        $guestKey = $u ? null : $this->guestKey($ip, $agent);
        $body = trim((string) ($d['body'] ?? ''));
        $title = isset($d['title']) && trim((string) $d['title']) !== '' ? mb_substr(trim((string) $d['title']), 0, 120) : null;
        $rating = null;
        if ($kind === 'review') {
            $rating = (int) ($d['rating'] ?? 0);
            if ($rating < 1 || $rating > 5) {
                $this->fail('Choose a star rating from 1 to 5.');
            }
        }
        if ($body === '' || mb_strlen($body) > self::BODY_MAX) {
            $this->fail($body === '' ? 'Write something first.' : 'That is too long. The most is ' . self::BODY_MAX . ' characters.');
        }
        if ($rule['min_words'] > 0 && $this->words($body) < $rule['min_words']) {
            $this->fail("Please write at least {$rule['min_words']} " . ($rule['min_words'] === 1 ? 'word' : 'words') . '.');
        }
        $guestName = null;
        if (! $u) {
            $guestName = trim((string) ($d['guest_name'] ?? ''));
            if (mb_strlen($guestName) < 2 || mb_strlen($guestName) > 60) {
                $this->fail('Tell us your name (2 to 60 letters).');
            }
        }
        if ($kind === 'review' && $rule['one_per_person'] && $this->mine(DB::table('engagement_posts')->where('target_type', $type)->where('target_id', $id)->where('kind', 'review')->whereNull('deleted_at')
            ->whereIn('status', ['held', 'published', 'hidden']), $u, $guestKey)->exists()) {
            $this->fail('You have already reviewed this. You can change your review while it is allowed.');
        }
        if ($rule['daily_limit'] > 0 && $this->mine(DB::table('engagement_posts')->where('kind', $kind)->when($parentId, fn ($q) => $q->whereNotNull('parent_id'), fn ($q) => $q->whereNull('parent_id'))
            ->where('created_at', '>=', now()->startOfDay())->whereNull('deleted_at'), $u, $guestKey)->count() >= $rule['daily_limit']) {
            $this->fail('You have reached the most you can post today. Please try again tomorrow.');
        }
        $photos = array_slice(array_filter($photos), 0, 5);
        if ($photos && ! ($rule['photos'] ?? false)) {
            $this->fail('Photos are not allowed here.');
        }
        [$status, $why] = $this->holdFor($rule, $u, $guestKey, $body . ' ' . $title, $kind);

        $post = EngagementPost::create(['target_type' => $type, 'target_id' => $id, 'kind' => $kind, 'parent_id' => $parentId, 'user_id' => $u?->id, 'guest_name' => $guestName, 'guest_key' => $guestKey,
            'rating' => $rating, 'title' => $title, 'body' => $body, 'images' => $photos ? array_map(fn (UploadedFile $f) => Storage::url($f->store('engagement/photos', 'public')), $photos) : null,
            'verified_purchase' => $dec['verified'], 'proof_voucher_id' => $dec['voucher_id'], 'status' => $status, 'held_reason' => $why]);
        $this->after($post);

        return $post;
    }

    /** Change your own post while the rule's edit window is open. A rule that holds posts, or a blocked word, sends it back for approval. */
    public function update(User $u, EngagementPost $p, array $d): EngagementPost
    {
        if ((int) $p->user_id !== (int) $u->id) {
            $this->fail('You can only change your own posts.');
        }
        [$type, $action] = $p->parent_id ? ['post', 'reply'] : [$p->target_type, $p->kind === 'review' ? 'review' : 'comment'];
        $rule = $this->rules->rule($type, $action);
        if ($rule['edit_minutes'] <= 0 || $p->created_at->lt(now()->subMinutes($rule['edit_minutes']))) {
            $this->fail('This can no longer be changed.');
        }
        $body = array_key_exists('body', $d) ? trim((string) $d['body']) : $p->body;
        if ($body === '' || mb_strlen($body) > self::BODY_MAX || ($rule['min_words'] > 0 && $this->words($body) < $rule['min_words'])) {
            $this->fail($body === '' ? 'Write something first.' : 'Please check the length of what you wrote.');
        }
        $c = ['body' => $body, 'edited_at' => now()];
        if (array_key_exists('title', $d)) {
            $c['title'] = trim((string) $d['title']) !== '' ? mb_substr(trim((string) $d['title']), 0, 120) : null;
        }
        if ($p->kind === 'review' && array_key_exists('rating', $d)) {
            $r = (int) $d['rating'];
            if ($r < 1 || $r > 5) {
                $this->fail('Choose a star rating from 1 to 5.');
            }
            $c['rating'] = $r;
        }
        if ($p->status === 'published' && ($rule['hold'] === 'always' || $this->blocked($body . ' ' . ($c['title'] ?? $p->title)))) {
            $c += ['status' => 'held', 'held_reason' => $this->blocked($body) ? 'blocked_word' : 'rule'];
        }
        $p->update($c);
        $this->after($p);

        return $p->fresh();
    }

    public function destroy(EngagementPost $p): void
    {
        $p->update(['status' => 'removed']);
        EngagementPost::where('parent_id', $p->id)->update(['status' => 'removed']);
        $p->delete();
        $this->after($p);
    }

    /** Anything that could change a product's or service's average. */
    public function after(EngagementPost $p): void
    {
        if ($p->kind === 'review') {
            $this->summary->refresh($p->target_type, $p->target_id);
        }
    }

    /** How a post looks on the page. `$me` is the signed-in person, who also sees their own held posts. */
    private function shape(EngagementPost $p, ?User $me, ?string $guestKey, array $replies = []): array
    {
        $name = $p->user ? $this->shortName($p->user->name) : ($p->guest_name ?: 'Guest');

        return ['id' => $p->id, 'kind' => $p->kind, 'rating' => $p->rating, 'title' => $p->title, 'body' => $p->body, 'images' => $p->images ?? [], 'author' => $name,
            'by_staff' => $p->user && in_array($p->user->role, EngagementAccess::STAFF, true), 'verified' => (bool) $p->verified_purchase,
            'mine' => ($me && (int) $p->user_id === (int) $me->id) || (! $me && $guestKey && $p->guest_key === $guestKey), 'status' => $p->status === 'published' ? 'published' : 'held',
            'created_at' => $p->created_at?->setTimezone(config('app.timezone'))->format('Y-m-d\TH:i:sP'), 'edited' => (bool) $p->edited_at, 'replies' => $replies];
    }

    private function shortName(string $name): string
    {
        $parts = preg_split('/\s+/', trim($name));

        return count($parts) > 1 ? $parts[0] . ' ' . mb_strtoupper(mb_substr(end($parts), 0, 1)) . '.' : $parts[0];
    }

    /** @return array{data:array,next:?int} newest first, 20 at a time; `after` is the last id seen. */
    public function list(string $type, int $id, string $kind, ?int $after, ?User $me, ?string $guestKey): array
    {
        $visible = fn ($q) => $q->where(fn ($w) => $w->where('status', 'published')->orWhere(fn ($x) => $x->where('status', 'held')->when($me, fn ($y) => $y->where('user_id', $me->id), fn ($y) => $y->where('guest_key', $guestKey ?? 'none'))));
        $rows = $visible(EngagementPost::with('user:id,name,role')->where('target_type', $type)->where('target_id', $id)->where('kind', $kind)->whereNull('parent_id'))
            ->when($after, fn ($q) => $q->where('id', '<', $after))->orderByDesc('id')->limit(21)->get();
        $more = $rows->count() > 20;
        $rows = $rows->take(20);
        $replies = $visible(EngagementPost::with('user:id,name,role')->where('target_type', 'post')->whereIn('target_id', $rows->pluck('id')))->orderBy('id')->get()->groupBy('target_id');

        return ['data' => $rows->map(fn ($p) => $this->shape($p, $me, $guestKey, ($replies[$p->id] ?? collect())->map(fn ($r) => $this->shape($r, $me, $guestKey))->values()->all()))->values()->all(),
            'next' => $more ? $rows->last()->id : null];
    }
}
