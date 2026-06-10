<?php

namespace App\Services;

use App\Models\ReconciliationSession;
use App\Models\ReconciliationLine;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Collection;

class DataEngineService
{
    // ── Known identifier columns per source table ─────────────────
    // Ordered by priority — first match wins during auto-detection
    private const IDENTIFIER_MAP = [
        'orders'                       => ['order_number', 'invoice_number'],
        'payments'                     => ['payment_number', 'mpesa_receipt_number'],
        'auction_orders'               => ['order_number'],
        'hamper_orders'                => ['order_number'],
        'customer_credit_transactions' => ['id'],
        'quotes'                       => ['quote_number', 'reference_number'],
        'quote_requests'               => ['request_number'],
    ];

    // ── Amount-like column patterns (used for variance flagging) ──
    private const AMOUNT_PATTERNS = [
        '/amount/', '/total/', '/subtotal/', '/price/', '/cost/',
        '/tax/', '/discount/', '/credit/', '/balance/', '/paid/',
        '/kes$/', '/fee/', '/charge/',
    ];

    // ════════════════════════════════════════════════════════════════
    // ── PUBLIC: Auto-detect identifier from uploaded file headers ──
    // ════════════════════════════════════════════════════════════════

    /**
     * Given the headers of an uploaded file and optionally a source table hint,
     * returns the best identifier column name or null if none found.
     *
     * @param  string[] $headers      Column names from the uploaded file
     * @param  string|null $sourceTable  TISL table hint (optional)
     * @return array { column: string|null, confidence: 'high'|'medium'|'low', candidates: string[] }
     */
    public function detectIdentifier(array $headers, ?string $sourceTable = null): array
    {
        $normalised = array_map(fn($h) => strtolower(trim($h)), $headers);

        // ── 1. If source table known, try its priority list first ─
        if ($sourceTable && isset(self::IDENTIFIER_MAP[$sourceTable])) {
            foreach (self::IDENTIFIER_MAP[$sourceTable] as $candidate) {
                if (in_array(strtolower($candidate), $normalised, true)) {
                    return [
                        'column'     => $headers[array_search(strtolower($candidate), $normalised)],
                        'confidence' => 'high',
                        'candidates' => [$candidate],
                    ];
                }
            }
        }

        // ── 2. Scan all known identifiers across all tables ───────
        $allKnown = array_unique(array_merge(...array_values(self::IDENTIFIER_MAP)));
        $found    = [];
        foreach ($allKnown as $candidate) {
            if (in_array(strtolower($candidate), $normalised, true)) {
                $found[] = $headers[array_search(strtolower($candidate), $normalised)];
            }
        }

        if (count($found) === 1) {
            return ['column' => $found[0], 'confidence' => 'medium', 'candidates' => $found];
        }

        if (count($found) > 1) {
            // Multiple candidates — return them all, let admin pick
            return ['column' => null, 'confidence' => 'low', 'candidates' => $found];
        }

        // ── 3. Heuristic fallback: look for columns ending in _number or _id ─
        $heuristic = [];
        foreach ($headers as $h) {
            $lower = strtolower($h);
            if (str_ends_with($lower, '_number') || $lower === 'id' || str_ends_with($lower, '_id')) {
                $heuristic[] = $h;
            }
        }

        return [
            'column'     => $heuristic[0] ?? null,
            'confidence' => 'low',
            'candidates' => $heuristic,
        ];
    }

    // ════════════════════════════════════════════════════════════════
    // ── PUBLIC: Run diff between uploaded file and TISL live data ──
    // ════════════════════════════════════════════════════════════════

