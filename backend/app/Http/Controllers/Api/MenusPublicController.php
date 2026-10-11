<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\Location\LocationContext;
use App\Services\Menus\PublicMenu;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Carbon;

/** The menu a customer reads. Open to everyone; nothing here can be changed. */
class MenusPublicController extends Controller
{
    public function index(PublicMenu $menu, LocationContext $context): JsonResponse
    {
        return response()->json($menu->build(Carbon::now((string) config('app.timezone', 'Africa/Nairobi')), $context->id()));
    }
}
