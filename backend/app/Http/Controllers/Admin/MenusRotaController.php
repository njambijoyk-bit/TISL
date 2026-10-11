<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Location;
use App\Models\Menus\Chef;
use App\Models\Menus\DayOff;
use App\Models\Menus\OpenShift;
use App\Models\Menus\RotaPattern;
use App\Models\Menus\Shift;
use App\Models\Menus\Swap;
use App\Models\Menus\Station;
use App\Services\Access\Authorizer;
use App\Services\Access\BranchFilter;
use App\Services\Books\BooksException;
use App\Services\Menus\KitchenService;
use App\Services\Menus\MenusSettings;
use App\Services\Menus\RotaAttendance;
use App\Services\Menus\RotaBoard;
use App\Services\Menus\RotaClock;
use App\Services\Menus\RotaLeave;
use App\Services\Menus\RotaPatterns;
use App\Services\Menus\RotaPay;
use App\Services\Menus\RotaService;
use App\Services\Menus\RotaSwaps;
use App\Services\Notify\Staff;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Menus → Rota: the week of shifts, publishing it, and time off. Any Menus user may read the rota, see their own shifts and ask for time off; changing shifts, publishing and deciding
 * on time off need menus.manage. Shifts belong to a branch, so a person only sees and changes the branches they are cleared for.
 */
class MenusRotaController extends Controller
{
    public function __construct(private RotaService $rota, private RotaPatterns $patterns, private RotaSwaps $swaps, private RotaBoard $board, private RotaClock $clock, private RotaPay $pay, private BranchFilter $branches, private Authorizer $access, private Staff $staff)
    {
    }

    private function guard(callable $fn): JsonResponse
    {
        try {
            abort_unless(RotaService::installed(), 422, 'Run database script 145_menus_rota.sql first.');

            return $fn();
        } catch (BooksException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }
    }

    private function manager(Request $request): bool
    {
        return $this->access->allows($request->user(), 'menus.manage');
    }

    private function shift(int $id): Shift
    {
        $s = Shift::findOrFail($id);
        $this->branches->assertVisible((int) $s->location_id, 'stock', 'the rota');

        return $s;
    }

    public function index(Request $request): JsonResponse
    {
        if (! RotaService::installed()) {
            return response()->json(['ready' => false]);
        }
        $d = $request->validate(['week' => 'nullable|date', 'location_id' => 'nullable|integer']);
        $week = $this->rota->week($this->rota->monday($d['week'] ?? null), $d['location_id'] ?? null, fn ($q) => $this->branches->apply($q, 'location_id', 'stock', 'the rota'));
        $settings = MenusSettings::all();
        $manager = $this->manager($request);
        $me = Chef::where('user_id', $request->user()->id)->first();
        $scope = fn ($q) => $this->branches->apply($q, 'location_id', 'stock', 'the rota');

        return response()->json(['ready' => true, 'can_manage' => $manager, 'me' => $me?->id, 'more' => RotaPatterns::installed() && RotaSwaps::installed(), 'attendance' => RotaAttendance::ready(), 'leave' => RotaLeave::active(),
            'patterns' => $manager ? $this->patterns->rows($scope) : [], 'swaps' => $this->swaps->rows($me, $manager, $scope), 'board' => RotaBoard::installed(), 'open_shifts' => $this->board->rows($me, $manager, $scope), 'clock' => $this->clock->status($request->user()),
            'can_see_pay' => $this->access->allows($request->user(), 'payroll.run'), 'swaps_need_approval' => (bool) $settings['rota_swaps_need_approval'], 'claims_need_approval' => (bool) $settings['rota_claims_need_approval']] + $week + [
            'locations' => Location::query()->orderBy('name')->get(['id', 'name'])->map(fn ($l) => ['id' => $l->id, 'name' => $l->name])->values(),
            'stations' => KitchenService::installed() ? Station::where('is_active', true)->orderBy('sort_order')->orderBy('name')->get(['id', 'name']) : [],
            'limits' => ['max_week_hours' => $settings['rota_max_week_hours'], 'min_rest_hours' => $settings['rota_min_rest_hours']], 'kinds' => DayOff::KINDS]);
    }

    public function mine(Request $request): JsonResponse
    {
        return $this->guard(fn () => response()->json($this->rota->mine($request->user()) + ['kinds' => DayOff::KINDS]));
    }

