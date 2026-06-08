<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class BugReportStatusHistory extends Model
{
    protected $table = 'bug_report_status_history';
    public $timestamps = false;

    protected $fillable = [
        'bug_report_id',
        'from_status',
        'to_status',
        'note',
        'changed_by_user_id',
        'created_at',
    ];

    protected $casts = [
        'created_at' => 'datetime',
    ];

    public function bugReport()
    {
        return $this->belongsTo(BugReport::class);
    }

    public function changedBy()
    {
        return $this->belongsTo(User::class, 'changed_by_user_id');
    }
}
