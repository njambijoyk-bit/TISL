<?php

namespace App\Services\Engagement;

use App\Models\CampaignBoard;
use App\Models\CampaignMoodboard;
use App\Models\CampaignPin;
use App\Models\EngagementPost;
use App\Models\Policy;
use App\Models\User;
use App\Services\Books\BooksException;
use Illuminate\Support\Facades\DB;

/**
 * Reports and what staff do with them. A report is not a takedown: it opens a case on the thing reported. Staff keep it, pull it down, or flag it as a
 * breach of a policy. Many reports on one thing are one case. When the settings say so, enough open reports hide a post, pin, board or moodboard while staff look.
 */
class ReportService
{
    public const AUTO_REASON = 'Hidden while reports are being looked at';
    public const DECISIONS = ['keep' => 'kept', 'remove' => 'removed', 'flag' => 'flagged'];

    public function __construct(private EngagementAccess $access, private EngagementRules $rules, private TargetResolver $targets) {}

    /** Things people can report that staff can also take down (a product, service or campaign can be reported and kept or flagged, not hidden from here). */
    private function hideable(string $type): bool
    {
        return in_array($type, ['post', 'pin', 'board', 'moodboard'], true);
    }

    public function report(?User $u, string $type, int $id, string $reason, ?string $note, ?string $guestKey): void
    {
        if (! EngagementTargets::has($type, 'report') || ! $this->targets->exists($type, $id)) {
            throw new BooksException('That is not available.');
        }
        $dec = $this->access->decide($u, $type, 'report', $id);
        if (! $dec['allowed']) {
            throw new BooksException($dec['reason'] ?? 'You cannot do this.');
        }
        if (! in_array($reason, $this->rules->reasons(), true)) {
            throw new BooksException('Choose one of the reasons.');
        }
        $mine = fn ($q) => $q->when($u, fn ($w) => $w->where('reporter_user_id', $u->id), fn ($w) => $w->where('guest_key', $guestKey ?? 'none'));
        if ($mine(DB::table('engagement_reports')->where('target_type', $type)->where('target_id', $id)->where('status', 'open'))->exists()) {
            throw new BooksException('You have already reported this. Our team will look at it.');
        }
        $limit = $dec['rule']['daily_limit'];
        if ($limit > 0 && $mine(DB::table('engagement_reports')->where('created_at', '>=', now()->startOfDay()))->count() >= $limit) {
            throw new BooksException('You have reached the most reports you can send today.');
        }
        DB::table('engagement_reports')->insert(['target_type' => $type, 'target_id' => $id, 'reporter_user_id' => $u?->id, 'guest_key' => $u ? null : $guestKey, 'reason' => $reason,
            'note' => $note !== null && trim($note) !== '' ? mb_substr(trim($note), 0, 500) : null, 'status' => 'open', 'created_at' => now()]);

        $limitOpen = $this->rules->settings()->auto_hide_reports;
        if ($limitOpen > 0 && $this->hideable($type) && DB::table('engagement_reports')->where('target_type', $type)->where('target_id', $id)->where('status', 'open')->count() >= $limitOpen && $this->hide($type, $id, true)) {
            $this->log($type, $id, 'auto_hidden', null, "Hidden after {$limitOpen} reports, until staff decide");
        }
    }

    /** Hide the thing. Returns false when it was already hidden (so nothing is logged twice). */
    private function hide(string $type, int $id, bool $auto): bool
    {
        $why = $auto ? self::AUTO_REASON : 'Pulled down after a report';

        return match ($type) {
            'post' => EngagementPost::where('id', $id)->whereIn('status', ['published', 'held'])->update(['status' => 'hidden', 'held_reason' => $auto ? 'reports' : 'pulled_down']) > 0,
            'pin' => CampaignPin::where('id', $id)->where('status', 'visible')->update(['status' => 'hidden', 'hidden_reason' => $why]) > 0,
            'board' => CampaignBoard::where('id', $id)->where('status', 'visible')->update(['status' => 'hidden', 'hidden_reason' => $why]) > 0,
            'moodboard' => CampaignMoodboard::where('id', $id)->where('status', 'visible')->update(['status' => 'hidden']) > 0,
            default => false,
        };
    }

    /** Bring back something that was hidden automatically (never something staff pulled down on purpose). */
    private function restoreAuto(string $type, int $id): void
    {
        match ($type) {
            'post' => EngagementPost::where('id', $id)->where('status', 'hidden')->where('held_reason', 'reports')->update(['status' => 'published', 'held_reason' => null]),
            'pin' => CampaignPin::where('id', $id)->where('status', 'hidden')->where('hidden_reason', self::AUTO_REASON)->update(['status' => 'visible', 'hidden_reason' => null]),
            'board' => CampaignBoard::where('id', $id)->where('status', 'hidden')->where('hidden_reason', self::AUTO_REASON)->update(['status' => 'visible', 'hidden_reason' => null]),
            default => null,
        };
    }

    private function log(string $type, int $id, string $action, ?User $by, ?string $note, array $meta = []): void
    {
        DB::table('engagement_log')->insert(['target_type' => $type, 'target_id' => $id, 'action' => $action, 'actor_user_id' => $by?->id, 'note' => $note ? mb_substr($note, 0, 500) : null, 'meta' => $meta ? json_encode($meta) : null, 'created_at' => now()]);
    }

