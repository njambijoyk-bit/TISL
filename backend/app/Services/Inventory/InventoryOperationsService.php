<?php

namespace App\Services\Inventory;

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Auth;
use Maatwebsite\Excel\Facades\Excel;
use App\Models\Inventory\{
    InventoryInstance,
    InventoryItem,
    InventoryAssignment,
    InventoryRepair,
    InventoryDispute,
    InventoryReturnAudit,
    InventoryReturnAuditItem,
    InventoryLifecycleMovement,
    InventoryExportLog,
    InventoryExportPreset,
};

// =============================================================================
// InventoryOperationsService
//
// Owns everything that isn't a direct assignment transaction:
//   - Repairs pipeline (report → send → complete / unrepairable)
//   - Return audits (offboarding, scheduled, ad-hoc, dispute-triggered)
//   - Disputes (open → rule → resolve, link to repair/replacement)
//   - Obsolescence declaration
//   - Write-off / disposal
//   - Excel export with column picker + preset management + export log
// =============================================================================
class InventoryOperationsService
{
    public function __construct(
        private InventoryTransactionService $transactions,
    ) {}

    // =========================================================================
    // REPAIRS
    // =========================================================================

    /**
     * Report a fault and open a repair record.
     *
     * @param  array{
     *   instance_id: int,
     *   reported_by: int,
     *   fault_category: string,
     *   issue_description: string,
     *   vendor_name?: string|null,
     *   estimated_cost?: float|null,
     *   notes?: string|null,
     * }  $data
     */
    public function reportRepair(array $data): InventoryRepair
    {
        $instance = InventoryInstance::findOrFail($data['instance_id']);

        return DB::transaction(function () use ($instance, $data) {
            // Count prior repairs for this instance to set repair_sequence
            $sequence = InventoryRepair::where('instance_id', $instance->id)->count() + 1;

            $repair = InventoryRepair::create([
                'instance_id'          => $instance->id,
                'item_id'              => $instance->item_id,
                'reported_by'          => $data['reported_by'],
                'reported_at'          => now(),
                'fault_category'       => $data['fault_category'],
                'issue_description'    => $data['issue_description'],
                'condition_before'     => $instance->condition,
                'condition_score_before' => $instance->condition_score,
                'vendor_name'          => $data['vendor_name'] ?? null,
                'estimated_cost'       => $data['estimated_cost'] ?? null,
                'status'               => 'reported',
                'repair_sequence'      => $sequence,
                'notes'                => $data['notes'] ?? null,
            ]);

            // Instance moves to in_repair
            $statusBefore = $instance->status;
            $instance->update(['status' => 'in_repair']);

            $instance->logMovement(
                type:          'repair_out',
                statusBefore:  $statusBefore,
                statusAfter:   'in_repair',
                referenceType: 'repair',
                referenceId:   $repair->id,
                performedBy:   $data['reported_by'],
                notes:         $data['issue_description'],
            );

            $this->transactions->syncItemQty($instance->item_id);

            return $repair;
        });
    }

    /**
     * Mark repair as sent to vendor.
     *
     * @param  array{
     *   sent_by: int,
     *   vendor_name?: string|null,
     *   technician_name?: string|null,
     *   repair_location?: string|null,
     *   expected_return_date?: string|null,
     * }  $data
     */
    public function sendRepair(InventoryRepair $repair, array $data): InventoryRepair
    {
        if ($repair->status !== 'reported') {
            throw new \LogicException("Repair #{$repair->id} cannot be sent (status: {$repair->status}).");
        }

        $repair->update([
            'status'               => 'sent',
            'sent_at'              => now(),
            'vendor_name'          => $data['vendor_name'] ?? $repair->vendor_name,
            'technician_name'      => $data['technician_name'] ?? null,
            'repair_location'      => $data['repair_location'] ?? null,
            'expected_return_date' => $data['expected_return_date'] ?? null,
        ]);

        return $repair->fresh();
    }

