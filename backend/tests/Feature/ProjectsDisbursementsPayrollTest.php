<?php

namespace Tests\Feature;

use App\Models\User;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/** Projects, build 5.9 (docs/PROJECTS_STAGE5_SPEC.md): costs billed back to the client, and splitting pay by timesheets. */
class ProjectsDisbursementsPayrollTest extends TestCase
{
    use Concerns\CreatesProjectsWorld;

    private User $kamau;
    private int $project;
    private int $cc;
    private array $posted = [];

    protected function setUp(): void
    {
        parent::setUp();
        Carbon::setTestNow('2026-11-24 10:00:00');
        $this->createProjectsWorld();
        Schema::create('voucher_types', function ($t) { $t->id(); $t->string('name'); $t->string('base_type'); $t->boolean('is_active')->default(true); });
        Schema::create('vouchers', function ($t) { $t->id(); $t->unsignedBigInteger('voucher_type_id'); $t->string('voucher_number'); $t->string('status')->default('posted'); $t->unsignedBigInteger('cost_centre_id')->nullable(); $t->decimal('total_amount', 14, 2)->default(0); $t->date('date')->nullable(); $t->string('narration')->nullable(); });
        Schema::create('voucher_items', function ($t) { $t->id(); $t->unsignedBigInteger('voucher_id'); $t->boolean('is_header')->default(false); $t->decimal('amount', 14, 2); $t->unsignedBigInteger('ledger_id')->nullable(); });
        Schema::create('voucher_entries', function ($t) { $t->id(); $t->unsignedBigInteger('voucher_id'); $t->unsignedBigInteger('ledger_id'); $t->string('side', 1); $t->decimal('amount', 14, 2); $t->unsignedBigInteger('cost_centre_id')->nullable(); $t->boolean('is_party')->default(false); $t->unsignedBigInteger('project_holding_id')->nullable(); });
        Schema::create('ledger_groups', function ($t) { $t->id(); $t->string('name'); $t->string('nature'); });
        Schema::create('ledgers', function ($t) { $t->id(); $t->string('name'); $t->unsignedBigInteger('group_id'); $t->boolean('is_active')->default(true); $t->unsignedBigInteger('customer_id')->nullable(); });
        Schema::create('attendance_days', function ($t) { $t->id(); $t->unsignedBigInteger('user_id'); $t->date('work_date'); $t->string('status')->default('present'); $t->integer('minutes_worked')->default(0); });
        DB::table('voucher_types')->insert([['id' => 1, 'name' => 'Sales Invoice', 'base_type' => 'sales'], ['id' => 3, 'name' => 'Payment', 'base_type' => 'payment']]);
        DB::table('ledger_groups')->insert([['id' => 1, 'name' => 'Direct Expenses', 'nature' => 'expense'], ['id' => 2, 'name' => 'Bank Accounts', 'nature' => 'asset'], ['id' => 3, 'name' => 'Other Income', 'nature' => 'income']]);
        DB::table('ledgers')->insert([['id' => 1, 'name' => 'Court fees', 'group_id' => 1], ['id' => 2, 'name' => 'KCB Main', 'group_id' => 2], ['id' => 3, 'name' => 'Disbursements recovered', 'group_id' => 3], ['id' => 4, 'name' => 'Travel', 'group_id' => 1]]);
        $posted = &$this->posted;
        $this->app->instance(\App\Services\Projects\ProjectVoucherPoster::class, new class($posted) extends \App\Services\Projects\ProjectVoucherPoster {
            public function __construct(private array &$posted) {}

            public function sales(string $date, int $customerId, array $lines, ?int $costCentreId, string $narration, ?string $reference, \App\Models\User $by): array
            {
                $id = DB::table('vouchers')->insertGetId(['voucher_type_id' => 1, 'voucher_number' => 'INV-' . (count($this->posted) + 1), 'cost_centre_id' => $costCentreId]);
                $this->posted[] = compact('lines', 'narration');

                return ['id' => $id, 'number' => 'INV-' . count($this->posted)];
            }
        });
        $this->kamau = $this->staff('Kamau', ['projects.use', 'projects.create', 'projects.phases', 'projects.money.view', 'projects.money.bill', 'projects.money.disbursements', 'projects.money.writeoff', 'books.post']);
        Sanctum::actingAs($this->kamau, ['*']);
        $this->project = (int) $this->postJson('/api/admin/projects', ['type_id' => DB::table('project_types')->where('industry_key', 'general')->value('id'), 'title' => 'Imara v Baraka', 'customer_id' => 1])->json('project.id');
        $this->cc = (int) DB::table('projects')->where('id', $this->project)->value('cost_centre_id');
        app(\App\Services\Projects\ProjectSettings::class)->save('money', ['bill_mode' => 'post'], $this->kamau);
    }

    /** A posted payment for a cost on a cost centre: debit the expense, credit the bank. @return int the expense line */
    private function cost(int $ledger, float $amount, ?int $cc, string $narration): int
    {
        $v = DB::table('vouchers')->insertGetId(['voucher_type_id' => 3, 'voucher_number' => 'PV-' . random_int(100, 999), 'status' => 'posted', 'cost_centre_id' => $cc, 'date' => '2026-11-15', 'narration' => $narration]);
        $line = DB::table('voucher_entries')->insertGetId(['voucher_id' => $v, 'ledger_id' => $ledger, 'side' => 'D', 'amount' => $amount, 'cost_centre_id' => $cc]);
        DB::table('voucher_entries')->insert(['voucher_id' => $v, 'ledger_id' => 2, 'side' => 'C', 'amount' => $amount]);

        return $line;
    }

