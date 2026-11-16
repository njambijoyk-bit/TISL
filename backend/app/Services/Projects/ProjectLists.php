<?php

namespace App\Services\Projects;

use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * The lists an owner manages (docs/PROJECTS_STAGE3_SPEC.md, build 3.1): where leads come from, why one was lost, what a contact is there for,
 * what a party is on a project, the flags a client can carry, and the trades of the yellow pages. A row is switched off, never deleted, so
 * what already points at it keeps its name.
 */
class ProjectLists
{
    /** list => [what it is called, what it is for] */
    public const LISTS = [
        'source' => ['Where leads come from', 'Chosen when a lead is added.'],
        'lost_reason' => ['Why a lead or opportunity was lost', 'Asked when one is marked lost.'],
        'contact_role' => ['What a contact is there for', 'A contact can have several.'],
        'party_role' => ['What another party is on a project', 'Can belong to one industry or to all.'],
        'flag' => ['Flags on a client', 'Each is shown as one of the four named statuses.'],
        'trade' => ['Trades in the yellow pages', 'How organisations are grouped in the directory.'],
    ];

    private const STATUSES = ['info', 'good', 'warning', 'problem'];

    /** @return array<int, array<string, mixed>> the rows of one list; with $onlyActive the ones that can be chosen now */
    public function of(string $list, bool $onlyActive = false, ?string $industry = null): array
    {
        if (! ProjectsSetup::relationships()) {
            return [];
        }

        return DB::table('project_lists')->where('list', $list)->when($onlyActive, fn ($q) => $q->where('is_active', 1))
            ->when($industry !== null, fn ($q) => $q->where(fn ($w) => $w->whereNull('industry_key')->orWhere('industry_key', $industry)))
            ->orderBy('sort_order')->orderBy('name')->get()
            ->map(fn ($r) => ['id' => (int) $r->id, 'key' => $r->key, 'name' => $r->name, 'industry' => $r->industry_key, 'status' => $r->status_token, 'is_active' => (bool) $r->is_active, 'is_system' => (bool) $r->is_system])->all();
    }

    /** @return array<string, array<int, array<string, mixed>>> every list, for the Configuration page */
    public function all(): array
    {
        return array_combine(array_keys(self::LISTS), array_map(fn ($l) => $this->of($l), array_keys(self::LISTS)));
    }

    /** A row that can be chosen now, or a refusal in words. */
    public function need(string $list, mixed $id, string $what): object
    {
        $row = $id ? DB::table('project_lists')->where('list', $list)->where('id', (int) $id)->where('is_active', 1)->first() : null;
        if (! $row) {
            throw new ProjectException("Choose {$what} from the list.");
        }

        return $row;
    }

    public function name(mixed $id): ?string
    {
        return $id ? DB::table('project_lists')->where('id', (int) $id)->value('name') : null;
    }

    /** @param array<string, mixed> $d name, industry (party roles), status (flags) */
    public function add(string $list, array $d, User $by): void
    {
        $this->assertList($list);
        $values = $this->values($list, $d, null);
        $key = Str::slug($values['name'], '_') ?: 'item';
        $base = $key = mb_substr($key, 0, 50);
        for ($i = 2; DB::table('project_lists')->where('list', $list)->where('key', $key)->exists(); $i++) {
            $key = "{$base}_{$i}";
        }
        $id = DB::table('project_lists')->insertGetId($values + ['list' => $list, 'key' => $key, 'is_system' => 0, 'is_active' => 1,
            'sort_order' => ((int) DB::table('project_lists')->where('list', $list)->max('sort_order')) + 10, 'created_at' => now(), 'updated_at' => now()]);
        ProjectLog::record(null, $by, 'list.added', 'list', $id, null, ['list' => self::LISTS[$list][0], 'name' => $values['name']]);
    }

    /** @param array<string, mixed> $d name, industry, status, is_active, move (up|down) */
    public function change(string $list, int $id, array $d, User $by): void
    {
        $this->assertList($list);
        $row = DB::table('project_lists')->where('list', $list)->where('id', $id)->first();
        if (! $row) {
            throw new ProjectException('Not found.', 404);
        }
        if (isset($d['move'])) {
            $other = DB::table('project_lists')->where('list', $list)->where('sort_order', $d['move'] === 'up' ? '<' : '>', $row->sort_order)->orderBy('sort_order', $d['move'] === 'up' ? 'desc' : 'asc')->first();
            if ($other) {
                DB::table('project_lists')->where('id', $row->id)->update(['sort_order' => $other->sort_order]);
                DB::table('project_lists')->where('id', $other->id)->update(['sort_order' => $row->sort_order]);
            }

            return;
        }
        $new = $this->values($list, $d + ['name' => $row->name, 'industry' => $row->industry_key, 'status' => $row->status_token], $id);
        if (array_key_exists('is_active', $d)) {
            $new['is_active'] = $d['is_active'] ? 1 : 0;
        }
        $changed = array_filter($new, fn ($v, $k) => (string) ($row->$k ?? '') !== (string) ($v ?? ''), ARRAY_FILTER_USE_BOTH);
        if (! $changed) {
            return;
        }
        DB::table('project_lists')->where('id', $id)->update($changed + ['updated_at' => now()]);
        ProjectLog::record(null, $by, 'list.changed', 'list', $id, array_intersect_key((array) $row, $changed), $changed + ['list' => self::LISTS[$list][0]]);
    }

    /** @param array<string, mixed> $d @return array<string, mixed> */
    private function values(string $list, array $d, ?int $except): array
    {
        $name = trim(preg_replace('/\s+/', ' ', (string) ($d['name'] ?? '')));
        if ($name === '' || mb_strlen($name) > 80) {
            throw new ProjectException('Give it a name of up to 80 characters.');
        }
        if (DB::table('project_lists')->where('list', $list)->whereRaw('LOWER(name) = ?', [mb_strtolower($name)])->when($except, fn ($q) => $q->where('id', '!=', $except))->exists()) {
            throw new ProjectException('That name is already on the list.');
        }
        $out = ['name' => $name, 'industry_key' => null, 'status_token' => null];
        if ($list === 'party_role' && ($d['industry'] ?? null) !== null && $d['industry'] !== '') {
            if (! DB::table('project_industries')->where('key', $d['industry'])->exists()) {
                throw new ProjectException('Choose an industry from the list.');
            }
            $out['industry_key'] = (string) $d['industry'];
        }
        if ($list === 'flag') {
            $status = (string) ($d['status'] ?? 'warning');
            if (! in_array($status, self::STATUSES, true)) {
                throw new ProjectException('A flag is shown as information, good, warning or problem.');   // one of the theme's named statuses, never a colour
            }
            $out['status_token'] = $status;
        }

        return $out;
    }

    private function assertList(string $list): void
    {
        if (! isset(self::LISTS[$list])) {
            throw new ProjectException('There is no such list.', 404);
        }
        if (! ProjectsSetup::relationships()) {
            throw new ProjectException('This needs database script 259. Run it first.', 409);
        }
    }
}
