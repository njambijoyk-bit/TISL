<?php

namespace App\Services\Projects;

use App\Models\User;
use Illuminate\Support\Facades\DB;

/**
 * What things are called. One structure serves every industry; an industry only changes the words: a "project" is a Matter to a law firm and a
 * Contract to a builder, and it is the same column. Three layers, the later winning:
 *   1. the name the industry ships with            (project_term_names)
 *   2. the company's own name for it, where it differs  (project_term_overrides)
 * and which industry's words a person sees:
 *   the company's default industry, or their own choice when they hold `projects.naming.personal` (their screens only: exports and documents
 *   always use the company's).
 * Screens, exports and messages all ask here, so no word for a thing is ever typed into a screen.
 */
class ProjectNames
{
    /** @var array<string, array<string, array<string, mixed>>> */
    private array $cache = [];

    public function __construct(private ProjectSettings $settings) {}

    /** @return array<int, array{key: string, name: string, group: string, is_active: bool}> */
    public function industries(bool $activeOnly = false): array
    {
        if (! ProjectsSetup::ready()) {
            return [];
        }

        return DB::table('project_industries')->when($activeOnly, fn ($q) => $q->where('is_active', 1))->orderBy('sort_order')->orderBy('name')->get()
            ->map(fn ($r) => ['key' => $r->key, 'name' => $r->name, 'group' => $r->grp, 'is_active' => (bool) $r->is_active])->all();
    }

    /** @return array<int, array{key: string, description: string}> */
    public function terms(): array
    {
        return ProjectsSetup::ready()
            ? DB::table('project_terms')->orderBy('sort_order')->get()->map(fn ($r) => ['key' => $r->key, 'description' => $r->description])->all()
            : [];
    }

    /**
     * Every term's name in an industry, the company's own name applied over the shipped one.
     *
     * @return array<string, array{name: string, plural: string, shipped_name: string, shipped_plural: string, changed: bool}>
     */
    public function names(string $industry): array
    {
        if (isset($this->cache[$industry])) {
            return $this->cache[$industry];
        }
        if (! ProjectsSetup::ready()) {
            return [];
        }
        $out = [];
        foreach (DB::table('project_term_names')->where('industry_key', $industry)->get() as $r) {
            $out[$r->term_key] = ['name' => $r->name, 'plural' => $r->name_plural, 'shipped_name' => $r->name, 'shipped_plural' => $r->name_plural, 'changed' => false];
        }
        foreach (DB::table('project_term_overrides')->where('industry_key', $industry)->get() as $r) {
            if (isset($out[$r->term_key])) {
                $out[$r->term_key] = ['name' => $r->name, 'plural' => $r->name_plural, 'changed' => true] + $out[$r->term_key];
            }
        }

        return $this->cache[$industry] = $out;
    }

    /** The industry whose words this person sees on their screens. */
    public function industryFor(?User $user): string
    {
        $default = $this->settings->defaultIndustry();
        if (! $user || ! ProjectsSetup::ready() || ! $user->hasPermission('projects.naming.personal')) {
            return $default;
        }
        $own = DB::table('project_user_prefs')->where('user_id', $user->id)->value('naming_industry_key');

        return $own && DB::table('project_industries')->where('key', $own)->where('is_active', 1)->exists() ? (string) $own : $default;
    }

    /** The person's own choice as stored (null = the company's), whether or not they may still use it. */
    public function personalChoice(User $user): ?string
    {
        return ProjectsSetup::ready() ? DB::table('project_user_prefs')->where('user_id', $user->id)->value('naming_industry_key') : null;
    }

    /** One word, for a person's screen: `term($user, 'project')` gives "Matter", `term($user, 'project', true)` gives "Matters". */
    public function term(?User $user, string $key, bool $plural = false): string
    {
        return $this->word($this->industryFor($user), $key, $plural);
    }

    /** One word in the company's own industry: what exports, documents and messages to clients use. */
    public function companyTerm(string $key, bool $plural = false): string
    {
        return $this->word($this->settings->defaultIndustry(), $key, $plural);
    }

