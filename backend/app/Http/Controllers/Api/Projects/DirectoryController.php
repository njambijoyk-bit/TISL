<?php

namespace App\Http\Controllers\Api\Projects;

use App\Http\Controllers\Controller;
use App\Services\Projects\ProjectDirectory;
use App\Services\Projects\ProjectException;
use App\Services\Projects\ProjectLog;
use App\Services\Projects\ProjectSettings;
use App\Services\Projects\ProjectsSetup;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\StreamedResponse;

/** The directory (stage 3, build 3.6): yellow pages by trade, white pages by name, masked details, reveals, trades and visibility. */
class DirectoryController extends Controller
{
    public function __construct(private ProjectDirectory $directory) {}

    public function index(Request $request): JsonResponse
    {
        $user = $request->user();
        $book = $request->query('book') === 'white' ? 'white' : 'yellow';
        // each book has its own permission: someone with only one is shown that one
        if (! $user->hasPermission("projects.directory.{$book}")) {
            $book = $book === 'white' ? 'yellow' : 'white';
        }

        return response()->json($this->directory->page($user, ['book' => $book] + $request->only(['trade', 'q', 'page', 'per_page'])) + ['ready' => ProjectsSetup::relationships()]);
    }

    public function reveal(Request $request, string $type, int $id): JsonResponse
    {
        return $this->guard(fn () => response()->json($this->directory->reveal($type, $id, $request->user())));
    }

    public function update(Request $request, string $type, int $id): JsonResponse
    {
        return $this->guard(function () use ($request, $type, $id) {
            $this->directory->change($type, $id, $request->only(['trades', 'visibility']), $request->user());

            return response()->json(['message' => 'Saved.']);
        });
    }

    public function export(Request $request): StreamedResponse
    {
        $user = $request->user();
        $book = $request->query('book') === 'white' && $user->hasPermission('projects.directory.white') ? 'white' : 'yellow';
        $rows = $this->directory->exportRows($user, $book);
        ProjectLog::record(null, $user, 'directory.exported', 'directory', null, null, ['book' => $book, 'rows' => count($rows), 'details' => $user->hasPermission('projects.directory.contacts') ? 'in full' : 'masked']);

        return response()->streamDownload(function () use ($rows) {
            $out = fopen('php://output', 'w');
            fputcsv($out, ['Name', 'Is', 'Works for', 'Phone', 'Email', 'Trades', 'Who can see']);
            foreach ($rows as $r) {
                fputcsv($out, array_values($r));
            }
            fclose($out);
        }, 'directory-' . $book . '-' . now()->format('Y-m-d') . '.csv', ['Content-Type' => 'text/csv']);
    }

    public function settings(Request $request): JsonResponse
    {
        return response()->json(['directory' => app(ProjectSettings::class)->get('directory'), 'levels' => ProjectDirectory::LEVELS, 'can' => ['change' => $request->user()->hasPermission('projects.config.manage')]]);
    }

    public function saveSettings(Request $request): JsonResponse
    {
        return $this->guard(function () use ($request) {
            app(ProjectSettings::class)->save('directory', ['levels' => (array) $request->input('levels', [])], $request->user());

            return $this->settings($request);
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
