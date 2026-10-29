<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\Books\Engine\Scope;
use App\Services\Books\VisualsService;
use App\Services\Licensing\LicenseManager;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

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

    public function data(Request $request, VisualsService $visuals): JsonResponse
    {
        return response()->json($visuals->data(Scope::fromInput($request->only(['from', 'to', 'cost_centre_id', 'location_id']))));
    }
}
