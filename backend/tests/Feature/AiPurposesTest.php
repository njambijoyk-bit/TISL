<?php

namespace Tests\Feature;

use App\Models\AiProviderKey;
use App\Services\Ai\AiGateway;
use App\Services\Ai\AiGatewayException;
use App\Services\Licensing\LicenseManager;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

/** AI purposes, build A.1 (docs/AI_PURPOSES_SPEC.md): purposes linked to modules, keys open or kept, a line per purpose with models, resting keys, the call log. */
class AiPurposesTest extends TestCase
{
    use Concerns\RunsSqlScripts;
    use Concerns\StandsInForAccess;

    private array $licensed = ['careers' => false, 'projects' => true, 'extras' => true];

    protected function setUp(): void
    {
        parent::setUp();
        config(['app.key' => 'base64:' . base64_encode(str_repeat('k', 32))]);   // keys are stored encrypted
        Carbon::setTestNow('2026-11-20 10:00:00');
        Schema::dropIfExists('ai_provider_keys');
        Schema::create('ai_provider_keys', function ($t) {
            $t->id(); $t->string('provider'); $t->string('label'); $t->text('api_key'); $t->boolean('is_active')->default(true); $t->unsignedBigInteger('created_by')->nullable(); $t->timestamp('last_used_at')->nullable();
            $t->string('model')->nullable(); $t->string('base_url')->nullable(); $t->string('used_for', 10)->default('all'); $t->integer('priority')->default(100); $t->string('last_error')->nullable(); $t->dateTime('last_error_at')->nullable(); $t->timestamps();
        });
        if (! Schema::hasTable('users')) {
            Schema::create('users', function ($t) { $t->id(); $t->string('name')->nullable(); $t->softDeletes(); });   // a key says who added it
        }
        $licensed = &$this->licensed;
        $this->app->instance(LicenseManager::class, new class($licensed) extends LicenseManager {
            public function __construct(private array &$licensed) {}

            public function isLicensed(string $moduleKey): bool
            {
                return $this->licensed[$moduleKey] ?? false;
            }

            public function isActive(string $moduleKey): bool
            {
                return $moduleKey === 'core' || ($this->licensed[$moduleKey] ?? false);
            }
        });
        AiGateway::forget();
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        AiGateway::forget();
        parent::tearDown();
    }

    /** Script 270's tables, and its three key columns (added by a guarded procedure on MySQL). */
    private function script270(): void
    {
        $this->runSqlScripts('270_ai_purposes.sql');
        Schema::table('ai_provider_keys', function ($t) { $t->boolean('open_to_all')->default(true); $t->dateTime('resting_until')->nullable(); $t->string('rest_reason')->nullable(); });
        DB::table('ai_gateway_settings')->insert(['id' => 1, 'rest_minutes' => 10]);
        AiGateway::forget();
    }

    private function key(string $label, string $provider, int $priority, array $extra = []): AiProviderKey
    {
        return AiProviderKey::create(['provider' => $provider, 'label' => $label, 'api_key' => "sk-{$label}", 'is_active' => true, 'priority' => $priority] + $extra);
    }

    private function line(string $purpose, array $keys): void
    {
        foreach ($keys as $i => [$key, $model]) {
            DB::table('ai_purpose_lines')->insert(['purpose' => $purpose, 'key_id' => $key->id, 'position' => $i + 1, 'model' => $model]);
        }
    }

    private function gw(): AiGateway
    {
        return app(AiGateway::class);
    }

    /** Anthropic answers with the model it was asked for; OpenAI and Gemini answer as told. */
    private function fake(array $openai = [], array $gemini = []): void
    {
        Http::swap(new \Illuminate\Http\Client\Factory);   // a second fake would otherwise keep the first one's answers
        Http::fake([
            'api.anthropic.com/*' => fn ($r) => Http::response(['content' => [['type' => 'text', 'text' => 'from claude']], 'usage' => ['input_tokens' => 100, 'output_tokens' => 20], 'model' => $r->data()['model'], 'stop_reason' => 'end_turn']),
            'api.openai.com/*' => Http::response(...($openai ?: [['choices' => [['message' => ['content' => 'from gpt'], 'finish_reason' => 'stop']], 'usage' => ['prompt_tokens' => 50, 'completion_tokens' => 10], 'model' => 'gpt-4o-mini']])),
            'generativelanguage.googleapis.com/*' => Http::response(...($gemini ?: [['candidates' => [['content' => ['parts' => [['text' => 'from gemini']]], 'finishReason' => 'STOP']], 'usageMetadata' => ['promptTokenCount' => 10, 'candidatesTokenCount' => 5]]])),
        ]);
    }

