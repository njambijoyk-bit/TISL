<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/** Each person's favourite reports, up to nine, in order (Books -> Reports). */
class ReportFavouritesTest extends TestCase
{
    use Concerns\CreatesBooksLedgerWorld;
    use Concerns\RunsSqlScripts;
    use Concerns\StandsInForAccess;

    private const URL = '/api/admin/reports/favourites';

    protected function setUp(): void
    {
        parent::setUp();
        $this->createBooksLedgerWorld();
        Schema::dropIfExists('report_favourites');
    }

    protected function tearDown(): void
    {
        Schema::dropIfExists('report_favourites');
        Carbon::setTestNow();
        parent::tearDown();
    }

    private function as(int $id, array $permissions = ['books.view']): void
    {
        $u = new User();
        $u->id = $id;
        $this->grant($u, $permissions);
        Sanctum::actingAs($u, ['*']);
    }

    public function test_before_the_script_is_run_the_screen_is_told_to_keep_them_in_the_browser(): void
    {
        $this->as(1);
        $this->getJson(self::URL)->assertOk()->assertExactJson(['ready' => false, 'keys' => []]);
        $this->putJson(self::URL, ['keys' => ['day-book']])->assertStatus(409);
    }

    public function test_a_person_keeps_their_own_ordered_list_and_nobody_elses_changes_it(): void
    {
        $this->runSqlScripts('236_report_favourites.sql');
        $this->as(1);
        $this->putJson(self::URL, ['keys' => ['profit-loss', 'day-book', 'trial-balance']])->assertOk()->assertJsonPath('keys', ['profit-loss', 'day-book', 'trial-balance']);
        $this->as(2);
        $this->getJson(self::URL)->assertOk()->assertJsonPath('keys', []);
        $this->putJson(self::URL, ['keys' => ['balance-sheet']])->assertOk();
        $this->as(1);
        $this->getJson(self::URL)->assertJsonPath('keys', ['profit-loss', 'day-book', 'trial-balance']);
        $this->putJson(self::URL, ['keys' => ['day-book', 'profit-loss']])->assertOk();   // reordered and shortened
        $this->getJson(self::URL)->assertJsonPath('keys', ['day-book', 'profit-loss']);
        $this->assertSame(1, DB::table('report_favourites')->where('user_id', 2)->count());
    }

    public function test_only_known_reports_this_person_may_run_are_kept_once_each_and_at_most_nine(): void
    {
        $this->runSqlScripts('236_report_favourites.sql');
        $this->as(1, ['books.view']);   // no stock.view: the stock reports are not theirs
        $r = $this->putJson(self::URL, ['keys' => ['day-book', 'nonsense', 'stock-summary', 'day-book', 'trial-balance']])->assertOk();
        $this->assertSame(['day-book', 'trial-balance'], $r->json('keys'));
        $many = ['trial-balance', 'profit-loss', 'balance-sheet', 'day-book', 'ledger-statement', 'cash-flow', 'money-flow', 'tax-return', 'withholding', 'ratio-analysis'];
        $this->putJson(self::URL, ['keys' => $many])->assertStatus(422);
        $this->putJson(self::URL, ['keys' => []])->assertOk()->assertJsonPath('keys', []);
    }
}
