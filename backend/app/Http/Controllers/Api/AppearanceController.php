<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AppearanceFont;
use App\Models\Colouring;
use App\Models\ComponentLayout;
use App\Models\IconStyle;
use App\Models\UserAppearancePreference;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

class AppearanceController extends Controller
{
    // ── Public: fetch all active options + defaults ──────────────────────────

    public function options(): JsonResponse
    {
        $colourings = Colouring::active()
            ->orderBy('sort_order')
            ->get(['id', 'name', 'slug', 'description', 'light_tokens', 'dark_tokens', 'is_default']);

        $fonts = AppearanceFont::active()
            ->orderBy('sort_order')
            ->get(['id', 'family', 'google_slug', 'category', 'is_default_heading', 'is_default_body']);

        $iconStyles = IconStyle::active()
            ->orderBy('sort_order')
            ->get(['id', 'name', 'slug', 'description', 'is_default']);

        $componentLayouts = ComponentLayout::active()
            ->orderBy('component_type')
            ->orderBy('sort_order')
            ->get(['id', 'component_type', 'variant_key', 'label', 'thumbnail_url', 'is_default']);

        return response()->json([
            'colourings'        => $colourings,
            'fonts'             => $fonts,
            'icon_styles'       => $iconStyles,
            'component_layouts' => $componentLayouts,
        ]);
    }

    // ── Auth: get logged-in user's saved preferences ──────────────────────────

    public function getUserPreferences(): JsonResponse
    {
        $pref = UserAppearancePreference::with([
            'colouring',
            'headingFont',
            'bodyFont',
            'iconStyle',
        ])->where('user_id', Auth::id())->first();

        return response()->json(['preferences' => $pref]);
    }

    // ── Auth: save logged-in user's preferences ───────────────────────────────

    public function saveUserPreferences(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'colouring_id'    => 'nullable|integer|exists:colourings,id',
            'mode_override'   => 'in:system,light,dark',
            'heading_font_id' => 'nullable|integer|exists:appearance_fonts,id',
            'body_font_id'    => 'nullable|integer|exists:appearance_fonts,id',
            'icon_style_id'   => 'nullable|integer|exists:icon_styles,id',
        ]);

        $pref = UserAppearancePreference::updateOrCreate(
            ['user_id' => Auth::id()],
            $validated
        );

        return response()->json(['preferences' => $pref]);
    }

    // ── Admin: list all colourings (including inactive) ───────────────────────

    public function adminColourings(): JsonResponse
    {
        $colourings = Colouring::orderBy('sort_order')->get();
        return response()->json(['colourings' => $colourings]);
    }

    public function adminStoreColouring(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'name'         => 'required|string|max:80',
            'slug'         => 'required|string|max:80|unique:colourings,slug',
            'description'  => 'nullable|string|max:255',
            'light_tokens' => 'required|array',
            'dark_tokens'  => 'required|array',
            'sort_order'   => 'integer',
        ]);

        $colouring = Colouring::create($validated);
        return response()->json(['colouring' => $colouring], 201);
    }

    public function adminUpdateColouring(Request $request, int $id): JsonResponse
    {
        $colouring = Colouring::findOrFail($id);

        $validated = $request->validate([
            'name'         => 'string|max:80',
            'description'  => 'nullable|string|max:255',
            'light_tokens' => 'array',
            'dark_tokens'  => 'array',
            'is_active'    => 'boolean',
            'is_default'   => 'boolean',
            'sort_order'   => 'integer',
        ]);

        // Only one default allowed
        if (!empty($validated['is_default']) && $validated['is_default']) {
            Colouring::where('id', '!=', $id)->update(['is_default' => false]);
        }

        $colouring->update($validated);
        return response()->json(['colouring' => $colouring]);
    }

    // ── Admin: fonts ──────────────────────────────────────────────────────────

    public function adminFonts(): JsonResponse
    {
        $fonts = AppearanceFont::orderBy('sort_order')->get();
        return response()->json(['fonts' => $fonts]);
    }

    public function adminUpdateFont(Request $request, int $id): JsonResponse
    {
        $font = AppearanceFont::findOrFail($id);

        $validated = $request->validate([
            'is_active'          => 'boolean',
            'is_default_heading' => 'boolean',
            'is_default_body'    => 'boolean',
            'sort_order'         => 'integer',
        ]);

        if (!empty($validated['is_default_heading'])) {
            AppearanceFont::where('id', '!=', $id)->update(['is_default_heading' => false]);
        }
        if (!empty($validated['is_default_body'])) {
            AppearanceFont::where('id', '!=', $id)->update(['is_default_body' => false]);
        }

        $font->update($validated);
        return response()->json(['font' => $font]);
    }

    // ── Admin: icon styles ────────────────────────────────────────────────────

    public function adminIconStyles(): JsonResponse
    {
        $styles = IconStyle::orderBy('sort_order')->get();
        return response()->json(['icon_styles' => $styles]);
    }

    public function adminUpdateIconStyle(Request $request, int $id): JsonResponse
    {
        $style = IconStyle::findOrFail($id);

        $validated = $request->validate([
            'is_active'  => 'boolean',
            'is_default' => 'boolean',
            'sort_order' => 'integer',
        ]);

        if (!empty($validated['is_default'])) {
            IconStyle::where('id', '!=', $id)->update(['is_default' => false]);
        }

        $style->update($validated);
        return response()->json(['icon_style' => $style]);
    }

    // ── Admin: component layouts ──────────────────────────────────────────────

    public function adminLayouts(): JsonResponse
    {
        $layouts = ComponentLayout::orderBy('component_type')->orderBy('sort_order')->get();
        return response()->json(['layouts' => $layouts]);
    }

    public function adminUpdateLayout(Request $request, int $id): JsonResponse
    {
        $layout = ComponentLayout::findOrFail($id);

        $validated = $request->validate([
            'is_active'  => 'boolean',
            'is_default' => 'boolean',
            'sort_order' => 'integer',
        ]);

        if (!empty($validated['is_default'])) {
            ComponentLayout::where('component_type', $layout->component_type)
                ->where('id', '!=', $id)
                ->update(['is_default' => false]);
        }

        $layout->update($validated);
        return response()->json(['layout' => $layout]);
    }
}
