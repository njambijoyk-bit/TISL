<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Vendor;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\HttpFoundation\Response;

/** Shows one page of a vendor's certificate through a signed, short-lived link. Only the re-drawn JPEG is ever served. */
class VendorScanController extends Controller
{
    public function show(int $vendor, int $n): Response
    {
        $path = Vendor::findOrFail($vendor)->special_group_scans[$n] ?? null;
        abort_unless($path && Storage::disk('local')->exists($path), 404);

        return response(Storage::disk('local')->get($path), 200, [
            'Content-Type' => 'image/jpeg', 'Content-Disposition' => 'inline; filename="certificate-' . ($n + 1) . '.jpg"',
            'X-Content-Type-Options' => 'nosniff', 'Cache-Control' => 'private, max-age=600',
            'Content-Security-Policy' => "default-src 'none'; img-src 'self'; sandbox",
        ]);
    }
}
