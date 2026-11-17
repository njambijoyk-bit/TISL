<?php

namespace App\Http\Controllers\Api\Projects;

use App\Http\Controllers\Controller;
use App\Services\Projects\ProjectDuplicates;
use App\Services\Projects\ProjectException;
use App\Services\Projects\ProjectLeads;
use App\Services\Projects\ProjectLists;
use App\Services\Projects\ProjectsSetup;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/** Relationships (stage 3): leads, the lists an owner manages, and "do we already know them?". */
class RelationshipController extends Controller
{
    public function __construct(private ProjectLeads $leads, private ProjectLists $lists) {}

    // ------------------------------------------------------------------ leads

    public function leads(Request $request): JsonResponse
    {
        return response()->json($this->leads->list($request->user(), $request->only(['scope', 'status', 'q', 'page', 'per_page'])) + ['ready' => ProjectsSetup::relationships(),
            'can' => ['change' => $request->user()->hasPermission('projects.leads.manage')]]);
    }

    /** What the lead form offers. */
    public function leadOptions(Request $request): JsonResponse
    {
        return response()->json([
            'sources' => $this->lists->of('source', true), 'lost_reasons' => $this->lists->of('lost_reason', true), 'owners' => $this->leads->owners(),
            'industries' => DB::table('project_industries')->where('is_active', 1)->orderBy('sort_order')->get(['key', 'name'])->all(),
        ]);
    }

    public function lead(Request $request, int $lead): JsonResponse
    {
        return $this->guard(fn () => response()->json(['lead' => $this->leads->show($this->leads->find($lead, $request->user()), $request->user())]));
    }

    public function addLead(Request $request): JsonResponse
    {
        return $this->guard(function () use ($request) {
            $id = $this->leads->create($request->all(), $request->user());

            return response()->json(['lead' => $this->leads->show($this->leads->find($id, $request->user()), $request->user())], 201);
        });
    }

    public function changeLead(Request $request, int $lead): JsonResponse
    {
        return $this->guard(function () use ($request, $lead) {
            $l = $this->leads->find($lead, $request->user(), true);
            if ($request->has('status')) {
                $this->leads->setStatus($l, (string) $request->input('status'), $request->input('lost_reason_id'), $request->input('lost_note'), $request->user());
            } else {
                $this->leads->update($l, $request->all(), $request->user());
            }

            return response()->json(['lead' => $this->leads->show($this->leads->find($lead, $request->user()), $request->user())]);
        });
    }

    /** Before adding someone: who do we already know by that name, email or phone? */
    public function known(Request $request): JsonResponse
    {
        $data = $request->validate(['name' => 'nullable|string|max:160', 'email' => 'nullable|string|max:160', 'phone' => 'nullable|string|max:40', 'except_type' => 'nullable|string|max:10', 'except_id' => 'nullable|integer']);

        return response()->json(['known' => app(ProjectDuplicates::class)->find($data, isset($data['except_type'], $data['except_id']) ? [$data['except_type'], (int) $data['except_id']] : null)]);
    }

    // ------------------------------------------------------------------ contacts

    public function contacts(Request $request, string $type, int $id): JsonResponse
    {
        return $this->guard(function () use ($request, $type, $id) {
            $c = app(\App\Services\Projects\ProjectContacts::class);
            $c->authorize($type, $id, $request->user(), false);

            return $this->contactList($request, $type, $id);
        });
    }

    public function addContact(Request $request, string $type, int $id): JsonResponse
    {
        return $this->guard(function () use ($request, $type, $id) {
            $c = app(\App\Services\Projects\ProjectContacts::class);
            $c->authorize($type, $id, $request->user(), true);
            $c->add($type, $id, $request->all(), $request->user());

            return $this->contactList($request, $type, $id, 201);
        });
    }

    public function changeContact(Request $request, int $contact): JsonResponse
    {
        return $this->guard(function () use ($request, $contact) {
            $c = app(\App\Services\Projects\ProjectContacts::class);
            $row = $c->find($contact, $request->user(), true);
            $request->isMethod('DELETE') ? $c->remove($row, $request->user()) : $c->change($row, $request->all(), $request->user());

            return $this->contactList($request, $row->owner_type, (int) $row->owner_id);
        });
    }

