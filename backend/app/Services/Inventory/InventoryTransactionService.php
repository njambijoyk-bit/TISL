<?php

namespace App\Services\Inventory;

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Auth;
use App\Models\Inventory\{
    InventoryItem,
    InventoryInstance,
    InventoryAssignment,
    InventoryLifecycleMovement,
    InventoryLocationMovement,
    InventoryGroup,
    InventoryGroupMember,
};
use App\Traits\Inventory\HasPolymorphicAssignee;

// =============================================================================
// InventoryTransactionService
//
// Owns everything that moves an item from one state/person/place to another:
//   - Issue (permanent handover)
//   - Loan (time-bounded, must be returned)
//   - Department allocation (no individual assignee)
//   - Group allocation (multi-person)
//   - Return (any assignment type)
//   - Location move (physical position, separate track)
//   - Qty counter sync on inventory_items
//
// All writes are wrapped in DB transactions.
// Lifecycle + location movements are auto-written via the instance trait.
// =============================================================================
class InventoryTransactionService
{
    // -------------------------------------------------------------------------
    // ISSUE
    // Permanently assign a serialized instance OR bulk qty to an assignee.
    // -------------------------------------------------------------------------

    /**
     * Issue a serialized instance to an assignee.
     *
     * @param  InventoryInstance  $instance
     * @param  array{
     *   assignee_type: string,
     *   assignee_id: int|null,
     *   assignee_label: string,
     *   issued_by: int,
     *   issued_at?: string,
     *   expected_return_date?: string|null,
     *   issue_condition?: string|null,
     *   issue_notes?: string|null,
     *   location_id?: int|null,
     * }  $data
     */
    public function issueInstance(InventoryInstance $instance, array $data): InventoryAssignment
    {
        $this->assertInstanceAvailable($instance);

        return DB::transaction(function () use ($instance, $data) {
            $conditionBefore = $instance->condition;
            $scoreBefore     = $instance->condition_score;
            $statusBefore    = $instance->status;

            // Snapshot issue condition — default to current if not supplied
            $issueCondition = $data['issue_condition'] ?? $instance->condition;
            $issueScore     = \App\Traits\Inventory\HasConditionScore::scoreFromCondition($issueCondition);

            $assignment = InventoryAssignment::create([
                'item_id'               => $instance->item_id,
                'instance_id'           => $instance->id,
                'quantity'              => 1,
                'assignment_type'       => 'issue',
                'assignee_type'         => $data['assignee_type'],
                'assignee_id'           => $data['assignee_id'] ?? null,
                'assignee_label'        => $data['assignee_label'],
                'issued_by'             => $data['issued_by'],
                'issued_at'             => $data['issued_at'] ?? now(),
                'expected_return_date'  => $data['expected_return_date'] ?? null,
                'issue_condition'       => $issueCondition,
                'issue_condition_score' => $issueScore,
                'issue_notes'           => $data['issue_notes'] ?? null,
                'status'                => 'active',
            ]);

            // Update instance
            $instance->update([
                'status'                  => 'issued',
                'current_assignee_type'   => $data['assignee_type'],
                'current_assignee_id'     => $data['assignee_id'] ?? null,
                'current_assignee_label'  => $data['assignee_label'],
                'current_assignment_id'   => $assignment->id,
                'current_location_id'     => $data['location_id'] ?? $instance->current_location_id,
            ]);

            // Lifecycle movement
            $instance->logMovement(
                type:            'issued',
                conditionBefore: $conditionBefore,
                conditionAfter:  $issueCondition,
                statusBefore:    $statusBefore,
                statusAfter:     'issued',
                scoreBefore:     $scoreBefore,
                scoreAfter:      $issueScore,
                referenceType:   'assignment',
                referenceId:     $assignment->id,
                performedBy:     $data['issued_by'],
            );

            // Sync item qty counters
            $this->syncItemQty($instance->item_id);

            return $assignment;
        });
    }

