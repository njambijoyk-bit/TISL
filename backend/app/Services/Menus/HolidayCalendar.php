<?php

namespace App\Services\Menus;

use App\Models\Menus\Holiday;
use App\Services\Books\BooksException;
use Illuminate\Support\Carbon;

/**
 * A ready-made list of public holidays for a country and a year, to add to the holidays shift premiums use. Fixed-date holidays are listed here; Good Friday and Easter Monday are worked out from the
 * date of Easter (the usual Gregorian rule). Holidays that follow the moon (Idd-ul-Fitr, Eid al-Adha, Maulidi) or that the government announces each year are NOT guessed: add them by hand. A country's
 * calendar changes by law, so the list is a starting point to check against the official notice, never the last word. Nothing is added twice, and a holiday you already have for the day is left as it is.
 */
class HolidayCalendar
{
    /** @var array<string, array{name: string, fixed: array<int, array{0: string, 1: string}>, easter: bool, sunday_to_monday: bool, note: string}> */
    private const COUNTRIES = [
        'KE' => ['name' => 'Kenya', 'easter' => true, 'sunday_to_monday' => true, 'note' => 'Idd-ul-Fitr is not included (it follows the moon): add it when announced. A holiday on a Sunday moves to Monday.',
            'fixed' => [['01-01', "New Year's Day"], ['05-01', 'Labour Day'], ['06-01', 'Madaraka Day'], ['10-10', 'Mazingira Day'], ['10-20', 'Mashujaa Day'], ['12-12', 'Jamhuri Day'], ['12-25', 'Christmas Day'], ['12-26', 'Boxing Day']]],
        'UG' => ['name' => 'Uganda', 'easter' => true, 'sunday_to_monday' => false, 'note' => 'Eid days are not included (they follow the moon): add them when announced.',
            'fixed' => [['01-01', "New Year's Day"], ['01-26', 'NRM Liberation Day'], ['03-08', "International Women's Day"], ['05-01', 'Labour Day'], ['06-03', "Martyrs' Day"], ['06-09', "National Heroes' Day"], ['10-09', 'Independence Day'], ['12-25', 'Christmas Day'], ['12-26', 'Boxing Day']]],
        'TZ' => ['name' => 'Tanzania', 'easter' => true, 'sunday_to_monday' => false, 'note' => 'Eid days are not included (they follow the moon): add them when announced.',
            'fixed' => [['01-01', "New Year's Day"], ['01-12', 'Zanzibar Revolution Day'], ['04-26', 'Union Day'], ['05-01', 'Workers\' Day'], ['07-07', 'Saba Saba'], ['08-08', 'Nane Nane (Farmers\' Day)'], ['10-14', 'Nyerere Day'], ['12-09', 'Independence Day'], ['12-25', 'Christmas Day'], ['12-26', 'Boxing Day']]],
        'RW' => ['name' => 'Rwanda', 'easter' => false, 'sunday_to_monday' => false, 'note' => 'Eid al-Fitr and Eid al-Adha are not included (they follow the moon): add them when announced. Easter is not listed here: add Good Friday and Easter Monday if your branch keeps them.',
            'fixed' => [['01-01', "New Year's Day"], ['01-02', 'Day after New Year'], ['02-01', "National Heroes' Day"], ['04-07', 'Genocide Memorial Day'], ['05-01', 'Labour Day'], ['07-01', 'Independence Day'], ['07-04', 'Liberation Day'], ['08-15', 'Assumption Day'], ['12-25', 'Christmas Day'], ['12-26', 'Boxing Day']]],
        'ZA' => ['name' => 'South Africa', 'easter' => true, 'sunday_to_monday' => true, 'note' => 'A holiday on a Sunday moves to the Monday. Check the official list for the year.',
            'fixed' => [['01-01', "New Year's Day"], ['03-21', 'Human Rights Day'], ['04-27', 'Freedom Day'], ['05-01', "Workers' Day"], ['06-16', 'Youth Day'], ['08-09', "National Women's Day"], ['09-24', 'Heritage Day'], ['12-16', 'Day of Reconciliation'], ['12-25', 'Christmas Day'], ['12-26', 'Day of Goodwill']]],
    ];