    private function shiftRules(): array
    {
        return ['chef_id' => 'nullable|integer', 'location_id' => 'nullable|integer', 'station_id' => 'nullable|integer', 'date' => 'nullable|date', 'starts_at' => 'nullable|string|max:8', 'ends_at' => 'nullable|string|max:8', 'note' => 'nullable|string|max:200'];
    }

    public function saveShift(Request $request, ?int $id = null): JsonResponse
    {
        $d = $request->validate($this->shiftRules());

        return $this->guard(function () use ($d, $id, $request) {
            $shift = $id ? $this->shift($id) : null;
            if (! empty($d['location_id'])) {
                $this->branches->assertVisible((int) $d['location_id'], 'stock', 'the rota');
            }
            $r = $this->rota->saveShift($d, $shift, $request->user());

            return response()->json(['message' => 'Shift saved.', 'shift' => $this->rota->shiftRow($r['shift']), 'warnings' => $r['warnings']], $id ? 200 : 201);
        });
    }

    public function deleteShift(int $id): JsonResponse
    {
        return $this->guard(function () use ($id) {
            $this->rota->deleteShift($this->shift($id));

            return response()->json(['message' => 'Shift removed.']);
        });
    }

    public function publish(Request $request): JsonResponse
    {
        $d = $request->validate(['week' => 'required|date', 'location_id' => 'nullable|integer']);

        return $this->guard(function () use ($d) {
            if (! empty($d['location_id'])) {
                $this->branches->assertVisible((int) $d['location_id'], 'stock', 'the rota');
            }
            $n = $this->rota->publish($this->rota->monday($d['week']), $d['location_id'] ?? null);

            return response()->json(['message' => $n ? "Published {$n} shift(s). Each chef has been told." : 'There was nothing new to publish.', 'published' => $n]);
        });
    }

    public function copy(Request $request): JsonResponse
    {
        $d = $request->validate(['from' => 'required|date', 'to' => 'required|date', 'location_id' => 'nullable|integer']);

        return $this->guard(function () use ($d, $request) {
            if (! empty($d['location_id'])) {
                $this->branches->assertVisible((int) $d['location_id'], 'stock', 'the rota');
            }
            $r = $this->rota->copyWeek($this->rota->monday($d['from']), $this->rota->monday($d['to']), $d['location_id'] ?? null, $request->user());

            return response()->json(['message' => "Copied {$r['copied']} shift(s) as drafts.".($r['skipped'] ? ' '.count($r['skipped']).' left out.' : '')] + $r);
        });
    }

    /** A chef asks for time off for themselves; a manager records it for someone (approved at once). Nobody approves their own while someone else could. */
    public function requestOff(Request $request): JsonResponse
    {
        $d = $request->validate(['chef_id' => 'nullable|integer', 'from' => 'required|date', 'to' => 'nullable|date', 'kind' => 'nullable|string|max:10', 'reason' => 'nullable|string|max:300']);

        return $this->guard(function () use ($d, $request) {
            $me = $request->user();
            $mine = Chef::where('user_id', $me->id)->first();
            $chef = ! empty($d['chef_id']) ? Chef::findOrFail((int) $d['chef_id']) : $mine;
            if (! $chef) {
                throw new BooksException('You do not have a chef profile: choose the chef the time off is for.');
            }
            $own = $mine && $mine->id === $chef->id;
            if (! $own && ! $this->manager($request)) {
                abort(403, 'Only a manager can record time off for someone else.');
            }
            $record = ! $own;
            $off = $this->rota->requestDayOff($chef, $d, $me, $record);

            return response()->json(['message' => $record ? 'Time off recorded.' : 'Your request has been sent.', 'dayoff' => $this->rota->dayOffRow($off)], 201);
        });
    }

    public function decide(Request $request, int $id): JsonResponse
    {
        $d = $request->validate(['decision' => 'required|string|in:approved,declined', 'note' => 'nullable|string|max:300']);

        return $this->guard(function () use ($d, $id, $request) {
            $off = DayOff::findOrFail($id);
            $chef = Chef::find($off->chef_id);
            $others = $this->staff->holding('menus.manage')->where('id', '!=', $request->user()->id)->count();
            if ($chef && $chef->user_id === $request->user()->id && $others > 0) {
                throw new BooksException('Someone else has to decide your own time off.');
            }
            $r = $this->rota->decide($off, $d['decision'], $d['note'] ?? null, $request->user());

            return response()->json(['message' => $d['decision'] === 'approved' ? 'Approved.'.($r['shifts_removed'] ? " {$r['shifts_removed']} shift(s) came off the rota." : '') : 'Declined.',
                'dayoff' => $this->rota->dayOffRow($r['dayoff']), 'shifts_removed' => $r['shifts_removed'], 'jobs' => $r['jobs']]);
        });
    }

