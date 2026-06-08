<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class DevNote extends Model
{
    use SoftDeletes;

    protected $fillable = [
        'note_number',
        'bug_report_id',
        'entered_by_user_id',
        'entered_by_dev',
        'type',
        'status',
        'pr_number',
        'pr_url',
        'branch_name',
        'git_url',
        'commit_hash',
        'title',
        'description',
    ];

    protected $casts = [
        'entered_by_dev' => 'boolean',
        'created_at'     => 'datetime',
        'updated_at'     => 'datetime',
        'deleted_at'     => 'datetime',
    ];

    // ── Relationships ─────────────────────────────────────────

    public function bugReport()
    {
        return $this->belongsTo(BugReport::class);
    }

    public function enteredBy()
    {
        return $this->belongsTo(User::class, 'entered_by_user_id');
    }

    // ── Scopes ────────────────────────────────────────────────

    public function scopeStandalone($query)
    {
        return $query->whereNull('bug_report_id');
    }

    public function scopeLinked($query)
    {
        return $query->whereNotNull('bug_report_id');
    }

    public function scopeByStatus($query, string $status)
    {
        return $query->where('status', $status);
    }

    public function scopeByType($query, string $type)
    {
        return $query->where('type', $type);
    }

    // ── Helpers ───────────────────────────────────────────────

    public static function generateNoteNumber(): string
    {
        $year  = now()->year;
        $max   = static::whereYear('created_at', $year)->max('note_number');
        $seq   = $max ? ((int) substr($max, -5)) + 1 : 1;
        return 'DN-' . $year . '-' . str_pad($seq, 5, '0', STR_PAD_LEFT);
    }

    public function isStandalone(): bool
    {
        return is_null($this->bug_report_id);
    }

    public function hasGitDetails(): bool
    {
        return $this->pr_number || $this->pr_url || $this->branch_name || $this->git_url || $this->commit_hash;
    }
}
