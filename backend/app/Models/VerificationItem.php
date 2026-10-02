<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/** One thing to verify (a voucher, a payroll run, a person's attendance month) and where its verification has got to. Never changes the thing itself. */
class VerificationItem extends Model
{
    public const STATUSES = [
        'pending' => 'Not checked yet', 'verified' => 'Verified', 'internal_observation' => 'Observation — to clarify internally', 'internal_clarified' => 'Clarified internally',
        'external_query' => 'Query — needs outside clarification', 'external_clarified' => 'Clarified from outside', 'altered' => 'Altered since — check again',
    ];

    /** Statuses that still need the verifier's attention. */
    public const OPEN = ['pending', 'altered', 'internal_observation', 'external_query', 'internal_clarified', 'external_clarified'];

    protected $fillable = ['subject_type', 'subject_key', 'month', 'type_key', 'type_label', 'ref', 'item_date', 'particulars', 'amount', 'assignment_id', 'assigned_to', 'selected', 'status', 'note',
        'verified_stamp', 'verified_by', 'verified_at', 'clarified_by_name', 'clarified_note', 'clarified_at'];

    protected $casts = ['item_date' => 'date:Y-m-d', 'amount' => 'float', 'selected' => 'boolean', 'verified_at' => 'datetime', 'clarified_at' => 'datetime'];
}
