<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\LegalEntity;
use App\Services\Entity\CurrentEntity;
use Illuminate\Http\JsonResponse;

/** The companies the person may open, for the company switcher (hidden while there is one). */
class EntityController extends Controller
{
    public function index(CurrentEntity $current): JsonResponse
    {
        // staff may use every active entity for now; access by entity comes with the staff-access step
        $rows = LegalEntity::ready() ? LegalEntity::active()->orderBy('sort_order')->orderBy('id')->get(['id', 'name', 'short_code', 'legal_name', 'country', 'base_currency_id', 'is_default']) : collect();

        return response()->json(['data' => $rows, 'current_id' => $current->id(), 'multi' => $rows->count() > 1]);
    }
}
