<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Extras\Tender;
use App\Models\Extras\TenderDocument;
use App\Models\Vendor;
use App\Models\VendorOrder;
use App\Services\Tenders\TenderListing;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\URL;

/**
 * The vendor's own side of the website (Extras): the tenders they may see (public, vendors-only, invited and pre-qualified ones), their pre-qualification
 * status, their orders and their profile. Bidding happens offline, so there are no bids here.
 */
class VendorPortalController extends Controller
{
    public function __construct(private TenderListing $listing) {}

    // =========================================================================
    // DASHBOARD
    // =========================================================================

    public function dashboard(Request $request): JsonResponse
    {
        $vendor = $this->vendor($request);

        $visibleOpen = fn () => Tender::visibleTo($vendor)->open();

        return response()->json([
            'vendor'             => $vendor->only(['id', 'vendor_number', 'company_name', 'status', 'is_verified', 'special_group']),
            'open_tenders'       => $visibleOpen()->count(),
            'restricted_tenders' => $visibleOpen()->where('visibility', '!=', 'public')->count(),
            'prequalifications'  => $vendor->prequalifications()->current()->orderBy('category')->get(['category', 'valid_until']),
            'vendor_orders'      => $vendor->vendorOrders()->count(),
        ]);
    }

    // =========================================================================
    // TENDERS
    // =========================================================================

    public function tenders(Request $request): JsonResponse
    {
        $vendor = $this->vendor($request);
        $d = $request->validate(TenderListing::rules());
        $d['tab'] = $d['tab'] ?? 'active';
        $base = fn () => Tender::visibleTo($vendor);

        $page = $this->listing->withRowData($this->listing->sort($this->listing->filter($base(), $d), $d))->paginate((int) ($d['per_page'] ?? 25));

        return response()->json([
            'rows'   => $page->getCollection()->map(fn (Tender $t) => $this->listing->row($t))->values(),
            'meta'   => ['total' => $page->total(), 'page' => $page->currentPage(), 'per_page' => $page->perPage(), 'last_page' => $page->lastPage()],
            'counts' => $this->listing->counts($base),
        ]);
    }

    /** The filtered list (including the Restricted tab) as a spreadsheet. */
    public function exportTenders(Request $request): \Symfony\Component\HttpFoundation\BinaryFileResponse
    {
        $vendor = $this->vendor($request);
        $d = $request->validate(TenderListing::rules());
        $d['allow_restricted'] = true;

        return $this->listing->spreadsheet(Tender::visibleTo($vendor), $d);
    }

    public function showTender(Request $request, string $ref): JsonResponse
    {
        $vendor = $this->vendor($request);
        $t = $this->listing->withRowData(Tender::visibleTo($vendor)->bySlug($ref))->firstOrFail();

        return response()->json($this->listing->detail($t));
    }

    /** A ten-minute link that opens or downloads one file of a tender this vendor may see (a browser tab cannot send the sign-in header). */
    public function documentLink(Request $request, string $ref, int $docId): JsonResponse
    {
        $vendor = $this->vendor($request);
        $t = Tender::visibleTo($vendor)->bySlug($ref)->firstOrFail();
        $doc = TenderDocument::where('tender_id', $t->id)->findOrFail($docId);

        return response()->json(['url' => URL::temporarySignedRoute('tender-files.show', now()->addMinutes(10), ['doc' => $doc->id, 'inline' => $request->boolean('inline') ? 1 : 0])]);
    }

    // =========================================================================
    // PRE-QUALIFICATION (as staff recorded it)
    // =========================================================================

    public function prequalifications(Request $request): JsonResponse
    {
        $vendor = $this->vendor($request);

        return response()->json(['rows' => $vendor->prequalifications()->orderByDesc('created_at')->get(['id', 'category', 'status', 'qualified_from', 'valid_until', 'reason'])]);
    }

    // =========================================================================
    // VENDOR ORDERS (read-only)
    // =========================================================================

    public function orders(Request $request): JsonResponse
    {
        $vendor = $this->vendor($request);

        $rows = VendorOrder::where('vendor_id', $vendor->id)
            ->orderByDesc('created_at')
            ->limit(100)
            ->get(['id', 'po_number', 'status', 'currency', 'total', 'expected_delivery_date', 'created_at']);

        return response()->json(['rows' => $rows]);
    }

    public function showOrder(Request $request, int $id): JsonResponse
    {
        $vendor = $this->vendor($request);

        $order = VendorOrder::with('items')
            ->where('vendor_id', $vendor->id)
            ->findOrFail($id);

        return response()->json($order);
    }

    // =========================================================================
    // PROFILE
    // =========================================================================

    public function profile(Request $request): JsonResponse
    {
        return response()->json($this->vendor($request));
    }

    public function updateProfile(Request $request): JsonResponse
    {
        $vendor = $this->vendor($request);

        $d = $request->validate([
            'contact_name'    => 'sometimes|string|max:255',
            'phone'           => 'sometimes|string|max:50',
            'alternate_phone' => 'nullable|string|max:50',
            'website'         => 'nullable|url|max:255',
            'address'         => 'nullable|string',
            'city'            => 'nullable|string|max:100',
            'country'         => 'nullable|string|max:100',
            'bank_details'    => 'nullable|array',
        ]);

        $vendor->update($d);

        return response()->json(['message' => 'Profile updated.']);
    }

    // =========================================================================
    // HELPERS
    // =========================================================================

    private function vendor(Request $request): Vendor
    {
        $user = $request->user();
        $vendor = Vendor::where('user_id', $user->id)->firstOrFail();
        abort_if($vendor->status === 'suspended', 403, 'Your vendor account is suspended. Please contact us.');

        return $vendor;
    }
}
