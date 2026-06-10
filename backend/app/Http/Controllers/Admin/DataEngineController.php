<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\ReconciliationSession;
use App\Services\DataEngineService;
use App\Services\AiAnalyticsService;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Symfony\Component\HttpFoundation\StreamedResponse;

class DataEngineController extends Controller
{
    public function __construct(
        protected DataEngineService  $engine,
        protected AiAnalyticsService $ai,
    ) {}

    // ════════════════════════════════════════════════════════════════
    // ── MODE 1: Smart Export ─────────────────────────────────────────
    // ════════════════════════════════════════════════════════════════

    /**
     * POST /admin/data-engine/export
     *
     * Body:
     *   source       string   required  — table name (orders, payments, etc.)
     *   period_start date     required
     *   period_end   date     required
     *   format       string   optional  — 'csv' (default) | 'json'
     *   columns      array    optional  — subset of columns to include
     */
    public function export(Request $request): StreamedResponse|JsonResponse
    {
        $data = $request->validate([
            'source'       => 'required|in:orders,payments,auction_orders,hamper_orders,customer_credit_transactions',
            'period_start' => 'required|date',
            'period_end'   => 'required|date|after_or_equal:period_start',
            'format'       => 'nullable|in:csv,json',
            'columns'      => 'nullable|array',
            'columns.*'    => 'string',
        ]);

        $source      = $data['source'];
        $periodStart = $data['period_start'];
        $periodEnd   = $data['period_end'];
        $format      = $data['format'] ?? 'csv';
        $wantCols    = $data['columns'] ?? [];

        // ── Build query ───────────────────────────────────────────
        $rows = $this->buildExportQuery($source, $periodStart, $periodEnd, $wantCols);

        if ($rows->isEmpty()) {
            return response()->json(['message' => 'No records found for the selected period.'], 404);
        }

        $filename = "{$source}_{$periodStart}_{$periodEnd}_" . now()->format('His');

        if ($format === 'json') {
            return response()->json([
                'source'       => $source,
                'period_start' => $periodStart,
                'period_end'   => $periodEnd,
                'total'        => $rows->count(),
                'rows'         => $rows,
            ]);
        }

        // ── Stream CSV ────────────────────────────────────────────
        return response()->stream(function () use ($rows) {
            $handle = fopen('php://output', 'w');

            // Headers from first row
            fputcsv($handle, array_keys((array) $rows->first()));

            foreach ($rows as $row) {
                fputcsv($handle, array_values((array) $row));
            }

            fclose($handle);
        }, 200, [
            'Content-Type'        => 'text/csv',
            'Content-Disposition' => "attachment; filename=\"{$filename}.csv\"",
            'X-Accel-Buffering'   => 'no',
            'Cache-Control'       => 'no-cache',
        ]);
    }

    /**
     * GET /admin/data-engine/export/columns?source=orders
     *
     * Returns available columns for a given source table so the frontend
     * can render a column picker before export.
     */
    public function exportColumns(Request $request): JsonResponse
    {
        $source = $request->validate([
            'source' => 'required|in:orders,payments,auction_orders,hamper_orders,customer_credit_transactions',
        ])['source'];

        return response()->json([
            'source'     => $source,
            'identifier' => $this->identifierColumn($source),
            'columns'    => $this->exportableColumns($source),
        ]);
    }

    // ════════════════════════════════════════════════════════════════
    // ── MODE 2: Import + Diff ────────────────────────────────────────
    // ════════════════════════════════════════════════════════════════

    /**
     * POST /admin/data-engine/detect-identifier
     *
     * Body (multipart):
     *   file         file     required  — CSV or Excel file
     *   source       string   optional  — table hint for smarter detection
     *
     * Returns detected identifier column + confidence + candidates.
     * Frontend shows this result and lets admin confirm or override before running diff.
     */
    public function detectIdentifier(Request $request): JsonResponse
    {
        $request->validate([
            'file'   => 'required|file|mimes:csv,txt,xlsx,xls|max:10240',
            'source' => 'nullable|in:orders,payments,auction_orders,hamper_orders,customer_credit_transactions',
        ]);

        $headers = $this->parseFileHeaders($request->file('file'));

        if (empty($headers)) {
            return response()->json(['message' => 'Could not parse file headers.'], 422);
        }

        $detection = $this->engine->detectIdentifier($headers, $request->source);

        return response()->json([
            'headers'   => $headers,
            'detection' => $detection,
        ]);
    }