    private function ask(string $purpose, string $feature): array
    {
        return $this->gw()->run($purpose, null, [['role' => 'user', 'content' => 'Hello']], ['feature' => $feature]);
    }

    public function test_a_purpose_shows_when_any_module_using_it_is_licensed_and_a_call_from_an_unlicensed_module_is_refused(): void
    {
        $this->script270();
        $this->key('main', 'anthropic', 10);
        $this->fake();
        $this->assertSame(['mimi', 'analytics', 'explain', 'drafts'], array_keys($this->gw()->purposes()), 'careers is not licensed, so screening is hidden');
        $this->assertSame(['Projects weekly updates'], $this->gw()->purposes()['drafts']['used_by']);

        $this->assertSame('from claude', $this->ask('drafts', 'projects_updates')['text'], 'licensed: switched on or off does not matter');
        try {
            $this->ask('screening', 'careers');
            $this->fail('screening ran without Careers licensed');
        } catch (AiGatewayException $e) {
            $this->assertSame('licence', $e->kind);
        }
        $this->assertSame(['drafts' => 'ok', 'screening' => 'refused'], DB::table('ai_calls')->pluck('outcome', 'purpose')->all());
        Http::assertSentCount(1);

        $this->licensed['careers'] = true;
        $this->assertArrayHasKey('screening', $this->gw()->purposes());
        $this->licensed['projects'] = false;
        $this->assertArrayNotHasKey('drafts', $this->gw()->purposes());
        $this->expectExceptionMessage('Drafts is not available: the module it is for is not licensed.');
        $this->ask('drafts', 'projects_updates');
    }

    public function test_a_call_goes_down_its_own_line_with_each_places_model_then_the_other_keys_allowed_for_it(): void
    {
        $this->script270();
        $main = $this->key('main', 'anthropic', 10, ['model' => 'claude-sonnet-4-5']);
        $hr = $this->key('hr', 'openai', 5, ['open_to_all' => false]);
        DB::table('ai_key_purposes')->insert(['key_id' => $hr->id, 'purpose' => 'screening']);
        $gem = $this->key('gem', 'gemini', 20, ['open_to_all' => false]);
        DB::table('ai_key_purposes')->insert([['key_id' => $gem->id, 'purpose' => 'drafts'], ['key_id' => $gem->id, 'purpose' => 'explain']]);
        $this->line('drafts', [[$main, 'claude-haiku-4-5'], [$gem, null]]);

        $line = fn ($p) => array_map(fn ($x) => [$x['key']->label, $x['model'], $x['position'], $x['own']], $this->gw()->lineFor($p));
        $this->assertSame([['main', 'claude-haiku-4-5', 1, true], ['gem', 'gemini-2.5-flash', 2, true]], $line('drafts'));
        $this->assertSame([['main', 'claude-sonnet-4-5', 1, false], ['gem', 'gemini-2.5-flash', 2, false]], $line('explain'), 'no line of its own: the keys allowed for it, in the general order');
        $this->assertSame([['main', 'claude-sonnet-4-5', 1, false]], $line('mimi'), 'kept keys never serve another purpose');
        $this->assertSame([['hr', 'gpt-4o-mini', 1, false], ['main', 'claude-sonnet-4-5', 2, false]], $line('screening'));

        $this->fake();
        $r = $this->ask('drafts', 'projects_updates');
        $this->assertSame(['claude-haiku-4-5', 1], [$r['model'], $r['position']], 'the model chosen for this place, not the key\'s own');
        Http::assertSent(fn ($req) => ($req->data()['model'] ?? null) === 'claude-haiku-4-5');
        $call = DB::table('ai_calls')->first();
        $this->assertSame(['drafts', $main->id, 'anthropic', 100, 20, 'ok', 1], [$call->purpose, (int) $call->key_id, $call->provider, (int) $call->prompt_tokens, (int) $call->completion_tokens, $call->outcome, (int) $call->position]);
        $this->assertEqualsWithDelta(0.0006, (float) $call->cost_estimate, 0.000001);
    }

