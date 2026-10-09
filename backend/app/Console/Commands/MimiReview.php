<?php

namespace App\Console\Commands;

use App\Models\MimiQueryLog;
use App\Services\Chat\Local\CallerContext;
use App\Services\Chat\Local\LocalLayer;
use App\Services\Chat\Local\Redactor;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Reviewing what the local layer did on real questions (docs/MIMI_LOCAL_LAYER_GUIDE.html, "the learning loop"). Run it after a few days in shadow mode.
 *   php artisan mimi:review                      the report: what was settled locally, what was missed, what to double-check
 *   php artisan mimi:review --csv=review.csv     the same questions as a redacted CSV, with an empty "expected" column to fill in
 *   php artisan mimi:review --score=review.csv   score the engine on the rows you filled in, and sweep the thresholds
 * Emails, phone numbers and reference numbers are blanked before anything is printed or written.
 */
class MimiReview extends Command
{
    protected $signature = 'mimi:review {--days=7} {--csv= : write a redacted CSV for labelling} {--score= : a labelled CSV (question,kind,expected) to score}';

    protected $description = "Review how Mimi's local layer did on real questions, and tune its thresholds on labelled ones";

    public function handle(LocalLayer $layer): int
    {
        if ($f = $this->option('score')) {
            return $this->score($layer, (string) $f);
        }
        if (! Schema::hasTable('mimi_query_logs') || ! Schema::hasColumn('mimi_query_logs', 'local_outcome')) {
            $this->error('The log columns are not there yet. Run database/sql/105_mimi_local_layer.sql, then let Mimi run for a few days.');

            return self::FAILURE;
        }
        $days = max(1, (int) $this->option('days'));
        $base = MimiQueryLog::query()->where('queried_at', '>=', now()->subDays($days))->whereNotNull('local_outcome')->where('is_harmful', false);
        $total = (clone $base)->count();
        if ($total === 0) {
            $this->warn("No questions with a local-layer result in the last {$days} days. Is MIMI_LOCAL_MODE shadow or on, and has script 105 been run?");

            return self::SUCCESS;
        }

        $this->info("Last {$days} days: {$total} questions (harmful ones left out)");
        $by = (clone $base)->select('local_outcome', DB::raw('COUNT(*) n'))->groupBy('local_outcome')->orderByDesc('n')->pluck('n', 'local_outcome');
        $this->table(['Local layer decided', 'Questions', 'Share'], $by->map(fn ($n, $k) => [$k, $n, round(100 * $n / $total, 1) . '%'])->values()->all());
        $settled = ($by['answer'] ?? 0) + ($by['empty'] ?? 0) + ($by['ask'] ?? 0) + ($by['restricted'] ?? 0) + ($by['denied_resolver'] ?? 0);
        $this->line('Settled by the local layer: ' . round(100 * $settled / $total, 1) . '%   (the rest would have gone to the fallback: none, or "did you mean")');

        // confidence of the answers: a pile just above the threshold means it is guessing
        $this->newLine();
        $buckets = [];
        foreach ((clone $base)->where('local_outcome', 'answer')->pluck('confidence') as $c) {
            $b = min(0.9, floor((float) $c * 10) / 10);
            $buckets[number_format($b, 1) . '–' . number_format($b + 0.1, 1)] = ($buckets[number_format($b, 1) . '–' . number_format($b + 0.1, 1)] ?? 0) + 1;
        }
        ksort($buckets);
        $this->line('Confidence of local answers:');
        foreach ($buckets as $range => $n) {
            $this->line(sprintf('  %s  %-4d %s', $range, $n, str_repeat('█', (int) min(40, ceil(40 * $n / max($buckets))))));
        }

        $red = new Redactor;
        $slots = $layer->slots();
        $clean = fn (string $q) => trim($red->redact($q, $slots)['text']);
        $group = function ($rows) use ($clean) {
            $out = [];
            foreach ($rows as $r) {
                $q = $clean((string) $r->query);
                $k = mb_strtolower($q) . '|' . $r->kb_entry;
                $out[$k] ??= ['q' => $q, 'n' => 0, 'entry' => $r->kb_entry, 'c' => (float) $r->confidence, 'kind' => $r->actor_type];
                $out[$k]['n'] += (int) $r->n;
            }
            usort($out, fn ($a, $b) => $b['n'] <=> $a['n']);

            return $out;
        };
        $select = ['query', 'kb_entry', 'actor_type', DB::raw('MAX(confidence) c'), DB::raw('COUNT(*) n')];

        $miss = $group((clone $base)->whereIn('local_outcome', ['none', 'suggest'])->select($select)->groupBy('query', 'kb_entry', 'actor_type')->orderByDesc('n')->limit(2000)->get());
        $this->newLine();
        $this->info('Questions the local layer could not settle: write entries for the top ones');
        $this->table(['Asked', 'Who', 'Question', 'Nearest entry (confidence)'], array_map(fn ($m) => [$m['n'], $m['kind'], mb_substr($m['q'], 0, 70), $m['entry'] ? "{$m['entry']} ({$m['c']})" : '–'], array_slice($miss, 0, 25)));

        $shaky = $group((clone $base)->where('local_outcome', 'answer')->where('confidence', '<', 0.75)->select($select)->groupBy('query', 'kb_entry', 'actor_type')->orderByDesc('n')->limit(2000)->get());
        $this->info('Answered, but with low confidence: check each one really is the right entry');
        $this->table(['Asked', 'Question', 'Answered with (confidence)'], array_map(fn ($m) => [$m['n'], mb_substr($m['q'], 0, 70), "{$m['entry']} ({$m['c']})"], array_slice($shaky, 0, 25)));

        $used = (clone $base)->where('local_outcome', 'answer')->select('kb_entry', DB::raw('COUNT(*) n'))->groupBy('kb_entry')->pluck('n', 'kb_entry');
        $never = array_values(array_filter(array_map(fn ($e) => $e->id, $layer->answerer()->entries()), fn ($id) => ! isset($used[$id])));
        $this->info('Entries that answered nothing in this period (candidates to reword or retire): ' . ($never ? implode(', ', $never) : 'none'));

        if ($path = $this->option('csv')) {
            $all = $group((clone $base)->select($select)->groupBy('query', 'kb_entry', 'actor_type')->orderByDesc('n')->limit(5000)->get());
            $fh = fopen($path, 'w');
            fputcsv($fh, ['question', 'kind', 'asked', 'local_nearest', 'confidence', 'expected']);
            foreach ($all as $m) {
                fputcsv($fh, [$m['q'], $m['kind'], $m['n'], $m['entry'], $m['c'], '']);
            }
            fclose($fh);
            $this->newLine();
            $this->info("Wrote {$path}: " . count($all) . ' redacted questions. Fill the "expected" column with an entry key, "none" (nothing should answer) or "denied:key", then run:  php artisan mimi:review --score=' . $path);
        }

        return self::SUCCESS;
    }

