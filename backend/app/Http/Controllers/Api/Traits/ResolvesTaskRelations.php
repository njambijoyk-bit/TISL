<?php

namespace App\Http\Controllers\Api\Traits;

use App\Services\Books\OrderSummaryService;
use App\Models\ProjectItem;
use App\Models\ProjectMilestone;
use Illuminate\Support\Collection;

trait ResolvesTaskRelations
{
    /**
     * Batch-load related model summaries for a collection of tasks.
     * Groups by related_type and fires one query per type (not one per task).
     * Safe to call with an Eloquent Collection or plain array-backed Collection.
     */
    protected function attachRelatedSummaries(Collection $tasks): Collection
    {
        $grouped = $tasks
            ->filter(fn($t) => $t->related_type && $t->related_id)
            ->groupBy('related_type');

        $resolved = [];

        foreach ($grouped as $type => $typeTasks) {
            $ids = $typeTasks->pluck('related_id')->unique()->values();

            $resolved[$type] = match ($type) {

                'order' => app(OrderSummaryService::class)->summaries($ids)
                    ->map(fn($m) => [
                        'name'            => $m['number'],
                        'title'           => null,
                        'document_number' => $m['number'],
                        'status'          => $m['status'],
                    ]),

                'project_item' => ProjectItem::whereIn('id', $ids)
                    ->get(['id', 'description', 'status'])
                    ->keyBy('id')
                    ->map(fn($m) => [
                        'name'            => $m->description,
                        'title'           => null,
                        'document_number' => "Item #{$m->id}",
                        'status'          => $m->status,
                    ]),

                'milestone' => ProjectMilestone::whereIn('id', $ids)
                    ->get(['id', 'title', 'status'])
                    ->keyBy('id')
                    ->map(fn($m) => [
                        'name'            => $m->title,
                        'title'           => null,
                        'document_number' => "MS #{$m->id}",
                        'status'          => $m->status,
                    ]),

                default => collect(),
            };
        }

        return $tasks->map(function ($task) use ($resolved) {
            $task->related_model_summary = ($task->related_type && $task->related_id)
                ? ($resolved[$task->related_type][(int) $task->related_id] ?? null)
                : null;

            return $task;
        });
    }
}