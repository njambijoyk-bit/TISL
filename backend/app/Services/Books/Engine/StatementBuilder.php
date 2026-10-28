<?php

namespace App\Services\Books\Engine;

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Builds the rows of a financial statement from the statements tree (database/sql/227_statements.sql) and the ledgers on it.
 *
 * An amount here is a *vector*: one figure per column, keyed by column name (always `total`; the months of a month-by-month report as well), so a
 * report can add, subtract and compare every column the same way. Amounts are in the natural sign of what they are: an asset or an expense is
 * positive when it is a debit, a liability or an income when it is a credit.
 *
 * The rows come out flat, in reading order, each with its depth and the key of its parent, so a screen can fold and unfold them:
 *   heading     a section (Assets, Equity...), carrying the total of everything under it
 *   line        a statement line, carrying the total of the ledgers on it
 *   ledger      one ledger on a line (opens its statement)
 *   subtotal    a computed row (Gross profit...), added by the report
 * Ledgers on no line of this statement are "loose": the report decides where they are shown, so every figure still adds up.
 */
final class StatementBuilder
{
    /** @var array<int, object> the active rows of the tree by id */
    private array $byId = [];

    /** @var array<int, int[]> parent id (0 for a root) => child ids in reading order */
    private array $children = [];

    public function __construct()
    {
        if (! self::available()) {
            return;
        }
        foreach (DB::table('statements')->where('is_active', 1)->orderBy('sort_order')->orderBy('id')->get() as $r) {
            $this->byId[(int) $r->id] = $r;
            $this->children[(int) ($r->parent_id ?? 0)][] = (int) $r->id;
        }
    }

    /** Has script 227 been run? */
    public static function available(): bool
    {
        return Schema::hasTable('statements');
    }

    // ── vectors ────────────────────────────────────────────────────────

    /** @param string[] $cols */
    public static function zero(array $cols): array
    {
        return array_fill_keys($cols, 0.0);
    }

    public static function plus(array $a, array $b): array
    {
        foreach ($b as $k => $v) {
            $a[$k] = ($a[$k] ?? 0.0) + $v;
        }

        return $a;
    }

    public static function minus(array $a, array $b): array
    {
        foreach ($b as $k => $v) {
            $a[$k] = ($a[$k] ?? 0.0) - $v;
        }

        return $a;
    }

    public static function round(array $a): array
    {
        return array_map(fn ($v) => round($v, 2), $a);
    }

    /** Is every column nothing at the cent? */
    public static function isZero(array $a): bool
    {
        foreach ($a as $v) {
            if (abs($v) >= 0.005) {
                return false;
            }
        }

        return true;
    }

    // ── the tree ───────────────────────────────────────────────────────

    public function rootId(string $code): ?int
    {
        foreach ($this->children[0] ?? [] as $id) {
            if ($this->byId[$id]->code === $code) {
                return $id;
            }
        }

        return null;
    }

    public function node(int $id): object
    {
        return $this->byId[$id];
    }

    /** @return int[] */
    public function childrenOf(int $id): array
    {
        return $this->children[$id] ?? [];
    }

    /** @return int[] every line (not section) under a node, in reading order */
    public function linesUnder(int $id): array
    {
        $out = [];
        foreach ($this->childrenOf($id) as $c) {
            $out = array_merge($out, $this->byId[$c]->kind === 'line' ? [$c] : $this->linesUnder($c));
        }

        return $out;
    }

    /**
     * Sort the ledgers onto the lines of one statement.
     *
     * @param  array<int, array>  $ledgers  each: id, name, group, nature, statement_id, amounts (a vector, natural sign)
     * @return array{by_line: array<int, array[]>, loose: array[]}  loose = on no line of this statement
     */
    public function place(string $root, array $ledgers): array
    {
        $rootId = $this->rootId($root);
        $lines = $rootId ? array_flip($this->linesUnder($rootId)) : [];
        $byLine = [];
        $loose = [];
        foreach ($ledgers as $l) {
            $line = (int) ($l['statement_id'] ?? 0);
            if ($line && isset($lines[$line])) {
                $byLine[$line][] = $l;
            } else {
                $loose[] = $l;
            }
        }

        return ['by_line' => $byLine, 'loose' => $loose];
    }

