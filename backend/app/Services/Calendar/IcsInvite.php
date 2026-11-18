<?php

namespace App\Services\Calendar;

use Carbon\Carbon;

/**
 * One meeting as a calendar file (docs/PROJECTS_STAGE6_SPEC.md, build 6.6): REQUEST for an invitation or a move (the sequence goes up each time,
 * so calendars replace the old one), CANCEL when it is called off. Times are written in UTC.
 */
class IcsInvite
{
    /**
     * @param array{uid: string, sequence: int, method: string, starts_at: Carbon, ends_at: Carbon, title: string, description?: ?string, location?: ?string, url?: ?string,
     *              organiser?: array{name: string, email: ?string}, attendees?: array<int, array{name: string, email: ?string}>} $m
     */
    public static function make(array $m): string
    {
        $esc = fn (?string $s) => str_replace(['\\', ';', ',', "\r\n", "\n"], ['\\\\', '\;', '\,', '\n', '\n'], (string) $s);
        $method = $m['method'] === 'CANCEL' ? 'CANCEL' : 'REQUEST';
        $lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//TISL//Meetings//EN', 'CALSCALE:GREGORIAN', "METHOD:{$method}", 'BEGIN:VEVENT',
            'UID:' . $m['uid'], 'SEQUENCE:' . (int) $m['sequence'], 'DTSTAMP:' . now()->utc()->format('Ymd\THis\Z'),
            'DTSTART:' . $m['starts_at']->copy()->utc()->format('Ymd\THis\Z'), 'DTEND:' . $m['ends_at']->copy()->utc()->format('Ymd\THis\Z'),
            'SUMMARY:' . $esc($m['title']), 'STATUS:' . ($method === 'CANCEL' ? 'CANCELLED' : 'CONFIRMED')];
        if (! empty($m['description'])) {
            $lines[] = 'DESCRIPTION:' . $esc($m['description']);
        }
        if (! empty($m['location'])) {
            $lines[] = 'LOCATION:' . $esc($m['location']);
        }
        if (! empty($m['url'])) {
            $lines[] = 'URL:' . $m['url'];
        }
        if (! empty($m['organiser']['email'])) {
            $lines[] = 'ORGANIZER;CN=' . $esc($m['organiser']['name']) . ':mailto:' . $m['organiser']['email'];
        }
        foreach ($m['attendees'] ?? [] as $a) {
            if (! empty($a['email'])) {
                $lines[] = 'ATTENDEE;CN=' . $esc($a['name']) . ';ROLE=REQ-PARTICIPANT:mailto:' . $a['email'];
            }
        }
        array_push($lines, 'END:VEVENT', 'END:VCALENDAR');
        $fold = function (string $line): string {
            $out = '';
            while (strlen($line) > 73) {
                $cut = 73;
                while ($cut > 1 && (ord($line[$cut]) & 0xC0) === 0x80) {
                    $cut--;   // never split a character in two
                }
                $out .= substr($line, 0, $cut) . "\r\n ";
                $line = substr($line, $cut);
            }

            return $out . $line;
        };

        return implode("\r\n", array_map($fold, $lines)) . "\r\n";
    }
}
