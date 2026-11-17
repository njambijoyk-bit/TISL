<?php

namespace App\Services\Projects;

use App\Models\User;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * The directory (docs/PROJECTS_STAGE3_SPEC.md, build 3.6): one place to find anyone, over records that already exist. Nothing is copied.
 *   Yellow pages: organisations (clients that are companies, parties that are organisations, vendors), grouped by trade.
 *   White pages:  people (contacts, parties that are people, clients that are people, and staff for those who may see staff).
 * Phone numbers and emails are masked until someone who may reveals them; each reveal is logged and watched by Projects security.
 * Each entry has a visibility: staff only, clients who share a piece of work with it, or public. Configuration can switch levels off.
 */
class ProjectDirectory
{
    public const TYPES = ['customer', 'contact', 'party', 'vendor', 'employee'];
    public const LEVELS = ['staff' => 'Staff only', 'clients' => 'Clients who share work with them', 'public' => 'Public'];
    private const PER_SOURCE = 400;

    /**
     * @param array<string, mixed> $f book (yellow|white), trade (key|none), q, page, per_page
     * @return array<string, mixed>
     */
    public function page(User $user, array $f): array
    {
        $book = ($f['book'] ?? 'yellow') === 'white' ? 'white' : 'yellow';
        $entries = $book === 'yellow' ? $this->organisations((string) ($f['q'] ?? '')) : $this->people((string) ($f['q'] ?? ''), $user->hasPermission('projects.directory.staff'));
        $meta = $this->meta($entries);
        $trades = app(ProjectLists::class)->of('trade');
        $counts = ['none' => 0];
        foreach ($entries as $e) {
            $t = $meta[$e['type'] . ':' . $e['id']]['trades'] ?? [];
            $t ? array_map(function ($k) use (&$counts) { $counts[$k] = ($counts[$k] ?? 0) + 1; }, $t) : $counts['none']++;
        }
        $trade = (string) ($f['trade'] ?? '');
        if ($book === 'yellow' && $trade !== '') {
            $entries = array_values(array_filter($entries, fn ($e) => $trade === 'none' ? ! ($meta[$e['type'] . ':' . $e['id']]['trades'] ?? []) : in_array($trade, $meta[$e['type'] . ':' . $e['id']]['trades'] ?? [], true)));
        }
        $per = min(100, max(5, (int) ($f['per_page'] ?? 25)));
        $page = max(1, (int) ($f['page'] ?? 1));
        $slice = array_slice($entries, ($page - 1) * $per, $per);
        $work = $this->workCounts($slice, $user);
        $tradeNames = collect($trades)->pluck('name', 'key');

        return [
            'book' => $book, 'total' => count($entries), 'page' => $page, 'per_page' => $per,
            'entries' => array_map(function ($e) use ($meta, $work, $tradeNames) {
                $m = $meta[$e['type'] . ':' . $e['id']] ?? ['trades' => [], 'visibility' => 'staff'];

                return ['type' => $e['type'], 'id' => $e['id'], 'name' => $e['name'], 'is' => $e['is'], 'works_for' => $e['works_for'] ?? null, 'job_title' => $e['job_title'] ?? null,
                    'phone' => self::maskPhone($e['phone']), 'email' => self::maskEmail($e['email']), 'has_phone' => (bool) $e['phone'], 'has_email' => (bool) $e['email'],
                    'trades' => array_values(array_map(fn ($k) => ['key' => $k, 'name' => $tradeNames[$k] ?? $k], $m['trades'])), 'visibility' => $m['visibility'],
                    'work' => $work[$e['type'] . ':' . $e['id']] ?? 0, 'url' => $e['url'] ?? null];
            }, $slice),
            'trades' => $book === 'yellow' ? array_values(array_map(fn ($t) => $t + ['count' => $counts[$t['key']] ?? 0], array_filter($trades, fn ($t) => $t['is_active'] || ($counts[$t['key']] ?? 0) > 0))) : [],
            'no_trade' => $book === 'yellow' ? $counts['none'] : 0,
            'levels' => $this->allowedLevels(),
            'can' => ['reveal' => $user->hasPermission('projects.directory.contacts'), 'visibility' => $user->hasPermission('projects.directory.visibility'), 'publish' => $user->hasPermission('projects.directory.publish'),
                'manage' => $user->hasPermission('projects.directory.manage'), 'export' => $user->hasPermission('projects.directory.export'),
                'yellow' => $user->hasPermission('projects.directory.yellow'), 'white' => $user->hasPermission('projects.directory.white')],
        ];
    }

