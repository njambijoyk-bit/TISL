<?php

namespace App\Traits;

use Illuminate\Database\Eloquent\Relations\MorphMany;
use Illuminate\Database\Eloquent\SoftDeletes;
use Throwable;

/**
 * Records created / updated / deleted / force_deleted / restored events,
 * plus custom events such as "used", into an activity log table.
 *
 * Do not use this trait directly. Use one of the thin wrappers
 * (LogsTaxActivity, LogsWithholdingActivity, LogsProductActivity), which
 * decide which log table receives the rows.
 *
 * Notes:
 * - Mass updates/deletes through the query builder (Model::where()->update())
 *   do not fire model events and are therefore not logged.
 * - A logging failure never breaks the real operation; it is reported and
 *   swallowed.
 */
trait LogsActivity
{
    /** Per-model-class switch, see withoutActivityLog(). */
    protected static bool $activityLoggingEnabled = true;

    /** The concrete log model class (e.g. TaxActivityLog::class). */
    abstract protected function activityLogModel(): string;

    public static function bootLogsActivity(): void
    {
        static::created(function ($model) {
            $model->recordActivity(
                'created',
                null,
                $model->activityAttributes($model->getAttributes())
            );
        });

        static::updated(function ($model) {
            $new = $model->activityAttributes($model->getChanges());

            if ($new === []) {
                return; // only ignored columns (e.g. updated_at) changed
            }

            $old = array_intersect_key($model->getRawOriginal(), $new);

            $model->recordActivity('updated', $old, $new);
        });

        static::deleted(function ($model) {
            $forced = method_exists($model, 'isForceDeleting') && $model->isForceDeleting();

            $model->recordActivity(
                $forced ? 'force_deleted' : 'deleted',
                $model->activityAttributes($model->getAttributes()),
                null
            );
        });

        if (in_array(SoftDeletes::class, class_uses_recursive(static::class), true)) {
            static::restored(function ($model) {
                $model->recordActivity('restored');
            });
        }
    }

    /**
     * Columns never written to the log. Override in a model to change.
     * Hidden attributes (passwords, tokens) are always excluded as well.
     */
    protected function activityLogExcept(): array
    {
        return ['created_at', 'updated_at', 'deleted_at'];
    }

    protected function activityAttributes(array $attributes): array
    {
        $except = array_merge($this->activityLogExcept(), $this->getHidden());

        return array_diff_key($attributes, array_flip($except));
    }

    /**
     * Write one log row. Public so any event can be recorded manually,
     * e.g. $rate->recordActivity('used', null, null, ['order_id' => 12]).
     */
    public function recordActivity(
        string $event,
        ?array $old = null,
        ?array $new = null,
        array $context = []
    ): void {
        if (! static::$activityLoggingEnabled) {
            return;
        }

        try {
            $logClass = $this->activityLogModel();
            $request  = app()->runningInConsole() ? null : request();

            $logClass::create([
                'loggable_type' => $this->getMorphClass(),
                'loggable_id'   => $this->getKey(),
                'event'         => $event,
                'user_id'       => auth()->id(),
                'old_values'    => $old ?: null,
                'new_values'    => $new ?: null,
                'context'       => $context ?: null,
                'ip_address'    => $request?->ip(),
                'user_agent'    => $request ? mb_substr((string) $request->userAgent(), 0, 255) : null,
            ]);
        } catch (Throwable $e) {
            report($e);
        }
    }

    /** Shortcut for usage events (a rate applied, a certificate consumed...). */
    public function logUsage(array $context = [], string $event = 'used'): void
    {
        $this->recordActivity($event, null, null, $context);
    }

    public function activityLogs(): MorphMany
    {
        return $this->morphMany($this->activityLogModel(), 'loggable')
                    ->orderByDesc('id');
    }

    /** Run a callback (seeders, backfills, imports) without writing logs. */
    public static function withoutActivityLog(callable $callback): mixed
    {
        $previous = static::$activityLoggingEnabled;
        static::$activityLoggingEnabled = false;

        try {
            return $callback();
        } finally {
            static::$activityLoggingEnabled = $previous;
        }
    }
}
