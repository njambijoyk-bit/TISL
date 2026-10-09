<?php

namespace Tests\Unit;

use App\Services\Access\Catalog;
use App\Services\Chat\Local\CallerContext;
use App\Services\Chat\Local\Entry;
use App\Services\Chat\Local\Knowledge;
use App\Services\Chat\Local\LocalAnswerer;
use App\Services\Chat\Local\Matcher;
use App\Services\Chat\Local\Redactor;
use App\Services\Chat\Local\Resolver;
use App\Services\Chat\Local\ResolverRegistry;
use App\Services\Chat\Local\ResolverResult;
use App\Services\Chat\Local\Slots;
use App\Services\Chat\MimiHarmScannerService;
use PHPUnit\Framework\TestCase;

/**
 * The local layer's safety net, in the habit of NoRoleNamesInCodeTest and AdminRoutesNeedAPermissionTest: lint the knowledge, prove nobody is shown an
 * entry they may not see, hold the matcher to a golden set, and check each resolver refuses callers who could reach none of its entries.
 * No database, no framework: resolvers are wrapped so only their declared contract is under test here.
 */
class MimiLocalLayerTest extends TestCase
{
    private const KINDS = ['guest', 'customer', 'vendor', 'applicant', 'driver', 'staff'];

    /** Sample permission sets, the same ones the guide's playground uses. */
    private const PERSONAS = [
        'guest' => ['guest', [], 'own'],
        'customer' => ['customer', [], 'own'],
        'cashier' => ['staff', ['admin.access', 'customers.view', 'catalogue.view', 'bookings.manage'], 'own'],
        'chef' => ['staff', ['admin.access', 'menus.view', 'menus.manage'], 'all'],
        'salesrep' => ['staff', ['admin.access', 'customers.view', 'customers.manage', 'credit.view', 'quotes.view', 'quotes.write', 'catalogue.view', 'tickets.manage'], 'assigned'],
        'finance' => ['staff', ['admin.access', 'books.view', 'books.post', 'customers.view', 'credit.view', 'payroll.run', 'stock.view', 'stock.manage', 'catalogue.view', 'insight.view'], 'all'],
        'owner' => ['staff', ['*'], 'all'],
    ];

    private static ?Knowledge $kb = null;

    private function kb(): Knowledge
    {
        return self::$kb ??= Knowledge::fromFile(__DIR__ . '/../../resources/mimi/knowledge.html', ['company.name' => 'TISL Store', 'support.email' => 'web@targetisl.co.ke']);
    }

    private function persona(string $key): CallerContext
    {
        [$kind, $perms, $scope] = self::PERSONAS[$key];

        return CallerContext::fake($kind, $perms, $scope);
    }

    /** Real resolver contracts (requires, kinds, needs), canned output: whatever is allowed to run returns one sample line. */
    private function stubbed(): array
    {
        $out = [];
        foreach (ResolverRegistry::all() as $name => $real) {
            $out[$name] = new class($real) implements Resolver
            {
                public function __construct(private Resolver $real) {}

                public function requires(): array { return $this->real->requires(); }

                public function kinds(): array { return $this->real->kinds(); }

                public function needs(): array { return $this->real->needs(); }

                public function sensitive(): bool { return $this->real->sensitive(); }

                public function run(CallerContext $c, array $slots): ResolverResult { return ResolverResult::ok(['sample line']); }
            };
        }

        return $out;
    }

    private function layer(): LocalAnswerer
    {
        $kb = $this->kb();
        $guard = fn (string $q) => (new MimiHarmScannerService)->scan($q, [])['harm_category'];

        return new LocalAnswerer($kb, new Matcher(require __DIR__ . '/../../resources/mimi/synonyms.php', $kb->all()), new Slots(['WNKJ-SO-', 'WNKJ-INV-', 'WNKJ-CSH-']), $this->stubbed(), $guard);
    }

    private function label($a): string
    {
        return match ($a->outcome) {
            'guard' => 'guard', 'none' => 'none', 'suggest' => 'suggest', 'restricted' => 'denied:' . $a->entry->id, default => $a->entry->id,
        };
    }

    private function sample(string $variant): string
    {
        return strtr($variant, ['{order}' => 'WNKJ-SO-00012', '{payment}' => 'PAY-2026-1-001', '{customer}' => 'CUST-2026-0001', '{email}' => 'wanjiru@example.com']);
    }

