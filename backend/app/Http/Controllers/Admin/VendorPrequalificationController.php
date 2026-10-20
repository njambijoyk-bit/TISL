<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Extras\VendorPrequalification;
use App\Models\Vendor;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Pre-qualification as staff record it: a vendor sends the filled and scanned document by email or another channel, staff decide offline, then record the result here.
 * Every approval, refusal and revocation needs a written reason, kept with the name of the person and the time.
 */
class VendorPrequalificationController extends Controller
{
    private function row(VendorPrequalification $p): array
    {
        return [
            'id' => $p->id, 'vendor_id' => $p->vendor_id, 'vendor' => $p->relationLoaded('vendor') ? $p->vendor?->only(['id', 'vendor_number', 'company_name']) : null,
            'category' => $p->category, 'status' => $p->status, 'current' => $p->isCurrent(), 'qualified_from' => $p->qualified_from?->toDateString(), 'valid_until' => $p->valid_until?->toDateString(),
            'reason' => $p->reason, 'notes' => $p->notes, 'recorded_by' => $p->recorder?->name, 'created_at' => $p->created_at,
        ];
    }

    /** Everyone's records, newest first; `expiring` = within that many days. */
    public function index(Request $request): JsonResponse
    {
        $d = $request->validate([
            'status'   => 'nullable|in:qualified,refused,revoked',
            'category' => 'nullable|in:' . implode(',', VendorPrequalification::CATEGORIES),
            'search'   => 'nullable|string|max:80',
            'expiring' => 'nullable|integer|min:1|max:365',
        ]);

        $rows = VendorPrequalification::with(['vendor:id,vendor_number,company_name', 'recorder:id,name'])
            ->when(! empty($d['status']), fn ($q) => $q->where('status', $d['status']))
            ->when(! empty($d['category']), fn ($q) => $q->where('category', $d['category']))
            ->when(! empty($d['expiring']), fn ($q) => $q->current()->whereNotNull('valid_until')->where('valid_until', '<=', now()->addDays((int) $d['expiring'])->toDateString()))
            ->when(! empty($d['search']), fn ($q) => $q->whereHas('vendor', fn ($v) => $v->where('company_name', 'like', "%{$d['search']}%")->orWhere('vendor_number', 'like', "%{$d['search']}%")))
            ->orderByDesc('created_at')
            ->limit(300)
            ->get();

        return response()->json(['rows' => $rows->map(fn ($p) => $this->row($p))->values()]);
    }

    public function forVendor(int $vendorId): JsonResponse
    {
        Vendor::findOrFail($vendorId);
        $rows = VendorPrequalification::with('recorder:id,name')->where('vendor_id', $vendorId)->orderByDesc('created_at')->get();

        return response()->json(['rows' => $rows->map(fn ($p) => $this->row($p))->values()]);
    }

    /** Body: category, status (qualified | refused), qualified_from?, valid_until (needed when qualified), reason, notes?. */
    public function store(Request $request, int $vendorId): JsonResponse
    {
        Vendor::findOrFail($vendorId);
        $d = $request->validate([
            'category'       => 'required|in:' . implode(',', VendorPrequalification::CATEGORIES),
            'status'         => 'required|in:qualified,refused',
            'qualified_from' => 'nullable|date',
            'valid_until'    => 'required_if:status,qualified|nullable|date|after_or_equal:qualified_from',
            'reason'         => 'required|string|min:5|max:2000',
            'notes'          => 'nullable|string|max:2000',
        ], ['reason.required' => 'Write why: every decision needs a reason.', 'reason.min' => 'Write why: every decision needs a reason.']);

        $p = VendorPrequalification::create($d + ['vendor_id' => $vendorId, 'qualified_from' => $d['qualified_from'] ?? now()->toDateString(), 'recorded_by' => $request->user()->id]);

        return response()->json(['message' => $d['status'] === 'qualified' ? 'Pre-qualification recorded.' : 'Refusal recorded.', 'id' => $p->id], 201);
    }

    /** Body: reason (required), and any of status (revoked), valid_until (extend), notes. The earlier reason is kept in the notes. */
    public function update(Request $request, int $id): JsonResponse
    {
        $p = VendorPrequalification::findOrFail($id);
        $d = $request->validate([
            'status'      => 'sometimes|in:qualified,revoked',
            'valid_until' => 'sometimes|nullable|date',
            'notes'       => 'nullable|string|max:2000',
            'reason'      => 'required|string|min:5|max:2000',
        ], ['reason.required' => 'Write why: every change needs a reason.', 'reason.min' => 'Write why: every change needs a reason.']);

        $history = trim((string) $p->notes . "\n[" . now()->format('Y-m-d H:i') . ' ' . ($request->user()->name ?? 'staff') . '] Earlier reason: ' . $p->reason);
        $p->update(collect($d)->except('notes')->all() + ['notes' => array_key_exists('notes', $d) && $d['notes'] ? $d['notes'] . "\n" . $history : $history, 'recorded_by' => $request->user()->id]);

        return response()->json(['message' => 'Pre-qualification updated.']);
    }
}
