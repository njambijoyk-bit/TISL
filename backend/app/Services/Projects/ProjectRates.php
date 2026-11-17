<?php

namespace App\Services\Projects;

use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * The rate card (docs/PROJECTS_STAGE5_SPEC.md, build 5.8). A rate is a Books service package (a service variant with its price per unit); the
 * price, its tax and its sales ledger are Books'. The card only says which package a person's time is billed at.
 *
 * Most specific wins, on the day the time was worked: this work and this person; this work and their project role; this work for everyone;
 * this person; their project role; everyone. A rate can start and end on a day. Set with `projects.money.rates` (for one piece of work, also
 * a project role that sees its money).
 */
class ProjectRates
{
    public function __construct(private ProjectAccess $access) {}

    public function ready(): bool
    {
        return ProjectsSetup::work() && Schema::hasTable('service_variants') && Schema::hasTable('services');
    }

    /** The company's card, or one piece of work's. @return array<string, mixed> */
    public function card(User $user, ?object $project = null): array
    {
        if (! $this->ready()) {
            return ['ready' => false, 'rates' => []];
        }
        $rows = DB::table('project_rates')->when($project, fn ($q) => $q->where('project_id', $project->id), fn ($q) => $q->whereNull('project_id'))->orderBy('id')->get();
        $packages = collect($this->packages())->keyBy('id');
        $names = DB::table('users')->whereIn('id', $rows->pluck('user_id')->filter()->all() ?: [0])->pluck('name', 'id');
        $roles = DB::table('project_roles')->pluck('name', 'id');

        return [
            'ready' => true,
            'rates' => $rows->map(fn ($r) => ['id' => (int) $r->id, 'who' => $r->user_id ? ($names[$r->user_id] ?? 'Someone') : ($r->project_role_id ? ($roles[$r->project_role_id] ?? 'A role') . ' (role)' : 'Everyone'),
                'user_id' => $r->user_id ? (int) $r->user_id : null, 'project_role_id' => $r->project_role_id ? (int) $r->project_role_id : null,
                'package' => $packages[$r->service_variant_id] ?? ['id' => (int) $r->service_variant_id, 'name' => 'A package no longer offered', 'gone' => true],
                'valid_from' => $r->valid_from, 'valid_to' => $r->valid_to])->values()->all(),
            'packages' => array_values($packages->all()),
            'roles' => DB::table('project_roles')->where('is_active', 1)->orderBy('sort_order')->get(['id', 'name'])->map(fn ($r) => ['id' => (int) $r->id, 'name' => $r->name])->all(),
            'people' => $project ? DB::table('project_members as m')->join('users as u', 'u.id', '=', 'm.user_id')->where('m.project_id', $project->id)->where('m.status', 'active')->distinct()->orderBy('u.name')->get(['u.id', 'u.name'])->map(fn ($u) => ['id' => (int) $u->id, 'name' => $u->name])->all()
                : DB::table('users')->whereIn('id', DB::table('project_members')->where('status', 'active')->distinct()->pluck('user_id'))->orderBy('name')->get(['id', 'name'])->map(fn ($u) => ['id' => (int) $u->id, 'name' => $u->name])->all(),
            'can' => ['change' => $user->hasPermission('projects.money.rates') && (! $project || $this->access->decide($user, 'money', $project)['allowed'])],
        ];
    }

    /** @param array<string, mixed> $d service_variant_id, user_id | project_role_id, valid_from, valid_to */
    public function save(?object $project, array $d, User $by): int
    {
        $this->needMay($project, $by);
        $variant = (int) ($d['service_variant_id'] ?? 0);
        if (! in_array($variant, array_column($this->packages(), 'id'), true)) {
            throw new ProjectException('Choose a service package from Books.');
        }
        $user = ! empty($d['user_id']) ? (int) $d['user_id'] : null;
        $role = ! $user && ! empty($d['project_role_id']) ? (int) $d['project_role_id'] : null;
        if ($user && ! DB::table('users')->where('id', $user)->exists()) {
            throw new ProjectException('Choose a person.');
        }
        if ($role && ! DB::table('project_roles')->where('id', $role)->exists()) {
            throw new ProjectException('Choose a project role.');
        }
        $from = ! empty($d['valid_from']) ? $this->day($d['valid_from']) : null;
        $to = ! empty($d['valid_to']) ? $this->day($d['valid_to']) : null;
        if ($from && $to && $from > $to) {
            throw new ProjectException('A rate cannot end before it starts.');
        }
        $id = DB::table('project_rates')->insertGetId(['project_id' => $project?->id, 'user_id' => $user, 'project_role_id' => $role, 'service_variant_id' => $variant,
            'valid_from' => $from, 'valid_to' => $to, 'created_by' => $by->id, 'created_at' => now(), 'updated_at' => now()]);
        ProjectLog::record($project ? (int) $project->id : null, $by, 'rate.set', 'rate', $id, null, ['package' => $variant, 'user' => $user, 'role' => $role, 'from' => $from, 'to' => $to]);

        return $id;
    }