    /** The oracle reads the declared rules directly, so a bug in sees() cannot hide itself. */
    private function allowed(string $persona, Entry $e): bool
    {
        [$kind, $perms] = self::PERSONAS[$persona];

        return (in_array('any', $e->audience, true) || in_array($kind, $e->audience, true))
            && ! array_diff($e->requires, in_array('*', $perms, true) ? $e->requires : $perms);
    }

    public function test_the_knowledge_loads(): void
    {
        $this->assertGreaterThanOrEqual(20, count($this->kb()->all()));
    }

    public function test_lint_every_entry(): void
    {
        $problems = [];
        $ids = [];
        $resolvers = ResolverRegistry::all();
        foreach ($this->kb()->all() as $e) {
            isset($ids[$e->id]) && $problems[] = "{$e->id}: duplicate id";
            $ids[$e->id] = true;
            preg_match('/^[a-z]+\.[a-z0-9-]+$/', $e->id) || $problems[] = "{$e->id}: id is not area.topic";
            ($e->audience && ! array_diff($e->audience, [...self::KINDS, 'any'])) || $problems[] = "{$e->id}: audience must be account kinds or 'any'";
            foreach ($e->requires as $p) {
                isset(Catalog::PERMISSIONS[$p]) || $problems[] = "{$e->id}: '{$p}' is not in the permission catalogue";
            }
            count($e->variants) >= 3 || $problems[] = "{$e->id}: needs at least 3 question variants";
            in_array($e->sensitivity, ['public', 'own', 'restricted'], true) || $problems[] = "{$e->id}: bad sensitivity";
            ($e->sensitivity !== 'public' || ! $e->requires) || $problems[] = "{$e->id}: a public entry cannot require a permission";
            $e->answer !== '' || $problems[] = "{$e->id}: empty answer";
            $reach = false;
            foreach (self::KINDS as $k) {
                $c = CallerContext::fake($k, []);
                $reach = $reach || ($c->reaches($e) && ! $c->sees($e));
            }
            ($reach && $e->denied === '') && $problems[] = "{$e->id}: someone could reach this topic but not see it, so it needs a 'when not allowed' line";
            if ($e->resolver !== '') {
                $r = $resolvers[$e->resolver] ?? null;
                $r || ($problems[] = "{$e->id}: unknown resolver {$e->resolver}");
                if ($r) {
                    array_diff($e->requires, $r->requires()) && $problems[] = "{$e->id}: its resolver asks for less than the entry does";
                    $kinds = in_array('any', $e->audience, true) ? self::KINDS : $e->audience;
                    (in_array('any', $r->kinds(), true) || ! array_diff($kinds, $r->kinds())) || $problems[] = "{$e->id}: its resolver serves fewer kinds of account than the entry";
                }
            }
        }
        foreach ($this->kb()->all() as $e) {
            foreach ($e->follow as $f) {
                $this->kb()->find($f) || $problems[] = "{$e->id}: follow target {$f} does not exist";
            }
        }
        $this->assertSame([], $problems, implode("\n", $problems));
    }

    public function test_nobody_is_shown_an_entry_they_may_not_see(): void
    {
        $layer = $this->layer();
        $fails = [];
        foreach ($this->kb()->all() as $e) {
            $q = $this->sample($e->variants[0]['text']);
            $probe = mb_substr($this->kb()->fill($e->answer), 0, 28);
            foreach (array_keys(self::PERSONAS) as $p) {
                $a = $layer->answer($this->persona($p), $q);
                $ok = $this->allowed($p, $e);
                if ($ok && $this->label($a) !== $e->id) {
                    $fails[] = "{$p} should get {$e->id} but got " . $this->label($a);
                }
                if (! $ok && $a->entry === $e && $a->outcome !== 'restricted') {
                    $fails[] = "{$p} was answered from {$e->id} without access";
                }
                if (! $ok && mb_strlen($probe) > 12 && str_contains($a->text, $probe)) {
                    $fails[] = "{$p} was shown text from {$e->id} without access";
                }
            }
        }
        $this->assertSame([], $fails, implode("\n", $fails));
    }

