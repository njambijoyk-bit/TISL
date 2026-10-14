<?php

namespace Tests\Feature;

use App\Models\Courses\Enrolment;
use App\Models\Courses\KitHandout;
use App\Models\Courses\Lesson;
use App\Models\Courses\Offering;
use App\Models\Courses\RecipeSource;
use App\Services\Books\BooksException;
use App\Services\Courses\Curriculum;
use App\Services\Courses\KitService;
use App\Services\Courses\RecipePublisher;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/** Courses step 10: recipes copied from Menus as text, and cooking kits handed out from stock. "Now" is Monday 12 Oct 2026, 12:00. */
class CoursesRecipesKitsTest extends TestCase
{
    use Concerns\CreatesCoursesWorld;

    protected function setUp(): void
    {
        parent::setUp();
        $this->createCoursesWorld();
        Schema::create('recipes', function ($t) { $t->id(); $t->unsignedBigInteger('variant_id'); $t->decimal('yield_qty', 12, 4)->default(0); $t->boolean('deduct_on_sale')->default(false); $t->string('note')->nullable(); $t->boolean('is_active')->default(true); $t->string('visibility')->default('internal'); $t->integer('prep_minutes')->nullable(); $t->integer('cook_minutes')->nullable(); $t->timestamps(); });
        Schema::create('recipe_items', function ($t) { $t->id(); $t->unsignedBigInteger('recipe_id'); $t->unsignedBigInteger('variant_id')->nullable(); $t->unsignedBigInteger('family_id')->nullable(); $t->decimal('quantity', 12, 3); $t->unsignedBigInteger('unit_id')->nullable(); });
        Schema::create('recipe_steps', function ($t) { $t->id(); $t->unsignedBigInteger('recipe_id'); $t->integer('position'); $t->text('body'); $t->integer('minutes')->nullable(); });
        Schema::create('units_of_measure', function ($t) { $t->id(); $t->string('name'); });
        DB::table('units_of_measure')->insert([['id' => 1, 'name' => 'kg'], ['id' => 2, 'name' => 'pcs']]);
        DB::table('products')->insert(['id' => 4, 'name' => 'Country loaf']);
        DB::table('product_variants')->insert(['id' => 14, 'product_id' => 4, 'sku' => 'LOAF']);
    }

    private function fails(callable $fn, string $msg): void
    {
        try {
            $fn();
            $this->fail("Expected: {$msg}");
        } catch (BooksException $e) {
            $this->assertStringContainsString($msg, $e->getMessage());
        }
    }

    private function pub(): RecipePublisher
    {
        return app(RecipePublisher::class);
    }

    private function kits(): KitService
    {
        return app(KitService::class);
    }

    private function recipe(array $r = []): int
    {
        $id = DB::table('recipes')->insertGetId($r + ['variant_id' => 14, 'yield_qty' => 2, 'visibility' => 'publishable', 'is_active' => true, 'prep_minutes' => 20, 'cook_minutes' => 40, 'note' => '  Rest overnight for flavour. ']);
        DB::table('recipe_items')->insert([['recipe_id' => $id, 'variant_id' => 11, 'quantity' => 0.5, 'unit_id' => 1], ['recipe_id' => $id, 'variant_id' => 12, 'quantity' => 1, 'unit_id' => 2]]);
        DB::table('recipe_steps')->insert([['recipe_id' => $id, 'position' => 2, 'body' => ' Bake hot ', 'minutes' => 40], ['recipe_id' => $id, 'position' => 1, 'body' => 'Mix and knead', 'minutes' => null]]);

        return $id;
    }

    // ── recipes ──────────────────────────────────────────────────────────

    public function test_only_recipes_the_kitchen_made_publishable_are_listed_and_copied(): void
    {
        $ok = $this->recipe();
        $internal = $this->recipe(['visibility' => 'internal']);
        $off = $this->recipe(['is_active' => false]);
        $this->assertSame([['id' => $ok, 'name' => 'Country loaf', 'prep_minutes' => 20, 'cook_minutes' => 40, 'published_in' => []]], $this->pub()->publishable());
        $this->assertSame([], $this->pub()->publishable('cake'));
        $this->assertCount(1, $this->pub()->publishable('loaf'));
        $this->fails(fn () => $this->pub()->publish($internal), 'has not made this recipe available');
        $this->fails(fn () => $this->pub()->publish($off), 'has not made this recipe available');
        $this->fails(fn () => $this->pub()->publish(999), 'does not exist');
    }