    /**
     * Core diff engine.
     *
     * @param  array[]     $uploadedRows    Rows from the uploaded file (array of assoc arrays)
     * @param  string      $sourceTable     TISL table to compare against
     * @param  string      $identifierCol   The column to match on (from uploaded file)
     * @param  string      $periodStart     Y-m-d
     * @param  string      $periodEnd       Y-m-d
     * @return array  Full diff result — see return shape below
     */
    public function diff(
        array  $uploadedRows,
        string $sourceTable,
        string $identifierCol,
        string $periodStart,
        string $periodEnd
    ): array {
        // ── Fetch TISL live data for this table + period ──────────
        $tislRows = $this->fetchTislRows($sourceTable, $periodStart, $periodEnd);

        // ── Index both sides by identifier ───────────────────────
        $tislIndex     = $this->indexByIdentifier($tislRows,     $identifierCol, $sourceTable);
        $uploadedIndex = $this->indexByIdentifier($uploadedRows, $identifierCol, null);

        $matched        = [];  // identifier exists on both sides
        $onlyInTisl     = [];  // in TISL but not in uploaded file
        $onlyInFile     = [];  // in uploaded file but not in TISL
        $totalVariance  = 0.0;

        // ── Walk TISL rows ────────────────────────────────────────
        foreach ($tislIndex as $key => $tislRow) {
            if (isset($uploadedIndex[$key])) {
                $fileRow = $uploadedIndex[$key];
                $diff    = $this->diffRow($tislRow, $fileRow);

                $matched[] = [
                    'identifier'       => $key,
                    'status'           => empty($diff['field_diffs']) ? 'clean' : 'mismatch',
                    'field_diffs'      => $diff['field_diffs'],
                    'amount_variance'  => $diff['amount_variance'],
                    'tisl_row'         => $tislRow,
                    'file_row'         => $fileRow,
                ];

                $totalVariance += $diff['amount_variance'];
            } else {
                $onlyInTisl[] = [
                    'identifier' => $key,
                    'tisl_row'   => $tislRow,
                ];
            }
        }

        // ── Walk uploaded rows for anything not in TISL ──────────
        foreach ($uploadedIndex as $key => $fileRow) {
            if (!isset($tislIndex[$key])) {
                $onlyInFile[] = [
                    'identifier' => $key,
                    'file_row'   => $fileRow,
                ];
            }
        }

        $mismatches = array_filter($matched, fn($r) => $r['status'] === 'mismatch');

        return [
            'source_table'      => $sourceTable,
            'identifier_col'    => $identifierCol,
            'period_start'      => $periodStart,
            'period_end'        => $periodEnd,
            'summary'           => [
                'total_tisl'        => count($tislIndex),
                'total_file'        => count($uploadedIndex),
                'matched_clean'     => count(array_filter($matched, fn($r) => $r['status'] === 'clean')),
                'matched_mismatch'  => count($mismatches),
                'only_in_tisl'      => count($onlyInTisl),
                'only_in_file'      => count($onlyInFile),
                'total_variance_kes'=> round($totalVariance, 2),
            ],
            'mismatches'        => array_values($mismatches),
            'only_in_tisl'      => $onlyInTisl,
            'only_in_file'      => $onlyInFile,
            'clean_matches'     => array_values(array_filter($matched, fn($r) => $r['status'] === 'clean')),
        ];
    }

    // ════════════════════════════════════════════════════════════════
    // ── PUBLIC: Persist diff result into reconciliation lines ─────
    // ════════════════════════════════════════════════════════════════