    /** @return array<int, array{code: string, name: string, note: string}> */
    public function countries(): array
    {
        return array_map(fn ($code, $c) => ['code' => $code, 'name' => $c['name'], 'note' => $c['note']], array_keys(self::COUNTRIES), self::COUNTRIES);
    }

    /** Easter Sunday of a year (the Anonymous Gregorian algorithm, valid for 1583 onwards). */
    public static function easter(int $year): Carbon
    {
        $a = $year % 19;
        $b = intdiv($year, 100);
        $c = $year % 100;
        $d = intdiv($b, 4);
        $e = $b % 4;
        $f = intdiv($b + 8, 25);
        $g = intdiv($b - $f + 1, 3);
        $h = (19 * $a + $b - $d - $g + 15) % 30;
        $i = intdiv($c, 4);
        $k = $c % 4;
        $l = (32 + 2 * $e + 2 * $i - $h - $k) % 7;
        $m = intdiv($a + 11 * $h + 22 * $l, 451);
        $month = intdiv($h + $l - 7 * $m + 114, 31);
        $day = (($h + $l - 7 * $m + 114) % 31) + 1;

        return Carbon::create($year, $month, $day, 0, 0, 0, (string) config('app.timezone', 'Africa/Nairobi'));
    }

    /** @return array<int, array{date: string, name: string}> the holidays of a country in a year, in date order */
    public function forYear(string $country, int $year): array
    {
        $c = self::COUNTRIES[strtoupper($country)] ?? throw new BooksException('That country is not in the list. Add its holidays by hand.');
        if ($year < 2000 || $year > 2100) {
            throw new BooksException('Choose a year between 2000 and 2100.');
        }
        $tz = (string) config('app.timezone', 'Africa/Nairobi');
        $out = [];
        foreach ($c['fixed'] as [$md, $name]) {
            $out[] = [Carbon::parse("{$year}-{$md}", $tz)->startOfDay(), $name];
        }
        if ($c['easter']) {
            $e = self::easter($year);
            $out[] = [$e->copy()->subDays(2), 'Good Friday'];
            $out[] = [$e->copy()->addDay(), 'Easter Monday'];
        }
        $list = [];
        $taken = [];
        foreach ($out as [$day, $name]) {
            $list[] = [$day, $name];
            $taken[$day->toDateString()] = true;
        }
        if ($c['sunday_to_monday']) {   // a holiday on a Sunday is kept on the next Monday (unless that is a holiday too: then the next day free)
            foreach ($list as $i => [$day, $name]) {
                if ($day->dayOfWeek === Carbon::SUNDAY) {
                    $to = $day->copy()->addDay();
                    while (isset($taken[$to->toDateString()])) {
                        $to->addDay();
                    }
                    $taken[$to->toDateString()] = true;
                    $list[] = [$to, "{$name} (observed)"];
                }
            }
        }
        usort($list, fn ($a, $b) => $a[0]->timestamp <=> $b[0]->timestamp);

        return array_map(fn ($x) => ['date' => $x[0]->toDateString(), 'name' => $x[1]], $list);
    }

    /** Add a country's holidays for a year (every branch, or one). @return array{added: int, skipped: int} skipped: days that already had a holiday */
    public function import(string $country, int $year, ?int $locationId = null): array
    {
        $added = 0;
        $skipped = 0;
        foreach ($this->forYear($country, $year) as $h) {
            if (Holiday::whereDate('holiday_date', $h['date'])->where('location_id', $locationId)->exists()) {
                $skipped++;
                continue;
            }
            Holiday::create(['holiday_date' => $h['date'], 'name' => $h['name'], 'location_id' => $locationId]);
            $added++;
        }

        return ['added' => $added, 'skipped' => $skipped];
    }
}
