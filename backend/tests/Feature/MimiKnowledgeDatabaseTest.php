<?php

namespace Tests\Feature;

use App\Http\Controllers\Admin\MimiKnowledgeController;
use App\Models\MimiKbEntry;
use App\Models\User;
use App\Services\Chat\Local\CallerContext;
use App\Services\Chat\Local\Knowledge;
use App\Services\Chat\Local\KnowledgeImporter;
use App\Services\Chat\Local\KnowledgeStore;
use App\Services\Chat\Local\LocalLayer;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Symfony\Component\HttpKernel\Exception\HttpException;
use Tests\TestCase;

/**
 * Script 105 against a real (in-memory) database: the importer, the editor's rules (lint, review by someone else, live goes back to draft),
 * the database taking over from the file, the owner's switches, and the gaps list. The repo has no migrations, so the tables are made here.
 */
class MimiKnowledgeDatabaseTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        Schema::create('mimi_kb_entries', function ($t) {
            $t->id(); $t->string('entry_key')->unique(); $t->string('title'); $t->string('audience'); $t->string('requires')->nullable(); $t->string('sensitivity')->default('public');
            $t->string('resolver')->nullable(); $t->text('keywords')->nullable(); $t->string('follow')->nullable(); $t->text('answer_md'); $t->text('more_md')->nullable();
            $t->string('denied_text')->nullable(); $t->string('empty_text')->nullable(); $t->string('status')->default('draft'); $t->dateTime('reviewed_at')->nullable();
            $t->unsignedBigInteger('reviewed_by')->nullable(); $t->integer('version')->default(1); $t->unsignedBigInteger('updated_by')->nullable(); $t->timestamps();
        });
        Schema::create('mimi_kb_questions', function ($t) {
            $t->id(); $t->unsignedBigInteger('entry_id'); $t->string('lang')->default('en'); $t->string('question'); $t->integer('sort')->default(0);
        });
        Schema::create('mimi_routing', function ($t) {
            $t->string('audience')->primary(); $t->string('mode')->default('shadow'); $t->string('fallback')->default('local_only'); $t->unsignedBigInteger('updated_by')->nullable(); $t->dateTime('updated_at')->nullable();
        });
        Schema::create('mimi_query_logs', function ($t) {
            $t->id(); $t->text('query'); $t->boolean('is_harmful')->default(false); $t->dateTime('queried_at'); $t->string('answered_by')->nullable(); $t->string('local_outcome')->nullable();
            $t->string('kb_entry')->nullable(); $t->decimal('confidence', 4, 3)->nullable(); $t->string('resolver')->nullable();
        });
        config(['mimi.allow_drafts' => true, 'cache.default' => 'array']);
    }

    private function kb(): Knowledge
    {
        return Knowledge::fromFile(resource_path('mimi/knowledge.html'));
    }

    private function user(int $id, bool $owner = false): User
    {
        $u = new class extends User
        {
            public bool $owner = false;

            public function hasPermission(string $permission): bool
            {
                return $permission === 'mimi.routing' ? $this->owner : true;
            }
        };
        $u->forceFill(['id' => $id]);
        $u->owner = $owner;

        return $u;
    }

    private function invoke(string $method, array $data, User $u, ...$args)
    {
        $r = Request::create('/x', 'POST', $data);
        $r->setUserResolver(fn () => $u);

        return app(MimiKnowledgeController::class)->$method($r, ...$args);
    }

    private function payload(array $over = []): array
    {
        return $over + ['entry_key' => 'store.hours', 'title' => 'Opening hours', 'audience' => ['any'], 'requires' => [], 'sensitivity' => 'public', 'keywords' => 'open close hours time',
            'answer_md' => 'We are open every day.', 'questions' => [['question' => 'When are you open?'], ['question' => 'What are your opening hours?'], ['question' => 'Are you open on Sunday?']]];
    }

    public function test_the_importer_loads_the_file_and_leaves_edits_alone(): void
    {
        $imp = app(KnowledgeImporter::class);
        $a = $imp->import($this->kb());
        $this->assertSame([], $a['problems']);
        $this->assertSame(count($this->kb()->all()), $a['created']);
        $this->assertSame('draft', MimiKbEntry::where('entry_key', 'store.pay')->value('status'));
        $this->assertGreaterThanOrEqual(3, MimiKbEntry::where('entry_key', 'store.pay')->first()->questions()->count());

        MimiKbEntry::where('entry_key', 'store.pay')->update(['title' => 'Edited by a person']);
        $b = $imp->import($this->kb());
        $this->assertSame(0, $b['created'] + $b['updated']);
        $this->assertSame('Edited by a person', MimiKbEntry::where('entry_key', 'store.pay')->value('title'));
        $imp->import($this->kb(), true);
        $this->assertNotSame('Edited by a person', MimiKbEntry::where('entry_key', 'store.pay')->value('title'));
    }

    public function test_the_database_takes_over_and_only_live_entries_are_trusted_once_drafts_are_off(): void
    {
        app(KnowledgeImporter::class)->import($this->kb());
        MimiKbEntry::where('entry_key', 'store.pay')->update(['status' => 'live', 'reviewed_at' => now()]);
        config(['mimi.allow_drafts' => false]);
        KnowledgeStore::touch();

        $layer = app(LocalLayer::class);
        $this->assertSame('answer', $layer->answer(CallerContext::guest(), 'how can I pay?')->outcome);            // live: served
        $this->assertSame('none', $layer->answer(CallerContext::guest(), 'what is your return policy')->outcome);    // still a draft: not served
        MimiKbEntry::where('entry_key', 'store.pay')->update(['status' => 'retired']);
        KnowledgeStore::touch();
        $this->assertNotSame('answer', app(LocalLayer::class)->answer(CallerContext::guest(), 'how can I pay?')->outcome);   // retired: never
    }

    public function test_saving_runs_the_rules_and_review_needs_someone_else(): void
    {
        $alice = $this->user(1);
        $bob = $this->user(2);

        $bad = $this->payload(['requires' => ['not.a.permission'], 'questions' => [['question' => 'only one']]]);
        try {
            $this->invoke('store', $bad, $alice);
            $this->fail('A broken entry was saved.');
        } catch (\Illuminate\Http\Exceptions\HttpResponseException $e) {
            $this->assertSame(422, $e->getResponse()->getStatusCode());
            $this->assertStringContainsString('not.a.permission', json_encode($e->getResponse()->getData(true)));
        }

        $saved = $this->invoke('store', $this->payload(), $alice)->getData(true);
        $this->assertSame('draft', $saved['status']);

        try {
            $this->invoke('review', [], $alice, $saved['id']);
            $this->fail('Reviewed their own change.');
        } catch (HttpException $e) {
            $this->assertSame(403, $e->getStatusCode());
        }
        $this->assertSame('live', $this->invoke('review', [], $bob, $saved['id'])->getData(true)['status']);

        $edited = $this->invoke('update', $this->payload(['answer_md' => 'We open at eight.']), $bob, $saved['id'])->getData(true);
        $this->assertSame('draft', $edited['status']);                 // an edit sends a live entry back for review
        $this->assertSame(2, $edited['version']);
        $this->assertSame('live', $this->invoke('review', [], $this->user(3), $saved['id'])->getData(true)['status']);
        $this->assertSame('live', $this->invoke('review', [], $this->user(2, true), $saved['id'])->getData(true)['status']);   // the owner may sign off their own
    }

    public function test_a_key_is_never_reused(): void
    {
        $this->invoke('store', $this->payload(), $this->user(1));
        $this->expectException(HttpException::class);
        $this->invoke('store', $this->payload(), $this->user(1));
    }

    public function test_the_owners_switches_override_the_server_setting_and_staff_cannot_use_the_full_prompt(): void
    {
        config(['mimi.mode' => 'shadow']);
        DB::table('mimi_routing')->insert(['audience' => 'guest', 'mode' => 'on', 'fallback' => 'local_only']);
        $layer = app(LocalLayer::class);
        $this->assertSame('on', $layer->modeFor(CallerContext::guest()));
        $this->assertSame('shadow', $layer->modeFor(CallerContext::fake('customer')));
        $this->assertSame('local_only', $layer->fallbackFor(CallerContext::guest()));

        $this->expectException(HttpException::class);
        $this->invoke('updateRouting', ['rows' => [['audience' => 'staff', 'mode' => 'on', 'fallback' => 'ai_scoped']]], $this->user(1, true));
    }

    public function test_gaps_hide_personal_values_and_group_repeats(): void
    {
        foreach ([['when do you open wanjiru@example.com', 'none'], ['when do you open wanjiru@example.com', 'none'], ['how can I pay', 'answer'], ['call me on 0712 345 678 about a refund', 'suggest']] as [$q, $o]) {
            DB::table('mimi_query_logs')->insert(['query' => $q, 'queried_at' => now(), 'local_outcome' => $o, 'answered_by' => 'ai']);
        }
        $out = $this->invoke('gaps', [], $this->user(1))->getData(true);
        $this->assertTrue($out['ready']);
        $this->assertSame(4, $out['summary']['total']);
        $this->assertSame(2, $out['data'][0]['asked']);
        $this->assertStringNotContainsString('wanjiru', json_encode($out['data']));
        $this->assertStringNotContainsString('345', json_encode($out['data']));
    }
}
