<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Customer;
use App\Services\Books\OrderSummaryService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** A customer's orders and what they have ordered, for the customer screen in admin. Orders are Sales Order vouchers. */
class CustomerOrderController extends Controller
{
    public function __construct(private OrderSummaryService $orders) {}

    /** GET /admin/customers/{customerId}/orders */
    public function index(Request $request, int $customerId): JsonResponse
    {
        Customer::findOrFail($customerId);

        return response()->json($this->orders->pageForCustomer($customerId, (int) $request->get('per_page', 15)));
    }

    /** GET /admin/order-options?customer_id=&q=: orders to pick from when linking a project or task. */
    public function options(Request $request): JsonResponse
    {
        $customer = $request->filled('customer_id') ? $request->integer('customer_id') : null;

        return response()->json(['data' => $this->orders->options($request->query('q'), $customer, 100)]);
    }

    /** GET /admin/customers/{customerId}/order-statistics */
    public function statistics(int $customerId): JsonResponse
    {
        Customer::findOrFail($customerId);

        return response()->json($this->orders->statsForCustomer($customerId));
    }
}
