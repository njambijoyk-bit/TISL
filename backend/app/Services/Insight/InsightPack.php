<?php

namespace App\Services\Insight;

use App\Models\User;

/**
 * One thing the calculator can explain. A pack READS the system's own figures and answers with blocks the calculator draws
 * (facts, tables, notes, a verdict). It never writes to any table: the engine's tests fail if one does.
 *
 * A pack says which module it belongs to (null = Core; it vanishes when that module is off) and which roles may use it — the roles
 * of the pages the figures come from, so the calculator never shows a role anything its own pages would refuse.
 */
interface InsightPack
{
    /** Stable key, e.g. "units.voucher". */
    public function key(): string;

    public function title(): string;

    /** The module it belongs to (null = Core). */
    public function module(): ?string;

    /** The permission a person needs to be answered by this pack (for example books.view). */
    public function permission(): string;

    /** Context types it answers: "voucher", "unit_price" … */
    public function contexts(): array;

    /** Does it have something to say about this exact context (e.g. a journal about points)? */
    public function applies(array $context): bool;

    /** @return array{title:string, subtitle?:string, blocks:array, basis?:string, has_another?:bool} */
    public function answer(array $context, Lookback $lookback, User $user, int $example = 0): array;
}
