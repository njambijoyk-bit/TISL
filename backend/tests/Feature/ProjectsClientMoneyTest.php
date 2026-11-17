<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/** Projects, builds 4.4 and 4.5 (docs/PROJECTS_STAGE4_SPEC.md): client money accounts (pooled or dedicated), balances for one client or several jointly, receiving, paying out, and the guard in Books. */
class ProjectsClientMoneyTest extends TestCase
{
    use Concerns\CreatesProjectsWorld;

    private User $kamau;
    private int $project;
    private array $posted = [];

    protected function setUp(): void
    {
        parent::setUp();
        $this->createProjectsWorld();
        Schema::create('ledger_groups', function ($t) { $t->id(); $t->unsignedBigInteger('parent_id')->nullable(); $t->string('name'); $t->string('nature'); $t->string('behaviour')->nullable(); $t->boolean('is_active')->default(true); $t->timestamps(); });
        Schema::create('ledgers', function ($t) { $t->id(); $t->unsignedBigInteger('group_id'); $t->string('name')->unique(); $t->decimal('opening_balance', 14, 2)->default(0); $t->string('opening_side', 1)->default('D'); $t->boolean('is_active')->default(true);
            $t->text('notes')->nullable(); $t->string('bank_name')->nullable(); $t->string('account_number')->nullable(); $t->string('account_name')->nullable(); $t->string('branch')->nullable(); $t->unsignedBigInteger('statement_id')->nullable(); $t->timestamps(); });
        Schema::create('vouchers', function ($t) { $t->id(); $t->string('status')->default('posted'); $t->unsignedBigInteger('cost_centre_id')->nullable(); $t->string('narration')->nullable(); $t->date('date')->nullable(); });
        Schema::create('voucher_entries', function ($t) { $t->id(); $t->unsignedBigInteger('voucher_id'); $t->unsignedBigInteger('ledger_id'); $t->string('side', 1); $t->decimal('amount', 14, 2); $t->unsignedBigInteger('cost_centre_id')->nullable(); $t->unsignedBigInteger('project_holding_id')->nullable(); });
        DB::table('ledger_groups')->insert([['id' => 1, 'parent_id' => null, 'name' => 'Bank Accounts', 'nature' => 'asset', 'behaviour' => 'bank'], ['id' => 2, 'parent_id' => null, 'name' => 'Current Liabilities', 'nature' => 'liability', 'behaviour' => null]]);
        DB::table('ledgers')->insert([['id' => 1, 'group_id' => 1, 'name' => 'Client Account, KCB'], ['id' => 2, 'group_id' => 2, 'name' => 'Client money owed']]);
        // the books' own voucher service is stood in for: it posts the journal it is given as a voucher with its lines, as Books would
        $posted = &$this->posted;
        $this->app->instance(\App\Services\Projects\ProjectVoucherPoster::class, new class($posted) extends \App\Services\Projects\ProjectVoucherPoster {
            public function __construct(private array &$posted) {}

            public function journal(string $date, string $narration, ?string $reference, array $entries, \App\Models\User $by): int
            {
                $id = DB::table('vouchers')->insertGetId(['status' => 'posted', 'narration' => $narration, 'date' => $date]);
                foreach ($entries as $e) {
                    DB::table('voucher_entries')->insert(['voucher_id' => $id] + $e);
                }
                $this->posted[] = compact('date', 'narration', 'reference', 'entries');

                return $id;
            }
        });
        \App\Services\Projects\ProjectsSetup::forget();
        $this->kamau = $this->staff('Kamau', ['projects.use', 'projects.create', 'projects.money.view', 'projects.money.held.view', 'projects.money.held.pay', 'projects.ledgers.bank']);
        Sanctum::actingAs($this->kamau, ['*']);
        $this->project = (int) $this->postJson('/api/admin/projects', ['type_id' => DB::table('project_types')->where('industry_key', 'general')->value('id'), 'title' => 'Wambua award', 'customer_id' => 1])->json('project.id');
    }

    private function account(array $o = []): int
    {
        $this->postJson('/api/admin/projects/client-money/accounts', $o + ['name' => 'Client Account, KCB', 'kind' => 'pooled', 'bank_ledger_id' => 1, 'liability_ledger_id' => 2])->assertCreated();

        return (int) DB::table('project_client_accounts')->max('id');
    }

