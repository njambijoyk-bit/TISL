<?php

namespace App\Services\Projects;

use App\Models\User;
use Illuminate\Support\Facades\DB;

/**
 * Contacts (docs/PROJECTS_STAGE3_SPEC.md, build 3.3): the people at a client, a lead or another party, each there for one or more reasons
 * from a list an owner manages. One of them is the main contact. Who may see and change them follows what they belong to:
 * a client's with `projects.clients.view` / `.manage`, a lead's with being able to see the lead / `projects.leads.manage`,
 * a party's with `projects.parties`.
 */
class ProjectContacts
{
    public const OWNERS = ['customer', 'lead', 'party'];

    public function __construct(private ProjectLeads $leads) {}

    /** Stop here unless this person may see (or change) the contacts of this owner. */
    public function authorize(string $type, int $id, User $user, bool $toChange): void
    {
        if (! in_array($type, self::OWNERS, true) || ! ProjectsSetup::relationships()) {
            throw new ProjectException('Not found.', 404);
        }
        if ($type === 'lead') {
            $this->leads->find($id, $user, $toChange);

            return;
        }
        $exists = DB::table($type === 'customer' ? 'customers' : 'project_parties')->where('id', $id)->whereNull('deleted_at')->exists();
        $may = $type === 'customer' ? $user->hasPermission($toChange ? 'projects.clients.manage' : 'projects.clients.view') || (! $toChange && $user->hasPermission('projects.clients.manage'))
            : $user->hasPermission('projects.parties') || (! $toChange && $user->hasPermission('projects.use'));
        if (! $exists) {
            throw new ProjectException('Not found.', 404);
        }
        if (! $may) {
            ProjectLog::refused(null, $user, 'contact.' . ($toChange ? 'change' : 'view'), "May not for a {$type}", $type, $id);
            throw new ProjectException($toChange ? 'You may not change these contacts.' : 'You may not see these contacts.', 403);
        }
    }

    /** @return array<int, array<string, mixed>> the main contact first */
    public function of(string $type, int $id): array
    {
        if (! ProjectsSetup::relationships()) {
            return [];
        }
        $roles = DB::table('project_lists')->where('list', 'contact_role')->pluck('name', 'key');

        return DB::table('project_contacts')->where('owner_type', $type)->where('owner_id', $id)->whereNull('deleted_at')->orderByDesc('is_main')->orderBy('name')->get()
            ->map(fn ($c) => ['id' => (int) $c->id, 'name' => $c->name, 'job_title' => $c->job_title, 'email' => $c->email, 'phone' => $c->phone, 'is_main' => (bool) $c->is_main, 'notes' => $c->notes,
                'roles' => array_values(array_map(fn ($k) => ['key' => $k, 'name' => $roles[$k] ?? $k], json_decode((string) $c->roles, true) ?: []))])->all();
    }

    /** @param array<string, mixed> $d name, job_title, email, phone, roles (keys), is_main, notes */
    public function add(string $type, int $id, array $d, User $by): int
    {
        $values = $this->values($d);
        $first = ! DB::table('project_contacts')->where('owner_type', $type)->where('owner_id', $id)->whereNull('deleted_at')->exists();
        $cid = DB::transaction(function () use ($type, $id, $values, $d, $by, $first) {
            $main = $first || ! empty($d['is_main']);
            if ($main) {
                DB::table('project_contacts')->where('owner_type', $type)->where('owner_id', $id)->update(['is_main' => 0]);
            }

            return DB::table('project_contacts')->insertGetId($values + ['owner_type' => $type, 'owner_id' => $id, 'is_main' => $main ? 1 : 0, 'created_by' => $by->id, 'created_at' => now(), 'updated_at' => now()]);
        });
        ProjectLog::record(null, $by, 'contact.added', 'contact', $cid, null, ['name' => $values['name'], 'of' => $type]);

        return $cid;
    }

    /** @param array<string, mixed> $d */
    public function change(object $contact, array $d, User $by): void
    {
        $old = (array) $contact;
        $values = $this->values($d + ['name' => $contact->name, 'job_title' => $contact->job_title, 'email' => $contact->email, 'phone' => $contact->phone, 'notes' => $contact->notes, 'roles' => json_decode((string) $contact->roles, true) ?: []]);
        DB::transaction(function () use ($contact, $values, $d) {
            if (! empty($d['is_main']) && ! $contact->is_main) {
                DB::table('project_contacts')->where('owner_type', $contact->owner_type)->where('owner_id', $contact->owner_id)->update(['is_main' => 0]);
                $values['is_main'] = 1;
            }
            DB::table('project_contacts')->where('id', $contact->id)->update($values + ['updated_at' => now()]);
        });
        $changed = array_filter($values, fn ($v, $k) => (string) ($old[$k] ?? '') !== (string) ($v ?? ''), ARRAY_FILTER_USE_BOTH);
        if ($changed) {
            ProjectLog::record(null, $by, 'contact.changed', 'contact', (int) $contact->id, array_intersect_key($old, $changed), $changed);
        }
    }

    public function remove(object $contact, User $by): void
    {
        DB::transaction(function () use ($contact) {
            DB::table('project_contacts')->where('id', $contact->id)->update(['deleted_at' => now(), 'is_main' => 0]);
            DB::table('project_contact_links')->where('contact_id', $contact->id)->delete();
            DB::table('project_party_links')->where('contact_id', $contact->id)->update(['contact_id' => null]);
            if ($contact->is_main) {   // someone else becomes the main contact, so there is always one while there is anyone
                $next = DB::table('project_contacts')->where('owner_type', $contact->owner_type)->where('owner_id', $contact->owner_id)->whereNull('deleted_at')->orderBy('name')->value('id');
                DB::table('project_contacts')->where('id', $next)->update(['is_main' => 1]);
            }
        });
        ProjectLog::record(null, $by, 'contact.removed', 'contact', (int) $contact->id, ['name' => $contact->name], null);
    }

    /** The contact, for someone who may see (or change) what it belongs to. */
    public function find(int $id, User $user, bool $toChange): object
    {
        $c = ProjectsSetup::relationships() ? DB::table('project_contacts')->where('id', $id)->whereNull('deleted_at')->first() : null;
        if (! $c) {
            throw new ProjectException('Not found.', 404);
        }
        $this->authorize($c->owner_type, (int) $c->owner_id, $user, $toChange);

        return $c;
    }

    /** @param array<string, mixed> $d @return array<string, mixed> */
    private function values(array $d): array
    {
        $line = fn (string $k, int $max) => ($v = trim(preg_replace('/\s+/', ' ', (string) ($d[$k] ?? '')))) === '' ? null : mb_substr($v, 0, $max);
        $name = $line('name', 120);
        if ($name === null) {
            throw new ProjectException('Give the contact a name.');
        }
        $email = $line('email', 160);
        if ($email !== null && ! filter_var($email, FILTER_VALIDATE_EMAIL)) {
            throw new ProjectException('That is not an email address.');
        }
        $roles = array_values(array_unique(array_map('strval', (array) ($d['roles'] ?? []))));
        $known = DB::table('project_lists')->where('list', 'contact_role')->whereIn('key', $roles)->pluck('key')->all();
        if (array_diff($roles, $known)) {
            throw new ProjectException('Choose what they are there for from the list.');
        }

        return ['name' => $name, 'job_title' => $line('job_title', 120), 'email' => $email === null ? null : mb_strtolower($email), 'phone' => ProjectDuplicates::phone($d['phone'] ?? null),
            'roles' => json_encode($roles), 'notes' => $line('notes', 300)];
    }
}
