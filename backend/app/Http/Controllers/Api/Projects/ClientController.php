<?php

namespace App\Http\Controllers\Api\Projects;

use App\Http\Controllers\Controller;
use App\Services\Projects\ProjectClients;
use App\Services\Projects\ProjectException;
use App\Services\Projects\ProjectLog;
use App\Services\Projects\ProjectSettings;
use App\Services\Projects\ProjectsSetup;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\StreamedResponse;

/** Clients (stage 3, build 3.5): the list, one client's page, account manager, flags, health rules and the export. */
class ClientController extends Controller
{
    public function __construct(private ProjectClients $clients) {}

    public function index(Request $request): JsonResponse
    {
        $user = $request->user();

        return response()->json($this->clients->list($user, $request->only(['scope', 'health', 'flagged', 'q', 'page', 'per_page'])) + ['ready' => ProjectsSetup::relationships(),
            'can' => ['export' => $user->hasPermission('projects.clients.export'), 'health' => $user->hasPermission('projects.health.view'), 'money' => ProjectClients::maySeeMoney($user)]]);
    }

    public function show(Request $request, int $client): JsonResponse
    {
        return $this->guard(fn () => $this->one($request, $client));
    }

    public function update(Request $request, int $client): JsonResponse
    {
        return $this->guard(function () use ($request, $client) {
            $this->clients->setManager($this->clients->find($client, $request->user()), $request->input('manager_id'), $request->user());

            return $this->one($request, $client);
        });
    }

    public function addFlag(Request $request, int $client): JsonResponse
    {
        return $this->guard(function () use ($request, $client) {
            $this->clients->addFlag($this->clients->find($client, $request->user()), $request->input('flag_id'), $request->input('reason'), $request->user());

            return $this->one($request, $client, 201);
        });
    }

    public function removeFlag(Request $request, int $client, int $flag): JsonResponse
    {
        return $this->guard(function () use ($request, $client, $flag) {
            $this->clients->removeFlag($this->clients->find($client, $request->user()), $flag, $request->input('note'), $request->user());

            return $this->one($request, $client);
        });
    }

    /** The list as filtered, as a spreadsheet file. Logged. */
    public function export(Request $request): StreamedResponse
    {
        $user = $request->user();
        $f = $request->only(['scope', 'health', 'flagged', 'q']);
        $rows = $this->clients->exportRows($user, $f);
        ProjectLog::record(null, $user, 'clients.exported', 'clients', null, null, ['rows' => count($rows), 'filters' => array_filter($f)]);
        $money = ProjectClients::maySeeMoney($user);
        $health = $user->hasPermission('projects.health.view');

        return response()->streamDownload(function () use ($rows, $money, $health) {
            $out = fopen('php://output', 'w');
            fputcsv($out, array_merge(['Client', 'Number', 'Email', 'Account manager', 'Client since', 'Came from', 'Open work', 'Last contact', 'Next action', 'Next action due', 'Flags'],
                $money ? ['Owes', 'Overdue', 'Currency'] : [], $health ? ['Health', 'Why'] : []));
            foreach ($rows as $r) {
                fputcsv($out, array_merge([$r['name'], $r['number'], $r['email'], $r['manager']['name'] ?? '', $r['since'], $r['source'], $r['open_work'], $r['last_contact'] ? substr($r['last_contact'], 0, 10) : '',
                    $r['next']['what'] ?? '', $r['next']['due_on'] ?? '', implode('; ', array_column($r['flags'], 'name'))],
                    $money ? [$r['money']['owed'] ?? '', $r['money']['overdue'] ?? '', $r['money']['currency'] ?? ''] : [], $health ? [$r['health']['colour'] ?? '', implode('; ', $r['health']['reasons'] ?? [])] : []));
            }
            fclose($out);
        }, 'clients-' . now()->format('Y-m-d') . '.csv', ['Content-Type' => 'text/csv']);
    }

    // ------------------------------------------------------------------ the health rules, in Configuration

    public function health(Request $request): JsonResponse
    {
        return response()->json(['health' => app(ProjectSettings::class)->get('health'), 'can' => ['change' => $request->user()->hasPermission('projects.config.manage')]]);
    }

    public function saveHealth(Request $request): JsonResponse
    {
        return $this->guard(function () use ($request) {
            app(ProjectSettings::class)->save('health', $request->only(['contact_amber_days', 'contact_red_days', 'late_red_days', 'nothing_planned_amber', 'overdue_amber_days', 'overdue_red_days']), $request->user());

            return $this->health($request);
        });
    }

    private function one(Request $request, int $id, int $status = 200): JsonResponse
    {
        $user = $request->user();

        return response()->json(['client' => $this->clients->show($this->clients->find($id, $user), $user),
            'managers' => $user->hasPermission('projects.clients.manage') ? app(\App\Services\Notify\Staff::class)->holding('projects.use')->map(fn ($u) => ['id' => (int) $u->id, 'name' => $u->name])->sortBy('name')->values()->all() : [],
            'flag_choices' => $user->hasPermission('projects.flags') ? app(\App\Services\Projects\ProjectLists::class)->of('flag', true) : []], $status);
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
