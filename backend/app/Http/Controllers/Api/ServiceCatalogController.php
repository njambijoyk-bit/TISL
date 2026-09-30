<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Service;
use App\Models\ServiceOption;
use App\Models\ServiceOptionValue;
use App\Models\ServiceRequirement;
use App\Models\ServiceVariant;
use App\Services\CurrencyConversionService;
use App\Services\ServiceCatalogService;
use App\Services\TaxService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;

/**
 * Options, packages and requirements for services (admin), and the public
 * "what can I choose?" payload for the service page.
 */
class ServiceCatalogController extends Controller
{
    public function __construct(private ServiceCatalogService $catalog) {}

    // ========================================
    // PUBLIC
    // ========================================

    public function publicPackages($id)
    {
        $service = Service::with(['currency:id,code,symbol', 'durationUnit:id,code,name', 'priceUnit:id,code,name'])
            ->where('is_visible', true)
            ->findOrFail($id);

        $variants = $service->variants()->active()
            ->with(['optionValues', 'durationUnit:id,code,name', 'priceUnit:id,code,name'])
            ->get();

        $money = app(CurrencyConversionService::class);
        $display = $money->getDisplayCurrency();
        $convert = fn (?float $amount) => $amount === null
            ? null
            : $money->convertForDisplay($amount, $service->currency_id, $display->id)['amount'];

        $usedValueIds = $variants->flatMap(fn ($v) => $v->optionValues->pluck('id'))->unique()->all();
        $options = $service->options()
            ->with(['values' => fn ($q) => $q->whereIn('id', $usedValueIds)->orderBy('position')])
            ->get()
            ->filter(fn ($o) => $o->values->isNotEmpty())
            ->map(fn ($o) => [
                'id'     => $o->id,
                'name'   => $o->name,
                'values' => $o->values->map(fn ($v) => ['id' => $v->id, 'value' => $v->value])->values(),
            ])->values();

        $taxLabel = null;
        $variantsOut = $variants->map(function (ServiceVariant $v) use ($service, $convert, &$taxLabel) {
            $price = $v->price !== null ? (float) $v->price : null;
            $tax = $price !== null ? $this->taxFor($service, $price) : ['amount' => 0.0, 'label' => null];
            $taxLabel ??= $tax['label'];
            $compare = $v->compare_at_price !== null ? (float) $v->compare_at_price : null;

            return [
                'id'                 => $v->id,
                'name'               => $v->name,
                'description'        => $v->description,
                'is_default'         => (bool) $v->is_default,
                'is_custom'          => (bool) $v->is_custom,
                'selection'          => $v->optionValues->mapWithKeys(fn ($ov) => [$ov->option_id => $ov->id]),
                'price'              => $price,
                'display_price'      => $convert($price),
                'compare_at_price'   => $compare,
                'display_compare_at' => $convert($compare),
                'tax_amount'         => $tax['amount'],
                'display_tax'        => $convert($tax['amount']),
                'display_price_incl' => $price === null ? null : $convert($price + $tax['amount']),
                'duration_value'     => $v->duration_value !== null ? (float) $v->duration_value : null,
                'duration_unit'      => $v->durationUnit,
                'price_unit'         => $v->priceUnit,
            ];
        })->values();

        $requirements = $service->requirementFields()->get()
            ->map(fn ($r) => [
                'id' => $r->id, 'label' => $r->label, 'field_type' => $r->field_type,
                'choices' => $r->choices, 'help_text' => $r->help_text, 'is_required' => $r->is_required,
            ])->values();

        return response()->json([
            'currency'         => $service->currency,
            'display_currency' => $display->code,
            'options'          => $options,
            'variants'         => $variantsOut,
            'requirements'     => $requirements,
            'tax_label'        => $taxLabel,
            'tax_info'         => \App\Services\Books\PriceTax::forItem($service),
            'delivery_mode'    => $service->delivery_mode,
        ], 200);
    }

    /** Additive tax on one price, via the tax engine (service rules, overrides). Never throws. */
    private function taxFor(Service $service, float $price): array
    {
        $info = \App\Services\Books\PriceTax::forItem($service);

        return ['amount' => \App\Services\Books\PriceTax::split($price, $info)['tax'], 'label' => $info && $info['rate_percent'] ? $info['label'] : null, 'info' => $info];
    }