    public function test_a_recipe_is_copied_as_text_into_a_new_draft_offering(): void
    {
        $id = $this->recipe();
        $by = $this->person('Chef', false);
        $r = $this->pub()->publish($id, null, $by);
        $o = $r['offering'];
        $l = $r['lesson'];
        $this->assertSame(['recipe', 'Country loaf', 'draft', 'online', 'A recipe from our kitchen.'], [$o->kind, $o->title, $o->status, $o->delivery, $o->summary]);
        $this->assertSame(['recipe', 'Country loaf', 60, true], [$l->kind, $l->title, $l->duration_minutes, (bool) $l->is_required]);
        $this->assertSame("Makes 2 · Prep 20 min · Cook 40 min\n\nIngredients\n- 0.5 kg Bread flour 2kg\n- 1 pcs Apron\n\nMethod\n1. Mix and knead\n2. Bake hot (40 min)\n\nRest overnight for flavour.", $l->body);
        $src = RecipeSource::sole();
        $this->assertSame([$id, $o->id, $l->id, sha1($l->body), (int) $by->id], [(int) $src->recipe_id, (int) $src->offering_id, (int) $src->lesson_id, $src->body_hash, (int) $src->published_by]);
        $this->assertSame([$o->id], $this->pub()->publishable()[0]['published_in']);
        $into = $this->offering(['title' => 'Bread course']);
        $r2 = $this->pub()->publish($id, $into->id);
        $this->assertSame([$into->id, 1], [$r2['offering']->id, Offering::where('kind', 'recipe')->count()]);   // a lesson of the existing offering
        $this->assertSame([$o->id, $into->id], $this->pub()->publishable()[0]['published_in']);
    }

    public function test_a_recipe_without_ingredients_or_method_is_not_copied_and_times_fall_back_to_the_steps(): void
    {
        $empty = DB::table('recipes')->insertGetId(['variant_id' => 14, 'visibility' => 'publishable', 'is_active' => true]);
        $this->fails(fn () => $this->pub()->publish($empty), 'no ingredients or method');
        $steps = DB::table('recipes')->insertGetId(['variant_id' => 14, 'visibility' => 'publishable', 'is_active' => true, 'yield_qty' => 0]);
        DB::table('recipe_steps')->insert([['recipe_id' => $steps, 'position' => 1, 'body' => 'Wait', 'minutes' => 900], ['recipe_id' => $steps, 'position' => 2, 'body' => 'Wait more', 'minutes' => 900]]);
        $c = $this->pub()->render(\App\Models\Recipe::find($steps));
        $this->assertSame(["Method\n1. Wait (900 min)\n2. Wait more (900 min)", 1440], [$c['body'], $c['minutes']]);   // no meta line; at most a day
        $none = DB::table('recipes')->insertGetId(['variant_id' => 14, 'visibility' => 'publishable', 'is_active' => true]);
        DB::table('recipe_items')->insert(['recipe_id' => $none, 'variant_id' => 11, 'quantity' => 1.25, 'unit_id' => null]);
        $this->assertSame(["Ingredients\n- 1.25 Bread flour 2kg", null], array_values(array_intersect_key($this->pub()->render(\App\Models\Recipe::find($none)), array_flip(['body', 'minutes']))));
    }

    public function test_updating_the_copy_asks_first_when_the_teacher_edited_the_lesson(): void
    {
        $id = $this->recipe();
        $r = $this->pub()->publish($id);
        $l = $r['lesson'];
        DB::table('recipe_steps')->where('recipe_id', $id)->where('position', 1)->update(['body' => 'Mix, knead and fold']);
        $l = $this->pub()->refresh($l);
        $this->assertStringContainsString('1. Mix, knead and fold', $l->body);
        $this->assertSame([false], array_column($this->pub()->sourcesOf($r['offering']), 'edited'));
        app(Curriculum::class)->saveLesson($r['offering'], ['body' => $l->body."\n\nMy own tip."], $l);
        $this->assertSame([true], array_column($this->pub()->sourcesOf($r['offering']), 'edited'));
        $this->fails(fn () => $this->pub()->refresh($l->fresh()), 'edited since it was copied');
        $l = $this->pub()->refresh($l->fresh(), true);
        $this->assertStringNotContainsString('My own tip', $l->body);
        $this->fails(fn () => $this->pub()->refresh($this->lesson($r['offering'])), 'not copied from a Menus recipe');
        DB::table('recipes')->where('id', $id)->update(['visibility' => 'internal']);
        $this->fails(fn () => $this->pub()->refresh($l->fresh()), 'has not made this recipe available');
    }

    public function test_a_very_long_recipe_is_cut_to_the_lesson_and_still_counts_as_unedited(): void
    {
        $id = $this->recipe();
        DB::table('recipe_steps')->insert(['recipe_id' => $id, 'position' => 3, 'body' => str_repeat('Knead. ', 9000), 'minutes' => null]);
        $r = $this->pub()->publish($id);
        $this->assertSame(60000, mb_strlen($r['lesson']->body));
        $this->assertSame([false], array_column($this->pub()->sourcesOf($r['offering']), 'edited'));
        $this->assertSame(60000, mb_strlen($this->pub()->refresh($r['lesson'])->body));   // no "edited" refusal
    }

