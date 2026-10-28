<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\Access\Authorizer;
use App\Services\Books\ReportSettingDefinitions;
use App\Services\Books\ReportSettings;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Books → Configuration → Reports. Seeing the tab needs books.reports.settings (the route); changing a section needs that section's own permission,
 * which is checked here because it depends on the section.
 */
class ReportSettingsController extends Controller
{
    public function __construct(private ReportSettings $settings) {}

    public function show(Request $request): JsonResponse
    {
        if (! ReportSettings::ready()) {
            return response()->json(['ready' => false, 'message' => 'Run database script 228_report_settings.sql to turn on the Reports settings.', 'sections' => [], 'lookups' => null, 'reconcilable_ledgers' => []]);
        }

        return response()->json([
            'ready' => true,
            'sections' => $this->settings->sectionsFor($request->user()),
            'lookups' => $this->settings->lookups(),
            'reconcilable_ledgers' => $this->settings->reconcilableLedgers(),
        ]);
    }

    /** Body: {values: {key: value, ...}} for the settings of this section that should change. */
    public function update(Request $request, string $section): JsonResponse
    {
        $sections = ReportSettingDefinitions::sections();
        abort_unless(isset($sections[$section]), 404, 'There is no such section.');
        abort_unless(app(Authorizer::class)->allows($request->user(), $sections[$section]['permission']), 403, 'You do not have the permission to change these settings.');
        $request->validate(['values' => 'required|array']);

        $changed = $this->settings->save($section, $request->input('values'), $request->user());

        return response()->json([
            'message' => $changed ? 'Saved' : 'Nothing had changed',
            'changed' => $changed,
            'sections' => $this->settings->sectionsFor($request->user()),
            'reconcilable_ledgers' => $this->settings->reconcilableLedgers(),
        ]);
    }

    public function log(Request $request): JsonResponse
    {
        $key = $request->query('key');
        abort_if($key !== null && ! ReportSettingDefinitions::has((string) $key), 404, 'There is no such setting.');

        return response()->json(['rows' => $this->settings->log((int) $request->query('limit', 100), $key ? (string) $key : null)]);
    }
}