    /**
     * Takes a completed diff result and pushes discrepancies into
     * reconciliation_lines for the given session.
     * Only mismatches and missing rows are persisted — clean matches are skipped.
     *
     * Returns count of lines inserted.
     */
    public function persistDiffToSession(array $diffResult, ReconciliationSession $session): int
    {
        $toInsert = [];
        $now      = now();

        // ── Mismatched rows ───────────────────────────────────────
        foreach ($diffResult['mismatches'] as $row) {
            $tisl = $row['tisl_row'];

            // Best-effort expected/actual from first amount field found
            [$expected, $actual] = $this->extractAmountPair($tisl, $row['file_row']);

            $toInsert[] = [
                'session_id'      => $session->id,
                'subject_table'   => $diffResult['source_table'],
                'subject_id'      => $tisl['id'] ?? null,
                'meta'            => json_encode([
                    'identifier'    => $row['identifier'],
                    'identifier_col'=> $diffResult['identifier_col'],
                    'field_diffs'   => $row['field_diffs'],
                    'amount_variance' => $row['amount_variance'],
                    'tisl_row'      => $tisl,
                    'file_row'      => $row['file_row'],
                    'diff_type'     => 'mismatch',
                ]),
                'expected_amount' => $expected,
                'actual_amount'   => $actual,
                'status'          => 'pending',
                'reviewed_by'     => null,
                'reviewed_at'     => null,
                'dispute_note'    => null,
                'resolution_note' => null,
                'created_at'      => $now,
                'updated_at'      => $now,
            ];
        }

        // ── Only in TISL (missing from external file) ─────────────
        foreach ($diffResult['only_in_tisl'] as $row) {
            $tisl      = $row['tisl_row'];
            $amountCol = $this->findAmountColumn(array_keys($tisl));

            $toInsert[] = [
                'session_id'      => $session->id,
                'subject_table'   => $diffResult['source_table'],
                'subject_id'      => $tisl['id'] ?? null,
                'meta'            => json_encode([
                    'identifier'     => $row['identifier'],
                    'identifier_col' => $diffResult['identifier_col'],
                    'tisl_row'       => $tisl,
                    'diff_type'      => 'only_in_tisl',
                ]),
                'expected_amount' => $amountCol ? (float)($tisl[$amountCol] ?? 0) : 0,
                'actual_amount'   => null,
                'status'          => 'pending',
                'reviewed_by'     => null,
                'reviewed_at'     => null,
                'dispute_note'    => null,
                'resolution_note' => null,
                'created_at'      => $now,
                'updated_at'      => $now,
            ];
        }

        // ── Only in file (not in TISL) ────────────────────────────
        foreach ($diffResult['only_in_file'] as $row) {
            $fileRow   = $row['file_row'];
            $amountCol = $this->findAmountColumn(array_keys($fileRow));

            $toInsert[] = [
                'session_id'      => $session->id,
                'subject_table'   => $diffResult['source_table'],
                'subject_id'      => null,  // no TISL record
                'meta'            => json_encode([
                    'identifier'     => $row['identifier'],
                    'identifier_col' => $diffResult['identifier_col'],
                    'file_row'       => $fileRow,
                    'diff_type'      => 'only_in_file',
                ]),
                'expected_amount' => null,
                'actual_amount'   => $amountCol ? (float)($fileRow[$amountCol] ?? 0) : 0,
                'status'          => 'pending',
                'reviewed_by'     => null,
                'reviewed_at'     => null,
                'dispute_note'    => null,
                'resolution_note' => null,
                'created_at'      => $now,
                'updated_at'      => $now,
            ];
        }

        if (empty($toInsert)) return 0;

        foreach (array_chunk($toInsert, 500) as $chunk) {
            ReconciliationLine::insert($chunk);
        }

        return count($toInsert);
    }

    // ════════════════════════════════════════════════════════════════
    // ── PRIVATE: Fetch TISL rows for a table + period ─────────────
    // ════════════════════════════════════════════════════════════════

    private function fetchTislRows(string $table, string $periodStart, string $periodEnd): array
    {
        $query = DB::table($table)
            ->whereBetween('created_at', [
                "{$periodStart} 00:00:00",
                "{$periodEnd} 23:59:59",
            ]);

        // Soft-delete aware
        if (in_array($table, ['orders', 'auction_orders', 'quotes', 'quote_requests'])) {
            $query->whereNull('deleted_at');
        }

        return $query->get()->map(fn($row) => (array) $row)->all();
    }

    // ════════════════════════════════════════════════════════════════
    // ── PRIVATE: Index rows by identifier ─────────────────────────
    // ════════════════════════════════════════════════════════════════

