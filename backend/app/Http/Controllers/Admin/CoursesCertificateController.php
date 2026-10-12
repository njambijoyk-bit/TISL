<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Courses\Certificate;
use App\Models\Courses\Enrolment;
use App\Models\Courses\Offering;
use App\Services\Books\BooksException;
use App\Services\Courses\CertificateService;
use App\Services\Courses\CourseAccess;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** Courses → certificates of an offering: who has one, give one by exception, give them to those who finished earlier, revoke, renew. A manager does any offering, a teacher their own. */
class CoursesCertificateController extends Controller
{
    public function __construct(private CertificateService $certificates, private CourseAccess $access)
    {
    }

    private function guard(callable $fn): JsonResponse
    {
        try {
            abort_unless(CertificateService::installed(), 422, 'Run database script 159_courses_certificates.sql first.');

            return $fn();
        } catch (BooksException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }
    }

    private function offering(Request $request, int $id): Offering
    {
        $o = Offering::findOrFail($id);
        abort_unless($this->access->staffMay($request->user(), $o), 403, 'You can only work on the certificates of the offerings you teach.');

        return $o;
    }

    private function certOf(Offering $o, int $cert): Certificate
    {
        return Certificate::where('offering_id', $o->id)->findOrFail($cert);
    }

    public function index(Request $request, int $id): JsonResponse
    {
        $o = $this->offering($request, $id);

        return $this->guard(fn () => response()->json(['certificates' => $this->certificates->forOffering($o), 'gives_certificate' => (bool) $o->certificate, 'candidates' => $this->certificates->candidates($o)]));
    }

    public function issue(Request $request, int $id): JsonResponse
    {
        $o = $this->offering($request, $id);
        $d = $request->validate(['enrolment_id' => 'required|integer', 'reason' => 'nullable|string|max:300']);

        return $this->guard(function () use ($request, $o, $d) {
            $c = $this->certificates->issue($o, Enrolment::where('offering_id', $o->id)->findOrFail($d['enrolment_id']), $request->user()->id, $d['reason'] ?? null);

            return response()->json(['message' => 'Certificate '.$c->number.' issued.', 'certificate' => $this->certificates->row($c)]);
        });
    }

    public function issueMissing(Request $request, int $id): JsonResponse
    {
        $o = $this->offering($request, $id);

        return $this->guard(function () use ($request, $o) {
            $n = $this->certificates->issueMissing($o, $request->user()->id);

            return response()->json(['message' => $n ? "{$n} certificate(s) issued." : 'Nobody was waiting for a certificate.', 'issued' => $n]);
        });
    }

    public function revoke(Request $request, int $id, int $cert): JsonResponse
    {
        $o = $this->offering($request, $id);
        $d = $request->validate(['reason' => 'required|string|max:300']);

        return $this->guard(fn () => response()->json(['message' => 'Certificate revoked.', 'certificate' => $this->certificates->row($this->certificates->revoke($this->certOf($o, $cert), $d['reason'], $request->user()->id))]));
    }

    public function renew(Request $request, int $id, int $cert): JsonResponse
    {
        $o = $this->offering($request, $id);

        return $this->guard(function () use ($request, $o, $cert) {
            $c = $this->certificates->renew($this->certOf($o, $cert), $request->user()->id);

            return response()->json(['message' => 'Renewed as '.$c->number.'.', 'certificate' => $this->certificates->row($c)]);
        });
    }
}
