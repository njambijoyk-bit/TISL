<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Books\Voucher;
use App\Models\Books\VoucherType;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Turns a document number from a customer's address bar (WNKJ-SO-00019) into the record's id, for that customer's own orders and quotations only.
 * The pages then carry on with the id, so the addresses show the number and never the internal id.
 */
class CustomerDocumentRefController extends Controller
{
    public function resolve(Request $request): JsonResponse
    {
        $d = $request->validate(['number' => ['required', 'string', 'max:60', 'regex:/^[A-Za-z0-9._\-\/]+$/']]);
        $customerId = $request->user()?->customer?->id;
        $v = $customerId ? Voucher::where('voucher_number', $d['number'])->where('customer_id', $customerId)
            ->whereHas('type', fn ($t) => $t->whereIn('base_type', [VoucherType::SALES_ORDER, VoucherType::QUOTATION]))->first(['id', 'voucher_type_id']) : null;
        abort_unless($v, 404, 'Document not found.');

        return response()->json(['id' => $v->id, 'kind' => $v->type?->base_type]);
    }
}