    // ========================================
    // ADMIN — whole catalog for the editor
    // ========================================

    public function adminCatalog($serviceId)
    {
        return response()->json($this->payload(Service::findOrFail($serviceId)), 200);
    }

    private function payload(Service $service): array
    {
        $service->load(['options.values', 'variants.optionValues', 'variants.materials.variant.product:id,name,is_for_sale', 'variants.materials.variant.units.unit:id,code', 'requirementFields']);

        return [
            'options' => $service->options->map(fn ($o) => [
                'id' => $o->id, 'name' => $o->name, 'position' => $o->position,
                'values' => $o->values->map(fn ($v) => ['id' => $v->id, 'value' => $v->value, 'position' => $v->position])->values(),
            ])->values(),
            'variants' => $service->variants->map(fn (ServiceVariant $v) => array_merge($v->toArray(), [
                'option_value_ids' => $v->optionValues->pluck('id')->values(),
                'option_label'     => $v->optionLabel(),
                'materials'        => $v->materials->map(fn ($m) => $m->toRow())->values(),
            ]))->values(),
            'requirements' => $service->requirementFields->values(),
        ];
    }

    // ========================================
    // OPTIONS
    // ========================================

    public function storeOption(Request $request, $serviceId)
    {
        $service = Service::findOrFail($serviceId);
        $v = Validator::make($request->all(), ['name' => 'required|string|max:100']);
        if ($v->fails()) {
            return response()->json(['errors' => $v->errors()], 422);
        }
        if ($service->options()->where('name', $request->name)->exists()) {
            return response()->json(['message' => "This service already has an option called \"{$request->name}\"."], 422);
        }
        $service->options()->create(['name' => $request->name, 'position' => $service->options()->count()]);

        return response()->json($this->payload($service), 201);
    }

    public function updateOption(Request $request, $serviceId, $optionId)
    {
        $service = Service::findOrFail($serviceId);
        $option = ServiceOption::where('service_id', $service->id)->findOrFail($optionId);
        $v = Validator::make($request->all(), ['name' => 'required|string|max:100']);
        if ($v->fails()) {
            return response()->json(['errors' => $v->errors()], 422);
        }
        if ($service->options()->where('name', $request->name)->where('id', '!=', $option->id)->exists()) {
            return response()->json(['message' => "This service already has an option called \"{$request->name}\"."], 422);
        }
        $option->update(['name' => $request->name]);

        return response()->json($this->payload($service));
    }

    public function destroyOption($serviceId, $optionId)
    {
        $service = Service::findOrFail($serviceId);
        $option = ServiceOption::where('service_id', $service->id)->findOrFail($optionId);

        DB::transaction(function () use ($service, $option) {
            $valueIds = $option->values()->pluck('id');
            $this->deleteVariantsUsing($service, $valueIds->all());
            $option->delete();
            $this->catalog->keepAtLeastOneVariant($service);
        });

        return response()->json($this->payload($service));
    }

    public function storeOptionValue(Request $request, $serviceId, $optionId)
    {
        $service = Service::findOrFail($serviceId);
        $option = ServiceOption::where('service_id', $service->id)->findOrFail($optionId);
        $v = Validator::make($request->all(), ['value' => 'required|string|max:100']);
        if ($v->fails()) {
            return response()->json(['errors' => $v->errors()], 422);
        }
        if ($option->values()->where('value', $request->value)->exists()) {
            return response()->json(['message' => "\"{$request->value}\" is already a value of {$option->name}."], 422);
        }
        $option->values()->create(['value' => $request->value, 'position' => $option->values()->count()]);

        return response()->json($this->payload($service), 201);
    }

