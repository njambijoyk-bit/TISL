<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\Books\Engine\Scope;
use App\Services\Books\VisualsService;
use App\Services\Licensing\LicenseManager;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Books → Visual reports (the Extras module). `status` says which of the page's three states applies and is open to anyone who can see the books, because the page must
 * be able to invite an unlicensed business to license Extras; `data` carries the real figures and is behind the module's middleware, so the server refuses it unless
 * Extras is licensed and switched on.
 */
class VisualsController extends Controller
{
    public const MODULE = 'extras';

    public function status(LicenseManager $licence): JsonResponse
    {
        $licensed = $licence->isLicensed(self::MODULE);

        return response()->json(['state' => ! $licensed ? 'not_licensed' : ($licence->isActive(self::MODULE) ? 'active' : 'off')]);
    }

    /** The cards the page draws, and the financial years for its period presets. */
    public function catalog(VisualsService $visuals): JsonResponse
    {
        return response()->json(['charts' => $visuals->catalog(), 'years' => $visuals->years()]);
    }

    /** One chart for the period asked for (from, to), and for a second period (compare_from, compare_to) when the page is comparing. */
    public function chart(Request $request, VisualsService $visuals, string $key): JsonResponse
    {
        $in = $request->validate(['from' => 'nullable|date_format:Y-m-d', 'to' => 'nullable|date_format:Y-m-d|after_or_equal:from', 'compare_from' => 'nullable|date_format:Y-m-d|required_with:compare_to',
            'compare_to' => 'nullable|date_format:Y-m-d|required_with:compare_from|after_or_equal:compare_from', 'cost_centre_id' => 'nullable|integer', 'location_id' => 'nullable|integer']);
        $compare = ! empty($in['compare_from']) ? ['from' => $in['compare_from'], 'to' => $in['compare_to']] : null;

        return response()->json($visuals->chart($key, Scope::fromInput($request->only(['from', 'to', 'cost_centre_id', 'location_id'])), $compare));
    }

    /** The signed-in person's favourite charts, in order (at most nine). `ready` is false until database script 238 has been run; the page then keeps them in the browser. */
    public function favourites(Request $request): JsonResponse
    {
        if (! Schema::hasTable('visual_favourites')) {
            return response()->json(['ready' => false, 'keys' => []]);
        }

        return response()->json(['ready' => true, 'keys' => DB::table('visual_favourites')->where('user_id', $request->user()->id)->orderBy('position')->pluck('chart_key')->all()]);
    }

    /** Replace the person's favourites with this ordered list. Only charts that exist are kept, each once. */
    public function saveFavourites(Request $request): JsonResponse
    {
        abort_unless(Schema::hasTable('visual_favourites'), 409, 'Run database script 238_visual_favourites.sql first.');
        $keys = $request->validate(['keys' => 'present|array|max:9', 'keys.*' => 'string|max:60'])['keys'];
        $keys = array_slice(array_values(array_unique(array_filter($keys, fn ($k) => isset(VisualsService::CATALOG[$k])))), 0, 9);
        $now = now();
        DB::transaction(function () use ($request, $keys, $now) {
            DB::table('visual_favourites')->where('user_id', $request->user()->id)->delete();
            foreach ($keys as $i => $k) {
                DB::table('visual_favourites')->insert(['user_id' => $request->user()->id, 'chart_key' => $k, 'position' => $i + 1, 'created_at' => $now, 'updated_at' => $now]);
            }
        });

        return response()->json(['ready' => true, 'keys' => $keys]);
    }
}