    // ── kits ─────────────────────────────────────────────────────────────

    public function test_a_kit_is_a_list_of_stock_items_checked(): void
    {
        $o = $this->offering();
        $items = $this->kits()->setItems($o, [['variant_id' => 11, 'quantity' => '2.5', 'note' => ' Strong flour '], ['variant_id' => 12, 'quantity' => 1]]);
        $this->assertSame([['Bread flour 2kg', 'FLR-2', 2.5, 'Strong flour'], ['Apron', 'APR', 1.0, null]], array_map(fn ($i) => [$i['name'], $i['sku'], $i['quantity'], $i['note']], $items));
        $this->fails(fn () => $this->kits()->setItems($o, [['variant_id' => 99, 'quantity' => 1]]), 'not a stock item');
        $this->fails(fn () => $this->kits()->setItems($o, [['variant_id' => 11, 'quantity' => 0]]), 'how many of each');
        $this->fails(fn () => $this->kits()->setItems($o, [['variant_id' => 11, 'quantity' => 100000.001]]), 'how many of each');
        $this->assertSame(100000.0, $this->kits()->setItems($o, [['variant_id' => 11, 'quantity' => 100000]])[0]['quantity']);
        $this->fails(fn () => $this->kits()->setItems($o, [['variant_id' => 11, 'quantity' => 1], ['variant_id' => 11, 'quantity' => 2]]), 'in the kit twice');
        $this->fails(fn () => $this->kits()->setItems($o, array_fill(0, 41, ['variant_id' => 11, 'quantity' => 1])), 'up to 40 items');
        foreach (range(101, 140) as $v) {
            DB::table('product_variants')->insert(['id' => $v, 'product_id' => 1, 'sku' => 'V'.$v]);
        }
        $this->assertCount(40, $this->kits()->setItems($o, array_map(fn ($v) => ['variant_id' => $v, 'quantity' => 1], range(101, 140))));   // exactly 40 is fine
        $this->assertSame([], $this->kits()->setItems($o, []));
        $this->assertNull($this->kits()->forStudent($o, null));   // no kit: nothing shown
    }

    public function test_a_kit_is_handed_to_each_enrolled_student_once_and_leaves_stock(): void
    {
        $o = $this->offering(['title' => 'Bread', 'location_id' => 2, 'delivery' => 'in_person']);
        $this->kits()->setItems($o, [['variant_id' => 11, 'quantity' => 2], ['variant_id' => 12, 'quantity' => 1]]);
        $u = $this->person('Ann', true, '0711');
        $e = Enrolment::forceCreate(['number' => 'EN-1', 'offering_id' => $o->id, 'student_user_id' => $u->id, 'status' => 'active', 'channel' => 'online', 'total' => 0, 'paid_total' => 0]);
        $clerk = $this->person('Clerk', false);
        $h = $this->kits()->handOut($o, $e, $clerk);
        $this->assertNull($h->stock_note);
        $this->assertSame([(int) $clerk->id, (int) $u->id], [(int) $h->handed_by, (int) $h->user_id]);
        $order = $this->placed[0];
        $this->assertSame([2, (int) $u->customer->id, 'Cooking kit for EN-1: Bread', $e->id], [$order['location_id'], $order['customer_id'], $order['narration'], $order['meta']['course_kit_enrolment_id']]);
        $this->assertSame([['product', 1, 11, 2.0, 0.0, 2], ['product', 2, 12, 1.0, 0.0, 2]], array_map(fn ($l) => [$l['type'], $l['product_id'], $l['variant_id'], $l['quantity'], $l['rate'], $l['location_id']], $order['lines']));   // no money: the fee carries it
        $this->assertSame([\App\Models\Books\VoucherType::DELIVERY_NOTE, 'EN-1'], [$this->invoices[0]['type'], $this->invoices[0]['reference_no']]);
        $this->assertSame([(int) $h->order_id, (int) $h->delivery_id], [(int) $this->invoices[0]['order'], (int) $this->invoices[0]['invoice']]);
        $this->fails(fn () => $this->kits()->handOut($o, $e), 'has their kit already');
        $this->assertNotNull($this->kits()->forStudent($o, $u)['handed_at']);
        $this->assertNull($this->kits()->forStudent($o, $this->person('Bob'))['handed_at']);
        $this->assertSame([['Bread flour 2kg', 2.0]], array_slice(array_map(fn ($i) => [$i['name'], $i['quantity']], $this->kits()->forStudent($o, null)['items']), 0, 1));
        $pending = Enrolment::forceCreate(['number' => 'EN-2', 'offering_id' => $o->id, 'student_user_id' => $this->person('Cy')->id, 'status' => 'pending', 'channel' => 'online', 'total' => 0, 'paid_total' => 0]);
        $this->fails(fn () => $this->kits()->handOut($o, $pending), 'Only an enrolled student');
        $this->fails(fn () => $this->kits()->handOut($this->offering(), $e), 'Only an enrolled student');
        $bare = $this->offering();
        $this->fails(fn () => $this->kits()->handOut($bare, Enrolment::forceCreate(['number' => 'EN-3', 'offering_id' => $bare->id, 'student_user_id' => $u->id, 'status' => 'active', 'channel' => 'online', 'total' => 0, 'paid_total' => 0])), 'has no kit');
        $this->assertSame([['Ann', 'EN-1', true]], array_map(fn ($r) => [$r['student'], $r['number'], $r['handed_at'] !== null], $this->kits()->handouts($o)));
    }