    /**
     * Complete a repair and return the instance to available.
     *
     * @param  array{
     *   completed_by: int,
     *   condition_after: string,
     *   actual_cost?: float|null,
     *   resolution_notes?: string|null,
     *   location_id?: int|null,
     * }  $data
     */
    public function completeRepair(InventoryRepair $repair, array $data): InventoryRepair
    {
        if (! in_array($repair->status, ['sent', 'in_progress'])) {
            throw new \LogicException("Repair #{$repair->id} cannot be completed (status: {$repair->status}).");
        }

        return DB::transaction(function () use ($repair, $data) {
            $instance    = $repair->instance;
            $scoreAfter  = \App\Traits\Inventory\HasConditionScore::scoreFromCondition($data['condition_after']);

            $repair->update([
                'status'               => 'completed',
                'returned_at'          => now(),
                'condition_after'      => $data['condition_after'],
                'condition_score_after' => $scoreAfter,
                'actual_cost'          => $data['actual_cost'] ?? null,
                'resolution_notes'     => $data['resolution_notes'] ?? null,
            ]);

            $instance->update([
                'status'          => 'available',
                'condition'       => $data['condition_after'],
                'condition_score' => $scoreAfter,
                'current_location_id' => $data['location_id'] ?? $instance->current_location_id,
            ]);

            // Two movements: repair_in + condition_updated
            $instance->logMovement(
                type:            'repair_in',
                conditionBefore: $repair->condition_before,
                conditionAfter:  $data['condition_after'],
                statusBefore:    'in_repair',
                statusAfter:     'available',
                scoreBefore:     $repair->condition_score_before,
                scoreAfter:      $scoreAfter,
                referenceType:   'repair',
                referenceId:     $repair->id,
                performedBy:     $data['completed_by'],
                notes:           $data['resolution_notes'] ?? null,
            );

            $instance->logMovement(
                type:            'condition_updated',
                conditionBefore: $repair->condition_before,
                conditionAfter:  $data['condition_after'],
                scoreBefore:     $repair->condition_score_before,
                scoreAfter:      $scoreAfter,
                referenceType:   'repair',
                referenceId:     $repair->id,
                performedBy:     $data['completed_by'],
            );

            $this->transactions->syncItemQty($instance->item_id);

            return $repair->fresh();
        });
    }

    /**
     * Mark a repair as unrepairable and retire the instance.
     */
    public function markUnrepairable(InventoryRepair $repair, array $data): InventoryRepair
    {
        return DB::transaction(function () use ($repair, $data) {
            $instance = $repair->instance;

            $repair->update([
                'status'           => 'unrepairable',
                'resolution_notes' => $data['resolution_notes'] ?? null,
                'actual_cost'      => $data['actual_cost'] ?? null,
            ]);

            $instance->update([
                'status'    => 'retired',
                'condition' => 'unusable',
                'condition_score' => 0,
            ]);

            $instance->logMovement(
                type:          'status_changed',
                statusBefore:  'in_repair',
                statusAfter:   'retired',
                conditionAfter: 'unusable',
                scoreAfter:    0,
                referenceType: 'repair',
                referenceId:   $repair->id,
                performedBy:   $data['declared_by'],
                notes:         $data['resolution_notes'] ?? 'Marked unrepairable',
            );

            $this->transactions->syncItemQty($instance->item_id);

            return $repair->fresh();
        });
    }

    // =========================================================================
    // DISPUTES
    // =========================================================================

