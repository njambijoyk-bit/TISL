<?php

namespace App\Services\Courses;

use App\Services\Books\BooksException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/** Courses settings: one row. Works with the defaults until script 152 is run. */
final class CourseSettings
{
    public const DEFAULTS = [
        'live_open_minutes' => 30,       // the join link of a live session shows this long before it starts
        'live_grace_minutes' => 60,      // ...and stays this long after it ends (people run over)
        'download_minutes' => 5,         // a download link works this long
        'max_file_mb' => 50,             // the largest file that can be uploaded
        'default_access_days' => null,   // how long access lasts when an offering does not say (empty = for ever)
        'checkin_open_minutes' => 15,    // students may check themselves in this long before a class starts
        'checkin_late_minutes' => 10,    // ...and are marked late after this many minutes
        'pending_hours' => 48,           // an enrolment nobody has paid for lets the place go after this many hours (0 = never)
        'reminder_days' => 3,            // a payment is reminded this many days before it is due
        'max_discount_pct' => 100,       // the most a member of staff may take off an enrolment
    ];

    public static function ready(): bool
    {
        return Schema::hasTable('course_settings');
    }

    /** @return array<string, mixed> */
    public static function all(): array
    {
        $saved = [];
        if (self::ready()) {
            $row = DB::table('course_settings')->where('id', 1)->value('settings');
            $saved = $row ? (json_decode((string) $row, true) ?: []) : [];
        }

        return array_replace(self::DEFAULTS, array_intersect_key($saved, self::DEFAULTS));
    }

    /** @param array<string, mixed> $in @return array<string, mixed> */
    public static function save(array $in, ?int $by): array
    {
        if (! self::ready()) {
            throw new BooksException('Run database script 152_courses.sql first.');
        }
        $cur = self::all();
        foreach (['live_open_minutes' => [0, 240], 'live_grace_minutes' => [0, 480], 'download_minutes' => [1, 60], 'max_file_mb' => [1, 500], 'pending_hours' => [0, 720], 'checkin_open_minutes' => [0, 120], 'checkin_late_minutes' => [0, 120], 'reminder_days' => [0, 30], 'max_discount_pct' => [0, 100]] as $key => [$lo, $hi]) {
            if (array_key_exists($key, $in)) {
                $v = (int) $in[$key];
                if ($v < $lo || $v > $hi) {
                    throw new BooksException("That setting must be between {$lo} and {$hi}.");
                }
                $cur[$key] = $v;
            }
        }
        if (array_key_exists('default_access_days', $in)) {
            $v = $in['default_access_days'];
            if ($v === null || $v === '') {
                $cur['default_access_days'] = null;
            } else {
                if ((int) $v < 1 || (int) $v > 3650) {
                    throw new BooksException('Access lasts between 1 and 3650 days.');
                }
                $cur['default_access_days'] = (int) $v;
            }
        }
        $json = json_encode($cur);
        if (DB::table('course_settings')->where('id', 1)->exists()) {
            DB::table('course_settings')->where('id', 1)->update(['settings' => $json, 'updated_by' => $by, 'updated_at' => now()]);
        } else {
            DB::table('course_settings')->insert(['id' => 1, 'settings' => $json, 'updated_by' => $by, 'created_at' => now(), 'updated_at' => now()]);
        }

        return $cur;
    }
}