    public function test_a_shortage_or_a_missing_customer_account_is_noted_and_never_stops_the_hand_over(): void
    {
        $o = $this->offering();
        $this->kits()->setItems($o, [['variant_id' => 11, 'quantity' => 1]]);
        $noAccount = Enrolment::forceCreate(['number' => 'EN-1', 'offering_id' => $o->id, 'student_user_id' => $this->person('Ann', false)->id, 'status' => 'completed', 'channel' => 'online', 'total' => 0, 'paid_total' => 0]);
        $h = $this->kits()->handOut($o, $noAccount);
        $this->assertSame(['Stock was not taken: the student has no customer account.', null], [$h->stock_note, $h->order_id]);
        $this->assertSame([], $this->placed);   // nothing booked
        $v = $this->createMock(\App\Services\Books\VoucherService::class);
        $v->method('placeOrder')->willThrowException(new BooksException('Not enough Bread flour at Westlands'));
        $this->app->instance(\App\Services\Books\VoucherService::class, $v);
        $short = Enrolment::forceCreate(['number' => 'EN-2', 'offering_id' => $o->id, 'student_user_id' => $this->person('Bob')->id, 'status' => 'active', 'channel' => 'online', 'total' => 0, 'paid_total' => 0]);
        $h = app(KitService::class)->handOut($o, $short);
        $this->assertSame('Stock was not taken: Not enough Bread flour at Westlands', $h->stock_note);
        $this->assertSame(2, KitHandout::count());
    }

    // ── the screens (HTTP) ───────────────────────────────────────────────

    public function test_who_may_copy_recipes_and_keep_kits(): void
    {
        $id = $this->recipe();
        $teacher = $this->staff('Teacher', ['courses.teach']);
        $mine = $this->offering(['instructor_user_id' => $teacher->id]);
        $theirs = $this->offering();
        Sanctum::actingAs($teacher, ['*']);
        $this->getJson('/api/admin/courses/recipes/publishable')->assertForbidden();
        $this->postJson("/api/admin/courses/recipes/{$id}/publish")->assertForbidden();
        $this->putJson("/api/admin/courses/offerings/{$mine->id}/kit", ['items' => []])->assertForbidden();   // the kit is a manager's choice
        $this->getJson("/api/admin/courses/offerings/{$mine->id}/kit")->assertOk();
        $this->getJson("/api/admin/courses/offerings/{$theirs->id}/kit")->assertForbidden();
        $mgr = $this->staff('Manager', ['courses.manage']);
        Sanctum::actingAs($mgr, ['*']);
        $this->getJson('/api/admin/courses/recipes/publishable')->assertOk()->assertJsonPath('recipes.0.name', 'Country loaf');
        $r = $this->postJson("/api/admin/courses/recipes/{$id}/publish")->assertOk()->json();
        $this->assertSame('Copied. It is a draft until you publish it.', $r['message']);
        $this->postJson("/api/admin/courses/recipes/{$id}/publish", ['offering_id' => $theirs->id])->assertOk();
        $this->postJson("/api/admin/courses/offerings/{$r['offering_id']}/recipe-sources/{$r['lesson_id']}/refresh")->assertOk();
        $other = Lesson::where('offering_id', $theirs->id)->value('id');
        $this->postJson("/api/admin/courses/offerings/{$r['offering_id']}/recipe-sources/{$other}/refresh")->assertNotFound();   // another offering's lesson
        $this->putJson("/api/admin/courses/offerings/{$mine->id}/kit", ['items' => [['variant_id' => 11, 'quantity' => 1]]])->assertOk()->assertJsonCount(1, 'items');
        $e = Enrolment::forceCreate(['number' => 'EN-9', 'offering_id' => $theirs->id, 'student_user_id' => $this->person('Ann')->id, 'status' => 'active', 'channel' => 'online', 'total' => 0, 'paid_total' => 0]);
        $this->postJson("/api/admin/courses/offerings/{$mine->id}/kit/{$e->id}/hand-out")->assertNotFound();
    }
}