    /**
     * Open a dispute against an assignment.
     *
     * @param  array{
     *   assignment_id: int,
     *   instance_id?: int|null,
     *   item_id: int,
     *   raised_by: int,
     *   dispute_type: string,
     *   description: string,
     *   evidence_notes?: string|null,
     *   against_assignee_type?: string|null,
     *   against_assignee_id?: int|null,
     *   against_assignee_label?: string|null,
     * }  $data
     */
    public function openDispute(array $data): InventoryDispute
    {
        return DB::transaction(function () use ($data) {
            $dispute = InventoryDispute::create([
                'assignment_id'          => $data['assignment_id'],
                'instance_id'            => $data['instance_id'] ?? null,
                'item_id'                => $data['item_id'],
                'raised_by'              => $data['raised_by'],
                'raised_at'              => now(),
                'dispute_type'           => $data['dispute_type'],
                'description'            => $data['description'],
                'evidence_notes'         => $data['evidence_notes'] ?? null,
                'against_assignee_type'  => $data['against_assignee_type'] ?? null,
                'against_assignee_id'    => $data['against_assignee_id'] ?? null,
                'against_assignee_label' => $data['against_assignee_label'] ?? null,
                'status'                 => 'open',
            ]);

            // Mark the assignment as disputed
            InventoryAssignment::where('id', $data['assignment_id'])
                ->update(['status' => 'disputed']);

            return $dispute;
        });
    }

    /**
     * Rule on a dispute and apply consequences.
     *
     * @param  array{
     *   ruling: string,
     *   ruling_by: int,
     *   ruling_notes?: string|null,
     *   replacement_required?: bool,
     *   replacement_instance_id?: int|null,
     *   repair_required?: bool,
     *   financial_liability?: float|null,
     * }  $data
     */
    public function ruleDispute(InventoryDispute $dispute, array $data): InventoryDispute
    {
        if (! in_array($dispute->status, ['open', 'under_review', 'escalated'])) {
            throw new \LogicException("Dispute #{$dispute->id} is already resolved.");
        }

        return DB::transaction(function () use ($dispute, $data) {
            $dispute->update([
                'ruling'                  => $data['ruling'],
                'ruling_by'               => $data['ruling_by'],
                'ruling_at'               => now(),
                'ruling_notes'            => $data['ruling_notes'] ?? null,
                'replacement_required'    => $data['replacement_required'] ?? false,
                'replacement_instance_id' => $data['replacement_instance_id'] ?? null,
                'repair_required'         => $data['repair_required'] ?? false,
                'financial_liability'     => $data['financial_liability'] ?? null,
                'status'                  => 'resolved',
            ]);

            // If a replacement instance is being issued, link it and trigger an issue
            if (! empty($data['replacement_instance_id'])) {
                $replacement = InventoryInstance::findOrFail($data['replacement_instance_id']);
                // The caller is responsible for issuing the replacement via TransactionService
                // — we just log the link here
                $replacement->logMovement(
                    type:          'status_changed',
                    statusBefore:  $replacement->status,
                    statusAfter:   $replacement->status,
                    referenceType: 'dispute',
                    referenceId:   $dispute->id,
                    performedBy:   $data['ruling_by'],
                    notes:         "Linked as replacement for dispute #{$dispute->id}",
                );
            }

            // If repair required, trigger reportRepair automatically
            if (! empty($data['repair_required']) && $dispute->instance_id) {
                $repair = $this->reportRepair([
                    'instance_id'       => $dispute->instance_id,
                    'reported_by'       => $data['ruling_by'],
                    'fault_category'    => 'unknown',
                    'issue_description' => "Repair triggered by dispute #{$dispute->id}: {$dispute->description}",
                ]);

                $dispute->update(['repair_id' => $repair->id]);
            }

            return $dispute->fresh();
        });
    }

    // =========================================================================
    // RETURN AUDITS
    // =========================================================================

