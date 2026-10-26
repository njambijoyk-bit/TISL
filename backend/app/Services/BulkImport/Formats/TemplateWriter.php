<?php

namespace App\Services\BulkImport\Formats;

use App\Services\BulkImport\Column;
use App\Services\BulkImport\ImportEntity;
use PhpOffice\PhpSpreadsheet\Spreadsheet;
use PhpOffice\PhpSpreadsheet\Writer\Xlsx;

/** The mapping template of one thing in one format: the exact headings the import reads, and example rows to copy from. */
class TemplateWriter
{
    /** @return array{body: string, mime: string, filename: string} */
    public function make(ImportEntity $e, string $format): array
    {
        $cols = $e->columns();
        $rows = $e->examples();
        $name = str_replace('.', '-', $e->key()).'-template';

        return match ($format) {
            'csv' => ['body' => $this->csv($cols, $rows), 'mime' => 'text/csv', 'filename' => $name.'.csv'],
            'json' => ['body' => $this->json($cols, $rows), 'mime' => 'application/json', 'filename' => $name.'.json'],
            'xml' => ['body' => $this->xml($cols, $rows), 'mime' => 'application/xml', 'filename' => $name.'.xml'],
            'markdown' => ['body' => $this->markdown($e, $cols, $rows), 'mime' => 'text/markdown', 'filename' => $name.'.md'],
            'xlsx' => ['body' => $this->xlsx($e, $cols, $rows), 'mime' => 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'filename' => $name.'.xlsx'],
            default => throw new FileProblem('That format is not supported.', 'unsupported_format'),
        };
    }

    /** @param Column[] $cols */
    private function grid(array $cols, array $rows): array
    {
        $grid = [array_map(fn (Column $c) => $c->key, $cols)];
        foreach ($rows as $r) {
            $grid[] = array_map(fn (Column $c) => (string) ($r[$c->key] ?? ''), $cols);
        }

        return $grid;
    }

    private function csv(array $cols, array $rows): string
    {
        $fh = fopen('php://temp', 'r+');
        foreach ($this->grid($cols, $rows) as $line) {
            fputcsv($fh, $line, ',', '"', '');
        }
        rewind($fh);

        return "\xEF\xBB\xBF".stream_get_contents($fh);   // the BOM makes Excel open it as UTF-8
    }

    private function json(array $cols, array $rows): string
    {
        $out = [];
        foreach ($rows as $r) {
            $o = [];
            foreach ($cols as $c) {
                $v = (string) ($r[$c->key] ?? '');
                $o[$c->key] = $c->type === 'list' && $v !== '' ? array_map('trim', preg_split('/[;|]/', $v)) : $v;
            }
            $out[] = $o;
        }

        return json_encode(['rows' => $out], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    }

    private function xml(array $cols, array $rows): string
    {
        $x = new \XMLWriter();
        $x->openMemory();
        $x->setIndent(true);
        $x->startDocument('1.0', 'UTF-8');
        $x->startElement('rows');
        foreach ($rows as $r) {
            $x->startElement('row');
            foreach ($cols as $c) {
                $x->writeElement($c->key, (string) ($r[$c->key] ?? ''));
            }
            $x->endElement();
        }
        $x->endElement();

        return $x->outputMemory();
    }

    private function markdown(ImportEntity $e, array $cols, array $rows): string
    {
        $esc = fn (string $s) => str_replace('|', '\\|', $s);
        $g = $this->grid($cols, $rows);
        $out = '<!-- '.$e->label().': keep the header line as it is, one line per row. Required: '.implode(', ', array_map(fn (Column $c) => $c->key, array_filter($cols, fn (Column $c) => $c->required))).". -->\n\n";
        $out .= '| '.implode(' | ', $g[0])." |\n|".str_repeat(' --- |', count($g[0]))."\n";
        foreach (array_slice($g, 1) as $line) {
            $out .= '| '.implode(' | ', array_map($esc, $line))." |\n";
        }

        return $out;
    }

    private function xlsx(ImportEntity $e, array $cols, array $rows): string
    {
        $book = new Spreadsheet();
        $data = $book->getActiveSheet()->setTitle('Data');
        foreach ($this->grid($cols, $rows) as $r => $line) {
            foreach ($line as $c => $v) {
                $data->setCellValueExplicit([$c + 1, $r + 1], $v, \PhpOffice\PhpSpreadsheet\Cell\DataType::TYPE_STRING);
            }
        }
        $data->getStyle([1, 1, count($cols), 1])->getFont()->setBold(true);
        foreach (range(1, count($cols)) as $c) {
            $data->getColumnDimensionByColumn($c)->setAutoSize(true);
        }
        $guide = $book->createSheet()->setTitle('Guide');
        $guide->fromArray(['Column', 'Label', 'Type', 'Required', 'Allowed values', 'Notes'], null, 'A1');
        foreach ($cols as $i => $c) {
            $guide->fromArray([$c->key, $c->label, $c->type, $c->required ? 'yes' : 'no', implode(', ', $c->options), $c->help], null, 'A'.($i + 2));
        }
        $guide->getStyle('A1:F1')->getFont()->setBold(true);
        $book->setActiveSheetIndex(0);
        $tmp = tempnam(sys_get_temp_dir(), 'tpl');
        (new Xlsx($book))->save($tmp);
        $body = file_get_contents($tmp);
        @unlink($tmp);
        $book->disconnectWorksheets();

        return $body;
    }
}
