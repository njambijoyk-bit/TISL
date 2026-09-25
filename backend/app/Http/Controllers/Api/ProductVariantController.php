<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Product;
use App\Models\ProductOption;
use App\Models\ProductOptionValue;
use App\Models\ProductVariant;
use App\Models\ProductVariantUnit;
use App\Models\ProductImage;
use Illuminate\Database\QueryException;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\Validator;

class ProductVariantController extends Controller
{
    // ========================================
    // OPTIONS
    // ========================================

    public function adminIndexOptions($productId)
    {
        $product = Product::findOrFail($productId);
        $options = $product->options()->with('values')->get();

        return response()->json(['options' => $options], 200);
    }

    public function adminStoreOption(Request $request, $productId)
    {
        $product = Product::findOrFail($productId);

        $validator = Validator::make($request->all(), [
            'name'     => 'required|string|max:100',
            'position' => 'nullable|integer|min:0',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        try {
            $option = $product->options()->create([
                'name'     => $request->name,
                'position' => $request->position ?? 0,
            ]);

            return response()->json(['option' => $option], 201);
        } catch (QueryException $e) {
            if ($this->isDuplicateKey($e)) {
                return response()->json(['message' => 'This product already has an option with that name.'], 422);
            }
            throw $e;
        }
    }

    public function adminUpdateOption(Request $request, $productId, $optionId)
    {
        $option = ProductOption::where('product_id', $productId)->findOrFail($optionId);

        $validator = Validator::make($request->all(), [
            'name'     => 'sometimes|required|string|max:100',
            'position' => 'nullable|integer|min:0',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        try {
            $option->update($request->only(['name', 'position']));
            return response()->json(['option' => $option->fresh('values')], 200);
        } catch (QueryException $e) {
            if ($this->isDuplicateKey($e)) {
                return response()->json(['message' => 'This product already has an option with that name.'], 422);
            }
            throw $e;
        }
    }

    public function adminDestroyOption($productId, $optionId)
    {
        $option = ProductOption::where('product_id', $productId)->findOrFail($optionId);

        $valueIds = $option->values()->pluck('id');
        $inUse = $valueIds->isNotEmpty()
            && DB::table('product_variant_options')->whereIn('option_value_id', $valueIds)->exists();

        if ($inUse) {
            return response()->json([
                'message' => 'This option cannot be deleted — one or more of its values is still assigned to a variant.',
            ], 422);
        }

        $option->delete();

        return response()->json(['message' => 'Option deleted.'], 200);
    }

    // ========================================
    // OPTION VALUES
    // ========================================

    public function adminStoreOptionValue(Request $request, $productId, $optionId)
    {
        $option = ProductOption::where('product_id', $productId)->findOrFail($optionId);

        $validator = Validator::make($request->all(), [
            'value'    => 'required|string|max:100',
            'meta'     => 'nullable|array',
            'position' => 'nullable|integer|min:0',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        try {
            $value = $option->values()->create([
                'value'    => $request->value,
                'meta'     => $request->meta,
                'position' => $request->position ?? 0,
            ]);

            return response()->json(['value' => $value], 201);
        } catch (QueryException $e) {
            if ($this->isDuplicateKey($e)) {
                return response()->json(['message' => 'This option already has that value.'], 422);
            }
            throw $e;
        }
    }

    public function adminUpdateOptionValue(Request $request, $productId, $optionId, $valueId)
    {
        $option = ProductOption::where('product_id', $productId)->findOrFail($optionId);
        $value  = $option->values()->findOrFail($valueId);

        $validator = Validator::make($request->all(), [
            'value'    => 'sometimes|required|string|max:100',
            'meta'     => 'nullable|array',
            'position' => 'nullable|integer|min:0',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        try {
            $value->update($request->only(['value', 'meta', 'position']));
            return response()->json(['value' => $value], 200);
        } catch (QueryException $e) {
            if ($this->isDuplicateKey($e)) {
                return response()->json(['message' => 'This option already has that value.'], 422);
            }
            throw $e;
        }
    }

    public function adminDestroyOptionValue($productId, $optionId, $valueId)
    {
        $option = ProductOption::where('product_id', $productId)->findOrFail($optionId);
        $value  = $option->values()->findOrFail($valueId);

        $inUse = DB::table('product_variant_options')->where('option_value_id', $value->id)->exists();

        if ($inUse) {
            return response()->json([
                'message' => 'This value cannot be deleted — it is still assigned to a variant.',
            ], 422);
        }

        $value->delete();

        return response()->json(['message' => 'Option value deleted.'], 200);
    }

    // ========================================
    // VARIANTS
    // ========================================

    public function adminIndexVariants($productId)
    {
        $product = Product::findOrFail($productId);

        $variants = $product->productVariants()
            ->with(['units', 'optionValues.option', 'images'])
            ->get()
            ->map(fn ($v) => $this->formatVariant($v));

        return response()->json(['variants' => $variants], 200);
    }

    public function adminShowVariant($productId, $variantId)
    {
        $variant = ProductVariant::where('product_id', $productId)
            ->with(['units', 'optionValues.option', 'images'])
            ->findOrFail($variantId);

        return response()->json(['variant' => $this->formatVariant($variant)], 200);
    }

    public function adminStoreVariant(Request $request, $productId)
    {
        $product = Product::findOrFail($productId);

        $validator = Validator::make($request->all(), [
            'sku'                   => 'nullable|string|unique:product_variants,sku',
            'barcode'               => 'nullable|string|max:64',
            'name'                  => 'nullable|string|max:255',
            'option_value_ids'      => 'sometimes|array',
            'option_value_ids.*'    => 'integer|exists:product_option_values,id',
            'combination_key'       => 'required_with:option_value_ids|string|max:255',
            'net_content_qty'       => 'nullable|numeric|min:0',
            'net_content_unit_id'   => 'nullable|exists:units_of_measure,id',
            'stock_quantity'        => 'nullable|numeric|min:0',
            'is_default'            => 'boolean',
            'status'                => 'in:active,inactive,discontinued',

            // Optional base unit, created atomically with the variant.
            'base_unit'                    => 'sometimes|array',
            'base_unit.unit_id'            => 'required_with:base_unit|exists:units_of_measure,id',
            'base_unit.price'              => 'nullable|numeric|min:0',
            'base_unit.compare_at_price'   => 'nullable|numeric|min:0',
            'base_unit.is_default_sale'    => 'boolean',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        // Validate option_value_ids belong to this product, one per option,
        // and that the submitted combination_key matches what we derive.
        $optionValueIdsByOptionId = [];
        if ($request->filled('option_value_ids')) {
            $optionValueIdsByOptionId = $request->option_value_ids;

            $ownershipError = $this->validateOptionValueOwnership($productId, $optionValueIdsByOptionId);
            if ($ownershipError) {
                return response()->json(['message' => $ownershipError], 422);
            }

            $derivedKey = $this->deriveCombinationKey(array_values($optionValueIdsByOptionId));
            if ($derivedKey !== $request->combination_key) {
                return response()->json([
                    'message' => "combination_key does not match the submitted option_value_ids. Expected [{$derivedKey}].",
                ], 422);
            }
        }

        try {
            $variant = DB::transaction(function () use ($request, $product, $optionValueIdsByOptionId) {
                $variant = $product->productVariants()->create([
                    'sku'                 => $request->sku,
                    'barcode'             => $request->barcode,
                    'name'                => $request->name,
                    'combination_key'     => $request->filled('option_value_ids') ? $request->combination_key : 'default',
                    'is_default'          => $request->boolean('is_default'),
                    'net_content_qty'     => $request->net_content_qty,
                    'net_content_unit_id' => $request->net_content_unit_id,
                    'stock_quantity'      => $request->stock_quantity ?? 0,
                    'status'              => $request->status ?? ProductVariant::STATUS_ACTIVE,
                ]);

                if (!empty($optionValueIdsByOptionId)) {
                    $variant->syncOptionValues($optionValueIdsByOptionId);
                }

                if ($request->filled('base_unit')) {
                    $variant->units()->create([
                        'unit_id'          => $request->input('base_unit.unit_id'),
                        'role'             => ProductVariantUnit::ROLE_BASE,
                        'base_factor'      => 1,
                        'price'            => $request->input('base_unit.price'),
                        'compare_at_price' => $request->input('base_unit.compare_at_price'),
                        'is_default_sale'  => $request->input('base_unit.is_default_sale', true),
                    ]);
                }

                if ($request->boolean('is_default')) {
                    $product->productVariants()->where('id', '!=', $variant->id)->update(['is_default' => false]);
                }

                // Product::hasStructuredVariants() checks this flag — keep it in step.
                if (! $product->has_variants) {
                    $product->forceFill(['has_variants' => true])->save();
                }

                return $variant;
            });

            $variant->load(['units', 'optionValues.option']);

            return response()->json(['variant' => $this->formatVariant($variant)], 201);
        } catch (QueryException $e) {
            if ($this->isDuplicateKey($e)) {
                return response()->json(['message' => 'A variant with this exact option combination already exists for this product.'], 422);
            }
            throw $e;
        }
    }

    public function adminUpdateVariant(Request $request, $productId, $variantId)
    {
        $variant = ProductVariant::where('product_id', $productId)->findOrFail($variantId);

        $validator = Validator::make($request->all(), [
            'sku'                 => 'nullable|string|unique:product_variants,sku,' . $variant->id,
            'barcode'             => 'nullable|string|max:64',
            'name'                => 'nullable|string|max:255',
            'option_value_ids'    => 'sometimes|array',
            'option_value_ids.*'  => 'integer|exists:product_option_values,id',
            'combination_key'     => 'required_with:option_value_ids|string|max:255',
            'net_content_qty'     => 'nullable|numeric|min:0',
            'net_content_unit_id' => 'nullable|exists:units_of_measure,id',
            'stock_quantity'      => 'nullable|numeric|min:0',
            'status'              => 'in:active,inactive,discontinued',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        $optionValueIdsByOptionId = null;
        if ($request->filled('option_value_ids')) {
            $optionValueIdsByOptionId = $request->option_value_ids;

            $ownershipError = $this->validateOptionValueOwnership($productId, $optionValueIdsByOptionId);
            if ($ownershipError) {
                return response()->json(['message' => $ownershipError], 422);
            }

            $derivedKey = $this->deriveCombinationKey(array_values($optionValueIdsByOptionId));
            if ($derivedKey !== $request->combination_key) {
                return response()->json([
                    'message' => "combination_key does not match the submitted option_value_ids. Expected [{$derivedKey}].",
                ], 422);
            }
        }

        try {
            DB::transaction(function () use ($request, $variant, $optionValueIdsByOptionId) {
                $variant->fill($request->only([
                    'sku', 'barcode', 'name', 'net_content_qty',
                    'net_content_unit_id', 'stock_quantity', 'status',
                ]));

                if ($optionValueIdsByOptionId !== null) {
                    $variant->combination_key = $request->combination_key;
                }

                $variant->save();

                if ($optionValueIdsByOptionId !== null) {
                    $variant->syncOptionValues($optionValueIdsByOptionId);
                }
            });

            return response()->json(['variant' => $this->formatVariant($variant->fresh(['units', 'optionValues.option']))], 200);
        } catch (QueryException $e) {
            if ($this->isDuplicateKey($e)) {
                return response()->json(['message' => 'A variant with this exact option combination already exists for this product.'], 422);
            }
            throw $e;
        }
    }

    public function adminDestroyVariant($productId, $variantId)
    {
        $variant = ProductVariant::where('product_id', $productId)->findOrFail($variantId);
        $variant->delete();

        return response()->json(['message' => 'Variant deleted.'], 200);
    }

    public function adminSetDefaultVariant($productId, $variantId)
    {
        $product = Product::findOrFail($productId);
        $variant = $product->productVariants()->findOrFail($variantId);

        DB::transaction(function () use ($product, $variant) {
            $product->productVariants()->where('id', '!=', $variant->id)->update(['is_default' => false]);
            $variant->update(['is_default' => true]);
        });

        return response()->json(['message' => 'Default variant updated.', 'variant' => $this->formatVariant($variant->fresh(['units']))], 200);
    }

    // ========================================
    // VARIANT UNITS
    // ========================================

    public function adminIndexUnits($variantId)
    {
        $variant = ProductVariant::findOrFail($variantId);
        $units   = $variant->units()->with('unit')->get();

        return response()->json(['units' => $units], 200);
    }

    public function adminStoreUnit(Request $request, $variantId)
    {
        $variant = ProductVariant::findOrFail($variantId);

        $validator = Validator::make($request->all(), [
            'unit_id'                  => 'required|exists:units_of_measure,id',
            'role'                     => 'required|in:base,compound,alternate',
            'contains_variant_unit_id' => 'required_if:role,compound|nullable|exists:product_variant_units,id',
            'contains_qty'             => 'required_if:role,compound|nullable|numeric|min:0.0001',
            'base_factor'              => 'nullable|numeric|min:0.0000000001',
            'price'                    => 'nullable|numeric|min:0',
            'compare_at_price'         => 'nullable|numeric|min:0',
            'is_sellable'              => 'boolean',
            'is_purchasable'           => 'boolean',
            'is_default_sale'          => 'boolean',
            'position'                 => 'nullable|integer|min:0',
            'is_active'                => 'boolean',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        $baseFactor = $request->base_factor;

        if ($request->role === ProductVariantUnit::ROLE_COMPOUND) {
            $contains = ProductVariantUnit::find($request->contains_variant_unit_id);

            if (!$contains || $contains->variant_id !== $variant->id) {
                return response()->json(['message' => 'contains_variant_unit_id must belong to the same variant.'], 422);
            }

            // base_factor for a compound row is derived, never hand-entered:
            // 1 of this unit = contains_qty * (the contained unit's own base_factor).
            $derived = round((float) $request->contains_qty * (float) $contains->base_factor, 10);

            if ($baseFactor !== null && abs($baseFactor - $derived) > 0.0000000001) {
                return response()->json([
                    'message' => "base_factor does not match contains_qty × the contained unit's base_factor. Expected [{$derived}].",
                ], 422);
            }

            $baseFactor = $derived;
        } elseif ($request->role === ProductVariantUnit::ROLE_BASE) {
            $baseFactor = 1;
        } elseif ($baseFactor === null) {
            return response()->json(['message' => 'base_factor is required for an alternate unit.'], 422);
        }

        try {
            $unit = $variant->units()->create([
                'unit_id'                  => $request->unit_id,
                'role'                     => $request->role,
                'contains_variant_unit_id' => $request->contains_variant_unit_id,
                'contains_qty'             => $request->contains_qty,
                'base_factor'              => $baseFactor,
                'price'                    => $request->price,
                'compare_at_price'         => $request->compare_at_price,
                'is_sellable'              => $request->boolean('is_sellable', true),
                'is_purchasable'           => $request->boolean('is_purchasable', true),
                'is_default_sale'          => $request->boolean('is_default_sale'),
                'position'                 => $request->position ?? 0,
                'is_active'                => $request->boolean('is_active', true),
            ]);

            return response()->json(['unit' => $unit], 201);
        } catch (QueryException $e) {
            if ($this->isDuplicateKey($e)) {
                return response()->json(['message' => 'This variant already has a unit row for that role/unit — or already has a base unit.'], 422);
            }
            throw $e;
        }
    }

    public function adminUpdateUnit(Request $request, $unitId)
    {
        $unit = ProductVariantUnit::findOrFail($unitId);

        $validator = Validator::make($request->all(), [
            'price'            => 'nullable|numeric|min:0',
            'compare_at_price' => 'nullable|numeric|min:0',
            'is_sellable'      => 'boolean',
            'is_purchasable'   => 'boolean',
            'is_default_sale'  => 'boolean',
            'position'         => 'nullable|integer|min:0',
            'is_active'        => 'boolean',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        // role, unit_id, contains_variant_unit_id, contains_qty, and base_factor are
        // intentionally not editable here — changing them means deleting and
        // recreating the row, so downstream price/stock derivations can't go stale.
        $unit->update($request->only([
            'price', 'compare_at_price', 'is_sellable',
            'is_purchasable', 'is_default_sale', 'position', 'is_active',
        ]));

        return response()->json(['unit' => $unit], 200);
    }

    public function adminDestroyUnit($unitId)
    {
        $unit = ProductVariantUnit::findOrFail($unitId);

        if ($unit->isBase()) {
            return response()->json([
                'message' => 'The base unit cannot be deleted directly — delete the variant, or create a replacement base unit before removing this one.',
            ], 422);
        }

        $referencedByCompound = ProductVariantUnit::where('contains_variant_unit_id', $unit->id)->exists();
        if ($referencedByCompound) {
            return response()->json([
                'message' => 'This unit is used as the base of a compound unit and cannot be deleted.',
            ], 422);
        }

        $unit->delete();

        return response()->json(['message' => 'Unit deleted.'], 200);
    }

    // ========================================
    // IMAGES
    // ========================================

    public function adminIndexImages($productId)
    {
        $product = Product::findOrFail($productId);
        $images  = $product->productImages()->get();

        return response()->json(['images' => $images], 200);
    }

    public function adminStoreImage(Request $request, $productId)
    {
        $product = Product::findOrFail($productId);

        $validator = Validator::make($request->all(), [
            'image'           => 'required_without:image_url|image|mimes:jpeg,png,jpg,webp|max:5120',
            'image_url'       => 'required_without:image|nullable|string',
            'option_value_id' => 'nullable|exists:product_option_values,id',
            'variant_id'      => 'nullable|exists:product_variants,id',
            'alt_text'        => 'nullable|string|max:255',
            'position'        => 'nullable|integer|min:0',
            'is_primary'      => 'boolean',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        $path = $request->image_url;
        if ($request->hasFile('image')) {
            $stored = $request->file('image')->store('products', 'public');
            $path   = '/storage/' . ltrim($stored, '/');
        }

        $image = DB::transaction(function () use ($request, $product, $path) {
            if ($request->boolean('is_primary')) {
                $product->productImages()->update(['is_primary' => false]);
            }

            return $product->productImages()->create([
                'option_value_id' => $request->option_value_id,
                'variant_id'      => $request->variant_id,
                'path'            => $path,
                'alt_text'        => $request->alt_text,
                'position'        => $request->position ?? 0,
                'is_primary'      => $request->boolean('is_primary'),
            ]);
        });

        return response()->json(['image' => $image], 201);
    }

    public function adminUpdateImage(Request $request, $imageId)
    {
        $image = ProductImage::findOrFail($imageId);

        $validator = Validator::make($request->all(), [
            'option_value_id' => 'nullable|exists:product_option_values,id',
            'variant_id'      => 'nullable|exists:product_variants,id',
            'alt_text'        => 'nullable|string|max:255',
            'position'        => 'nullable|integer|min:0',
            'is_primary'      => 'boolean',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        DB::transaction(function () use ($request, $image) {
            if ($request->boolean('is_primary')) {
                ProductImage::where('product_id', $image->product_id)
                    ->where('id', '!=', $image->id)
                    ->update(['is_primary' => false]);
            }

            $image->update($request->only([
                'option_value_id', 'variant_id', 'alt_text', 'position', 'is_primary',
            ]));
        });

        return response()->json(['image' => $image->fresh()], 200);
    }

    public function adminSetPrimaryImage($productId, $imageId)
    {
        $product = Product::findOrFail($productId);
        $image   = $product->productImages()->findOrFail($imageId);

        DB::transaction(function () use ($product, $image) {
            $product->productImages()->where('id', '!=', $image->id)->update(['is_primary' => false]);
            $image->update(['is_primary' => true]);
        });

        return response()->json(['message' => 'Primary image updated.'], 200);
    }

    public function adminDestroyImage($imageId)
    {
        $image = ProductImage::findOrFail($imageId);

        if ($image->path && str_starts_with($image->path, '/storage/')) {
            $storagePath = str_replace('/storage/', '', $image->path);
            if (Storage::disk('public')->exists($storagePath)) {
                Storage::disk('public')->delete($storagePath);
            }
        }

        $image->delete();

        return response()->json(['message' => 'Image deleted.'], 200);
    }

    // ========================================
    // HELPERS
    // ========================================

    /** Sorted, joined option_value ids — must match ProductVariant::combination_key. */
    private function deriveCombinationKey(array $optionValueIds): string
    {
        $ids = array_map('intval', $optionValueIds);
        sort($ids);
        return implode('-', $ids);
    }

    /**
     * Every option_id in the map must be an option belonging to this product,
     * and every option_value_id must belong to that specific option (one
     * value per option — mismatches here would silently corrupt syncOptionValues).
     */
    private function validateOptionValueOwnership($productId, array $optionValueIdsByOptionId): ?string
    {
        foreach ($optionValueIdsByOptionId as $optionId => $valueId) {
            $option = ProductOption::where('product_id', $productId)->find($optionId);
            if (!$option) {
                return "Option [{$optionId}] does not belong to this product.";
            }

            $value = ProductOptionValue::where('option_id', $optionId)->find($valueId);
            if (!$value) {
                return "Option value [{$valueId}] does not belong to option [{$optionId}].";
            }
        }

        return null;
    }

    /** Shapes a variant for API output, always surfacing whether it's actually sellable yet. */
    private function formatVariant(ProductVariant $variant): array
    {
        $data = $variant->toArray();
        $data['has_base_unit'] = $variant->relationLoaded('units')
            ? $variant->units->contains('role', ProductVariantUnit::ROLE_BASE)
            : $variant->baseUnit()->exists();

        return $data;
    }

    private function isDuplicateKey(QueryException $e): bool
    {
        return $e->getCode() === '23000';
    }
}