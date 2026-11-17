<?php

namespace App\Services\Projects;

use App\Models\User;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Clients (docs/PROJECTS_STAGE3_SPEC.md, build 3.5). A client is a customer record: the account and the Books ledger TISL already has.
 * Projects keeps three columns on it (account manager, the lead it came from, client since) and shows everything else it knows: contacts,
 * work, opportunities, history, next actions, flags, what they owe (read from the books) and a health light that always says why.
 *
 * The list holds the customers Projects has to do with: those that became clients here, and any with work or an opportunity. Any other
 * customer can still be found by searching and opened.
 */
class ProjectClients
{
    public function __construct(private ProjectFollowUps $followUps, private ProjectInteractions $history, private ClientMoney $money) {}

    public static function mayView(User $user): bool
    {
        return $user->hasPermission('projects.clients.view') || $user->hasPermission('projects.clients.manage');
    }

    public static function maySeeMoney(User $user): bool
    {
        return $user->hasPermission('books.view') || $user->hasPermission('projects.money.view');
    }

    public function find(int $id, User $user): object
    {
        $c = Schema::hasTable('customers') ? DB::table('customers')->where('id', $id)->whereNull('deleted_at')->first() : null;
        if (! $c) {
            throw new ProjectException('Not found.', 404);
        }
        if (! self::mayView($user)) {
            ProjectLog::refused(null, $user, 'client.view', 'Does not hold projects.clients.view', 'customer', $id);
            throw new ProjectException('You may not see clients.', 403);
        }

        return $c;
    }

    /**
     * @param array<string, mixed> $f scope (mine|all), health (green|amber|red), flagged (bool), q, page, per_page
     * @return array<string, mixed>
     */
    public function list(User $user, array $f): array
    {
        $rows = $this->rows($user, $f);
        $per = min(100, max(5, (int) ($f['per_page'] ?? 25)));
        $page = max(1, (int) ($f['page'] ?? 1));
        $counts = ['green' => 0, 'amber' => 0, 'red' => 0];
        foreach ($rows as $r) {
            if ($r['health']) {
                $counts[$r['health']['colour']]++;
            }
        }
        if (isset($counts[$f['health'] ?? ''])) {
            $rows = array_values(array_filter($rows, fn ($r) => ($r['health']['colour'] ?? null) === $f['health']));
        }

        return ['data' => array_slice($rows, ($page - 1) * $per, $per), 'total' => count($rows), 'page' => $page, 'per_page' => $per, 'counts' => $this->mayHealth($user) ? $counts : null];
    }

    /** Every row of the list as filtered, for the export. @param array<string, mixed> $f @return array<int, array<string, mixed>> */
    public function exportRows(User $user, array $f): array
    {
        $rows = $this->rows($user, $f + ['per_page' => 100000]);

        return isset($f['health']) && in_array($f['health'], ['green', 'amber', 'red'], true) ? array_values(array_filter($rows, fn ($r) => ($r['health']['colour'] ?? null) === $f['health'])) : $rows;
    }

    /** @return array<string, mixed> everything about one client */
    public function show(object $c, User $user): array
    {
        $row = $this->present(collect([$c]), $user)[0];
        $projects = app(ProjectAccess::class)->visible(DB::table('projects as p'), $user)->where('p.customer_id', $c->id)->leftJoin('project_stages as s', 's.id', '=', 'p.stage_id')
            ->orderByRaw("CASE p.state WHEN 'open' THEN 0 WHEN 'on_hold' THEN 1 ELSE 2 END")->orderByDesc('p.id')->limit(100)
            ->get(['p.id', 'p.number', 'p.title', 'p.state', 's.name as stage', 's.status_token as status', 'p.confidential'])
            ->map(fn ($p) => ['id' => (int) $p->id, 'number' => $p->number, 'title' => $p->title, 'state' => $p->state, 'stage' => $p->stage, 'status' => $p->status, 'confidential' => (bool) $p->confidential])->all();

        return array_merge($row, [
            'projects' => $projects,
            'opportunities' => app(ProjectPipeline::class)->of('client', (int) $c->id, $user),
            'flags' => $this->flags((int) $c->id),
            'lead' => $c->projects_lead_id ?? null ? ['id' => (int) $c->projects_lead_id] : null,
            'can' => ['manage' => $user->hasPermission('projects.clients.manage'), 'flags' => $user->hasPermission('projects.flags'), 'pipeline' => $user->hasPermission('projects.pipeline'),
                'create' => $user->hasPermission('projects.create'), 'export' => $user->hasPermission('projects.clients.export')],
        ]);
    }