    /** The phone and email of one entry, in full. Logged, and counted by Projects security. @return array{phone: ?string, email: ?string} */
    public function reveal(string $type, int $id, User $user): array
    {
        $e = $this->entry($type, $id, $user);
        ProjectLog::record(null, $user, 'directory.revealed', $type, $id, null, ['who' => $e['name']]);
        app(ProjectSecurity::class)->noteReveal($user);

        return ['phone' => $e['phone'], 'email' => $e['email']];
    }

    /** Set an entry's trades (`projects.directory.manage`) or its visibility (`projects.directory.visibility`, and `.publish` to make it public). @param array<string, mixed> $d */
    public function change(string $type, int $id, array $d, User $by): void
    {
        $e = $this->entry($type, $id, $by);
        $row = DB::table('project_directory')->where('entry_type', $type)->where('entry_id', $id)->first();
        $old = ['trades' => $row ? (json_decode((string) $row->trades, true) ?: []) : [], 'visibility' => $row->visibility ?? 'staff'];
        $new = $old;
        if (array_key_exists('trades', $d)) {
            if (! $by->hasPermission('projects.directory.manage')) {
                throw new ProjectException('You may not change trades in the directory.', 403);
            }
            $keys = array_values(array_unique(array_map('strval', (array) $d['trades'])));
            $known = DB::table('project_lists')->where('list', 'trade')->whereIn('key', $keys)->pluck('key')->all();
            if (array_diff($keys, $known)) {
                throw new ProjectException('Choose trades from the list.');
            }
            $new['trades'] = $keys;
        }
        if (array_key_exists('visibility', $d)) {
            $level = (string) $d['visibility'];
            if (! $by->hasPermission('projects.directory.visibility')) {
                throw new ProjectException('You may not change who can see a directory entry.', 403);
            }
            if (! in_array($level, $this->allowedLevels(), true)) {
                throw new ProjectException('That level is switched off in Projects configuration.');
            }
            if ($level === 'public' && $old['visibility'] !== 'public' && ! $by->hasPermission('projects.directory.publish')) {
                throw new ProjectException('Making an entry public needs its own permission.', 403);
            }
            if ($type === 'employee' && $level !== 'staff' && ! $by->hasPermission('projects.directory.staff')) {
                throw new ProjectException('You may not change staff entries.', 403);
            }
            $new['visibility'] = $level;
        }
        if ($new === $old) {
            return;
        }
        DB::table('project_directory')->updateOrInsert(['entry_type' => $type, 'entry_id' => $id], ['trades' => json_encode($new['trades']), 'visibility' => $new['visibility'], 'updated_by' => $by->id, 'updated_at' => now()]);
        ProjectLog::record(null, $by, 'directory.changed', $type, $id, array_diff_assoc(array_map(fn ($v) => is_array($v) ? implode(', ', $v) : $v, $old), array_map(fn ($v) => is_array($v) ? implode(', ', $v) : $v, $new)) ?: $old,
            ['who' => $e['name']] + array_map(fn ($v) => is_array($v) ? implode(', ', $v) : $v, $new));
    }

