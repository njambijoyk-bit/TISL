<?php

namespace Tests\Feature;

use App\Models\User;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/** Projects, build 5.8 (docs/PROJECTS_STAGE5_SPEC.md): the rate card on Books service packages, unbilled time, billing it, write-offs. */
class ProjectsTimeBillingTest extends TestCase
{
    use Concerns\CreatesProjectsWorld;

    private User $kamau;
    private User $njeri;
    private int $project;
    private int $cc;
    private array $posted = [];

    protected function setUp(): void
    {
        parent::setUp();
        Carbon::setTestNow('2026-11-24 10:00:00');
        $this->createProjectsWorld();
        Schema::create('services', function ($t) { $t->id(); $t->string('name'); $t->softDeletes(); });
        Schema::create('service_variants', function ($t) { $t->id(); $t->unsignedBigInteger('service_id'); $t->string('name'); $t->string('status')->nullable(); $t->decimal('price', 14, 2)->nullable(); $t->unsignedBigInteger('price_unit_id')->nullable(); $t->integer('position')->default(0); });
        Schema::create('units_of_measure', function ($t) { $t->id(); $t->string('code'); });
        Schema::create('voucher_types', function ($t) { $t->id(); $t->string('name'); $t->string('base_type'); $t->boolean('is_active')->default(true); });
        Schema::create('vouchers', function ($t) { $t->id(); $t->unsignedBigInteger('voucher_type_id'); $t->string('voucher_number'); $t->string('status')->default('posted'); $t->unsignedBigInteger('cost_centre_id')->nullable(); $t->decimal('total_amount', 14, 2)->default(0); $t->date('date')->nullable(); $t->string('narration')->nullable(); });
        Schema::create('voucher_items', function ($t) { $t->id(); $t->unsignedBigInteger('voucher_id'); $t->boolean('is_header')->default(false); $t->decimal('amount', 14, 2); $t->unsignedBigInteger('ledger_id')->nullable(); });
        Schema::create('voucher_entries', function ($t) { $t->id(); $t->unsignedBigInteger('voucher_id'); $t->unsignedBigInteger('ledger_id'); $t->string('side', 1); $t->decimal('amount', 14, 2); $t->unsignedBigInteger('cost_centre_id')->nullable(); $t->boolean('is_party')->default(false); $t->unsignedBigInteger('project_holding_id')->nullable(); });
        Schema::create('ledger_groups', function ($t) { $t->id(); $t->string('name'); $t->string('nature'); });
        Schema::create('ledgers', function ($t) { $t->id(); $t->string('name'); $t->unsignedBigInteger('group_id'); $t->boolean('is_active')->default(true); $t->unsignedBigInteger('customer_id')->nullable(); });
        DB::table('voucher_types')->insert([['id' => 1, 'name' => 'Sales Invoice', 'base_type' => 'sales'], ['id' => 2, 'name' => 'Journal', 'base_type' => 'journal']]);
        DB::table('units_of_measure')->insert(['id' => 1, 'code' => 'hour']);
        DB::table('services')->insert(['id' => 1, 'name' => 'Professional time']);
        DB::table('service_variants')->insert([['id' => 10, 'service_id' => 1, 'name' => 'Partner hour', 'status' => 'active', 'price' => 25000, 'price_unit_id' => 1], ['id' => 11, 'service_id' => 1, 'name' => 'Associate hour', 'status' => 'active', 'price' => 12000, 'price_unit_id' => 1],
            ['id' => 12, 'service_id' => 1, 'name' => 'Partner hour, Imara rate', 'status' => 'active', 'price' => 20000, 'price_unit_id' => 1]]);
        $posted = &$this->posted;
        $this->app->instance(\App\Services\Projects\ProjectVoucherPoster::class, new class($posted) extends \App\Services\Projects\ProjectVoucherPoster {
            public function __construct(private array &$posted) {}

            public function sales(string $date, int $customerId, array $lines, ?int $costCentreId, string $narration, ?string $reference, \App\Models\User $by): array
            {
                $id = DB::table('vouchers')->insertGetId(['voucher_type_id' => 1, 'voucher_number' => 'INV-' . (count($this->posted) + 1), 'cost_centre_id' => $costCentreId]);
                $this->posted[] = compact('lines', 'narration', 'costCentreId');

                return ['id' => $id, 'number' => 'INV-' . count($this->posted)];
            }
        });
        $this->kamau = $this->staff('Kamau', ['projects.use', 'projects.create', 'projects.time.log', 'projects.time.approve', 'projects.money.view', 'projects.money.bill', 'projects.money.rates', 'projects.money.writeoff', 'books.post']);
        $this->njeri = $this->staff('Njeri', ['projects.use', 'projects.time.log']);
        Sanctum::actingAs($this->kamau, ['*']);
        $this->project = (int) $this->postJson('/api/admin/projects', ['type_id' => DB::table('project_types')->where('industry_key', 'general')->value('id'), 'title' => 'Imara v Baraka', 'customer_id' => 1])->json('project.id');
        $this->cc = (int) DB::table('projects')->where('id', $this->project)->value('cost_centre_id');
        DB::table('project_members')->insert(['project_id' => $this->project, 'user_id' => $this->njeri->id, 'project_role_id' => DB::table('project_roles')->where('key', 'member')->value('id'), 'status' => 'active', 'created_at' => now(), 'updated_at' => now()]);
        app(\App\Services\Projects\ProjectSettings::class)->save('money', ['bill_mode' => 'post'], $this->kamau);
    }