    public function test_a_key_over_quota_rests_and_the_next_key_answers_while_a_busy_key_does_not_rest(): void
    {
        $this->script270();
        $gpt = $this->key('gpt', 'openai', 10);
        $this->key('main', 'anthropic', 20);
        $this->fake([['error' => ['message' => 'You exceeded your current quota, please check your plan and billing details.']], 429]);

        $r = $this->ask('mimi', 'chat');
        $this->assertSame(['from claude', 2], [$r['text'], $r['position']]);
        $gpt->refresh();
        $this->assertSame('2026-11-20 10:10:00', $gpt->resting_until->format('Y-m-d H:i:s'));
        $this->assertStringContainsString('exceeded your current quota', $gpt->rest_reason);
        $this->assertSame([['failed', 1], ['ok', 2]], DB::table('ai_calls')->orderBy('id')->get()->map(fn ($c) => [$c->outcome, (int) $c->position])->all());

        $this->ask('mimi', 'chat');
        Http::assertSentCount(3);   // the resting key was skipped the second time
        $this->assertSame(['main'], array_map(fn ($x) => $x['key']->label, $this->gw()->lineFor('mimi')));

        Carbon::setTestNow('2026-11-20 10:11:00');
        $this->assertSame(['gpt', 'main'], array_map(fn ($x) => $x['key']->label, $this->gw()->lineFor('mimi')), 'the rest is over');

        // busy (a rate limit, not the quota) moves on but does not rest
        $this->fake([['error' => ['message' => 'Rate limit reached for requests per minute.']], 429]);
        $this->ask('mimi', 'chat');
        $this->assertSame('2026-11-20 10:10:00', $gpt->refresh()->resting_until->format('Y-m-d H:i:s'), 'not rested again');

        // a bad request would fail on every key: it stops at once
        $this->fake([['error' => ['message' => 'messages: field required']], 400]);
        DB::table('ai_calls')->delete();
        try {
            $this->ask('mimi', 'chat');
            $this->fail('a bad request went on to the next key');
        } catch (AiGatewayException $e) {
            $this->assertSame(1, DB::table('ai_calls')->count());
        }
    }

    public function test_when_every_key_rests_the_message_says_so(): void
    {
        $this->script270();
        $this->key('gpt', 'openai', 10, ['resting_until' => '2026-11-20 10:05:00', 'rest_reason' => 'over quota']);
        $this->expectExceptionMessage('Every AI key for Mimi chat is resting after being refused.');
        $this->ask('mimi', 'chat');
    }

    public function test_a_refused_key_does_not_rest_when_resting_is_switched_off(): void
    {
        $this->script270();
        DB::table('ai_gateway_settings')->update(['rest_minutes' => 0]);
        $gpt = $this->key('gpt', 'openai', 10);
        $this->key('main', 'anthropic', 20);
        $this->fake([['error' => ['message' => 'Incorrect API key provided.']], 401]);
        $this->assertSame('from claude', $this->ask('mimi', 'chat')['text']);
        $this->assertNull($gpt->refresh()->resting_until);
    }

    public function test_before_script_270_each_keys_single_used_for_is_read_as_it_always_was(): void
    {
        $this->key('analytics key', 'openai', 10, ['used_for' => 'analytics']);
        $this->key('mimi key', 'anthropic', 20, ['used_for' => 'mimi']);
        $this->assertFalse(AiGateway::ready());
        $labels = fn ($p) => $this->gw()->keysFor($p)->pluck('label')->all();
        $this->assertSame(['analytics key'], $labels('explain'), 'explain and drafts used the analytics key before, so they still do');
        $this->assertSame(['analytics key'], $labels('drafts'));
        $this->assertSame(['mimi key'], $labels('mimi'));
        $this->assertSame([], $labels('screening'));
        $this->fake();
        $this->assertSame('from gpt', $this->ask('drafts', 'projects_updates')['text'], 'and nothing is logged, there being no log yet');
    }

