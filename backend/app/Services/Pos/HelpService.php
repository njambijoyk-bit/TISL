<?php

namespace App\Services\Pos;

use App\Models\Access\AccessLog;
use App\Models\Pos\Station;
use App\Models\User;
use App\Services\Access\Authorizer;
use App\Services\Books\BooksException;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/** "Call for help" at a self-checkout screen. The request waits on the tills of that branch until someone marks it done. */
class HelpService
{
    public static function installed(): bool
    {
        return Schema::hasTable('pos_help_requests');
    }

    public const MAX_TRIES = 10;   // presses of the button per station per hour

    private function key(Station $s): string
    {
        return 'pos:help:'.$s->id;
    }

    /** Where the customer's request stands: asked or not, how long ago, how many of the allowed tries are used. @return array{open: bool, minutes: ?int, tries: int, max: int} */
    public function status(Station $s): array
    {
        $open = self::installed() ? DB::table('pos_help_requests')->where('station_id', $s->id)->where('status', 'open')->orderByDesc('id')->first() : null;

        return ['open' => (bool) $open, 'minutes' => $open ? (int) max(0, now()->diffInMinutes($open->created_at, true)) : null, 'tries' => (int) Cache::get($this->key($s), 0), 'max' => self::MAX_TRIES];
    }

    /** A customer asks. One open request per station: pressing again counts as a nudge on it (staff see how many times), up to MAX_TRIES an hour. @return array{open: bool, minutes: ?int, tries: int, max: int} */
    public function request(Station $s): array
    {
        if (! self::installed()) {
            throw new BooksException('Help requests are not set up yet. Please find a member of staff.');
        }
        $used = (int) Cache::get($this->key($s), 0);
        if ($used >= self::MAX_TRIES) {
            throw new BooksException('You have asked '.self::MAX_TRIES.' times in the last hour. Please wave to a member of staff.');
        }
        Cache::add($this->key($s), 0, now()->addHour());
        Cache::increment($this->key($s));
        $open = DB::table('pos_help_requests')->where('station_id', $s->id)->where('status', 'open')->orderByDesc('id')->first();
        if ($open) {
            DB::table('pos_help_requests')->where('id', $open->id)->update(['tries' => DB::raw('tries + 1'), 'updated_at' => now()]);
        } else {
            DB::table('pos_help_requests')->insert(['station_id' => $s->id, 'location_id' => $s->location_id, 'status' => 'open', 'tries' => 1, 'created_at' => now(), 'updated_at' => now()]);
        }

        return $this->status($s);
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
            ->map(fn ($h) => ['id' => (int) $h->id, 'station' => $names[$h->station_id] ?? 'Self checkout', 'at' => $h->created_at, 'minutes' => (int) max(0, now()->diffInMinutes($h->created_at, true)), 'tries' => (int) ($h->tries ?? 1)])->all();
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
