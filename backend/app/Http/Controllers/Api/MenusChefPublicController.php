<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\Menus\ChefService;
use Illuminate\Http\JsonResponse;

/** The chefs a guest may see (the public chefs page). */
class MenusChefPublicController extends Controller
{
    public function index(ChefService $chefs): JsonResponse
    {
        return response()->json(['chefs' => $chefs->publicList()]);
    }
}
