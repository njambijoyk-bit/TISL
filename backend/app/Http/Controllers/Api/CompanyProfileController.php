<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\CompanyProfile;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

/** Who the business is — read by the storefront and documents, edited by a super admin. */
class CompanyProfileController extends Controller
{
    public function show(): JsonResponse
    {
        $c = CompanyProfile::current();

        return response()->json($c->only(['name', 'short_code', 'legal_name', 'tax_pin', 'email', 'phone', 'address', 'city', 'country', 'website', 'tagline', 'logo_url'])
            + ['emails' => $c->emailList(), 'phones' => $c->phoneList(),
                // where to load the logo from: served through the API, so it does not depend on /storage being reachable from the browser
                'logo_view' => $c->logo_url ? url('/api/company/logo') . '?v=' . substr(md5((string) $c->logo_url), 0, 8) : null]);
    }

    /** The logo file itself, public like the rest of the company profile. */
    public function logo()
    {
        $url = CompanyProfile::current()->logo_url;
        $path = $url ? ltrim((string) preg_replace('#^/?storage/#', '', $url), '/') : null;
        abort_unless($path && str_starts_with($path, 'company/') && Storage::disk('public')->exists($path), 404);

        return Storage::disk('public')->response($path, null, ['Cache-Control' => 'public, max-age=3600']);
    }

    public function update(Request $request): JsonResponse
    {
        $d = $request->validate([
            'name' => 'required|string|max:160', 'short_code' => 'required|string|max:12|regex:/^[A-Za-z0-9-]+$/',
            'legal_name' => 'nullable|string|max:200', 'tax_pin' => 'nullable|string|max:40', 'email' => 'nullable|email|max:160',
            'phone' => 'nullable|string|max:40', 'address' => 'nullable|string|max:255', 'city' => 'nullable|string|max:80',
            'country' => 'nullable|string|max:80', 'website' => 'nullable|string|max:160', 'tagline' => 'nullable|string|max:200', 'logo_url' => 'nullable|string|max:255',
            'emails' => 'nullable|array|max:10', 'emails.*.value' => 'nullable|email|max:160', 'emails.*.label' => 'nullable|string|max:40', 'emails.*.is_default' => 'nullable|boolean',
            'phones' => 'nullable|array|max:10', 'phones.*.value' => 'nullable|string|max:40', 'phones.*.label' => 'nullable|string|max:40', 'phones.*.is_default' => 'nullable|boolean',
        ]);
        // the lists carry the default; the single email / phone columns always mirror it
        $hasLists = \Illuminate\Support\Facades\Schema::hasColumn('company_profile', 'emails') && \Illuminate\Support\Facades\Schema::hasColumn('company_profile', 'phones');
        if (array_key_exists('emails', $d) || array_key_exists('phones', $d)) {
            $emails = CompanyProfile::cleanContacts($d['emails'] ?? []);
            $phones = CompanyProfile::cleanContacts($d['phones'] ?? []);
            $d['email'] = collect($emails)->firstWhere('is_default', true)['value'] ?? null;
            $d['phone'] = collect($phones)->firstWhere('is_default', true)['value'] ?? null;
            $d['emails'] = $emails ?: null;
            $d['phones'] = $phones ?: null;
        }
        if (! $hasLists) {
            unset($d['emails'], $d['phones']);   // script 43 has not been run yet: only the default of each is saved
        }
        $c = CompanyProfile::first() ?? new CompanyProfile(['id' => 1]);
        $c->id = 1;
        $c->fill($d + ['updated_by' => $request->user()->id])->save();

        return response()->json(['message' => 'Company details saved', 'data' => $c]);
    }

    /** Set the company logo: a PNG, JPG, WebP or GIF up to 2 MB, kept on the public disk and printed on statements, letters and documents. */
    public function uploadLogo(Request $request): JsonResponse
    {
        $request->validate(['logo' => 'required|file|mimes:png,jpg,jpeg,webp,gif|max:2048']);
        $c = CompanyProfile::first() ?? new CompanyProfile(['id' => 1]);
        $c->id = 1;
        $this->forget($c->logo_url);
        $c->fill(['logo_url' => Storage::url($request->file('logo')->store('company', 'public')), 'updated_by' => $request->user()->id])->save();

        return response()->json(['message' => 'Logo saved', 'logo_url' => $c->logo_url, 'logo_view' => url('/api/company/logo') . '?v=' . substr(md5((string) $c->logo_url), 0, 8)]);
    }

    public function removeLogo(Request $request): JsonResponse
    {
        $c = CompanyProfile::first();
        if ($c) {
            $this->forget($c->logo_url);
            $c->fill(['logo_url' => null, 'updated_by' => $request->user()->id])->save();
        }

        return response()->json(['message' => 'Logo removed', 'logo_url' => null]);
    }

    /** Delete the file behind an earlier logo, if it is one of ours (an external URL is left alone). */
    private function forget(?string $url): void
    {
        $path = $url ? ltrim((string) preg_replace('#^/?storage/#', '', $url), '/') : null;
        if ($path && str_starts_with($path, 'company/') && Storage::disk('public')->exists($path)) {
            Storage::disk('public')->delete($path);
        }
    }
}
