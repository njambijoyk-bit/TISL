<?php

namespace App\Http\Controllers\Api\Hr;

use App\Http\Controllers\Controller;
use App\Services\Hr\EmploymentTypes;
use App\Services\Hr\HrSettings;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** HR configuration (docs/HR_STAGE1_SPEC.md, build 1.4): employment types, employee numbers, required fields, people seeing their own pay details. */
class HrConfigController extends Controller
{
    public function __construct(private HrSettings $settings, private EmploymentTypes $types) {}

    public function show(Request $request): JsonResponse
    {
        return response()->json($this->page());
    }

    public function save(Request $request): JsonResponse
    {
        $this->settings->save('general', (array) $request->input('general', []), $request->user());

        return response()->json($this->page());
    }

    public function rollback(Request $request, int $version): JsonResponse
    {
        $this->settings->rollback('general', $version, $request->user());

        return response()->json($this->page());
    }

    public function saveType(Request $request, ?int $type = null): JsonResponse
    {
        $this->types->save($type, $request->only(['name', 'paid_by_payroll', 'is_active']));

        return response()->json($this->page(), $type ? 200 : 201);
    }

    /** The types a form may offer (everyone who works with records). */
    public function types(): JsonResponse
    {
        return response()->json(['types' => $this->types->all(true), 'required' => $this->settings->get()['required']]);
    }

    /** @return array<string, mixed> */
    private function page(): array
    {
        $g = $this->settings->get();

        return ['ready' => HrSettings::ready(), 'general' => $g, 'version' => $this->settings->version(), 'versions' => $this->settings->versions(), 'types' => $this->types->all(),
            'next_number' => $this->settings->nextNumber()];
    }
}
