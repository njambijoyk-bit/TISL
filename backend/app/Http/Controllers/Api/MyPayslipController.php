<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\Books\BooksException;
use App\Services\Payroll\PayrollService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** A staff member's own payslips. Only their own, only for runs that have been approved or paid; nothing about anyone else's pay. */
class MyPayslipController extends Controller
{
    public function __construct(private PayrollService $svc) {}

    public function index(Request $request): JsonResponse
    {
        return response()->json(['table_ready' => PayrollService::ready(), 'rows' => $this->svc->payslipsFor($request->user())]);
    }

    public function show(Request $request, int $runId): JsonResponse
    {
        try {
            return response()->json($this->svc->payslipOf($request->user(), $runId));
        } catch (BooksException $e) {
            return response()->json(['message' => $e->getMessage()], 404);
        }
    }
}
