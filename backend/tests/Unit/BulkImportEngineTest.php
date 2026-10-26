<?php

namespace Tests\Unit;

use App\Services\BulkImport\AbstractEntity;
use App\Services\BulkImport\Column;
use App\Services\BulkImport\Formats\FileProblem;
use App\Services\BulkImport\Formats\Reader;
use App\Services\BulkImport\Formats\TemplateWriter;
use App\Services\BulkImport\ImportContext;
use App\Services\BulkImport\ImportRegistry;
use App\Services\BulkImport\ImportRunner;
use App\Services\BulkImport\RowProblem;
use App\Services\Licensing\LicenseManager;
use Tests\TestCase;

/** The bulk import engine on its own, with a stand-in entity: formats, mapping, typing, grouping, gating, and the all-or-nothing rule. */
class BulkImportEngineTest extends TestCase
{
    private function entity(array &$stored, bool $needsThing = false): AbstractEntity
    {
        return new class($stored, $needsThing) extends AbstractEntity {
            public function __construct(private array &$stored, private bool $needsThing)
            {
            }

            public function key(): string { return 'menus.things'; }
            public function module(): string { return 'menus'; }
            public function label(): string { return 'Things'; }
            public function description(): string { return 'Test things'; }
            public function groupBy(): ?string { return 'name'; }
            public function requires(): array { return $this->needsThing ? [['label' => 'Widgets', 'entity' => 'menus.widgets', 'present' => fn () => false]] : []; }
            public function columns(): array
            {
                return [
                    $this->required('name', 'Name', 'text', ['example' => 'Flour']),
                    $this->optional('size', 'Size', 'integer', ['example' => '3']),
                    $this->optional('kind', 'Kind', 'enum', ['options' => ['a', 'b'], 'example' => 'a']),
                    $this->optional('tags', 'Tags', 'list', ['example' => 'x;y']),
                    $this->optional('on', 'On', 'boolean', ['example' => 'yes']),
                    $this->required('part', 'Part', 'text', ['perRow' => true, 'example' => 'p1']),
                ];
            }
            public function examples(): array
            {
                return [['name' => 'Flour', 'size' => '3', 'kind' => 'a', 'tags' => 'x;y', 'on' => 'yes', 'part' => 'p1'], ['name' => 'Flour', 'size' => '3', 'kind' => 'a', 'tags' => 'x;y', 'on' => 'yes', 'part' => 'p2']];
            }
            public function check(array $r, ImportContext $ctx): void
            {
                if ($r['name'] === 'Missing') {
                    throw new RowProblem('No such thing.', RowProblem::MISSING_REF, 'name');
                }
                foreach ($r['_lines'] as $l) {
                    if ($l['part'] === 'bad') {
                        throw new RowProblem('Bad part.', RowProblem::INVALID, 'part', $l['_row']);
                    }
                }
            }
            public function store(array $r, ImportContext $ctx): void
            {
                $this->stored[] = $r['name'].':'.count($r['_lines']);
            }
        };
    }

    private function registry(bool $licensed = true, bool $active = true): ImportRegistry
    {
        $m = $this->createMock(LicenseManager::class);
        $m->method('isLicensed')->willReturn($licensed);
        $m->method('isActive')->willReturn($active);

        return new ImportRegistry($m);
    }

    private function file(string $content, string $ext = 'csv'): string
    {
        $p = tempnam(sys_get_temp_dir(), 'imp').'.'.$ext;
        file_put_contents($p, $content);

        return $p;
    }

    private function doRun(string $csv, bool $commit = true, ?array $mapping = null, bool $needs = false, ?ImportRegistry $reg = null, ?array &$stored = null): array
    {
        $stored = [];
        $reg ??= $this->registry();

        return (new ImportRunner($reg, new Reader()))->run($this->entity($stored, $needs), $this->file($csv), 'csv', $commit, $mapping);
    }

    public function test_a_clean_file_is_imported_in_whole_and_rows_of_a_group_become_one_record(): void
    {
        $r = $this->doRun("name,size,kind,tags,on,part\nFlour,3,a,x;y,yes,p1\nflour,3,A,,,p2\nSugar,,b,,no,p1\n", true, null, false, null, $stored);
        $this->assertTrue($r['ok'], json_encode($r['errors']));
        $this->assertTrue($r['committed']);
        $this->assertSame(['Flour:2', 'Sugar:1'], $stored);
        $this->assertSame(3, $r['rows']);
        $this->assertSame(2, $r['created']);
    }