    private function contactList(Request $request, string $type, int $id, int $status = 200): JsonResponse
    {
        $user = $request->user();
        $may = match ($type) { 'customer' => $user->hasPermission('projects.clients.manage'), 'lead' => $user->hasPermission('projects.leads.manage'), default => $user->hasPermission('projects.parties') };

        return response()->json(['contacts' => app(\App\Services\Projects\ProjectContacts::class)->of($type, $id), 'roles' => $this->lists->of('contact_role', true), 'can' => ['change' => $may]], $status);
    }

    // ------------------------------------------------------------------ other parties

    public function findParties(Request $request): JsonResponse
    {
        return response()->json(['parties' => app(\App\Services\Projects\ProjectParties::class)->search((string) $request->query('q', ''))]);
    }

    public function parties(Request $request, int $project): JsonResponse
    {
        return $this->guard(fn () => response()->json(app(\App\Services\Projects\ProjectParties::class)->forProject(app(\App\Services\Projects\ProjectService::class)->findFor($request->user(), $project), $request->user())));
    }

    public function removeParty(Request $request, int $project, int $link): JsonResponse
    {
        return $this->changeParties($request, $project, 'parties', $link);
    }

    public function addPartyContact(Request $request, int $project): JsonResponse
    {
        return $this->changeParties($request, $project, 'contacts');
    }

    public function removePartyContact(Request $request, int $project, int $link): JsonResponse
    {
        return $this->changeParties($request, $project, 'contacts', $link);
    }

    /** Put a party, or one of the client's contacts, on a project; or take one off. */
    public function changeParties(Request $request, int $project, ?string $what = null, ?int $link = null): JsonResponse
    {
        return $this->guard(function () use ($request, $project, $what, $link) {
            $p = app(\App\Services\Projects\ProjectService::class)->findFor($request->user(), $project);
            $parties = app(\App\Services\Projects\ProjectParties::class);
            $user = $request->user();
            match (true) {
                $request->isMethod('DELETE') && $what === 'contacts' => $parties->removeContact($p, (int) $link, $user),
                $request->isMethod('DELETE') => $parties->remove($p, (int) $link, $user),
                $what === 'contacts' => $parties->addContact($p, (int) $request->input('contact_id'), $request->input('note'), $user),
                default => $parties->add($p, $request->all(), $user),
            };

            return response()->json($parties->forProject($p, $user), $request->isMethod('POST') ? 201 : 200);
        });
    }

    // ------------------------------------------------------------------ the lists an owner manages

    public function listsPage(Request $request): JsonResponse
    {
        return response()->json([
            'lists' => array_map(fn ($k) => ['key' => $k, 'name' => ProjectLists::LISTS[$k][0], 'hint' => ProjectLists::LISTS[$k][1]], array_keys(ProjectLists::LISTS)),
            'rows' => $this->lists->all(), 'ready' => ProjectsSetup::relationships(),
            'industries' => DB::table('project_industries')->orderBy('sort_order')->get(['key', 'name'])->all(),
            'can' => ['change' => $request->user()->hasPermission('projects.config.manage')],
        ]);
    }

    public function addToList(Request $request, string $list): JsonResponse
    {
        return $this->guard(function () use ($request, $list) {
            $this->lists->add($list, $request->only(['name', 'industry', 'status']), $request->user());

            return $this->listsPage($request)->setStatusCode(201);
        });
    }

    public function changeListRow(Request $request, string $list, int $row): JsonResponse
    {
        return $this->guard(function () use ($request, $list, $row) {
            $this->lists->change($list, $row, $request->only(['name', 'industry', 'status', 'is_active', 'move']), $request->user());

            return $this->listsPage($request);
        });
    }

    private function guard(callable $do): JsonResponse
    {
        try {
            return $do();
        } catch (ProjectException $e) {
            return response()->json(['message' => $e->getMessage()] + $e->extra, $e->status);
        }
    }
}
