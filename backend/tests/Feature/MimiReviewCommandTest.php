<?php

namespace Tests\Feature;

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

/** mimi:review on a small made-up log: the numbers are right, nothing personal is printed, and the scorer tells a good threshold from a bad one. */
class MimiReviewCommandTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        \App\Services\Chat\Local\KnowledgeStore::forget();
        Schema::create('mimi_query_logs', function ($t) {
            $t->id(); $t->text('query'); $t->string('actor_type')->default('guest'); $t->boolean('is_harmful')->default(false); $t->dateTime('queried_at');
            $t->string('answered_by')->nullable(); $t->string('local_outcome')->nullable(); $t->string('kb_entry')->nullable(); $t->decimal('confidence', 4, 3)->nullable(); $t->string('resolver')->nullable();
        });
        foreach (['kb_entries', 'kb_questions'] as $x) {
            Schema::dropIfExists("mimi_$x");
        }
        config(['cache.default' => 'array']);
    }

    private function log(string $q, string $outcome, ?string $entry = null, float $c = 0.0, string $kind = 'guest', int $times = 1): void
    {
        for ($i = 0; $i < $times; $i++) {
            DB::table('mimi_query_logs')->insert(['query' => $q, 'actor_type' => $kind, 'queried_at' => now(), 'answered_by' => 'ai', 'local_outcome' => $outcome, 'kb_entry' => $entry, 'confidence' => $c]);
        }
    }

    public function test_the_report_counts_and_never_prints_personal_values(): void
    {
        $this->log('how can I pay', 'answer', 'store.pay', 1.0, 'guest', 3);
        $this->log('pay maybe', 'answer', 'store.pay', 0.62);
        $this->log('do you open on sunday call 0712 345 678', 'none', null, 0.1, 'guest', 2);
        $this->log('mail me at wanjiru@example.com about hours', 'none', null, 0.1);

        $this->artisan('mimi:review')
            ->expectsOutputToContain('7 questions')
            ->expectsOutputToContain('store.pay')
            ->expectsOutputToContain('do you open on sunday call [PHONE_1]')
            ->doesntExpectOutputToContain('345 678')
            ->doesntExpectOutputToContain('wanjiru')
            ->assertSuccessful();
    }

    public function test_it_says_so_when_script_105_has_not_been_run(): void
    {
        Schema::dropIfExists('mimi_query_logs');
        Schema::create('mimi_query_logs', function ($t) { $t->id(); $t->text('query'); });
        $this->artisan('mimi:review')->expectsOutputToContain('105_mimi_local_layer.sql')->assertFailed();
    }

    public function test_the_csv_is_redacted_and_the_scorer_separates_good_thresholds_from_bad(): void
    {
        $this->log('how can I pay', 'answer', 'store.pay', 1.0);
        $this->log('email wanjiru@example.com', 'none');
        $csv = sys_get_temp_dir() . '/mimi_review_' . uniqid() . '.csv';
        $this->artisan('mimi:review', ['--csv' => $csv])->assertSuccessful();
        $text = (string) file_get_contents($csv);
        $this->assertStringContainsString('how can I pay', $text);
        $this->assertStringNotContainsString('wanjiru', $text);

        // a small labelled set: the first two are easy, the third only a low threshold would (wrongly) answer
        file_put_contents($csv, "question,kind,expected\nhow can I pay,guest,store.pay\nwhat is your return policy,guest,store.returns\nwhat is the weather today,guest,none\n");
        $this->artisan('mimi:review', ['--score' => $csv])->expectsOutputToContain('3 labelled questions')->expectsOutputToContain('← current')->assertSuccessful();

        file_put_contents($csv, "question,kind,expected\n");
        $this->artisan('mimi:review', ['--score' => $csv])->expectsOutputToContain('No labelled rows')->assertSuccessful();
        unlink($csv);
    }
}
