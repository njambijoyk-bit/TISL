<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Module;
use App\Models\NavLink;
use App\Services\Licensing\LicenseManager;
use Illuminate\Http\Request;

/**
 * Storefront navigation manager.
 *
 * Admin view: only links whose module is LICENSED are shown. Each link's
 * toggle is actionable only when the module is ACTIVE (licensed AND switched
 * on) — a licensed-but-off module's links are visible in the list but locked.
 *
 * Public view: the links a customer should see — module active AND visible.
 */
class NavController extends Controller
{
    /** Letters the app itself uses with Shift: A shortcut list, U account menu, M Mimi, N memo, R refresh, T light/dark. */
    public const RESERVED = ['A', 'U', 'M', 'N', 'R', 'T'];

    public function __construct(private LicenseManager $manager) {}

    /** Admin: links grouped by their (licensed) module, with lock state. */
    public function index()
    {
        $names = Module::pluck('name', 'module_key')->all();
        $groups = [];

        foreach (NavLink::orderBy('sort_order')->orderBy('id')->get() as $link) {
            $module = $link->module_key;
            $isCore = $module === LicenseManager::CORE;

            // Only show links for core or a LICENSED module.
            if (!$isCore && !$this->manager->isLicensed($module)) {
                continue;
            }
            $active = $isCore ? true : $this->manager->isActive($module);

            $groups[$module] ??= [
                'module'  => $module,
                'name'    => $isCore ? 'Core' : ($names[$module] ?? ucfirst($module)),
                'active'  => $active,   // false => toggles locked (module switched off)
                'links'   => [],
            ];
            $groups[$module]['links'][] = [
                'id'         => $link->id,
                'key'        => $link->key,
                'label'      => $link->label,
                'path'       => $link->path,
                'visible'    => $link->visible,
                'sort_order' => $link->sort_order,
                'shortcut'   => $link->shortcut,
            ];
        }

        return response()->json(['groups' => array_values($groups)]);
    }

    /** Admin: update a link. Blocked when its module is switched off. */
    public function update(Request $request, int $id)
    {
        $link = NavLink::findOrFail($id);
        $isCore = $link->module_key === LicenseManager::CORE;

        if (!$isCore && !$this->manager->isLicensed($link->module_key)) {
            return response()->json(['ok' => false, 'message' => 'That module is not licensed.'], 422);
        }
        if (!$isCore && !$this->manager->isActive($link->module_key)) {
            return response()->json(['ok' => false, 'message' => 'Switch the module on before changing its links.'], 422);
        }

        $data = $request->validate([
            'visible'    => 'sometimes|boolean',
            'label'      => 'sometimes|string|max:100',
            'sort_order' => 'sometimes|integer|min:0|max:9999',
            'shortcut'   => 'sometimes|nullable|string|size:1|regex:/^[A-Za-z]$/',
        ]);
        if (array_key_exists('shortcut', $data)) {
            $data['shortcut'] = $data['shortcut'] === null || $data['shortcut'] === '' ? null : strtoupper($data['shortcut']);
            if ($data['shortcut'] !== null) {
                if (in_array($data['shortcut'], self::RESERVED, true)) {
                    return response()->json(['ok' => false, 'message' => "Shift+{$data['shortcut']} is kept for the app (list, account, Mimi, memo, refresh, theme)."], 422);
                }
                if (NavLink::where('shortcut', $data['shortcut'])->where('id', '!=', $link->id)->exists()) {
                    return response()->json(['ok' => false, 'message' => "Shift+{$data['shortcut']} already goes to another link."], 422);
                }
            }
        }
        $link->update($data);

        return response()->json(['ok' => true, 'message' => 'Saved.']);
    }

    /** Public: the links the customer should see right now. */
    public function publicNav()
    {
        $links = NavLink::where('visible', true)
            ->orderBy('sort_order')->orderBy('id')
            ->get(['key', 'label', 'path', 'module_key', 'shortcut']);

        $out = $links->filter(function ($l) {
            return $l->module_key === LicenseManager::CORE || $this->manager->isActive($l->module_key);
        })->map(fn ($l) => [
            'key'   => $l->key,
            'label' => $l->label,
            'path'  => $l->path,
            'shortcut' => $l->shortcut,
        ])->values();

        return response()->json(['links' => $out]);
    }
}