    public function updateOptionValue(Request $request, $serviceId, $optionId, $valueId)
    {
        $service = Service::findOrFail($serviceId);
        $option = ServiceOption::where('service_id', $service->id)->findOrFail($optionId);
        $value = ServiceOptionValue::where('option_id', $option->id)->findOrFail($valueId);
        $v = Validator::make($request->all(), ['value' => 'required|string|max:100']);
        if ($v->fails()) {
            return response()->json(['errors' => $v->errors()], 422);
        }
        if ($option->values()->where('value', $request->value)->where('id', '!=', $value->id)->exists()) {
            return response()->json(['message' => "\"{$request->value}\" is already a value of {$option->name}."], 422);
        }
        $value->update(['value' => $request->value]);
        // keep generated package names readable
        foreach ($service->variants()->where('is_custom', false)->with('optionValues')->get() as $variant) {
            if ($variant->optionValues->contains('id', $value->id)) {
                $variant->update(['name' => $variant->optionLabel()]);
            }
        }

        return response()->json($this->payload($service));
    }

    public function destroyOptionValue($serviceId, $optionId, $valueId)
    {
        $service = Service::findOrFail($serviceId);
        $option = ServiceOption::where('service_id', $service->id)->findOrFail($optionId);
        $value = ServiceOptionValue::where('option_id', $option->id)->findOrFail($valueId);

        DB::transaction(function () use ($service, $value) {
            $this->deleteVariantsUsing($service, [$value->id]);
            $value->delete();
            $this->catalog->keepAtLeastOneVariant($service);
        });

        return response()->json($this->payload($service));
    }

    /** Packages built from any of these option values go with them. */
    private function deleteVariantsUsing(Service $service, array $valueIds): void
    {
        if (! $valueIds) {
            return;
        }
        $service->variants()->whereHas('optionValues', fn ($q) => $q->whereIn('service_option_values.id', $valueIds))->get()
            ->each->delete();
    }

    // ========================================
    // PACKAGES (variants)
    // ========================================

    public function generateVariants($serviceId)
    {
        $service = Service::findOrFail($serviceId);
        $created = $this->catalog->generateFromOptions($service);

        return response()->json(array_merge($this->payload($service), [
            'message' => $created > 0 ? "{$created} package(s) created — set each one's price." : 'Nothing to generate — every combination already has a package (or no option has values yet).',
        ]));
    }

    private function variantRules(): array
    {
        return [
            'name'             => 'nullable|string|max:255',
            'description'      => 'nullable|string',
            'price'            => 'nullable|numeric|min:0',
            'compare_at_price' => 'nullable|numeric|min:0',
            'duration_value'   => 'nullable|numeric|min:0',
            'duration_unit_id' => 'nullable|exists:units_of_measure,id',
            'price_unit_id'    => 'nullable|exists:units_of_measure,id',
            'status'           => 'nullable|in:active,inactive',
            'is_default'       => 'nullable|boolean',
        ];
    }

    /** A hand-made package (not tied to an option combination). */
    public function storeVariant(Request $request, $serviceId)
    {
        $service = Service::findOrFail($serviceId);
        $v = Validator::make($request->all(), array_merge($this->variantRules(), ['name' => 'required|string|max:255']));
        if ($v->fails()) {
            return response()->json(['errors' => $v->errors()], 422);
        }

        DB::transaction(function () use ($request, $service) {
            $variant = $service->variants()->create(array_merge(
                $request->only(['name', 'description', 'price', 'compare_at_price', 'duration_value', 'duration_unit_id', 'price_unit_id']),
                [
                    'combination_key' => 'custom-' . str_replace('.', '', uniqid('', true)),
                    'is_custom'       => true,
                    'is_default'      => false,
                    'status'          => $request->input('status', 'active'),
                    'position'        => $service->variants()->count(),
                ]
            ));
            if ($request->boolean('is_default')) {
                $this->makeDefault($service, $variant);
            }
        });

        return response()->json($this->payload($service), 201);
    }

    public function updateVariant(Request $request, $serviceId, $variantId)
    {
        $service = Service::findOrFail($serviceId);
        $variant = ServiceVariant::where('service_id', $service->id)->findOrFail($variantId);
        $v = Validator::make($request->all(), $this->variantRules());
        if ($v->fails()) {
            return response()->json(['errors' => $v->errors()], 422);
        }

        DB::transaction(function () use ($request, $service, $variant) {
            $variant->update($request->only([
                'name', 'description', 'price', 'compare_at_price', 'duration_value', 'duration_unit_id', 'price_unit_id', 'status',
            ]));
            if ($request->boolean('is_default')) {
                $this->makeDefault($service, $variant);
            }
        });

        return response()->json($this->payload($service));
    }