    /** Score the current engine on questions someone has labelled, and show what each answer threshold would do. */
    private function score(LocalLayer $layer, string $file): int
    {
        if (! is_file($file)) {
            $this->error("No such file: {$file}");

            return self::FAILURE;
        }
        $fh = fopen($file, 'r');
        $head = array_map('strtolower', (array) fgetcsv($fh));
        $col = fn (string $n) => array_search($n, $head, true);
        if ($col('question') === false || $col('expected') === false) {
            $this->error('The CSV needs a header with at least: question, expected (and kind: guest, customer or staff).');

            return self::FAILURE;
        }
        $rows = [];
        while (($r = fgetcsv($fh)) !== false) {
            $exp = trim((string) ($r[$col('expected')] ?? ''));
            if ($exp !== '' && trim((string) $r[$col('question')]) !== '') {
                $kind = $col('kind') !== false ? strtolower(trim((string) ($r[$col('kind')] ?? ''))) : 'guest';
                $rows[] = [(string) $r[$col('question')], in_array($kind, ['guest', 'customer', 'staff'], true) ? $kind : 'guest', $exp];
            }
        }
        fclose($fh);
        if (! $rows) {
            $this->warn('No labelled rows (the expected column is empty).');

            return self::SUCCESS;
        }
        $this->info(count($rows) . ' labelled questions. Staff are scored as holding every permission, so staff-only entries can answer.');

        $label = fn ($a) => match ($a->outcome) { 'guard' => 'guard', 'none' => 'none', 'suggest' => 'suggest', 'restricted' => 'denied:' . $a->entry->id, default => $a->entry->id };
        $defaults = (array) config('mimi.thresholds');
        $out = [];
        foreach ([0.50, 0.55, 0.60, 0.65, 0.70, 0.75, 0.80] as $t) {
            $eng = $layer->answererFor(['answer' => $t] + $defaults);
            $answered = $right = $wrong = $missed = $settledRight = 0;
            foreach ($rows as [$q, $kind, $exp]) {
                $ctx = CallerContext::fake($kind, $kind === 'staff' ? ['*'] : [], $kind === 'staff' ? 'all' : 'own');
                $a = $eng->answer($ctx, $q);
                $got = $label($a);
                $settled = in_array($a->outcome, ['answer', 'empty', 'ask', 'denied_resolver', 'restricted'], true);
                $settled && $answered++;
                if ($got === $exp) {
                    $right++;
                    $settled && $settledRight++;
                } elseif ($settled) {
                    $wrong++;                    // answered, but with the wrong entry (or answered when nothing should)
                } else {
                    $missed++;                   // did not settle a question that has an answer
                }
            }
            $out[] = [number_format($t, 2) . ($t === (float) $defaults['answer'] ? '  ← current' : ''), $answered, $right, $wrong, $missed, $answered ? round(100 * $settledRight / $answered, 1) . '%' : '–', round(100 * $right / count($rows), 1) . '%'];
        }
        $this->table(['Answer threshold', 'Settled', 'Correct', 'Wrong answer', 'Missed', 'Settled and right*', 'Overall correct'], $out);
        $this->line('* of the questions the layer answered, the share that were right. "Correct" counts a right "none" too. A wrong answer is worse than a miss (a miss falls back or asks); choose the lowest threshold that keeps wrong answers near zero, and re-run after each batch of new entries.');

        return self::SUCCESS;
    }
}