    /** Give the client an account manager (or none). */
    public function setManager(object $c, mixed $userId, User $by): void
    {
        $id = $userId ? (int) $userId : null;
        if ($id) {
            $u = User::find($id);
            if (! $u || ! $u->hasPermission('projects.use')) {
                throw new ProjectException('Choose someone who can open Projects.');
            }
        }
        if ((int) ($c->projects_account_manager_id ?? 0) === (int) $id) {
            return;
        }
        DB::table('customers')->where('id', $c->id)->update(['projects_account_manager_id' => $id] + (empty($c->projects_client_since) ? ['projects_client_since' => now()->format('Y-m-d')] : []));
        ProjectLog::record(null, $by, 'client.manager', 'customer', (int) $c->id, ['manager' => $c->projects_account_manager_id ?? null], ['manager' => $id ? User::find($id)->name : null]);
    }

    // ------------------------------------------------------------------ flags

    /** @return array<int, array<string, mixed>> the flags a client carries now */
    public function flags(int $customerId): array
    {
        if (! ProjectsSetup::relationships()) {
            return [];
        }

        return DB::table('project_client_flags as f')->join('project_lists as l', 'l.id', '=', 'f.flag_id')->leftJoin('users as u', 'u.id', '=', 'f.set_by')
            ->where('f.customer_id', $customerId)->whereNull('f.removed_at')->orderBy('l.sort_order')
            ->get(['f.id', 'l.name', 'l.status_token', 'f.reason', 'u.name as set_by', 'f.set_at'])
            ->map(fn ($f) => ['id' => (int) $f->id, 'name' => $f->name, 'status' => $f->status_token, 'reason' => $f->reason, 'set_by' => $f->set_by, 'set_at' => $f->set_at])->all();
    }

    /** @return array<int, string[]> customer id => the names of its flags, for wherever a client is picked */
    public static function flagNames(array $customerIds): array
    {
        if (! $customerIds || ! ProjectsSetup::relationships()) {
            return [];
        }

        return DB::table('project_client_flags as f')->join('project_lists as l', 'l.id', '=', 'f.flag_id')->whereIn('f.customer_id', $customerIds)->whereNull('f.removed_at')
            ->get(['f.customer_id', 'l.name'])->groupBy('customer_id')->map(fn ($g) => $g->pluck('name')->all())->all();
    }

    public function addFlag(object $c, mixed $flagId, ?string $reason, User $by): void
    {
        $flag = app(ProjectLists::class)->need('flag', $flagId, 'the flag');
        $reason = trim((string) $reason);
        if ($reason === '') {
            throw new ProjectException('Say why the flag is there.');
        }
        if (DB::table('project_client_flags')->where('customer_id', $c->id)->where('flag_id', $flag->id)->whereNull('removed_at')->exists()) {
            throw new ProjectException('That flag is already on.');
        }
        $id = DB::table('project_client_flags')->insertGetId(['customer_id' => $c->id, 'flag_id' => $flag->id, 'reason' => mb_substr($reason, 0, 300), 'set_by' => $by->id, 'set_at' => now()]);
        ProjectLog::record(null, $by, 'client.flagged', 'customer', (int) $c->id, null, ['flag' => $flag->name, 'why' => $reason, 'flag_id' => $id]);
    }

    public function removeFlag(object $c, int $id, ?string $note, User $by): void
    {
        $f = DB::table('project_client_flags as f')->join('project_lists as l', 'l.id', '=', 'f.flag_id')->where('f.customer_id', $c->id)->where('f.id', $id)->whereNull('f.removed_at')->first(['f.id', 'l.name']);
        if (! $f) {
            throw new ProjectException('Not found.', 404);
        }
        $note = trim((string) $note);
        if ($note === '') {
            throw new ProjectException('Say why the flag is coming off.');
        }
        DB::table('project_client_flags')->where('id', $f->id)->update(['removed_by' => $by->id, 'removed_at' => now(), 'remove_note' => mb_substr($note, 0, 300)]);
        ProjectLog::record(null, $by, 'client.unflagged', 'customer', (int) $c->id, ['flag' => $f->name], ['why' => $note]);
    }