    public function test_costs_on_the_work_are_marked_to_bill_back_and_go_on_the_next_bill_at_the_amount_books_has(): void
    {
        $fee = $this->cost(1, 3500, $this->cc, 'Court filing fee');
        $taxi = $this->cost(4, 1200, $this->cc, 'Taxi to court');
        $this->cost(4, 9000, null, 'Someone else\'s travel');
        $l = $this->getJson("/api/admin/projects/{$this->project}/disbursements")->assertOk()->json();
        $this->assertSame([['Court filing fee', 3500, 'not_marked'], ['Taxi to court', 1200, 'not_marked']], collect($l['lines'])->sortBy('narration')->map(fn ($x) => [$x['narration'], $x['amount'], $x['state']])->values()->all(), 'only this work\'s costs');

        $p = "/api/admin/projects/{$this->project}/disbursements";
        $this->putJson("{$p}/{$fee}", ['on' => true])->assertOk();
        $this->putJson("{$p}/{$taxi}", ['on' => true])->assertOk();
        $this->putJson("{$p}/99999", ['on' => true])->assertStatus(422);
        $this->putJson("{$p}/{$taxi}", ['write_off' => true, 'reason' => ''])->assertStatus(422);
        $this->putJson("{$p}/{$taxi}", ['write_off' => true, 'reason' => 'Agreed not to charge travel'])->assertOk();
        app(\App\Services\Projects\ProjectSettings::class)->save('work', ['disbursement_ledger_id' => 3], $this->kamau);

        $this->postJson("/api/admin/projects/{$this->project}/time-billing")->assertCreated();
        $line = $this->posted[0]['lines'][0];
        $this->assertSame(['custom', 3500.0, 3], [$line['type'], $line['rate'], $line['ledger_id']], 'at Books\' amount, to "Disbursements recovered"');
        $this->assertStringContainsString('Disbursement: Court filing fee (PV-', $line['description']);
        $this->assertCount(1, $this->posted[0]['lines'], 'the written-off taxi is not billed');
        $states = collect($this->getJson($p)->json('lines'))->pluck('state', 'narration')->all();
        $this->assertSame(['billed', 'written_off'], [$states['Court filing fee'], $states['Taxi to court']]);
        $this->putJson("{$p}/{$fee}", ['on' => false])->assertStatus(422)->assertJson(['message' => 'This cost is on a bill. Cancel or drop the bill first.']);
    }

    public function test_with_the_setting_off_pay_splits_as_usual_and_with_it_on_approved_time_takes_its_share_against_attendance(): void
    {
        $split = app(\App\Services\Projects\ProjectPayrollSplit::class);
        $usual = [[1, 100.0, 1]];   // all to the Nairobi branch
        $this->postJson("/api/admin/projects/{$this->project}/phases", ['name' => 'Trial', 'own_cost_centre' => true])->assertCreated();
        $phase = DB::table('project_phases')->first();
        DB::table('attendance_days')->insert(['user_id' => $this->kamau->id, 'work_date' => '2026-11-10', 'minutes_worked' => 9600]);   // 160 hours this month
        DB::table('project_time')->insert([
            ['user_id' => $this->kamau->id, 'project_id' => $this->project, 'phase_id' => null, 'work_date' => '2026-11-11', 'minutes' => 2400, 'state' => 'approved', 'created_at' => now()],   // 40 hours on the work
            ['user_id' => $this->kamau->id, 'project_id' => $this->project, 'phase_id' => $phase->id, 'work_date' => '2026-11-12', 'minutes' => 960, 'state' => 'approved', 'created_at' => now()],   // 16 on its phase's own cost centre
            ['user_id' => $this->kamau->id, 'project_id' => $this->project, 'phase_id' => null, 'work_date' => '2026-11-13', 'minutes' => 600, 'state' => 'submitted', 'created_at' => now()],   // not approved: not counted
        ]);

        $this->assertNull($split->adjust($this->kamau->id, '2026-11-01', '2026-11-30', $usual), 'off out of the box');
        app(\App\Services\Projects\ProjectSettings::class)->save('work', ['payroll_split' => true], $this->kamau);
        $got = $split->adjust($this->kamau->id, '2026-11-01', '2026-11-30', $usual);
        $by = collect($got)->mapWithKeys(fn ($x) => [$x[0] => $x[1]])->all();
        $this->assertSame([$this->cc => 25.0, (int) $phase->cost_centre_id => 10.0, 1 => 65.0], $by, '40 of 160 hours, 16 of 160, and the rest as usual');
        $this->assertSame(100.0, round(array_sum($by), 4));

        $this->assertNull($split->adjust($this->kamau->id, '2026-10-01', '2026-10-31', $usual), 'no time that month: the usual split');
        DB::table('attendance_days')->delete();
        $this->assertNull($split->adjust($this->kamau->id, '2026-11-01', '2026-11-30', $usual), 'nothing in Attendance: the usual split');

        // more time than worked: the work takes all of it, in proportion
        DB::table('attendance_days')->insert(['user_id' => $this->kamau->id, 'work_date' => '2026-11-10', 'minutes_worked' => 1680]);   // 28 hours
        $by = collect($split->adjust($this->kamau->id, '2026-11-01', '2026-11-30', $usual))->mapWithKeys(fn ($x) => [$x[0] => $x[1]])->all();
        $this->assertEqualsWithDelta([$this->cc => 71.4286, (int) $phase->cost_centre_id => 28.5714], $by, 0.001);
        $this->assertStringContainsString('ProjectPayrollSplit::class)->adjust((int) $userId, $fromDate, $onDate, $splits[$userId])', file_get_contents(app_path('Services/Payroll/PayrollService.php')));
    }
}