    public function test_script_270_moves_the_keys_as_the_gateway_reads_them(): void
    {
        $sql = file_get_contents(base_path('database/sql/270_ai_purposes.sql'));
        foreach (AiGateway::LEGACY as $from => $to) {
            foreach ($to as $purpose) {
                $this->assertMatchesRegularExpression($from === $purpose && $from !== 'analytics' ? "/SELECT id, used_for, NOW\\(\\) FROM ai_provider_keys WHERE used_for IN \\([^)]*'{$from}'/" : "/SELECT id, '{$purpose}', NOW\\(\\) FROM ai_provider_keys WHERE used_for = '{$from}'/", $sql, "{$from} → {$purpose}");
            }
        }
        foreach (AiGateway::PURPOSES as $purpose => $p) {
            $this->assertLessThanOrEqual(20, strlen($purpose));
            foreach ($p[3] as [$feature, $module]) {
                $this->assertTrue($module === 'core' || in_array($module, \App\Services\Licensing\LicenseFormat::MODULES, true), "{$purpose}: {$module} is not a module");
            }
        }
    }

    private function admin(array $perms = ['admin.access', 'ai.keys']): void
    {
        $u = new \App\Models\User();
        $u->id = 9;
        $u->name = 'Owner';
        $this->grant($u, $perms);
        \Laravel\Sanctum\Sanctum::actingAs($u, ['*']);
    }

