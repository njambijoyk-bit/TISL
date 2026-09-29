<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\CompanyProfile;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** Who the business is — read by the storefront and documents, edited by a super admin. */
class CompanyProfileController extends Controller
{
    public function show(): JsonResponse
    {
        $c = CompanyProfile::current();

        return response()->json($c->only(['name', 'short_code', 'legal_name', 'tax_pin', 'email', 'phone', 'address', 'city', 'country', 'website', 'tagline', 'logo_url']));
    }

    public function update(Request $request): JsonResponse
    {
        $d = $request->validate([
            'name' => 'required|string|max:160', 'short_code' => 'required|string|max:12|regex:/^[A-Za-z0-9-]+$/',
            'legal_name' => 'nullable|string|max:200', 'tax_pin' => 'nullable|string|max:40', 'email' => 'nullable|email|max:160',
            'phone' => 'nullable|string|max:40', 'address' => 'nullable|string|max:255', 'city' => 'nullable|string|max:80',
            'country' => 'nullable|string|max:80', 'website' => 'nullable|string|max:160', 'tagline' => 'nullable|string|max:200', 'logo_url' => 'nullable|string|max:255',
        ]);
        $c = CompanyProfile::first() ?? new CompanyProfile(['id' => 1]);
        $c->id = 1;
        $c->fill($d + ['updated_by' => $request->user()->id])->save();

        return response()->json(['message' => 'Company details saved', 'data' => $c]);
    }
}
