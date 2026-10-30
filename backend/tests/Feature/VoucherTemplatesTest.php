<?php

namespace Tests\Feature;

use App\Models\Books\Ledger;
use App\Models\User;
use App\Services\Books\Engine\LedgerBalances;
use App\Services\Books\VoucherTemplateService;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/** Voucher templates: saved shapes that repeat on a schedule by leaving drafts, never by posting. */
class VoucherTemplatesTest extends TestCase
{
    use Concerns\CreatesBooksLedgerWorld;
    use Concerns\StandsInForAccess;

    protected function setUp(): void
    {
        parent::setUp();
        $this->createBooksLedgerWorld();
        Schema::dropIfExists('voucher_template_drafts');
        Schema::dropIfExists('voucher_templates');
        Schema::create('voucher_templates', function ($t) {
            $t->id(); $t->string('name')->unique(); $t->string('category')->nullable(); $t->string('form')->default('voucher'); $t->unsignedBigInteger('voucher_type_id')->nullable(); $t->string('base_type')->nullable();
            $t->json('form_state')->nullable(); $t->string('repeat_every')->default('none'); $t->unsignedSmallInteger('repeat_day')->nullable(); $t->date('next_due_on')->nullable(); $t->date('last_made_on')->nullable();
            $t->boolean('is_active')->default(true); $t->boolean('is_starter')->default(false); $t->unsignedBigInteger('created_by')->nullable(); $t->timestamps();
        });
        Schema::create('voucher_template_drafts', function ($t) {
            $t->id(); $t->unsignedBigInteger('template_id'); $t->date('due_on'); $t->json('form_state')->nullable(); $t->string('status')->default('pending'); $t->unsignedBigInteger('handled_by')->nullable(); $t->timestamp('handled_at')->nullable(); $t->timestamps();
            $t->unique(['template_id', 'due_on']);
        });
        $u = new User();
        $u->id = 41;
        $this->grant($u, ['books.view', 'books.post']);
        Sanctum::actingAs($u, ['*']);
    }

    protected function tearDown(): void
    {
        Schema::dropIfExists('voucher_template_drafts');
        Schema::dropIfExists('voucher_templates');
        Carbon::setTestNow();
        LedgerBalances::forget();
        parent::tearDown();
    }

    public function test_the_next_due_date_follows_the_repeat_and_stays_inside_short_months(): void
    {
        $d = fn (string $s) => Carbon::parse($s);
        $this->assertSame('2026-11-05', VoucherTemplateService::nextDue($d('2026-10-05'), 'monthly', 5)->toDateString());
        $this->assertSame('2026-02-28', VoucherTemplateService::nextDue($d('2026-01-31'), 'monthly', 31)->toDateString(), 'the 31st falls on the last day of February');
        $this->assertSame('2027-01-15', VoucherTemplateService::nextDue($d('2026-10-15'), 'quarterly', 15)->toDateString());
        $this->assertSame('2027-03-01', VoucherTemplateService::nextDue($d('2026-03-01'), 'yearly', 1)->toDateString());
        $this->assertSame('2026-11-04', VoucherTemplateService::nextDue($d('2026-10-28'), 'weekly', 3)->toDateString(), 'the Wednesday of the next week');
        $this->assertNull(VoucherTemplateService::nextDue($d('2026-10-28'), 'none', null));
        $this->assertSame('2026-11-01', VoucherTemplateService::firstDue($d('2026-10-30'), 'monthly', 1)->toDateString(), 'this month\'s 1st has gone: next month');
        $this->assertSame('2026-10-31', VoucherTemplateService::firstDue($d('2026-10-30'), 'monthly', 31)->toDateString(), 'still ahead this month');
    }

