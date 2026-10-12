<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Courses\Certificate;
use App\Services\Books\BooksException;
use App\Services\Courses\CertificateService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;

/** A student's certificates and their PDF; and the public check of a certificate by its signed code (shows only the name, the course and whether it is valid). */
class CoursesCertificateController extends Controller
{
    public function __construct(private CertificateService $certificates)
    {
    }

    public function mine(Request $request): JsonResponse
    {
        return response()->json(['certificates' => $this->certificates->mine($request->user())]);
    }

    public function pdf(Request $request, int $cert): Response|JsonResponse
    {
        abort_unless(CertificateService::installed(), 422, 'Run database script 159_courses_certificates.sql first.');
        $c = Certificate::findOrFail($cert);
        abort_unless($this->certificates->mayOpen($request->user(), $c), 404);   // not 403: a stranger learns nothing about which numbers exist
        try {
            return response($this->certificates->pdf($c), 200, ['Content-Type' => 'application/pdf', 'Content-Disposition' => 'inline; filename="'.$c->number.'.pdf"', 'Cache-Control' => 'private, no-store']);
        } catch (BooksException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }
    }

    public function verify(string $code): JsonResponse
    {
        $r = $this->certificates->verify($code);

        return $r ? response()->json($r) : response()->json(['message' => 'This code is not a genuine certificate code.'], 404);
    }
}