    /** The policies a breach can be flagged against: the active ones in the policy ecosystem. */
    public function policies(): array
    {
        return Policy::where('is_active', true)->orderBy('title')->get(['key', 'title'])->map(fn ($p) => ['key' => $p->key, 'title' => $p->title])->all();
    }

    /** One decision for the whole case: every open report on this thing gets it. */
    public function decide(User $by, string $type, int $id, string $decision, ?string $note, ?string $policyKey): void
    {
        if (! isset(self::DECISIONS[$decision])) {
            throw new BooksException('Choose keep, pull down or flag.');
        }
        if (! DB::table('engagement_reports')->where('target_type', $type)->where('target_id', $id)->where('status', 'open')->exists()) {
            throw new BooksException('There is nothing open to decide on that.');
        }
        if ($decision === 'remove' && ! $this->hideable($type)) {
            throw new BooksException('This cannot be pulled down from here. Keep it, or flag it.');
        }
        $policy = null;
        if ($decision === 'flag') {
            $policy = $policyKey ? Policy::where('key', $policyKey)->where('is_active', true)->first() : null;
            if (! $policy) {
                throw new BooksException('Choose the policy that was breached.');
            }
            if (! $note || trim($note) === '') {
                throw new BooksException('Add a note about what breached the policy.');
            }
        }
        DB::transaction(function () use ($by, $type, $id, $decision, $note, $policy) {
            DB::table('engagement_reports')->where('target_type', $type)->where('target_id', $id)->where('status', 'open')
                ->update(['status' => self::DECISIONS[$decision], 'decided_by' => $by->id, 'decided_at' => now(), 'decision_note' => $note ? mb_substr(trim($note), 0, 500) : null, 'policy_key' => $policy?->key]);
            if ($decision === 'keep') {
                $this->restoreAuto($type, $id);
            } elseif ($this->hideable($type)) {
                $this->hide($type, $id, false);   // pulled down: flagged ones too
            }
            $this->log($type, $id, $decision === 'keep' ? 'kept' : ($decision === 'remove' ? 'pulled_down' : 'flagged'), $by, $note, $policy ? ['policy' => $policy->key] : []);
        });
        if ($type === 'post') {
            $p = EngagementPost::withTrashed()->find($id);
            if ($p) {
                app(PostService::class)->after($p);
            }
        }
    }

    /** @return array<int,array> one row per thing with open (or decided) reports, newest first */
    public function cases(string $status, int $limit = 100): array
    {
        $rows = DB::table('engagement_reports')->where('status', $status)->selectRaw('target_type, target_id, COUNT(*) as reports, MAX(id) as last_id, MIN(created_at) as first_at, MAX(decided_at) as decided_at, MAX(decision_note) as note, MAX(policy_key) as policy_key')
            ->groupBy('target_type', 'target_id')->orderByDesc('last_id')->limit($limit)->get();
        $policies = collect($this->policies())->pluck('title', 'key');
        $out = [];
        foreach ($rows as $r) {
            $reasons = DB::table('engagement_reports')->where('target_type', $r->target_type)->where('target_id', $r->target_id)->where('status', $status)->selectRaw('reason, COUNT(*) n')->groupBy('reason')->orderByDesc('n')->get()
                ->map(fn ($x) => ['reason' => $x->reason, 'count' => (int) $x->n])->all();
            $notes = DB::table('engagement_reports')->where('target_type', $r->target_type)->where('target_id', $r->target_id)->where('status', $status)->whereNotNull('note')->orderByDesc('id')->limit(3)->pluck('note')->all();
            $out[] = ['target_type' => $r->target_type, 'target_id' => (int) $r->target_id, 'target' => $this->targets->label($r->target_type, (int) $r->target_id), 'excerpt' => $this->excerpt($r->target_type, (int) $r->target_id),
                'reports' => (int) $r->reports, 'reasons' => $reasons, 'notes' => $notes, 'hideable' => $this->hideable($r->target_type), 'hidden' => $this->isHidden($r->target_type, (int) $r->target_id),
                'first_at' => $r->first_at, 'decided_at' => $r->decided_at, 'decision_note' => $r->note, 'policy' => $r->policy_key ? ($policies[$r->policy_key] ?? $r->policy_key) : null];
        }

        return $out;
    }

    private function excerpt(string $type, int $id): ?string
    {
        return match ($type) {
            'post' => ($p = EngagementPost::withTrashed()->find($id)) ? mb_substr(($p->title ? $p->title . ': ' : '') . $p->body, 0, 280) : null,
            'pin' => ($p = CampaignPin::withTrashed()->find($id)) ? mb_substr(trim(($p->title ?? '') . ' ' . ($p->caption ?? '')), 0, 280) : null,
            default => null,
        };
    }

    private function isHidden(string $type, int $id): bool
    {
        return match ($type) {
            'post' => EngagementPost::withTrashed()->where('id', $id)->whereIn('status', ['hidden', 'removed'])->exists(),
            'pin' => CampaignPin::where('id', $id)->where('status', 'hidden')->exists(),
            'board' => CampaignBoard::where('id', $id)->where('status', 'hidden')->exists(),
            'moodboard' => CampaignMoodboard::where('id', $id)->where('status', 'hidden')->exists(),
            default => false,
        };
    }
}