    /**
     * POST /admin/data-engine/diff
     *
     * Body (multipart):
     *   file             file     required
     *   source           string   required  — TISL table to compare against
     *   identifier_col   string   required  — column to match on
     *   period_start     date     required
     *   period_end       date     required
     *   persist          boolean  optional  — if true, creates a ReconciliationSession and saves lines
     *   session_notes    string   optional  — notes for the session if persist=true
     */
    public function diff(Request $request): JsonResponse
    {
        $data = $request->validate([
            'file'           => 'required|file|mimes:csv,txt,xlsx,xls|max:20480',
            'source'         => 'required|in:orders,payments,auction_orders,hamper_orders,customer_credit_transactions',
            'identifier_col' => 'required|string',
            'period_start'   => 'required|date',
            'period_end'     => 'required|date|after_or_equal:period_start',
            'persist'        => 'nullable|boolean',
            'session_notes'  => 'nullable|string|max:1000',
        ]);

        $rows = $this->parseFileRows($request->file('file'));

        if (empty($rows)) {
            return response()->json(['message' => 'File is empty or could not be parsed.'], 422);
        }

        // ── Run diff ──────────────────────────────────────────────
        $diffResult = $this->engine->diff(
            uploadedRows:  $rows,
            sourceTable:   $data['source'],
            identifierCol: $data['identifier_col'],
            periodStart:   $data['period_start'],
            periodEnd:     $data['period_end'],
        );

        $response = ['diff' => $diffResult, 'session' => null];

        // ── Optionally persist to reconciliation session ───────────
        if (!empty($data['persist'])) {
            $session = $this->createExternalImportSession(
                source:      $data['source'],
                periodStart: $data['period_start'],
                periodEnd:   $data['period_end'],
                notes:       $data['session_notes'] ?? null,
                diffSummary: $diffResult['summary'],
            );

            $lineCount = $this->engine->persistDiffToSession($diffResult, $session);

            $session->recalculateSummary();

            $response['session'] = [
                'id'             => $session->id,
                'session_number' => $session->session_number,
                'lines_created'  => $lineCount,
            ];
        }

        return response()->json($response);
    }

    // ════════════════════════════════════════════════════════════════
    // ── MODE 3: AI Analysis of a diff / session ───────────────────
    // ════════════════════════════════════════════════════════════════

    /**
     * POST /admin/data-engine/analyse
     *
     * Body:
     *   session_id    integer  optional  — analyse a persisted session's lines
     *   diff_result   array    optional  — analyse a raw diff result (not yet persisted)
     *   output_type   string   optional  — summary|insight|risk|recommendation
     *   custom_prompt string   optional
     *
     * One of session_id or diff_result is required.
     */
    public function analyse(Request $request): JsonResponse
    {
        $data = $request->validate([
            'session_id'    => 'nullable|integer|exists:reconciliation_sessions,id',
            'diff_result'   => 'nullable|array',
            'output_type'   => 'nullable|in:summary,insight,risk,recommendation',
            'custom_prompt' => 'nullable|string|max:1000',
        ]);

        if (empty($data['session_id']) && empty($data['diff_result'])) {
            return response()->json(['message' => 'Provide either session_id or diff_result.'], 422);
        }

        try {
            $output = $this->ai->analyse(
                moduleKey:    'reconciliation',
                adminId:      Auth::id(),
                entityId:     $data['session_id'] ?? null,
                entityType:   $data['session_id'] ? 'reconciliation_session' : null,
                outputType:   $data['output_type'] ?? 'summary',
                customPrompt: $data['custom_prompt'] ?? null,
                // Pass raw diff result for non-persisted analysis
                extraData:    !empty($data['diff_result']) ? ['diff_result' => $data['diff_result']] : [],
            );

            return response()->json(['success' => true, 'output' => $output]);

        } catch (\Exception $e) {
            return response()->json(['success' => false, 'message' => $e->getMessage()], 500);
        }
    }

    // ════════════════════════════════════════════════════════════════
    // ── PRIVATE: Export helpers ───────────────────────────────────
    // ════════════════════════════════════════════════════════════════

