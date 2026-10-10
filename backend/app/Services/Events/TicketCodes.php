<?php

namespace App\Services\Events;

use App\Models\Events\EventTicket;
use App\Services\Codes\CodeFactory;
use App\Services\Codes\CodeResolvers;
use App\Services\Codes\Signed;

/**
 * A ticket's code. It is made only by us: `tk.REFERENCE.SIGNATURE` (see Signed), so a ticket can be checked without a database, can not be guessed or altered, and can never pass
 * as another kind of code. The QR holds the web address of the code (`/q/{code}`): a phone camera opens the ticket page, the door scanner reads the code from it.
 */
final class TicketCodes
{
    public const TYPE = 'tk';

    /** What the QR means, registered once with the core Codes service. */
    public static function register(CodeResolvers $resolvers): void
    {
        $resolvers->register(self::TYPE, 'Event ticket', fn (string $ref) => '/tickets/' . Signed::make(self::TYPE, $ref), null, 'events.checkin');
    }

    public static function code(EventTicket $t): string
    {
        return Signed::make(self::TYPE, $t->reference);
    }

    /** The address in the QR. */
    public static function url(EventTicket $t): string
    {
        return Signed::url(self::TYPE, $t->reference);
    }

    /** The ticket a scanned or typed code stands for (a bare code or the whole address), or null when it is not a genuine ticket code. */
    public static function find(string $scanned): ?EventTicket
    {
        $v = Signed::verify(self::tidy($scanned), self::TYPE);

        return $v ? EventTicket::where('reference', $v['id'])->first() : null;
    }

    /** A code typed in lower case still counts: references are upper-case letters and digits, and the signature is made over that form. */
    private static function tidy(string $scanned): string
    {
        $s = trim($scanned);
        $at = strripos($s, '/q/');
        $head = $at === false ? '' : substr($s, 0, $at + 3);
        $parts = explode('.', preg_replace('/[?#].*$/', '', $at === false ? $s : substr($s, $at + 3)));

        return count($parts) === 3 ? $head . strtolower($parts[0]) . '.' . strtoupper($parts[1]) . '.' . $parts[2] : $s;
    }

    public static function qrSvg(EventTicket $t, float $unit = 6): string
    {
        return CodeFactory::make('qr', self::url($t), ['level' => 'M'])->svg(['unit' => $unit]);
    }

    public static function qrPng(EventTicket $t, int $scale = 8): string
    {
        return CodeFactory::make('qr', self::url($t), ['level' => 'M'])->png(['scale' => $scale]);
    }
}
