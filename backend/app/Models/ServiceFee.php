<?php

namespace App\Models;

use App\Models\Books\Ledger;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * A fee switched on (or off) for one service: the fee is a ledger in Service Fees (or the service deposits and pass-through
 * liabilities), this row says whether the service carries it, its amount here (empty = the ledger's own) and when it applies.
 */
class ServiceFee extends Model
{
    public const CONDITIONS = ['always', 'onsite', 'urgent', 'after_hours', 'group'];

    protected $table = 'service_fees';

    protected $fillable = ['service_id', 'ledger_id', 'is_enabled', 'amount', 'condition', 'condition_value', 'position'];

    protected $casts = ['is_enabled' => 'boolean', 'amount' => 'decimal:6', 'condition_value' => 'decimal:2'];

    public function service(): BelongsTo
    {
        return $this->belongsTo(Service::class);
    }

    public function ledger(): BelongsTo
    {
        return $this->belongsTo(Ledger::class, 'ledger_id');
    }
}
