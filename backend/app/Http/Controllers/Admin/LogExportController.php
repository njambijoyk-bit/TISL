<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpFoundation\StreamedResponse;

class LogExportController extends Controller
{
    private const LOGS = [
        'order_activity'        => ['table' => 'order_activity_logs',           'date_col' => 'created_at'],
        'auction_order_activity'=> ['table' => 'auction_order_activity_logs',    'date_col' => 'created_at'],
        'booking_activity'      => ['table' => 'booking_activity_logs',          'date_col' => 'created_at'],
        'hamper_activity'       => ['table' => 'hamper_activity_logs',           'date_col' => 'created_at'],
        'leave'                 => ['table' => 'leave_logs',                     'date_col' => 'created_at'],
        'mimi_query'            => ['table' => 'mimi_query_logs',               'date_col' => 'queried_at'],
        'policy_change'         => ['table' => 'policy_change_logs',            'date_col' => 'changed_at'],
        'referral_activity'     => ['table' => 'referral_activity_logs',         'date_col' => 'created_at'],
        'dev_access_key'        => ['table' => 'dev_access_key_logs',           'date_col' => 'attempted_at'],
        'inventory_export'      => ['table' => 'inventory_export_logs',         'date_col' => 'exported_at'],
    ];

    /**
     * GET /admin/logs/export/meta
     * Returns available log types with row counts.
     */
    public function meta(): \Illuminate\Http\JsonResponse
    {
        $result = [];
        foreach (self::LOGS as $key => $cfg) {
            $result[] = [
                'key'       => $key,
                'table'     => $cfg['table'],
                'date_col'  => $cfg['date_col'],
                'row_count' => DB::table($cfg['table'])->count(),
            ];
        }
        return response()->json(['logs' => $result]);
    }

    /**
     * POST /admin/logs/export
     *
     * Body:
     *   format   string  'csv' | 'xlsx'
     *   logs     array   [{ key, period_start, period_end }]
     */
    public function export(Request $request): StreamedResponse|\Illuminate\Http\JsonResponse
    {
        $data = $request->validate([
            'format'              => 'required|in:csv,xlsx',
            'logs'                => 'required|array|min:1',
            'logs.*.key'          => 'required|string',
            'logs.*.period_start' => 'nullable|date',
            'logs.*.period_end'   => 'nullable|date',
        ]);

        $format   = $data['format'];
        $selected = $data['logs'];

        // Build all rows keyed by log type
        $sheets = [];
        foreach ($selected as $item) {
            $key = $item['key'];
            if (!isset(self::LOGS[$key])) continue;

            $cfg   = self::LOGS[$key];
            $query = DB::table($cfg['table']);

            if (!empty($item['period_start'])) {
                $query->where($cfg['date_col'], '>=', $item['period_start'] . ' 00:00:00');
            }
            if (!empty($item['period_end'])) {
                $query->where($cfg['date_col'], '<=', $item['period_end'] . ' 23:59:59');
            }

            $rows = $query->get()->map(fn($r) => (array) $r)->toArray();
            $sheets[$key] = $rows;
        }

        if (empty($sheets)) {
            return response()->json(['message' => 'No data found for the selected logs and date ranges.'], 404);
        }

        $timestamp = now()->format('Ymd_His');
        $filename  = "logs_export_{$timestamp}";

        if ($format === 'csv') {
            return $this->streamCsv($sheets, $filename);
        }

        return $this->streamXlsx($sheets, $filename);
    }

    // ── CSV: all sheets concatenated with headers per section ────────
    private function streamCsv(array $sheets, string $filename): StreamedResponse
    {
        return response()->stream(function () use ($sheets) {
            $handle = fopen('php://output', 'w');

            foreach ($sheets as $key => $rows) {
                // Section header
                fputcsv($handle, ["=== " . strtoupper(str_replace('_', ' ', $key)) . " ==="]);

                if (empty($rows)) {
                    fputcsv($handle, ['No records found.']);
                    fputcsv($handle, []);
                    continue;
                }

                fputcsv($handle, array_keys($rows[0]));
                foreach ($rows as $row) {
                    fputcsv($handle, array_values($row));
                }
                fputcsv($handle, []); // blank separator
            }

            fclose($handle);
        }, 200, [
            'Content-Type'        => 'text/csv',
            'Content-Disposition' => "attachment; filename=\"{$filename}.csv\"",
            'X-Accel-Buffering'   => 'no',
            'Cache-Control'       => 'no-cache',
        ]);
    }

    // ── XLSX: one sheet per log type using PhpSpreadsheet ────────────
    private function streamXlsx(array $sheets, string $filename): StreamedResponse
    {
        $spreadsheet = new \PhpOffice\PhpSpreadsheet\Spreadsheet();
        $spreadsheet->removeSheetByIndex(0); // remove default sheet

        foreach ($sheets as $key => $rows) {
            $sheetTitle = substr(ucwords(str_replace('_', ' ', $key)), 0, 31); // Excel 31-char limit
            $sheet      = new \PhpOffice\PhpSpreadsheet\Worksheet\Worksheet($spreadsheet, $sheetTitle);
            $spreadsheet->addSheet($sheet);

            if (empty($rows)) {
                $sheet->setCellValue('A1', 'No records found.');
                continue;
            }

            // Headers — bold
            $headers = array_keys($rows[0]);
            foreach ($headers as $col => $header) {
                $cell = $sheet->getCellByColumnAndRow($col + 1, 1);
                $cell->setValue($header);
                $cell->getStyle()->getFont()->setBold(true);
            }

            // Rows
            foreach ($rows as $rowIdx => $row) {
                foreach (array_values($row) as $col => $value) {
                    $sheet->setCellValueByColumnAndRow($col + 1, $rowIdx + 2, $value);
                }
            }

            // Auto-size columns
            foreach (range(1, count($headers)) as $col) {
                $sheet->getColumnDimensionByColumn($col)->setAutoSize(true);
            }
        }

        $writer = new \PhpOffice\PhpSpreadsheet\Writer\Xlsx($spreadsheet);

        return response()->stream(function () use ($writer) {
            $writer->save('php://output');
        }, 200, [
            'Content-Type'        => 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'Content-Disposition' => "attachment; filename=\"{$filename}.xlsx\"",
            'Cache-Control'       => 'no-cache',
        ]);
    }
}