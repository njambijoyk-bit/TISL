<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\Books\Engine\ReportEngine;
use App\Services\Books\ExportService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * The reports that run on the engine. The route only asks that the person is staff: each report names its own permission (books.view, stock.view...)
 * and the engine checks it, so a person who may run a report can reach it whichever hub they came from.
 */
class ReportEngineController extends Controller
{
    public function __construct(private ReportEngine $engine, private ExportService $export) {}

    /** The reports this person may run. */
    public function index(Request $request): JsonResponse
    {
        return response()->json(['reports' => $this->engine->catalogue($request->user())]);
    }

    /** Run a report; with `format` (json, csv, xml, html, pdf) it comes back as a file instead. */
    public function show(Request $request, string $key)
    {
        $input = $request->validate([
            'from' => 'nullable|date_format:Y-m-d', 'to' => 'nullable|date_format:Y-m-d', 'compare' => 'nullable|in:none,previous_period,previous_year',
            'cost_centre_id' => 'nullable|integer|min:1', 'location_id' => 'nullable|integer|min:1', 'format' => 'nullable|in:' . implode(',', ExportService::FORMATS),
        ]) + $request->except(['format']);

        if (! empty($input['format'])) {
            [$table, $name] = $this->engine->exportTable($key, $input, $request->user());

            return $this->export->table($table, $input['format'], $name);
        }

        return response()->json($this->engine->run($key, $input, $request->user()));
    }
}