    /**
     * Issue a bulk (non-serialized) quantity to an assignee.
     *
     * @param  array{
     *   item_id: int,
     *   quantity: float,
     *   assignee_type: string,
     *   assignee_id: int|null,
     *   assignee_label: string,
     *   issued_by: int,
     *   issued_at?: string,
     *   expected_return_date?: string|null,
     *   issue_notes?: string|null,
     * }  $data
     */
    public function issueBulk(array $data): InventoryAssignment
    {
        $item = InventoryItem::findOrFail($data['item_id']);

        if ($item->is_serialized) {
            throw new \LogicException('Use issueInstance() for serialized items.');
        }

        return DB::transaction(function () use ($item, $data) {
            $item = InventoryItem::lockForUpdate()->findOrFail($item->id);

            if ($item->available_qty < $data['quantity']) {
                throw new \RuntimeException("Insufficient available qty. Available: {$item->available_qty}");
            }
            $assignment = InventoryAssignment::create([
                'item_id'              => $item->id,
                'instance_id'          => null,
                'quantity'             => $data['quantity'],
                'assignment_type'      => 'issue',
                'assignee_type'        => $data['assignee_type'],
                'assignee_id'          => $data['assignee_id'] ?? null,
                'assignee_label'       => $data['assignee_label'],
                'issued_by'            => $data['issued_by'],
                'issued_at'            => $data['issued_at'] ?? now(),
                'expected_return_date' => $data['expected_return_date'] ?? null,
                'issue_notes'          => $data['issue_notes'] ?? null,
                'status'               => 'active',
            ]);

            // Lifecycle movement (no instance)
            InventoryLifecycleMovement::create([
                'item_id'       => $item->id,
                'instance_id'   => null,
                'quantity'      => $data['quantity'],
                'movement_type' => 'issued',
                'reference_type' => 'assignment',
                'reference_id'   => $assignment->id,
                'performed_by'   => $data['issued_by'],
                'performed_at'   => now(),
            ]);

            $this->syncItemQty($item->id);

            return $assignment;
        });
    }

    // -------------------------------------------------------------------------
    // LOAN
    // Same as issue but assignment_type = loan; instance status = loaned.
    // -------------------------------------------------------------------------

    /**
     * Loan a serialized instance. expected_return_date is required.
     */
    public function loanInstance(InventoryInstance $instance, array $data): InventoryAssignment
    {
        $this->assertInstanceAvailable($instance);

        if (! $instance->item->is_loanable) {
            throw new \LogicException("Item '{$instance->item->name}' is not marked as loanable.");
        }

        if (empty($data['expected_return_date'])) {
            throw new \InvalidArgumentException('expected_return_date is required for loans.');
        }

        return DB::transaction(function () use ($instance, $data) {
            $conditionBefore = $instance->condition;
            $scoreBefore     = $instance->condition_score;

            $issueCondition = $data['issue_condition'] ?? $instance->condition;
            $issueScore     = \App\Traits\Inventory\HasConditionScore::scoreFromCondition($issueCondition);

            $assignment = InventoryAssignment::create([
                'item_id'               => $instance->item_id,
                'instance_id'           => $instance->id,
                'quantity'              => 1,
                'assignment_type'       => 'loan',
                'assignee_type'         => $data['assignee_type'],
                'assignee_id'           => $data['assignee_id'] ?? null,
                'assignee_label'        => $data['assignee_label'],
                'issued_by'             => $data['issued_by'],
                'issued_at'             => $data['issued_at'] ?? now(),
                'expected_return_date'  => $data['expected_return_date'],
                'issue_condition'       => $issueCondition,
                'issue_condition_score' => $issueScore,
                'issue_notes'           => $data['issue_notes'] ?? null,
                'status'                => 'active',
            ]);

            $instance->update([
                'status'                 => 'loaned',
                'current_assignee_type'  => $data['assignee_type'],
                'current_assignee_id'    => $data['assignee_id'] ?? null,
                'current_assignee_label' => $data['assignee_label'],
                'current_assignment_id'  => $assignment->id,
            ]);

            $instance->logMovement(
                type:            'loaned',
                conditionBefore: $conditionBefore,
                conditionAfter:  $issueCondition,
                statusBefore:    'available',
                statusAfter:     'loaned',
                scoreBefore:     $scoreBefore,
                scoreAfter:      $issueScore,
                referenceType:   'assignment',
                referenceId:     $assignment->id,
                performedBy:     $data['issued_by'],
            );

            $this->syncItemQty($instance->item_id);

            return $assignment;
        });
    }

    // -------------------------------------------------------------------------
    // DEPARTMENT ALLOCATION
    // -------------------------------------------------------------------------

