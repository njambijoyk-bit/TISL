<?php

namespace App\Services\Memberships;

use App\Services\Books\BooksException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/** Memberships settings: one row. Works with the defaults until script 162 is run. */
final class MembershipSettings
{
    public const DEFAULTS = [
        'pending_hours' => 48,          // a membership nobody has paid for lets go after this many hours (0 = never)
        'renewal_lead_days' => 7,       // the next period is invoiced this many days before the current one ends
        'remind_before_days' => 3,      // a payment is reminded this many days before it is due
        'remind_after_days' => 3,       // ...and again this many days after it was due
        'pause_days_per_year' => 60,    // the most a member may pause in a year (0 = members may not pause)
        'allow_member_cancel' => true,  // a member may cancel from their own page (always at the end of the paid period)
    ];

    public static function ready(): bool
    {
        return Schema::hasTable('membership_settings');
    }

    /** @return array<string, mixed> */
    public static function all(): array
    {
        $saved = [];
        if (self::ready()) {
            $row = DB::table('membership_settings')->where('id', 1)->value('settings');
            $saved = $row ? (json_decode((string) $row, true) ?: []) : [];
        }

        return array_replace(self::DEFAULTS, array_intersect_key($saved, self::DEFAULTS));
    }

    /** @param array<string, mixed> $in @return array<string, mixed> */
    public static function save(array $in, ?int $by): array
    {
        if (! self::ready()) {
            throw new BooksException('Run database script 162_memberships.sql first.');
        }
        $cur = self::all();
        foreach (['pending_hours' => [0, 720], 'renewal_lead_days' => [0, 90], 'remind_before_days' => [0, 30], 'remind_after_days' => [0, 30], 'pause_days_per_year' => [0, 365]] as $key => [$lo, $hi]) {
            if (array_key_exists($key, $in)) {
                $v = (int) $in[$key];
                if ($v < $lo || $v > $hi) {
                    throw new BooksException("That setting must be between {$lo} and {$hi}.");
                }
                $cur[$key] = $v;
            }
        }
        if (array_key_exists('allow_member_cancel', $in)) {
            $cur['allow_member_cancel'] = (bool) $in['allow_member_cancel'];
        }
        $json = json_encode($cur);
        if (DB::table('membership_settings')->where('id', 1)->exists()) {
            DB::table('membership_settings')->where('id', 1)->update(['settings' => $json, 'updated_by' => $by, 'updated_at' => now()]);
        } else {
            DB::table('membership_settings')->insert(['id' => 1, 'settings' => $json, 'updated_by' => $by, 'created_at' => now(), 'updated_at' => now()]);
        }

        return $cur;
    }
}
