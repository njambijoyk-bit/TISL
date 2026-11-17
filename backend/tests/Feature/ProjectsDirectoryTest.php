<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/** Projects, build 3.6 (docs/PROJECTS_STAGE3_SPEC.md): yellow and white pages, masked details and logged reveals, trades, visibility and the export. */
class ProjectsDirectoryTest extends TestCase
{
    use Concerns\CreatesProjectsWorld;

    private const ALL = ['projects.use', 'projects.directory.yellow', 'projects.directory.white', 'projects.directory.contacts', 'projects.directory.staff', 'projects.directory.manage', 'projects.directory.visibility', 'projects.directory.publish', 'projects.directory.export', 'projects.config.view', 'projects.config.manage', 'projects.security.view'];

    private User $kamau;

    protected function setUp(): void
    {
        parent::setUp();
        $this->createProjectsWorld();
        Schema::create('vendors', function ($t) { $t->id(); $t->string('company_name'); $t->string('contact_name')->nullable(); $t->string('email')->nullable(); $t->string('phone')->nullable(); $t->softDeletes(); $t->timestamps(); });
        Schema::create('employees', function ($t) { $t->id(); $t->unsignedBigInteger('user_id')->nullable(); $t->string('job_title')->nullable(); $t->string('work_phone')->nullable(); $t->string('work_email')->nullable(); $t->softDeletes(); $t->timestamps(); });
        $this->kamau = $this->staff('Kamau', self::ALL);
        Sanctum::actingAs($this->kamau, ['*']);
        DB::table('customers')->where('id', 1)->update(['email' => 'office@imara.test', 'projects_client_since' => '2026-01-01']);
        DB::table('customers')->where('id', 2)->update(['projects_client_since' => '2026-01-01']);   // Brian Kariuki: a client who is a person
        DB::table('project_parties')->insert([['id' => 7, 'name' => 'Njoroge QS Partners', 'kind' => 'organisation', 'phone' => '0712345418', 'email' => 'qs@njoroge.test', 'created_at' => now()],
            ['id' => 8, 'name' => 'A. Wekesa', 'kind' => 'person', 'phone' => '0722000077', 'email' => null, 'created_at' => now()]]);
        DB::table('vendors')->insert(['id' => 3, 'company_name' => 'Costwise Consultants', 'email' => 'hello@costwise.test', 'phone' => '0733444902']);
        DB::table('project_contacts')->insert([['id' => 21, 'owner_type' => 'customer', 'owner_id' => 1, 'name' => 'A. Otieno', 'job_title' => 'CEO', 'phone' => '0700111222', 'email' => null, 'created_at' => now()],
            ['id' => 22, 'owner_type' => 'lead', 'owner_id' => 1, 'name' => 'Lead Person', 'job_title' => null, 'phone' => null, 'email' => null, 'created_at' => now()]]);
        DB::table('employees')->insert(['id' => 5, 'user_id' => $this->kamau->id, 'job_title' => 'Partner', 'work_phone' => '0711999888']);
    }

    private function as(User $u): static
    {
        Sanctum::actingAs($u, ['*']);

        return $this;
    }

    public function test_the_yellow_pages_list_organisations_with_masked_details_and_the_white_pages_list_people(): void
    {
        $y = $this->getJson('/api/admin/projects/directory?book=yellow')->assertOk()->json();
        $this->assertSame([['Costwise Consultants', 'Vendor'], ['Imara Sacco', 'Client'], ['Njoroge QS Partners', 'Party']], array_map(fn ($e) => [$e['name'], $e['is']], $y['entries']));
        $qs = collect($y['entries'])->firstWhere('name', 'Njoroge QS Partners');
        $this->assertSame(['•••••••418', 'q•••@njoroge.test', 'staff'], [$qs['phone'], $qs['email'], $qs['visibility']]);
        $this->assertStringNotContainsString('0712345418', json_encode($y), 'nothing is sent in full until it is revealed');
        $this->assertSame(3, $y['no_trade']);

        $w = $this->getJson('/api/admin/projects/directory?book=white')->assertOk()->json();
        $this->assertSame([['A. Otieno', 'Contact', 'Imara Sacco'], ['A. Wekesa', 'Party', null], ['Brian Kariuki', 'Client', null], ['Kamau', 'Staff', null]], array_map(fn ($e) => [$e['name'], $e['is'], $e['works_for']], $w['entries']));
        $this->assertNotContains('Lead Person', array_column($w['entries'], 'name'), 'a lead\'s people are not in the directory until it is won');
        $this->assertSame(['A. Otieno'], array_column($this->getJson('/api/admin/projects/directory?book=white&q=otieno')->json('entries'), 'name'));
    }