    /**
     * Allocate a serialized instance or bulk qty to a department (label only).
     *
     * @param  array{
     *   department: string,
     *   issued_by: int,
     *   quantity?: float,
     * }  $data
     */
    public function allocateToDepartment(InventoryInstance|InventoryItem $subject, array $data): InventoryAssignment
    {
        return DB::transaction(function () use ($subject, $data) {
            $isInstance = $subject instanceof InventoryInstance;

            if ($isInstance) {
                $this->assertInstanceAvailable($subject);
            }

            $assignment = InventoryAssignment::create([
                'item_id'         => $isInstance ? $subject->item_id : $subject->id,
                'instance_id'     => $isInstance ? $subject->id : null,
                'quantity'        => $isInstance ? 1 : ($data['quantity'] ?? 1),
                'assignment_type' => 'department_allocation',
                'assignee_type'   => 'department',
                'assignee_id'     => null,
                'assignee_label'  => $data['department'],
                'issued_by'       => $data['issued_by'],
                'issued_at'       => now(),
                'status'          => 'active',
            ]);

            if ($isInstance) {
                $subject->update([
                    'status'                 => 'issued',
                    'current_assignee_type'  => 'department',
                    'current_assignee_id'    => null,
                    'current_assignee_label' => $data['department'],
                    'current_assignment_id'  => $assignment->id,
                ]);

                $subject->logMovement(
                    type:          'department_allocated',
                    statusBefore:  'available',
                    statusAfter:   'issued',
                    referenceType: 'assignment',
                    referenceId:   $assignment->id,
                    performedBy:   $data['issued_by'],
                );
            } else {
                InventoryLifecycleMovement::create([
                    'item_id'        => $subject->id,
                    'quantity'       => $data['quantity'] ?? 1,
                    'movement_type'  => 'department_allocated',
                    'reference_type' => 'assignment',
                    'reference_id'   => $assignment->id,
                    'performed_by'   => $data['issued_by'],
                    'performed_at'   => now(),
                ]);
            }

            $itemId = $isInstance ? $subject->item_id : $subject->id;
            $this->syncItemQty($itemId);

            return $assignment;
        });
    }

    // -------------------------------------------------------------------------
    // GROUP ALLOCATION
    // -------------------------------------------------------------------------

    /**
     * Allocate to an inventory group.
     *
     * @param  array{
     *   group_id: int,
     *   issued_by: int,
     *   quantity?: float,
     * }  $data
     */
    public function allocateToGroup(InventoryInstance|InventoryItem $subject, array $data): InventoryAssignment
    {
        $group = InventoryGroup::findOrFail($data['group_id']);

        return DB::transaction(function () use ($subject, $data, $group) {
            $isInstance = $subject instanceof InventoryInstance;

            if ($isInstance) {
                $this->assertInstanceAvailable($subject);
            }

            $assignment = InventoryAssignment::create([
                'item_id'         => $isInstance ? $subject->item_id : $subject->id,
                'instance_id'     => $isInstance ? $subject->id : null,
                'quantity'        => $isInstance ? 1 : ($data['quantity'] ?? 1),
                'assignment_type' => 'group_allocation',
                'assignee_type'   => 'group',
                'assignee_id'     => $group->id,
                'assignee_label'  => $group->name,
                'issued_by'       => $data['issued_by'],
                'issued_at'       => now(),
                'status'          => 'active',
            ]);

            if ($isInstance) {
                $subject->update([
                    'status'                 => 'issued',
                    'current_assignee_type'  => 'group',
                    'current_assignee_id'    => $group->id,
                    'current_assignee_label' => $group->name,
                    'current_assignment_id'  => $assignment->id,
                ]);

                $subject->logMovement(
                    type:          'group_allocated',
                    statusBefore:  'available',
                    statusAfter:   'issued',
                    referenceType: 'assignment',
                    referenceId:   $assignment->id,
                    performedBy:   $data['issued_by'],
                );
            } else {
                InventoryLifecycleMovement::create([
                    'item_id'        => $subject->id,
                    'quantity'       => $data['quantity'] ?? 1,
                    'movement_type'  => 'group_allocated',
                    'reference_type' => 'assignment',
                    'reference_id'   => $assignment->id,
                    'performed_by'   => $data['issued_by'],
                    'performed_at'   => now(),
                ]);
            }

            $itemId = $isInstance ? $subject->item_id : $subject->id;
            $this->syncItemQty($itemId);

            return $assignment;
        });
    }

