<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Applicant;
use App\Models\Security\SecurityEvent;
use App\Models\User;
use App\Services\Security\DeviceInfo;
use App\Services\Security\SecurityEvents;
use App\Services\Security\SecurityLog;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Laravel\Sanctum\PersonalAccessToken;

/** Admin → Sign-in log: who signed in, wrong passwords, waits, turned-away requests and alerts (permission security.view). */
class SecurityLogController extends Controller
{
    private const SEVERITIES = [SecurityLog::INFO, SecurityLog::NOTICE, SecurityLog::WARNING, SecurityLog::ALERT];

    /** The log has not been set up yet (database script 123 not run): say so instead of failing. */
    private function notReady(): ?JsonResponse
    {
        return Schema::hasTable('security_events') ? null : response()->json(['ready' => false, 'message' => 'The security log is not set up yet: run database script 123 in Workbench.', 'data' => [], 'total' => 0, 'last_page' => 1], 200);
    }

    /** GET /admin/security/events: the lines, newest first. Filters: severity, event (comma lists), q (email, address or name), subject, from, to, per_page. */
    public function index(Request $request): JsonResponse
    {
        if ($r = $this->notReady()) {
            return $r;
        }
        $request->validate(['from' => 'nullable|date', 'to' => 'nullable|date', 'per_page' => 'nullable|integer|min:1|max:200', 'subject' => ['nullable', 'regex:/^(user|applicant):\d+$/']]);

        $q = SecurityEvent::query();
        if ($list = $this->csv($request->input('severity'), self::SEVERITIES)) {
            $q->whereIn('severity', $list);
        }
        if ($list = $this->csv($request->input('event'))) {
            $q->whereIn('event', $list);
        }
        if ($subject = $request->input('subject')) {
            [$type, $id] = explode(':', $subject);
            $q->where('subject_type', $type)->where('subject_id', (int) $id);
        }
        if ($request->filled('from')) {
            $q->where('created_at', '>=', $request->date('from')->startOfDay());
        }
        if ($request->filled('to')) {
            $q->where('created_at', '<=', $request->date('to')->endOfDay());
        }
        if ($term = trim((string) $request->input('q'))) {
            $like = '%'.str_replace(['\\', '%', '_'], ['\\\\', '\\%', '\\_'], $term).'%';
            $userIds = User::where('name', 'like', $like)->orWhere('email', 'like', $like)->limit(200)->pluck('id');
            $q->where(function ($w) use ($like, $userIds) {
                $w->where('email_tried', 'like', $like)->orWhere('ip', 'like', $like)
                    ->orWhere(fn ($u) => $u->where('subject_type', 'user')->whereIn('subject_id', $userIds));
            });
        }

        $page = $q->orderByDesc('id')->paginate((int) $request->input('per_page', 50), ['*'], 'page', max(1, (int) $request->input('page', 1)));
        $names = $this->subjects($page->getCollection());

        return response()->json(['ready' => true, 'data' => $page->getCollection()->map(fn (SecurityEvent $e) => $this->present($e, $names))->values(), 'total' => $page->total(), 'last_page' => $page->lastPage(), 'page' => $page->currentPage(),
            'events' => SecurityEvents::all()]);
    }

    /** GET /admin/security/summary?hours=24: the numbers for the top of the page. */
    public function summary(Request $request): JsonResponse
    {
        if ($r = $this->notReady()) {
            return $r;
        }
        $hours = max(1, min(24 * 30, (int) $request->input('hours', 24)));
        $since = now()->subHours($hours);
        $counts = SecurityEvent::where('created_at', '>=', $since)->select('event', DB::raw('count(*) as n'))->groupBy('event')->pluck('n', 'event');
        $n = fn (string $e) => (int) ($counts[$e] ?? 0);

        $topIps = SecurityEvent::where('created_at', '>=', $since)->whereIn('event', ['sign_in_failed', 'sign_in_blocked', 'rate_limited'])->whereNotNull('ip')
            ->select('ip', DB::raw('count(*) as n'))->groupBy('ip')->orderByDesc('n')->limit(5)->get()->map(fn ($r) => ['ip' => $r->ip, 'count' => (int) $r->n]);
        $topEmails = SecurityEvent::where('created_at', '>=', $since)->whereIn('event', ['sign_in_failed', 'sign_in_blocked'])->whereNotNull('email_tried')
            ->select('email_tried', DB::raw('count(*) as n'))->groupBy('email_tried')->orderByDesc('n')->limit(5)->get()->map(fn ($r) => ['email' => $r->email_tried, 'count' => (int) $r->n]);

        return response()->json(['ready' => true, 'hours' => $hours, 'signed_in' => $n('sign_in'), 'wrong_passwords' => $n('sign_in_failed'), 'made_to_wait' => $n('sign_in_blocked') + $n('rate_limited'),
            'refused' => $n('sign_in_refused'), 'alerts' => SecurityEvent::where('created_at', '>=', $since)->where('severity', SecurityLog::ALERT)->count(),
            'signed_in_now' => PersonalAccessToken::where(fn ($q) => $q->whereNull('expires_at')->orWhere('expires_at', '>', now()))->count(), 'top_addresses' => $topIps, 'top_emails' => $topEmails]);
    }

    /** @return array<int, string> */
    private function csv(mixed $value, ?array $allowed = null): array
    {
        $list = array_values(array_filter(array_map('trim', explode(',', (string) $value))));

        return $allowed ? array_values(array_intersect($list, $allowed)) : $list;
    }

    /** @return array<string, array{name: ?string, email: ?string}> keyed "user:1" */
    private function subjects($events): array
    {
        $out = [];
        foreach (['user' => User::class, 'applicant' => Applicant::class] as $type => $class) {
            $ids = $events->where('subject_type', $type)->pluck('subject_id')->unique()->filter()->all();
            if ($ids) {
                foreach ($class::withTrashed()->whereIn('id', $ids)->get() as $m) {
                    $out["{$type}:{$m->id}"] = ['name' => $type === 'user' ? $m->name : trim($m->first_name.' '.$m->last_name), 'email' => $m->email];
                }
            }
        }

        return $out;
    }

    private function present(SecurityEvent $e, array $names): array
    {
        $key = $e->subject_type ? "{$e->subject_type}:{$e->subject_id}" : null;

        return ['id' => $e->id, 'at' => $e->created_at?->toIso8601String(), 'event' => $e->event, 'label' => SecurityEvents::label($e->event), 'severity' => $e->severity,
            'who' => $key ? ($names[$key] ?? ['name' => null, 'email' => null]) + ['type' => $e->subject_type, 'id' => $e->subject_id] : null, 'email_tried' => $e->email_tried, 'ip' => $e->ip,
            'device' => $e->user_agent ? DeviceInfo::describe($e->user_agent)['label'] : null, 'detail' => $e->detail];
    }
}
