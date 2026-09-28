<?php

namespace App\Services;

use App\Models\Service;
use App\Models\ServiceOption;
use App\Models\ServiceVariant;
use Illuminate\Support\Facades\DB;

/**
 * Packages (service variants) and option combinations for services — the
 * counterpart of product variants, without stock.
 */
class ServiceCatalogService
{
    /** A service always has at least one package. */
    public function ensureStandardVariant(Service $service): ServiceVariant
    {
        $existing = $service->variants()->first();
        if ($existing) {
            return $existing;
        }

        return $service->variants()->create([
            'name'             => 'Standard',
            'combination_key'  => 'default',
            'is_default'       => true,
            'status'           => 'active',
            'price'            => $service->base_price,
            'duration_value'   => $service->duration_value,
            'duration_unit_id' => $service->duration_unit_id,
            'price_unit_id'    => $service->price_unit_id,
        ]);
    }

    /** While the only package is the auto "Standard", it follows the starting price. */
    public function syncStandardPrice(Service $service): void
    {
        $variants = $service->variants()->get();
        if ($variants->count() === 1 && $variants->first()->combination_key === 'default') {
            $variants->first()->update(['price' => $service->base_price]);
        }
    }

    /**
     * Create the missing option combinations as packages, priced like the
     * default package (the admin then adjusts each price). The auto "Standard"
     * package is replaced once real combinations exist.
     *
     * @return int number of packages created
     */
    public function generateFromOptions(Service $service): int
    {
        $options = $service->options()->with('values')->get()->filter(fn (ServiceOption $o) => $o->values->isNotEmpty())->values();
        if ($options->isEmpty()) {
            return 0;
        }

        $combos = [[]];
        foreach ($options as $option) {
            $next = [];
            foreach ($combos as $combo) {
                foreach ($option->values as $value) {
                    $next[] = array_merge($combo, [$value]);
                }
            }
            $combos = $next;
        }

        return DB::transaction(function () use ($service, $combos) {
            $base = $service->variants()->where('is_default', true)->first() ?? $service->variants()->first();
            $existingKeys = $service->variants()->pluck('combination_key')->all();
            $created = 0;

            foreach ($combos as $i => $combo) {
                $key = ServiceVariant::keyFor(array_map(fn ($v) => $v->id, $combo));
                if (in_array($key, $existingKeys, true)) {
                    continue;
                }
                $variant = $service->variants()->create([
                    'name'             => collect($combo)->map(fn ($v) => $v->value)->implode(' / '),
                    'combination_key'  => $key,
                    'is_default'       => false,
                    'status'           => 'active',
                    'price'            => $base?->price ?? $service->base_price,
                    'duration_value'   => $base?->duration_value,
                    'duration_unit_id' => $base?->duration_unit_id,
                    'price_unit_id'    => $base?->price_unit_id,
                    'position'         => $i + 1,
                ]);
                $variant->optionValues()->sync(array_map(fn ($v) => $v->id, $combo));
                $created++;
            }

            // The placeholder Standard package gives way to the real combinations.
            if ($created > 0) {
                $standard = $service->variants()->where('combination_key', 'default')->first();
                if ($standard) {
                    $standard->delete();
                }
                if (! $service->variants()->where('is_default', true)->exists()) {
                    $service->variants()->orderBy('position')->orderBy('id')->first()?->update(['is_default' => true]);
                }
            }

            return $created;
        });
    }

    /** Make sure something sellable remains (used after deleting options/packages). */
    public function keepAtLeastOneVariant(Service $service): void
    {
        if (! $service->variants()->exists()) {
            $this->ensureStandardVariant($service);
        } elseif (! $service->variants()->where('is_default', true)->exists()) {
            $service->variants()->orderBy('position')->orderBy('id')->first()?->update(['is_default' => true]);
        }
    }
}
