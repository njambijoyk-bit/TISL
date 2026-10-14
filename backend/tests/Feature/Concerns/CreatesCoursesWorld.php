<?php

namespace Tests\Feature\Concerns;

use App\Models\Books\Voucher;
use App\Models\Courses\Fee;
use App\Models\Courses\Lesson;
use App\Models\Courses\Offering;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Storage;

/**
 * The Courses tests' world: the memberships world (people, branches, the books and gateway stood in for, notices recorded, licence on) plus every Courses table exactly as scripts 152 to 161
 * make it, a few stock items, and a fake private disk. Who may do what is decided by the test (StandsInForAccess).
 */
trait CreatesCoursesWorld
{
    use CreatesMembershipWorld;
    use RunsSqlScripts;
    use StandsInForAccess;

    protected function createCoursesWorld(): void
    {
        $this->createMembershipWorld();
        $this->runSqlScripts('152_courses.sql', '153_courses_fees.sql', '155_courses_learning.sql', '156_courses_books.sql', '157_courses_attendance.sql', '158_courses_quizzes.sql', '159_courses_certificates.sql',
            '160_courses_teaching.sql', '161_courses_recipes_kits.sql', '166_memberships_credits.sql');
        Schema::create('products', function ($t) { $t->id(); $t->string('name'); $t->softDeletes(); $t->timestamps(); });
        Schema::create('product_variants', function ($t) { $t->id(); $t->unsignedBigInteger('product_id'); $t->string('name')->nullable(); $t->string('sku')->nullable(); $t->softDeletes(); $t->timestamps(); });
        DB::table('products')->insert([['id' => 1, 'name' => 'Bread flour 2kg'], ['id' => 2, 'name' => 'Apron'], ['id' => 3, 'name' => 'The Bread Book (printed)']]);
        DB::table('product_variants')->insert([['id' => 11, 'product_id' => 1, 'sku' => 'FLR-2'], ['id' => 12, 'product_id' => 2, 'sku' => 'APR'], ['id' => 13, 'product_id' => 3, 'sku' => 'BK-1']]);
        Storage::fake('local');
        $this->standInAccess();
    }

    /** The lines an invoice's order was placed with (whatever module made it). */
    private function linesOf(Voucher $inv): array
    {
        foreach ($this->placed as $p) {
            if (($p['meta'] ?? null) == $inv->meta) {
                return $p['lines'];
            }
        }

        return [];
    }

    protected function offering(array $o = []): Offering
    {
        static $n = 0;
        $n++;

        return Offering::forceCreate($o + ['kind' => 'course', 'title' => 'Bread '.$n, 'slug' => 'bread-'.$n, 'status' => 'published', 'delivery' => 'online', 'skill_level' => 'all'])->fresh();
    }

    protected function lesson(Offering $o, array $l = []): Lesson
    {
        static $n = 0;
        $n++;

        return Lesson::forceCreate($l + ['offering_id' => $o->id, 'kind' => 'text', 'title' => 'Lesson '.$n, 'body' => 'Read this', 'sort_order' => $n * 10, 'is_required' => true])->fresh();
    }

    protected function fee(Offering $o, array $f = []): Fee
    {
        return Fee::forceCreate($f + ['offering_id' => $o->id, 'kind' => 'tuition', 'name' => 'Tuition', 'ledger_id' => $this->serviceLedger, 'amount' => 1000, 'is_optional' => false, 'once_per_student' => false, 'refundable' => true, 'is_active' => true])->fresh();
    }

    protected function staff(string $name, array $perms): User
    {
        $u = $this->person($name, false);
        $this->grant($u, $perms);

        return $u;
    }
}
