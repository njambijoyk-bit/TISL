<?php

namespace Tests\Feature\Concerns;

use App\Models\Menus\Chef;
use App\Models\User;
use App\Services\Menus\MenusSettings;
use App\Services\Menus\PlanNotices;
use App\Services\Menus\RotaNotices;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/** On top of the counter world: users, chefs, the whole rota (shifts, time off, patterns, swaps, open shifts, premiums, overtime, clock places), attendance, employees and leave, with the notices recorded instead of sent. */
trait CreatesRotaWorld
{
    use CreatesCounterWorld;

    /** every notice sent: [method, ...arguments' ids or numbers] */
    private array $told = [];

    protected function createRotaWorld(string $now = '2026-10-12 12:00'): void
    {
        $this->createCounterWorld();
        Carbon::setTestNow($this->now = Carbon::parse($now, 'Africa/Nairobi'));
        if (! Schema::hasTable('users')) {
            Schema::create('users', function ($t) { $t->id(); $t->string('name'); $t->string('email')->nullable(); $t->softDeletes(); $t->timestamps(); });
        }
        if (! Schema::hasColumn('locations', 'latitude')) {
            Schema::table('locations', function ($t) { $t->decimal('latitude', 10, 7)->nullable(); $t->decimal('longitude', 10, 7)->nullable(); });
        }
        Schema::create('menus_chefs', function ($t) { $t->id(); $t->unsignedBigInteger('user_id')->unique(); $t->string('display_name', 80); $t->string('title', 80)->nullable(); $t->text('bio')->nullable(); $t->string('photo')->nullable(); $t->json('station_ids')->nullable();
            $t->boolean('is_instructor')->default(false); $t->boolean('is_public')->default(false); $t->boolean('is_active')->default(true); $t->integer('sort_order')->default(0); $t->string('pay_mode', 10)->default('salary'); $t->decimal('shift_rate', 12, 2)->nullable(); $t->decimal('hour_rate', 12, 2)->nullable(); $t->timestamps(); });
        Schema::create('menus_chef_certs', function ($t) { $t->id(); $t->unsignedBigInteger('chef_id'); $t->string('kind', 20)->default('food_handler'); $t->string('name', 120); $t->string('number', 60)->nullable(); $t->date('issued_on')->nullable(); $t->date('expires_on')->nullable(); $t->dateTime('warned_at')->nullable(); $t->dateTime('expired_told_at')->nullable(); $t->string('notes')->nullable(); $t->timestamps(); });
        Schema::create('menus_shifts', function ($t) { $t->id(); $t->unsignedBigInteger('chef_id'); $t->unsignedBigInteger('location_id'); $t->unsignedBigInteger('station_id')->nullable(); $t->date('shift_date'); $t->time('starts_at'); $t->time('ends_at'); $t->string('status', 10)->default('draft'); $t->string('note', 200)->nullable();
            $t->unsignedBigInteger('pattern_id')->nullable(); $t->dateTime('published_at')->nullable(); $t->dateTime('watch_notified_at')->nullable(); $t->unsignedBigInteger('created_by')->nullable(); $t->timestamps(); });
        Schema::create('menus_days_off', function ($t) { $t->id(); $t->unsignedBigInteger('chef_id'); $t->date('from_date'); $t->date('to_date'); $t->string('kind', 10)->default('off'); $t->string('reason', 300)->nullable(); $t->decimal('charged_days', 5, 1)->nullable(); $t->string('status', 10)->default('requested');
            $t->unsignedBigInteger('requested_by')->nullable(); $t->unsignedBigInteger('decided_by')->nullable(); $t->dateTime('decided_at')->nullable(); $t->string('decision_note', 300)->nullable(); $t->timestamps(); });
        Schema::create('menus_rota_patterns', function ($t) { $t->id(); $t->unsignedBigInteger('chef_id'); $t->unsignedBigInteger('location_id'); $t->unsignedBigInteger('station_id')->nullable(); $t->unsignedTinyInteger('weekday'); $t->time('starts_at'); $t->time('ends_at'); $t->date('valid_from'); $t->date('valid_to')->nullable();
            $t->string('note', 200)->nullable(); $t->boolean('is_active')->default(true); $t->unsignedBigInteger('created_by')->nullable(); $t->timestamps(); });
        Schema::create('menus_swaps', function ($t) { $t->id(); $t->unsignedBigInteger('shift_id'); $t->unsignedBigInteger('from_chef_id'); $t->unsignedBigInteger('to_chef_id'); $t->unsignedBigInteger('return_shift_id')->nullable(); $t->string('note', 300)->nullable(); $t->string('status', 12)->default('asked');
            $t->dateTime('answered_at')->nullable(); $t->unsignedBigInteger('decided_by')->nullable(); $t->dateTime('decided_at')->nullable(); $t->string('decision_note', 300)->nullable(); $t->unsignedBigInteger('requested_by')->nullable(); $t->timestamps(); });
        Schema::create('menus_open_shifts', function ($t) { $t->id(); $t->unsignedBigInteger('location_id'); $t->unsignedBigInteger('station_id')->nullable(); $t->date('shift_date'); $t->time('starts_at'); $t->time('ends_at'); $t->string('note', 200)->nullable(); $t->string('status', 10)->default('open');
            $t->unsignedBigInteger('release_shift_id')->nullable(); $t->unsignedBigInteger('filled_shift_id')->nullable(); $t->unsignedBigInteger('filled_chef_id')->nullable(); $t->unsignedBigInteger('created_by')->nullable(); $t->timestamps(); });
        Schema::create('menus_open_claims', function ($t) { $t->id(); $t->unsignedBigInteger('open_id'); $t->unsignedBigInteger('chef_id'); $t->string('note', 200)->nullable(); $t->string('status', 10)->default('requested'); $t->unsignedBigInteger('decided_by')->nullable(); $t->dateTime('decided_at')->nullable(); $t->timestamps(); $t->unique(['open_id', 'chef_id']); });
        Schema::create('menus_premiums', function ($t) { $t->id(); $t->string('name', 80); $t->string('kind', 8); $t->time('starts_at')->nullable(); $t->time('ends_at')->nullable(); $t->string('weekdays', 20)->nullable(); $t->decimal('extra_pct', 6, 2)->default(0); $t->decimal('flat_per_hour', 12, 2)->default(0); $t->boolean('is_active')->default(true); $t->unsignedBigInteger('created_by')->nullable(); $t->timestamps(); });
        Schema::create('menus_holidays', function ($t) { $t->id(); $t->date('holiday_date'); $t->string('name', 80); $t->unsignedBigInteger('location_id')->nullable(); $t->timestamps(); });
        Schema::create('menus_overtime', function ($t) { $t->id(); $t->unsignedBigInteger('user_id')->nullable(); $t->unsignedBigInteger('chef_id')->nullable(); $t->date('work_date'); $t->integer('minutes'); $t->string('status', 10)->default('pending'); $t->string('note', 300)->nullable(); $t->unsignedBigInteger('decided_by')->nullable(); $t->dateTime('decided_at')->nullable(); $t->timestamps(); $t->unique(['user_id', 'work_date']); });
        Schema::create('menus_clock_sites', function ($t) { $t->id(); $t->unsignedBigInteger('location_id')->unique(); $t->decimal('latitude', 10, 7)->nullable(); $t->decimal('longitude', 10, 7)->nullable(); $t->unsignedSmallInteger('radius_m')->default(150); $t->boolean('is_active')->default(true); $t->text('networks')->nullable(); $t->timestamps(); });
        Schema::create('menus_clock_events', function ($t) { $t->id(); $t->unsignedBigInteger('user_id'); $t->unsignedBigInteger('chef_id')->nullable(); $t->unsignedBigInteger('shift_id')->nullable(); $t->unsignedBigInteger('location_id')->nullable(); $t->string('action', 4); $t->decimal('latitude', 10, 7)->nullable(); $t->decimal('longitude', 10, 7)->nullable();
            $t->integer('accuracy_m')->nullable(); $t->integer('distance_m')->nullable(); $t->string('result', 12); $t->string('method', 8)->nullable(); $t->dateTime('created_at')->nullable(); });
        Schema::create('attendance_settings', function ($t) { $t->id(); $t->string('work_start')->default('08:00:00'); $t->string('work_end')->default('17:00:00'); $t->integer('grace_minutes')->default(15); $t->string('workdays')->default('1,2,3,4,5'); $t->unsignedBigInteger('updated_by')->nullable(); $t->timestamps(); });
        Schema::create('attendance_days', function ($t) { $t->id(); $t->unsignedBigInteger('user_id'); $t->date('work_date'); $t->string('status', 20)->default('present'); $t->dateTime('sign_in_at')->nullable(); $t->dateTime('sign_out_at')->nullable(); $t->string('sign_source', 20)->nullable(); $t->integer('minutes_worked')->default(0);
            $t->integer('overtime_minutes')->default(0); $t->string('note')->nullable(); $t->unsignedBigInteger('marked_by')->nullable(); $t->dateTime('marked_at')->nullable(); $t->string('verify_status', 12)->default('marked'); $t->unsignedBigInteger('verified_by')->nullable(); $t->dateTime('verified_at')->nullable(); $t->string('verify_note')->nullable(); $t->timestamps(); $t->unique(['user_id', 'work_date']); });
        Schema::create('attendance_disputes', function ($t) { $t->id(); $t->timestamps(); });
        Schema::create('attendance_markers', function ($t) { $t->id(); $t->unsignedBigInteger('staff_user_id'); $t->unsignedBigInteger('marker_user_id'); $t->timestamps(); });
        Schema::create('employees', function ($t) { $t->id(); $t->unsignedBigInteger('user_id')->nullable(); $t->date('hire_date')->nullable(); $t->date('termination_date')->nullable(); $t->decimal('base_salary', 14, 2)->default(0); $t->decimal('leave_balance', 6, 1)->default(0); $t->integer('annual_leave_days')->default(21);
            $t->unsignedBigInteger('manager_id')->nullable(); $t->softDeletes(); $t->timestamps(); });
        Schema::create('leave_logs', function ($t) { $t->id(); $t->unsignedBigInteger('employee_id'); $t->string('action', 20); $t->decimal('days', 6, 1); $t->string('reason')->nullable(); $t->decimal('balance_before', 6, 1)->nullable(); $t->decimal('balance_after', 6, 1)->nullable(); $t->unsignedBigInteger('actioned_by')->nullable(); $t->timestamps(); });
        Schema::create('menus_requests', function ($t) { $t->id(); $t->string('number', 20); $t->unsignedBigInteger('chef_id')->nullable(); $t->unsignedSmallInteger('duration_minutes')->nullable(); $t->dateTime('event_at'); $t->string('status', 12)->default('confirmed'); $t->timestamps(); });
        Schema::create('menus_request_lines', function ($t) { $t->id(); $t->unsignedBigInteger('request_id'); $t->timestamps(); });
        MenusSettings::save(['sales_ledger_id' => $this->ledger], null);

        $rn = $this->createMock(RotaNotices::class);
        foreach (['published', 'changed', 'requested', 'decided', 'swapAsked', 'swapAnswered', 'swapNeedsApproval', 'swapDecided', 'notIn', 'planned', 'openPosted', 'claimAsked', 'openFilled', 'overtimeWaiting'] as $m) {
            $rn->method($m)->willReturnCallback(function (...$a) use ($m) { $this->told[] = [$m, ...array_map(fn ($x) => is_object($x) && isset($x->id) ? ($x->id) : (is_string($x) ? $x : (is_int($x) ? $x : null)), $a)]; });
        }
        $this->app->instance(RotaNotices::class, $rn);
    }

