<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Currency;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Validation\Rule;

class CurrencyController extends Controller
{
    /**
     * Get all currencies
     */
    public function index()
    {
        $currencies = Currency::orderBy('is_base', 'desc')
            ->orderBy('code', 'asc')
            ->get();

        return response()->json($currencies);
    }

    /**
     * Get base currency
     */
    public function getBaseCurrency()
    {
        $baseCurrency = Currency::where('is_base', true)->first();

        if (!$baseCurrency) {
            return response()->json(['message' => 'No base currency set'], 404);
        }

        return response()->json($baseCurrency);
    }

    /**
     * Set base currency
     */
    public function setBaseCurrency(Request $request)
    {
        $request->validate([
            'currency_id' => 'required|exists:currencies,id'
        ]);

        try {
            $currency = Currency::setBaseCurrency($request->currency_id);

            return response()->json([
                'message' => 'Base currency updated successfully',
                'data' => $currency
            ]);
        } catch (\Exception $e) {
            return response()->json(['message' => $e->getMessage()], 400);
        }
    }

    public function updateAnchorRate(Request $request, $id)
    {
        $currency = Currency::findOrFail($id);

        $request->validate([
            'anchor_rate' => 'required|numeric|min:0.00000001',
        ]);

        // Optional: lock USD so it's always 1
        if (strtoupper($currency->code) === 'USD') {
            return response()->json([
                'message' => 'USD anchor rate is fixed at 1.0'
            ], 400);
        }

        DB::transaction(function () use ($currency, $request) {
            $currency->update([
                'anchor_rate' => $request->anchor_rate
            ]);

            // Recalc derived conversion rates based on current base
            $base = Currency::getBaseCurrency();
            if ($base) {
                Currency::recalcRatesForBase($base);
            }
        });

        return response()->json([
            'message' => 'Anchor rate updated successfully',
            'data' => Currency::findOrFail($id)
        ]);
    }

    /**
     * Create a new currency
     */
    public function store(Request $request)
    {
        $request->validate([
            'code' => 'required|string|size:3|unique:currencies,code',
            'name' => 'required|string|max:100',
            'symbol' => 'required|string|max:10',
            'anchor_rate' => 'required|numeric|min:0.00000001',
            'conversion_rate' => 'required|numeric|min:0.00000001',
            'is_active' => 'boolean'
        ]);

        $base = Currency::getBaseCurrency();

        $currency = Currency::create([
            'code' => strtoupper($request->code),
            'name' => $request->name,
            'symbol' => $request->symbol,
            'anchor_rate' => $request->anchor_rate,
            'is_active' => $request->is_active ?? true,
            'is_base' => false,
            'conversion_rate' => $base ? ((float)$request->anchor_rate / (float)$base->anchor_rate) : 1.0,
        ]);

        return response()->json([
            'message' => 'Currency created successfully',
            'data' => $currency
        ], 201);
    }

    /**
     * Update currency
     */
    public function update(Request $request, $id)
    {
        $currency = Currency::findOrFail($id);

        $request->validate([
            'code' => ['sometimes', 'string', 'size:3', Rule::unique('currencies')->ignore($id)],
            'name' => 'sometimes|string|max:100',
            'symbol' => 'sometimes|string|max:10',
            'anchor_rate' => 'sometimes|numeric|min:0.00000001',
            'is_active' => 'sometimes|boolean'
        ]);

        $currency->update($request->only([
            'code',
            'name',
            'symbol',
            'anchor_rate',
            'is_active'
        ]));

        // If anchor_rate changed, derived rates must be refreshed (especially if base was edited)
        if ($request->has('anchor_rate')) {
            $base = Currency::getBaseCurrency();
            if ($base) {
                Currency::recalcRatesForBase($base);
            }
        }

        return response()->json([
            'message' => 'Currency updated successfully',
            'data' => Currency::findOrFail($id)
        ]);
    }

    /**
     * Toggle currency status
     */
    public function toggleStatus(Request $request, $id)
    {
        $currency = Currency::findOrFail($id);

        $request->validate([
            'is_active' => 'required|boolean'
        ]);

        $currency->update(['is_active' => $request->is_active]);

        return response()->json([
            'message' => 'Currency status updated successfully',
            'data' => $currency
        ]);
    }

    /**
     * Delete currency
     */
    public function destroy($id)
    {
        $currency = Currency::findOrFail($id);

        if ($currency->is_base) {
            return response()->json([
                'message' => 'Cannot delete base currency'
            ], 400);
        }

        $currency->delete();

        return response()->json([
            'message' => 'Currency deleted successfully'
        ]);
    }

    /**
     * Convert amount between currencies
     */
    public function convert(Request $request)
    {
        $request->validate([
            'from_currency_id' => 'required|exists:currencies,id',
            'to_currency_id' => 'required|exists:currencies,id',
            'amount' => 'required|numeric|min:0'
        ]);

        $fromCurrency = Currency::findOrFail($request->from_currency_id);
        $toCurrency = Currency::findOrFail($request->to_currency_id);

        $convertedAmount = $fromCurrency->convertTo($toCurrency, $request->amount);

        return response()->json([
            'from' => [
                'currency' => $fromCurrency->code,
                'amount' => $request->amount,
                'formatted' => $fromCurrency->formatAmount($request->amount)
            ],
            'to' => [
                'currency' => $toCurrency->code,
                'amount' => $convertedAmount,
                'formatted' => $toCurrency->formatAmount($convertedAmount)
            ],
            'rate' => $toCurrency->conversion_rate / $fromCurrency->conversion_rate
        ]);
    }
}