    public function cancelOff(Request $request, int $id): JsonResponse
    {
        return $this->guard(function () use ($id, $request) {
            $off = DayOff::findOrFail($id);
            $own = Chef::where('user_id', $request->user()->id)->value('id') === $off->chef_id;
            if (! $own && ! $this->manager($request)) {
                abort(403, 'Only the chef or a manager can cancel this.');
            }

            return response()->json(['dayoff' => $this->rota->dayOffRow($this->rota->cancelDayOff($off, $request->user()))]);
        });
    }

    // ── weekly patterns ───────────────────────────────────────────────────

    private function more(): void
    {
        abort_unless(RotaPatterns::installed() && RotaSwaps::installed(), 422, 'Run database script 146_menus_rota_more.sql first.');
    }

    public function savePattern(Request $request, ?int $id = null): JsonResponse
    {
        $d = $request->validate(['chef_id' => 'nullable|integer', 'weekdays' => 'nullable|array|max:7', 'weekdays.*' => 'integer|min:1|max:7', 'weekday' => 'nullable|integer|min:1|max:7', 'location_id' => 'nullable|integer', 'station_id' => 'nullable|integer',
            'starts_at' => 'nullable|string|max:8', 'ends_at' => 'nullable|string|max:8', 'valid_from' => 'nullable|date', 'valid_to' => 'nullable|date', 'note' => 'nullable|string|max:200']);

        return $this->guard(function () use ($d, $id, $request) {
            $this->more();
            $edit = $id ? RotaPattern::findOrFail($id) : null;
            if ($edit) {
                $this->branches->assertVisible((int) $edit->location_id, 'stock', 'the rota');
            }
            if (! empty($d['location_id'])) {
                $this->branches->assertVisible((int) $d['location_id'], 'stock', 'the rota');
            }
            $made = $this->patterns->save($d, $edit, $request->user());

            return response()->json(['message' => count($made) > 1 ? count($made).' patterns saved.' : 'Pattern saved.', 'count' => count($made)], $id ? 200 : 201);
        });
    }

    public function patternActive(Request $request, int $id): JsonResponse
    {
        $d = $request->validate(['active' => 'required|boolean']);

        return $this->guard(function () use ($d, $id) {
            $this->more();
            $p = RotaPattern::findOrFail($id);
            $this->branches->assertVisible((int) $p->location_id, 'stock', 'the rota');
            $this->patterns->setActive($p, (bool) $d['active']);

            return response()->json(['message' => $d['active'] ? 'Pattern is running again.' : 'Pattern paused.']);
        });
    }

    public function deletePattern(int $id): JsonResponse
    {
        return $this->guard(function () use ($id) {
            $this->more();
            $p = RotaPattern::findOrFail($id);
            $this->branches->assertVisible((int) $p->location_id, 'stock', 'the rota');
            $n = $this->patterns->delete($p);

            return response()->json(['message' => 'Pattern removed.'.($n ? " {$n} draft shift(s) it had planned were removed." : '')]);
        });
    }

    public function applyPatterns(Request $request): JsonResponse
    {
        $d = $request->validate(['week' => 'required|date', 'location_id' => 'nullable|integer']);

        return $this->guard(function () use ($d, $request) {
            $this->more();
            if (! empty($d['location_id'])) {
                $this->branches->assertVisible((int) $d['location_id'], 'stock', 'the rota');
            }
            $r = $this->patterns->apply($this->rota->monday($d['week']), $d['location_id'] ?? null, $request->user());

            return response()->json(['message' => "Planned {$r['created']} draft shift(s) from the patterns.".($r['skipped'] ? ' '.count($r['skipped']).' left out.' : '')] + $r);
        });
    }

    // ── swaps ─────────────────────────────────────────────────────────────

    private function mineChef(Request $request): ?Chef
    {
        return Chef::where('user_id', $request->user()->id)->first();
    }

