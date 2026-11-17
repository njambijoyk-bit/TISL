<?php

namespace App\Services\Projects;

use App\Models\User;
use Illuminate\Support\Facades\DB;

/**
 * Other parties (docs/PROJECTS_STAGE3_SPEC.md, build 3.3): anyone on a project who is neither the client nor staff: the other side and their
 * lawyers, the architect, the county, a subcontractor. One party record is reused across projects; what it IS on a project is the role of
 * that link, from a list that follows the project's industry. A client's own contacts can be put on a project too, as the people to call.
 * Reading needs opening the project; changing needs `projects.parties` and a project role that manages its links.
 */
class ProjectParties
{
    public function __construct(private ProjectAccess $access, private ProjectLists $lists) {}

    /** @return array<string, mixed> */
    public function forProject(object $project, User $user): array
    {
        if (! ProjectsSetup::relationships()) {
            return ['ready' => false, 'parties' => [], 'client_contacts' => [], 'roles' => [], 'available_contacts' => [], 'can' => ['change' => false]];
        }
        $contacts = DB::table('project_contacts')->whereNull('deleted_at')->get(['id', 'name', 'phone', 'email', 'job_title', 'owner_type', 'owner_id'])->keyBy('id');
        $parties = DB::table('project_party_links as l')->join('project_parties as p', 'p.id', '=', 'l.party_id')->leftJoin('project_lists as r', 'r.id', '=', 'l.role_id')
            ->where('l.project_id', $project->id)->whereNull('p.deleted_at')->orderBy('r.sort_order')->orderBy('p.name')
            ->get(['l.id', 'l.party_id', 'p.name', 'p.kind', 'p.email', 'p.phone', 'r.name as role', 'l.contact_id', 'l.note'])
            ->map(fn ($l) => ['id' => (int) $l->id, 'party_id' => (int) $l->party_id, 'name' => $l->name, 'kind' => $l->kind, 'email' => $l->email, 'phone' => $l->phone, 'role' => $l->role, 'note' => $l->note,
                'contact' => $l->contact_id && isset($contacts[$l->contact_id]) ? ['id' => (int) $l->contact_id, 'name' => $contacts[$l->contact_id]->name, 'phone' => $contacts[$l->contact_id]->phone] : null,
                'also' => $this->also($l->name, (int) $l->party_id)])->all();
        $mine = DB::table('project_contact_links')->where('project_id', $project->id)->get()->filter(fn ($l) => isset($contacts[$l->contact_id]))
            ->map(fn ($l) => ['id' => (int) $l->id, 'contact_id' => (int) $l->contact_id, 'name' => $contacts[$l->contact_id]->name, 'job_title' => $contacts[$l->contact_id]->job_title,
                'phone' => $contacts[$l->contact_id]->phone, 'email' => $contacts[$l->contact_id]->email, 'note' => $l->note])->values()->all();
        $taken = array_column($mine, 'contact_id');

        return [
            'ready' => true, 'parties' => $parties, 'client_contacts' => $mine,
            'roles' => array_values(array_map(fn ($r) => ['id' => $r['id'], 'name' => $r['name']], $this->lists->of('party_role', true, $project->industry_key))),
            // the client's contacts that could be put on this project
            'available_contacts' => $project->customer_id ? $contacts->filter(fn ($c) => $c->owner_type === 'customer' && (int) $c->owner_id === (int) $project->customer_id && ! in_array((int) $c->id, $taken, true))
                ->map(fn ($c) => ['id' => (int) $c->id, 'name' => $c->name])->values()->all() : [],
            'can' => ['change' => $this->access->allows($user, 'parties', $project)],
        ];
    }

    /** Parties already known, to pick from. @return array<int, array<string, mixed>> */
    public function search(string $q): array
    {
        $like = '%' . str_replace(['%', '_'], ['\%', '\_'], trim($q)) . '%';

        return DB::table('project_parties')->whereNull('deleted_at')->when(trim($q) !== '', fn ($w) => $w->where(fn ($x) => $x->where('name', 'like', $like)->orWhere('email', 'like', $like)->orWhere('phone', 'like', $like)))
            ->orderBy('name')->limit(20)->get()->map(fn ($p) => ['id' => (int) $p->id, 'name' => $p->name, 'detail' => implode(' · ', array_filter([$p->kind === 'person' ? 'A person' : null, $p->phone, $p->email])) ?: null])->all();
    }