    /** Every entry of a book, for the export. Phone and email in full only for someone who may reveal them. @return array<int, array<string, mixed>> */
    public function exportRows(User $user, string $book): array
    {
        $entries = $book === 'white' ? $this->people('', $user->hasPermission('projects.directory.staff')) : $this->organisations('');
        $meta = $this->meta($entries);
        $full = $user->hasPermission('projects.directory.contacts');
        $tradeNames = collect(app(ProjectLists::class)->of('trade'))->pluck('name', 'key');

        return array_map(fn ($e) => ['name' => $e['name'], 'is' => $e['is'], 'works_for' => $e['works_for'] ?? '', 'phone' => $full ? $e['phone'] : self::maskPhone($e['phone']), 'email' => $full ? $e['email'] : self::maskEmail($e['email']),
            'trades' => implode('; ', array_map(fn ($k) => $tradeNames[$k] ?? $k, $meta[$e['type'] . ':' . $e['id']]['trades'] ?? [])), 'visibility' => self::LEVELS[$meta[$e['type'] . ':' . $e['id']]['visibility'] ?? 'staff']], $entries);
    }

    /** @return string[] the levels Configuration allows */
    public function allowedLevels(): array
    {
        $on = app(ProjectSettings::class)->get('directory')['levels'];

        return array_values(array_filter(array_keys(self::LEVELS), fn ($l) => $l === 'staff' || in_array($l, $on, true)));
    }

    public static function maskPhone(?string $p): ?string
    {
        if (! $p) {
            return null;
        }
        $digits = preg_replace('/\D+/', '', $p);

        return strlen($digits) <= 3 ? '•••' : str_repeat('•', max(3, strlen($digits) - 3)) . substr($digits, -3);
    }

    public static function maskEmail(?string $e): ?string
    {
        if (! $e || ! str_contains($e, '@')) {
            return $e ? '•••' : null;
        }
        [$name, $domain] = explode('@', $e, 2);

        return mb_substr($name, 0, 1) . '•••@' . $domain;
    }

    // ------------------------------------------------------------------ inside

    /** One entry, if this person may see it in the directory. @return array<string, mixed> */
    private function entry(string $type, int $id, User $user): array
    {
        if (! in_array($type, self::TYPES, true) || ! ProjectsSetup::relationships()) {
            throw new ProjectException('Not found.', 404);
        }
        if ($type === 'employee' && ! $user->hasPermission('projects.directory.staff')) {
            throw new ProjectException('Not found.', 404);
        }
        $pool = match ($type) {
            'customer' => array_merge($this->organisations('', [$id]), $this->people('', false, [$id], ['customer'])),
            'party' => array_merge($this->organisations('', [$id], ['party']), $this->people('', false, [$id], ['party'])),
            'vendor' => $this->organisations('', [$id], ['vendor']),
            'contact' => $this->people('', false, [$id], ['contact']),
            'employee' => $this->people('', true, [$id], ['employee']),
        };
        foreach ($pool as $e) {
            if ($e['type'] === $type && $e['id'] === $id) {
                return $e;
            }
        }
        throw new ProjectException('Not found.', 404);
    }

    /** @param int[]|null $only @param string[] $types @return array<int, array<string, mixed>> */
    private function organisations(string $q, ?array $only = null, array $types = ['customer', 'party', 'vendor']): array
    {
        $like = $this->like($q);
        $out = [];
        if (in_array('customer', $types, true) && Schema::hasTable('customers')) {
            $hasPhone = Schema::hasColumn('customers', 'phone');
            foreach (DB::table('customers')->whereNull('deleted_at')->whereNotNull('company_name')->where('company_name', '!=', '')->when($only, fn ($w) => $w->whereIn('id', $only))
                ->when($like, fn ($w) => $w->where('company_name', 'like', $like))->orderBy('company_name')->limit(self::PER_SOURCE)->get() as $c) {
                $out[] = ['type' => 'customer', 'id' => (int) $c->id, 'name' => $c->company_name, 'is' => 'Client', 'phone' => $hasPhone ? $c->phone : null, 'email' => $c->email, 'url' => "/admin/projects/clients/{$c->id}"];
            }
        }
        if (in_array('party', $types, true)) {
            foreach (DB::table('project_parties')->whereNull('deleted_at')->where('kind', 'organisation')->when($only, fn ($w) => $w->whereIn('id', $only))
                ->when($like, fn ($w) => $w->where('name', 'like', $like))->orderBy('name')->limit(self::PER_SOURCE)->get() as $p) {
                $out[] = ['type' => 'party', 'id' => (int) $p->id, 'name' => $p->name, 'is' => 'Party', 'phone' => $p->phone, 'email' => $p->email];
            }
        }
        if (in_array('vendor', $types, true) && Schema::hasTable('vendors')) {
            $soft = Schema::hasColumn('vendors', 'deleted_at');
            foreach (DB::table('vendors')->when($soft, fn ($w) => $w->whereNull('deleted_at'))->when($only, fn ($w) => $w->whereIn('id', $only))
                ->when($like, fn ($w) => $w->where('company_name', 'like', $like))->orderBy('company_name')->limit(self::PER_SOURCE)->get() as $v) {
                $out[] = ['type' => 'vendor', 'id' => (int) $v->id, 'name' => $v->company_name, 'is' => 'Vendor', 'phone' => $v->phone ?? null, 'email' => $v->email ?? null, 'job_title' => null, 'works_for' => null];
            }
        }
        usort($out, fn ($a, $b) => strcasecmp($a['name'], $b['name']));

        return $out;
    }

