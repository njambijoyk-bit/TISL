<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Location;
use App\Models\Menus\Dish;
use App\Models\Menus\Plan;
use App\Models\Menus\SubDelivery;
use App\Models\Menus\Subscription;
use App\Services\Access\BranchFilter;
use App\Services\Books\BooksException;
use App\Services\Menus\PlanService;
use App\Services\Menus\SubscriptionService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;

/** Menus → Plans: the plans and their rotating menus, the subscribers, and what to cook and where to deliver on a day. Branch limits apply (a plan belongs to its kitchen's branch). */
class MenusPlanController extends Controller
{
    public function __construct(private PlanService $plans, private SubscriptionService $subs, private BranchFilter $branches)
    {
    }

    private function guard(callable $fn): JsonResponse
    {
        try {
            abort_unless(SubscriptionService::installed(), 422, 'Run database script 150_menus_plans.sql first.');

            return $fn();
        } catch (BooksException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }
    }

    private function plan(int $id): Plan
    {
        $p = Plan::findOrFail($id);
        $this->branches->assertVisible((int) $p->location_id, 'stock', 'meal plans');

        return $p;
    }

    private function scope(): callable
    {
        return fn ($q) => $this->branches->apply($q, 'location_id', 'stock', 'meal plans');
    }

    public function index(): JsonResponse
    {
        if (! SubscriptionService::installed()) {
            return response()->json(['ready' => false, 'plans' => []]);
        }

        return response()->json(['ready' => true, 'plans' => $this->plans->rows($this->scope()), 'days' => Plan::DAYS,
            'dishes' => Dish::where('is_active', true)->orderBy('name')->get(['id', 'name'])->map(fn ($d) => ['id' => $d->id, 'name' => $d->name])->values(),
            'membership_plans' => \App\Services\Memberships\MemberStanding::on() ? \App\Models\Memberships\Plan::where('status', '!=', 'archived')->orderBy('name')->get(['id', 'name'])->map(fn ($m) => ['id' => $m->id, 'name' => $m->name])->values() : [],
            'locations' => Location::query()->orderBy('name')->get(['id', 'name'])->map(fn ($l) => ['id' => $l->id, 'name' => $l->name])->values()]);
    }

    private function rules(): array
    {
        return ['name' => 'nullable|string|max:120', 'description' => 'nullable|string|max:3000', 'photo' => 'nullable|string|max:255', 'location_id' => 'nullable|integer', 'cycle_weeks' => 'nullable|integer|min:1|max:4',
            'day_price' => 'nullable|numeric|min:0|max:10000000', 'delivery_weekdays' => 'nullable|array|max:7', 'delivery_weekdays.*' => 'integer|min:1|max:7', 'min_days' => 'nullable|integer|min:1|max:7', 'cutoff_hours' => 'nullable|integer|min:6|max:168',
            'slot_from' => 'nullable|string|max:8', 'slot_to' => 'nullable|string|max:8', 'requires_membership' => 'nullable|boolean', 'membership_plan_ids' => 'nullable|array', 'membership_plan_ids.*' => 'integer', 'is_active' => 'nullable|boolean', 'sort_order' => 'nullable|integer'];
    }

    public function save(Request $request, ?int $id = null): JsonResponse
    {
        $d = $request->validate($this->rules());

        return $this->guard(function () use ($d, $id, $request) {
            $edit = $id ? $this->plan($id) : null;
            if (! empty($d['location_id'])) {
                $this->branches->assertVisible((int) $d['location_id'], 'stock', 'meal plans');
            }

            return response()->json(['message' => 'Plan saved.', 'id' => $this->plans->save($d, $edit, $request->user()->id)->id], $id ? 200 : 201);
        });
    }

    public function destroy(int $id): JsonResponse
    {
        return $this->guard(function () use ($id) {
            $this->plans->delete($this->plan($id));

            return response()->json(['message' => 'Plan removed.']);
        });
    }