    private function balance(int $account, array $o = []): int
    {
        $this->postJson("/api/admin/projects/client-money/accounts/{$account}/balances", $o + ['owners' => [1]])->assertCreated();

        return (int) DB::table('project_client_holdings')->max('id');
    }

    public function test_a_pooled_account_holds_a_balance_per_client_including_joint_ones_and_each_is_worked_out_from_the_books(): void
    {
        $a = $this->account();
        $imara = $this->balance($a, ['project_id' => $this->project]);
        $joint = $this->balance($a, ['owners' => [1, 2], 'label' => 'Grace and Peter Wambua']);
        $this->postJson("/api/admin/projects/client-money/balances/{$imara}/receive", ['amount' => 1250000, 'from' => 'Imara Sacco', 'reference' => 'EFT 4471'])->assertCreated();
        $r = $this->postJson("/api/admin/projects/client-money/balances/{$joint}/receive", ['amount' => 6200000, 'from' => 'Court award, HCCC 88 of 2025'])->assertCreated()->json();

        $acc = $r['accounts'][0];
        $this->assertSame([7450000, 'pooled', false], [$acc['held'], $acc['kind'], $acc['guard_on']], 'the guard stays off until someone switches it on');
        $by = collect($acc['balances'])->keyBy('label');
        $this->assertSame([1250000, false, 'P-0001'], [$by['Imara Sacco']['held'], $by['Imara Sacco']['joint'], $by['Imara Sacco']['project']['number']]);
        $this->assertSame([6200000, true, ['Imara Sacco', 'Brian Kariuki']], [$by['Grace and Peter Wambua']['held'], $by['Grace and Peter Wambua']['joint'], array_column($by['Grace and Peter Wambua']['owners'], 'name')]);

        // what went into the books: a journal, debit the bank ledger and credit the liability ledger, both tagged with the balance, on the work's cost centre
        $cc = (int) DB::table('projects')->where('id', $this->project)->value('cost_centre_id');
        $first = $this->posted[0];
        $this->assertSame('EFT 4471', $first['reference']);
        $this->assertSame([['ledger_id' => 1, 'side' => 'D', 'amount' => 1250000.0, 'project_holding_id' => $imara, 'cost_centre_id' => $cc], ['ledger_id' => 2, 'side' => 'C', 'amount' => 1250000.0, 'project_holding_id' => $imara, 'cost_centre_id' => $cc]], $first['entries']);
        $this->assertStringContainsString('Client money received for Imara Sacco from Imara Sacco', $first['narration']);

        // a cancelled voucher no longer counts
        DB::table('vouchers')->where('id', 1)->update(['status' => 'cancelled']);
        $this->assertSame(6200000, $this->getJson('/api/admin/projects/client-money')->json('accounts.0.held'));
        $this->assertSame('client_money.received', DB::table('project_log')->orderByDesc('id')->value('action'));
    }

    public function test_a_dedicated_account_holds_one_balance(): void
    {
        $a = $this->account(['kind' => 'dedicated']);
        $this->balance($a, ['owners' => [1, 2]]);
        $this->postJson("/api/admin/projects/client-money/accounts/{$a}/balances", ['owners' => [1]])->assertStatus(422)->assertJson(['message' => 'A dedicated account holds one balance, and this one already has it.']);
    }

