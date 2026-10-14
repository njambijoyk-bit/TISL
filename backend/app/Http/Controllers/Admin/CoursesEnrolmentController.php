<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Books\PaymentMethod;
use App\Models\Courses\Enrolment;
use App\Models\Courses\Fee;
use App\Models\Courses\Offering;
use App\Models\User;
use App\Services\Access\Authorizer;
use App\Services\Books\BooksException;
use App\Services\Courses\CourseFees;
use App\Services\Courses\EnrolmentService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** Courses → fees and enrolments. Fees are set by course managers; enrolling, taking payment and cancelling by those who may enrol; refunds by those who may refund. All money goes through the books. */
class CoursesEnrolmentController extends Controller
{
    public function __construct(private CourseFees $fees, private EnrolmentService $enrolments, private Authorizer $authz)
    {
    }

    private function guard(callable $fn): JsonResponse
    {
        try {
            abort_unless(CourseFees::installed(), 422, 'Run database script 153_courses_fees.sql first.');

            return $fn();
        } catch (BooksException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }
    }

    // ── fees ──────────────────────────────────────────────────────────────

    public function feeList(int $id): JsonResponse
    {
        if (! CourseFees::installed()) {
            return response()->json(['ready' => false, 'fees' => [], 'kinds' => Fee::KINDS]);
        }

        return response()->json(['ready' => true, 'fees' => $this->fees->rows(Offering::findOrFail($id)), 'kinds' => Fee::KINDS]);
    }

    public function feeSave(Request $request, int $id, ?int $fee = null): JsonResponse
    {
        $o = Offering::findOrFail($id);
        $d = $request->validate(['kind' => 'sometimes|string|max:12', 'name' => 'sometimes|string|max:120', 'ledger_id' => 'sometimes|integer', 'amount' => 'sometimes|numeric', 'is_optional' => 'sometimes|boolean',
            'once_per_student' => 'sometimes|boolean', 'refundable' => 'sometimes|boolean', 'is_active' => 'sometimes|boolean']);

        return $this->guard(function () use ($o, $d, $fee) {
            $saved = $this->fees->save($o, $d, $fee ? Fee::findOrFail($fee) : null);   // saved first, so the list sent back has it

            return response()->json(['message' => 'Fee saved.', 'fees' => $this->fees->rows($o), 'fee_id' => $saved->id]);
        });
    }

    public function feeDelete(int $id, int $fee): JsonResponse
    {
        $o = Offering::findOrFail($id);

        return $this->guard(function () use ($o, $fee) { $this->fees->delete($o, Fee::findOrFail($fee)); return response()->json(['message' => 'Fee removed.', 'fees' => $this->fees->rows($o)]); });
    }

    // ── enrolments ────────────────────────────────────────────────────────

    public function meta(): JsonResponse
    {
        return response()->json(['ready' => CourseFees::installed(), 'statuses' => Enrolment::STATUSES,
            'payment_methods' => PaymentMethod::where('is_active', true)->orderBy('sort_order')->get(['id', 'name', 'kind', 'requires_reference']),
            'can_enrol' => $this->authz->allows(request()->user(), 'courses.enrol'), 'can_refund' => $this->authz->allows(request()->user(), 'courses.refund')]);
    }

    public function index(Request $request): JsonResponse
    {
        if (! CourseFees::installed()) {
            return response()->json(['ready' => false, 'enrolments' => []]);
        }
        $q = Enrolment::query()->orderByDesc('id');
        foreach (['offering_id', 'status'] as $f) {
            if ($request->filled($f)) {
                $q->where($f, $request->query($f));
            }
        }
        if ($request->filled('q')) {
            $like = '%'.str_replace(['%', '_'], ['\\%', '\\_'], trim((string) $request->query('q'))).'%';
            $q->where(fn ($w) => $w->where('number', 'like', $like)->orWhereIn('student_user_id', User::where('name', 'like', $like)->orWhere('email', 'like', $like)->select('id')));
        }

        return response()->json(['ready' => true, 'enrolments' => $q->limit(200)->get()->map(fn (Enrolment $e) => $this->enrolments->row($e))->values()]);
    }

    public function show(int $id): JsonResponse
    {
        return $this->guard(fn () => response()->json(['enrolment' => $this->enrolments->row(Enrolment::findOrFail($id))]));
    }

    /** What enrolling a student would cost (for the counter form). */
    public function quote(Request $request, int $id): JsonResponse
    {
        $d = $request->validate(['student_user_id' => 'required|integer', 'payer_user_id' => 'nullable|integer', 'optional_fee_ids' => 'nullable|array', 'optional_fee_ids.*' => 'integer', 'discount_pct' => 'nullable|numeric']);

        return $this->guard(function () use ($id, $d) {
            $o = Offering::findOrFail($id);
            $student = User::findOrFail($d['student_user_id']);
            $payer = ! empty($d['payer_user_id']) ? User::findOrFail($d['payer_user_id']) : $student;

            return response()->json($this->enrolments->quote($o, $student, $payer, array_map('intval', $d['optional_fee_ids'] ?? []), (float) ($d['discount_pct'] ?? 0)));
        });
    }

    public function enrol(Request $request, int $id): JsonResponse
    {
        $d = $request->validate(['student_user_id' => 'required|integer', 'payer_user_id' => 'nullable|integer', 'optional_fee_ids' => 'nullable|array', 'optional_fee_ids.*' => 'integer', 'discount_pct' => 'nullable|numeric',
            'discount_note' => 'nullable|string|max:200', 'notes' => 'nullable|string|max:500']);

        return $this->guard(fn () => response()->json(['message' => 'Enrolled.', 'enrolment' => $this->enrolments->row($this->enrolments->enrol(Offering::findOrFail($id), $d, $request->user(), 'counter'))], 201));
    }

    public function payment(Request $request, int $id): JsonResponse
    {
        $d = $request->validate(['tenders' => 'required|array|min:1', 'tenders.*.payment_method_id' => 'required|integer', 'tenders.*.amount' => 'required|numeric|min:0.01', 'tenders.*.reference' => 'nullable|string|max:80']);

        return $this->guard(fn () => response()->json(['message' => 'Payment recorded.', 'enrolment' => $this->enrolments->row($this->enrolments->takePayment(Enrolment::findOrFail($id), $d['tenders'], $request->user()))]));
    }

    public function cancel(Request $request, int $id): JsonResponse
    {
        $d = $request->validate(['reason' => 'nullable|string|max:300']);

        return $this->guard(fn () => response()->json(['message' => 'Enrolment cancelled.', 'enrolment' => $this->enrolments->row($this->enrolments->cancel(Enrolment::findOrFail($id), $d['reason'] ?? null, $request->user()))]));
    }

    public function refund(Request $request, int $id): JsonResponse
    {
        $d = $request->validate(['reason' => 'nullable|string|max:300', 'force' => 'nullable|boolean', 'refund_ledger_id' => 'nullable|integer']);

        return $this->guard(fn () => response()->json(['message' => 'Refunded: the credit note is in the books.', 'enrolment' => $this->enrolments->row($this->enrolments->refund(Enrolment::findOrFail($id), $request->user(), (bool) ($d['force'] ?? false), $d['reason'] ?? null, $d['refund_ledger_id'] ?? null))]));
    }
}