    /** An approved entry. */
    private function time(User $who, string $day, int $minutes, bool $billable = true): int
    {
        return DB::table('project_time')->insertGetId(['user_id' => $who->id, 'project_id' => $this->project, 'work_date' => $day, 'minutes' => $minutes, 'billable' => $billable ? 1 : 0, 'state' => 'approved', 'created_at' => now()]);
    }

    private function unbilled(array $q = []): array
    {
        return $this->getJson("/api/admin/projects/{$this->project}/time-billing?" . http_build_query($q))->assertOk()->json();
    }

    public function test_the_most_specific_rate_wins_on_the_day_and_prices_come_from_books(): void
    {
        $this->postJson('/api/admin/projects/rates', ['service_variant_id' => 11])->assertCreated();   // everyone, company
        $this->postJson('/api/admin/projects/rates', ['service_variant_id' => 10, 'user_id' => $this->kamau->id])->assertCreated();
        $this->postJson("/api/admin/projects/{$this->project}/rates", ['service_variant_id' => 12, 'user_id' => $this->kamau->id, 'valid_from' => '2026-11-20'])->assertCreated();
        $this->postJson('/api/admin/projects/rates', ['service_variant_id' => 99])->assertStatus(422)->assertJson(['message' => 'Choose a service package from Books.']);
        $this->time($this->kamau, '2026-11-18', 120);   // before the client rate starts: his own Partner hour
        $this->time($this->kamau, '2026-11-21', 90);    // the client rate on this work
        $this->time($this->njeri, '2026-11-21', 150);   // everyone: Associate hour
        $this->time($this->njeri, '2026-11-21', 60, false);   // not billable: not here

        $u = $this->unbilled();
        $by = collect($u['groups'])->mapWithKeys(fn ($g) => ["{$g['person']} {$g['package']['name']}" => [$g['hours'], $g['amount']]])->all();
        $this->assertSame(['Kamau Partner hour' => [2, 50000], 'Kamau Partner hour, Imara rate' => [1.5, 30000], 'Njeri Associate hour' => [2.5, 30000]], $by);
        $this->assertSame([6, 110000], [$u['hours'], $u['amount']]);
        $this->assertFalse(Schema::hasColumn('project_rates', 'price'), 'no price is kept in Projects');

        DB::table('service_variants')->where('id', 11)->update(['price' => 13000]);
        $this->assertSame(32500, collect($this->unbilled()['groups'])->firstWhere('person', 'Njeri')['amount'], 'Books\' price as it is now');
        $this->assertSame(['Partner hour, Imara rate', 'Kamau'], [$this->getJson("/api/admin/projects/{$this->project}/rates")->json('rates.0.package.name'), $this->getJson("/api/admin/projects/{$this->project}/rates")->json('rates.0.who')]);
    }

