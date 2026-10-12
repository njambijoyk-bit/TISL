<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Books\PaymentMethod;
use App\Models\Courses\Enrolment;
use App\Models\Courses\Offering;
use App\Services\Books\BooksException;
use App\Services\Books\GatewayPaymentService;
use App\Services\Courses\EnrolmentService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** A signed-in person enrolling themselves and paying, and seeing their own enrolments. Nothing here lets anyone act on somebody else's enrolment. */
class CoursesEnrolController extends Controller
{
    public function __construct(private EnrolmentService $enrolments)
    {
    }

    private function guard(callable $fn): JsonResponse
    {
        try {
            abort_unless(EnrolmentService::installed(), 422, 'Courses are not set up yet.');

            return $fn();
        } catch (BooksException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }
    }

    private function open(int $id): Offering
    {
        return Offering::where('status', 'published')->findOrFail($id);
    }

    public function quote(Request $request, int $id): JsonResponse
    {
        $d = $request->validate(['optional_fee_ids' => 'nullable|array', 'optional_fee_ids.*' => 'integer']);

        return $this->guard(fn () => response()->json($this->enrolments->quote($this->open($id), $request->user(), $request->user(), array_map('intval', $d['optional_fee_ids'] ?? [])) + [
            'payment_methods' => PaymentMethod::offeredAtCheckout()->orderBy('sort_order')->get(['id', 'name', 'kind', 'gateway'])->filter(fn ($m) => GatewayPaymentService::isAutomatic($m))->values()]));
    }

    /** Enrol yourself. With a payment method the first payment is started at once. */
    public function enrol(Request $request, int $id): JsonResponse
    {
        $d = $request->validate(['optional_fee_ids' => 'nullable|array', 'optional_fee_ids.*' => 'integer', 'payment_method_id' => 'nullable|integer', 'phone' => 'nullable|string|max:40']);

        return $this->guard(function () use ($request, $id, $d) {
            $e = $this->enrolments->enrol($this->open($id), ['student_user_id' => $request->user()->id, 'optional_fee_ids' => $d['optional_fee_ids'] ?? []], null, 'online');
            $pay = null;
            if ($e->status === 'pending' && ! empty($d['payment_method_id'])) {
                $pay = $this->enrolments->pay($e, ['payment_method_id' => $d['payment_method_id'], 'phone' => $d['phone'] ?? null], $request->user());
            }

            return response()->json(['message' => $pay['message'] ?? ($e->status === 'active' ? 'You are enrolled.' : 'Your place is held: pay to confirm it.'), 'enrolment' => $this->enrolments->row($e, false), 'attempt' => $pay['attempt'] ?? null, 'redirect_url' => $pay['redirect_url'] ?? null], 201);
        });
    }

    public function mine(Request $request): JsonResponse
    {
        if (! EnrolmentService::installed()) {
            return response()->json(['enrolments' => []]);
        }
        $uid = $request->user()->id;

        return response()->json(['enrolments' => Enrolment::where(fn ($w) => $w->where('student_user_id', $uid)->orWhere('payer_user_id', $uid))->orderByDesc('id')->limit(100)->get()->map(fn (Enrolment $e) => $this->enrolments->row($e, false))->values()]);
    }

    public function pay(Request $request, int $id): JsonResponse
    {
        $d = $request->validate(['payment_method_id' => 'required|integer', 'amount' => 'nullable|numeric', 'phone' => 'nullable|string|max:40']);

        return $this->guard(function () use ($request, $id, $d) {
            $uid = $request->user()->id;
            $e = Enrolment::where(fn ($w) => $w->where('student_user_id', $uid)->orWhere('payer_user_id', $uid))->findOrFail($id);   // only your own
            $r = $this->enrolments->pay($e, $d, $request->user());

            return response()->json($r + ['enrolment' => $this->enrolments->row($e->fresh(), false)]);
        });
    }
}