    public function test_staff_are_listed_only_for_those_who_may_see_staff_and_each_book_has_its_permission(): void
    {
        $this->as($this->staff('Reader', ['projects.use', 'projects.directory.white']));
        $w = $this->getJson('/api/admin/projects/directory?book=white')->assertOk()->json();
        $this->assertNotContains('Kamau', array_column($w['entries'], 'name'));
        $this->assertSame('white', $this->getJson('/api/admin/projects/directory?book=yellow')->json('book'), 'someone with only the white pages is shown those');
        $this->postJson('/api/admin/projects/directory/employee/5/reveal')->assertForbidden();
        $this->as($this->staff('Clerk', ['projects.use']))->getJson('/api/admin/projects/directory')->assertForbidden();
    }

    public function test_a_reveal_shows_the_details_in_full_and_is_logged_and_watched(): void
    {
        $r = $this->postJson('/api/admin/projects/directory/party/7/reveal')->assertOk()->json();
        $this->assertSame(['phone' => '0712345418', 'email' => 'qs@njoroge.test'], $r);
        $log = DB::table('project_log')->where('action', 'directory.revealed')->first();
        $this->assertSame(['party', 7, 'Njoroge QS Partners'], [$log->subject_type, (int) $log->subject_id, json_decode($log->new_values, true)['who']]);
        $this->postJson('/api/admin/projects/directory/party/999/reveal')->assertNotFound();
        $this->postJson('/api/admin/projects/directory/contact/22/reveal')->assertNotFound();   // the lead's person

        $peeker = $this->staff('Peeker', ['projects.use', 'projects.directory.yellow', 'projects.directory.contacts']);
        $settings = app(\App\Services\Projects\ProjectSettings::class)->get('security');
        app(\App\Services\Projects\ProjectSettings::class)->save('security', array_replace_recursive($settings, ['reveals' => ['count' => 3]]), $this->kamau);
        $this->as($peeker);
        foreach ([7, 1, 3] as $i => $id) {
            $this->postJson('/api/admin/projects/directory/' . ['party', 'customer', 'vendor'][$i] . "/{$id}/reveal")->assertOk();
        }
        $e = DB::table('project_security_events')->first();
        $this->assertSame(['reveals', $peeker->id, '3 reveals in 10 minutes'], [$e->signal, (int) $e->user_id, $e->detail]);

        $this->as($this->staff('NoDetails', ['projects.use', 'projects.directory.yellow']))->postJson('/api/admin/projects/directory/party/7/reveal')->assertForbidden();
    }

    public function test_trades_group_the_yellow_pages_and_are_set_with_their_permission(): void
    {
        $this->putJson('/api/admin/projects/directory/party/7', ['trades' => ['quantity_surveyor']])->assertOk();
        $this->putJson('/api/admin/projects/directory/vendor/3', ['trades' => ['quantity_surveyor', 'valuer']])->assertOk();
        $y = $this->getJson('/api/admin/projects/directory?book=yellow')->json();
        $qs = collect($y['trades'])->firstWhere('key', 'quantity_surveyor');
        $this->assertSame([2, 1], [$qs['count'], $y['no_trade']]);
        $this->assertSame(['Costwise Consultants', 'Njoroge QS Partners'], array_column($this->getJson('/api/admin/projects/directory?book=yellow&trade=quantity_surveyor')->json('entries'), 'name'));
        $this->assertSame(['Imara Sacco'], array_column($this->getJson('/api/admin/projects/directory?book=yellow&trade=none')->json('entries'), 'name'));
        $this->assertSame(['Quantity surveyors', 'Valuers'], array_column(collect($y['entries'])->firstWhere('name', 'Costwise Consultants')['trades'], 'name'));
        $this->putJson('/api/admin/projects/directory/party/7', ['trades' => ['astrologer']])->assertStatus(422);
        $this->assertSame('directory.changed', DB::table('project_log')->orderByDesc('id')->value('action'));

        $this->as($this->staff('Visibler', ['projects.use', 'projects.directory.yellow', 'projects.directory.visibility']))->putJson('/api/admin/projects/directory/party/7', ['trades' => []])->assertForbidden();
    }

