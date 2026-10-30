<?php

namespace App\Services\Access;

use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/** The built-in role that lets an outside organiser's people open the events screens. Given while their organiser is verified, taken back when it is not. */
class OrganiserRole
{
    private const KEY = 'event_organiser';

    private static function roleId(): ?int
    {
        return Authorizer::ready() ? (DB::table('roles')->where('key', self::KEY)->value('id') ?: null) : null;
    }

    /** Give the role to these people (a secondary role: it adds the events screens without changing who they are). */
    public static function grant(iterable $userIds): void
    {
        $role = self::roleId();
        foreach ($role ? $userIds : [] as $uid) {
            DB::table('user_roles')->updateOrInsert(['user_id' => $uid, 'role_id' => $role], ['is_primary' => 0, 'updated_at' => now(), 'created_at' => now()]);
            app(Authorizer::class)->forget((int) $uid);
        }
    }

    /** Take it from people who no longer belong to any verified outside organiser. */
    public static function revokeUnlessVerified(iterable $userIds): void
    {
        $role = self::roleId();
        foreach ($role ? $userIds : [] as $uid) {
            $still = Schema::hasTable('event_organiser_members') && DB::table('event_organiser_members as m')->join('event_organisers as o', 'o.id', '=', 'm.organiser_id')
                ->where('m.user_id', $uid)->where('o.status', 'verified')->where('o.is_internal', 0)->exists();
            if (! $still) {
                DB::table('user_roles')->where(['user_id' => $uid, 'role_id' => $role, 'is_primary' => 0])->delete();
                app(Authorizer::class)->forget((int) $uid);
            }
        }
    }
}
