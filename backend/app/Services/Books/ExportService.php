<?php

namespace App\Services\Books;

use App\Models\Books\Voucher;
use Symfony\Component\HttpFoundation\Response;

/**
 * One export layer for every books screen and document: JSON, CSV, XML, HTML, PDF.
 * A "table" is ['title', 'subtitle', 'columns' => [key => label], 'rows' => [[key => value]], 'totals' => [key => value]].
 * PDF needs dompdf (`composer require dompdf/dompdf`); without it the request says so plainly.
 */
class ExportService
{
    public const FORMATS = ['json', 'csv', 'xml', 'html', 'pdf'];

    public function table(array $table, string $format, string $filename): Response
    {
        $format = strtolower($format);
        $this->assertFormat($format);
        $rows = $table['rows'] ?? [];
        $cols = $table['columns'] ?? [];

        return match ($format) {
            'json' => $this->send(json_encode($table, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), 'application/json', "$filename.json"),
            'csv'  => $this->send($this->csv($cols, $rows, $table['totals'] ?? null), 'text/csv; charset=UTF-8', "$filename.csv"),
            'xml'  => $this->send($this->xml($table), 'application/xml', "$filename.xml"),
            'html' => $this->send($this->html($this->tableBody($table), $table['title'] ?? 'Report'), 'text/html; charset=UTF-8', "$filename.html", false),
            'pdf'  => $this->pdf($this->html($this->tableBody($table), $table['title'] ?? 'Report'), "$filename.pdf"),
        };
    }