    public function test_the_screen_keeps_a_key_to_some_purposes_and_lines_up_a_purpose_with_a_model_per_place(): void
    {
        $this->script270();
        $this->admin();
        $main = $this->key('main', 'anthropic', 10);
        $page = $this->getJson('/api/admin/ai-analytics/keys')->assertOk()->json();
        $this->assertTrue($page['ready']);
        $this->assertSame(['mimi', 'analytics', 'explain', 'drafts'], array_column($page['purposes'], 'key'), 'screening is hidden while Careers is not licensed');
        $this->assertSame(10, $page['rest_minutes']);
        $this->assertTrue($page['keys'][0]['open_to_all']);

        // a new key kept to drafts and explain
        $id = $this->postJson('/api/admin/ai-analytics/keys', ['provider' => 'gemini', 'label' => 'gem', 'api_key' => 'g-1', 'open_to_all' => false, 'kept_to' => ['drafts', 'explain', 'screening']])->assertCreated()->json('id');
        $gem = AiProviderKey::find($id);
        $this->assertFalse($gem->open_to_all);
        $this->assertSame(['drafts', 'explain'], DB::table('ai_key_purposes')->where('key_id', $id)->orderBy('purpose')->pluck('purpose')->all(), 'a hidden purpose cannot be ticked');
        $this->postJson('/api/admin/ai-analytics/keys', ['provider' => 'gemini', 'label' => 'none', 'api_key' => 'g-2', 'open_to_all' => false, 'kept_to' => []])->assertStatus(422)->assertJsonPath('errors.kept_to.0', 'Tick at least one purpose, or make the key open to all.');
        $this->assertSame(0, AiProviderKey::where('label', 'none')->count());

        // the drafts line: gem first with its own model, then main with a small model
        $this->putJson('/api/admin/ai-analytics/purposes/drafts/line', ['line' => [['key_id' => $id, 'model' => ''], ['key_id' => $main->id, 'model' => 'claude-haiku-4-5']]])->assertOk();
        $res = $this->getJson('/api/admin/ai-analytics/keys'); $res->assertOk(); $line = collect($res->json('purposes'))->firstWhere('key', 'drafts')['line'];
        $this->assertSame([['gem', 'gemini-2.5-flash', 1, true], ['main', 'claude-haiku-4-5', 2, true]], array_map(fn ($l) => [$l['label'], $l['model'], $l['position'], $l['own']], $line));
        $this->putJson('/api/admin/ai-analytics/purposes/mimi/line', ['line' => [['key_id' => $id]]])->assertStatus(422)->assertJsonPath('errors.line.0', '"gem" is kept to other purposes. Tick this purpose on the key first.');
        $this->putJson('/api/admin/ai-analytics/purposes/screening/line', ['line' => [['key_id' => $main->id]]])->assertStatus(422)->assertJsonPath('errors.purpose.0', 'That purpose is not available.');

        // a hidden purpose keeps what it had when the key is changed
        DB::table('ai_key_purposes')->insert(['key_id' => $id, 'purpose' => 'screening']);
        $this->putJson("/api/admin/ai-analytics/keys/{$id}", ['open_to_all' => false, 'kept_to' => ['drafts']])->assertOk();
        $this->assertSame(['drafts', 'screening'], DB::table('ai_key_purposes')->where('key_id', $id)->orderBy('purpose')->pluck('purpose')->all());
        $this->assertSame(0, DB::table('ai_purpose_lines')->where('key_id', $id)->where('purpose', 'explain')->count());

        // the rest length, and testing a purpose down its line
        $this->putJson('/api/admin/ai-analytics/purposes-rest', ['rest_minutes' => 30])->assertOk()->assertJsonPath('rest_minutes', 30);
        $this->putJson('/api/admin/ai-analytics/purposes-rest', ['rest_minutes' => 5000])->assertStatus(422);
        $this->fake([], [['error' => ['message' => 'API key not valid.']], 403]);
        $t = $this->postJson('/api/admin/ai-analytics/purposes/drafts/test')->assertOk()->json();
        $this->assertSame([true, 'main', 'claude-haiku-4-5', 2], [$t['ok'], $t['key'], $t['model'], $t['position']]);
        $this->assertSame([['key' => 'gem', 'error' => 'Google Gemini said: API key not valid.']], $t['failed']);
        $this->assertNotNull($gem->refresh()->resting_until, 'the refused key rests');
        $this->assertSame('2026-11-20 10:30:00', $gem->resting_until->format('Y-m-d H:i:s'));

        // testing the key itself ends its rest when it works
        $this->fake();
        $this->postJson("/api/admin/ai-analytics/keys/{$id}/test")->assertOk()->assertJsonPath('ok', true);
        $this->assertNull($gem->refresh()->resting_until);

        // deleting a key removes its places and ticks
        $this->postJson("/api/admin/ai-analytics/keys/{$id}/activate")->assertOk();
        $this->deleteJson("/api/admin/ai-analytics/keys/{$id}")->assertOk();
        $this->assertSame(0, DB::table('ai_key_purposes')->where('key_id', $id)->count() + DB::table('ai_purpose_lines')->where('key_id', $id)->count());

        $this->admin(['admin.access']);
        $this->putJson('/api/admin/ai-analytics/purposes/drafts/line', ['line' => []])->assertForbidden();
    }

