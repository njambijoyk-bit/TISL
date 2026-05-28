<?php

namespace App\Traits\Inventory;

// =============================================================================
// HasConditionScore
// Used by: InventoryInstance, InventoryRepair, InventoryReturnAuditItem
// =============================================================================
trait HasConditionScore
{
    public static array $conditionScoreMap = [
        'new'       => 100,
        'excellent' => 90,
        'good'      => 75,
        'fair'      => 55,
        'poor'      => 35,
        'damaged'   => 15,
        'unusable'  => 0,
    ];

    public static function scoreFromCondition(string $condition): float
    {
        return self::$conditionScoreMap[$condition] ?? 0;
    }

    // Returns override ?? stored auto score
    public function getFinalScoreAttribute(): ?float
    {
        return $this->condition_score_override ?? $this->condition_score ?? null;
    }

    // Auto-set condition_score when condition is assigned
    public function setConditionAttribute(string $value): void
    {
        $this->attributes['condition'] = $value;
        if (! isset($this->attributes['condition_score_override'])) {
            $this->attributes['condition_score'] = self::$conditionScoreMap[$value] ?? 0;
        }
    }
}

// =============================================================================
// HasPolymorphicAssignee
// Used by: InventoryAssignment, InventoryDispute, InventoryReturnAudit
// Expects columns: assignee_type, assignee_id (nullable), assignee_label
// For disputes the columns are prefixed: against_assignee_*
// =============================================================================
trait HasPolymorphicAssignee
{
    // Resolve the assignee Eloquent model (null for department type)
    public function resolveAssignee(): mixed
    {
        $type = $this->assignee_type;
        $id   = $this->assignee_id;

        if (! $type || ! $id) return null;

        return match ($type) {
            'employee' => \App\Models\Employee::find($id),
            'customer' => \App\Models\Customer::find($id),
            'group'    => \App\Models\Inventory\InventoryGroup::find($id),
            default    => null, // department — label only
        };
    }

    // Build a denormalized label string at assignment time
    public static function buildAssigneeLabel(string $type, mixed $id, ?string $fallback = null): string
    {
        if ($fallback) return $fallback;

        return match ($type) {
            'employee' => optional(\App\Models\Employee::find($id))->full_name ?? "Employee #{$id}",
            'customer' => optional(\App\Models\Customer::find($id))->name      ?? "Customer #{$id}",
            'group'    => optional(\App\Models\Inventory\InventoryGroup::find($id))->name ?? "Group #{$id}",
            'department' => $fallback ?? 'Unknown Department',
            default    => $fallback ?? 'Unknown',
        };
    }
}

// =============================================================================
// WritesLifecycleMovements
// Used by: InventoryInstance
// Provides logMovement() and logLocationChange() helpers so services
// don't have to manually construct movement rows every time.
// =============================================================================
trait WritesLifecycleMovements
{
    public function logMovement(
        string  $type,
        ?string $conditionBefore = null,
        ?string $conditionAfter  = null,
        ?string $statusBefore    = null,
        ?string $statusAfter     = null,
        ?float  $scoreBefore     = null,
        ?float  $scoreAfter      = null,
        ?string $referenceType   = null,
        ?int    $referenceId     = null,
        ?int    $performedBy     = null,
        ?string $notes           = null,
        float   $quantity        = 1,
    ): \App\Models\Inventory\InventoryLifecycleMovement {
        return \App\Models\Inventory\InventoryLifecycleMovement::create([
            'item_id'        => $this->item_id,
            'instance_id'    => $this->id,
            'quantity'       => $quantity,
            'movement_type'  => $type,
            'condition_before'  => $conditionBefore,
            'condition_after'   => $conditionAfter,
            'status_before'     => $statusBefore,
            'status_after'      => $statusAfter,
            'score_before'      => $scoreBefore,
            'score_after'       => $scoreAfter,
            'reference_type'    => $referenceType,
            'reference_id'      => $referenceId,
            'performed_by'      => $performedBy,
            'performed_at'      => now(),
            'notes'             => $notes,
        ]);
    }

    public function logLocationChange(
        ?int    $fromLocationId    = null,
        int     $toLocationId      = 0,
        ?string $fromLocationLabel = null,
        string  $toLocationLabel   = '',
        ?string $reason            = null,
        ?string $referenceType     = null,
        ?int    $referenceId       = null,
        ?int    $movedBy           = null,
        ?string $notes             = null,
        float   $quantity          = 1,
    ): \App\Models\Inventory\InventoryLocationMovement {
        return \App\Models\Inventory\InventoryLocationMovement::create([
            'item_id'             => $this->item_id,
            'instance_id'         => $this->id,
            'quantity'            => $quantity,
            'from_location_id'    => $fromLocationId,
            'to_location_id'      => $toLocationId,
            'from_location_label' => $fromLocationLabel,
            'to_location_label'   => $toLocationLabel,
            'reason'              => $reason,
            'reference_type'      => $referenceType,
            'reference_id'        => $referenceId,
            'moved_by'            => $movedBy,
            'moved_at'            => now(),
            'notes'               => $notes,
        ]);
    }
}