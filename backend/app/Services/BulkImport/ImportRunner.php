<?php

namespace App\Services\BulkImport;

use App\Services\Books\BooksException;
use App\Services\BulkImport\Formats\FileProblem;
use App\Services\BulkImport\Formats\Reader;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Validation\ValidationException;
use Throwable;

/**
 * Reads a file, checks every row, and either saves all of it or none of it.
 *
 * Everything runs inside one database transaction, record by record, each in its own savepoint. A refused record is noted and the next one is
 * still tried, so the answer lists every problem in the file at once; at the end the transaction is committed only when there were no problems
 * and the caller asked to commit. A preview is the very same run, rolled back: what it says is exactly what a real import would do.
 *
 * Errors are {row, column, code, message}; row 0 means the file or the setup as a whole.
 */
class ImportRunner
{
    public const MAX_REPORTED = 200;

    public function __construct(private ImportRegistry $registry, private Reader $reader)
    {
    }

    /**
     * @param ?array<string, string> $mapping optional file heading => column key, for headings that are not the template's
     * @return array<string, mixed>
     */
    public function run(ImportEntity $e, string $path, string $format, bool $commit, ?array $mapping = null, ?int $userId = null): array
    {
        $out = ['entity' => $e->key(), 'format' => $format, 'committed' => false, 'preview' => ! $commit, 'rows' => 0, 'records' => 0, 'created' => 0, 'errors' => []];

        if ($gate = $this->registry->gate($e)) {
            return $this->fail($out, 0, null, $gate[0], $gate[1]);
        }
        if ($missing = $this->registry->missing($e)) {
            foreach ($missing as $m) {
                $out = $this->add($out, 0, null, 'dependency_missing', "{$e->label()} need {$m['label']} in the system first".($m['entity'] ? ' — import them first.' : '.'));
            }

            return $this->finish($out, $e, 'Nothing was saved: something this depends on is missing.');
        }
        try {
            $file = $this->reader->read($path, $format);
        } catch (FileProblem $p) {
            return $this->fail($out, 0, null, $p->codeName, $p->getMessage());
        }
        $out['rows'] = count($file['rows']);

        [$map, $problems] = $this->map($e, $file['headings'], $mapping ?? []);
        foreach ($problems as [$code, $col, $msg]) {
            $out = $this->add($out, 0, $col, $code, $msg);
        }
        if ($problems) {
            return $this->finish($out, $e, 'Nothing was saved: the columns of the file do not match the template.');
        }

        [$records, $out] = $this->records($e, $file['rows'], $map, $out);
        $out['records'] = count($records);
        $created = 0;

        DB::beginTransaction();
        try {
            $ctx = new ImportContext($userId);
            foreach ($records as $rec) {
                if ($rec['_bad']) {
                    continue;   // already reported; it is not tried
                }
                try {
                    DB::transaction(function () use ($e, $rec, $ctx) {
                        $e->check($rec['values'], $ctx);
                        $e->store($rec['values'], $ctx);
                    });
                    $created++;
                } catch (Throwable $t) {
                    $out = $this->blame($out, $rec, $t);
                }
            }
        } catch (Throwable $t) {
            DB::rollBack();
            report($t);

            return $this->fail($out, 0, null, 'unexpected', 'Something unexpected stopped the import, so nothing was saved. It has been logged; try again, and if it keeps happening tell the administrator.');
        }
        if ($out['errors'] || ! $commit) {
            DB::rollBack();
        } else {
            DB::commit();
            $out['committed'] = true;
            Log::info('Bulk import', ['entity' => $e->key(), 'format' => $format, 'records' => $created, 'user_id' => $userId]);
        }
        $out['created'] = $out['errors'] ? 0 : $created;

        return $this->finish($out, $e, match (true) {
            (bool) $out['errors'] => 'Nothing was saved: '.$out['error_count'].' problem'.($out['error_count'] === 1 ? '' : 's').' to fix first. An import goes in whole or not at all.',
            $commit => $created.' '.$e->label().' imported.',
            default => 'All '.$created.' record'.($created === 1 ? '' : 's').' check out. Nothing is saved until you import.',
        });
    }

    // ── columns ──────────────────────────────────────────────────────────