    public function test_a_preview_runs_the_same_checks_but_says_nothing_is_saved(): void
    {
        $r = $this->doRun("name,part\nFlour,p1\n", false);
        $this->assertTrue($r['ok']);
        $this->assertFalse($r['committed']);
        $this->assertStringContainsString('Nothing is saved', $r['message']);
    }

    public function test_one_bad_record_means_nothing_is_saved_and_every_problem_is_listed_with_its_code(): void
    {
        $r = $this->doRun("name,size,kind,part\nFlour,x,a,p1\nSugar,2,z,p1\nMissing,1,a,p1\nSalt,1,a,bad\nTea,1,a,p1\n", true, null, false, null, $stored);
        $this->assertFalse($r['ok']);
        $this->assertFalse($r['committed']);
        $this->assertSame(0, $r['created']);
        $by = array_map(fn ($e) => [$e['row'], $e['column'], $e['code']], $r['errors']);
        $this->assertContains([2, 'size', 'invalid_value'], $by);
        $this->assertContains([3, 'kind', 'invalid_value'], $by);
        $this->assertContains([4, 'name', 'unknown_reference'], $by);
        $this->assertContains([5, 'part', 'invalid_value'], $by);
        $this->assertStringContainsString('whole or not at all', $r['message']);
    }

    public function test_a_record_the_checks_pass_is_still_not_kept_when_another_fails(): void
    {
        // Tea passes and is stored inside the transaction, but Missing fails: the run must roll everything back
        $r = $this->doRun("name,part\nTea,p1\nMissing,p1\n", true, null, false, null, $stored);
        $this->assertFalse($r['committed']);
        $this->assertSame(0, $r['created']);
    }

    public function test_required_cells_duplicates_and_disagreeing_rows_are_reported(): void
    {
        $r = $this->doRun("name,size,part\nFlour,1,p1\nFlour,2,p2\n,1,p1\nSugar,1,\nSalt,1,p1\nSalt,1,p2\n");
        $codes = array_column($r['errors'], 'code');
        $this->assertContains('conflicting_values', $codes);   // Flour says size 1, then 2
        $this->assertContains('required', $codes);              // no name; no part
        $this->assertSame(0, $r['created']);
    }

    public function test_two_rows_of_a_plain_entity_with_the_same_identity_are_a_duplicate(): void
    {
        $stored = [];
        $e = new class($stored) extends AbstractEntity {
            public function __construct(private array &$s) {}
            public function key(): string { return 'menus.plain'; }
            public function module(): string { return 'menus'; }
            public function label(): string { return 'Plain'; }
            public function description(): string { return ''; }
            public function columns(): array { return [$this->required('name', 'Name')]; }
            public function examples(): array { return []; }
            public function store(array $r, ImportContext $ctx): void { $this->s[] = $r['name']; }
        };
        $r = (new ImportRunner($this->registry(), new Reader()))->run($e, $this->file("name\nFlour\nSugar\nflour\n"), 'csv', true);
        $this->assertSame('duplicate_in_file', $r['errors'][0]['code']);
        $this->assertSame(4, $r['errors'][0]['row']);
        $this->assertFalse($r['committed']);
    }

    public function test_the_columns_of_the_file_must_match_the_template(): void
    {
        $r = $this->doRun("Name,Colour\nFlour,red\n");
        $codes = array_column($r['errors'], 'code');
        $this->assertContains('unknown_column', $codes);
        $this->assertContains('missing_column', $codes);   // part is required and absent
        $this->assertSame(0, $r['errors'][0]['row']);
    }

    public function test_headings_may_use_the_label_with_other_case_and_spacing_and_a_mapping_can_rename_them(): void
    {
        $r = $this->doRun("NAME,Size,Part\nFlour,1,p1\n");
        $this->assertTrue($r['ok'], json_encode($r['errors']));
        $r = $this->doRun("Item,Piece\nFlour,p1\n", true, ['Item' => 'name', 'Piece' => 'part']);
        $this->assertTrue($r['ok'], json_encode($r['errors']));
        $r = $this->doRun("Item,Piece,Junk\nFlour,p1,zzz\n", true, ['Item' => 'name', 'Piece' => 'part', 'Junk' => 'skip']);
        $this->assertTrue($r['ok'], json_encode($r['errors']));
    }

