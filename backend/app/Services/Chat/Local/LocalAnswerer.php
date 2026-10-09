<?php

namespace App\Services\Chat\Local;

/**
 * The local brain. Order of work: guard, slots, entries this caller may see, a look at topics they may not (to refuse politely), match, decide,
 * resolve live data. Framework-free: resolvers, the guard and the settings are handed in.
 */
final class LocalAnswerer
{
    /** @var Entry[] */
    private array $entries;

    /**
     * @param  array<string,Resolver>  $resolvers
     * @param  \Closure(string):?string  $guard  returns a harm category, or null
     * @param  array{answer:float,suggest:float,tie:float,shadow_margin:float}  $t
     */
    public function __construct(
        private Knowledge $knowledge,
        private Matcher $matcher,
        private Slots $slots,
        private array $resolvers,
        private \Closure $guard,
        private array $t = ['answer' => 0.60, 'suggest' => 0.45, 'tie' => 0.04, 'shadow_margin' => 0.10],
        bool $allowDrafts = true,
        private string $company = 'our store',
    ) {
        $this->entries = array_values(array_filter($knowledge->all(), fn (Entry $e) => $e->reviewed !== '' || $allowDrafts));
    }

    public function noAnswerText(): string
    {
        return $this->knowledge->fill("That isn't written down yet. I've noted it so the team can add it. Meanwhile you can reach a person at {{support.email}}.");
    }

    /** @return Entry[] */
    public function entries(): array
    {
        return $this->entries;
    }

    public function answer(CallerContext $c, string $message): LocalAnswer
    {
        $t0 = microtime(true);
        $a = $this->decide($c, $message);
        $a->ms = (microtime(true) - $t0) * 1000;

        return $a;
    }

    private function decide(CallerContext $c, string $message): LocalAnswer
    {
        if ($harm = ($this->guard)($message)) {
            return new LocalAnswer('guard', text: $this->knowledge->fill("I'm not able to help with that. Please keep our conversation focused on {{company.name}} topics."), harm: $harm);
        }

        ['text' => $text, 'slots' => $slots] = $this->slots->extract($message);
        $vis = array_values(array_filter($this->entries, fn (Entry $e) => $c->sees($e)));
        $hid = array_values(array_filter($this->entries, fn (Entry $e) => ! $c->sees($e) && $e->denied !== '' && $c->reaches($e)));
        $ranked = $this->matcher->rank($vis, $text);
        $top = $ranked[0] ?? null;
        $second = $ranked[1] ?? null;
        $topScore = $top['score'] ?? 0.0;
        $unknown = $this->matcher->unknownShare($text);

        $snippets = [];
        foreach (array_slice($ranked, 0, 2) as $r) {
            if ($r['entry']->sensitivity === 'public' && $r['score'] > 0.15) {
                $snippets[] = ['id' => $r['entry']->id, 'text' => mb_substr($this->knowledge->fill($r['entry']->answer), 0, 200)];
            }
        }
        $base = fn (string $outcome, array $extra = []) => new LocalAnswer($outcome, ...$extra, snippets: $snippets, unknownShare: $unknown);

        // is the best match overall a topic this person may not see? say so, rather than answer a weaker visible entry
        $shadow = ($this->matcher->rank($hid, $text))[0] ?? null;
        if ($shadow && $shadow['score'] >= $this->t['answer'] && ($topScore < $this->t['answer'] || $shadow['score'] >= $topScore + $this->t['shadow_margin'])) {
            return $base('restricted', ['entry' => $shadow['entry'], 'confidence' => $shadow['score'], 'text' => $this->knowledge->fill($shadow['entry']->denied)]);
        }

        if ($top && $topScore >= $this->t['answer']) {
            if ($second && $second['score'] >= $this->t['answer'] && $topScore - $second['score'] < $this->t['tie']) {
                return $base('suggest', ['confidence' => $topScore, 'text' => 'Two answers fit about equally well. Which did you mean?', 'suggestions' => $this->options([$top['entry'], $second['entry']])]);
            }

            return $this->resolve($top['entry'], $topScore, $c, $slots, $snippets, $unknown);
        }

        if ($top && $topScore >= $this->t['suggest']) {
            $opts = array_map(fn ($r) => $r['entry'], array_slice(array_filter($ranked, fn ($r) => $r['score'] >= $this->t['suggest']), 0, 3));

            return $base('suggest', ['confidence' => $topScore, 'text' => "I'm not sure I understood. Did you mean:", 'suggestions' => $this->options($opts)]);
        }

        return $base('none', ['confidence' => $topScore]);
    }

    private function resolve(Entry $e, float $score, CallerContext $c, array $slots, array $snippets, float $unknown): LocalAnswer
    {
        $a = new LocalAnswer('answer', $e, $score, $this->body($e), snippets: $snippets, unknownShare: $unknown, sensitive: $e->sensitivity !== 'public');
        if ($e->resolver === '') {
            return $a;
        }
        $a->resolver = $e->resolver;
        $r = $this->run($e->resolver, $c, $slots);
        switch ($r->status) {
            case 'ask':
                $a->outcome = 'ask';
                $a->text = 'Which one? Send the number, for example ' . (str_contains($r->need, 'ordref') ? 'WNKJ-SO-00012' : (str_contains($r->need, 'email') ? 'name@example.com' : 'CUST-2026-0001')) . '.';
                $a->sensitive = false;
                break;
            case 'denied':
                $a->outcome = 'denied_resolver';
                $a->text = $this->knowledge->fill($e->denied ?: 'That is not available to you.');
                $a->sensitive = false;
                break;
            case 'empty':
                $a->outcome = 'empty';
                $a->text = $this->knowledge->fill($e->empty ?: 'I could not find anything.');
                $a->sensitive = false;
                break;
            default:
                $a->rows = $r->rows();
                $a->text .= "\n\n" . implode("\n", array_map(fn ($l) => '- ' . $l, $r->lines));
        }

        return $a;
    }

    private function body(Entry $e): string
    {
        return $this->knowledge->fill($e->answer) . ($e->more !== '' ? "\n\n" . $this->knowledge->fill($e->more) : '');
    }

    /** The resolver is asked again, whatever the entry said. */
    public function run(string $name, CallerContext $c, array $slots): ResolverResult
    {
        $r = $this->resolvers[$name] ?? null;
        if (! $r) {
            return ResolverResult::empty();
        }
        if (! in_array('any', $r->kinds(), true) && ! in_array($c->kind, $r->kinds(), true)) {
            return ResolverResult::denied();
        }
        if (! $c->canAll($r->requires())) {
            return ResolverResult::denied();
        }
        foreach ($r->needs() as $need) {
            if (! array_filter(explode('|', $need), fn ($n) => ! empty($slots[$n]))) {
                return ResolverResult::ask($need);
            }
        }

        return $r->run($c, $slots);
    }

    /** @param  Entry[]  $entries */
    private function options(array $entries): array
    {
        return array_values(array_map(function (Entry $e) {
            $plain = array_values(array_filter($e->variants, fn ($v) => ! str_contains($v['text'], '{')));

            return ['label' => $e->title, 'question' => $plain[0]['text'] ?? $e->title];
        }, $entries));
    }
}