    /**
     * Create a return audit and populate its items from active assignments.
     *
     * @param  array{
     *   trigger_type: string,
     *   assignee_type: string,
     *   assignee_id: int|null,
     *   assignee_label: string,
     *   conducted_by: int,
     *   audit_date?: string,
     *   notes?: string|null,
     * }  $data
     */
    public function createAudit(array $data): InventoryReturnAudit
    {
        return DB::transaction(function () use ($data) {
            $audit = InventoryReturnAudit::create([
                'trigger_type'   => $data['trigger_type'],
                'assignee_type'  => $data['assignee_type'],
                'assignee_id'    => $data['assignee_id'],
                'assignee_label' => $data['assignee_label'],
                'conducted_by'   => $data['conducted_by'],
                'audit_date'     => $data['audit_date'] ?? now()->toDateString(),
                'status'         => 'in_progress',
                'notes'          => $data['notes'] ?? null,
            ]);

            // Pull all active assignments for this assignee
            $assignments = InventoryAssignment::query()
                ->where('assignee_type', $data['assignee_type'])
                ->where('assignee_id', $data['assignee_id'])
                ->whereIn('status', ['active', 'overdue'])
                ->with(['instance', 'item'])
                ->get();

            $audit->update(['items_expected' => $assignments->count()]);

            foreach ($assignments as $assignment) {
                $instance = $assignment->instance;

                InventoryReturnAuditItem::create([
                    'audit_id'           => $audit->id,
                    'assignment_id'      => $assignment->id,
                    'instance_id'        => $instance?->id,
                    'item_id'            => $assignment->item_id,
                    'item_name'          => $assignment->item->name,
                    'asset_tag'          => $instance?->asset_tag,
                    'serial_number'      => $instance?->serial_number,
                    'expected_condition' => $assignment->issue_condition,
                    'expected_score'     => $assignment->issue_condition_score,
                    'is_returned'        => false,
                    'disposition'        => 'pending',
                ]);
            }

            return $audit->fresh(['auditItems']);
        });
    }

    /**
     * Record the actual condition of an item during an audit.
     *
     * @param  array{
     *   is_returned: bool,
     *   actual_condition?: string|null,
     *   score_override?: float|null,
     *   discrepancy_notes?: string|null,
     *   disposition: string,
     * }  $data
     */
    public function recordAuditItem(InventoryReturnAuditItem $auditItem, array $data): InventoryReturnAuditItem
    {
        $actualScore = isset($data['actual_condition'])
            ? \App\Traits\Inventory\HasConditionScore::scoreFromCondition($data['actual_condition'])
            : null;

        $finalScore = $data['is_returned']
            ? ($data['score_override'] ?? $actualScore ?? 0)
            : 0; // Missing items forced to 0

        $auditItem->update([
            'is_returned'       => $data['is_returned'],
            'actual_condition'  => $data['actual_condition'] ?? null,
            'actual_score'      => $actualScore,
            'score_override'    => $data['score_override'] ?? null,
            'final_score'       => $finalScore,
            'discrepancy_notes' => $data['discrepancy_notes'] ?? null,
            'disposition'       => $data['disposition'],
        ]);

        return $auditItem->fresh();
    }

    /**
     * Finalise an audit: compute scores, update counters, mark completed.
     * Optionally bulk-process returns for all returned items.
     *
     * @param  array{
     *   finalised_by: int,
     *   score_override?: float|null,
     *   auto_process_returns?: bool,   — if true, calls returnAssignment() for each returned item
     * }  $data
     */
    public function finaliseAudit(InventoryReturnAudit $audit, array $data): InventoryReturnAudit
    {
        if ($audit->status === 'completed') {
            throw new \LogicException("Audit #{$audit->id} is already completed.");
        }

        return DB::transaction(function () use ($audit, $data) {
            $items    = $audit->auditItems;
            $returned = $items->where('is_returned', true)->count();
            $missing  = $items->where('disposition', 'missing')->count();
            $damaged  = $items->whereIn('disposition', ['damaged_accepted', 'replacement_required', 'written_off'])->count();

            // Compute auto_score: mean of final_score (missing = 0 already set)
            $autoScore = $items->isEmpty()
                ? 0
                : round($items->sum('final_score') / $items->count(), 2);

            $finalScore = $data['score_override'] ?? $autoScore;

            $audit->update([
                'status'         => 'completed',
                'items_returned' => $returned,
                'items_missing'  => $missing,
                'items_damaged'  => $damaged,
                'auto_score'     => $autoScore,
                'score_override' => $data['score_override'] ?? null,
                'final_score'    => $finalScore,
            ]);

            // Optionally process each returned assignment
            if (! empty($data['auto_process_returns'])) {
                foreach ($items->where('is_returned', true) as $auditItem) {
                    if (! $auditItem->assignment_id) continue;

                    $assignment = InventoryAssignment::find($auditItem->assignment_id);
                    if ($assignment && in_array($assignment->status, ['active', 'overdue'])) {
                        $this->transactions->returnAssignment($assignment, [
                            'received_by'      => $data['finalised_by'],
                            'return_condition' => $auditItem->actual_condition,
                            'return_score_override' => $auditItem->score_override,
                            'return_notes'     => $auditItem->discrepancy_notes,
                        ]);
                    }
                }
            }

            return $audit->fresh(['auditItems']);
        });
    }

