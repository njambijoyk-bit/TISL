<?php

namespace Tests\Feature;

use App\Models\User;
use App\Services\Books\BooksException;
use App\Services\Projects\VoucherProjects;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/** Projects, build 4.1 (docs/PROJECTS_STAGE4_SPEC.md): script 260, the money settings, and the project picker on Books vouchers. */
class ProjectsVoucherPickerTest extends TestCase
{
    use Concerns\CreatesProjectsWorld;

    private User $kamau;
    private int $project;
    private int $projectCc;

    protected function setUp(): void
    {
        parent::setUp();
        $this->createProjectsWorld();
        Schema::create('voucher_types', function ($t) { $t->id(); $t->string('name'); $t->string('base_type'); });
        DB::table('voucher_types')->insert([['id' => 1, 'name' => 'Payment', 'base_type' => 'payment'], ['id' => 2, 'name' => 'Journal', 'base_type' => 'journal'], ['id' => 3, 'name' => 'Contra', 'base_type' => 'contra']]);
        $this->kamau = $this->staff('Kamau', ['projects.use', 'projects.create', 'projects.phases', 'projects.confidential', 'books.post', 'projects.config.view', 'projects.config.manage']);
        Sanctum::actingAs($this->kamau, ['*']);
        $this->project = (int) $this->postJson('/api/admin/projects', ['type_id' => DB::table('project_types')->where('industry_key', 'general')->value('id'), 'title' => 'Stock system', 'customer_id' => 1])->json('project.id');
        $this->projectCc = (int) DB::table('projects')->where('id', $this->project)->value('cost_centre_id');
    }

    private function as(User $u): static
    {
        Sanctum::actingAs($u, ['*']);

        return $this;
    }

    private function rules(array $rules): void
    {
        $this->putJson('/api/admin/projects/configuration/money', ['voucher_project' => $rules])->assertOk();
    }

    public function test_the_script_only_adds_and_puts_its_one_books_column_in_without_touching_existing_lines(): void
    {
        $sql = preg_replace('/--[^\n]*/', '', file_get_contents(base_path('database/sql/260_projects_money.sql')));
        $this->assertSame(0, preg_match('/\b(DROP TABLE|DELETE FROM|TRUNCATE|UPDATE )\b/', $sql), 'the script only adds');
        $this->assertStringContainsString("ADD COLUMN `project_holding_id` BIGINT UNSIGNED NULL", $sql, 'nullable: every existing line stays as it is');
        $this->assertStringContainsString("column_name = 'project_holding_id') THEN", $sql, 'added only when it is not there, so the script can run twice');
        foreach (['project_client_accounts', 'project_client_holdings', 'project_client_holding_owners', 'project_billing_stages', 'project_money_terms', 'project_ledgers'] as $t) {
            $this->assertTrue(Schema::hasTable($t), $t);
        }
        $cols = implode(' ', array_merge(...array_map(fn ($t) => Schema::getColumnListing($t), ['project_client_accounts', 'project_client_holdings', 'project_billing_stages', 'project_money_terms', 'project_ledgers'])));
        $this->assertDoesNotMatchRegularExpression('/\b(amount|total|balance|price)\b/', $cols, 'no table holds an amount: shares and percentages only');
    }

    public function test_out_of_the_box_a_project_is_optional_on_every_kind_of_voucher_and_bills_are_drafts(): void
    {
        $page = $this->getJson('/api/admin/projects/configuration/money')->assertOk()->json();
        $this->assertSame(['draft', 'company'], [$page['money']['bill_mode'], $page['money']['retention_mode']]);
        $this->assertSame(['optional'], array_values(array_unique($page['money']['voucher_project'])));
        $this->assertSame('Sales invoice', collect($page['voucher_types'])->firstWhere('key', 'sales')['label']);

        $this->putJson('/api/admin/projects/configuration/money', ['bill_mode' => 'post', 'retention_mode' => 'client', 'voucher_project' => ['payment' => 'required', 'contra' => 'none']])->assertOk();
        $m = $this->getJson('/api/admin/projects/configuration/money')->json('money');
        $this->assertSame(['post', 'client', 'required', 'none', 'optional'], [$m['bill_mode'], $m['retention_mode'], $m['voucher_project']['payment'], $m['voucher_project']['contra'], $m['voucher_project']['journal']]);
        $this->putJson('/api/admin/projects/configuration/money', ['bill_mode' => 'maybe'])->assertStatus(422);
        $this->putJson('/api/admin/projects/configuration/money', ['voucher_project' => ['payment' => 'sometimes']])->assertStatus(422);
        $this->assertSame('settings.saved', DB::table('project_log')->orderByDesc('id')->value('action'));
        $this->as($this->staff('Viewer', ['projects.use', 'projects.config.view']))->putJson('/api/admin/projects/configuration/money', ['bill_mode' => 'draft'])->assertForbidden();
    }