    public function test_an_account_can_open_its_own_bank_and_liability_ledgers_in_books(): void
    {
        $this->postJson('/api/admin/projects/client-money/accounts', ['name' => 'Mwangi Estate', 'kind' => 'dedicated', 'new_bank' => ['name' => 'Mwangi Estate, Equity', 'group_id' => 1, 'bank_name' => 'Equity', 'account_number' => '0099'], 'liability_group_id' => 2])->assertCreated();
        $bank = DB::table('ledgers')->where('name', 'Mwangi Estate, Equity')->first();
        $owed = DB::table('ledgers')->where('name', 'Client money: Mwangi Estate')->first();
        $this->assertSame([1, 'Equity', 0.0, 2], [(int) $bank->group_id, $bank->bank_name, (float) $bank->opening_balance, (int) $owed->group_id]);
        $a = DB::table('project_client_accounts')->first();
        $this->assertSame([(int) $bank->id, (int) $owed->id], [(int) $a->ledger_id, (int) $a->liability_ledger_id]);

        $this->postJson('/api/admin/projects/client-money/accounts', ['name' => 'Again', 'bank_ledger_id' => $bank->id, 'liability_ledger_id' => 2])->assertStatus(422)->assertJson(['message' => 'That bank ledger is already a client money account.']);
        $this->postJson('/api/admin/projects/client-money/accounts', ['name' => 'Wrong', 'bank_ledger_id' => 2, 'liability_ledger_id' => 2])->assertStatus(422);
        $this->postJson('/api/admin/projects/client-money/accounts', ['name' => 'Wrong', 'bank_ledger_id' => 1, 'liability_ledger_id' => 1])->assertStatus(422)->assertJson(['message' => 'The money is owed to the clients: choose a liability ledger.']);
        $this->grant($this->kamau, ['admin.access', 'projects.use', 'projects.money.held.view', 'projects.money.held.pay']);
        $this->postJson('/api/admin/projects/client-money/accounts', ['name' => 'X', 'new_bank' => ['name' => 'X bank', 'group_id' => 1], 'liability_group_id' => 2])->assertForbidden();
    }

    public function test_receiving_is_checked_and_needs_the_permission(): void
    {
        $h = $this->balance($this->account());
        $this->postJson("/api/admin/projects/client-money/balances/{$h}/receive", ['amount' => 0, 'from' => 'X'])->assertStatus(422);
        $this->postJson("/api/admin/projects/client-money/balances/{$h}/receive", ['amount' => 10, 'from' => ''])->assertStatus(422)->assertJson(['message' => 'Say who the money came from.']);
        $this->postJson("/api/admin/projects/client-money/balances/{$h}/receive", ['amount' => 10, 'from' => 'X', 'date' => now()->addDays(3)->toDateString()])->assertStatus(422);
        $this->postJson("/api/admin/projects/client-money/accounts/1/balances", ['owners' => [999]])->assertStatus(422);
        $this->assertSame([], $this->posted);

        $viewer = $this->staff('Viewer', ['projects.use', 'projects.money.held.view']);
        Sanctum::actingAs($viewer, ['*']);
        $r = $this->getJson('/api/admin/projects/client-money')->assertOk()->json();
        $this->assertSame([false], [$r['can']['manage']]);
        $this->assertArrayNotHasKey('options', $r);
        $this->postJson("/api/admin/projects/client-money/balances/{$h}/receive", ['amount' => 10, 'from' => 'X'])->assertForbidden();
        Sanctum::actingAs($this->staff('Clerk'), ['*']);
        $this->getJson('/api/admin/projects/client-money')->assertForbidden();
    }

    public function test_the_money_tab_shows_what_is_held_for_the_work_and_books_refuses_to_edit_a_voucher_that_moved_client_money(): void
    {
        $h = $this->balance($this->account(), ['project_id' => $this->project]);
        $this->postJson("/api/admin/projects/client-money/balances/{$h}/receive", ['amount' => 2000000, 'from' => 'Imara Sacco'])->assertCreated();
        $this->assertSame(2000000.0, app(\App\Services\Projects\ProjectHeldMoney::class)->forProject(DB::table('projects')->find($this->project), $this->kamau)['total']);

        $books = file_get_contents(app_path('Http/Controllers/Api/BooksVoucherController.php'));
        $this->assertStringContainsString("whereNotNull('project_holding_id')->exists()", $books, 'an edit on the Books form would lose which client the money belongs to, so it is refused there');
        $service = file_get_contents(app_path('Services/Books/VoucherService.php'));
        $this->assertStringContainsString("! empty(\$e['project_holding_id']) && VoucherEntry::holdsClientMoney()", $service, 'a journal line carries the balance only when it is given, and only once the column exists');
    }

    // ------------------------------------------------------------------ 4.5 paying out and the guard

    private function receive(int $h, float $amount): void
    {
        $this->postJson("/api/admin/projects/client-money/balances/{$h}/receive", ['amount' => $amount, 'from' => 'Court award'])->assertCreated();
    }