    // -------------------------------------------------------------------------
    // RETURN
    // Works for issue, loan, department_allocation, group_allocation.
    // -------------------------------------------------------------------------

    /**
     * Process a return against an active assignment.
     *
     * @param  array{
     *   received_by: int,
     *   return_condition?: string|null,
     *   return_score_override?: float|null,
     *   return_notes?: string|null,
     *   return_discrepancy_notes?: string|null,
     *   location_id?: int|null,         — where item is being returned to
     * }  $data
     */
    public function returnAssignment(InventoryAssignment $assignment, array $data): InventoryAssignment
    {
        if ($assignment->status !== 'active' && $assignment->status !== 'overdue') {
            throw new \LogicException("Assignment #{$assignment->id} is not returnable (status: {$assignment->status}).");
        }

        return DB::transaction(function () use ($assignment, $data) {
            $isLoan          = $assignment->assignment_type === 'loan';
            $returnCondition = $data['return_condition'] ?? null;
            $returnScore     = $returnCondition
                ? \App\Traits\Inventory\HasConditionScore::scoreFromCondition($returnCondition)
                : null;
            $finalScore      = $data['return_score_override'] ?? $returnScore;

            $assignment->update([
                'returned_at'               => now(),
                'received_by'               => $data['received_by'],
                'return_condition'          => $returnCondition,
                'return_condition_score'    => $returnScore,
                'return_score_override'     => $data['return_score_override'] ?? null,
                'return_notes'              => $data['return_notes'] ?? null,
                'return_discrepancy_notes'  => $data['return_discrepancy_notes'] ?? null,
                'status'                    => 'returned',
            ]);

            // Update instance if serialized
            if ($assignment->instance_id) {
                $instance = $assignment->instance;
                $statusBefore = $instance->status;

                $instanceUpdate = [
                    'status'                 => 'available',
                    'current_assignee_type'  => null,
                    'current_assignee_id'    => null,
                    'current_assignee_label' => null,
                    'current_assignment_id'  => null,
                ];

                if ($returnCondition) {
                    $instanceUpdate['condition']       = $returnCondition;
                    $instanceUpdate['condition_score'] = $finalScore;
                }

                if (! empty($data['location_id'])) {
                    $instanceUpdate['current_location_id'] = $data['location_id'];
                }

                $instance->update($instanceUpdate);

                $instance->logMovement(
                    type:            $isLoan ? 'loan_returned' : 'returned',
                    conditionBefore: $assignment->issue_condition,
                    conditionAfter:  $returnCondition ?? $instance->condition,
                    statusBefore:    $statusBefore,
                    statusAfter:     'available',
                    scoreBefore:     $assignment->issue_condition_score,
                    scoreAfter:      $finalScore ?? $instance->condition_score,
                    referenceType:   'assignment',
                    referenceId:     $assignment->id,
                    performedBy:     $data['received_by'],
                    notes:           $data['return_notes'] ?? null,
                );

                // Log location movement if return location differs from current
                if (! empty($data['location_id']) && $data['location_id'] !== $instance->getOriginal('current_location_id')) {
                    $toLocation = \App\Models\Inventory\InventoryLocation::find($data['location_id']);
                    $fromLocation = $instance->currentLocation;

                    $instance->logLocationChange(
                        fromLocationId:    $fromLocation?->id,
                        toLocationId:      $data['location_id'],
                        fromLocationLabel: $fromLocation?->name,
                        toLocationLabel:   $toLocation?->name ?? '',
                        reason:            'return',
                        referenceType:     'assignment',
                        referenceId:       $assignment->id,
                        movedBy:           $data['received_by'],
                    );
                }
            } else {
                // Bulk return — lifecycle movement only
                InventoryLifecycleMovement::create([
                    'item_id'        => $assignment->item_id,
                    'instance_id'    => null,
                    'quantity'       => $assignment->quantity,
                    'movement_type'  => $isLoan ? 'loan_returned' : 'returned',
                    'reference_type' => 'assignment',
                    'reference_id'   => $assignment->id,
                    'performed_by'   => $data['received_by'],
                    'performed_at'   => now(),
                    'notes'          => $data['return_notes'] ?? null,
                ]);
            }

            $this->syncItemQty($assignment->item_id);

            return $assignment->fresh();
        });
    }

