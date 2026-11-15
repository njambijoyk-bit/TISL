<?php

namespace App\Http\Controllers\Api\Projects;

use App\Http\Controllers\Controller;
use App\Services\Projects\ProjectException;
use App\Services\Projects\ProjectLog;
use App\Services\Projects\ProjectNames;
use App\Services\Projects\ProjectSettings;
use App\Services\Projects\ProjectsSetup;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Projects configuration: the default industry, what things are called, and each person's own naming. The routes name the permission each
 * action needs; the few that need a second one (changing the default industry) check it here and write the refusal to the log.
 */
class ConfigurationController extends Controller
{
    /** Asked for when needed, never kept (see ProjectService): a controller can outlive the request that made it. */
    private function settings(): ProjectSettings
    {
        return app(ProjectSettings::class);
    }

    private function naming(): ProjectNames
    {
        return app(ProjectNames::class);
    }

    /** The words this person sees. Every Projects screen loads this once. */
    public function names(Request $request): JsonResponse
    {
        $industry = $this->naming()->industryFor($request->user());

        return response()->json(['ready' => ProjectsSetup::ready(), 'industry' => $industry, 'company_industry' => $this->settings()->defaultIndustry(),
            'names' => array_map(fn ($n) => ['name' => $n['name'], 'plural' => $n['plural']], $this->naming()->names($industry))]);
    }

    /** Everything the configuration page shows. `industry` picks whose names are listed (default: the company's). */
    public function show(Request $request): JsonResponse
    {
        $user = $request->user();
        $industries = $this->naming()->industries();
        $viewing = (string) $request->query('industry', $this->settings()->defaultIndustry());
        if (! in_array($viewing, array_column($industries, 'key'), true)) {
            $viewing = $this->settings()->defaultIndustry();
        }
        $names = $this->naming()->names($viewing);
        $mayPersonal = $user->hasPermission('projects.naming.personal');

        return response()->json([
            'ready' => ProjectsSetup::ready(),
            'general' => $this->settings()->get('general'),
            'version' => $this->settings()->version('general'),
            'industries' => $industries,
            'viewing' => $viewing,
            'terms' => array_map(fn ($t) => $t + ($names[$t['key']] ?? ['name' => '', 'plural' => '', 'shipped_name' => '', 'shipped_plural' => '', 'changed' => false]), $this->naming()->terms()),
            // the box is not sent at all to someone who may not choose their own names, so the screen has nothing to show or hide
            'personal' => $mayPersonal ? ['industry' => $this->naming()->personalChoice($user), 'in_use' => $this->naming()->industryFor($user)] : null,
            'can' => [
                'manage' => $user->hasPermission('projects.config.manage'),
                'industry' => $user->hasPermission('projects.config.manage') && $user->hasPermission('projects.config.industry'),
                'names' => $user->hasPermission('projects.config.names'),
            ],
        ]);
    }

    public function saveGeneral(Request $request): JsonResponse
    {
        $data = $request->validate(['default_industry' => 'sometimes|string|max:40', 'project_may_use_other_industry' => 'sometimes|boolean', 'trash_days' => 'sometimes|integer']);

        return $this->guard(function () use ($request, $data) {
            if (isset($data['default_industry']) && $data['default_industry'] !== $this->settings()->defaultIndustry()) {
                $this->needIndustryPermission($request);
            }

            return response()->json($this->settings()->save('general', $data, $request->user()));
        });
    }

    public function setIndustry(Request $request, string $industry): JsonResponse
    {
        $data = $request->validate(['is_active' => 'required|boolean']);

        return $this->guard(function () use ($request, $industry, $data) {
            $this->naming()->setIndustryActive($industry, (bool) $data['is_active'], $request->user());

            return response()->json(['industries' => $this->naming()->industries()]);
        });
    }

    public function rename(Request $request, string $industry, string $term): JsonResponse
    {
        $data = $request->validate(['name' => 'required|string|max:80', 'plural' => 'required|string|max:80']);

        return $this->guard(function () use ($request, $industry, $term, $data) {
            $this->naming()->rename($industry, $term, $data['name'], $data['plural'], $request->user());

            return response()->json(['term' => ['key' => $term] + $this->naming()->names($industry)[$term]]);
        });
    }

    public function resetName(Request $request, string $industry, string $term): JsonResponse
    {
        return $this->guard(function () use ($request, $industry, $term) {
            $this->naming()->reset($industry, $term, $request->user());

            return response()->json(['term' => ['key' => $term] + $this->naming()->names($industry)[$term]]);
        });
    }

    public function history(): JsonResponse
    {
        return response()->json(['versions' => $this->settings()->versions('general')]);
    }

    public function rollback(Request $request): JsonResponse
    {
        $data = $request->validate(['version' => 'required|integer|min:1']);

        return $this->guard(function () use ($request, $data) {
            $old = $this->settings()->versionValue('general', (int) $data['version']);
            if ($old !== null && $old['default_industry'] !== $this->settings()->defaultIndustry()) {
                $this->needIndustryPermission($request);
            }

            return response()->json($this->settings()->rollback('general', (int) $data['version'], $request->user()));
        });
    }

    /** A person's own naming. `industry` null = go back to the company's. */
    public function myNaming(Request $request): JsonResponse
    {
        $data = $request->validate(['industry' => 'present|nullable|string|max:40']);

        return $this->guard(function () use ($request, $data) {
            $this->naming()->setPersonal($request->user(), $data['industry']);

            return $this->names($request);
        });
    }

    private function needIndustryPermission(Request $request): void
    {
        if (! $request->user()->hasPermission('projects.config.industry')) {
            ProjectLog::refused(null, $request->user(), 'settings.default_industry', 'Does not hold projects.config.industry', 'settings');
            throw new ProjectException('You may not change the default industry.', 403);
        }
    }

    private function guard(callable $do): JsonResponse
    {
        try {
            return $do();
        } catch (ProjectException $e) {
            return response()->json(['message' => $e->getMessage()], $e->status);
        }
    }
}