    public function test_the_picker_offers_the_open_work_someone_may_see_with_the_phases_that_have_a_cost_centre(): void
    {
        $this->postJson("/api/admin/projects/{$this->project}/phases", ['name' => 'Design', 'own_cost_centre' => true])->assertCreated();
        $this->postJson("/api/admin/projects/{$this->project}/phases", ['name' => 'No cost centre'])->assertCreated();
        $njeri = $this->staff('Njeri', ['projects.use', 'projects.create', 'projects.confidential', 'books.post']);
        $this->as($njeri)->postJson('/api/admin/projects', ['type_id' => DB::table('project_types')->where('industry_key', 'general')->value('id'), 'title' => 'Hers, confidential', 'confidential' => true])->assertCreated();

        $r = $this->as($this->kamau)->getJson('/api/admin/projects/voucher-picker?voucher_type_id=1')->assertOk()->json();
        $this->assertSame(['optional', ['Stock system']], [$r['rule'], array_column($r['projects'], 'title')]);
        $this->assertSame($this->projectCc, $r['projects'][0]['cost_centre_id']);
        $phases = $r['projects'][0]['phases'];
        $this->assertSame(['Design'], array_column($phases, 'name'), 'a phase without its own cost centre is not offered: it would post to the project');

        $this->rules(['contra' => 'none']);
        $this->assertSame(['none', []], array_values(array_intersect_key($this->getJson('/api/admin/projects/voucher-picker?voucher_type_id=3')->json(), ['rule' => 1, 'projects' => 1])));

        // a closed project is still offered on a voucher that is already posted to it, and only then
        DB::table('projects')->where('id', $this->project)->update(['state' => 'closed']);
        $this->assertSame([], $this->getJson('/api/admin/projects/voucher-picker?voucher_type_id=1')->json('projects'));
        $r = $this->getJson("/api/admin/projects/voucher-picker?voucher_type_id=1&cost_centre_id={$this->projectCc}")->json();
        $this->assertSame(['Stock system', 'P-0001'], [$r['projects'][0]['title'], $r['current']['number']]);

        $this->as($this->staff('NoBooks', ['projects.use']))->getJson('/api/admin/projects/voucher-picker?voucher_type_id=1')->assertForbidden();
    }

    public function test_a_kind_of_voucher_that_requires_a_project_must_be_posted_to_one(): void
    {
        $vp = app(VoucherProjects::class);
        $vp->assertForForm(1, null);   // optional: nothing is asked
        $this->rules(['payment' => 'required']);
        $vp->assertForForm(1, $this->projectCc);   // the project's own cost centre
        $phaseCc = (int) DB::table('project_phases')->where('id', $this->postJson("/api/admin/projects/{$this->project}/phases", ['name' => 'Design', 'own_cost_centre' => true])->json('phases.0.id'))->value('cost_centre_id');
        if ($phaseCc) {
            $vp->assertForForm(1, $phaseCc);   // or one of its phases
        }
        $vp->assertForForm(2, null);   // a journal is still optional

        try {
            $vp->assertForForm(1, 1);   // a branch cost centre, not a project's
            $this->fail('a payment without a project went through');
        } catch (BooksException $e) {
            $this->assertSame('A payment must be posted to a piece of work. Choose one under Project.', $e->getMessage());
        }
        DB::table('projects')->where('id', $this->project)->update(['deleted_at' => now()]);
        $this->expectException(BooksException::class);   // a project in the trash is not a project to post to
        $vp->assertForForm(1, $this->projectCc);
    }

    public function test_the_rule_is_asked_only_on_the_books_form_and_only_while_projects_is_on(): void
    {
        $this->rules(['payment' => 'required']);
        $this->projectsLicensed = false;
        app(VoucherProjects::class)->assertForForm(1, null);   // Projects is not licensed: Books works as it always did
        $this->projectsLicensed = true;

        $books = file_get_contents(app_path('Http/Controllers/Api/BooksVoucherController.php'));
        $this->assertSame(2, substr_count($books, 'VoucherProjects::class)->assertForForm('), 'asked when a voucher is saved and when it is changed on the form');
        $this->assertStringNotContainsString('VoucherProjects', file_get_contents(app_path('Services/Books/VoucherService.php')), 'never in the shared save path the shop, the till and payment gateways use');
    }
}