    /** @return array{0: array<string, string>, 1: array<int, array{0: string, 1: ?string, 2: string}>} file heading => column key; and the problems */
    private function map(ImportEntity $e, array $headings, array $mapping): array
    {
        $byName = [];
        foreach ($e->columns() as $c) {
            foreach (array_merge([$c->key, $c->label], $c->aliases) as $n) {
                $byName[Column::norm($n)] = $c->key;
            }
        }
        $explicit = [];
        foreach ($mapping as $heading => $key) {
            $explicit[Column::norm((string) $heading)] = (string) $key;
        }
        $map = [];
        $problems = [];
        $unknown = [];
        $used = [];
        foreach ($headings as $h) {
            $key = $explicit[Column::norm($h)] ?? $byName[Column::norm($h)] ?? null;
            if ($key === '' || $key === 'skip') {
                continue;   // the person chose to leave this column out
            }
            if ($key === null || ! in_array($key, array_map(fn (Column $c) => $c->key, $e->columns()), true)) {
                $unknown[] = $h;
                continue;
            }
            if (isset($used[$key])) {
                $problems[] = ['duplicate_column', $key, "The columns \"{$used[$key]}\" and \"{$h}\" both fill \"{$key}\". Remove one of them."];
                continue;
            }
            $used[$key] = $h;
            $map[$h] = $key;
        }
        foreach ($unknown as $h) {
            $problems[] = ['unknown_column', $h, "The column \"{$h}\" is not one of the template's. Rename it to match, or leave it out. The columns are: ".implode(', ', array_map(fn (Column $c) => $c->key, $e->columns())).'.'];
        }
        foreach ($e->columns() as $c) {
            if ($c->required && ! isset($used[$c->key])) {
                $problems[] = ['missing_column', $c->key, "The file has no \"{$c->key}\" column ({$c->label}), and it is required."];
            }
        }

        return [$map, $problems];
    }

    // ── rows to records ──────────────────────────────────────────────────

    /** @return array{0: array<int, array{values: array, row: int, _bad: bool}>, 1: array} */
    private function records(ImportEntity $e, array $rows, array $map, array $out): array
    {
        $cols = [];
        foreach ($e->columns() as $c) {
            $cols[$c->key] = $c;
        }
        $group = $e->groupBy();
        $records = [];   // keyed by group (or row number)
        $seen = [];      // identity => first row
        foreach ($rows as $n => $cells) {
            $clean = [];
            $bad = false;
            foreach ($map as $heading => $key) {
                try {
                    $clean[$key] = $this->cell($cols[$key], $cells[$heading] ?? '');
                } catch (RowProblem $p) {
                    $out = $this->add($out, $n, $key, $p->codeName, $p->getMessage());
                    $bad = true;
                }
            }
            foreach ($cols as $key => $c) {
                if ($c->required && ! $bad && ($clean[$key] ?? null) === null) {
                    $out = $this->add($out, $n, $key, RowProblem::REQUIRED, "{$c->label} is required.");
                    $bad = true;
                }
            }
            $id = $group ? mb_strtolower((string) ($clean[$group] ?? '')) : (string) $n;
            if ($group && ($clean[$group] ?? null) === null) {
                $bad = true;   // already reported as required
                $id = 'row'.$n;
            }
            if (! isset($records[$id])) {
                $records[$id] = ['row' => $n, 'values' => ['_row' => $n, '_lines' => []], '_bad' => false];
                $records[$id]['_cleanFirst'] = $clean;
            }
            $rec = &$records[$id];
            $line = ['_row' => $n];
            foreach ($clean as $key => $v) {
                if ($cols[$key]->perRow) {
                    $line[$key] = $v;
                    continue;
                }
                $first = $rec['values'][$key] ?? null;
                if ($first === null) {
                    $rec['values'][$key] = $v;
                } elseif ($v !== null && $key !== $group && $first != $v) {
                    $out = $this->add($out, $n, $key, RowProblem::CONFLICT, "{$cols[$key]->label} is \"".(is_array($v) ? implode(';', $v) : $v).'" here but "'.(is_array($first) ? implode(';', $first) : $first)."\" on row {$rec['row']}; all rows of the same {$cols[$group]->label} must agree.");
                    $bad = true;
                }
            }
            $rec['values']['_lines'][] = $line;
            $rec['_bad'] = $rec['_bad'] || $bad;
            unset($rec);
        }
        foreach ($records as $id => &$rec) {
            unset($rec['_cleanFirst']);
            if (! $rec['_bad'] && ($ident = $e->identity($rec['values'])) !== null) {
                if (isset($seen[$ident])) {
                    $out = $this->add($out, $rec['row'], null, RowProblem::DUPLICATE, "This repeats row {$seen[$ident]} (\"{$ident}\"). Each one may appear once in the file.");
                    $rec['_bad'] = true;
                } else {
                    $seen[$ident] = $rec['row'];
                }
            }
        }
        unset($rec);

        return [array_values($records), $out];
    }

