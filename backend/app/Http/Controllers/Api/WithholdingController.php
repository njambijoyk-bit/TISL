<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Customer;
use App\Models\WithholdingClassification;
use App\Models\WithholdingCertificate;
use App\Models\WithholdingCredit;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Validator;
use InvalidArgumentException;

class WithholdingController extends Controller
{
    // ========================================
    // CLASSIFICATIONS
    // ========================================

    public function adminIndexClassifications(Request $request)
    {
        $query = WithholdingClassification::with('defaultTaxRate');

        if ($request->has('active')) {
            $query->where('is_active', filter_var($request->active, FILTER_VALIDATE_BOOLEAN));
        }

        return response()->json(['classifications' => $query->get()], 200);
    }

    public function adminStoreClassification(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'code'                => 'required|string|max:50|unique:withholding_classifications,code',
            'label'               => 'required|string|max:150',
            'default_tax_rate_id' => 'nullable|exists:tax_rates,id',
            'is_active'           => 'boolean',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        $classification = WithholdingClassification::create($request->only(['code', 'label', 'default_tax_rate_id'])
            + ['is_active' => $request->boolean('is_active', true)]);

        return response()->json(['classification' => $classification], 201);
    }

    public function adminUpdateClassification(Request $request, $id)
    {
        $classification = WithholdingClassification::findOrFail($id);

        $validator = Validator::make($request->all(), [
            'code'                => 'sometimes|required|string|max:50|unique:withholding_classifications,code,' . $id,
            'label'               => 'sometimes|required|string|max:150',
            'default_tax_rate_id' => 'nullable|exists:tax_rates,id',
            'is_active'           => 'boolean',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        $classification->update($request->only(['code', 'label', 'default_tax_rate_id', 'is_active']));

        return response()->json(['classification' => $classification], 200);
    }

    public function adminDestroyClassification($id)
    {
        $classification = WithholdingClassification::findOrFail($id);

        // customers.withholding_classification_id is ON DELETE SET NULL — deletion
        // itself won't break, but it silently strips a customer's withholding
        // profile, so warn rather than let that happen quietly.
        if ($classification->customers()->exists()) {
            return response()->json([
                'message' => 'This classification is assigned to one or more customers and cannot be deleted. Deactivate it instead.',
            ], 422);
        }

        $classification->delete();

        return response()->json(['message' => 'Classification deleted.'], 200);
    }

    // ========================================
    // CUSTOMER WITHHOLDING PROFILE
    // ========================================

    /**
     * Mark a customer as a withholding agent (they deduct WHT when paying TISL)
     * and set which classification/rate applies. Finance-only route.
     * Being an agent only takes effect once they also hold a verified
     * withholding_agent certificate (Customer::isVerifiedWithholdingAgent()).
     */
    public function adminUpdateCustomerProfile(Request $request, $customerId)
    {
        $customer = Customer::findOrFail($customerId);

        $validator = Validator::make($request->all(), [
            'is_withholding_agent'          => 'required|boolean',
            'withholding_classification_id' => 'nullable|required_if:is_withholding_agent,true|exists:withholding_classifications,id,is_active,1',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        $isAgent = $request->boolean('is_withholding_agent');

        $customer->update([
            'is_withholding_agent'          => $isAgent,
            // Not an agent → no classification, so nothing can be withheld by accident.
            'withholding_classification_id' => $isAgent ? $request->withholding_classification_id : null,
        ]);

        $customer->load('withholdingClassification');

        return response()->json([
            'customer' => [
                'id'                            => $customer->id,
                'is_withholding_agent'          => $customer->is_withholding_agent,
                'withholding_classification_id' => $customer->withholding_classification_id,
                'withholding_classification'    => $customer->withholdingClassification,
            ],
        ], 200);
    }

    // ========================================
    // CERTIFICATES
    // ========================================

    public function adminIndexCertificates(Request $request)
    {
        $query = WithholdingCertificate::with(['customer', 'taxApplication', 'credit']);

        if ($request->filled('customer_id')) {
            $query->forCustomer($request->customer_id);
        }

        if ($request->filled('status')) {
            $query->where('status', $request->status);
        }

        $perPage = $request->get('per_page', 20);

        return response()->json($query->orderByDesc('created_at')->paginate($perPage), 200);
    }

    public function adminShowCertificate($id)
    {
        $certificate = WithholdingCertificate::with(['customer', 'taxApplication', 'authorizingCertificate', 'credit.clearances'])
            ->findOrFail($id);

        return response()->json(['certificate' => $certificate], 200);
    }

    /**
     * Manual creation — normally a certificate is generated automatically
     * alongside a withheld TaxApplication (by TaxService). This exists for
     * backfill/correction only.
     */
    public function adminStoreCertificate(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'tax_application_id'         => 'required|exists:tax_applications,id|unique:withholding_certificates,tax_application_id',
            'customer_id'                => 'required|exists:customers,id',
            'authorizing_certificate_id' => 'nullable|exists:tax_legitimacy_certificates,id',
            'certificate_number'         => 'required|string|max:100|unique:withholding_certificates,certificate_number',
            'gross_amount'               => 'required|numeric|min:0',
            'withheld_amount'            => 'required|numeric|min:0',
            'net_amount'                 => 'required|numeric|min:0',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        $certificate = WithholdingCertificate::create($request->only([
            'tax_application_id', 'customer_id', 'authorizing_certificate_id',
            'certificate_number', 'gross_amount', 'withheld_amount', 'net_amount',
        ]));

        if (!$certificate->amountsBalance()) {
            $certificate->delete();
            return response()->json(['message' => 'net_amount must equal gross_amount minus withheld_amount.'], 422);
        }

        return response()->json(['certificate' => $certificate], 201);
    }

    public function adminMarkIssued(Request $request, $id)
    {
        $certificate = WithholdingCertificate::findOrFail($id);

        $validator = Validator::make($request->all(), [
            'document' => 'nullable|file|mimes:pdf,jpg,jpeg,png|max:5120',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        $documentPath = null;
        if ($request->hasFile('document')) {
            $stored = $request->file('document')->store('withholding-certificates', 'public');
            $documentPath = '/storage/' . ltrim($stored, '/');
        }

        $certificate->markIssued($documentPath);

        return response()->json(['certificate' => $certificate->fresh()], 200);
    }

    public function adminMarkReceived($id)
    {
        $certificate = WithholdingCertificate::findOrFail($id);
        $certificate->markReceived();

        return response()->json(['certificate' => $certificate->fresh()], 200);
    }

    // ========================================
    // CREDITS
    // ========================================

    public function adminIndexCredits(Request $request)
    {
        $query = WithholdingCredit::with(['certificate', 'customer']);

        if ($request->filled('customer_id')) {
            $query->forCustomer($request->customer_id);
        }

        if ($request->filled('status')) {
            $query->where('status', $request->status);
        }

        if ($request->boolean('outstanding_only')) {
            $query->outstanding();
        }

        $perPage = $request->get('per_page', 20);

        return response()->json($query->orderByDesc('created_at')->paginate($perPage), 200);
    }

    public function adminShowCredit($id)
    {
        $credit = WithholdingCredit::with(['certificate', 'customer', 'clearances.clearedBy'])->findOrFail($id);

        return response()->json(['credit' => $credit], 200);
    }

    /** One credit per certificate — normally created alongside it. This exists for backfill. */
    public function adminStoreCredit(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'withholding_certificate_id' => 'required|exists:withholding_certificates,id|unique:withholding_credits,withholding_certificate_id',
            'customer_id'                => 'required|exists:customers,id',
            'amount'                     => 'required|numeric|min:0',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        $credit = WithholdingCredit::create($request->only(['withholding_certificate_id', 'customer_id', 'amount']));

        return response()->json(['credit' => $credit], 201);
    }

    public function adminApplyClearance(Request $request, $id)
    {
        $credit = WithholdingCredit::findOrFail($id);

        $validator = Validator::make($request->all(), [
            'amount'     => 'required|numeric|min:0.01',
            'cleared_on' => 'nullable|date',
            'reference'  => 'nullable|string|max:100',
            'notes'      => 'nullable|string|max:255',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        try {
            $clearance = $credit->applyClearance(
                amount: (float) $request->amount,
                clearedOn: $request->cleared_on,
                reference: $request->reference,
                notes: $request->notes,
                clearedBy: Auth::id(),
            );

            return response()->json([
                'clearance' => $clearance,
                'credit'    => $credit->fresh(),
            ], 201);
        } catch (InvalidArgumentException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }
    }

    public function adminWriteOff(Request $request, $id)
    {
        $credit = WithholdingCredit::findOrFail($id);

        $validator = Validator::make($request->all(), [
            'reason' => 'nullable|string|max:255',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        $credit->writeOff($request->reason);

        return response()->json(['credit' => $credit->fresh()], 200);
    }

    public function adminIndexClearances($creditId)
    {
        $credit     = WithholdingCredit::findOrFail($creditId);
        $clearances = $credit->clearances()->with('clearedBy')->orderByDesc('created_at')->get();

        return response()->json(['clearances' => $clearances], 200);
    }
}