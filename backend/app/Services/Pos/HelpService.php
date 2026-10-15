<?php

namespace App\Services\Pos;

use App\Models\Access\AccessLog;
use App\Models\Pos\Station;
use App\Models\User;
use App\Services\Access\Authorizer;
use App\Services\Books\BooksException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/** "Call for help" at a self-checkout screen. The request waits on the tills of that branch until someone marks it done. */
class HelpService
{
    public static function installed(): bool
    {
        return Schema::hasTable('pos_help_requests');
    }

    /** A customer asks. One open request per station: pressing again does not pile them up. */
    public function request(Station $s): void
    {
        if (! self::installed()) {
            throw new BooksException('Help requests are not set up yet. Please find a member of staff.');
        }
        if (! DB::table('pos_help_requests')->where('station_id', $s->id)->where('status', 'open')->exists()) {
            DB::table('pos_help_requests')->insert(['station_id' => $s->id, 'location_id' => $s->location_id, 'status' => 'open', 'created_at' => now(), 'updated_at' => now()]);
        }
    }

    /** Open requests at the branches this person may use. @return array<int, array<string, mixed>> */
    public function open(User $u): array
    {
        if (! self::installed()) {
            return [];
        }
        $scope = app(Authorizer::class)->locationIds($u);
        $names = Station::pluck('name', 'id');

        return DB::table('pos_help_requests')->where('status', 'open')->when($scope !== null, fn ($q) => $q->whereIn('location_id', $scope ?: [0]))->orderBy('id')->limit(30)->get()
            ->map(fn ($h) => ['id' => (int) $h->id, 'station' => $names[$h->station_id] ?? 'Self checkout', 'at' => $h->created_at, 'minutes' => (int) max(0, now()->diffInMinutes($h->created_at, true))])->all();
    }

    public function done(User $u, int $id): void
    {
        $scope = app(Authorizer::class)->locationIds($u);
        $n = DB::table('pos_help_requests')->where('id', $id)->where('status', 'open')->when($scope !== null, fn ($q) => $q->whereIn('location_id', $scope ?: [0]))
            ->update(['status' => 'done', 'handled_by' => $u->id, 'handled_at' => now(), 'updated_at' => now()]);
        if ($n) {
            AccessLog::record($u->id, null, 'pos_help_done', ['request' => $id]);
        }
    }
}