    // =========================================================================
    // OBSOLESCENCE + WRITE-OFF
    // =========================================================================

    /**
     * Declare an instance obsolete. Does NOT retire it immediately.
     */
    public function declareObsolete(InventoryInstance $instance, array $data): InventoryInstance
    {
        return DB::transaction(function () use ($instance, $data) {
            $instance->update([
                'is_obsolete'          => true,
                'obsolete_reason'      => $data['reason'],
                'obsolete_declared_at' => now(),
                'obsolete_declared_by' => $data['declared_by'],
            ]);

            $instance->logMovement(
                type:          'status_changed',
                statusBefore:  $instance->status,
                statusAfter:   $instance->status, // status unchanged at declaration
                referenceType: 'instance',
                referenceId:   $instance->id,
                performedBy:   $data['declared_by'],
                notes:         "Declared obsolete: {$data['reason']}",
            );

            return $instance->fresh();
        });
    }

    /**
     * Write off a single instance (removes from active pool, status = retired).
     */
    public function writeOff(InventoryInstance $instance, array $data): InventoryInstance
    {
        return DB::transaction(function () use ($instance, $data) {
            $statusBefore = $instance->status;

            $instance->update([
                'status'          => 'retired',
                'condition'       => 'unusable',
                'condition_score' => 0,
            ]);

            $instance->logMovement(
                type:          'written_off',
                statusBefore:  $statusBefore,
                statusAfter:   'retired',
                conditionAfter: 'unusable',
                scoreAfter:    0,
                referenceType: 'instance',
                referenceId:   $instance->id,
                performedBy:   $data['performed_by'],
                notes:         $data['reason'] ?? null,
            );

            $this->transactions->syncItemQty($instance->item_id);

            return $instance->fresh();
        });
    }

    /**
     * Dispose of an instance (status = disposed — permanently removed).
     */
    public function dispose(InventoryInstance $instance, array $data): InventoryInstance
    {
        return DB::transaction(function () use ($instance, $data) {
            $statusBefore = $instance->status;

            $instance->update([
                'status'          => 'disposed',
                'condition'       => 'unusable',
                'condition_score' => 0,
            ]);

            $instance->logMovement(
                type:          'disposed',
                statusBefore:  $statusBefore,
                statusAfter:   'disposed',
                conditionAfter: 'unusable',
                scoreAfter:    0,
                referenceType: 'instance',
                referenceId:   $instance->id,
                performedBy:   $data['performed_by'],
                notes:         $data['reason'] ?? null,
            );

            $this->transactions->syncItemQty($instance->item_id);

            return $instance->fresh();
        });
    }

    // =========================================================================
    // EXPORT
    // Column-picker export with preset management and append-only logging.
    // Assumes Maatwebsite\Excel is installed; swap the driver if needed.
    // =========================================================================

