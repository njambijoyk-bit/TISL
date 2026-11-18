<?php

namespace App\Services\Projects\Links;

use App\Services\Projects\ProjectLinkTypes;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/** Events says what of its own can be attached to a project: an event (the opening night of a building, a client's launch, a training day). */
class EventsLinks
{
    public static function register(ProjectLinkTypes $types): void
    {
        $types->register('events.event', [
            'module' => 'events', 'label' => 'Event', 'plural' => 'Events', 'permission' => 'events.view',
            'create' => fn (object $project): array => [['label' => 'Event', 'url' => "/admin/events/new?for_project={$project->id}"]],
            'search' => function (string $q): array {
                if (! Schema::hasTable('events')) {
                    return [];
                }
                $like = '%' . str_replace(['\\', '%', '_'], ['\\\\', '\%', '\_'], trim($q)) . '%';

                return self::rows(DB::table('events')->whereNull('deleted_at')->when(trim($q) !== '', fn ($w) => $w->where('title', 'like', $like))->orderByDesc('id')->limit(20))
                    ->map(fn ($r) => ['id' => $r['id'], 'title' => $r['title'], 'detail' => $r['detail']])->values()->all();
            },
            'describe' => fn (array $ids): array => Schema::hasTable('events') ? self::rows(DB::table('events')->whereIn('id', $ids))->keyBy('id')->all() : [],
        ]);
    }

    private static function rows($query)
    {
        return $query->get(['id', 'title', 'venue_name', 'status'])->map(fn ($e) => ['id' => (int) $e->id, 'title' => $e->title,
            'detail' => implode(' · ', array_filter([$e->venue_name, ucfirst((string) $e->status)])) ?: null, 'url' => '/admin/events/' . $e->id]);
    }
}
