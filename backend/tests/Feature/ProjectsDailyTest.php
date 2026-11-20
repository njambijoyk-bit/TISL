<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Laravel\Sanctum\Sanctum;

/** Projects, build 10.5 (docs/PROJECTS_STAGE10_SPEC.md): the daily record, its lines and photos, signing that locks it, and the 18:00 reminder. */
class ProjectsDailyTest extends ProjectsFilesTestCase
{
    private User $achieng;
    private array $told = [];

    protected function setUp(): void
    {
        parent::setUp();
        $told = &$this->told;
        $this->app->instance(\App\Services\Notify\Notifier::class, new class($told) extends \App\Services\Notify\Notifier {
            public function __construct(private array &$told) {}

            public function send(\Illuminate\Database\Eloquent\Model $to, string $type, string $title, string $message, array $o = []): array
            {
                $this->told[] = [$to->name, $title];

                return ['notification' => null, 'channels' => [], 'skipped' => [], 'staff_list' => false];
            }
        });
        Schema::create('products', function ($t) { $t->id(); $t->string('name'); $t->softDeletes(); });
        Schema::create('product_variants', function ($t) { $t->id(); $t->unsignedBigInteger('product_id'); $t->string('sku')->nullable(); $t->string('barcode', 64)->nullable(); $t->string('name')->nullable(); $t->softDeletes(); });
        DB::table('products')->insert(['id' => 1, 'name' => 'Cement 50kg']);
        DB::table('product_variants')->insert(['id' => 11, 'product_id' => 1]);
        $this->achieng = $this->staff('Achieng', ['projects.use', 'projects.daily', 'projects.files.view']);
        DB::table('project_members')->insert(['project_id' => $this->project, 'user_id' => $this->achieng->id, 'project_role_id' => DB::table('project_roles')->where('key', 'member')->value('id'), 'status' => 'active', 'created_at' => now(), 'updated_at' => now()]);
        DB::table('project_plant_hires')->insert(['id' => 5, 'project_id' => $this->project, 'what' => 'Tower crane', 'starts_on' => now()->subDays(3)->toDateString(), 'state' => 'on_hire', 'created_at' => now()]);
        Sanctum::actingAs($this->achieng, ['*']);
    }

    private function day(string $more = ''): string
    {
        return "/api/admin/projects/{$this->project}/daily/" . now()->toDateString() . $more;
    }

    public function test_a_day_is_written_with_people_crews_plant_materials_and_photos_and_signing_locks_it(): void
    {
        $page = $this->getJson($this->day())->assertOk()->json();
        $this->assertSame([null, true], [$page['record'], $page['can']['write']]);
        $this->assertSame(['Tower crane (hired)'], array_column($page['plant'], 'name'), 'plant on the work that day is offered');
        $this->putJson($this->day(), ['weather' => 'Sunny', 'work_done' => 'Slab cast on level 2'])->assertOk()->assertJsonPath('record.weather', 'Sunny');
        $this->postJson($this->day('/lines'), ['kind' => 'person', 'user_id' => $this->njeri->id, 'hours' => 8])->assertCreated();
        $this->postJson($this->day('/lines'), ['kind' => 'crew', 'trade' => 'Masons', 'head_count' => 6])->assertCreated();
        $this->postJson($this->day('/lines'), ['kind' => 'plant', 'hire_id' => 5, 'hours' => 6.5])->assertCreated();
        $this->postJson($this->day('/lines'), ['kind' => 'material', 'variant_id' => 11, 'quantity' => 120])->assertCreated();
        $this->postJson($this->day('/lines'), ['kind' => 'person', 'user_id' => 999])->assertStatus(422);
        $page = $this->post($this->day('/photos'), ['photo' => UploadedFile::fake()->createWithContent('slab.jpg', 'jpeg bytes'), 'caption' => 'Level 2 slab'], ['Accept' => 'application/json'])->assertCreated()->json();
        $this->assertEquals([['person', 'Njeri', 8.0], ['crew', 'Masons', 6], ['plant', 'Tower crane (hired)', 6.5], ['material', 'Cement 50kg', 120.0], ['photo', 'slab.jpg', 'Level 2 slab']],
            array_map(fn ($l) => match ($l['kind']) { 'person' => ['person', $l['person'], $l['hours']], 'crew' => ['crew', $l['trade'], $l['head_count']], 'plant' => ['plant', $l['plant'], $l['hours']], 'material' => ['material', $l['material'], $l['quantity']], 'photo' => ['photo', $l['file']['name'], $l['text']] }, $page['lines']));
        $this->assertSame('Daily records', DB::table('project_folders')->where('id', DB::table('project_files')->value('folder_id'))->value('name'), 'photos are kept in the work\'s Files');

        $this->postJson($this->day('/sign'), ['name' => 'A'])->assertStatus(422);
        $this->postJson($this->day('/sign'), ['name' => 'Achieng Otieno'])->assertOk()->assertJsonPath('record.state', 'signed')->assertJsonPath('can.write', false);
        $this->putJson($this->day(), ['weather' => 'Rain'])->assertStatus(422);
        $this->postJson($this->day('/lines'), ['kind' => 'crew', 'trade' => 'Carpenters', 'head_count' => 2])->assertStatus(422);
        $line = DB::table('project_daily_lines')->value('id');
        $this->deleteJson($this->day("/lines/{$line}"))->assertStatus(422);
        $this->postJson($this->day('/lines'), ['kind' => 'note', 'text' => 'Concrete test cubes taken late'])->assertCreated()->assertJsonPath('lines.5.after_signing', true);
    }

    public function test_only_those_who_work_the_site_write_and_a_day_ahead_cannot_be_written(): void
    {
        Sanctum::actingAs($this->njeri, ['*']);
        $this->getJson($this->day())->assertOk()->assertJsonPath('can.write', false);
        $this->postJson($this->day('/lines'), ['kind' => 'event', 'text' => 'Rain stopped work'])->assertForbidden();
        Sanctum::actingAs($this->achieng, ['*']);
        $this->postJson("/api/admin/projects/{$this->project}/daily/" . now()->addDay()->toDateString() . '/lines', ['kind' => 'event', 'text' => 'x'])->assertStatus(422);
        $this->postJson($this->day('/sign'), ['name' => 'Achieng'])->assertStatus(422);   // nothing written yet
    }

    public function test_the_lead_is_told_at_six_on_a_weekday_when_a_work_that_keeps_a_record_has_none(): void
    {
        $this->putJson("/api/admin/projects/{$this->project}/daily-settings", ['keeps_daily' => true])->assertOk()->assertJsonPath('keeps_daily', true);
        $daily = app(\App\Services\Projects\ProjectDaily::class);
        $this->assertSame(0, $daily->remind(now()->next('Saturday')->setTime(18, 0)), 'not at the weekend');
        $weekday = now()->isWeekend() ? now()->next('Monday') : now();
        $this->assertSame(1, $daily->remind($weekday->copy()->setTime(18, 0)));
        $this->assertStringStartsWith('No daily record today', end($this->told)[1]);
        $this->assertSame('Kamau', end($this->told)[0], 'the lead');
        if ($weekday->isToday()) {
            $this->postJson($this->day('/lines'), ['kind' => 'event', 'text' => 'Site visit by the engineer'])->assertCreated();
            $this->assertSame(0, $daily->remind($weekday->copy()->setTime(18, 0)), 'written today: nobody told');
        }
    }
}