    /** @param int[]|null $only @param string[] $types @return array<int, array<string, mixed>> */
    private function people(string $q, bool $staff, ?array $only = null, array $types = ['contact', 'party', 'customer', 'employee']): array
    {
        $like = $this->like($q);
        $out = [];
        if (in_array('contact', $types, true)) {
            $rows = DB::table('project_contacts')->whereNull('deleted_at')->where('owner_type', '!=', 'lead')->when($only, fn ($w) => $w->whereIn('id', $only))   // a lead's people are not in the directory until it is won
                ->when($like, fn ($w) => $w->where('name', 'like', $like))->orderBy('name')->limit(self::PER_SOURCE)->get();
            $owners = $this->ownerNames($rows);
            foreach ($rows as $c) {
                $out[] = ['type' => 'contact', 'id' => (int) $c->id, 'name' => $c->name, 'is' => 'Contact', 'works_for' => $owners[$c->owner_type][$c->owner_id] ?? null, 'job_title' => $c->job_title, 'phone' => $c->phone, 'email' => $c->email];
            }
        }
        if (in_array('party', $types, true)) {
            foreach (DB::table('project_parties')->whereNull('deleted_at')->where('kind', 'person')->when($only, fn ($w) => $w->whereIn('id', $only))
                ->when($like, fn ($w) => $w->where('name', 'like', $like))->orderBy('name')->limit(self::PER_SOURCE)->get() as $p) {
                $out[] = ['type' => 'party', 'id' => (int) $p->id, 'name' => $p->name, 'is' => 'Party', 'phone' => $p->phone, 'email' => $p->email];
            }
        }
        if (in_array('customer', $types, true) && Schema::hasTable('customers') && ProjectsSetup::relationships()) {
            $hasPhone = Schema::hasColumn('customers', 'phone');
            // a client that is a person, and that Projects has to do with (not every shopper)
            foreach (DB::table('customers as c')->whereNull('c.deleted_at')->where(fn ($w) => $w->whereNull('c.company_name')->orWhere('c.company_name', ''))->when($only, fn ($w) => $w->whereIn('c.id', $only))
                ->when(! $only, fn ($w) => $w->where(fn ($x) => $x->whereNotNull('c.projects_client_since')->orWhereExists(fn ($e) => $e->from('projects as p')->whereColumn('p.customer_id', 'c.id')->whereNull('p.deleted_at'))))
                ->when($like, fn ($w) => $w->where(fn ($x) => $x->where('c.first_name', 'like', $like)->orWhere('c.last_name', 'like', $like)))->limit(self::PER_SOURCE)->get(['c.*']) as $c) {
                $out[] = ['type' => 'customer', 'id' => (int) $c->id, 'name' => ProjectService::customerName($c), 'is' => 'Client', 'phone' => $hasPhone ? $c->phone : null, 'email' => $c->email, 'url' => "/admin/projects/clients/{$c->id}"];
            }
        }
        if ($staff && in_array('employee', $types, true) && Schema::hasTable('employees') && Schema::hasColumn('employees', 'user_id')) {
            $cols = fn (string $c) => Schema::hasColumn('employees', $c);
            foreach (DB::table('employees as e')->join('users as u', 'u.id', '=', 'e.user_id')->when($cols('deleted_at'), fn ($w) => $w->whereNull('e.deleted_at'))->when($only, fn ($w) => $w->whereIn('e.id', $only))
                ->when($like, fn ($w) => $w->where('u.name', 'like', $like))->limit(self::PER_SOURCE)->get(array_merge(['e.id', 'u.name', 'u.email'], array_map(fn ($c) => "e.{$c}", array_filter(['job_title', 'work_phone', 'work_email'], $cols)))) as $e) {
                $out[] = ['type' => 'employee', 'id' => (int) $e->id, 'name' => $e->name, 'is' => 'Staff', 'works_for' => null, 'job_title' => $e->job_title ?? null, 'phone' => $e->work_phone ?? null, 'email' => ($e->work_email ?? null) ?: $e->email];
            }
        }
        usort($out, fn ($a, $b) => strcasecmp($a['name'], $b['name']));

        return $out;
    }

