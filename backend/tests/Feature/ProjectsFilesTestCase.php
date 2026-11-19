<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/** A piece of work with the Core vault's tables, for the stage 9 tests (the vault's tables come from the live database, so the tests make them). */
abstract class ProjectsFilesTestCase extends TestCase
{
    use Concerns\CreatesProjectsWorld;

    protected User $kamau;
    protected User $njeri;
    protected int $project;

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('local');
        Schema::create('vault_folders', function ($t) { $t->id(); $t->unsignedBigInteger('parent_id')->nullable(); $t->string('name'); $t->string('slug'); $t->text('description')->nullable(); $t->string('folder_type')->default('manual');
            $t->string('sensitivity_level')->default('internal'); $t->string('password_hash')->nullable(); $t->boolean('is_locked')->default(false); $t->boolean('inherits_parent_policy')->default(true); $t->unsignedBigInteger('owner_user_id')->nullable(); $t->timestamps(); $t->softDeletes(); });
        Schema::create('vault_documents', function ($t) { $t->id(); $t->unsignedBigInteger('folder_id')->nullable(); $t->string('name'); $t->string('original_filename'); $t->string('mime_type')->nullable(); $t->string('extension')->nullable();
            $t->string('file_path'); $t->unsignedBigInteger('file_size')->default(0); $t->string('document_type')->default('other'); $t->string('sensitivity_level')->default('internal'); $t->json('tags')->nullable(); $t->json('metadata')->nullable();
            $t->string('password_hash')->nullable(); $t->boolean('is_locked')->default(false); $t->boolean('is_cold')->default(false); $t->integer('version_count')->default(1); $t->unsignedBigInteger('uploaded_by')->nullable(); $t->timestamps(); $t->softDeletes(); });
        Schema::create('vault_document_versions', function ($t) { $t->id(); $t->unsignedBigInteger('document_id'); $t->string('file_path'); $t->unsignedBigInteger('file_size')->default(0); $t->integer('version_number'); $t->string('change_note')->nullable(); $t->unsignedBigInteger('uploaded_by')->nullable(); $t->timestamp('created_at')->nullable(); });
        Schema::create('vault_access_logs', function ($t) { $t->id(); $t->unsignedBigInteger('user_id')->nullable(); $t->string('action'); $t->string('target_type'); $t->unsignedBigInteger('target_id')->nullable(); $t->string('ip_address')->nullable(); $t->string('user_agent')->nullable(); $t->json('context_snapshot')->nullable(); $t->timestamp('created_at')->nullable(); });
        $this->createProjectsWorld();
        \App\Services\Projects\ProjectsSetup::forget();
        $this->kamau = $this->staff('Kamau', ['projects.use', 'projects.create', 'projects.files.view', 'projects.files.manage', 'projects.files.share', 'projects.files.sign', 'projects.templates', 'projects.guests', 'projects.config.view', 'projects.config.manage']);
        $this->njeri = $this->staff('Njeri', ['projects.use', 'projects.files.view']);
        Sanctum::actingAs($this->kamau, ['*']);
        $this->project = (int) $this->postJson('/api/admin/projects', ['type_id' => DB::table('project_types')->where('industry_key', 'general')->value('id'), 'title' => 'Imara v Baraka', 'customer_id' => 1])->assertCreated()->json('project.id');
        DB::table('project_members')->insert(['project_id' => $this->project, 'user_id' => $this->njeri->id, 'project_role_id' => DB::table('project_roles')->where('key', 'member')->value('id'), 'status' => 'active', 'created_at' => now(), 'updated_at' => now()]);
    }

    protected function url(string $more = ''): string
    {
        return "/api/admin/projects/{$this->project}{$more}";
    }

    protected function upload(string $name = 'defence.pdf', string $content = '%PDF-1.4 the defence', ?int $folder = null): array
    {
        return $this->post($this->url('/files'), ['file' => \Illuminate\Http\UploadedFile::fake()->createWithContent($name, $content), 'folder_id' => $folder], ['Accept' => 'application/json'])->assertCreated()->json();
    }
}
