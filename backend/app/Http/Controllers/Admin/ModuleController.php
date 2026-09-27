<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Installation;
use App\Models\LicenseAttempt;
use App\Models\Module;
use App\Services\Licensing\LicenseActivationService;
use App\Services\Licensing\LicenseFormat;
use App\Services\Licensing\LicenseManager;
use Illuminate\Http\Request;

/**
 * Module Center (client superadmin) and first-run setup.
 *
 * Setup (ownership code) is open to any authenticated staff user while the
 * installation is unverified, so a locked-out client can still set up. Once
 * verified, the Module Center is super_admin only (route middleware).
 */
class ModuleController extends Controller
{
    public function __construct(
        private LicenseManager $manager,
        private LicenseActivationService $activation,
    ) {}

    /** Setup + licensing status for the whole app (drives the setup gate). */
    public function status()
    {
        $install = Installation::current();
        $verified = $this->manager->installationVerified();

        return response()->json([
            'installed'      => $install !== null,
            'verified'       => $verified,
            'business_name'  => $verified ? $install->business_name : null,
            'key_version'    => $verified ? $install->key_version : null,
            'locked_out'     => $this->activation->lockedOut(),
        ]);
    }

    /** First install: paste the ownership code. */
    public function setup(Request $request)
    {
        $data = $request->validate(['ownership_code' => 'required|string|max:4000']);
        $result = $this->activation->setupOwnership($data['ownership_code'], $request);

        return response()->json($result, $result['ok'] ? 200 : 422);
    }

    /** Module Center: every module with its live status. */
    public function index()
    {
        $licensed = $this->manager->licensedModules();

        $modules = Module::orderBy('sort_order')->get()->map(function (Module $m) use ($licensed) {
            $isLicensed = in_array($m->module_key, $licensed, true);
            $status = !$isLicensed ? 'unlicensed'
                : ($m->enabled ? 'active' : 'licensed_off');

            return [
                'number'      => $m->number,
                'key'         => $m->module_key,
                'name'        => $m->name,
                'description' => $m->description,
                'licensed'    => $isLicensed,
                'enabled'     => $m->enabled,
                'status'      => $status, // active | licensed_off | unlicensed
            ];
        });

        $install = Installation::current();

        return response()->json([
            'business_name' => $this->manager->installationVerified() ? $install->business_name : null,
            'modules'       => $modules,
        ]);
    }

    /** Paste a module key. */
    public function activate(Request $request)
    {
        $data = $request->validate(['key' => 'required|string|max:4000']);
        $result = $this->activation->activateModule($data['key'], $request);

        return response()->json($result, $result['ok'] ? 200 : 422);
    }

    /** Flip a licensed module's client switch. */
    public function toggle(Request $request, string $moduleKey)
    {
        $data = $request->validate(['enabled' => 'required|boolean']);
        $result = $this->activation->setSwitch($moduleKey, $data['enabled'], $request);

        return response()->json($result, $result['ok'] ? 200 : 422);
    }

    /** The attempts log (paste history, ownership, switches). */
    public function attempts(Request $request)
    {
        $rows = LicenseAttempt::with('user:id,name')
            ->latest('created_at')
            ->limit(200)
            ->get(['id', 'user_id', 'result', 'module_key', 'key_client_uuid', 'key_serial', 'ip_address', 'created_at']);

        return response()->json(['attempts' => $rows]);
    }
}
