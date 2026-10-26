<?php

namespace App\Services\BulkImport\Formats;

use PhpOffice\PhpSpreadsheet\IOFactory;

/**
 * Turns an uploaded file into rows: [heading => text], one per line of the file. Nothing is interpreted here: types, required cells and
 * references are the engine's job. Supports csv, json, xml, xlsx and markdown (a pipe table).
 */
class Reader
{
    public const FORMATS = ['csv', 'json', 'xml', 'xlsx', 'markdown'];
    public const MAX_BYTES = 5 * 1024 * 1024;
    public const MAX_ROWS = 5000;

    /** The format a file name suggests, or null. */
    public static function guess(string $filename): ?string
    {
        return match (strtolower(pathinfo($filename, PATHINFO_EXTENSION))) {
            'csv', 'tsv', 'txt' => 'csv',
            'json' => 'json',
            'xml' => 'xml',
            'xlsx', 'xlsm' => 'xlsx',
            'md', 'markdown' => 'markdown',
            default => null,
        };
    }

    /**
     * @return array{headings: string[], rows: array<int, array<string, string>>} the rows are numbered as in the file (row 1 is the headings of a table, so the first record is row 2)
     * @throws FileProblem
     */
    public function read(string $path, string $format): array
    {
        if (! in_array($format, self::FORMATS, true)) {
            throw new FileProblem('That format is not supported. Use '.implode(', ', self::FORMATS).'.', 'unsupported_format');
        }
        if (! is_file($path) || filesize($path) === 0) {
            throw new FileProblem('The file is empty.', 'empty_file');
        }
        if (filesize($path) > self::MAX_BYTES) {
            throw new FileProblem('The file is bigger than '.(self::MAX_BYTES / 1048576).' MB. Split it and import the parts one after the other.', 'file_too_big');
        }
        $table = match ($format) {
            'csv' => $this->csv($path),
            'json' => $this->json($path),
            'xml' => $this->xml($path),
            'xlsx' => $this->xlsx($path),
            'markdown' => $this->markdown($path),
        };

        return $this->shape($table);
    }

    /** @param array<int, array<int|string, mixed>> $table the first line is the headings */
    private function shape(array $table): array
    {
        $table = array_values($table);
        if (! $table) {
            throw new FileProblem('The file has no rows.', 'empty_file');
        }
        $headings = array_map(fn ($h) => trim((string) $h), array_values($table[0]));
        if (! array_filter($headings, fn ($h) => $h !== '')) {
            throw new FileProblem('The first row must be the column headings.', 'no_headings');
        }
        $rows = [];
        foreach (array_slice($table, 1) as $i => $cells) {
            $cells = array_values($cells);
            $row = [];
            foreach ($headings as $c => $h) {
                if ($h === '') {
                    continue;
                }
                $row[$h] = $this->text($cells[$c] ?? '');
            }
            if (! array_filter($row, fn ($v) => $v !== '')) {
                continue;   // a blank line
            }
            $rows[$i + 2] = $row;
        }
        if (! $rows) {
            throw new FileProblem('The file has headings but no rows.', 'empty_file');
        }
        if (count($rows) > self::MAX_ROWS) {
            throw new FileProblem('The file has '.count($rows).' rows; the most one import takes is '.self::MAX_ROWS.'. Split it and import the parts one after the other.', 'too_many_rows');
        }

        return ['headings' => array_values(array_filter($headings, fn ($h) => $h !== '')), 'rows' => $rows];
    }

    private function text(mixed $v): string
    {
        if (is_bool($v)) {
            return $v ? 'true' : 'false';
        }
        if (is_array($v)) {
            return implode(';', array_map(fn ($x) => is_scalar($x) ? $this->text($x) : json_encode($x), $v));
        }
        if (is_float($v) && floor($v) === $v && abs($v) < 1e15) {
            return (string) (int) $v;
        }

        return trim((string) ($v ?? ''));
    }

    private function csv(string $path): array
    {
        $raw = file_get_contents($path);
        $raw = preg_replace('/^\xEF\xBB\xBF/', '', $raw);
        if (! mb_check_encoding($raw, 'UTF-8')) {
            $raw = mb_convert_encoding($raw, 'UTF-8', 'Windows-1252');   // an Excel "CSV" saved the old way
        }
        $first = strtok($raw, "\r\n") ?: '';
        $delimiter = ',';
        $best = substr_count($first, ',');
        foreach ([';' => ';', "\t" => "\t", '|' => '|'] as $d) {
            if (substr_count($first, $d) > $best) {
                $best = substr_count($first, $d);
                $delimiter = $d;
            }
        }
        $fh = fopen('php://temp', 'r+');
        fwrite($fh, $raw);
        rewind($fh);
        $table = [];
        while (($cells = fgetcsv($fh, 0, $delimiter, '"', '')) !== false) {
            $table[] = $cells === [null] ? [] : $cells;
        }
        fclose($fh);

        return $this->keepBlankLinePositions($table);
    }

