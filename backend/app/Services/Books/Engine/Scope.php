<?php

namespace App\Services\Books\Engine;

use App\Services\CostCentres\CostCentreService;

/**
 * What a report is asked about: the dates, a cost centre (and everything under it), a branch, and which area's branch limit applies.
 * Every report goes through this, so the filters mean the same thing everywhere: a cost centre or branch always narrows the ENTRY lines
 * (`voucher_entries.cost_centre_id` / `location_id`), never the voucher header.
 *
 * Opening balances belong to the whole business, not to a cost centre or a branch, so a filtered report starts from nothing and shows movement only.
 */
final class Scope
{
    /**
     * @param  int[]|null  $costCentreIds  the chosen cost centre and its descendants; null for no cost-centre filter
     */
    private function __construct(
        public readonly ?string $from,
        public readonly ?string $to,
        public readonly ?array $costCentreIds,
        public readonly ?int $locationId,
        public readonly string $area,
    ) {}

    /** A scope with no filters beyond the dates. */
    public static function dates(?string $from, ?string $to, string $area = 'books'): self
    {
        return new self($from, $to, null, null, $area);
    }

    /**
     * From the filters a screen sends: from, to, cost_centre_id, location_id. A cost centre or branch is only honoured once the books have their
     * dimensions (database script 102); before that the filter is ignored, as the old reports did.
     */
    public static function fromInput(array $in, string $area = 'books'): self
    {
        $ready = fn () => app(CostCentreService::class)->booksReady();
        $cc = ! empty($in['cost_centre_id']) && $ready() ? app(CostCentreService::class)->withDescendants((int) $in['cost_centre_id']) : null;
        $loc = ! empty($in['location_id']) && $ready() ? (int) $in['location_id'] : null;

        return new self(self::date($in['from'] ?? null), self::date($in['to'] ?? null), $cc, $loc, $area);
    }

    public function between(?string $from, ?string $to): self
    {
        return new self($from, $to, $this->costCentreIds, $this->locationId, $this->area);
    }

    /** The same filters without any dates. */
    public function undated(): self
    {
        return $this->between(null, null);
    }

    /** Is a cost centre or branch chosen? Then opening balances are left out and the figures will not balance on their own. */
    public function dimensional(): bool
    {
        return $this->costCentreIds !== null || $this->locationId !== null;
    }

    private static function date(mixed $v): ?string
    {
        if ($v === null || $v === '') {
            return null;
        }
        $d = \DateTimeImmutable::createFromFormat('!Y-m-d', substr((string) $v, 0, 10));

        return $d && $d->format('Y-m-d') === substr((string) $v, 0, 10) ? $d->format('Y-m-d') : null;
    }
}
