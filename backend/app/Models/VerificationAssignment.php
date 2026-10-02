<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/** Who verifies what: a voucher type (or every voucher), payroll runs, or attendance months — all, a percentage, or hand-picked. */
class VerificationAssignment extends Model
{
    public const SCOPES = ['voucher_type' => 'A voucher type', 'all_vouchers' => 'Every voucher', 'payroll' => 'Payroll runs', 'attendance' => 'Attendance months'];
    public const SAMPLING = ['all' => 'Check every one', 'percent' => 'Check a percentage each month', 'manual' => 'Only the ones picked by hand'];

    protected $fillable = ['user_id', 'scope_type', 'scope_id', 'location_id', 'sampling', 'percent', 'from_month', 'to_month', 'is_active', 'created_by'];

    protected $casts = ['is_active' => 'boolean', 'percent' => 'integer'];
}