    public function test_a_template_is_saved_and_a_due_one_leaves_a_draft_and_moves_on_without_posting(): void
    {
        Carbon::setTestNow('2026-10-30 07:00:00');
        $svc = app(VoucherTemplateService::class);
        $vouchersBefore = DB::table('vouchers')->count();
        $t = $svc->save(['name' => 'Pay rent', 'category' => 'Premises', 'form_state' => ['h' => ['narration' => 'Rent'], 'entries' => []], 'repeat_every' => 'monthly', 'repeat_day' => 1], null);
        $this->assertSame('2026-11-01', $t['next_due_on']);
        $this->assertSame(0, $svc->makeDue(), 'not due yet');

        Carbon::setTestNow('2026-11-01 06:00:00');
        $this->assertSame(1, $svc->makeDue());
        $drafts = $svc->drafts();
        $this->assertCount(1, $drafts);
        $this->assertSame('2026-11-01', $drafts[0]['due_on']);
        $this->assertSame('Rent', $drafts[0]['form_state']['h']['narration']);
        $this->assertSame('2026-12-01', DB::table('voucher_templates')->value('next_due_on'));
        $this->assertSame($vouchersBefore, DB::table('vouchers')->count(), 'a draft is not a voucher');
        $this->assertSame(0, $svc->makeDue(), 'the same day twice makes nothing more');

        Carbon::setTestNow('2027-03-10 06:00:00');   // months missed: one draft, for the latest date due
        $this->assertSame(1, $svc->makeDue());
        $this->assertSame('2027-03-01', collect($svc->drafts())->last()['due_on']);
        $this->assertSame('2027-04-01', DB::table('voucher_templates')->value('next_due_on'));
    }

    public function test_a_paused_or_one_off_template_never_leaves_drafts_and_names_are_unique(): void
    {
        Carbon::setTestNow('2026-10-30 07:00:00');
        $svc = app(VoucherTemplateService::class);
        $svc->save(['name' => 'Paused', 'repeat_every' => 'weekly', 'repeat_day' => 1, 'is_active' => false], null);
        $svc->save(['name' => 'Once', 'repeat_every' => 'none'], null);
        Carbon::setTestNow('2026-12-30 07:00:00');
        $this->assertSame(0, $svc->makeDue());
        $this->expectException(\Illuminate\Validation\ValidationException::class);
        $svc->save(['name' => 'Once'], null);
    }

    public function test_the_starter_set_is_added_once_with_the_ledgers_that_are_in_the_chart(): void
    {
        $svc = app(VoucherTemplateService::class);
        $first = $svc->addStarters(null);
        $this->assertContains('Pay rent', $first);
        $this->assertCount(11, $first);
        $this->assertSame([], $svc->addStarters(null), 'nothing added twice');
        $rent = collect($svc->all())->firstWhere('name', 'Pay rent');
        $this->assertSame('D', $rent['form_state']['entries'][0]['side']);
        $this->assertSame((int) Ledger::where('name', 'Rent')->value('id'), (int) $rent['form_state']['entries'][0]['ledger_id'], 'the chart has a Rent ledger');
        $water = collect($svc->all())->firstWhere('name', 'Pay water');
        $this->assertSame('', (string) $water['form_state']['entries'][0]['ledger_id'], 'no water ledger in this chart: left for the person to pick');
        $this->assertSame((int) Ledger::where('name', 'Cash')->value('id'), (int) $rent['form_state']['entries'][1]['ledger_id'], 'Cash is in the chart');
    }

    public function test_the_routes_need_the_right_permission_and_a_draft_can_be_skipped(): void
    {
        $this->postJson('/api/admin/books/voucher-templates', ['name' => 'Water', 'repeat_every' => 'monthly', 'repeat_day' => 5, 'form_state' => ['h' => []]])->assertCreated();
        $id = (int) DB::table('voucher_templates')->value('id');
        $this->postJson("/api/admin/books/voucher-templates/{$id}/draft-now")->assertCreated()->assertJsonCount(1, 'drafts');
        $draft = (int) DB::table('voucher_template_drafts')->value('id');
        $this->postJson("/api/admin/books/voucher-drafts/{$draft}", ['status' => 'skipped'])->assertOk()->assertJsonCount(0, 'drafts');
        $this->getJson('/api/admin/books/voucher-templates')->assertOk()->assertJsonPath('ready', true)->assertJsonCount(1, 'templates');
        $this->deleteJson("/api/admin/books/voucher-templates/{$id}")->assertOk();
        $this->assertSame(0, DB::table('voucher_template_drafts')->count());

        $v = new User();
        $v->id = 42;
        $this->grant($v, ['books.view']);
        Sanctum::actingAs($v, ['*']);
        $this->getJson('/api/admin/books/voucher-templates')->assertOk();
        $this->postJson('/api/admin/books/voucher-templates', ['name' => 'X'])->assertForbidden();
    }
}
