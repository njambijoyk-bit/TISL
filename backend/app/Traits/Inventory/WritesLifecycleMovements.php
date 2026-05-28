<?php

namespace App\Traits\Inventory;

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
            'item_id'          => $this->item_id,
            'instance_id'      => $this->id,
            'quantity'         => $quantity,
            'movement_type'    => $type,
            'condition_before' => $conditionBefore,
            'condition_after'  => $conditionAfter,
            'status_before'    => $statusBefore,
            'status_after'     => $statusAfter,
            'score_before'     => $scoreBefore,
            'score_after'      => $scoreAfter,
            'reference_type'   => $referenceType,
            'reference_id'     => $referenceId,
            'performed_by'     => $performedBy,
            'performed_at'     => now(),
            'notes'            => $notes,
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
