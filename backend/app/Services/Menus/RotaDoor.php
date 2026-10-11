<?php

namespace App\Services\Menus;

use App\Services\Codes\CodeFactory;
use App\Services\Codes\Signed;
use Illuminate\Support\Carbon;

/**
 * The code at the door. A QR shown at a branch (on a screen that keeps changing, or printed) proves the chef who scanned it is standing there: only someone at the door can read it.
 * It is a signed code (see Signed) that names the branch and a time slot, so it can not be made up or reused for another branch. A *rotating* code lasts a few minutes (the slot now
 * and the one just before, so a scan at the edge of a slot still works) and a photo of it is useless later; a *fixed* code is printed and never changes (weaker: a photo works). The scan opens a
 * page on this site where the signed-in chef presses Clock in.
 */
class RotaDoor
{
    public const TYPE = 'dr';

    public function mode(): string
    {
        return (string) MenusSettings::all()['rota_clock_qr'];
    }

    private function slotLength(): int
    {
        return max(1, (int) MenusSettings::all()['rota_clock_qr_minutes']) * 60;
    }

    private function slot(?Carbon $at = null): int
    {
        return $this->mode() === 'fixed' ? 0 : intdiv(($at ?? now())->timestamp, $this->slotLength());
    }

    /** The code for a branch now (or in a given slot). */
    public function code(int $locationId, ?int $slot = null): string
    {
        return Signed::make(self::TYPE, $locationId.'X'.strtoupper(base_convert((string) ($slot ?? $this->slot()), 10, 36)));
    }

    /** The address the QR holds: it opens the clock-in page for that branch. */
    public function url(string $code): string
    {
        return rtrim((string) config('app.frontend_url'), '/').'/clock/'.$code;
    }

    /** @return string the QR as an image (SVG), for the door screen or to print */
    public function svg(int $locationId): string
    {
        return CodeFactory::make('qr', $this->url($this->code($locationId)), ['level' => 'M'])->svg(['unit' => 8]);
    }

    /** The branch a scanned code stands for, or null when it is not ours, is for another purpose, has run out, or door codes are switched off. */
    public function verify(string $scanned, ?Carbon $at = null): ?int
    {
        $mode = $this->mode();
        if ($mode === 'off') {
            return null;
        }
        $hit = Signed::verify($scanned, self::TYPE);
        if (! $hit || ! preg_match('/^(\d+)X([0-9A-Z]+)$/', strtoupper($hit['id']), $m)) {
            return null;
        }
        $slot = (int) base_convert(strtolower($m[2]), 36, 10);
        $now = $this->slot($at);
        $fresh = $mode === 'fixed' ? $slot === 0 : ($slot === $now || $slot === $now - 1);

        return $fresh ? (int) $m[1] : null;
    }

    /** How many seconds this code has left (rotating), for the door screen. */
    public function secondsLeft(?Carbon $at = null): ?int
    {
        if ($this->mode() !== 'rotating') {
            return null;
        }
        $len = $this->slotLength();

        return $len - (($at ?? now())->timestamp % $len);
    }
}