    private function buildExportQuery(
        string $source,
        string $periodStart,
        string $periodEnd,
        array  $wantCols,
    ) {
        $cols       = $this->exportableColumns($source);
        $selectCols = empty($wantCols)
            ? $cols
            : array_intersect($cols, $wantCols);

        // Always prepend the identifier column so it's column 1
        $identifier = $this->identifierColumn($source);
        $selectCols = array_unique(array_merge([$identifier], $selectCols));

        $query = DB::table($source)
            ->select(array_map(fn($c) => "{$source}.{$c}", $selectCols))
            ->whereBetween("{$source}.created_at", [
                "{$periodStart} 00:00:00",
                "{$periodEnd} 23:59:59",
            ]);

        // Soft-delete aware
        if (in_array($source, ['orders', 'auction_orders'])) {
            $query->whereNull("{$source}.deleted_at");
        }

        // Join customer name for tables that have customer_id
        if (in_array($source, ['orders', 'payments', 'auction_orders', 'customer_credit_transactions'])) {
            $query->leftJoin('customers', 'customers.id', '=', "{$source}.customer_id")
                  ->addSelect(DB::raw("CONCAT(customers.first_name, ' ', customers.last_name) AS customer_name"));
        }

        // For hamper_orders, join order_number from orders
        if ($source === 'hamper_orders') {
            $query->leftJoin('orders', 'orders.id', '=', 'hamper_orders.order_id')
                  ->addSelect('orders.order_number AS linked_order_number')
                  ->leftJoin('customers', 'customers.id', '=', 'hamper_orders.customer_id')
                  ->addSelect(DB::raw("CONCAT(customers.first_name, ' ', customers.last_name) AS customer_name"));
        }

        return $query->get();
    }

    /**
     * The primary identifier column per source — always exported as column 1.
     */
    private function identifierColumn(string $source): string
    {
        return match($source) {
            'orders'                       => 'order_number',
            'payments'                     => 'payment_number',
            'auction_orders'               => 'order_number',
            'hamper_orders'                => 'order_number',
            'customer_credit_transactions' => 'id',
        };
    }

    /**
     * Curated exportable columns per source.
     * Excludes raw JSON blobs, internal FK IDs, and audit noise by default.
     * Admin can always request a subset via the columns param.
     */
    private function exportableColumns(string $source): array
    {
        return match($source) {
            'orders' => [
                'order_number', 'invoice_number', 'type', 'order_type',
                'status', 'payment_status', 'payment_method',
                'currency', 'exchange_rate_to_kes',
                'subtotal', 'subtotal_kes', 'tax', 'discount',
                'shipping_cost', 'total', 'total_kes',
                'store_credit_deduction', 'store_credit_deduction_kes',
                'loyalty_points_earned',
                'referral_discount', 'promo_discount',
                'delivery_method', 'shipping_method_name',
                'tracking_number', 'courier_company',
                'confirmed_at', 'shipped_at', 'delivered_at', 'cancelled_at',
                'created_at',
            ],
            'payments' => [
                'payment_number', 'method', 'status', 'currency',
                'exchange_rate_to_kes',
                'amount_expected', 'amount_received', 'balance_remaining', 'is_partial',
                'snapshot_subtotal_kes', 'snapshot_tax_kes', 'snapshot_discount_kes',
                'snapshot_shipping_kes', 'snapshot_total_kes',
                'snapshot_amount_previously_paid_kes', 'snapshot_amount_still_owed_kes',
                'mpesa_receipt_number', 'mpesa_transaction_date', 'mpesa_amount_confirmed',
                'dispute_status',
                'confirmed_at', 'failed_at', 'voided_at',
                'created_at',
            ],
            'auction_orders' => [
                'order_number', 'product_name', 'product_sku', 'brand_name',
                'winning_bid_amount', 'charged_amount', 'quantity',
                'subtotal', 'tax', 'shipping_cost', 'total',
                'currency', 'exchange_rate_to_kes',
                'subtotal_kes', 'tax_kes', 'shipping_cost_kes', 'total_kes',
                'payment_method', 'payment_status', 'payment_reference',
                'status', 'delivery_method', 'shipping_method_name',
                'tracking_number', 'courier_company',
                'confirmed_at', 'shipped_at', 'delivered_at', 'cancelled_at',
                'created_at',
            ],
            'hamper_orders' => [
                'order_number', 'status',
                'subtotal', 'vat_amount', 'discount_amount',
                'store_credit_used', 'shipping_cost', 'total',
                'shipping_method_name', 'loyalty_points_earned',
                'created_at',
            ],
            'customer_credit_transactions' => [
                'id', 'type', 'direction', 'amount',
                'balance_before', 'balance_after',
                'reference_type', 'reference_id', 'note',
                'created_at',
            ],
        };
    }