    /** A chef asks a colleague to take one of their own shifts; a manager may ask for anyone. */
    public function askSwap(Request $request): JsonResponse
    {
        $d = $request->validate(['shift_id' => 'required|integer', 'to_chef_id' => 'required|integer', 'return_shift_id' => 'nullable|integer', 'note' => 'nullable|string|max:300']);

        return $this->guard(function () use ($d, $request) {
            $this->more();
            $shift = $this->shift((int) $d['shift_id']);
            $me = $this->mineChef($request);
            if (! $this->manager($request) && (! $me || (int) $me->id !== (int) $shift->chef_id)) {
                abort(403, 'You can only swap your own shifts.');
            }
            $w = $this->swaps->ask($d, $request->user());

            return response()->json(['message' => 'Your colleague has been asked.', 'swap_id' => $w->id], 201);
        });
    }

    public function respondSwap(Request $request, int $id): JsonResponse
    {
        $d = $request->validate(['accept' => 'required|boolean', 'note' => 'nullable|string|max:300']);

        return $this->guard(function () use ($d, $id, $request) {
            $this->more();
            $w = Swap::findOrFail($id);
            $this->shift((int) $w->shift_id);
            $me = $this->mineChef($request) ?? throw new BooksException('You do not have a chef profile.');
            $r = $this->swaps->respond($w, $me, (bool) $d['accept'], $d['note'] ?? null);

            return response()->json(['message' => $d['accept'] ? ($r->status === 'approved' ? 'Done: the shift is yours now.' : 'Thank you. A manager will approve it.') : 'You said no.', 'status' => $r->status]);
        });
    }

    public function decideSwap(Request $request, int $id): JsonResponse
    {
        $d = $request->validate(['decision' => 'required|string|in:approved,declined', 'note' => 'nullable|string|max:300']);

        return $this->guard(function () use ($d, $id, $request) {
            $this->more();
            $w = Swap::findOrFail($id);
            $this->shift((int) $w->shift_id);
            $r = $this->swaps->decide($w, $d['decision'] === 'approved', $d['note'] ?? null, $request->user());

            return response()->json(['message' => $r->status === 'approved' ? 'Approved: the rota has changed.' : 'Declined.', 'status' => $r->status]);
        });
    }

    public function cancelSwap(Request $request, int $id): JsonResponse
    {
        return $this->guard(function () use ($id, $request) {
            $this->more();
            $w = Swap::findOrFail($id);
            $this->shift((int) $w->shift_id);
            $me = $this->mineChef($request);
            if (! $this->manager($request) && (! $me || (int) $me->id !== (int) $w->from_chef_id)) {
                abort(403, 'Only the chef who asked, or a manager, can cancel this.');
            }
            $this->swaps->cancel($w);

            return response()->json(['message' => 'Swap cancelled.']);
        });
    }

    // ── the open shift board ──────────────────────────────────────────────

    private function board(): void
    {
        abort_unless(RotaBoard::installed(), 422, 'Run database script 147_menus_rota_board.sql first.');
    }

    private function open(int $id): OpenShift
    {
        $o = OpenShift::findOrFail($id);
        $this->branches->assertVisible((int) $o->location_id, 'stock', 'the rota');

        return $o;
    }

    public function postOpen(Request $request): JsonResponse
    {
        $d = $request->validate(['location_id' => 'required|integer', 'station_id' => 'nullable|integer', 'date' => 'required|date', 'starts_at' => 'required|string|max:8', 'ends_at' => 'required|string|max:8', 'note' => 'nullable|string|max:200']);

        return $this->guard(function () use ($d, $request) {
            $this->board();
            $this->branches->assertVisible((int) $d['location_id'], 'stock', 'the rota');
            $this->board->post($d, $request->user());

            return response()->json(['message' => 'Posted on the board. The chefs who could take it have been told.'], 201);
        });
    }

    /** A chef gives one of their published shifts back to the board; a manager may for anyone. */
    public function releaseShift(Request $request, int $id): JsonResponse
    {
        return $this->guard(function () use ($id, $request) {
            $this->board();
            $shift = $this->shift($id);
            $me = $this->mineChef($request);
            if (! $this->manager($request) && (! $me || (int) $me->id !== (int) $shift->chef_id)) {
                abort(403, 'You can only give back your own shifts.');
            }
            $this->board->release($shift, $request->user());

            return response()->json(['message' => 'The shift is on the board. It stays yours until someone else takes it.'], 201);
        });
    }

    public function claimOpen(Request $request, int $id): JsonResponse
    {
        $d = $request->validate(['note' => 'nullable|string|max:200']);

        return $this->guard(function () use ($d, $id, $request) {
            $this->board();
            $o = $this->open($id);
            $me = $this->mineChef($request) ?? throw new BooksException('Only chefs can claim shifts.');
            $r = $this->board->claim($o, $me, $d['note'] ?? null);

            return response()->json(['message' => $r->status === 'filled' ? 'The shift is yours.' : 'Claimed. A manager will decide.', 'status' => $r->status]);
        });
    }

