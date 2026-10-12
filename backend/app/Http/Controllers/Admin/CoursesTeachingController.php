<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Courses\Intake;
use App\Models\Courses\Offering;
use App\Models\Courses\WaitlistEntry;
use App\Services\Books\BooksException;
use App\Services\Courses\CourseAccess;
use App\Services\Courses\IntakeService;
use App\Services\Courses\TeachingService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** Courses → teaching: what a teacher has to do, their students, the intakes of an offering and its waiting list. A manager does any offering, a teacher their own. */
class CoursesTeachingController extends Controller
{
    public function __construct(private TeachingService $teaching, private IntakeService $intakes, private CourseAccess $access)
    {
    }

    private function guard(callable $fn): JsonResponse
    {
        try {
            return $fn();
        } catch (BooksException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }
    }

    private function offering(Request $request, int $id): Offering
    {
        $o = Offering::findOrFail($id);
        abort_unless($this->access->staffMay($request->user(), $o), 403, 'You can only work on the offerings you teach.');

        return $o;
    }

    public function dashboard(Request $request): JsonResponse
    {
        return response()->json($this->teaching->dashboard($request->user()));
    }

    public function students(Request $request, int $id): JsonResponse
    {
        $o = $this->offering($request, $id);

        return response()->json(['students' => $this->teaching->students($o)]);
    }

    public function intakes(Request $request, int $id): JsonResponse
    {
        $o = $this->offering($request, $id);

        return response()->json(['ready' => IntakeService::installed(), 'intakes' => $this->intakes->intakes($o), 'waitlist' => $this->intakes->waitlist($o)]);
    }

    public function saveIntake(Request $request, int $id, ?int $intake = null): JsonResponse
    {
        $o = $this->offering($request, $id);
        $d = $request->validate(['name' => 'sometimes|string|max:120', 'starts_on' => 'sometimes|nullable|string|max:20', 'ends_on' => 'sometimes|nullable|string|max:20', 'enrol_until' => 'sometimes|nullable|string|max:20', 'capacity' => 'sometimes|nullable|integer', 'status' => 'sometimes|string|max:8']);

        return $this->guard(function () use ($o, $d, $intake) {
            $this->intakes->save($o, $d, $intake ? Intake::where('offering_id', $o->id)->findOrFail($intake) : null);

            return response()->json(['message' => 'Intake saved.', 'intakes' => $this->intakes->intakes($o), 'waitlist' => $this->intakes->waitlist($o)]);
        });
    }

    public function deleteIntake(Request $request, int $id, int $intake): JsonResponse
    {
        $o = $this->offering($request, $id);

        return $this->guard(function () use ($o, $intake) {
            $this->intakes->delete($o, Intake::where('offering_id', $o->id)->findOrFail($intake));

            return response()->json(['message' => 'Intake removed.', 'intakes' => $this->intakes->intakes($o), 'waitlist' => $this->intakes->waitlist($o)]);
        });
    }

    public function offer(Request $request, int $id, int $entry): JsonResponse
    {
        $o = $this->offering($request, $id);

        return $this->guard(function () use ($o, $entry) {
            $this->intakes->offerNow($o, WaitlistEntry::where('offering_id', $o->id)->findOrFail($entry));

            return response()->json(['message' => 'A place is held for them and they have been told.', 'intakes' => $this->intakes->intakes($o), 'waitlist' => $this->intakes->waitlist($o)]);
        });
    }

    public function removeFromWaitlist(Request $request, int $id, int $entry): JsonResponse
    {
        $o = $this->offering($request, $id);
        $this->intakes->remove(WaitlistEntry::where('offering_id', $o->id)->findOrFail($entry));

        return response()->json(['message' => 'Taken off the waiting list.', 'intakes' => $this->intakes->intakes($o), 'waitlist' => $this->intakes->waitlist($o)]);
    }
}