    public function test_a_purpose_tells_the_ai_admins_at_80_percent_of_its_limit_and_stops_at_100(): void
    {
        $this->script270();
        $this->admin();
        $told = [];
        $this->app->instance(\App\Services\Notify\Staff::class, new class extends \App\Services\Notify\Staff {
            public function holding(string $permission): \Illuminate\Support\Collection
            {
                return collect([tap(new \App\Models\User(), fn ($u) => [$u->id = 9, $u->name = 'Owner'])]);
            }
        });
        $this->app->instance(\App\Services\Notify\Notifier::class, new class($told) extends \App\Services\Notify\Notifier {
            public function __construct(private array &$told) {}

            public function send(\Illuminate\Database\Eloquent\Model $to, string $type, string $title, string $message, array $o = []): array
            {
                $this->told[] = [$to->name, $type, $title];

                return ['notification' => null, 'channels' => [], 'skipped' => [], 'staff_list' => false];
            }
        });
        $main = $this->key('main', 'anthropic', 10);
        $this->fake();   // each Claude answer is 120 tokens

        $this->putJson('/api/admin/ai-analytics/purposes/drafts/limit', ['monthly_limit' => 0, 'limit_unit' => 'tokens'])->assertStatus(422)->assertJsonPath('errors.monthly_limit.0', 'A limit is more than 0. Leave it empty for no limit.');
        $this->putJson('/api/admin/ai-analytics/purposes/drafts/limit', ['monthly_limit' => 10, 'limit_unit' => 'kes'])->assertStatus(422);
        $this->putJson('/api/admin/ai-analytics/purposes/drafts/limit', ['monthly_limit' => 300, 'limit_unit' => 'tokens'])->assertOk();

        // last month does not count
        DB::table('ai_calls')->insert(['purpose' => 'drafts', 'key_id' => $main->id, 'prompt_tokens' => 5000, 'completion_tokens' => 0, 'outcome' => 'ok', 'position' => 1, 'created_at' => '2026-10-31 23:00:00']);
        $this->ask('drafts', 'projects_updates');   // 120 of 300: 40%
        $this->assertSame([], $told);
        $this->ask('drafts', 'projects_updates');   // 240 of 300: 80%
        $this->assertSame([['Owner', 'ai_limit', 'Drafts has used 80% of its AI limit']], $told);
        $this->ask('drafts', 'projects_updates');   // 360: past the limit; told only once a month
        $this->assertCount(1, $told);
        try {
            $this->ask('drafts', 'projects_updates');
            $this->fail('a purpose past its limit used the AI');
        } catch (AiGatewayException $e) {
            $this->assertSame('limit', $e->kind);
            $this->assertSame('Drafts has used its monthly AI limit of 300 tokens. It starts again on 1 Dec, or the limit can be raised on AI → Keys.', $e->getMessage());
        }
        Http::assertSentCount(3);
        $this->assertSame('refused', DB::table('ai_calls')->orderByDesc('id')->value('outcome'));
        $this->assertSame('from claude', $this->ask('mimi', 'chat')['text'], 'other purposes are not stopped');

        // the usage screen
        $u = $this->getJson('/api/admin/ai-analytics/usage')->assertOk()->json();
        $d = collect($u['purposes'])->firstWhere('key', 'drafts');
        $this->assertEquals([3, 0, 1, 360, 300, 120, true], [$d['calls'], $d['failed'], $d['refused'], $d['tokens'], $d['limit'], $d['used_pct'], $d['stopped']]);
        $this->assertSame(['main', 4, 480, ['drafts', 'mimi']], [$u['keys'][0]['label'], $u['keys'][0]['calls'], $u['keys'][0]['tokens'], $u['keys'][0]['purposes']]);
        $this->assertSame(['2026-06', '2026-11'], [$u['months'][0]['month'], $u['months'][5]['month']]);
        $this->assertSame(5000, $u['months'][4]['by_purpose']['drafts']['tokens']);
        $this->assertEquals(120, collect($this->getJson('/api/admin/ai-analytics/keys')->json('purposes'))->firstWhere('key', 'drafts')['usage']['used_pct']);

        // raising the limit starts it again, and may warn again; a limit in estimated cost; no limit
        $this->putJson('/api/admin/ai-analytics/purposes/drafts/limit', ['monthly_limit' => 1000, 'limit_unit' => 'tokens'])->assertOk();
        $this->ask('drafts', 'projects_updates');
        $this->assertNull(DB::table('ai_purpose_settings')->where('purpose', 'drafts')->value('warned_month'));
        $this->putJson('/api/admin/ai-analytics/purposes/drafts/limit', ['monthly_limit' => 0.001, 'limit_unit' => 'cost'])->assertOk();   // 4 × $0.0006 used
        $this->expectExceptionMessage('Drafts has used its monthly AI limit of $0.0010 (estimated).');
        $this->putJson('/api/admin/ai-analytics/purposes/drafts/limit', ['monthly_limit' => null, 'limit_unit' => 'tokens'])->assertOk();
        $this->ask('drafts', 'projects_updates');
        $this->putJson('/api/admin/ai-analytics/purposes/drafts/limit', ['monthly_limit' => 0.001, 'limit_unit' => 'cost'])->assertOk();
        $this->ask('drafts', 'projects_updates');
    }
}
