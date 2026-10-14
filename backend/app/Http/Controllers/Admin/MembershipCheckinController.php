<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Location;
use App\Models\User;
use App\Services\Access\BranchFilter;
use App\Services\Books\BooksException;
use App\Services\Memberships\MemberCheckIn;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** Memberships → check-in: scan a member card (or find the person by name) at a branch the staff member is cleared for. */
class MembershipCheckinController extends Controller
{
    public function __construct(private MemberCheckIn $checkins, private BranchFilter $branches)
    {
    }

    private function guard(callable $fn): JsonResponse
    {
        try {
            abort_unless(MemberCheckIn::installed(), 422, 'Run database script 167_memberships_checkins.sql first.');

            return $fn();
        } catch (BooksException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }
    }

    private function branch(?int $id): ?int
    {
        if ($id) {
            $this->branches->assertVisible($id, 'general', 'member check-in');
        }

        return $id ?: null;
    }

    public function meta(): JsonResponse
    {
        $limit = $this->branches->limit();

        return response()->json(['ready' => MemberCheckIn::installed(), 'locations' => Location::query()->when($limit !== null, fn ($q) => $q->whereIn('id', $limit))->orderBy('name')->get(['id', 'name'])]);
    }

    public function scan(Request $request): JsonResponse
    {
        $d = $request->validate(['code' => 'required|string|max:300', 'location_id' => 'nullable|integer']);

        return $this->guard(function () use ($request, $d) {
            $loc = $this->branch($d['location_id'] ?? null);
            $uid = MemberCheckIn::find($d['code']) ?? throw new BooksException('This is not a member card.');

            return response()->json($this->checkins->check($uid, $loc, $request->user(), 'card'));
        });
    }

    public function manual(Request $request): JsonResponse
    {
        $d = $request->validate(['user_id' => 'required|integer', 'location_id' => 'nullable|integer']);

        return $this->guard(fn () => response()->json($this->checkins->check((int) $d['user_id'], $this->branch($d['location_id'] ?? null), $request->user(), 'manual')));
    }

    public function recent(Request $request): JsonResponse
    {
        $loc = $this->branch($request->integer('location_id') ?: null);

        return response()->json(['checkins' => $this->checkins->recent($loc, $request->integer('user_id') ?: null)]);
    }

    public function people(Request $request): JsonResponse
    {
        $q = trim((string) $request->query('q', ''));
        if (mb_strlen($q) < 2) {
            return response()->json(['users' => []]);
        }
        $like = '%'.str_replace(['%', '_'], ['\\%', '\\_'], $q).'%';

        return response()->json(['users' => User::where(fn ($w) => $w->where('name', 'like', $like)->orWhere('email', 'like', $like))->whereIn('id', \App\Models\Memberships\Membership::query()->select('member_user_id'))->orderBy('name')->limit(15)->get(['id', 'name', 'email'])]);
    }
}
