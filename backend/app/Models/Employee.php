<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class Employee extends Model
{
    use HasFactory, SoftDeletes;

    /**
     * The attributes that are mass assignable.
     */
    protected $fillable = [
        'user_id',
        'employee_number',
        'employee_id',
        'job_title',
        'department',
        'employment_type',
        'hire_date',
        'termination_date',
        'manager_id',
        'work_location',
        'work_phone',
        'work_email',
        'emergency_contact_name',
        'emergency_contact_phone',
        'emergency_contact_relationship',
        'bank_name',
        'bank_account_number',
        'bank_account_name',
        'salary_grade',
        'base_salary',
        'currency',
        'annual_leave_days',
        'leave_balance',
        'id_number',
        'kra_pin',
        'nssf_number',
        'nhif_number',
        'date_of_birth',
        'gender',
        'marital_status',
        'education_level',
        'skills',
        'certifications',
        'status',
        'notes',
        'created_by',
        'updated_by',
    ];

    /**
     * The attributes that should be cast.
     */
    protected $casts = [
        'hire_date' => 'date',
        'termination_date' => 'date',
        'date_of_birth' => 'date',
        'base_salary' => 'decimal:2',
        'leave_balance' => 'decimal:2',
        'annual_leave_days' => 'integer',
        'skills' => 'array',
        'certifications' => 'array',
        'created_at' => 'datetime',
        'updated_at' => 'datetime',
        'deleted_at' => 'datetime',
    ];

    /**
     * Append custom attributes.
     */
    protected $appends = [
        'full_name',
        'tenure_years',
        'age',
    ];

    // ========================================
    // RELATIONSHIPS
    // ========================================

    /**
     * Get the user that owns this employee record.
     */
    public function user()
    {
        return $this->belongsTo(User::class);
    }

    /**
     * Get the manager of this employee.
     */
    public function manager()
    {
        return $this->belongsTo(Employee::class, 'manager_id');
    }

    /**
     * Get all subordinates (employees managed by this employee).
     */
    public function subordinates()
    {
        return $this->hasMany(Employee::class, 'manager_id');
    }

    /**
     * Get the admin who created this employee record.
     */
    public function creator()
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    /**
     * Get the admin who last updated this employee record.
     */
    public function updater()
    {
        return $this->belongsTo(User::class, 'updated_by');
    }

    /**
     * Get customers assigned to this employee (if sales rep).
     */
    public function assignedCustomers()
    {
        return $this->hasMany(Customer::class, 'assigned_sales_rep', 'user_id');
    }

    // ========================================
    // ACCESSORS (Computed Properties)
    // ========================================

    /**
     * Get employee's full name through user relationship.
     */
    public function getFullNameAttribute(): ?string
    {
        return $this->user?->name;
    }

    /**
     * Get employee tenure in years.
     */
    public function getTenureYearsAttribute(): ?float
    {
        if (!$this->hire_date) {
            return null;
        }

        $endDate = $this->termination_date ?? now();
        return round($this->hire_date->diffInDays($endDate) / 365.25, 1);
    }

    /**
     * Get employee age.
     */
    public function getAgeAttribute(): ?int
    {
        if (!$this->date_of_birth) {
            return null;
        }

        return $this->date_of_birth->age;
    }

    // ========================================
    // SCOPES (Query Filters)
    // ========================================

    /**
     * Scope to get only active employees.
     */
    public function scopeActive($query)
    {
        return $query->where('status', 'active');
    }

    /**
     * Scope to get employees on leave.
     */
    public function scopeOnLeave($query)
    {
        return $query->where('status', 'on_leave');
    }

    /**
     * Scope to get employees on probation.
     */
    public function scopeProbation($query)
    {
        return $query->where('status', 'probation');
    }

    /**
     * Scope to get terminated employees.
     */
    public function scopeTerminated($query)
    {
        return $query->where('status', 'terminated');
    }

    /**
     * Scope to filter by department.
     */
    public function scopeByDepartment($query, string $department)
    {
        return $query->where('department', $department);
    }

    /**
     * Scope to filter by employment type.
     */
    public function scopeByEmploymentType($query, string $type)
    {
        return $query->where('employment_type', $type);
    }

    /**
     * Scope to filter by manager.
     */
    public function scopeByManager($query, int $managerId)
    {
        return $query->where('manager_id', $managerId);
    }

    /**
     * Scope to search employees.
     */
    public function scopeSearch($query, string $search)
    {
        return $query->whereHas('user', function ($q) use ($search) {
            $q->where('name', 'like', "%{$search}%")
              ->orWhere('email', 'like', "%{$search}%")
              ->orWhere('phone', 'like', "%{$search}%");
        })->orWhere('employee_number', 'like', "%{$search}%")
          ->orWhere('employee_id', 'like', "%{$search}%")
          ->orWhere('job_title', 'like', "%{$search}%")
          ->orWhere('department', 'like', "%{$search}%");
    }

    /**
     * Scope to get employees hired within a date range.
     */
    public function scopeHiredBetween($query, $startDate, $endDate)
    {
        return $query->whereBetween('hire_date', [$startDate, $endDate]);
    }

    /**
     * Scope to get employees with birthdays in a given month.
     */
    public function scopeBirthdaysInMonth($query, int $month)
    {
        return $query->whereMonth('date_of_birth', $month);
    }

    // ========================================
    // HELPER METHODS
    // ========================================

    /**
     * Check if employee is active.
     */
    public function isActive(): bool
    {
        return $this->status === 'active';
    }

    /**
     * Check if employee can login (active or on leave).
     */
    public function canLogin(): bool
    {
        return in_array($this->status, ['active', 'on_leave']);
    }

    /**
     * Activate employee.
     */
    public function activate(): void
    {
        $this->update(['status' => 'active']);
    }

    /**
     * Put employee on leave.
     */
    public function putOnLeave(): void
    {
        $this->update(['status' => 'on_leave']);
    }

    /**
     * Suspend employee.
     */
    public function suspend(): void
    {
        $this->update(['status' => 'suspended']);
        
        // Also suspend the user account
        if ($this->user) {
            $this->user->update(['status' => 'suspended']);
        }
    }

    /**
     * Terminate employee.
     */
    public function terminate(?string $terminationDate = null): void
    {
        $this->update([
            'status' => 'terminated',
            'termination_date' => $terminationDate ?? now(),
        ]);

        // Also deactivate the user account
        if ($this->user) {
            $this->user->update(['status' => 'inactive']);
            $this->user->tokens()->delete();
        }
    }

    /**
     * Add leave days to balance.
     */
    public function addLeaveDays(float $days): void
    {
        $this->increment('leave_balance', $days);
    }

    /**
     * Use leave days.
     */
    public function useLeaveDays(float $days): bool
    {
        if ($this->leave_balance < $days) {
            return false;
        }

        $this->decrement('leave_balance', $days);
        return true;
    }

    /**
     * Check if employee has a skill.
     */
    public function hasSkill(string $skill): bool
    {
        $skills = $this->skills ?? [];
        return in_array(strtolower($skill), array_map('strtolower', $skills));
    }

    /**
     * Add a skill.
     */
    public function addSkill(string $skill): void
    {
        $skills = $this->skills ?? [];
        if (!in_array($skill, $skills)) {
            $skills[] = $skill;
            $this->update(['skills' => $skills]);
        }
    }

    /**
     * Remove a skill.
     */
    public function removeSkill(string $skill): void
    {
        $skills = $this->skills ?? [];
        $skills = array_filter($skills, fn($s) => strtolower($s) !== strtolower($skill));
        $this->update(['skills' => array_values($skills)]);
    }

    /**
     * Add a certification.
     */
    public function addCertification(array $certification): void
    {
        $certifications = $this->certifications ?? [];
        $certifications[] = $certification;
        $this->update(['certifications' => $certifications]);
    }

    /**
     * Generate employee number.
     */
    public static function generateEmployeeNumber(): string
    {
        $year = date('Y');
        $lastEmployee = self::withTrashed()
            ->whereYear('created_at', $year)
            ->orderBy('id', 'desc')
            ->first();

        $sequence = $lastEmployee
            ? (int) substr($lastEmployee->employee_number, -4) + 1
            : 1;

        return 'EMP-' . $year . '-' . str_pad($sequence, 4, '0', STR_PAD_LEFT);
    }

    /**
     * Get all departments.
     */
    public static function getDepartments(): array
    {
        return self::whereNotNull('department')
            ->distinct()
            ->pluck('department')
            ->toArray();
    }

    /**
     * Get employment types.
     */
    public static function getEmploymentTypes(): array
    {
        return ['full_time', 'part_time', 'contract', 'intern'];
    }

    /**
     * Get status options.
     */
    public static function getStatusOptions(): array
    {
        return ['active', 'on_leave', 'suspended', 'terminated', 'probation'];
    }

    // ========================================
    // BOOT METHOD
    // ========================================

    /**
     * Boot method to auto-generate employee number.
     */
    protected static function boot()
    {
        parent::boot();

        static::creating(function ($employee) {
            if (!$employee->employee_number) {
                $employee->employee_number = self::generateEmployeeNumber();
            }
        });
    }
}