    /**
     * Put a party on a project: one already known (`party_id`) or a new one (name, kind, email, phone).
     *
     * @param array<string, mixed> $d party_id | name, kind, email, phone, address; role_id; contact_id; note
     */
    public function add(object $project, array $d, User $by): void
    {
        $this->access->authorize($by, 'parties', $project);
        $role = DB::table('project_lists')->where('list', 'party_role')->where('id', (int) ($d['role_id'] ?? 0))->where('is_active', 1)
            ->where(fn ($w) => $w->whereNull('industry_key')->orWhere('industry_key', $project->industry_key))->first();
        if (! $role) {
            throw new ProjectException('Choose what they are on this from the list.');
        }
        DB::transaction(function () use ($project, $d, $by, $role) {
            $partyId = ($d['party_id'] ?? null) ? (int) $d['party_id'] : $this->create($d, $by);
            $party = DB::table('project_parties')->where('id', $partyId)->whereNull('deleted_at')->first();
            if (! $party) {
                throw new ProjectException('Choose a party from the list, or add a new one.');
            }
            if (DB::table('project_party_links')->where('project_id', $project->id)->where('party_id', $partyId)->where('role_id', $role->id)->exists()) {
                throw new ProjectException('They are already on this in that role.');
            }
            $contactId = ($d['contact_id'] ?? null) ? (int) $d['contact_id'] : null;
            if ($contactId && ! DB::table('project_contacts')->where('id', $contactId)->where('owner_type', 'party')->where('owner_id', $partyId)->whereNull('deleted_at')->exists()) {
                throw new ProjectException('Choose one of that party\'s own contacts.');
            }
            $note = trim((string) ($d['note'] ?? ''));
            $id = DB::table('project_party_links')->insertGetId(['project_id' => $project->id, 'party_id' => $partyId, 'role_id' => $role->id, 'contact_id' => $contactId, 'note' => $note === '' ? null : mb_substr($note, 0, 200), 'created_by' => $by->id, 'created_at' => now()]);
            ProjectLog::record((int) $project->id, $by, 'party.added', 'party', $id, null, ['party' => $party->name, 'as' => $role->name]);
        });
    }

    public function remove(object $project, int $linkId, User $by): void
    {
        $this->access->authorize($by, 'parties', $project);
        $l = DB::table('project_party_links as l')->join('project_parties as p', 'p.id', '=', 'l.party_id')->where('l.project_id', $project->id)->where('l.id', $linkId)->first(['l.id', 'p.name']);
        if (! $l) {
            throw new ProjectException('Not found.', 404);
        }
        DB::table('project_party_links')->where('id', $l->id)->delete();
        ProjectLog::record((int) $project->id, $by, 'party.removed', 'party', (int) $l->id, ['party' => $l->name], null);
    }

    /** Put one of the client's contacts on the project as a person to call. */
    public function addContact(object $project, int $contactId, ?string $note, User $by): void
    {
        $this->access->authorize($by, 'parties', $project);
        $c = $project->customer_id ? DB::table('project_contacts')->where('id', $contactId)->where('owner_type', 'customer')->where('owner_id', $project->customer_id)->whereNull('deleted_at')->first() : null;
        if (! $c) {
            throw new ProjectException('Choose one of this client\'s contacts.');
        }
        if (DB::table('project_contact_links')->where('project_id', $project->id)->where('contact_id', $contactId)->exists()) {
            return;
        }
        $note = trim((string) $note);
        $id = DB::table('project_contact_links')->insertGetId(['project_id' => $project->id, 'contact_id' => $contactId, 'note' => $note === '' ? null : mb_substr($note, 0, 200), 'created_by' => $by->id, 'created_at' => now()]);
        ProjectLog::record((int) $project->id, $by, 'contact.put_on', 'contact', $id, null, ['contact' => $c->name]);
    }

    public function removeContact(object $project, int $linkId, User $by): void
    {
        $this->access->authorize($by, 'parties', $project);
        if (! DB::table('project_contact_links')->where('project_id', $project->id)->where('id', $linkId)->delete()) {
            throw new ProjectException('Not found.', 404);
        }
        ProjectLog::record((int) $project->id, $by, 'contact.taken_off', 'contact', $linkId);
    }

    /** @param array<string, mixed> $d @return int */
    private function create(array $d, User $by): int
    {
        $name = trim(preg_replace('/\s+/', ' ', (string) ($d['name'] ?? '')));
        if ($name === '') {
            throw new ProjectException('Give the party a name.');
        }
        $email = trim((string) ($d['email'] ?? '')) ?: null;
        if ($email !== null && ! filter_var($email, FILTER_VALIDATE_EMAIL)) {
            throw new ProjectException('That is not an email address.');
        }
        $address = trim((string) ($d['address'] ?? ''));

        return DB::table('project_parties')->insertGetId(['name' => mb_substr($name, 0, 160), 'kind' => ($d['kind'] ?? '') === 'person' ? 'person' : 'organisation', 'email' => $email === null ? null : mb_strtolower($email),
            'phone' => ProjectDuplicates::phone($d['phone'] ?? null), 'address' => $address === '' ? null : mb_substr($address, 0, 200), 'created_by' => $by->id, 'created_at' => now(), 'updated_at' => now()]);
    }

    /** The same name on another side: a lead or a client by that name. For a law firm, the first sign of a conflict. @return string[] */
    private function also(string $name, int $partyId): array
    {
        $out = [];
        foreach (app(ProjectDuplicates::class)->find(['name' => $name], ['party', $partyId]) as $k) {
            if (in_array($k['type'], ['lead', 'customer'], true)) {
                $out[] = $k['type'] === 'customer' ? 'Also a client' : ucfirst(lcfirst($k['detail']));
            }
        }

        return array_values(array_unique($out));
    }
}