    /** @param array<int, array<string, mixed>> $entries @return array<string, array{trades: string[], visibility: string}> */
    private function meta(array $entries): array
    {
        if (! $entries || ! ProjectsSetup::relationships()) {
            return [];
        }
        $out = [];
        foreach (collect($entries)->groupBy('type') as $type => $group) {
            foreach (DB::table('project_directory')->where('entry_type', $type)->whereIn('entry_id', $group->pluck('id'))->get() as $r) {
                $out["{$type}:{$r->entry_id}"] = ['trades' => json_decode((string) $r->trades, true) ?: [], 'visibility' => $r->visibility];
            }
        }

        return $out;
    }

    /** How many pieces of work, that this person may see, each entry has worked on. @param array<int, array<string, mixed>> $entries @return array<string, int> */
    private function workCounts(array $entries, User $user): array
    {
        $ids = fn (string $t) => array_column(array_filter($entries, fn ($e) => $e['type'] === $t), 'id');
        $visible = fn () => app(ProjectAccess::class)->visible(DB::table('projects as p'), $user);
        $out = [];
        if ($c = $ids('customer')) {
            foreach ($visible()->whereIn('p.customer_id', $c)->groupBy('p.customer_id')->selectRaw('p.customer_id as k, COUNT(*) as n')->pluck('n', 'k') as $k => $n) {
                $out["customer:{$k}"] = (int) $n;
            }
        }
        if ($p = $ids('party')) {
            foreach ($visible()->join('project_party_links as l', 'l.project_id', '=', 'p.id')->whereIn('l.party_id', $p)->groupBy('l.party_id')->selectRaw('l.party_id as k, COUNT(DISTINCT p.id) as n')->pluck('n', 'k') as $k => $n) {
                $out["party:{$k}"] = (int) $n;
            }
        }
        if ($c = $ids('contact')) {
            foreach ($visible()->join('project_contact_links as l', 'l.project_id', '=', 'p.id')->whereIn('l.contact_id', $c)->groupBy('l.contact_id')->selectRaw('l.contact_id as k, COUNT(DISTINCT p.id) as n')->pluck('n', 'k') as $k => $n) {
                $out["contact:{$k}"] = (int) $n;
            }
        }

        return $out;
    }

    /** @return array<string, array<int, string>> */
    private function ownerNames(Collection $rows): array
    {
        $ids = fn (string $t) => $rows->where('owner_type', $t)->pluck('owner_id')->unique()->all();

        return [
            'customer' => DB::table('customers')->whereIn('id', $ids('customer'))->get(['id', 'company_name', 'first_name', 'last_name'])->mapWithKeys(fn ($c) => [$c->id => ProjectService::customerName($c)])->all(),
            'party' => DB::table('project_parties')->whereIn('id', $ids('party'))->pluck('name', 'id')->all(),
        ];
    }

    private function like(string $q): ?string
    {
        $q = trim($q);

        return $q === '' ? null : '%' . str_replace(['\\', '%', '_'], ['\\\\', '\%', '\_'], $q) . '%';
    }
}