    public function test_something_missing_that_the_import_depends_on_stops_it_before_any_row_is_read(): void
    {
        $r = $this->doRun("name,part\nFlour,p1\n", true, null, true);
        $this->assertFalse($r['ok']);
        $this->assertSame('dependency_missing', $r['errors'][0]['code']);
        $this->assertStringContainsString('Widgets', $r['errors'][0]['message']);
    }

    public function test_a_module_that_is_off_or_unlicensed_is_refused_and_says_which(): void
    {
        $off = $this->doRun("name,part\nFlour,p1\n", true, null, false, $this->registry(true, false));
        $this->assertSame('module_off', $off['errors'][0]['code']);
        $this->assertStringContainsString('switched off', $off['errors'][0]['message']);
        $no = $this->doRun("name,part\nFlour,p1\n", true, null, false, $this->registry(false, false));
        $this->assertSame('module_not_licensed', $no['errors'][0]['code']);
        $stored = [];
        $reg = $this->registry(true, false);
        $this->assertNotNull($reg->gate($this->entity($stored)));
        $this->assertSame('bulkimport.menus', $reg->permission($this->entity($stored)));
    }

    public function test_every_registered_thing_has_a_unique_key_a_module_permission_and_example_rows_that_fit_its_columns(): void
    {
        $reg = $this->registry();
        $this->assertCount(count(ImportRegistry::ENTITIES), $reg->all());
        foreach ($reg->all() as $key => $e) {
            $this->assertStringStartsWith($e->module().'.', $key);
            $this->assertArrayHasKey($reg->permission($e), \App\Services\Access\Catalog::PERMISSIONS);
            $cols = array_map(fn (Column $c) => $c->key, $e->columns());
            foreach ($e->examples() as $row) {
                $this->assertSame([], array_diff(array_keys($row), $cols), $key);
            }
            foreach ($e->columns() as $c) {
                $this->assertContains($c->type, Column::TYPES);
            }
        }
    }

    public function test_the_catalogue_hides_what_a_role_has_no_permission_for(): void
    {
        $reg = $this->registry();
        $keys = array_column($reg->catalogue(fn ($p) => $p === 'bulkimport.menus'), 'key');
        $this->assertSame(['menus.ingredients', 'menus.recipes'], $keys);
        $this->assertSame([], $reg->catalogue(fn ($p) => false));
    }

    /** @dataProvider formats */
    public function test_each_template_can_be_read_back_in_its_own_format(string $format): void
    {
        $stored = [];
        $e = $this->entity($stored);
        $t = (new TemplateWriter())->make($e, $format);
        $path = $this->file($t['body'], ['markdown' => 'md'][$format] ?? $format);
        $r = (new ImportRunner($this->registry(), new Reader()))->run($e, $path, $format, true);
        $this->assertTrue($r['ok'], $format.': '.json_encode($r['errors']));
        $this->assertSame(['Flour:2'], $stored);
    }

    public static function formats(): array
    {
        return [['csv'], ['json'], ['xml'], ['xlsx'], ['markdown']];
    }

    public function test_unreadable_files_are_refused_with_a_reason(): void
    {
        $reader = new Reader();
        foreach ([['{not json', 'json', 'invalid_json'], ['<a><b>', 'xml', 'invalid_xml'], ['no table here', 'markdown', 'invalid_markdown'], ['not a zip', 'xlsx', 'invalid_xlsx'], ['{"a":1}', 'json', 'invalid_json']] as [$body, $fmt, $code]) {
            try {
                $reader->read($this->file($body), $fmt);
                $this->fail("$fmt should be refused");
            } catch (FileProblem $p) {
                $this->assertSame($code, $p->codeName, $fmt);
            }
        }
        $this->expectException(FileProblem::class);
        $reader->read($this->file("name\n"), 'csv');   // headings and no rows
    }

    public function test_a_semicolon_csv_with_a_byte_order_mark_and_blank_lines_keeps_the_row_numbers(): void
    {
        $r = (new Reader())->read($this->file("\xEF\xBB\xBFname;part\nFlour;p1\n\nSugar;p2\n"), 'csv');
        $this->assertSame(['name', 'part'], $r['headings']);
        $this->assertSame([2, 4], array_keys($r['rows']));
    }
}