    // ------------------------------------------------------------------ health

    /**
     * Green, amber or red, and why. Four rules, each with numbers an owner sets: days since the last contact, a late next action, the flags it
     * carries, and money overdue in the books. The worst rule decides the colour.
     *
     * @param array{last_contact: ?string, next_late_days: ?int, has_next: bool, flags: array<int, array{status: ?string, name: string}>, money: ?array, since: ?string} $facts
     * @return array{colour: string, reasons: string[]}
     */
    public static function health(array $facts): array
    {
        $s = app(ProjectSettings::class)->get('health');
        $rank = ['green' => 0, 'amber' => 1, 'red' => 2];
        $colour = 'green';
        $reasons = [];
        $hit = function (string $c, string $why) use (&$colour, &$reasons, $rank) {
            $reasons[] = $why;
            $colour = $rank[$c] > $rank[$colour] ? $c : $colour;
        };
        // since the last contact (a client that is new counts from the day it became one)
        $from = $facts['last_contact'] ?? $facts['since'] ?? null;
        if ($from) {
            $days = (int) \Carbon\Carbon::parse($from)->startOfDay()->diffInDays(now()->startOfDay());
            if ($s['contact_red_days'] > 0 && $days >= $s['contact_red_days']) {
                $hit('red', $facts['last_contact'] ? "No contact for {$days} days" : "No contact since becoming a client {$days} days ago");
            } elseif ($s['contact_amber_days'] > 0 && $days >= $s['contact_amber_days']) {
                $hit('amber', $facts['last_contact'] ? "No contact for {$days} days" : "No contact since becoming a client {$days} days ago");
            }
        }
        // the next action
        $late = $facts['next_late_days'];
        if ($late !== null && $late > 0) {
            $hit($s['late_red_days'] > 0 && $late >= $s['late_red_days'] ? 'red' : 'amber', "Next action {$late} " . ($late === 1 ? 'day' : 'days') . ' late');
        } elseif (! $facts['has_next'] && $s['nothing_planned_amber']) {
            $hit('amber', 'Nothing planned next');
        }
        // flags: one shown as a problem is red, one shown as a warning is amber
        foreach ($facts['flags'] as $f) {
            if (($f['status'] ?? null) === 'problem') {
                $hit('red', "Flag: {$f['name']}");
            } elseif (($f['status'] ?? null) === 'warning') {
                $hit('amber', "Flag: {$f['name']}");
            }
        }
        // money overdue in the books
        $m = $facts['money'];
        if ($m && $m['overdue'] > 0.005) {
            if ($s['overdue_red_days'] > 0 && $m['days_late'] >= $s['overdue_red_days']) {
                $hit('red', "Money overdue for {$m['days_late']} days");
            } elseif ($s['overdue_amber_days'] > 0 && $m['days_late'] >= $s['overdue_amber_days']) {
                $hit('amber', "Money overdue for {$m['days_late']} days");
            }
        }

        return ['colour' => $colour, 'reasons' => $reasons];
    }

    // ------------------------------------------------------------------ inside

    private function mayHealth(User $user): bool
    {
        return $user->hasPermission('projects.health.view');
    }