    /**
     * Run an export and write to inventory_export_logs.
     *
     * @param  array{
     *   export_type: string,
     *   exported_by: int,
     *   columns_included: array,
     *   columns_excluded?: array,
     *   filters?: array,
     * }  $config
     */
    public function runExport(array $config): InventoryExportLog
    {
        $rows = $this->buildExportQuery($config);

        $fileName = sprintf(
            'inventory_%s_%s.xlsx',
            $config['export_type'],
            now()->format('Ymd_His')
        );

        // Write the file — swap for S3 or local as needed
        $exportClass = $this->resolveExportClass($config['export_type'], $rows, $config['columns_included']);
        Excel::store($exportClass, "exports/{$fileName}", 'local');

        // Append-only log — never updated after creation
        $log = InventoryExportLog::create([
            'exported_by'      => $config['exported_by'],
            'exported_at'      => now(),
            'export_type'      => $config['export_type'],
            'filters_applied'  => $config['filters'] ?? [],
            'columns_included' => $config['columns_included'],
            'columns_excluded' => $config['columns_excluded'] ?? [],
            'row_count'        => $rows->count(),
            'file_name'        => $fileName,
        ]);

        return $log;
    }

    /**
     * Save or update an export preset for a user.
     *
     * @param  array{
     *   user_id: int,
     *   name: string,
     *   export_type: string,
     *   column_config: array,
     *   filter_config?: array,
     *   is_default?: bool,
     * }  $data
     */
    public function savePreset(array $data): InventoryExportPreset
    {
        $preset = InventoryExportPreset::updateOrCreate(
            [
                'user_id'     => $data['user_id'],
                'name'        => $data['name'],
                'export_type' => $data['export_type'],
            ],
            [
                'column_config' => $data['column_config'],
                'filter_config' => $data['filter_config'] ?? [],
                'is_default'    => $data['is_default'] ?? false,
            ]
        );

        if (! empty($data['is_default'])) {
            $preset->setAsDefault();
        }

        return $preset->fresh();
    }

    /**
     * Load the default preset for a user + export type, if one exists.
     */
    public function loadDefaultPreset(int $userId, string $exportType): ?InventoryExportPreset
    {
        return InventoryExportPreset::where('user_id', $userId)
            ->where('export_type', $exportType)
            ->where('is_default', true)
            ->first();
    }

    // -------------------------------------------------------------------------
    // EXPORT INTERNALS
    // -------------------------------------------------------------------------

    private function buildExportQuery(array $config): \Illuminate\Support\Collection
    {
        return match ($config['export_type']) {
            'instances'   => $this->queryInstances($config),
            'assignments' => $this->queryAssignments($config),
            'lifecycle_movements' => $this->queryLifecycleMovements($config),
            'repairs'     => $this->queryRepairs($config),
            'audits'      => $this->queryAudits($config),
            'disputes'    => $this->queryDisputes($config),
            'items'       => $this->queryItems($config),
            default       => throw new \InvalidArgumentException("Unknown export type: {$config['export_type']}"),
        };
    }

    private function queryInstances(array $config): \Illuminate\Support\Collection
    {
        return InventoryInstance::with(['item', 'currentLocation'])
            ->when(! empty($config['filters']['status']), fn($q) => $q->where('status', $config['filters']['status']))
            ->when(! empty($config['filters']['item_id']), fn($q) => $q->where('item_id', $config['filters']['item_id']))
            ->when(! empty($config['filters']['location_id']), fn($q) => $q->where('current_location_id', $config['filters']['location_id']))
            ->get()
            ->map(fn($row) => $this->pickColumns($row->toArray(), $config['columns_included']));
    }

    private function queryAssignments(array $config): \Illuminate\Support\Collection
    {
        return InventoryAssignment::with(['item', 'instance', 'issuedBy'])
            ->when(! empty($config['filters']['status']), fn($q) => $q->where('status', $config['filters']['status']))
            ->when(! empty($config['filters']['assignee_type']), fn($q) => $q->where('assignee_type', $config['filters']['assignee_type']))
            ->when(! empty($config['filters']['from_date']), fn($q) => $q->whereDate('issued_at', '>=', $config['filters']['from_date']))
            ->when(! empty($config['filters']['to_date']),   fn($q) => $q->whereDate('issued_at', '<=', $config['filters']['to_date']))
            ->get()
            ->map(fn($row) => $this->pickColumns($row->toArray(), $config['columns_included']));
    }