    /**
     * Build a key → row map. Tries the given $identifierCol first,
     * then falls back to the table's known identifiers.
     */
    private function indexByIdentifier(
        array   $rows,
        string  $identifierCol,
        ?string $sourceTable
    ): array {
        $index = [];

        // Determine fallback columns to try
        $fallbacks = $sourceTable ? (self::IDENTIFIER_MAP[$sourceTable] ?? []) : [];
        $tryColumns = array_unique(array_merge([$identifierCol], $fallbacks));

        foreach ($rows as $row) {
            $key = null;
            foreach ($tryColumns as $col) {
                // Case-insensitive column lookup
                $value = $this->getColumnCaseInsensitive($row, $col);
                if ($value !== null && $value !== '') {
                    $key = (string) $value;
                    break;
                }
            }

            if ($key !== null) {
                $index[$key] = $row;
            }
        }

        return $index;
    }

    // ════════════════════════════════════════════════════════════════
    // ── PRIVATE: Diff two matched rows field by field ─────────────
    // ════════════════════════════════════════════════════════════════

    private function diffRow(array $tislRow, array $fileRow): array
    {
        $fieldDiffs     = [];
        $amountVariance = 0.0;

        // Normalise file row keys to lowercase for comparison
        $fileNormalised = [];
        foreach ($fileRow as $k => $v) {
            $fileNormalised[strtolower(trim($k))] = $v;
        }

        foreach ($tislRow as $col => $tislValue) {
            $colLower  = strtolower($col);
            $fileValue = $fileNormalised[$colLower] ?? null;

            // Skip columns not present in the file at all
            if ($fileValue === null) continue;

            // Skip metadata / timestamp columns
            if (in_array($colLower, ['created_at', 'updated_at', 'deleted_at', 'id'])) continue;

            $tislNorm = $this->normaliseValue($tislValue);
            $fileNorm = $this->normaliseValue($fileValue);

            if ($tislNorm !== $fileNorm) {
                $isAmount = $this->isAmountColumn($colLower);

                $diff = [
                    'column'     => $col,
                    'tisl_value' => $tislValue,
                    'file_value' => $fileValue,
                    'is_amount'  => $isAmount,
                ];

                if ($isAmount) {
                    $variance            = (float)$fileValue - (float)$tislValue;
                    $diff['variance']    = round($variance, 2);
                    $amountVariance     += $variance;
                }

                $fieldDiffs[] = $diff;
            }
        }

        return [
            'field_diffs'     => $fieldDiffs,
            'amount_variance' => round($amountVariance, 2),
        ];
    }

    // ════════════════════════════════════════════════════════════════
    // ── PRIVATE: Helpers ──────────────────────────────────────────
    // ════════════════════════════════════════════════════════════════

    private function normaliseValue($value): string
    {
        if (is_null($value))              return '';
        if (is_bool($value))              return $value ? '1' : '0';
        if (is_numeric($value))           return rtrim(rtrim(number_format((float)$value, 4, '.', ''), '0'), '.');
        return strtolower(trim((string)$value));
    }

    private function isAmountColumn(string $col): bool
    {
        foreach (self::AMOUNT_PATTERNS as $pattern) {
            if (preg_match($pattern, $col)) return true;
        }
        return false;
    }

    private function findAmountColumn(array $columns): ?string
    {
        foreach ($columns as $col) {
            if ($this->isAmountColumn(strtolower($col))) return $col;
        }
        return null;
    }

    private function extractAmountPair(array $tislRow, array $fileRow): array
    {
        $amountCol = $this->findAmountColumn(array_keys($tislRow));
        $expected  = $amountCol ? (float)($tislRow[$amountCol] ?? 0) : 0;

        $fileAmountCol = $this->findAmountColumn(array_keys($fileRow));
        $actual        = $fileAmountCol ? (float)($fileRow[$fileAmountCol] ?? 0) : 0;

        return [$expected, $actual];
    }

    private function getColumnCaseInsensitive(array $row, string $col): mixed
    {
        // Direct hit
        if (array_key_exists($col, $row)) return $row[$col];

        // Case-insensitive scan
        $colLower = strtolower($col);
        foreach ($row as $k => $v) {
            if (strtolower($k) === $colLower) return $v;
        }

        return null;
    }
}
