<?php

namespace App\Services\Courses;

use App\Models\Courses\Lesson;
use App\Models\Courses\Offering;
use App\Models\Courses\RecipeSource;
use App\Models\Menus\DishRecipe;
use App\Models\User;
use App\Services\Books\BooksException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Publishing a Menus recipe as a recipe to teach or sell. Only a recipe the kitchen marked "may be shown on the website and in courses" can be copied. The copy is text, taken at that moment:
 * the lesson does not follow later changes in the kitchen. "Update the copy" takes a fresh copy, and refuses when the teacher has edited the lesson since (unless told to overwrite).
 */
class RecipePublisher
{
    public function __construct(private OfferingEditor $offerings, private Curriculum $curriculum)
    {
    }

    public static function installed(): bool
    {
        return Schema::hasTable('course_recipe_sources') && Schema::hasTable('menus_recipes') && Schema::hasTable('menus_recipe_steps') && Schema::hasTable('menus_recipe_lines');
    }

    /** @return array<int, array<string, mixed>> the recipes that may be copied, with where each already is */
    public function publishable(?string $q = null): array
    {
        if (! self::installed()) {
            return [];
        }
        $rows = DB::table('menus_recipes as r')->join('menus_dishes as d', 'd.id', '=', 'r.dish_id')
            ->where('r.visibility', 'public')->where('r.is_active', true)->when($q, fn ($w) => $w->where('d.name', 'like', '%'.str_replace(['%', '_'], ['\\%', '\\_'], trim($q)).'%'))
            ->orderBy('d.name')->limit(100)->get(['r.id', 'd.name', 'r.prep_minutes', 'r.cook_minutes']);
        $used = RecipeSource::whereIn('recipe_id', $rows->pluck('id'))->get()->groupBy('recipe_id');

        return $rows->map(fn ($r) => ['id' => (int) $r->id, 'name' => $r->name, 'prep_minutes' => $r->prep_minutes, 'cook_minutes' => $r->cook_minutes, 'published_in' => ($used[$r->id] ?? collect())->pluck('offering_id')->unique()->values()->all()])->all();
    }

    private function num(float $n): string
    {
        return rtrim(rtrim(number_format($n, 3, '.', ''), '0'), '.');
    }

    /** @return array{title: string, body: string, minutes: ?int} */
    public function render(DishRecipe $r): array
    {
        $title = (string) ($r->name ?: (DB::table('menus_dishes')->where('id', $r->dish_id)->value('name') ?? 'Recipe'));
        $r->loadMissing('lines.ingredient.baseUnit', 'lines.ingredient.altUnit', 'lines.subRecipe.yieldUnit');
        $lines = [];
        foreach ($r->lines as $l) {
            if ($l->sub_recipe_id) {   // another recipe of the kitchen's, written by its own name
                $lines[] = '- '.$this->num((float) $l->quantity).' '.($l->subRecipe?->yieldUnit?->name ?? 'portions').' '.($l->subRecipe?->title() ?? 'a recipe');

                continue;
            }
            $unit = ($l->unit === 'alt' ? $l->ingredient?->altUnit : $l->ingredient?->baseUnit)?->name ?? '';
            $lines[] = '- '.$this->num((float) $l->quantity).' '.$unit.' '.($l->ingredient?->name ?? 'an ingredient');
        }
        $steps = DB::table('menus_recipe_steps')->where('recipe_id', $r->id)->orderBy('position')->orderBy('id')->get();
        $out = [];
        $meta = array_filter([$r->yield_qty > 0 ? 'Makes '.$this->num((float) $r->yield_qty).($r->yieldUnit ? ' '.$r->yieldUnit->code : '') : null, $r->prep_minutes ? 'Prep '.$r->prep_minutes.' min' : null, $r->cook_minutes ? 'Cook '.$r->cook_minutes.' min' : null]);
        if ($meta) {
            $out[] = implode(' · ', $meta);
        }
        if ($lines) {
            $out[] = "Ingredients\n".implode("\n", array_map(fn ($l) => preg_replace('/\s+/', ' ', $l), $lines));
        }
        if ($steps->isNotEmpty()) {
            $n = 0;
            $out[] = "Method\n".$steps->map(function ($s) use (&$n) {
                return ++$n.'. '.trim((string) $s->body).($s->minutes ? ' ('.$s->minutes.' min)' : '');
            })->implode("\n");
        }
        if ($r->note) {
            $out[] = trim((string) $r->note);
        }
        if (! $lines && $steps->isEmpty()) {
            throw new BooksException('This recipe has no ingredients or method to copy yet.');
        }
        $minutes = ((int) $r->prep_minutes + (int) $r->cook_minutes) ?: ($steps->sum('minutes') ?: null);

        return ['title' => $title, 'body' => implode("\n\n", $out), 'minutes' => $minutes ? min(1440, (int) $minutes) : null];
    }