    /** One cell to its type. Empty is null. @throws RowProblem */
    private function cell(Column $c, string $raw): mixed
    {
        $v = trim($raw);
        if ($v === '') {
            return null;
        }
        $bad = fn (string $why) => new RowProblem("{$c->label}: \"{$v}\" {$why}", RowProblem::INVALID, $c->key);
        if ($c->max && mb_strlen($v) > $c->max) {
            throw $bad("is too long (the most is {$c->max} characters)");
        }
        switch ($c->type) {
            case 'integer':
                if (! preg_match('/^-?\d+$/', $v)) {
                    throw $bad('is not a whole number');
                }

                return (int) $v;
            case 'number':
                $n = preg_match('/^\d{1,3}(,\d{3})+(\.\d+)?$/', $v) ? str_replace(',', '', $v) : str_replace(' ', '', $v);
                if (! is_numeric($n)) {
                    throw $bad('is not a number');
                }

                return (float) $n;
            case 'boolean':
                $b = ['1' => true, 'true' => true, 'yes' => true, 'y' => true, '0' => false, 'false' => false, 'no' => false, 'n' => false][mb_strtolower($v)] ?? null;
                if ($b === null) {
                    throw $bad('is not yes or no');
                }

                return $b;
            case 'date':
                try {
                    return is_numeric($v) && (float) $v > 20000 && (float) $v < 80000
                        ? \PhpOffice\PhpSpreadsheet\Shared\Date::excelToDateTimeObject((float) $v)->format('Y-m-d')   // an Excel date that arrived as a serial number
                        : Carbon::parse($v)->format('Y-m-d');
                } catch (Throwable) {
                    throw $bad('is not a date (write it as 2026-03-31)');
                }
            case 'list':
                return array_values(array_filter(array_map('trim', preg_split('/[;|]/', $v)), fn ($x) => $x !== ''));
            case 'enum':
                foreach ($c->options as $o) {
                    if (mb_strtolower($o) === mb_strtolower($v)) {
                        return $o;
                    }
                }
                throw $bad('is not one of: '.implode(', ', $c->options));
            default:
                return $v;
        }
    }

    // ── errors ───────────────────────────────────────────────────────────

    private function blame(array $out, array $rec, Throwable $t): array
    {
        if ($t instanceof RowProblem) {
            return $this->add($out, $t->row ?? $rec['row'], $t->column, $t->codeName, $t->getMessage());
        }
        if ($t instanceof ValidationException) {
            foreach ($t->errors() as $field => $messages) {
                $out = $this->add($out, $rec['row'], $field, RowProblem::INVALID, $messages[0]);
            }

            return $out;
        }
        if ($t instanceof BooksException) {
            return $this->add($out, $rec['row'], null, RowProblem::REJECTED, $t->getMessage());
        }
        report($t);

        return $this->add($out, $rec['row'], null, 'unexpected', 'This record could not be saved because of an unexpected error (logged for the administrator).');
    }

    private function add(array $out, int $row, ?string $column, string $code, string $message): array
    {
        $out['error_count'] = ($out['error_count'] ?? 0) + 1;
        if (count($out['errors']) < self::MAX_REPORTED) {
            $out['errors'][] = ['row' => $row, 'column' => $column, 'code' => $code, 'message' => $message];
        }

        return $out;
    }

    private function fail(array $out, int $row, ?string $column, string $code, string $message): array
    {
        return $this->finish($this->add($out, $row, $column, $code, $message), null, 'Nothing was saved: '.$message);
    }

    private function finish(array $out, ?ImportEntity $e, string $message): array
    {
        $out['error_count'] = $out['error_count'] ?? 0;
        $out['ok'] = $out['error_count'] === 0;
        $out['truncated'] = $out['error_count'] > count($out['errors']);
        $out['message'] = $message;

        return $out;
    }
}