    /** Blank lines stay in the table so the row numbers in the answer match the file. */
    private function keepBlankLinePositions(array $table): array
    {
        return array_map(fn ($r) => $r ?: [''], $table);
    }

    private function json(string $path): array
    {
        $data = json_decode(file_get_contents($path), true);
        if (json_last_error() !== JSON_ERROR_NONE) {
            throw new FileProblem('The JSON is not valid: '.json_last_error_msg().'.', 'invalid_json');
        }
        if (is_array($data) && ! array_is_list($data)) {
            foreach (['rows', 'data', 'records', 'items'] as $k) {
                if (isset($data[$k]) && is_array($data[$k])) {
                    $data = $data[$k];
                    break;
                }
            }
        }
        if (! is_array($data) || ! array_is_list($data) || ! $data || ! is_array($data[0])) {
            throw new FileProblem('The JSON must be a list of objects, like [{"name": "Flour"}, ...] (or {"rows": [...]}).', 'invalid_json');
        }

        return $this->fromObjects($data);
    }

    private function xml(string $path): array
    {
        $prev = libxml_use_internal_errors(true);
        $xml = simplexml_load_file($path, \SimpleXMLElement::class, LIBXML_NONET | LIBXML_NOCDATA);   // no entity expansion, no network
        $errors = libxml_get_errors();
        libxml_clear_errors();
        libxml_use_internal_errors($prev);
        if ($xml === false) {
            $why = $errors ? trim($errors[0]->message).' (line '.$errors[0]->line.')' : 'unknown error';
            throw new FileProblem('The XML is not valid: '.$why.'.', 'invalid_xml');
        }
        $objects = [];
        foreach ($xml->children() as $child) {
            $o = [];
            foreach ($child->attributes() as $k => $v) {
                $o[(string) $k] = (string) $v;
            }
            foreach ($child->children() as $k => $v) {
                $o[(string) $k] = $v->count() ? implode(';', array_map('strval', iterator_to_array($v->children(), false))) : (string) $v;
            }
            $objects[] = $o;
        }
        if (! $objects) {
            throw new FileProblem('The XML has no rows. Put one element per record under the root, like <rows><row><name>Flour</name></row></rows>.', 'invalid_xml');
        }

        return $this->fromObjects($objects);
    }

    /** @param array<int, array<string, mixed>> $objects */
    private function fromObjects(array $objects): array
    {
        $headings = [];
        foreach ($objects as $o) {
            foreach (array_keys((array) $o) as $k) {
                $headings[$k] = true;
            }
        }
        $headings = array_keys($headings);
        $table = [$headings];
        foreach ($objects as $o) {
            $o = (array) $o;
            $table[] = array_map(fn ($h) => $o[$h] ?? '', $headings);
        }

        return $table;
    }

    private function xlsx(string $path): array
    {
        try {
            $reader = IOFactory::createReader('Xlsx');
            $reader->setReadDataOnly(true);
            $book = $reader->load($path);
        } catch (\Throwable $e) {
            throw new FileProblem('The Excel file can not be opened: it is not a valid .xlsx.', 'invalid_xlsx');
        }
        $sheet = $book->getSheetByName('Data') ?? $book->getSheet(0);   // the template keeps the data on a sheet called Data
        $table = [];
        foreach ($sheet->toArray(null, true, false, false) as $line) {
            $table[] = array_map(fn ($v) => $v instanceof \DateTimeInterface ? $v->format('Y-m-d') : $v, $line);
        }
        $book->disconnectWorksheets();

        return $table;
    }

    private function markdown(string $path): array
    {
        $table = [];
        $started = false;
        foreach (preg_split('/\R/', file_get_contents($path)) as $line) {
            $t = trim($line);
            if (! str_starts_with($t, '|')) {
                if ($started) {
                    break;   // the table ended
                }
                continue;
            }
            $cells = $this->mdCells($t);
            if (! $started) {
                $started = true;
            } elseif (! array_filter($cells, fn ($c) => ! preg_match('/^:?-{1,}:?$/', $c))) {
                continue;   // the |---|---| line
            }
            $table[] = $cells;
        }
        if (! $table) {
            throw new FileProblem('No table found. Write the rows as a Markdown table: a header line, a |---| line, then one line per record.', 'invalid_markdown');
        }

        return $table;
    }

    private function mdCells(string $line): array
    {
        $line = preg_replace('/^\||\|$/', '', $line);
        $cells = preg_split('/(?<!\\\\)\|/', $line);

        return array_map(fn ($c) => trim(str_replace('\\|', '|', $c)), $cells);
    }
}