    /**
     * Replace a package's default materials. Body: materials [{variant_id, quantity, mode: charged|included}].
     * They fill in on every sale of the package (and can be changed there).
     */
    public function saveMaterials(Request $request, $serviceId, $variantId)
    {
        $service = Service::findOrFail($serviceId);
        $variant = ServiceVariant::where('service_id', $service->id)->findOrFail($variantId);
        $v = Validator::make($request->all(), [
            'materials'               => 'present|array|max:50',
            'materials.*.variant_id'  => 'required|integer|exists:product_variants,id',
            'materials.*.quantity'    => 'required|numeric|gt:0',
            'materials.*.mode'        => 'required|in:charged,included',
        ]);
        if ($v->fails()) {
            return response()->json(['errors' => $v->errors()], 422);
        }

        DB::transaction(function () use ($request, $variant) {
            $variant->materials()->delete();
            foreach ($request->input('materials') as $i => $m) {
                $variant->materials()->create(['variant_id' => $m['variant_id'], 'quantity' => $m['quantity'], 'mode' => $m['mode'], 'position' => $i]);
            }
        });

        return response()->json($this->payload($service));
    }

    public function destroyVariant($serviceId, $variantId)
    {
        $service = Service::findOrFail($serviceId);
        $variant = ServiceVariant::where('service_id', $service->id)->findOrFail($variantId);

        if ($service->variants()->count() <= 1) {
            return response()->json(['message' => 'A service needs at least one package.'], 422);
        }
        DB::transaction(function () use ($service, $variant) {
            $variant->delete();
            $this->catalog->keepAtLeastOneVariant($service);
        });

        return response()->json($this->payload($service));
    }

    private function makeDefault(Service $service, ServiceVariant $variant): void
    {
        $service->variants()->where('id', '!=', $variant->id)->update(['is_default' => false]);
        $variant->update(['is_default' => true]);
    }

    // ========================================
    // REQUIREMENTS
    // ========================================

    private function requirementRules(): array
    {
        return [
            'label'       => 'required|string|max:255',
            'field_type'  => 'nullable|in:' . implode(',', ServiceRequirement::TYPES),
            'choices'     => 'nullable|array',
            'choices.*'   => 'string|max:100',
            'help_text'   => 'nullable|string|max:255',
            'is_required' => 'nullable|boolean',
        ];
    }

    public function storeRequirement(Request $request, $serviceId)
    {
        $service = Service::findOrFail($serviceId);
        $v = Validator::make($request->all(), $this->requirementRules());
        if ($v->fails()) {
            return response()->json(['errors' => $v->errors()], 422);
        }
        if ($request->input('field_type') === 'select' && empty($request->choices)) {
            return response()->json(['message' => 'A choice field needs at least one choice.'], 422);
        }
        $service->requirementFields()->create(array_merge(
            $request->only(['label', 'field_type', 'choices', 'help_text']),
            ['is_required' => $request->boolean('is_required'), 'field_type' => $request->input('field_type', 'text'), 'position' => $service->requirementFields()->count()]
        ));

        return response()->json($this->payload($service), 201);
    }

    public function updateRequirement(Request $request, $serviceId, $requirementId)
    {
        $service = Service::findOrFail($serviceId);
        $req = ServiceRequirement::where('service_id', $service->id)->findOrFail($requirementId);
        $v = Validator::make($request->all(), $this->requirementRules());
        if ($v->fails()) {
            return response()->json(['errors' => $v->errors()], 422);
        }
        if ($request->input('field_type') === 'select' && empty($request->choices)) {
            return response()->json(['message' => 'A choice field needs at least one choice.'], 422);
        }
        $req->update(array_merge(
            $request->only(['label', 'field_type', 'choices', 'help_text']),
            ['is_required' => $request->boolean('is_required')]
        ));

        return response()->json($this->payload($service));
    }

    public function destroyRequirement($serviceId, $requirementId)
    {
        $service = Service::findOrFail($serviceId);
        ServiceRequirement::where('service_id', $service->id)->findOrFail($requirementId)->delete();

        return response()->json($this->payload($service));
    }
}