    public function test_billing_time_posts_one_service_line_per_package_marks_the_time_and_a_cancelled_bill_frees_it(): void
    {
        $this->postJson('/api/admin/projects/rates', ['service_variant_id' => 11])->assertCreated();
        $this->postJson('/api/admin/projects/rates', ['service_variant_id' => 10, 'user_id' => $this->kamau->id])->assertCreated();
        $a = $this->time($this->kamau, '2026-11-18', 120);
        $b = $this->time($this->njeri, '2026-11-19', 150);
        $late = $this->time($this->njeri, '2026-11-23', 60);

        $r = $this->postJson("/api/admin/projects/{$this->project}/time-billing", ['up_to' => '2026-11-22'])->assertCreated()->json();
        $this->assertSame(['post', 'INV-1'], [$r['mode'], $r['voucher']['number']]);
        $lines = $this->posted[0]['lines'];
        $this->assertSame([['service', 10, 2.0], ['service', 11, 2.5]], array_map(fn ($l) => [$l['type'], $l['service_variant_id'], $l['quantity']], $lines));
        $this->assertArrayNotHasKey('rate', $lines[0], 'Books prices it');
        $this->assertSame($this->cc, $this->posted[0]['costCentreId']);
        $this->assertSame([$r['voucher']['id'], $r['voucher']['id'], null], [(int) DB::table('project_time')->where('id', $a)->value('billed_voucher_id'), (int) DB::table('project_time')->where('id', $b)->value('billed_voucher_id'), DB::table('project_time')->where('id', $late)->value('billed_voucher_id')]);
        $this->assertSame(10, (int) DB::table('project_time')->where('id', $a)->value('rate_package_id'));
        $this->assertSame([1], array_map(fn ($g) => $g['hours'], $this->unbilled()['groups']), 'only the later hour is left');
        $this->assertSame('time', DB::table('project_billing_stages')->where('voucher_id', $r['voucher']['id'])->value('kind'));
        $this->assertSame([], $this->getJson("/api/admin/projects/{$this->project}/billing")->json('billing.stages'), 'a time bill is not part of the billing plan');

        DB::table('vouchers')->where('id', $r['voucher']['id'])->update(['status' => 'cancelled']);
        $this->assertSame(5.5, $this->unbilled()['hours'], 'a cancelled bill frees its time: 2 + 2.5 + the later hour');
    }

