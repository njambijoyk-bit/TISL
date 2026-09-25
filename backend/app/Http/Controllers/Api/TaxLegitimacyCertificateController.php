<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\TaxLegitimacyCertificate;
use App\Models\Customer;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\Validator;

class TaxLegitimacyCertificateController extends Controller
{
    /** Whitelist of holder_type aliases the client may send — never accept a raw class string. */
    private const HOLDER_MODELS = [
        'customer' => Customer::class,
    ];

    public function adminIndex(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'holder_type' => 'nullable|in:' . implode(',', array_keys(self::HOLDER_MODELS)),
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        $query = TaxLegitimacyCertificate::with('verifiedBy');

        if ($request->filled('holder_type')) {
            $query->where('holder_type', self::HOLDER_MODELS[$request->holder_type]);
        }

        if ($request->filled('holder_id')) {
            $query->where('holder_id', $request->holder_id);
        }

        if ($request->filled('certificate_type')) {
            $query->where('certificate_type', $request->certificate_type);
        }

        if ($request->filled('status')) {
            $query->where('status', $request->status);
        }

        $perPage = $request->get('per_page', 20);

        return response()->json($query->orderByDesc('created_at')->paginate($perPage), 200);
    }

    public function adminShow($id)
    {
        $certificate = TaxLegitimacyCertificate::with(['holder', 'verifiedBy', 'applicability', 'withholdingCertificates'])
            ->findOrFail($id);

        return response()->json(['certificate' => $certificate], 200);
    }

    public function adminStore(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'holder_type'        => 'required|in:' . implode(',', array_keys(self::HOLDER_MODELS)),
            'holder_id'          => 'required|integer',
            'certificate_type'   => 'required|in:exemption,withholding_agent',
            'certificate_number' => 'required|string|max:100|unique:tax_legitimacy_certificates,certificate_number',
            'issuing_authority'  => 'nullable|string|max:150',
            'classification'     => 'nullable|string|max:50',
            'issued_at'          => 'required|date',
            'valid_until'        => 'nullable|date|after_or_equal:issued_at',
            'document'           => 'nullable|file|mimes:pdf,jpg,jpeg,png|max:5120',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        $modelClass = self::HOLDER_MODELS[$request->holder_type];
        $holder     = $modelClass::findOrFail($request->holder_id);

        $documentPath = null;
        if ($request->hasFile('document')) {
            $stored = $request->file('document')->store('tax-legitimacy-certificates', 'public');
            $documentPath = '/storage/' . ltrim($stored, '/');
        }

        // Always created pending_verification — verify()/revoke() are the only
        // path to a status change, so a newly-submitted certificate can't be
        // treated as legitimate before someone actually checks it.
        $certificate = TaxLegitimacyCertificate::create([
            'holder_type'        => $holder->getMorphClass(),
            'holder_id'          => $holder->getKey(),
            'certificate_type'   => $request->certificate_type,
            'certificate_number' => $request->certificate_number,
            'issuing_authority'  => $request->issuing_authority,
            'classification'     => $request->classification,
            'issued_at'          => $request->issued_at,
            'valid_until'        => $request->valid_until,
            'document_path'      => $documentPath,
            'status'             => TaxLegitimacyCertificate::STATUS_PENDING,
        ]);

        return response()->json(['certificate' => $certificate], 201);
    }

    public function adminUpdate(Request $request, $id)
    {
        $certificate = TaxLegitimacyCertificate::findOrFail($id);

        $validator = Validator::make($request->all(), [
            'issuing_authority' => 'nullable|string|max:150',
            'classification'    => 'nullable|string|max:50',
            'valid_until'       => 'nullable|date',
            'document'          => 'nullable|file|mimes:pdf,jpg,jpeg,png|max:5120',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        // certificate_number, certificate_type, holder, and issued_at are the
        // identity of the certificate — editing them post-creation would mean
        // silently changing what was verified. status only ever changes through
        // verify()/revoke(), never a plain field update.
        $certificate->fill($request->only(['issuing_authority', 'classification', 'valid_until']));

        if ($request->hasFile('document')) {
            $stored = $request->file('document')->store('tax-legitimacy-certificates', 'public');
            $certificate->document_path = '/storage/' . ltrim($stored, '/');
        }

        $certificate->save();

        return response()->json(['certificate' => $certificate], 200);
    }

    public function adminVerify($id)
    {
        $certificate = TaxLegitimacyCertificate::findOrFail($id);
        $certificate->verify(Auth::id());

        return response()->json(['certificate' => $certificate->fresh()], 200);
    }

    public function adminRevoke(Request $request, $id)
    {
        $certificate = TaxLegitimacyCertificate::findOrFail($id);

        $validator = Validator::make($request->all(), [
            'reason' => 'nullable|string|max:255',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        $certificate->revoke($request->reason);

        return response()->json(['certificate' => $certificate->fresh()], 200);
    }

    public function adminDestroy($id)
    {
        $certificate = TaxLegitimacyCertificate::findOrFail($id);

        if ($certificate->status === TaxLegitimacyCertificate::STATUS_VERIFIED) {
            return response()->json([
                'message' => 'A verified certificate cannot be deleted — revoke it instead so the history is preserved.',
            ], 422);
        }

        if ($certificate->document_path && str_starts_with($certificate->document_path, '/storage/')) {
            $storagePath = str_replace('/storage/', '', $certificate->document_path);
            if (Storage::disk('public')->exists($storagePath)) {
                Storage::disk('public')->delete($storagePath);
            }
        }

        $certificate->delete();

        return response()->json(['message' => 'Certificate deleted.'], 200);
    }
}
