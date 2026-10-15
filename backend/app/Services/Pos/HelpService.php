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

    /** Staff are told something that needs a person, not a customer's button: shown in the same list with the message. */
    public function alert(Station $s, string $note): void
    {
        if (self::installed() && Schema::hasColumn('pos_help_requests', 'note')) {
            DB::table('pos_help_requests')->insert(['station_id' => $s->id, 'location_id' => $s->location_id, 'status' => 'open', 'tries' => 0, 'note' => mb_substr($note, 0, 255), 'created_at' => now(), 'updated_at' => now()]);
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
            ->map(fn ($h) => ['id' => (int) $h->id, 'station' => $names[$h->station_id] ?? 'Self checkout', 'at' => $h->created_at, 'minutes' => (int) max(0, now()->diffInMinutes($h->created_at, true)), 'tries' => (int) ($h->tries ?? 1), 'note' => $h->note ?? null])->all();
    }

    /** Mark one request handled. False when it is not there to clear: already done, or at a branch this person does not work at. */
    public function done(User $u, int $id): bool
    {
        $scope = app(Authorizer::class)->locationIds($u);
        $row = DB::table('pos_help_requests')->where('id', $id)->where('status', 'open')->when($scope !== null, fn ($q) => $q->whereIn('location_id', $scope ?: [0]))->first();
        $n = $row ? DB::table('pos_help_requests')->where('id', $id)->update(['status' => 'done', 'handled_by' => $u->id, 'handled_at' => now(), 'updated_at' => now()]) : 0;
        if ($row) {
            Cache::forget('pos:help:'.$row->station_id);   // the customer starts again with all their tries
        }
        if ($n) {
            AccessLog::record($u->id, null, 'pos_help_done', ['request' => $id]);
        }

        return $n > 0;
    }

    /** Clear every open request at the branches this person works at. @return int how many */
    public function clearAll(User $u): int
    {
        $scope = app(Authorizer::class)->locationIds($u);
        $open = DB::table('pos_help_requests')->where('status', 'open')->when($scope !== null, fn ($q) => $q->whereIn('location_id', $scope ?: [0]));
        foreach ((clone $open)->pluck('station_id')->unique() as $sid) {
            Cache::forget('pos:help:'.$sid);
        }
        $n = $open->update(['status' => 'done', 'handled_by' => $u->id, 'handled_at' => now(), 'updated_at' => now()]);
        if ($n) {
            AccessLog::record($u->id, null, 'pos_help_cleared', ['count' => $n]);
        }

        return $n;
    }

    /** The customer no longer needs help. */
    public function cancel(Station $s): void
    {
        if (self::installed()) {
            DB::table('pos_help_requests')->where('station_id', $s->id)->where('status', 'open')->update(['status' => 'done', 'updated_at' => now()]);
            Cache::forget($this->key($s));   // withdrawing a request gives the tries back
        }
    }
}
