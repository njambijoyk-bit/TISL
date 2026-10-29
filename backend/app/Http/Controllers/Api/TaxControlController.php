<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\Books\TaxControlDefinitions;
use App\Services\Books\TaxControlSettings;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Books → Configuration → Tax control. Seeing the tab needs books.tax.view (the route); changing a section needs books.tax.control, or books.tax.admin for the
 * sections that may be handed to a tax administrator, which TaxControlSettings checks because it depends on the section.
 */
class TaxControlController extends Controller
{
    public function __construct(private TaxControlSettings $settings) {}

    public function show(Request $request): JsonResponse
    {
        if (! TaxControlSettings::ready()) {
            return response()->json(['ready' => false, 'message' => 'Run database script 229_tax_control.sql to turn on Tax control.', 'sections' => [], 'lookups' => null]);
        }

        return response()->json(['ready' => true, 'sections' => $this->settings->sectionsFor($request->user()), 'lookups' => $this->settings->lookups()]);
    }

    /** Body: {values: {key: value, ...}} for the settings of this section that should change. */
    public function update(Request $request, string $section): JsonResponse
    {
        abort_unless(isset(TaxControlDefinitions::sections()[$section]), 404, 'There is no such section.');
        $request->validate(['values' => 'required|array']);
        $changed = $this->settings->save($section, $request->input('values'), $request->user());

        return response()->json(['message' => $changed ? 'Saved' : 'Nothing had changed', 'changed' => $changed, 'sections' => $this->settings->sectionsFor($request->user())]);
    }

    public function log(Request $request): JsonResponse
    {
        $key = $request->query('key');
        abort_if($key !== null && ! TaxControlDefinitions::has((string) $key), 404, 'There is no such setting.');

        return response()->json(['rows' => $this->settings->log((int) $request->query('limit', 100), $key ? (string) $key : null)]);
    }
}