    public function test_time_without_a_rate_is_refused_and_a_drafted_time_bill_opens_books_filled_in_and_can_be_dropped(): void
    {
        $a = $this->time($this->njeri, '2026-11-19', 150);
        $this->postJson("/api/admin/projects/{$this->project}/time-billing")->assertStatus(422)->assertJson(['message' => 'No rate covers the time of Njeri. Add them to the rate card first.']);
        $this->assertSame(['Njeri'], $this->unbilled()['no_rate']);
        $this->postJson('/api/admin/projects/rates', ['service_variant_id' => 11])->assertCreated();

        app(\App\Services\Projects\ProjectSettings::class)->save('money', ['bill_mode' => 'draft'], $this->kamau);
        $r = $this->postJson("/api/admin/projects/{$this->project}/time-billing")->assertOk()->json();
        $this->assertSame(['draft', 1, 'service', 11, 1, 2.5], [$r['mode'], $r['form']['voucher_type_id'], $r['form']['lines'][0]['type'], $r['form']['lines'][0]['service_variant_id'], $r['form']['lines'][0]['service_id'], $r['form']['lines'][0]['quantity']]);
        $this->assertSame([], $this->posted, 'nothing is posted from here');
        $this->assertSame(0.0, (float) $this->unbilled()['hours'], 'held by the drafted bill');
        $this->assertSame([['id' => $r['stage_id'], 'name' => 'Time to 24 Nov 2026', 'entries' => 1, 'voucher_type_id' => 1]], $this->unbilled()['drafts']);
        $this->assertSame(2.5, $this->getJson("/api/admin/projects/billing-stages/{$r['stage_id']}/form")->assertOk()->json('bill.lines.0.quantity'));

        $this->deleteJson("/api/admin/projects/{$this->project}/time-billing/{$r['stage_id']}")->assertOk();
        $this->assertSame([2.5, []], [$this->unbilled()['hours'], $this->unbilled()['drafts']]);

        // drafted again, and saved on the Books form: the time is billed
        $r = $this->postJson("/api/admin/projects/{$this->project}/time-billing")->assertOk()->json();
        $inv = DB::table('vouchers')->insertGetId(['voucher_type_id' => 1, 'voucher_number' => 'INV-77', 'cost_centre_id' => $this->cc]);
        app(\App\Services\Projects\ProjectBilling::class)->tie($r['stage_id'], $inv, $this->cc, $this->kamau);
        $this->assertSame($inv, (int) DB::table('project_time')->where('id', $a)->value('billed_voucher_id'));
        $this->deleteJson("/api/admin/projects/{$this->project}/time-billing/{$r['stage_id']}")->assertStatus(422);
    }

    public function test_writing_off_time_follows_the_rules_and_leaves_it_marked(): void
    {
        $this->postJson('/api/admin/projects/rates', ['service_variant_id' => 11])->assertCreated();
        $a = $this->time($this->njeri, '2026-11-19', 150);
        $this->postJson("/api/admin/projects/time/{$a}/write-off", ['minutes' => 60, 'reason' => ''])->assertStatus(422)->assertJson(['message' => 'Say why it is written off.']);
        $this->postJson("/api/admin/projects/time/{$a}/write-off", ['minutes' => 200, 'reason' => 'x'])->assertStatus(422);
        $this->postJson("/api/admin/projects/time/{$a}/write-off", ['minutes' => 60, 'reason' => 'Research took longer than it should'])->assertOk()->assertJsonPath('hours', 1.5);
        $this->assertSame([60, 'Research took longer than it should'], [(int) DB::table('project_time')->where('id', $a)->value('written_off_minutes'), DB::table('project_time')->where('id', $a)->value('write_off_reason')]);

        app(\App\Services\Projects\ProjectSettings::class)->save('serious', array_merge(\App\Services\Projects\ProjectSerious::defaults(), ['time.writeoff' => ['needs' => 'supervisor', 'on_project' => false, 'reason' => false]]), $this->kamau);
        $this->postJson("/api/admin/projects/time/{$a}/write-off", ['minutes' => 90, 'reason' => 'More'])->assertStatus(428)->assertJsonPath('serious.action', 'time.writeoff');
        app(\App\Services\Projects\ProjectSettings::class)->save('serious', \App\Services\Projects\ProjectSerious::defaults(), $this->kamau);

        $this->postJson("/api/admin/projects/{$this->project}/time-billing")->assertCreated();
        $this->assertSame(1.5, $this->posted[0]['lines'][0]['quantity'], 'written-off minutes are not billed');
        $this->postJson("/api/admin/projects/time/{$a}/write-off", ['minutes' => 0])->assertStatus(422)->assertJson(['message' => 'This time is on a bill. Credit it in Books instead.']);

        $this->grant($this->kamau, ['admin.access', 'projects.use', 'projects.money.view']);
        $this->postJson("/api/admin/projects/time/{$a}/write-off", ['minutes' => 10, 'reason' => 'x'])->assertForbidden();
        $this->postJson("/api/admin/projects/{$this->project}/time-billing")->assertForbidden();
        $this->postJson('/api/admin/projects/rates', ['service_variant_id' => 11])->assertForbidden();
    }
}
