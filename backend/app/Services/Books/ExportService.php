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
        ], fn ($x) => $x !== null && $x !== '' && $x !== []);
    }

    private function companyHeader(array $co): string
    {
        $e = fn ($s) => htmlspecialchars((string) $s, ENT_QUOTES, 'UTF-8');
        if (! $co) {
            return '';
        }
        $h = "<div class='co'><div class='coname'>{$e($co['name'] ?? '')}</div>";
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
            . '<p class="stbody">Given below is the detail of amounts outstanding against your ledger in our books as of ' . $e($d($asOfDate)) . '.<br>'
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

        return "<table class='sthead'><tr><td class='stl'></td><td class='str'>" . $lines($clean($ours)) . '</td></tr>'
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
            . '.ltr{width:100%;margin:14px 0 4px}.ltr td{border:0;padding:0;font-size:12px}.subj{font-weight:700;margin:6px 0}.ol{width:100%;border-collapse:collapse;margin:10px 0}'
            . '.ol th{background:none;border-top:1.5px solid #111;border-bottom:1.5px solid #111;padding:5px 4px;font-size:11px;text-align:right}.ol th.l,.ol td.l{text-align:left}'
            . '.ol td{border:0;padding:3px 4px;font-size:11px;text-align:right}.ol .od{font-style:italic;color:#444;font-size:10px}.ol tr.sum td{border-top:1px solid #111;border-bottom:1.5px solid #111;font-weight:700}'
            . '.gtot{font-weight:700;margin:8px 0}.bars{width:100%;border-collapse:collapse;margin:12px 0}.bars td{border:0;text-align:center;vertical-align:bottom;font-size:10px;padding:0 10px}'
            . '.bar{background:#444;margin:0 auto;width:60%}.sign{text-align:right;margin-top:26px;line-height:1.6}';
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