    private function publishableRecipe(int $id): DishRecipe
    {
        $r = DishRecipe::find($id) ?? throw new BooksException('That recipe does not exist.');
        if ($r->visibility !== 'public' || ! $r->is_active) {
            throw new BooksException('The kitchen has not made this recipe available for courses: set it to "May be shown on the website and in courses" in Menus first.');
        }

        return $r;
    }

    /** Copy a recipe into a new draft recipe offering, or as a new lesson of an existing offering. @return array{offering: Offering, lesson: Lesson} */
    public function publish(int $recipeId, ?int $offeringId = null, ?User $by = null): array
    {
        if (! self::installed()) {
            throw new BooksException('Run database script 161_courses_recipes_kits.sql first.');
        }
        $r = $this->publishableRecipe($recipeId);
        $copy = $this->render($r);

        return DB::transaction(function () use ($r, $copy, $offeringId, $by) {
            if ($offeringId) {
                $o = Offering::findOrFail($offeringId);
            } else {
                $o = $this->offerings->save(['kind' => 'recipe', 'title' => mb_substr($copy['title'], 0, 160), 'summary' => 'A recipe from our kitchen.', 'delivery' => 'online'], null, $by?->id);
            }
            $lesson = $this->curriculum->saveLesson($o, ['kind' => 'recipe', 'title' => mb_substr($copy['title'], 0, 160), 'body' => $copy['body'], 'duration_minutes' => $copy['minutes'], 'is_required' => true]);
            RecipeSource::create(['offering_id' => $o->id, 'lesson_id' => $lesson->id, 'recipe_id' => $r->id, 'body_hash' => sha1((string) $lesson->body), 'published_by' => $by?->id, 'published_at' => now()]);   // the body as the lesson keeps it (trimmed, cut to length)

            return ['offering' => $o->fresh(), 'lesson' => $lesson->fresh()];
        });
    }

    /** Take a fresh copy of the recipe into its lesson. Refuses when the lesson has been edited since the last copy, unless `$overwrite`. */
    public function refresh(Lesson $lesson, bool $overwrite = false, ?User $by = null): Lesson
    {
        $src = RecipeSource::where('lesson_id', $lesson->id)->first() ?? throw new BooksException('This lesson was not copied from a Menus recipe.');
        if (! $overwrite && sha1((string) $lesson->body) !== $src->body_hash) {
            throw new BooksException('This lesson has been edited since it was copied. Update it anyway only if you are happy to lose those edits.');
        }
        $copy = $this->render($this->publishableRecipe((int) $src->recipe_id));
        $o = Offering::findOrFail($lesson->offering_id);
        $lesson = $this->curriculum->saveLesson($o, ['body' => $copy['body'], 'duration_minutes' => $copy['minutes']], $lesson);
        $src->update(['body_hash' => sha1((string) $lesson->body), 'published_by' => $by?->id, 'published_at' => now()]);

        return $lesson;
    }

    /** Where each lesson of an offering came from, for the lesson list. @return array<int, array{lesson_id: int, recipe_id: int, published_at: string, edited: bool}> */
    public function sourcesOf(Offering $o): array
    {
        if (! self::installed()) {
            return [];
        }
        $lessons = Lesson::where('offering_id', $o->id)->pluck('body', 'id');

        return RecipeSource::where('offering_id', $o->id)->get()->map(fn (RecipeSource $s) => ['lesson_id' => (int) $s->lesson_id, 'recipe_id' => (int) $s->recipe_id, 'published_at' => $s->published_at->toIso8601String(), 'edited' => sha1((string) ($lessons[$s->lesson_id] ?? '')) !== $s->body_hash])->all();
    }
}
