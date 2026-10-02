<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Books\Ledger;
use App\Models\ServiceSetting;
use App\Services\Books\BooksException;
use App\Services\Books\ServiceFeeService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Services settings: how late a cancellation or a move counts as late, and the defaults of every service fee — its amount and
 * whether a new service starts with it ticked. The amounts are kept on the fee ledgers (Books → Chart of accounts) so there is one place.
 */
class ServiceSettingsController extends Controller
{
    public function show(ServiceFeeService $fees): JsonResponse
    {
        $base = app(\App\Services\CurrencyConversionService::class)->getBaseCurrency();
        $s = ServiceSetting::current();

        return response()->json([
            'settings' => ['cancellation_window_hours' => $s->cancellation_window_hours, 'reschedule_window_hours' => $s->reschedule_window_hours],
            'table_ready' => Schema::hasTable('service_settings'),
            'currency' => $base->code,
            'fees' => $fees->ledgers()->map(fn (Ledger $l) => $fees->optionFromLedger($l, $base))->values(),
        ]);
    }

    public function update(Request $request, ServiceFeeService $svc): JsonResponse
    {
        $d = $request->validate([
            'settings.cancellation_window_hours' => 'nullable|integer|min:0|max:8760', 'settings.reschedule_window_hours' => 'nullable|integer|min:0|max:8760',
            'fees' => 'nullable|array', 'fees.*.ledger_id' => 'required|integer|exists:ledgers,id', 'fees.*.amount' => 'nullable|numeric|min:0', 'fees.*.default_on' => 'nullable|boolean',
        ]);
        try {
            $valid = $svc->ledgers()->keyBy('id');
            DB::transaction(function () use ($d, $valid, $request) {
                if (! empty($d['settings'])) {
                    if (! Schema::hasTable('service_settings')) {
                        throw new BooksException('Run script 59_service_settings.sql before saving the cancellation and reschedule windows.');
                    }
                    $row = ServiceSetting::current();
                    $row->fill(array_filter($d['settings'], fn ($v) => $v !== null) + ['updated_by' => $request->user()?->id, 'updated_at' => now()])->save();
                }
                foreach ($d['fees'] ?? [] as $f) {
                    $l = $valid->get((int) $f['ledger_id']) ?? throw new BooksException('One of the fees is not a service fee any more. Reload the page.');
                    if (array_key_exists('amount', $f) && $f['amount'] !== null) {
                        if ($l->rate_type === 'percent' && (float) $f['amount'] > 100) {
                            throw new BooksException("{$l->name} is a percentage and cannot be more than 100.");
                        }
                        $l->rate_value = (float) $f['amount'];
                    }
                    if (array_key_exists('default_on', $f)) {
                        $l->settings = array_merge($l->settings ?? [], ['default_on' => (bool) $f['default_on']]);
                    }
                    $l->save();
                }
            });
        } catch (BooksException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        return response()->json($this->show($svc)->getData(true) + ['message' => 'Services settings saved.']);
    }
}
