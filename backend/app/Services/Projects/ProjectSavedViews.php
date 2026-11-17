<?php

namespace App\Services\Projects;

use App\Models\User;
use Illuminate\Support\Facades\DB;

/**
 * A person's saved views (build 5.2): filters, grouping and the view (list, board, timeline) on the Work tab, saved by name. Each person's own;
 * nobody else sees them. Only known settings are kept.
 */
class ProjectSavedViews
{
    public const PLACES = ['work' => ['mine', 'overdue', 'status', 'phase_id', 'q', 'view']];

    private const VIEWS = ['list', 'board', 'timeline'];

    /** @return array<int, array{id: int, name: string, settings: array<string, mixed>}> */
    public function of(User $user, string $place): array
    {
        $this->check($place);

        return DB::table('project_saved_views')->where('user_id', $user->id)->where('place', $place)->orderBy('name')->get()
            ->map(fn ($v) => ['id' => (int) $v->id, 'name' => $v->name, 'settings' => json_decode($v->settings, true) ?: []])->all();
    }

    /** Save (or replace) a view by name. @param array<string, mixed> $settings */
    public function save(User $user, string $place, string $name, array $settings): int
    {
        $this->check($place);
        $name = trim(preg_replace('/\s+/', ' ', $name));
        if ($name === '') {
            throw new ProjectException('Give the view a name.');
        }
        $clean = array_intersect_key($settings, array_flip(self::PLACES[$place]));
        if (isset($clean['view']) && ! in_array($clean['view'], self::VIEWS, true)) {
            unset($clean['view']);
        }
        $clean = array_filter($clean, fn ($v) => $v !== '' && $v !== null && $v !== false);
        if (DB::table('project_saved_views')->where('user_id', $user->id)->where('place', $place)->where('name', '!=', $name)->count() >= 30) {
            throw new ProjectException('You can keep up to 30 saved views here. Delete one first.');
        }
        DB::table('project_saved_views')->updateOrInsert(['user_id' => $user->id, 'place' => $place, 'name' => mb_substr($name, 0, 60)],
            ['settings' => json_encode($clean), 'updated_at' => now(), 'created_at' => now()]);

        return (int) DB::table('project_saved_views')->where('user_id', $user->id)->where('place', $place)->where('name', mb_substr($name, 0, 60))->value('id');
    }

    public function delete(User $user, int $id): void
    {
        if (! DB::table('project_saved_views')->where('id', $id)->where('user_id', $user->id)->delete()) {
            throw new ProjectException('Not found.', 404);
        }
    }

    private function check(string $place): void
    {
        if (! ProjectsSetup::work()) {
            throw new ProjectException('Saved views need database script 261. Run it first.', 409);
        }
        if (! isset(self::PLACES[$place])) {
            throw new ProjectException('Not found.', 404);
        }
    }
}
