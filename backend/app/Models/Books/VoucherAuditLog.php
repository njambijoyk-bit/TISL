<?php

namespace App\Models\Books;

use App\Models\User;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class VoucherAuditLog extends Model
{
    public $timestamps = false;

    protected $table = 'voucher_audit_logs';

    protected $fillable = ['voucher_id', 'action', 'user_id', 'detail', 'created_at'];

    protected $casts = ['detail' => 'array'];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
