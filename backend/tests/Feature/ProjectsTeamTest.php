<?php

namespace Tests\Feature;

use App\Models\User;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/** Projects, build 8.1 (docs/PROJECTS_STAGE8_SPEC.md): the team view, read from HR's manager line and from the work. */
abstract class ProjectsTeamTest extends TestCase
{
    use Concerns\CreatesProjectsWorld;

    protected User $wanjiru;
    protected User $kamau;
    protected User $njeri;
    protected User $otieno;
    protected int $project;

    protected function setUp(): void
    {
        parent::setUp();
        Carbon::setTestNow('2026-11-18 10:00:00');   // a Wednesday
        $this->createProjectsWorld();
        Schema::dropIfExists('employees');
        Schema::create('employees', function ($t) { $t->id(); $t->unsignedBigInteger('user_id')->nullable(); $t->unsignedBigInteger('manager_id')->nullable(); $t->string('job_title')->nullable(); $t->string('department')->nullable();
            $t->unsignedBigInteger('department_id')->nullable(); $t->json('skills')->nullable(); $t->json('certifications')->nullable(); $t->string('status')->default('active'); $t->softDeletes(); });
        if (! Schema::hasTable('attendance_days')) {
            Schema::create('attendance_days', function ($t) { $t->id(); $t->unsignedBigInteger('user_id'); $t->date('work_date'); $t->string('status', 20); $t->timestamps(); });
        }
        $this->wanjiru = $this->staff('Wanjiru', ['projects.use', 'projects.create', 'projects.tasks', 'projects.team.view', 'projects.team.manage']);
        $this->kamau = $this->staff('Kamau', ['projects.use', 'projects.tasks', 'projects.team.view']);
        $this->njeri = $this->staff('Njeri', ['projects.use', 'projects.tasks']);
        $this->otieno = $this->staff('Otieno', ['projects.use']);
        $w = DB::table('employees')->insertGetId(['user_id' => $this->wanjiru->id, 'job_title' => 'Partner', 'department' => 'Litigation']);
        $k = DB::table('employees')->insertGetId(['user_id' => $this->kamau->id, 'manager_id' => $w, 'job_title' => 'Associate', 'department' => 'Litigation', 'skills' => json_encode(['Drafting', 'Court work'])]);
        DB::table('employees')->insert(['user_id' => $this->njeri->id, 'manager_id' => $k, 'job_title' => 'Clerk', 'department' => 'Litigation', 'skills' => json_encode(['Filing']),
            'certifications' => json_encode([['name' => 'First aid', 'issuer' => 'Red Cross', 'date' => '2024-12-01', 'expires_on' => '2026-12-01']])]);
        DB::table('employees')->insert(['user_id' => $this->otieno->id, 'job_title' => 'Accountant', 'department' => 'Finance']);
        Sanctum::actingAs($this->wanjiru, ['*']);
        $this->project = (int) $this->postJson('/api/admin/projects', ['type_id' => DB::table('project_types')->where('industry_key', 'general')->value('id'), 'title' => 'Imara v Baraka'])->json('project.id');
        foreach ([$this->kamau, $this->njeri] as $u) {
            DB::table('project_members')->insert(['project_id' => $this->project, 'user_id' => $u->id, 'project_role_id' => DB::table('project_roles')->where('key', 'member')->value('id'), 'status' => 'active', 'created_at' => now(), 'updated_at' => now()]);
        }
    }

    protected function task(string $title, User $u, ?string $due = null): void
    {
        $this->postJson("/api/admin/projects/{$this->project}/tasks", ['title' => $title, 'people' => [$u->id], 'due_date' => $due])->assertCreated();
    }
}