    public function test_golden_questions(): void
    {
        $layer = $this->layer();
        $fails = [];
        foreach (json_decode((string) file_get_contents(__DIR__ . '/../fixtures/mimi_golden.json'), true) as $g) {
            [$p, $q, $want] = $g;
            if (($g[3] ?? '') === 'stretch') {
                continue;       // hard paraphrases: misses are expected until the NLP phase
            }
            $got = $this->label($layer->answer($this->persona($p), $q));
            in_array($got, explode('|', $want), true) || $fails[] = "{$p}: \"{$q}\" -> {$got} (wanted {$want})";
        }
        $this->assertSame([], $fails, implode("\n", $fails));
    }

    public function test_a_resolver_refuses_callers_who_reach_none_of_its_entries(): void
    {
        $layer = $this->layer();
        $fails = [];
        $slots = ['ordref' => 'WNKJ-SO-00012', 'custref' => 'CUST-2026-0001', 'email' => 'a@b.co'];
        foreach (array_keys(ResolverRegistry::all()) as $name) {
            foreach (array_keys(self::PERSONAS) as $p) {
                $eligible = false;
                foreach ($this->kb()->all() as $e) {
                    $eligible = $eligible || ($e->resolver === $name && $this->allowed($p, $e));
                }
                $s = $layer->run($name, $this->persona($p), $slots)->status;
                if (! $eligible && $s !== 'denied') {
                    $fails[] = "{$name} ran for {$p}, who can reach none of its entries ({$s})";
                }
                if ($eligible && $s === 'denied') {
                    $fails[] = "{$name} refused {$p}, who can reach an entry that uses it";
                }
            }
        }
        $this->assertSame([], $fails, implode("\n", $fails));
    }

    public function test_harm_is_refused_before_anything_else(): void
    {
        $a = $this->layer()->answer($this->persona('owner'), 'how to make a bomb');
        $this->assertSame('guard', $a->outcome);
    }

    public function test_slots_follow_the_voucher_series_not_a_fixed_pattern(): void
    {
        $s = new Slots(['WNKJ-SO-', 'INV/{YYYY}/']);
        $this->assertSame('WNKJ-SO-00001', $s->extract('where is WNKJ-SO-00001 please')['slots']['ordref']);
        $this->assertSame('INV/2026/0042', $s->extract('find INV/2026/0042')['slots']['ordref']);
        $this->assertSame('SO-2025-0001', $s->extract('SO-2025-0001')['slots']['ordref']);        // the old year-style numbers still work
        $this->assertSame('WNKJ-INV-00019', (new Slots)->extract('find WNKJ-INV-00019')['slots']['ordref']);   // even with no series table to read
        $this->assertArrayNotHasKey('ordref', (new Slots)->extract('call me on 0712 345 678')['slots']);
        $this->assertSame('12', $s->extract('order #12')['slots']['ordnum']);
        $this->assertSame('RGH5K2L9XY', $s->extract('receipt RGH5K2L9XY')['slots']['payref']);
    }

    public function test_the_redactor_swaps_personal_values_and_puts_them_back(): void
    {
        $r = new Redactor;
        $slots = new Slots(['WNKJ-SO-']);
        $x = $r->redact('Email wanjiru@example.com, order WNKJ-SO-00012, call 0712 345 678', $slots);
        $this->assertStringNotContainsString('wanjiru', $x['text']);
        $this->assertStringNotContainsString('00012', $x['text']);
        $this->assertStringNotContainsString('345', $x['text']);
        $this->assertStringContainsString('[EMAIL_1]', $x['text']);
        $this->assertSame('Sent to wanjiru@example.com', $r->restore('Sent to [EMAIL_1]', $x['swaps']));
    }

    public function test_a_log_line_for_someones_own_data_holds_no_values(): void
    {
        $a = $this->layer()->answer($this->persona('customer'), 'where is my order');
        $this->assertSame('acct.my-orders', $a->entry->id);
        $this->assertStringNotContainsString('sample line', $a->loggableText());
        $this->assertStringContainsString('values not stored', $a->loggableText());
    }

    public function test_the_guide_and_the_server_read_the_same_entries(): void
    {
        $guide = (string) file_get_contents(__DIR__ . '/../../../docs/MIMI_LOCAL_LAYER_GUIDE.html');
        preg_match_all('/<article class="kb" id="([^"]+)"/', $guide, $m);
        $server = array_map(fn ($e) => $e->id, $this->kb()->all());
        sort($server);
        $theirs = $m[1];
        sort($theirs);
        $this->assertSame($theirs, $server, 'docs/MIMI_LOCAL_LAYER_GUIDE.html and resources/mimi/knowledge.html have drifted apart');
    }
}