    public function saveMenu(Request $request, int $id): JsonResponse
    {
        $d = $request->validate(['grid' => 'required|array|max:40', 'grid.*.week_no' => 'required|integer|min:1|max:4', 'grid.*.weekday' => 'required|integer|min:1|max:7', 'grid.*.dish_ids' => 'nullable|array|max:8', 'grid.*.dish_ids.*' => 'integer']);

        return $this->guard(function () use ($d, $id) {
            $n = $this->plans->saveMenu($this->plan($id), $d['grid']);

            return response()->json(['message' => "Menu saved ({$n} dish place".($n === 1 ? '' : 's').').']);
        });
    }

    public function subscribers(Request $request): JsonResponse
    {
        $d = $request->validate(['status' => 'nullable|string|max:10', 'plan_id' => 'nullable|integer']);

        return $this->guard(function () use ($d) {
            $q = Subscription::orderByRaw("CASE status WHEN 'pending' THEN 0 WHEN 'active' THEN 1 WHEN 'paused' THEN 2 ELSE 3 END")->orderByDesc('id')->limit(300);
            if (! empty($d['status']) && isset(Subscription::STATUSES[$d['status']])) {
                $q->where('status', $d['status']);
            }
            if (! empty($d['plan_id'])) {
                $q->where('plan_id', (int) $d['plan_id']);
            }
            $visible = Plan::query();
            $this->scope()($visible);
            $q->whereIn('plan_id', $visible->pluck('id'));
            $plans = Plan::pluck('name', 'id');
            $rows = $q->get()->map(fn (Subscription $s) => $this->subs->staffRow($s, Plan::find($s->plan_id)))->values();

            return response()->json(['subscribers' => $rows, 'statuses' => Subscription::STATUSES, 'plans' => $plans]);
        });
    }

    private function sub(int $id): Subscription
    {
        $s = Subscription::findOrFail($id);
        $this->plan((int) $s->plan_id);

        return $s;
    }

    public function act(Request $request, int $id, string $action): JsonResponse
    {
        $d = $request->validate(['from' => 'nullable|date', 'until' => 'nullable|date', 'reason' => 'nullable|string|max:300']);

        return $this->guard(function () use ($d, $id, $action) {
            $s = $this->sub($id);
            $s = match ($action) {
                'pause' => $this->subs->pause($s, $d['from'] ?? null, $d['until'] ?? null),
                'resume' => $this->subs->resume($s),
                'cancel' => $this->subs->cancel($s, $d['reason'] ?? null),
                default => throw new BooksException('Unknown action.'),
            };

            return response()->json(['message' => 'Done.', 'subscriber' => $this->subs->staffRow($s)]);
        });
    }

    /** Staff take a day off a customer's plan (any time before it is made): the same as the customer skipping. */
    public function skipDelivery(int $id): JsonResponse
    {
        return $this->guard(function () use ($id) {
            $d = SubDelivery::findOrFail($id);
            $s = $this->sub((int) $d->subscription_id);
            $this->subs->skip($s, $d, null, false);

            return response()->json(['message' => 'Skipped.']);
        });
    }

    /** What to cook and where to deliver on a day. */
    public function day(Request $request): JsonResponse
    {
        $d = $request->validate(['date' => 'nullable|date']);

        return $this->guard(function () use ($d) {
            $day = ! empty($d['date']) ? Carbon::parse($d['date'], (string) config('app.timezone', 'Africa/Nairobi'))->startOfDay() : Carbon::now((string) config('app.timezone', 'Africa/Nairobi'))->addDay()->startOfDay();
            $visible = Plan::query();
            $this->scope()($visible);
            $ids = $visible->pluck('id')->all();

            return response()->json($this->subs->dayPlan($day, fn (Plan $p) => in_array($p->id, $ids, true)));
        });
    }

    /** Run the job now: bill the coming weeks, make the kitchen orders that are due. */
    public function run(): JsonResponse
    {
        return $this->guard(function () {
            $r = $this->subs->run();

            return response()->json(['message' => "{$r['billed']} week(s) billed, {$r['orders']} kitchen order(s) made, {$r['lapsed']} week(s) lapsed."] + $r);
        });
    }
}