    /** @param array<string, mixed> $f @return array<int, array<string, mixed>> */
    private function rows(User $user, array $f): array
    {
        if (! Schema::hasTable('customers')) {
            return [];
        }
        $q = DB::table('customers as c')->whereNull('c.deleted_at');
        $term = trim((string) ($f['q'] ?? ''));
        if ($term !== '') {   // searching finds any customer, so any can be opened
            $like = '%' . str_replace(['\\', '%', '_'], ['\\\\', '\%', '\_'], $term) . '%';
            $q->where(fn ($x) => $x->where('c.company_name', 'like', $like)->orWhere('c.first_name', 'like', $like)->orWhere('c.last_name', 'like', $like)->orWhere('c.email', 'like', $like)->orWhere('c.customer_number', 'like', $like));
        } elseif (ProjectsSetup::relationships()) {   // otherwise the customers Projects has to do with
            $q->where(fn ($x) => $x->whereNotNull('c.projects_client_since')->orWhereExists(fn ($e) => $e->from('projects as p')->whereColumn('p.customer_id', 'c.id')->whereNull('p.deleted_at'))
                ->orWhereExists(fn ($e) => $e->from('project_opportunities as o')->whereColumn('o.customer_id', 'c.id')->whereNull('o.deleted_at')));
        } else {
            $q->whereExists(fn ($e) => $e->from('projects as p')->whereColumn('p.customer_id', 'c.id')->whereNull('p.deleted_at'));
        }
        if (($f['scope'] ?? 'all') === 'mine' && Schema::hasColumn('customers', 'projects_account_manager_id')) {
            $q->where('c.projects_account_manager_id', $user->id);
        }
        if (! empty($f['flagged']) && ProjectsSetup::relationships()) {
            $q->whereExists(fn ($e) => $e->from('project_client_flags as f')->whereColumn('f.customer_id', 'c.id')->whereNull('f.removed_at'));
        }

        return $this->present($q->orderByRaw('COALESCE(c.company_name, c.first_name)')->limit(2000)->get(['c.*']), $user);
    }

    /** @param Collection<int, object> $rows @return array<int, array<string, mixed>> */
    private function present(Collection $rows, User $user): array
    {
        $ids = $rows->pluck('id')->map(fn ($v) => (int) $v)->all();
        $next = $this->followUps->nextFor('customer', $ids);
        $last = $this->history->lastFor('customer', $ids);
        $money = $this->money->forMany($ids);
        $flags = ProjectsSetup::relationships() ? DB::table('project_client_flags as f')->join('project_lists as l', 'l.id', '=', 'f.flag_id')->whereIn('f.customer_id', $ids)->whereNull('f.removed_at')
            ->get(['f.customer_id', 'l.name', 'l.status_token as status'])->groupBy('customer_id') : collect();
        $managers = DB::table('users')->whereIn('id', $rows->pluck('projects_account_manager_id')->filter()->unique())->pluck('name', 'id');
        // only the work this person may see is counted: a count that included confidential work would give its existence away
        $work = app(ProjectAccess::class)->visible(DB::table('projects as p'), $user)->whereIn('p.customer_id', $ids)->whereIn('p.state', ['open', 'on_hold'])->groupBy('p.customer_id')->selectRaw('p.customer_id, COUNT(*) as n')->pluck('n', 'customer_id');
        $sources = ProjectsSetup::relationships() ? DB::table('project_leads as l')->leftJoin('project_lists as s', 's.id', '=', 'l.source_id')->whereIn('l.customer_id', $ids)->pluck('s.name', 'l.customer_id') : collect();
        $health = $this->mayHealth($user);
        $seeMoney = self::maySeeMoney($user);

        return $rows->map(function ($c) use ($next, $last, $money, $flags, $managers, $work, $sources, $health, $seeMoney) {
            $id = (int) $c->id;
            $f = ($flags[$id] ?? collect())->map(fn ($x) => ['name' => $x->name, 'status' => $x->status])->values()->all();
            $n = $next[$id] ?? null;
            $m = $money[$id] ?? null;

            return ['id' => $id, 'name' => ProjectService::customerName($c), 'number' => $c->customer_number ?? null, 'email' => $c->email ?? null, 'phone' => $c->phone ?? null,
                'manager' => ! empty($c->projects_account_manager_id) ? ['id' => (int) $c->projects_account_manager_id, 'name' => $managers[$c->projects_account_manager_id] ?? null] : null,
                'since' => $c->projects_client_since ?? null, 'source' => $sources[$id] ?? null, 'open_work' => (int) ($work[$id] ?? 0),
                'last_contact' => $last[$id] ?? null, 'next' => $n, 'flags' => $f,
                // what they owe is shown to someone who may see money; health uses it for everyone who may see health, saying only that money is overdue
                'money' => $seeMoney ? $m : null,
                'health' => $health ? self::health(['last_contact' => $last[$id] ?? null, 'next_late_days' => $n ? ($n['late'] ? $n['days_late'] : 0) : null, 'has_next' => $n !== null, 'flags' => $f, 'money' => $m, 'since' => $c->projects_client_since ?? null]) : null,
            ];
        })->values()->all();
    }
}