    private function queryLifecycleMovements(array $config): \Illuminate\Support\Collection
    {
        return InventoryLifecycleMovement::with(['item', 'instance'])
            ->when(! empty($config['filters']['movement_type']), fn($q) => $q->where('movement_type', $config['filters']['movement_type']))
            ->when(! empty($config['filters']['from_date']), fn($q) => $q->whereDate('performed_at', '>=', $config['filters']['from_date']))
            ->when(! empty($config['filters']['to_date']),   fn($q) => $q->whereDate('performed_at', '<=', $config['filters']['to_date']))
            ->get()
            ->map(fn($row) => $this->pickColumns($row->toArray(), $config['columns_included']));
    }

    private function queryRepairs(array $config): \Illuminate\Support\Collection
    {
        return InventoryRepair::with(['instance', 'item'])
            ->when(! empty($config['filters']['status']), fn($q) => $q->where('status', $config['filters']['status']))
            ->get()
            ->map(fn($row) => $this->pickColumns($row->toArray(), $config['columns_included']));
    }

    private function queryAudits(array $config): \Illuminate\Support\Collection
    {
        return InventoryReturnAudit::with(['auditItems'])
            ->when(! empty($config['filters']['trigger_type']), fn($q) => $q->where('trigger_type', $config['filters']['trigger_type']))
            ->when(! empty($config['filters']['status']), fn($q) => $q->where('status', $config['filters']['status']))
            ->get()
            ->map(fn($row) => $this->pickColumns($row->toArray(), $config['columns_included']));
    }

    private function queryDisputes(array $config): \Illuminate\Support\Collection
    {
        return InventoryDispute::with(['assignment', 'instance', 'item'])
            ->when(! empty($config['filters']['status']), fn($q) => $q->where('status', $config['filters']['status']))
            ->when(! empty($config['filters']['ruling']), fn($q) => $q->where('ruling', $config['filters']['ruling']))
            ->get()
            ->map(fn($row) => $this->pickColumns($row->toArray(), $config['columns_included']));
    }

    private function queryItems(array $config): \Illuminate\Support\Collection
    {
        return InventoryItem::with(['category'])
            ->when(! empty($config['filters']['type']), fn($q) => $q->where('type', $config['filters']['type']))
            ->when(! empty($config['filters']['is_active']), fn($q) => $q->where('is_active', $config['filters']['is_active']))
            ->get()
            ->map(fn($row) => $this->pickColumns($row->toArray(), $config['columns_included']));
    }

    /**
     * Filter a row array down to only the requested columns.
     */
    private function pickColumns(array $row, array $columns): array
    {
        return array_intersect_key($row, array_flip($columns));
    }

    /**
     * Resolve the Maatwebsite export class for a given type.
     * Each export class accepts the pre-filtered collection + column list.
     * These classes live in App\Exports\Inventory\ and implement FromCollection.
     */
    private function resolveExportClass(string $type, \Illuminate\Support\Collection $rows, array $columns): object
    {
        $class = match ($type) {
            'instances'           => \App\Exports\Inventory\InstancesExport::class,
            'assignments'         => \App\Exports\Inventory\AssignmentsExport::class,
            'lifecycle_movements' => \App\Exports\Inventory\LifecycleMovementsExport::class,
            'repairs'             => \App\Exports\Inventory\RepairsExport::class,
            'audits'              => \App\Exports\Inventory\AuditsExport::class,
            'disputes'            => \App\Exports\Inventory\DisputesExport::class,
            'items'               => \App\Exports\Inventory\ItemsExport::class,
            default               => throw new \InvalidArgumentException("No export class for: {$type}"),
        };

        return new $class($rows, $columns);
    }
}