    public function withdrawClaim(Request $request, int $id): JsonResponse
    {
        return $this->guard(function () use ($id, $request) {
            $this->board();
            $this->board->withdraw($this->open($id), $this->mineChef($request) ?? throw new BooksException('Only chefs can claim shifts.'));

            return response()->json(['message' => 'Claim withdrawn.']);
        });
    }

    public function awardOpen(Request $request, int $id): JsonResponse
    {
        $d = $request->validate(['chef_id' => 'required|integer']);

        return $this->guard(function () use ($d, $id, $request) {
            $this->board();
            $this->board->award($this->open($id), Chef::findOrFail((int) $d['chef_id']), $request->user());

            return response()->json(['message' => 'Awarded: the shift is on that chef\'s rota and they have been told.']);
        });
    }

    public function cancelOpen(int $id): JsonResponse
    {
        return $this->guard(function () use ($id) {
            $this->board();
            $this->board->cancel($this->open($id));

            return response()->json(['message' => 'Taken off the board.']);
        });
    }

    // ── clocking in from the rota page ────────────────────────────────────

    public function clockIn(Request $request): JsonResponse
    {
        return $this->guard(function () use ($request) {
            $this->clock->clockIn($request->user());

            return response()->json(['message' => 'Clocked in.', 'clock' => $this->clock->status($request->user())]);
        });
    }

    public function clockOut(Request $request): JsonResponse
    {
        return $this->guard(function () use ($request) {
            $this->clock->clockOut($request->user());

            return response()->json(['message' => 'Clocked out.', 'clock' => $this->clock->status($request->user())]);
        });
    }

    // ── hours and pay ─────────────────────────────────────────────────────

    /**
     * Hours rostered, worked, overtime and short time for a stretch of days (default: this month). A manager sees every chef; a chef sees only their own row. Pay figures need payroll access.
     */
    public function hours(Request $request): JsonResponse
    {
        $d = $request->validate(['from' => 'nullable|date', 'to' => 'nullable|date']);

        return $this->guard(function () use ($d, $request) {
            [$from, $to] = $this->period($d);
            $rows = $this->report($request, $from, $to);

            return response()->json(['from' => $from->toDateString(), 'to' => $to->toDateString(), 'rows' => $rows, 'money' => $this->access->allows($request->user(), 'payroll.run'),
                'overtime_source' => MenusSettings::all()['rota_overtime_source']]);
        });
    }

    public function hoursCsv(Request $request)
    {
        $d = $request->validate(['from' => 'nullable|date', 'to' => 'nullable|date']);
        abort_unless($this->manager($request), 403, 'Only a manager can download this.');
        [$from, $to] = $this->period($d);
        $money = $this->access->allows($request->user(), 'payroll.run');

        return response($this->pay->csv($this->report($request, $from, $to), $money), 200, ['Content-Type' => 'text/csv; charset=UTF-8', 'Content-Disposition' => 'attachment; filename="rota-hours-'.$from->format('Y-m-d').'-to-'.$to->format('Y-m-d').'.csv"']);
    }

    /** @return array{0: \Illuminate\Support\Carbon, 1: \Illuminate\Support\Carbon} */
    private function period(array $d): array
    {
        $tz = (string) config('app.timezone', 'Africa/Nairobi');
        $from = ! empty($d['from']) ? \Illuminate\Support\Carbon::parse($d['from'], $tz)->startOfDay() : \Illuminate\Support\Carbon::now($tz)->startOfMonth();
        $to = ! empty($d['to']) ? \Illuminate\Support\Carbon::parse($d['to'], $tz)->startOfDay() : $from->copy()->endOfMonth()->startOfDay();
        if ($to->lt($from) || $from->diffInDays($to) > 92) {
            throw new BooksException('Choose a stretch of at most three months.');
        }

        return [$from, $to];
    }

    /** @return array<int, array<string, mixed>> */
    private function report(Request $request, $from, $to): array
    {
        $manager = $this->manager($request);
        $me = $this->mineChef($request);
        if (! $manager && ! $me) {
            return [];
        }

        return $this->pay->report($from, $to, $this->access->allows($request->user(), 'payroll.run') && $manager, fn ($q) => $this->branches->apply($q, 'location_id', 'stock', 'the rota hours'), $manager ? null : $me->id);
    }
}