    public function delete(?object $project, int $id, User $by): void
    {
        $this->needMay($project, $by);
        $r = DB::table('project_rates')->where('id', $id)->when($project, fn ($q) => $q->where('project_id', $project->id), fn ($q) => $q->whereNull('project_id'))->first() ?? throw new ProjectException('Not found.', 404);
        DB::table('project_rates')->where('id', $r->id)->delete();
        ProjectLog::record($project ? (int) $project->id : null, $by, 'rate.removed', 'rate', (int) $r->id, ['package' => (int) $r->service_variant_id], null);
    }

    /**
     * The package an entry is billed at: the most specific rate in force on the day it was worked.
     * @return array{id: int, name: string, service: string, service_id: int, price: ?float, unit: ?string}|null
     */
    public function for(object $entry): ?array
    {
        if (! $this->ready()) {
            return null;
        }
        $day = $entry->work_date;
        $role = DB::table('project_members')->where('project_id', $entry->project_id)->where('user_id', $entry->user_id)->value('project_role_id');
        $rates = DB::table('project_rates')->where(fn ($q) => $q->whereNull('project_id')->orWhere('project_id', $entry->project_id))
            ->where(fn ($q) => $q->whereNull('valid_from')->orWhere('valid_from', '<=', $day))->where(fn ($q) => $q->whereNull('valid_to')->orWhere('valid_to', '>=', $day))->get();
        $rank = function ($r) use ($entry, $role) {
            $here = $r->project_id !== null;
            if ($r->user_id) {
                return (int) $r->user_id === (int) $entry->user_id ? ($here ? 1 : 4) : null;
            }
            if ($r->project_role_id) {
                return $role && (int) $r->project_role_id === (int) $role ? ($here ? 2 : 5) : null;
            }

            return $here ? 3 : 6;
        };
        $best = $rates->map(fn ($r) => [$rank($r), $r])->filter(fn ($x) => $x[0] !== null)->sortBy(fn ($x) => sprintf('%d-%010d', $x[0], PHP_INT_MAX - (int) $x[1]->id))->first();

        return $best ? (collect($this->packages())->firstWhere('id', (int) $best[1]->service_variant_id)) : null;
    }

    /** Books service packages that can be a rate: active, with their price and unit. @return array<int, array<string, mixed>> */
    public function packages(): array
    {
        if (! Schema::hasTable('service_variants') || ! Schema::hasTable('services')) {
            return [];
        }
        $q = DB::table('service_variants as v')->join('services as s', 's.id', '=', 'v.service_id');
        if (Schema::hasColumn('service_variants', 'status')) {
            $q->where(fn ($w) => $w->whereNull('v.status')->orWhereIn('v.status', ['active', 'published']));
        }
        if (Schema::hasColumn('services', 'deleted_at')) {
            $q->whereNull('s.deleted_at');
        }
        $units = Schema::hasTable('units_of_measure') && Schema::hasColumn('service_variants', 'price_unit_id') ? DB::table('units_of_measure')->pluck('code', 'id') : collect();

        return $q->orderBy('s.name')->orderBy('v.position')->get(['v.id', 'v.name', 'v.price', 's.id as service_id', 's.name as service'] + (Schema::hasColumn('service_variants', 'price_unit_id') ? ['price_unit_id' => 'v.price_unit_id'] : []))
            ->map(fn ($v) => ['id' => (int) $v->id, 'name' => $v->name, 'service' => $v->service, 'service_id' => (int) $v->service_id, 'price' => $v->price !== null ? (float) $v->price : null,
                'unit' => isset($v->price_unit_id) ? ($units[$v->price_unit_id] ?? null) : null])->all();
    }

    private function needMay(?object $project, User $by): void
    {
        if (! $this->ready()) {
            throw new ProjectException('The rate card needs database script 261 and Books services.', 409);
        }
        if (! $by->hasPermission('projects.money.rates')) {
            throw new ProjectException('Setting rates needs its own permission.', 403);
        }
        if ($project) {
            $this->access->authorize($by, 'money', $project);
        }
    }

    private function day(mixed $v): string
    {
        try {
            return \Carbon\Carbon::parse((string) $v)->toDateString();
        } catch (\Throwable) {
            throw new ProjectException('That is not a date.');
        }
    }
}