    // ── rows ───────────────────────────────────────────────────────────

    /** The row of one ledger. */
    public function ledgerRow(array $l, string $parent, int $depth): array
    {
        return ['key' => 'ledger:' . $l['id'], 'parent' => $parent, 'type' => 'ledger', 'depth' => $depth, 'code' => null, 'name' => $l['name'], 'group' => $l['group'] ?? null,
            'ledger_id' => (int) $l['id'], 'amounts' => self::round($l['amounts'])];
    }

    /**
     * A line and the ledgers on it. Nothing is returned for a line with nothing on it unless `$showZero`; a ledger with nothing in any column is left
     * out the same way.
     *
     * @param  array[]  $ledgers  the ledgers on this line
     * @return array{rows: array[], total: array}
     */
    public function lineBlock(object $line, array $ledgers, array $cols, bool $showZero, int $depth, string $parent): array
    {
        $key = 'line:' . $line->code;
        usort($ledgers, fn ($a, $b) => strcasecmp($a['name'], $b['name']));
        $total = self::zero($cols);
        $ledgerRows = [];
        foreach ($ledgers as $l) {
            $total = self::plus($total, $l['amounts']);
            if ($showZero || ! self::isZero($l['amounts'])) {
                $ledgerRows[] = $this->ledgerRow($l, $key, $depth + 1);
            }
        }
        if (! $showZero && ! $ledgerRows && self::isZero($total)) {
            return ['rows' => [], 'total' => $total];
        }
        $row = ['key' => $key, 'parent' => $parent, 'type' => 'line', 'depth' => $depth, 'code' => $line->code, 'name' => $line->name, 'nature' => $line->nature,
            'amounts' => self::round($total), 'expandable' => (bool) $ledgerRows];

        return ['rows' => array_merge([$row], $ledgerRows), 'total' => $total];
    }

    /**
     * A section: its lines and sub-sections, and the total of them all. A report can add rows of its own at the end of a section (`$extra[code]`:
     * rows, and the vector they add to the section's total).
     *
     * @param  array<int, array[]>  $byLine
     * @param  array<string, array{rows: array[], total: array}>  $extra
     * @return array{rows: array[], total: array}
     */
    public function headingBlock(int $id, array $byLine, array $cols, bool $showZero, int $depth, string $parent, array $extra = []): array
    {
        $node = $this->byId[$id];
        $key = 'heading:' . $node->code;
        $rows = [];
        $total = self::zero($cols);
        foreach ($this->childrenOf($id) as $c) {
            $child = $this->byId[$c];
            $block = $child->kind === 'line'
                ? $this->lineBlock($child, $byLine[$c] ?? [], $cols, $showZero, $depth + 1, $key)
                : $this->headingBlock($c, $byLine, $cols, $showZero, $depth + 1, $key, $extra);
            $rows = array_merge($rows, $block['rows']);
            $total = self::plus($total, $block['total']);
        }
        if (isset($extra[$node->code])) {
            foreach ($extra[$node->code]['rows'] as $r) {
                $rows[] = $r + ['parent' => $key, 'depth' => $depth + 1];   // a row that carries its own parent and depth (a line with ledgers) keeps them
            }
            $total = self::plus($total, $extra[$node->code]['total']);
        }
        if (! $showZero && ! $rows) {
            return ['rows' => [], 'total' => $total];
        }
        $head = ['key' => $key, 'parent' => $parent, 'type' => 'heading', 'depth' => $depth, 'code' => $node->code, 'name' => $node->name, 'amounts' => self::round($total), 'expandable' => true];

        return ['rows' => array_merge([$head], $rows), 'total' => $total];
    }

    /** The column names of a report: `total`, then (month by month) each month of the period. */
    public static function columns(bool $byMonth, ?string $from, ?string $to): array
    {
        $cols = ['total'];
        if ($byMonth && $from && $to) {
            for ($d = new \DateTimeImmutable(substr($from, 0, 7) . '-01'); $d->format('Y-m') <= substr($to, 0, 7); $d = $d->modify('+1 month')) {
                $cols[] = $d->format('Y-m');
            }
        }

        return $cols;
    }
}
