<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\Books\Engine\ReportEngine;
use App\Services\Books\ExportService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

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

    /** The signed-in person's favourite reports, in order (at most nine). `ready` is false until database script 236 has been run; the screen then keeps them in the browser. */
    public function favourites(Request $request): JsonResponse
    {
        if (! Schema::hasTable('report_favourites')) {
            return response()->json(['ready' => false, 'keys' => []]);
        }

        return response()->json(['ready' => true, 'keys' => DB::table('report_favourites')->where('user_id', $request->user()->id)->orderBy('position')->pluck('report_key')->all()]);
    }

    /** Replace the person's favourites with this ordered list. Only reports this person may run are kept; a report is listed once. */
    public function saveFavourites(Request $request): JsonResponse
    {
        abort_unless(Schema::hasTable('report_favourites'), 409, 'Run database script 236_report_favourites.sql first.');
        $keys = $request->validate(['keys' => 'present|array|max:9', 'keys.*' => 'string|max:60'])['keys'];
        $allowed = array_column($this->engine->catalogue($request->user()), 'key');
        $keys = array_slice(array_values(array_unique(array_filter($keys, fn ($k) => in_array($k, $allowed, true)))), 0, 9);
        $now = now();
        DB::transaction(function () use ($request, $keys, $now) {
            DB::table('report_favourites')->where('user_id', $request->user()->id)->delete();
            foreach ($keys as $i => $k) {
                DB::table('report_favourites')->insert(['user_id' => $request->user()->id, 'report_key' => $k, 'position' => $i + 1, 'created_at' => $now, 'updated_at' => $now]);
            }
        });

        return response()->json(['ready' => true, 'keys' => $keys]);
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