    // ════════════════════════════════════════════════════════════════
    // ── PRIVATE: File parsing ─────────────────────────────────────
    // ════════════════════════════════════════════════════════════════

    /**
     * Parse just the header row from a CSV/Excel file.
     */
    private function parseFileHeaders(\Illuminate\Http\UploadedFile $file): array
    {
        $ext = strtolower($file->getClientOriginalExtension());

        if (in_array($ext, ['xlsx', 'xls'])) {
            return $this->parseExcelHeaders($file->getRealPath());
        }

        // CSV / txt
        $handle = fopen($file->getRealPath(), 'r');
        if (!$handle) return [];

        $headers = fgetcsv($handle) ?: [];
        fclose($handle);

        return array_map('trim', $headers);
    }

    /**
     * Parse all rows from a CSV/Excel file into array of assoc arrays.
     */
    private function parseFileRows(\Illuminate\Http\UploadedFile $file): array
    {
        $ext = strtolower($file->getClientOriginalExtension());

        if (in_array($ext, ['xlsx', 'xls'])) {
            return $this->parseExcelRows($file->getRealPath());
        }

        return $this->parseCsvRows($file->getRealPath());
    }

    private function parseCsvRows(string $path): array
    {
        $handle = fopen($path, 'r');
        if (!$handle) return [];

        $headers = array_map('trim', fgetcsv($handle) ?: []);
        $rows    = [];

        while (($line = fgetcsv($handle)) !== false) {
            if (count($line) !== count($headers)) continue;
            $rows[] = array_combine($headers, array_map('trim', $line));
        }

        fclose($handle);

        return $rows;
    }

    private function parseExcelHeaders(string $path): array
    {
        // Uses PhpSpreadsheet if available, falls back to treating as CSV
        if (!class_exists(\PhpOffice\PhpSpreadsheet\IOFactory::class)) {
            return $this->parseCsvRows($path)[0] ?? [];
        }

        $spreadsheet = \PhpOffice\PhpSpreadsheet\IOFactory::load($path);
        $sheet       = $spreadsheet->getActiveSheet();
        $headers     = [];

        foreach ($sheet->getRowIterator(1, 1) as $row) {
            foreach ($row->getCellIterator() as $cell) {
                $val = trim((string) $cell->getValue());
                if ($val !== '') $headers[] = $val;
            }
        }

        return $headers;
    }

    private function parseExcelRows(string $path): array
    {
        if (!class_exists(\PhpOffice\PhpSpreadsheet\IOFactory::class)) {
            // Graceful degradation — treat as CSV
            return $this->parseCsvRows($path);
        }

        $spreadsheet = \PhpOffice\PhpSpreadsheet\IOFactory::load($path);
        $sheet       = $spreadsheet->getActiveSheet();
        $rows        = [];
        $headers     = [];

        foreach ($sheet->getRowIterator() as $rowIndex => $row) {
            $cells = [];
            foreach ($row->getCellIterator() as $cell) {
                $cells[] = trim((string) $cell->getValue());
            }

            if ($rowIndex === 1) {
                $headers = $cells;
                continue;
            }

            if (empty(array_filter($cells))) continue; // skip blank rows

            if (count($cells) === count($headers)) {
                $rows[] = array_combine($headers, $cells);
            }
        }

        return $rows;
    }

    // ════════════════════════════════════════════════════════════════
    // ── PRIVATE: Session creation ──────────────────────────────────
    // ════════════════════════════════════════════════════════════════

    private function createExternalImportSession(
        string  $source,
        string  $periodStart,
        string  $periodEnd,
        ?string $notes,
        array   $diffSummary,
    ): ReconciliationSession {
        return ReconciliationSession::create([
            'period_start' => $periodStart,
            'period_end'   => $periodEnd,
            'ledger'       => 'external_import',
            'opened_by'    => Auth::id(),
            'status'       => 'open',
            'notes'        => $notes,
            'opened_at'    => now(),
            'meta'         => [
                'source'       => $source,
                'diff_summary' => $diffSummary,
                'engine'       => 'data_engine',
                'events'       => [[
                    'type'   => 'session_created',
                    'by'     => Auth::id(),
                    'at'     => now()->toISOString(),
                    'source' => $source,
                ]],
            ],
        ]);
    }
}