    // -------------------------------------------------------------------------
    // MARK OVERDUE
    // Can be called by a scheduled job — bulk-marks active assignments past due.
    // -------------------------------------------------------------------------

    public function markOverdueAssignments(): int
    {
        return InventoryAssignment::query()
            ->where('status', 'active')
            ->whereNotNull('expected_return_date')
            ->whereDate('expected_return_date', '<', now())
            ->update(['status' => 'overdue']);
    }

    // -------------------------------------------------------------------------
    // LOCATION MOVE
    // Move an instance (or bulk item qty) to a new physical location.
    // -------------------------------------------------------------------------

    /**
     * @param  array{
     *   to_location_id: int,
     *   moved_by: int,
     *   reason?: string|null,
     *   notes?: string|null,
     *   reference_type?: string|null,
     *   reference_id?: int|null,
     * }  $data
     */
    public function moveInstance(InventoryInstance $instance, array $data): InventoryLocationMovement
    {
        return DB::transaction(function () use ($instance, $data) {
            $fromLocation = $instance->currentLocation;
            $toLocation   = \App\Models\Inventory\InventoryLocation::findOrFail($data['to_location_id']);

            $move = $instance->logLocationChange(
                fromLocationId:    $fromLocation?->id,
                toLocationId:      $toLocation->id,
                fromLocationLabel: $fromLocation?->name,
                toLocationLabel:   $toLocation->name,
                reason:            $data['reason'] ?? null,
                referenceType:     $data['reference_type'] ?? null,
                referenceId:       $data['reference_id'] ?? null,
                movedBy:           $data['moved_by'],
                notes:             $data['notes'] ?? null,
            );

            $instance->update(['current_location_id' => $toLocation->id]);

            return $move;
        });
    }

    // -------------------------------------------------------------------------
    // QTY SYNC
    // Recomputes all qty columns on inventory_items from live instance statuses.
    // Only called internally after any state-changing transaction.
    // -------------------------------------------------------------------------

    public function syncItemQty(int $itemId): void
    {
        $item = InventoryItem::findOrFail($itemId);

        if ($item->is_serialized) {
            $counts = InventoryInstance::where('item_id', $itemId)
                ->whereNull('deleted_at')
                ->selectRaw("
                    COUNT(*) as total_qty,
                    SUM(status = 'available')  as available_qty,
                    SUM(status = 'reserved')   as reserved_qty,
                    SUM(status IN ('issued','loaned')) as issued_qty,
                    SUM(status = 'loaned')     as loaned_qty,
                    SUM(status = 'in_repair')  as in_repair_qty,
                    SUM(status = 'retired')    as retired_qty
                ")
                ->first();

            $item->update([
                'total_qty'     => $counts->total_qty     ?? 0,
                'available_qty' => $counts->available_qty ?? 0,
                'reserved_qty'  => $counts->reserved_qty  ?? 0,
                'issued_qty'    => $counts->issued_qty    ?? 0,
                'loaned_qty'    => $counts->loaned_qty    ?? 0,
                'in_repair_qty' => $counts->in_repair_qty ?? 0,
                'retired_qty'   => $counts->retired_qty   ?? 0,
            ]);
        } else {
            // Non-serialized: derive from active assignments
            $issued = InventoryAssignment::where('item_id', $itemId)
                ->whereIn('status', ['active', 'overdue'])
                ->sum('quantity');

            $item->update([
                'issued_qty'    => $issued,
                'available_qty' => max(0, $item->total_qty - $issued),
            ]);
        }
    }

    // -------------------------------------------------------------------------
    // INTERNAL GUARDS
    // -------------------------------------------------------------------------

    private function assertInstanceAvailable(InventoryInstance $instance): void
    {
        if ($instance->status !== 'available') {
            throw new \RuntimeException(
                "Instance #{$instance->id} ({$instance->asset_tag}) is not available (status: {$instance->status})."
            );
        }

        if ($instance->is_obsolete) {
            throw new \RuntimeException(
                "Instance #{$instance->id} is marked obsolete and cannot be assigned."
            );
        }
    }
}