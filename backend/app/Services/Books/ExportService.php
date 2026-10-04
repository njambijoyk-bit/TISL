<?php

namespace App\Services\Books;

use App\Models\Books\Voucher;
use App\Models\Books\VoucherType;
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

    /** The printable document as one HTML page (what the HTML export and the e-mail body show). */
    public function voucherHtml(Voucher $v): string
    {
        $v->loadMissing(['type', 'partyLedger', 'location', 'currency', 'paymentMethod', 'items.taxes', 'entries.ledger']);

        return $this->html($this->voucherBody($this->voucherArray($v)), $v->voucher_number);
    }

    /** The document as PDF bytes, or null when the PDF package is not installed. */
    public function voucherPdfBytes(Voucher $v): ?string
    {
        if (! class_exists(\Dompdf\Dompdf::class)) {
            return null;
        }
        $pdf = new \Dompdf\Dompdf(['isRemoteEnabled' => false]);
        $pdf->loadHtml($this->voucherHtml($v));
        $pdf->setPaper('A4');
        $pdf->render();

        return $pdf->output();
    }

    private function assertFormat(string $format): void
    {
        if (! in_array($format, self::FORMATS, true)) {
            throw new BooksException('Choose one of: ' . implode(', ', self::FORMATS) . '.');
        }
    }

    /** Charges (with the ledger each posts to), tax per ledger and total discount — the footer of every document. */
    public function footer(Voucher $v): array
    {
        $v->loadMissing('items.taxes');
        $ledgerNames = \App\Models\Books\Ledger::whereIn('id', $v->items->pluck('ledger_id')->filter()->merge($v->items->flatMap(fn ($i) => $i->taxes->pluck('ledger_id')))->unique())->pluck('name', 'id');
        $charges = [];
        foreach ($v->items->where('item_type', 'charge')->sortBy('line_no') as $i) {
            $charges[] = ['description' => $i->description, 'ledger' => $ledgerNames[$i->ledger_id] ?? null, 'amount' => (float) $i->amount, 'note' => $i->notes];
        }
        $taxes = [];
        foreach ($v->items as $i) {
            foreach ($i->taxes as $t) {
                $k = $t->ledger_id;
                $taxes[$k] ??= ['label' => $t->label, 'ledger' => $ledgerNames[$k] ?? null, 'base' => 0.0, 'amount' => 0.0];
                $taxes[$k]['base'] += (float) $t->base_amount;
                $taxes[$k]['amount'] += (float) $t->tax_amount;
            }
        }
        $discount = round((float) $v->items->sum('discount_amount'), 2);

        return ['charges' => $charges, 'taxes' => array_values($taxes), 'discount_total' => $discount];
    }

    // ── voucher shape ────────────────────────────────────────────────────

    private function voucherArray(Voucher $v): array
    {
        $cur = $v->currency?->code;
        $lines = [];
        foreach ($v->items->sortBy('line_no') as $i) {
            $lines[] = [
                'line' => $i->line_no, 'component' => $i->parent_item_id !== null, 'is_header' => (bool) $i->is_header,
                'description' => $i->description . ($i->material_mode ? ' (' . ['charged' => 'charged', 'included' => 'included in the price', 'bought_outside' => 'bought for this job', 'customer_supplied' => "customer's own"][$i->material_mode] . ')' : '') . (($i->batch_no || $i->expiry_date) ? ' — ' . trim(($i->batch_no ? 'Batch ' . $i->batch_no : '') . ($i->expiry_date ? ($i->batch_no ? ', ' : '') . 'exp ' . $i->expiry_date->format('d M Y') : '')) : ''), 'variant' => $i->variant_label, 'sku' => $i->sku, 'unit' => $i->unit_code,
                'quantity' => (float) $i->quantity, 'rate' => (float) $i->rate, 'discount' => (float) $i->discount_amount,
                'amount' => (float) $i->amount, 'tax_rate' => $i->tax_rate_percent !== null ? (float) $i->tax_rate_percent : null, 'tax' => (float) $i->tax_amount,
            ];
        }

        return [
            ...$this->footer($v),
            'company' => $this->company(),
            'voucher_number' => $v->voucher_number, 'type' => $v->type?->name, 'date' => $v->date?->toDateString(), 'status' => $v->status,
            'party' => $v->partyLedger?->name ?? $v->party_name, 'party_phone' => $v->party_phone, 'party_tax_id' => $v->party_tax_id,
            'party_address' => $v->party_address ?: $v->partyLedger?->address, 'branch' => $v->location?->name, 'currency' => $cur, 'payment_method' => $v->paymentMethod?->name,
            'reference' => $v->reference_no, 'supplier_invoice_no' => $v->supplier_invoice_no, 'narration' => $v->narration,
            'lines' => $lines,
            'entries' => $v->entries->map(fn ($e) => ['ledger' => $e->ledger?->name, 'debit' => $e->side === 'D' ? (float) $e->amount : 0, 'credit' => $e->side === 'C' ? (float) $e->amount : 0])->values()->all(),
            'subtotal' => (float) $v->subtotal, 'tax_total' => (float) $v->tax_total, 'total' => (float) $v->total_amount,
        ];
    }

    /** Who is issuing the document: name, address, phones and emails (default first), tax PIN. */
    private function company(): array
    {
        $c = \App\Models\CompanyProfile::current();
        $first = fn (array $l) => collect($l)->sortByDesc('is_default')->pluck('value')->values()->all();

        return array_filter([
            'name' => $c->name, 'legal_name' => $c->legal_name, 'tax_pin' => $c->tax_pin, 'address' => $c->address, 'city' => $c->city, 'country' => $c->country,
            'website' => $c->website, 'phones' => $first($c->phoneList()), 'emails' => $first($c->emailList()), 'tagline' => $c->tagline,
            'description' => $c->description, 'declaration' => $c->declaration, 'payment_terms' => $c->payment_terms, 'payment_mode' => $c->payment_mode, 'delivery_terms' => $c->delivery_terms,
        ], fn ($x) => $x !== null && $x !== '' && $x !== []);
    }

    /** The logo as a data URI (the PDF engine does not fetch remote files), or null when there is none or it cannot be read. */
    private function logoData(?string $url): ?string
    {
        $path = $url ? ltrim((string) preg_replace('#^/?storage/#', '', $url), '/') : null;
        if (! $path || ! str_starts_with($path, 'company/') || ! \Illuminate\Support\Facades\Storage::disk('public')->exists($path)) {
            return null;
        }
        $mime = ['png' => 'image/png', 'jpg' => 'image/jpeg', 'jpeg' => 'image/jpeg', 'webp' => 'image/webp', 'gif' => 'image/gif'][strtolower(pathinfo($path, PATHINFO_EXTENSION))] ?? null;

        return $mime ? 'data:' . $mime . ';base64,' . base64_encode(\Illuminate\Support\Facades\Storage::disk('public')->get($path)) : null;
    }

    private function companyHeader(array $co): string
    {
        $e = fn ($s) => htmlspecialchars((string) $s, ENT_QUOTES, 'UTF-8');
        if (! $co) {
            return '';
        }
        $logo = $this->logoData(\App\Models\CompanyProfile::current()->logo_url ?? null);   // only on the printed page, never in json/xml exports
        $h = "<div class='co'>" . ($logo ? "<img src='{$logo}' style='max-height:54px;max-width:180px;margin-bottom:6px'><br>" : '') . "<div class='coname'>{$e($co['name'] ?? '')}</div>";
        if (! empty($co['legal_name']) && ($co['legal_name'] !== ($co['name'] ?? null))) {
            $h .= "<div>{$e($co['legal_name'])}</div>";
        }
        $addr = implode(', ', array_filter([$co['address'] ?? null, $co['city'] ?? null, $co['country'] ?? null]));
        $line = array_filter([
            $addr ?: null,
            ! empty($co['phones']) ? 'Tel: ' . implode(' / ', $co['phones']) : null,
            ! empty($co['emails']) ? 'Email: ' . implode(' / ', $co['emails']) : null,
            $co['website'] ?? null,
            ! empty($co['tax_pin']) ? 'PIN: ' . $co['tax_pin'] : null,
        ]);
        if ($line) {
            $h .= "<div class='cod'>{$e(implode(' · ', $line))}</div>";
        }

        return $h . '</div>';
    }

    private function voucherBody(array $d): string
    {
        $e = fn ($s) => htmlspecialchars((string) $s, ENT_QUOTES, 'UTF-8');
        $n = fn ($x) => number_format((float) $x, 2);
        $h = $this->companyHeader($d['company'] ?? []) . "<h1>{$e($d['type'])} {$e($d['voucher_number'])}</h1>";
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
            if ($d['charges'] || $d['taxes'] || $d['discount_total'] > 0) {
                $h .= '<h2>Charges &amp; taxes</h2><table><thead><tr><th>Description</th><th>Ledger</th><th class="r">Amount</th></tr></thead><tbody>';
                foreach ($d['charges'] as $c) {
                    $h .= "<tr><td>{$e($c['description'])}" . ($c['note'] ? "<br><span class='ind'>{$e($c['note'])}</span>" : '') . "</td><td>{$e($c['ledger'])}</td><td class='r'>{$n($c['amount'])}</td></tr>";
                }
                if ($d['discount_total'] > 0) {
                    $h .= "<tr><td>Discounts allowed</td><td></td><td class='r'>-{$n($d['discount_total'])}</td></tr>";
                }
                foreach ($d['taxes'] as $t) {
                    $h .= "<tr><td>{$e($t['label'])} on {$n($t['base'])}</td><td>{$e($t['ledger'])}</td><td class='r'>{$n($t['amount'])}</td></tr>";
                }
                $h .= '</tbody></table>';
            }
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

    /**
     * A customer statement laid out like a real one: our details on the left, the customer's on the right, STATEMENT across the middle,
     * the movements, and our tagline at the foot. pdf and html get this layout; csv, xml and json carry the same rows as plain data.
     *
     * @param  array  $party  company_name, ledger_name, address, tax_pin
     */
    public function statement(array $table, array $party, string $format, string $filename): Response
    {
        $format = strtolower($format);
        if (! in_array($format, ['pdf', 'html'], true)) {
            return $this->table($table, $format, $filename);
        }
        $e = fn ($s) => htmlspecialchars((string) $s, ENT_QUOTES, 'UTF-8');
        $co = $this->company();
        $who = trim(($party['first_name'] ?? '') . ' ' . ($party['last_name'] ?? '')) ?: ($party['ledger_name'] ?? 'there');
        $greeting = "Hello {$who}, here is your statement for the period " . ($party['from'] ?? '') . ' to ' . ($party['to'] ?? '') . '. Amounts are in ' . ($party['currency'] ?? 'the base currency') . '.'
            . (! empty($party['negative']) ? ' A negative balance means we hold money for you.' : '');

        $head = $this->letterhead($party, $co);

        $body = $head
            . "<div class='sttitle'>STATEMENT OF ACCOUNTS</div>"
            . "<p class='stbody'>{$e($greeting)}</p>"
            . preg_replace('~^<h1>.*?</h1>~s', '', $this->tableBody(['rows' => $table['rows'] ?? [], 'columns' => $table['columns'] ?? [], 'totals' => $table['totals'] ?? null]))   // the layout supplies its own title
            . $this->letterFoot($co);

        $html = $this->html($body, $table['title'] ?? 'Statement');
        $html = str_replace('</style>', $this->letterCss() . '</style>', $html);

        return $format === 'pdf' ? $this->pdf($html, "$filename.pdf") : $this->send($html, 'text/html; charset=UTF-8', "$filename.html", false);
    }

    /**
     * "Ledger outstandings": a formal letter to a customer listing what is open against their ledger, aged by how old each bill is,
     * with a bar chart of the ageing and the sign-off. pdf and html get the letter; csv, xml and json carry the plain rows.
     *
     * @param  array  $bills  each: date, voucher_number, due_date, days_late, outstanding (all in the base currency)
     * @param  array  $party  as for statement()
     */
    public function outstandings(array $bills, array $party, string $format, string $filename, ?string $asOf = null): Response
    {
        $format = strtolower($format);
        $asOfDate = \Carbon\Carbon::parse($asOf ?? today())->startOfDay();
        $cur = (string) ($party['currency'] ?? '');
        $buckets = ['< 30 days', '30 to 60 days', '60 to 90 days', '90 to 150 days', '> 150 days'];
        $bucketOf = static fn (int $age) => $age < 30 ? 0 : ($age < 60 ? 1 : ($age < 90 ? 2 : ($age < 150 ? 3 : 4)));
        $d = fn ($x) => \Carbon\Carbon::parse($x)->format('j-M-y');

        $rows = [];
        $sums = array_fill(0, 5, 0.0);
        foreach ($bills as $b) {
            $age = max(0, (int) \Carbon\Carbon::parse($b['date'])->startOfDay()->diffInDays($asOfDate, false));
            $i = $bucketOf($age);
            $amt = round((float) $b['outstanding'], 2);
            $sums[$i] = round($sums[$i] + $amt, 2);
            $rows[] = ['date' => $d($b['date']), 'number' => $b['voucher_number'], 'due' => $d($b['due_date']), 'late' => (int) $b['days_late'], 'i' => $i, 'amt' => $amt];
        }
        $total = round(array_sum($sums), 2);

        if (! in_array($format, ['pdf', 'html'], true)) {
            $cols = ['date' => 'Date', 'number' => 'Particulars', 'due' => 'Due on', 'overdue_days' => 'Overdue by (days)', 'bucket' => 'Ageing', 'amount' => "Outstanding ({$cur})"];
            $plain = array_map(fn ($r) => ['date' => $r['date'], 'number' => $r['number'], 'due' => $r['due'], 'overdue_days' => $r['late'], 'bucket' => $buckets[$r['i']], 'amount' => $r['amt']], $rows);

            return $this->table(['title' => 'Ledger outstandings', 'subtitle' => 'As of ' . $d($asOfDate), 'columns' => $cols, 'rows' => $plain, 'totals' => ['number' => 'Total', 'amount' => $total]], $format, $filename);
        }

        $e = fn ($s) => htmlspecialchars((string) $s, ENT_QUOTES, 'UTF-8');
        $n = fn ($x) => $x ? number_format((float) $x, 2) : '';
        $co = $this->company();

        $t = '<table class="ol"><thead><tr><th class="l">Date</th><th class="l">Particulars</th><th class="l">Due on</th><th class="l">Overdue by</th>'
            . implode('', array_map(fn ($b) => '<th>' . $e($b) . '</th>', $buckets)) . '</tr></thead><tbody>';
        foreach ($rows as $r) {
            $t .= '<tr><td class="l">' . $e($r['date']) . '</td><td class="l">' . $e($r['number']) . '</td><td class="l">' . $e($r['due']) . '</td><td class="l od">' . ($r['late'] > 0 ? '( ' . $r['late'] . ' days )' : '') . '</td>';
            for ($i = 0; $i < 5; $i++) {
                $t .= '<td>' . ($i === $r['i'] ? $n($r['amt']) : '') . '</td>';
            }
            $t .= '</tr>';
        }
        if (! $rows) {
            $t .= '<tr><td class="l" colspan="9">Nothing is outstanding on your ledger. Thank you!</td></tr>';
        }
        $t .= '<tr class="sum"><td colspan="4"></td>' . implode('', array_map(fn ($x) => '<td>' . $n($x) . '</td>', $sums)) . '</tr></tbody></table>'
            . '<div class="gtot">Total &nbsp; ' . $e(number_format($total, 2)) . ' ' . ($total >= 0 ? 'Dr' : 'Cr') . ' (' . $e($cur) . ')</div>';

        // the ageing graph: one bar per bucket, as tall as its share of the largest
        $max = max(1.0, max($sums));
        $bar = '<table class="bars"><tr>' . implode('', array_map(fn ($x) => '<td>' . ($x > 0 ? $e(number_format($x, 2)) : '') . '<div class="bar" style="height:' . max(2, (int) round(90 * $x / $max)) . 'px"></div></td>', $sums)) . '</tr>'
            . '<tr>' . implode('', array_map(fn ($b) => '<td style="border-top:1px solid #111;padding-top:3px">' . $e($b) . '</td>', $buckets)) . '</tr></table>';

        $who = $co['legal_name'] ?? ($co['name'] ?? '');
        $body = $this->letterhead($party, $co)
            . '<table class="ltr"><tr><td>Dear Sir/Madam,</td><td style="text-align:right">' . $e($d($asOfDate)) . '</td></tr></table>'
            . '<div class="subj">Subject: Outstandings on your ledger</div>'
            . '<p class="stbody lbody">Given below is the detail of amounts outstanding against your ledger in our books as of ' . $e($d($asOfDate)) . '.<br>'
            . 'We request you take immediate steps for settling the overdue bills and oblige.</p>'
            . $t . '<div class="subj">Ageing of outstandings (' . $e($cur) . ')</div>' . $bar
            . '<div class="sign">Yours faithfully,<br><b>' . $e($who) . '</b></div>'
            . $this->letterFoot($co);

        $html = str_replace('</style>', $this->letterCss() . '</style>', $this->html($body, 'Ledger outstandings'));

        return $format === 'pdf' ? $this->pdf($html, "$filename.pdf") : $this->send($html, 'text/html; charset=UTF-8', "$filename.html", false);
    }

    /** Our details top right (text left-aligned), the customer's starting below them on the left: the letterhead of statements and letters. */
    private function letterhead(array $party, array $co): string
    {
        $e = fn ($s) => htmlspecialchars((string) $s, ENT_QUOTES, 'UTF-8');
        $lines = static fn (array $l) => implode('', array_map(fn ($x) => $x === null ? '<div>&nbsp;</div>' : '<div>' . $x . '</div>', $l));
        $clean = fn (array $l) => array_values(array_filter($l, fn ($x) => $x !== false));

        // our contacts: the default email and phone, the number marked WhatsApp, and the website, each on its own line
        $phones = \App\Models\CompanyProfile::current()->phoneList();
        $default = $phones[0]['value'] ?? null;
        $whatsapp = null;
        foreach ($phones as $ph) {
            if (preg_match('/whats/i', (string) ($ph['label'] ?? ''))) {
                $whatsapp = $ph['value'];
                break;
            }
        }
        $ours = [! empty($co['name']) ? '<b>' . $e($co['name']) . '</b>' : false];
        foreach ([$co['address'] ?? null, implode(', ', array_filter([$co['city'] ?? null, $co['country'] ?? null])) ?: null,
            ! empty($co['emails'][0]) ? 'Email: ' . $co['emails'][0] : null, $default ? 'Tel: ' . $default : null,
            $whatsapp ? 'WhatsApp: ' . $whatsapp : null, $co['website'] ?? null] as $x) {
            $ours[] = $x ? $e($x) : false;
        }
        if (! empty($co['tax_pin'])) {
            $ours[] = null;                                   // a blank line before the PIN
            $ours[] = 'PIN: ' . $e($co['tax_pin']);
        }
        $theirs = [];
        foreach ([$party['company_name'] ?? null, $party['ledger_name'] ?? null, $party['address'] ?? null,
            ! empty($party['phone']) ? 'Tel: ' . $party['phone'] : null, ! empty($party['email']) ? 'Email: ' . $party['email'] : null] as $i => $x) {
            $theirs[] = $x ? ($i === 0 ? '<b>' . $e($x) . '</b>' : nl2br($e($x))) : false;
        }
        if (! empty($party['tax_pin'])) {
            $theirs[] = 'PIN: ' . $e($party['tax_pin']);
        }

        $data = $this->logoData(\App\Models\CompanyProfile::current()->logo_url ?? null);
        $logo = $data ? "<img src='{$data}' style='max-height:70px;max-width:200px'>" : '';

        return "<table class='sthead'><tr><td class='stl'>{$logo}</td><td class='str'>" . $lines($clean($ours)) . '</td></tr>'
            . "<tr><td class='stl stcust' colspan='2'>" . $lines($clean($theirs)) . '</td></tr></table>';
    }

    /** The foot of statements and letters: our tagline, then the computer-generated note, in small light ink. */
    private function letterFoot(array $co): string
    {
        $e = fn ($s) => htmlspecialchars((string) $s, ENT_QUOTES, 'UTF-8');

        return "<div class='sttag'>" . (! empty($co['tagline']) ? "<div class='sttl'>{$e($co['tagline'])}</div>" : '')
            . "<div class='stnote'>This is a computer-generated document and does not require a signature.</div></div>";
    }

    private function letterCss(): string
    {
        return '.sthead{margin:0 0 6px}.sthead td{border:0;vertical-align:top;padding:0;font-size:12px;line-height:1.5}.stl{width:55%}.str{width:45%;text-align:left}.stcust{padding-top:16px}'
            . '.sttitle{text-align:center;font-size:20px;font-weight:700;letter-spacing:0.18em;margin:18px 0 8px}.stbody{margin:4px 0 12px;line-height:1.5}'
            . '.sttag{position:fixed;left:24px;right:24px;bottom:10px;text-align:center;padding-top:6px;border-top:1px solid #ddd}.sttl{color:#555;font-style:italic;margin-bottom:3px}.stnote{text-align:center;font-size:9px;color:#999}'
            . '.ltr{width:100%;margin:30px 0 18px}.ltr td{border:0;padding:0;font-size:12px}.subj{font-weight:700;margin:16px 0 12px}.ol{width:100%;border-collapse:collapse;margin:18px 0 10px}'
            . '.ol th{background:none;border-top:1.5px solid #111;border-bottom:1.5px solid #111;padding:5px 4px;font-size:11px;text-align:right}.ol th.l,.ol td.l{text-align:left}'
            . '.ol td{border:0;padding:5px 4px;font-size:11px;text-align:right}.ol .od{font-style:italic;color:#444;font-size:10px}.ol tr.sum td{border-top:1px solid #111;border-bottom:1.5px solid #111;font-weight:700}'
            . '.gtot{font-weight:700;margin:14px 0 26px}.bars{width:100%;border-collapse:collapse;margin:18px 0 10px}.bars td{border:0;text-align:center;vertical-align:bottom;font-size:10px;padding:0 10px}'
            . '.bar{background:#444;margin:0 auto;width:60%}.sign{text-align:right;margin-top:44px;line-height:1.7}.lbody{margin:0 0 24px;line-height:1.8}';
    }

    // ── customer invoice and receipt ─────────────────────────────────────

    /** A customer's document (invoice, cash sale, receipt, sales order, delivery note or quotation) as pdf or html; what it is follows from its type. */
    public function document(Voucher $v, string $format): Response
    {
        return $this->customerDocument($v, $format, $this->kindOf($v));
    }

    /** The voucher types that have a customer copy. */
    public const CUSTOMER_DOCS = [VoucherType::SALES, VoucherType::CASH_SALE, VoucherType::RECEIPT, VoucherType::SALES_ORDER, VoucherType::DELIVERY_NOTE, VoucherType::QUOTATION];

    private function kindOf(Voucher $v): string
    {
        $v->loadMissing('type');

        return match ($v->type?->base_type) {
            VoucherType::RECEIPT => 'receipt', VoucherType::DELIVERY_NOTE => 'delivery', VoucherType::SALES_ORDER => 'order', VoucherType::QUOTATION => 'quotation', default => 'invoice',
        };
    }

    /** The name a customer document is saved or attached under, without the extension: invoice-WNKJ-INV-00019, cashsale-WNKJ-CSH-00004. */
    public function documentFileName(Voucher $v): string
    {
        $kind = $this->kindOf($v);

        return (($kind === 'invoice' && $v->type?->base_type === VoucherType::CASH_SALE) ? 'cashsale' : $kind) . '-' . preg_replace('/[^A-Za-z0-9_-]+/', '_', $v->voucher_number);
    }

    /** The customer copy as PDF bytes (what is e-mailed). */
    public function documentPdfBytes(Voucher $v): string
    {
        return $this->document($v, 'pdf')->getContent();
    }

    /**
     * Where delivery notes are on their manifests: voucher id => ['status' => 'delivered'|'failed'|'pending'..., 'status_label', 'manifest' => number, 'delivered_at' => date|null].
     * A note that is on no manifest yet is simply absent. If it was put on more than one (a retry), the latest counts.
     */
    public function deliveryInfo(array $voucherIds): array
    {
        if (! $voucherIds) {
            return [];
        }
        $out = [];
        foreach (\App\Models\DeliveryItemVoucher::with('stop.manifest')->whereIn('voucher_id', $voucherIds)->orderBy('id')->get() as $link) {
            $stop = $link->stop;
            if (! $stop) {
                continue;
            }
            $out[$link->voucher_id] = ['status' => $stop->status, 'status_label' => $stop->status_label, 'manifest' => $stop->manifest?->manifest_number,
                'delivered_at' => $stop->delivered_at ? \Carbon\Carbon::parse($stop->delivered_at)->toDateString() : null];
        }

        return $out;
    }

    /** The tint of each kind of customer document: the page, the heading band and the table headings. Invoices tint only the band. */
    private function docTint(string $kind): array
    {
        return match ($kind) {
            'delivery'  => ['page' => '#e6fbc0', 'band' => '#cfee95', 'light' => '#dcf5ab'],
            'order'     => ['page' => '#fff8cf', 'band' => '#ffe98a', 'light' => '#fff2b0'],
            'quotation' => ['page' => '#ececec', 'band' => '#cfcfcf', 'light' => '#dedede'],
            default     => ['page' => null, 'band' => '#c9e8f3', 'light' => '#e3f3f9'],
        };
    }

    /**
     * The document a customer downloads. Our legal name and details sit in a tinted band, then the buyer on the left and the document
     * details on the right. On an invoice the goods come first and the charges and taxes follow below them in bolder ink, then the tax
     * breakdown, how to pay, the declaration and the sign-off. Nothing from the books' own accounting (ledger postings) is shown.
     */
    private function customerDocument(Voucher $v, string $format, string $kind): Response
    {
        $format = strtolower($format);
        if (! in_array($format, ['pdf', 'html'], true)) {
            throw new BooksException('Choose pdf or html.');
        }
        $v->loadMissing(['type', 'partyLedger', 'currency', 'paymentMethod', 'customer', 'items.taxes', 'source.type', 'source.source.type']);
        $e = fn ($s) => htmlspecialchars((string) $s, ENT_QUOTES, 'UTF-8');
        $n = fn ($x) => number_format((float) $x, 2);
        $day = fn ($x) => $x ? \Carbon\Carbon::parse($x)->format('j-M-y') : '';
        $cp = \App\Models\CompanyProfile::current();
        $co = $this->company();
        $legal = $co['legal_name'] ?? ($co['name'] ?? '');
        $sym = $v->currency?->symbol ?: ($v->currency?->code ?: '');
        $unit = $v->currency?->name ?: ($v->currency?->code ?: '');
        $cash = $kind === 'invoice' && $v->type?->base_type === VoucherType::CASH_SALE;   // a cash sale is not an invoice: it is paid at once
        $label = ['receipt' => 'Receipt', 'delivery' => 'Delivery Note', 'order' => 'Sales Order', 'quotation' => 'Quotation'][$kind] ?? ($cash ? 'Cash Sale' : 'Invoice');
        $fin = $kind === 'invoice';   // payment instructions and the declaration belong on invoices and cash sales only
        $title = strtoupper($label);

        // the band: logo, legal name, address, PIN, website, what we sell, then contacts
        $logo = $this->logoData($cp->logo_url ?? null);
        $addr = array_filter([$co['address'] ?? null, implode(', ', array_filter([$co['city'] ?? null, $co['country'] ?? null])) ?: null]);
        $band = "<div class='ib'>" . ($logo ? "<img src='{$logo}' style='max-height:50px;max-width:180px;margin-bottom:4px'><br>" : '')
            . "<div class='ibn'>{$e($legal)}</div>"
            . implode('', array_map(fn ($l) => "<div class='ibd'>{$e($l)}</div>", $addr))
            . (! empty($co['tax_pin']) ? "<div class='ibd'><b>Company's PIN:</b> {$e($co['tax_pin'])}</div>" : '')
            . (! empty($co['website']) ? "<div class='ibd'>{$e($co['website'])}</div>" : '')
            . (! empty($co['description']) ? "<div class='ibt'>{$e($co['description'])}</div>" : '') . '</div>'
            . "<table class='ic'><tr><td>" . (! empty($co['phones']) ? 'Contact: ' . $e(implode(', ', $co['phones'])) : '') . "</td><td class='rt'>"
            . (! empty($co['emails']) ? 'E-Mail: ' . $e(implode(', ', $co['emails'])) : '') . '</td></tr></table>';

        // the buyer
        $customer = $v->customer;
        $buyerName = $v->partyLedger?->name ?? $v->party_name ?? $customer?->company_name;
        $buyer = ['<b>' . ($kind === 'receipt' ? 'Received from' : 'Buyer (Bill to)') . '</b>', $buyerName ? '<b>' . $e($buyerName) . '</b>' : null];
        if ($customer?->company_name && $customer->company_name !== $buyerName) {
            $buyer[] = $e($customer->company_name);
        }
        $buyerAddr = $v->party_address ?: ($v->partyLedger?->address ?: $customer?->default_billing_address);
        $buyer[] = $buyerAddr ? nl2br($e($buyerAddr)) : null;
        $buyer[] = ($email = $customer?->email) ? $e($email) : null;
        $buyer[] = ($ph = $v->party_phone ?: $customer?->phone) ? 'Tel: ' . $e($ph) : null;
        $buyer[] = ($pin = $v->party_tax_id ?: $customer?->tax_id) ? '<b>PIN:</b> ' . $e($pin) : null;
        $buyerHtml = implode('', array_map(fn ($l) => "<div>{$l}</div>", array_filter($buyer)));

        // what this came from (an order, a delivery note) and where it went
        $so = $kind === 'order' ? $v : null;
        $dn = null;
        for ($s = $v->source, $i = 0; $s && $i < 3; $s = $s->source, $i++) {
            $so ??= $s->type?->base_type === VoucherType::SALES_ORDER ? $s : null;
            $dn ??= $s->type?->base_type === VoucherType::DELIVERY_NOTE ? $s : null;
        }
        // "Order No." only when it really is an order: a reference that is the number of a quotation, booking or any other document is just a reference
        $refDoc = $v->reference_no ? Voucher::with('type')->where('voucher_number', $v->reference_no)->first() : null;
        $isOrder = $so && (! $refDoc || $refDoc->type?->base_type === VoucherType::SALES_ORDER);
        $paidWith = $v->paymentMethod?->name;
        // how a receipt was paid: a cheque's number and bank, a transfer's reference, and where a cheque stands (bounced and so on)
        $ins = null;
        if ($kind === 'receipt') {
            try {
                $ins = app(InstrumentService::class)->forVoucher($v->id);
            } catch (\Throwable) {
                $ins = null;
            }
        }
        $dlv = $kind === 'delivery' ? ($this->deliveryInfo([$v->id])[$v->id] ?? null) : null;
        $kv = fn (string $k, ?string $val) => $val !== null && $val !== '' ? "<div><b>{$e($k)}:</b> {$e($val)}</div>" : '';

        $meta = "<div class='im'><b>" . $label . " No.:</b> {$e($v->voucher_number)}</div>"
            . "<div class='im'><b>Dated:</b> {$e($day($v->date))}</div>"
            . ($kind === 'receipt'
                ? ($paidWith || $ins ? "<div class='im'><b>Mode of Payment:</b> {$e($paidWith ?: ($ins['label'] ?? ''))}</div>" : '')
                    . ($ins ? ($ins['number'] ? "<div class='im'><b>" . $e($ins['type'] === 'cheque' ? 'Cheque No.' : 'Instrument No.') . ":</b> {$e($ins['number'])}</div>" : '')
                        . ($ins['bank_name'] ? "<div class='im'><b>Bank:</b> {$e($ins['bank_name'])}</div>" : '') . ($ins['date'] && $ins['type'] === 'cheque' ? "<div class='im'><b>Cheque Date:</b> {$e($day($ins['date']))}</div>" : '')
                        . ($ins['reference'] ? "<div class='im'><b>Reference:</b> {$e($ins['reference'])}</div>" : '')
                        . ($ins['type'] === 'cheque' && in_array($ins['status'], ['received', 'deposited', 'cleared', 'bounced'], true)
                            ? "<div class='im'><b>Cheque Status:</b> " . ($ins['status'] === 'bounced' ? "<b style='color:#b91c1c'>Bounced</b>" : $e(ucfirst($ins['status']))) . '</div>' : '') : '')
                    . ($v->reference_no ? "<div class='im'><b>Reference:</b> {$e($v->reference_no)}</div>" : '')
                : (! $cash && ! in_array($kind, ['delivery', 'quotation'], true) ? "<div class='im'><b>Terms of Payment:</b> {$e(implode(' · ', array_filter([$paidWith, $co['payment_terms'] ?? null])))}</div>" : '')
                    . ($fin && ! $cash && $v->due_date ? "<div class='im'><b>Due on:</b> {$e($day($v->due_date))}</div>" : '')
                    . ($dlv ? "<div class='im'><b>Status:</b> {$e($dlv['status_label'])}" . ($dlv['status'] === 'delivered' && $dlv['delivered_at'] ? ' on ' . $e($day($dlv['delivered_at'])) : '') . '</div>'
                        . ($dlv['manifest'] ? "<div class='im'><b>Manifest:</b> {$e($dlv['manifest'])}</div>" : '') : '')
                    . ($kind === 'quotation' && $v->valid_until ? "<div class='im'><b>Valid until:</b> {$e($day($v->valid_until))}</div>" : ''));
        $refs = $kind === 'receipt' ? '' : ($isOrder ? $kv("Buyer's Order No.", $v->reference_no ?: $so->reference_no) : $kv("Buyer's Reference", $v->reference_no)) . ($isOrder ? $kv('Order Dated', $day($so->date)) : '')
            . ($isOrder && ! ($v->reference_no ?: $so->reference_no) ? $kv('Order No.', $so->voucher_number) : '') . ($dn ? $kv('Delivery Note', $dn->voucher_number) . $kv('Delivery Note Date', $day($dn->date)) : '')
            . ($dn || $kind === 'delivery' ? $kv('Terms of Delivery', $co['delivery_terms'] ?? null) : '');
        $top = "<table class='it0'><tr><td class='itl'>{$buyerHtml}</td><td class='itr'>{$meta}</td></tr>" . ($refs ? "<tr><td colspan='2' class='itl'>{$refs}</td></tr>" : '') . '</table>';

        if ($kind === 'receipt') {
            $what = $v->narration ?: 'Payment received with thanks';
            $body = $top . "<table class='gd'><thead><tr><th>Particulars</th><th class='r' style='width:22%'>Amount</th></tr></thead><tbody><tr><td>{$e($what)}</td><td class='r'><b>{$e($sym)} {$n($v->total_amount)}</b></td></tr></tbody></table>"
                . "<div class='iw'>Amount received (in words): <b>{$e($this->words((float) $v->total_amount, $unit))}</b></div>";
        } else {
            $rows = '';
            $no = 0;
            foreach ($v->items->where('item_type', '!=', 'charge')->sortBy('line_no') as $i) {
                $comp = $i->parent_item_id !== null;
                $desc = $i->description . ($i->variant_label ? ' (' . $i->variant_label . ')' : '');
                $no += $comp ? 0 : 1;
                $rows .= '<tr><td class="sl">' . ($comp ? '' : $no) . '</td><td class="ds' . ($comp ? ' cm' : '') . '">' . ($comp ? '&#8627; ' : '') . $e($desc) . '</td>'
                    . ($i->is_header ? '<td></td><td></td><td></td><td></td><td></td>'
                        : '<td class="r">' . $e(($i->quantity + 0) . ' ' . $i->unit_code) . '</td><td class="r">' . $n($i->rate) . '</td><td class="c">' . $e($i->unit_code) . '</td><td class="r">' . ((float) $i->discount_amount > 0 ? $n($i->discount_amount) : '') . '</td><td class="r"><b>' . $n($i->amount) . '</b></td>') . '</tr>';
            }
            $foot = $this->footer($v);
            // charges and taxes under the goods, in bolder ink
            foreach ($foot['charges'] as $c) {
                $rows .= '<tr class="chg"><td></td><td class="r">' . $e($c['description']) . '</td><td></td><td></td><td></td><td></td><td class="r">' . $n($c['amount']) . '</td></tr>';
            }
            $vat = [];
            foreach ($foot['taxes'] as $t) {
                $rate = (float) $t['base'] > 0 ? round($t['amount'] / $t['base'] * 100, 2) : 0.0;
                $rows .= '<tr class="chg"><td></td><td class="r">' . $e($t['ledger'] ?: $t['label']) . '</td><td></td><td class="r">' . $e($rate + 0) . '</td><td class="c">%</td><td></td><td class="r">' . $n($t['amount']) . '</td></tr>';
                $k = (string) $rate;
                $vat[$k] ??= ['rate' => $rate, 'base' => 0.0, 'amount' => 0.0];
                $vat[$k]['base'] += (float) $t['base'];
                $vat[$k]['amount'] += (float) $t['amount'];
            }
            $units = array_unique(array_filter($v->items->where('item_type', '!=', 'charge')->where('is_header', false)->pluck('unit_code')->all()));
            $qty = $v->items->where('item_type', '!=', 'charge')->where('is_header', false)->whereNull('parent_item_id')->sum('quantity');
            $disc = (float) $v->items->where('item_type', '!=', 'charge')->whereNull('parent_item_id')->sum('discount_amount');
            $totDisc = $disc > 0 ? $n($disc) : '';
            $totQty = count($units) === 1 ? $e(($qty + 0) . ' ' . reset($units)) : '';

            $body = $top . "<table class='gd'><thead><tr><th style='width:6%'>Sl No.</th><th>Description of Goods</th><th style='width:13%'>Quantity</th><th style='width:12%'>Rate</th><th style='width:6%'>per</th><th style='width:11%'>Disc.</th><th style='width:15%'>Amount</th></tr></thead><tbody>{$rows}"
                . "<tr class='tt'><td></td><td class='r'>Total</td><td class='r'>{$totQty}</td><td></td><td></td><td class='r'>{$totDisc}</td><td class='r'>{$e($sym)} {$n($v->total_amount)}</td></tr></tbody></table>"
                . "<table class='iw2'><tr><td>Amount Chargeable (in words): <b>{$e($this->words((float) $v->total_amount, $unit))}</b></td><td class='rt'>E. &amp; O.E</td></tr></table>";
            if ($vat) {
                $vt = '<table class="vt"><thead><tr><th></th><th style="width:12%">VAT %</th><th style="width:20%">Assessable Value</th><th style="width:18%">VAT Amount</th></tr></thead><tbody>';
                foreach ($vat as $r) {
                    $vt .= "<tr><td></td><td class='r'>{$e($r['rate'] + 0)} %</td><td class='r'>{$n($r['base'])}</td><td class='r'>{$n($r['amount'])}</td></tr>";
                }
                $sumBase = array_sum(array_column($vat, 'base'));
                $sumVat = array_sum(array_column($vat, 'amount'));
                $body .= $vt . "<tr class='tt'><td></td><td class='r'>Total</td><td class='r'>{$n($sumBase)}</td><td class='r'>{$n($sumVat)}</td></tr></tbody></table>"
                    . "<div class='iw'>VAT Amount (in words): <b>{$e($this->words((float) $sumVat, $unit))} ({$e($sym)} {$n($sumVat)})</b></div>";
            }
            if (trim((string) $v->narration) !== '') {
                $body .= "<div class='ipm'><b>Narration</b><br>" . nl2br($e($v->narration)) . '</div>';
            }
            if ($fin && ! empty($co['payment_mode'])) {
                $body .= "<div class='ipm'><b>Mode of payment</b><br>" . nl2br($e($co['payment_mode'])) . '</div>';
            }
            if ($fin && ! empty($co['declaration'])) {
                $body .= "<div class='ipm'><b>Declaration</b><br>" . nl2br($e($co['declaration'])) . '</div>';
            }
        }

        $note = 'This is a computer generated ' . strtolower($label);
        $body = "<div class='icopy'>(Original)</div><div class='ittl'>{$title}</div>" . $band . $body
            . "<table class='isig'><tr><td class='isl'><b>Customer's Seal and Signature</b></td><td class='isr'><b>for {$e($legal)}</b><br><br><b>Authorised Signatory</b></td></tr></table>"
            . (! empty($co['tagline']) ? "<div class='itag'>{$e($co['tagline'])}</div>" : '') . "<div class='inote'>{$note}</div>";

        $html = str_replace('</style>', $this->customerDocCss($this->docTint($kind)) . '</style>', $this->html($body, $v->voucher_number));
        $name = $this->documentFileName($v);   // e.g. invoice-WNKJ-INV-00019

        return $format === 'pdf' ? $this->pdf($html, "$name.pdf") : $this->send($html, 'text/html; charset=UTF-8', "$name.html", false);
    }

    private function customerDocCss(array $t): string
    {
        // a tinted page paints to the very edge, so the margin becomes padding inside it
        $css = ($t['page'] ? '@page{margin:0}body{margin:0;padding:8mm;background:' . $t['page'] . '}' : '@page{margin:8mm}body{margin:0}') . '.icopy{position:absolute;' . ($t['page'] ? 'top:8mm;right:8mm' : 'top:0;right:0') . ';font-size:10px;color:#333}.ittl{text-align:center;font-weight:700;font-size:15px;margin:0 0 4px}.ib{background:#c9e8f3;text-align:center;padding:8px 6px 6px}.ibn{font-size:21px;font-weight:700}.ibd{font-size:10.5px;line-height:1.4}.ibt{font-size:13px;font-weight:700;margin-top:6px}'
            . '.ic{margin:0 0 8px;background:#e3f3f9;border-top:1px solid #8cbfd1;border-bottom:1px solid #8cbfd1}.ic td{border:0;padding:3px 10px;font-size:11px}.rt{text-align:right}'
            . '.it0{margin:8px 0}.it0 td{border:0;vertical-align:top;padding:2px 0;font-size:11px;line-height:1.45}.itl{width:58%}.itr{width:42%}.im{margin-bottom:2px}'
            . '.gd{border:1px solid #444;margin:8px 0 0}.gd th{background:#e3f3f9;border:1px solid #444;text-align:center;font-weight:400;font-size:11px}.gd td{border-top:0;border-bottom:0;border-left:1px solid #444;border-right:1px solid #444;padding:4px 6px;font-size:11px}'
            . '.gd .sl{text-align:right}.gd .ds{font-weight:700}.gd .cm{font-weight:400;padding-left:18px}.gd .c{text-align:center}.gd .chg td{font-weight:700}.gd .tt td{border-top:1px solid #444;border-bottom:1px solid #444;font-weight:700}'
            . '.iw{margin:6px 0;font-size:11px}.iw2{background:#c9e8f3;margin:0;border:1px solid #444}.iw2 td{border:0;font-size:11px;padding:3px 6px}'
            . '.vt{margin:0;border:1px solid #444}.vt th{background:#e3f3f9;border:1px solid #444;font-weight:400;font-size:11px;text-align:center}.vt td{border:1px solid #444;font-size:11px}.vt .tt td{font-weight:400}'
            . '.ipm{margin-top:14px;font-size:11px;line-height:1.5}.isig{margin-top:34px}.isig td{border:0;font-size:11px;line-height:1.6;padding:0;vertical-align:bottom}.isl{width:50%}.isr{width:50%;text-align:right}.itag{text-align:center;margin-top:18px;font-style:italic;font-size:11px}'
            . '.inote{text-align:center;margin-top:6px;padding:3px;background:#c9e8f3;font-size:10px}';

        return strtr($css, ['#c9e8f3' => $t['band'], '#e3f3f9' => $t['light'], '#8cbfd1' => $t['band']]);
    }

    /** An amount in words, as printed on a tax invoice: "Kenyan Shilling Two Thousand Nine Hundred and Fifty Cents Only". */
    private function words(float $amount, string $unit, string $minor = 'Cents'): string
    {
        $amount = round(abs($amount), 2);
        $whole = (int) floor($amount);
        $cents = (int) round(($amount - $whole) * 100);
        $out = trim($unit . ' ' . $this->intWords($whole));

        return $out . ($cents ? ' and ' . $this->intWords($cents) . ' ' . $minor : '') . ' Only';
    }

    private function intWords(int $n): string
    {
        if ($n === 0) {
            return 'Zero';
        }
        $ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
        $tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
        $under1000 = function (int $x) use ($ones, $tens): string {
            $s = '';
            if ($x >= 100) {
                $s .= $ones[intdiv($x, 100)] . ' Hundred';
                $x %= 100;
                $s .= $x ? ' ' : '';
            }
            if ($x >= 20) {
                $s .= $tens[intdiv($x, 10)] . ($x % 10 ? ' ' . $ones[$x % 10] : '');
            } elseif ($x > 0) {
                $s .= $ones[$x];
            }

            return $s;
        };
        $parts = [];
        foreach (['', 'Thousand', 'Million', 'Billion'] as $i => $scale) {
            $chunk = intdiv($n, 1000 ** $i) % 1000;
            if ($chunk) {
                array_unshift($parts, trim($under1000($chunk) . ' ' . $scale));
            }
        }

        return implode(' ', $parts);
    }

    private function html(string $body, string $title): string
    {
        $css = 'body{font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#111;margin:24px}h1{font-size:18px;margin:0 0 4px}h2{font-size:14px;margin:18px 0 6px}'
            . '.co{border-bottom:2px solid #111;padding-bottom:8px;margin-bottom:12px}.coname{font-size:16px;font-weight:700}.cod{color:#444;font-size:11px;margin-top:2px}.meta{color:#555;margin:0 0 12px}table{width:100%;border-collapse:collapse;margin:8px 0}th,td{border-bottom:1px solid #ddd;padding:5px 6px;text-align:left}'
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