    /** A voucher as a printable document (hamper components indented under their header). */
    public function voucher(Voucher $v, string $format): Response
    {
        $format = strtolower($format);
        $this->assertFormat($format);
        $v->loadMissing(['type', 'partyLedger', 'location', 'currency', 'paymentMethod', 'items.taxes', 'entries.ledger']);
        $name = preg_replace('/[^A-Za-z0-9_-]+/', '_', $v->voucher_number);
        $data = $this->voucherArray($v);

        return match ($format) {
            'json' => $this->send(json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), 'application/json', "$name.json"),
            'csv'  => $this->send($this->voucherCsv($data), 'text/csv; charset=UTF-8', "$name.csv"),
            'xml'  => $this->send($this->xml(['voucher' => $data], 'export'), 'application/xml', "$name.xml"),
            'html' => $this->send($this->html($this->voucherBody($data), $v->voucher_number), 'text/html; charset=UTF-8', "$name.html", false),
            'pdf'  => $this->pdf($this->html($this->voucherBody($data), $v->voucher_number), "$name.pdf"),
        };
    }

    private function assertFormat(string $format): void
    {
        if (! in_array($format, self::FORMATS, true)) {
            throw new BooksException('Choose one of: ' . implode(', ', self::FORMATS) . '.');
        }
    }

    // ── voucher shape ────────────────────────────────────────────────────

    private function voucherArray(Voucher $v): array
    {
        $cur = $v->currency?->code;
        $lines = [];
        foreach ($v->items->sortBy('line_no') as $i) {
            $lines[] = [
                'line' => $i->line_no, 'component' => $i->parent_item_id !== null, 'is_header' => (bool) $i->is_header,
                'description' => $i->description, 'variant' => $i->variant_label, 'sku' => $i->sku, 'unit' => $i->unit_code,
                'quantity' => (float) $i->quantity, 'rate' => (float) $i->rate, 'discount' => (float) $i->discount_amount,
                'amount' => (float) $i->amount, 'tax_rate' => $i->tax_rate_percent !== null ? (float) $i->tax_rate_percent : null, 'tax' => (float) $i->tax_amount,
            ];
        }

        return [
            'voucher_number' => $v->voucher_number, 'type' => $v->type?->name, 'date' => $v->date?->toDateString(), 'status' => $v->status,
            'party' => $v->partyLedger?->name, 'branch' => $v->location?->name, 'currency' => $cur, 'payment_method' => $v->paymentMethod?->name,
            'reference' => $v->reference_no, 'narration' => $v->narration,
            'lines' => $lines,
            'entries' => $v->entries->map(fn ($e) => ['ledger' => $e->ledger?->name, 'debit' => $e->side === 'D' ? (float) $e->amount : 0, 'credit' => $e->side === 'C' ? (float) $e->amount : 0])->values()->all(),
            'subtotal' => (float) $v->subtotal, 'tax_total' => (float) $v->tax_total, 'total' => (float) $v->total_amount,
        ];
    }

    private function voucherBody(array $d): string
    {
        $e = fn ($s) => htmlspecialchars((string) $s, ENT_QUOTES, 'UTF-8');
        $n = fn ($x) => number_format((float) $x, 2);
        $h = "<h1>{$e($d['type'])} {$e($d['voucher_number'])}</h1>";
        $h .= "<p class='meta'>Date: {$e($d['date'])} · Status: {$e($d['status'])}"
            . ($d['party'] ? " · Party: {$e($d['party'])}" : '') . ($d['branch'] ? " · Branch: {$e($d['branch'])}" : '')
            . ($d['payment_method'] ? " · Payment: {$e($d['payment_method'])}" : '') . ($d['reference'] ? " · Ref: {$e($d['reference'])}" : '') . '</p>';
        if ($d['lines']) {
            $h .= '<table><thead><tr><th>#</th><th>Description</th><th>Variant</th><th class="r">Qty</th><th>Unit</th><th class="r">Rate</th><th class="r">Amount</th><th class="r">Tax %</th><th class="r">Tax</th></tr></thead><tbody>';
            foreach ($d['lines'] as $l) {
                $indent = $l['component'] ? '<span class="ind">└</span> ' : '';
                $cls = $l['is_header'] ? ' class="hdr"' : ($l['component'] ? ' class="comp"' : '');
                $h .= "<tr$cls><td>" . ($l['component'] ? '' : $e($l['line'])) . "</td><td>$indent{$e($l['description'])}</td><td>{$e($l['variant'])}</td>"
                    . "<td class='r'>{$e($l['quantity'] + 0)}</td><td>{$e($l['unit'])}</td><td class='r'>{$n($l['rate'])}</td><td class='r'>{$n($l['amount'])}</td>"
                    . "<td class='r'>" . ($l['tax_rate'] !== null ? $e($l['tax_rate'] + 0) : '') . "</td><td class='r'>{$n($l['tax'])}</td></tr>";
            }
            $h .= '</tbody></table>';
            $h .= "<p class='tot'>Subtotal {$n($d['subtotal'])} · Tax {$n($d['tax_total'])} · <b>Total {$e($d['currency'])} {$n($d['total'])}</b></p>";
        }
        $h .= '<h2>Accounting</h2><table><thead><tr><th>Ledger</th><th class="r">Debit</th><th class="r">Credit</th></tr></thead><tbody>';
        foreach ($d['entries'] as $en) {
            $h .= "<tr><td>{$e($en['ledger'])}</td><td class='r'>" . ($en['debit'] ? $n($en['debit']) : '') . "</td><td class='r'>" . ($en['credit'] ? $n($en['credit']) : '') . '</td></tr>';
        }
        $h .= '</tbody></table>';
        if ($d['narration']) {
            $h .= "<p class='meta'>{$e($d['narration'])}</p>";
        }

        return $h;
    }

    private function voucherCsv(array $d): string
    {
        $cols = ['line' => 'Line', 'description' => 'Description', 'variant' => 'Variant', 'unit' => 'Unit', 'quantity' => 'Qty', 'rate' => 'Rate', 'discount' => 'Discount', 'amount' => 'Amount', 'tax_rate' => 'Tax %', 'tax' => 'Tax'];
        $rows = array_map(fn ($l) => $l + ['description' => ($l['component'] ? '   ' : '') . $l['description']], $d['lines']);

        return $this->csv($cols, $rows, ['description' => 'Total', 'amount' => $d['subtotal'], 'tax' => $d['tax_total']]);
    }

    // ── formats ──────────────────────────────────────────────────────────

    private function csv(array $cols, array $rows, ?array $totals): string
    {
        $fh = fopen('php://temp', 'r+');
        fwrite($fh, "\xEF\xBB\xBF");   // BOM so Excel reads UTF-8
        fputcsv($fh, array_values($cols));
        foreach ($rows as $r) {
            fputcsv($fh, array_map(fn ($k) => $this->cell($r[$k] ?? ''), array_keys($cols)));
        }
        if ($totals) {
            fputcsv($fh, array_map(fn ($k) => $this->cell($totals[$k] ?? ''), array_keys($cols)));
        }
        rewind($fh);

        return stream_get_contents($fh);
    }

    /** Neutralise spreadsheet formulas in text cells. */
    private function cell($v)
    {
        if (is_string($v) && $v !== '' && in_array($v[0], ['=', '+', '-', '@'], true) && ! is_numeric($v)) {
            return "'" . $v;
        }

        return is_bool($v) ? ($v ? 'yes' : 'no') : $v;
    }

    private function xml(array $data, string $root = 'export'): string
    {
        $w = new \XMLWriter();
        $w->openMemory();
        $w->setIndent(true);
        $w->startDocument('1.0', 'UTF-8');
        $w->startElement($root);
        $this->xmlNode($w, $data);
        $w->endElement();

        return $w->outputMemory();
    }

    private function xmlNode(\XMLWriter $w, array $data): void
    {
        foreach ($data as $k => $v) {
            $tag = is_int($k) ? 'item' : (preg_replace('/[^A-Za-z0-9_.-]/', '_', (string) $k) ?: 'field');
            if (preg_match('/^[0-9.-]/', $tag)) {
                $tag = '_' . $tag;
            }
            $w->startElement($tag);
            if (is_array($v)) {
                $this->xmlNode($w, $v);
            } else {
                $w->text(is_bool($v) ? ($v ? 'true' : 'false') : (string) $v);
            }
            $w->endElement();
        }
    }

    private function tableBody(array $t): string
    {
        $e = fn ($s) => htmlspecialchars((string) $s, ENT_QUOTES, 'UTF-8');
        $cols = $t['columns'] ?? [];
        $h = '<h1>' . $e($t['title'] ?? 'Report') . '</h1>' . (! empty($t['subtitle']) ? "<p class='meta'>{$e($t['subtitle'])}</p>" : '');
        $h .= '<table><thead><tr>' . implode('', array_map(fn ($l) => "<th>{$e($l)}</th>", $cols)) . '</tr></thead><tbody>';
        foreach ($t['rows'] ?? [] as $r) {
            $h .= '<tr>' . implode('', array_map(fn ($k) => '<td' . (is_numeric($r[$k] ?? null) ? ' class="r"' : '') . '>' . $e(is_float($r[$k] ?? null) ? number_format($r[$k], 2) : ($r[$k] ?? '')) . '</td>', array_keys($cols))) . '</tr>';
        }
        if (! empty($t['totals'])) {
            $h .= '<tr class="hdr">' . implode('', array_map(fn ($k) => '<td' . (is_numeric($t['totals'][$k] ?? null) ? ' class="r"' : '') . '>' . $e(is_float($t['totals'][$k] ?? null) ? number_format($t['totals'][$k], 2) : ($t['totals'][$k] ?? '')) . '</td>', array_keys($cols))) . '</tr>';
        }

        return $h . '</tbody></table>';
    }

    private function html(string $body, string $title): string
    {
        $css = 'body{font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#111;margin:24px}h1{font-size:18px;margin:0 0 4px}h2{font-size:14px;margin:18px 0 6px}'
            . '.meta{color:#555;margin:0 0 12px}table{width:100%;border-collapse:collapse;margin:8px 0}th,td{border-bottom:1px solid #ddd;padding:5px 6px;text-align:left}'
            . 'th{background:#f3f3f3;font-weight:600}.r{text-align:right}.hdr td{font-weight:600;background:#fafafa}.comp td{color:#444;font-size:11px}.ind{color:#999;margin-left:12px}.tot{text-align:right;margin-top:10px}';

        return '<!doctype html><html><head><meta charset="utf-8"><title>' . htmlspecialchars($title) . "</title><style>$css</style></head><body>$body</body></html>";
    }

    private function pdf(string $html, string $filename): Response
    {
        if (! class_exists(\Dompdf\Dompdf::class)) {
            throw new BooksException('PDF export needs the dompdf package. Run `composer require dompdf/dompdf` in the backend, then try again.');
        }
        $pdf = new \Dompdf\Dompdf(['isRemoteEnabled' => false]);
        $pdf->loadHtml($html);
        $pdf->setPaper('A4');
        $pdf->render();

        return $this->send($pdf->output(), 'application/pdf', $filename);
    }

    private function send(string $body, string $type, string $filename, bool $download = true): Response
    {
        return response($body, 200, [
            'Content-Type' => $type,
            'Content-Disposition' => ($download ? 'attachment' : 'inline') . '; filename="' . $filename . '"',
            'Access-Control-Expose-Headers' => 'Content-Disposition',
        ]);
    }
}
