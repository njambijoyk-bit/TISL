<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Courses\Enrolment;
use App\Models\Courses\Lesson;
use App\Models\Courses\Offering;
use App\Services\Books\BooksException;
use App\Services\Courses\CourseAccess;
use App\Services\Courses\KitService;
use App\Services\Courses\RecipePublisher;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** Courses → recipes copied from Menus, and cooking kits. Publishing a recipe makes a new offering (managers only); the kit and its hand-out belong to an offering. */
class CoursesRecipeController extends Controller
{
    public function __construct(private RecipePublisher $recipes, private KitService $kits, private CourseAccess $access)
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

    public function publishable(Request $request): JsonResponse
    {
        return response()->json(['ready' => RecipePublisher::installed(), 'recipes' => $this->recipes->publishable($request->query('q'))]);
    }

    public function publish(Request $request, int $recipe): JsonResponse
    {
        $d = $request->validate(['offering_id' => 'nullable|integer']);

        return $this->guard(function () use ($request, $recipe, $d) {
            if (! empty($d['offering_id'])) {
                $this->offering($request, (int) $d['offering_id']);
            }
            $r = $this->recipes->publish($recipe, $d['offering_id'] ?? null, $request->user());

            return response()->json(['message' => 'Copied. It is a draft until you publish it.', 'offering_id' => $r['offering']->id, 'lesson_id' => $r['lesson']->id]);
        });
    }

    public function refresh(Request $request, int $id, int $lesson): JsonResponse
    {
        $o = $this->offering($request, $id);
        $d = $request->validate(['overwrite' => 'nullable|boolean']);

        return $this->guard(function () use ($request, $o, $lesson, $d) {
            $this->recipes->refresh(Lesson::where('offering_id', $o->id)->findOrFail($lesson), (bool) ($d['overwrite'] ?? false), $request->user());

            return response()->json(['message' => 'The lesson now has the kitchen\'s latest recipe.']);
        });
    }

    public function sources(Request $request, int $id): JsonResponse
    {
        return response()->json(['sources' => $this->recipes->sourcesOf($this->offering($request, $id))]);
    }

    public function kit(Request $request, int $id): JsonResponse
    {
        $o = $this->offering($request, $id);

        return response()->json(['ready' => KitService::installed(), 'items' => $this->kits->items($o), 'handouts' => $this->kits->handouts($o)]);
    }

    public function saveKit(Request $request, int $id): JsonResponse
    {
        $o = $this->offering($request, $id);
        $d = $request->validate(['items' => 'present|array', 'items.*.variant_id' => 'required|integer', 'items.*.quantity' => 'required|numeric', 'items.*.note' => 'nullable|string|max:160']);

        return $this->guard(function () use ($o, $d) {
            $this->kits->setItems($o, $d['items']);

            return response()->json(['message' => 'Kit saved.', 'items' => $this->kits->items($o), 'handouts' => $this->kits->handouts($o)]);
        });
    }

    public function handOut(Request $request, int $id, int $enrolment): JsonResponse
    {
        $o = $this->offering($request, $id);

        return $this->guard(function () use ($request, $o, $enrolment) {
            $h = $this->kits->handOut($o, Enrolment::where('offering_id', $o->id)->findOrFail($enrolment), $request->user());

            return response()->json(['message' => $h->stock_note ?: 'Kit handed over and taken out of stock.', 'items' => $this->kits->items($o), 'handouts' => $this->kits->handouts($o)]);
        });
    }
}