    public function test_paying_out_posts_a_journal_and_never_takes_more_than_the_balance_holds(): void
    {
        $a = $this->account();
        $mine = $this->balance($a, ['project_id' => $this->project]);
        $theirs = $this->balance($a, ['owners' => [2]]);
        $this->receive($mine, 1000);
        $this->receive($theirs, 5000);

        $r = $this->postJson("/api/admin/projects/client-money/balances/{$mine}/pay-out", ['amount' => 400, 'to' => 'Imara Sacco', 'reference' => 'CHQ 118', 'note' => 'part of the award'])->assertCreated()->json();
        $this->assertSame(600, collect($r['accounts'][0]['balances'])->firstWhere('id', $mine)['held']);
        $cc = (int) DB::table('projects')->where('id', $this->project)->value('cost_centre_id');
        $last = end($this->posted);
        $this->assertSame([['ledger_id' => 2, 'side' => 'D', 'amount' => 400.0, 'project_holding_id' => $mine, 'cost_centre_id' => $cc], ['ledger_id' => 1, 'side' => 'C', 'amount' => 400.0, 'project_holding_id' => $mine, 'cost_centre_id' => $cc]], $last['entries'],
            'less is owed to the client and the money leaves the bank');
        $this->assertSame(['CHQ 118', 'Client money paid out of Imara Sacco to Imara Sacco: part of the award'], [$last['reference'], $last['narration']]);

        // the account holds 5,600 in all, but this balance only 600: another client's money is never used, guard or no guard
        $this->postJson("/api/admin/projects/client-money/balances/{$mine}/pay-out", ['amount' => 700, 'to' => 'Imara Sacco'])->assertStatus(422)
            ->assertJson(['message' => "That is more than this balance holds (600.00). Client money is never paid out of other clients' balances.", 'held' => 600]);
        $this->postJson("/api/admin/projects/client-money/balances/{$mine}/pay-out", ['amount' => 600, 'to' => ''])->assertStatus(422)->assertJson(['message' => 'Say who the money is paid to.']);
        $this->postJson("/api/admin/projects/client-money/balances/{$mine}/pay-out", ['amount' => 600, 'to' => 'Imara Sacco'])->assertCreated();
        $this->assertSame([0.0, 5000.0], array_values(app(\App\Services\Books\ClientMoneyGuard::class)->held([$mine, $theirs])));
        $this->assertSame('client_money.paid_out', DB::table('project_log')->orderByDesc('id')->value('action'));

        Sanctum::actingAs($this->staff('Viewer', ['projects.use', 'projects.money.held.view']), ['*']);
        $this->postJson("/api/admin/projects/client-money/balances/{$theirs}/pay-out", ['amount' => 1, 'to' => 'X'])->assertForbidden();
    }

    public function test_paying_out_and_switching_the_guard_off_follow_the_serious_action_rules(): void
    {
        $h = $this->balance($this->account());
        $this->receive($h, 1000);
        $this->postJson('/api/admin/projects/client-money/accounts/1/guard', ['on' => true])->assertOk()->assertJsonPath('accounts.0.guard_on', true);
        $this->assertSame('client_money.guard_on', DB::table('project_log')->orderByDesc('id')->value('action'));

        app(\App\Services\Projects\ProjectSettings::class)->save('serious', array_merge(\App\Services\Projects\ProjectSerious::defaults(), [
            'held.pay_out' => ['needs' => 'supervisor', 'on_project' => true, 'reason' => true], 'held.guard_off' => ['needs' => 'supervisor', 'on_project' => true, 'reason' => false]]), $this->kamau);
        $r = $this->postJson("/api/admin/projects/client-money/balances/{$h}/pay-out", ['amount' => 100, 'to' => 'Imara Sacco'])->assertStatus(428)->json();
        $this->assertSame(['ask', 'held.pay_out', 'Pay out of held client money'], [$r['serious']['state'], $r['serious']['action'], $r['serious']['label']]);
        $this->postJson('/api/admin/projects/client-money/accounts/1/guard', ['on' => false])->assertStatus(428)->assertJsonPath('serious.action', 'held.guard_off');
        $this->assertTrue((bool) DB::table('project_client_accounts')->value('guard_on'), 'nothing changed');
        $this->assertCount(1, $this->posted, 'only the receipt is in the books');

        $saved = app(\App\Services\Projects\ProjectSettings::class)->get('serious');
        $this->assertSame([true, false], [$saved['held.pay_out']['on_project'], $saved['held.guard_off']['on_project']], 'an account is not one piece of work, so no supervisor can be asked to be on it');
    }