    /** One word in a given industry (a project that uses an industry other than the default is shown in its own words). */
    public function word(string $industry, string $key, bool $plural = false): string
    {
        $n = $this->names($industry)[$key] ?? null;

        return $n ? ($plural ? $n['plural'] : $n['name']) : ucfirst(str_replace('_', ' ', $key));
    }

    /** Give a term the company's own name in one industry. */
    public function rename(string $industry, string $term, string $name, string $plural, ?User $by): void
    {
        $this->assertKnown($industry, $term);
        [$name, $plural] = [$this->tidy($name), $this->tidy($plural)];
        if ($name === '' || $plural === '') {
            throw new ProjectException('Give the name for one and the name for several.');
        }
        if (mb_strlen($name) > 80 || mb_strlen($plural) > 80) {
            throw new ProjectException('A name can be up to 80 characters.');
        }
        $before = $this->names($industry)[$term];
        if ($name === $before['shipped_name'] && $plural === $before['shipped_plural']) {
            $this->reset($industry, $term, $by);   // back to what ships: no override is kept for it

            return;
        }
        DB::table('project_term_overrides')->updateOrInsert(['industry_key' => $industry, 'term_key' => $term], ['name' => $name, 'name_plural' => $plural, 'changed_by' => $by?->id, 'changed_at' => now()]);
        unset($this->cache[$industry]);
        ProjectLog::record(null, $by, 'names.renamed', 'term', null, ['industry' => $industry, 'term' => $term, 'name' => $before['name'], 'plural' => $before['plural']], ['name' => $name, 'plural' => $plural]);
    }

    /** Take the company's own name off a term: it goes back to what the industry ships with. */
    public function reset(string $industry, string $term, ?User $by): void
    {
        $this->assertKnown($industry, $term);
        $before = $this->names($industry)[$term];
        if (DB::table('project_term_overrides')->where('industry_key', $industry)->where('term_key', $term)->delete()) {
            unset($this->cache[$industry]);
            ProjectLog::record(null, $by, 'names.reset', 'term', null, ['industry' => $industry, 'term' => $term, 'name' => $before['name'], 'plural' => $before['plural']], ['name' => $before['shipped_name'], 'plural' => $before['shipped_plural']]);
        }
    }

    /** A person chooses the industry whose words they see (null = the company's). */
    public function setPersonal(User $user, ?string $industry): void
    {
        if ($industry !== null && ! DB::table('project_industries')->where('key', $industry)->where('is_active', 1)->exists()) {
            throw new ProjectException('Choose an industry that is switched on.');
        }
        DB::table('project_user_prefs')->updateOrInsert(['user_id' => $user->id], ['naming_industry_key' => $industry, 'updated_at' => now()]);
    }

    /** Switch an industry on or off. The company's default cannot be switched off. */
    public function setIndustryActive(string $industry, bool $active, ?User $by): void
    {
        $row = DB::table('project_industries')->where('key', $industry)->first();
        if (! $row) {
            throw new ProjectException('There is no such industry.', 404);
        }
        if (! $active && $industry === $this->settings->defaultIndustry()) {
            throw new ProjectException('This is the company\'s default industry. Choose another default first.');
        }
        if ((bool) $row->is_active !== $active) {
            DB::table('project_industries')->where('key', $industry)->update(['is_active' => $active ? 1 : 0, 'updated_at' => now()]);
            ProjectLog::record(null, $by, $active ? 'industry.switched_on' : 'industry.switched_off', 'industry', (int) $row->id, ['is_active' => ! $active], ['is_active' => $active]);
        }
    }

    private function assertKnown(string $industry, string $term): void
    {
        if (! isset($this->names($industry)[$term])) {
            throw new ProjectException('There is no such name to change.', 404);
        }
    }

    /** Plain text on one line: no markup, no control characters, single spaces. */
    private function tidy(string $s): string
    {
        return trim((string) preg_replace('/\s+/u', ' ', (string) preg_replace('/[\x00-\x1F\x7F<>]/u', ' ', strip_tags($s))));
    }
}