    public function test_visibility_needs_its_permission_public_needs_another_and_configuration_can_switch_levels_off(): void
    {
        $this->putJson('/api/admin/projects/directory/party/7', ['visibility' => 'clients'])->assertOk();
        $this->assertSame('clients', collect($this->getJson('/api/admin/projects/directory?book=yellow')->json('entries'))->firstWhere('name', 'Njoroge QS Partners')['visibility']);

        $v = $this->staff('Visibler', ['projects.use', 'projects.directory.yellow', 'projects.directory.visibility']);
        $this->as($v)->putJson('/api/admin/projects/directory/party/7', ['visibility' => 'public'])->assertForbidden()->assertJson(['message' => 'Making an entry public needs its own permission.']);
        $this->putJson('/api/admin/projects/directory/party/7', ['visibility' => 'staff'])->assertOk();
        $this->putJson('/api/admin/projects/directory/party/7', ['visibility' => 'secret'])->assertStatus(422);

        $this->as($this->kamau)->putJson('/api/admin/projects/configuration/directory', ['levels' => ['clients']])->assertOk()->assertJsonPath('directory.levels', ['clients']);
        $this->assertSame(['staff', 'clients'], $this->getJson('/api/admin/projects/directory')->json('levels'));
        $this->putJson('/api/admin/projects/directory/party/7', ['visibility' => 'public'])->assertStatus(422)->assertJson(['message' => 'That level is switched off in Projects configuration.']);
        $this->as($v)->putJson('/api/admin/projects/configuration/directory', ['levels' => ['clients', 'public']])->assertForbidden();
    }

    public function test_the_export_masks_details_unless_the_person_may_reveal_them_and_is_logged(): void
    {
        $csv = $this->get('/api/admin/projects/directory/export?book=yellow')->assertOk()->streamedContent();
        $this->assertStringContainsString('0712345418', $csv);
        $this->assertStringContainsString('"Njoroge QS Partners",Party', str_replace('Njoroge QS Partners,', '"Njoroge QS Partners",', $csv));

        $this->as($this->staff('Exporter', ['projects.use', 'projects.directory.yellow', 'projects.directory.export']));
        $csv = $this->get('/api/admin/projects/directory/export?book=yellow')->assertOk()->streamedContent();
        $this->assertStringNotContainsString('0712345418', $csv);
        $this->assertStringContainsString('•••••••418', $csv);
        $this->assertSame(['in full', 'masked'], DB::table('project_log')->where('action', 'directory.exported')->orderBy('id')->get()->map(fn ($l) => json_decode($l->new_values, true)['details'])->all());
    }

    public function test_the_work_count_is_only_what_the_person_may_see(): void
    {
        $type = DB::table('project_types')->where('industry_key', 'general')->value('id');
        $this->grant($this->kamau, array_merge(['admin.access', 'projects.create', 'projects.confidential'], self::ALL));
        $mine = (int) $this->postJson('/api/admin/projects', ['type_id' => $type, 'title' => 'Mine', 'customer_id' => 1])->json('project.id');
        $njeri = $this->staff('Njeri', ['projects.use', 'projects.create', 'projects.confidential']);
        $theirs = (int) $this->as($njeri)->postJson('/api/admin/projects', ['type_id' => $type, 'title' => 'Hidden', 'customer_id' => 1, 'confidential' => true])->json('project.id');
        DB::table('project_party_links')->insert([['project_id' => $mine, 'party_id' => 7, 'role_id' => 1, 'created_at' => now()], ['project_id' => $theirs, 'party_id' => 7, 'role_id' => 1, 'created_at' => now()]]);
        $by = collect($this->as($this->kamau)->getJson('/api/admin/projects/directory?book=yellow')->json('entries'))->keyBy('name');
        $this->assertSame([1, 1], [$by['Imara Sacco']['work'], $by['Njoroge QS Partners']['work']]);
    }
}