    /** A user, with their name. */
    protected function person(string $name, ?string $email = null): User
    {
        return User::forceCreate(['name' => $name, 'email' => $email ?? strtolower(str_replace(' ', '.', $name)).'@example.com']);
    }

    /** A chef (with a user) and, optionally, an employee record with a salary and leave balance. */
    protected function chefOf(string $name, array $o = [], ?array $employee = null): Chef
    {
        $u = $this->person($name);
        $c = Chef::create($o + ['user_id' => $u->id, 'display_name' => $name, 'is_active' => true]);
        if ($employee !== null) {
            DB::table('employees')->insert($employee + ['user_id' => $u->id, 'base_salary' => 0, 'leave_balance' => 0, 'created_at' => now(), 'updated_at' => now()]);
        }

        return $c;
    }

    /** How many notices of a kind were sent. */
    protected function toldCount(string $method): int
    {
        return count(array_filter($this->told, fn ($t) => $t[0] === $method));
    }

    /** A published shift made straight in the table (no checks): for tests that need the world as it stands, not the rules. */
    protected function shiftRow(int $chefId, string $date, string $from = '08:00', string $to = '16:00', string $status = 'published', array $o = []): int
    {
        return DB::table('menus_shifts')->insertGetId($o + ['chef_id' => $chefId, 'location_id' => 1, 'shift_date' => $date, 'starts_at' => $from, 'ends_at' => $to, 'status' => $status, 'created_at' => now(), 'updated_at' => now()]);
    }

    /** An attendance day with a sign-in and sign-out (local times), verified by default. */
    protected function attended(int $userId, string $date, string $in, string $out, array $o = []): int
    {
        $a = Carbon::parse("{$date} {$in}", 'Africa/Nairobi');
        $b = Carbon::parse("{$date} {$out}", 'Africa/Nairobi');
        $worked = (int) $a->diffInMinutes($b);

        return DB::table('attendance_days')->insertGetId($o + ['user_id' => $userId, 'work_date' => $date, 'status' => 'present', 'sign_in_at' => $a, 'sign_out_at' => $b, 'minutes_worked' => $worked, 'overtime_minutes' => max(0, $worked - 540),
            'verify_status' => 'verified', 'created_at' => now(), 'updated_at' => now()]);
    }
}