    /** The Books side, on its own: what an account's guard refuses when vouchers are posted or cancelled in the books. */
    public function test_the_guard_in_books_refuses_money_leaving_without_a_balance_and_any_balance_going_below_zero(): void
    {
        $a = $this->account();
        $h = $this->balance($a);
        $other = $this->balance($a, ['owners' => [2]]);
        $receipt = $this->voucher([[1, 'D', 1000, $h], [2, 'C', 1000, $h]]);
        $guard = app(\App\Services\Books\ClientMoneyGuard::class);

        // off: the books post anything, as before
        $guard->afterPosting($this->voucher([[2, 'D', 50, null], [1, 'C', 50, null]]));
        $guard->afterPosting($this->voucher([[2, 'D', 5000, $h], [1, 'C', 5000, $h]]));
        DB::table('vouchers')->whereNotIn('id', [$receipt])->update(['status' => 'cancelled']);

        DB::table('project_client_accounts')->update(['guard_on' => 1]);
        $refused = function (array $lines, string $words) use ($guard) {
            try {
                $guard->afterPosting($this->voucher($lines));
                $this->fail("Expected the books to refuse: {$words}");
            } catch (\App\Services\Books\BooksException $e) {
                $this->assertStringContainsString($words, $e->getMessage());
            }
        };
        $refused([[2, 'D', 50, null], [1, 'C', 50, null]], 'money leaving it must come out of a client\'s balance');
        $refused([[2, 'D', 1500, $h], [1, 'C', 1500, $h]], 'This would take the client balance "Imara Sacco" below zero: it holds 1,000.00 and 1,500.00 would leave it.');
        DB::table('vouchers')->whereNotIn('id', [$receipt])->update(['status' => 'cancelled']);

        $guard->afterPosting($this->voucher([[1, 'D', 70, null], [9, 'C', 70, null]]));   // money coming in untagged (bank interest, say) is let in
        $paid = $this->voucher([[2, 'D', 800, $h], [1, 'C', 800, $h]]);
        $guard->afterPosting($paid);

        // cancelling the receipt now would leave the balance at -800
        DB::table('vouchers')->where('id', $receipt)->update(['status' => 'cancelled']);
        $this->expectException(\App\Services\Books\BooksException::class);
        $guard->afterCancelling($receipt);
    }

    public function test_the_guard_lets_a_balance_already_below_zero_go_up_and_cancelling_a_payment_is_always_let_through(): void
    {
        $a = $this->account();
        $h = $this->balance($a);
        $paid = $this->voucher([[2, 'D', 300, $h], [1, 'C', 300, $h]]);   // posted while the guard was off: the balance is -300
        DB::table('project_client_accounts')->update(['guard_on' => 1]);
        $guard = app(\App\Services\Books\ClientMoneyGuard::class);
        $guard->afterPosting($this->voucher([[1, 'D', 100, $h], [2, 'C', 100, $h]]));
        DB::table('vouchers')->where('id', $paid)->update(['status' => 'cancelled']);
        $guard->afterCancelling($paid);
        $this->assertSame([$h => 100.0], $guard->held([$h]));

        $this->assertStringContainsString('app(ClientMoneyGuard::class)->afterPosting($voucher->id)', file_get_contents(app_path('Services/Books/VoucherService.php')), 'Books asks the guard after every voucher it writes');
        $this->assertStringContainsString('app(ClientMoneyGuard::class)->afterCancelling($voucher->id)', file_get_contents(app_path('Services/Books/VoucherService.php')));
    }

    /** A posted voucher with its lines, written straight into the tables. @param array<int, array{0: int, 1: string, 2: float, 3: ?int}> $lines */
    private function voucher(array $lines): int
    {
        $id = DB::table('vouchers')->insertGetId(['status' => 'posted']);
        foreach ($lines as [$ledger, $side, $amount, $holding]) {
            DB::table('voucher_entries')->insert(['voucher_id' => $id, 'ledger_id' => $ledger, 'side' => $side, 'amount' => $amount, 'project_holding_id' => $holding]);
        }

        return $id;
    }
}
