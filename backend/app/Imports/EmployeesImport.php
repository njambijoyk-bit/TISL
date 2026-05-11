<?php

namespace App\Imports;

use App\Models\User;
use App\Models\Employee;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\DB;
use Maatwebsite\Excel\Concerns\ToModel;
use Maatwebsite\Excel\Concerns\WithHeadingRow;
use Maatwebsite\Excel\Concerns\WithChunkReading;
use Maatwebsite\Excel\Concerns\WithValidation;
use Maatwebsite\Excel\Concerns\WithBatchInserts;

class EmployeesImport implements ToModel, WithHeadingRow, WithChunkReading, WithValidation
{
    public function chunkSize(): int { return 50; }

    /** Safely cast to string, returning null for empty/missing values */
    private function safeString($value): ?string
    {
        $val = trim((string)($value ?? ''));
        return $val !== '' ? $val : null;
    }

    /** Parse dates from Excel serials, CSV strings, or DateTime objects */
    private function parseDate($value): ?string
    {
        if (empty($value)) return null;
        try {
            return is_numeric($value)
                ? \PhpOffice\PhpSpreadsheet\Shared\Date::excelToDateTimeObject($value)->format('Y-m-d')
                : \Carbon\Carbon::parse($value)->format('Y-m-d');
        } catch (\Exception $e) {
            return null;
        }
    }

    /** Normalize Kenyan phone numbers to +254 format */
    private function normalizeKenyanPhone($value): ?string
    {
        $phone = $this->safeString($value);
        if (empty($phone)) return null;
        
        // 🚨 Detect scientific notation (e.g., "2.547E+11" or numeric float)
        if (is_numeric($phone) && !preg_match('/^\+?\d{10,13}$/', $phone)) {
            // Convert float to proper integer string, then format
            $num = (int) round(floatval($phone));
            $phone = (string) $num;
        }
        
        // Remove all non-digit characters except leading +
        $clean = preg_replace('/[^0-9+]/', '', $phone);
        
        // Already has +254
        if (str_starts_with($clean, '+254')) {
            return $clean;
        }
        
        // Starts with 254 (no +)
        if (str_starts_with($clean, '254') && strlen($clean) === 12) {
            return '+' . $clean;
        }
        
        // Starts with 0 (e.g., 0712345678) → convert to +254712345678
        if (str_starts_with($clean, '0') && strlen($clean) === 10) {
            return '+254' . substr($clean, 1);
        }
        
        // Already 9 digits (e.g., 712345678) → assume Kenya mobile
        if (preg_match('/^[79]\d{8}$/', $clean) && strlen($clean) === 9) {
            return '+254' . $clean;
        }
        
        // Return as-is if no pattern matched (could be international)
        return $phone;
    }

    public function model(array $row)
    {
        $email = trim($row['email'] ?? '');
        if (empty($email)) {
            return null;
        }

        // Determine role from explicit field or department mapping
        $role = $row['role'] ?? match (strtolower($row['department'] ?? '')) {
            'finance'   => 'finance',
            'logistics' => 'logistics',
            'sales'     => 'sales_rep',
            default     => 'admin',
        };

        return DB::transaction(function () use ($row, $role, $email) {
            
            $userStatus = match($row['status'] ?? 'active') {
                'active'     => 'active',
                'terminated' => 'inactive',
                'suspended'  => 'suspended',
                'on_leave'   => 'active',
                'probation'  => 'active',
                default      => 'active',
            };

            // 1. Create or find User
            $user = User::updateOrCreate(
                ['email' => $email],
                [
                    'name'              => $row['name'] ?? 'Employee',
                    'password'          => Hash::make($row['password'] ?? 'EmpPass123!'),
                    'role'              => $role,
                    'phone'             => $this->normalizeKenyanPhone($row['phone'] ?? null),
                    'employee_id'       => $this->safeString($row['employee_id'] ?? null),
                    'department'        => $row['department'] ?? 'General',
                    'hired_at'          => $this->parseDate($row['hire_date'] ?? null),
                    'status'            => $userStatus,
                    'oauth_provider'    => 'email',
                ]
            );

            // 2. Create/Update Employee record
            return Employee::updateOrCreate(
                ['user_id' => $user->id],
                [
                    'email'                        => $email,
                    'employee_number'              => $this->safeString($row['employee_number'] ?? null) ?? ('EMP-' . date('Y') . '-' . str_pad($user->id, 4, '0', STR_PAD_LEFT)),
                    'employee_id'                  => $this->safeString($row['employee_id'] ?? null),
                    'job_title'                    => $row['job_title'] ?? ucfirst($role),
                    'department'                   => $row['department'] ?? 'General',
                    'employment_type'              => $row['employment_type'] ?? 'full_time',
                    'hire_date'                    => $this->parseDate($row['hire_date'] ?? null),
                    'termination_date'             => $this->parseDate($row['termination_date'] ?? null),
                    'manager_id'                   => $row['manager_id'] ?? null,
                    'work_location'                => $row['work_location'] ?? null,
                    'work_phone'                   => $this->normalizeKenyanPhone($row['work_phone'] ?? $row['phone'] ?? null),
                    'work_email'                   => $row['work_email'] ?? $email,
                    'emergency_contact_name'       => $row['emergency_contact_name'] ?? null,
                    'emergency_contact_phone'      => $this->normalizeKenyanPhone($row['emergency_contact_phone'] ?? null),
                    'emergency_contact_relationship' => $row['emergency_contact_relationship'] ?? null,
                    'bank_name'                    => $row['bank_name'] ?? null,
                    'bank_account_number'          => $this->safeString($row['bank_account_number'] ?? null),
                    'bank_account_name'            => $row['bank_account_name'] ?? null,
                    'salary_grade'                 => $row['salary_grade'] ?? null,
                    'base_salary'                  => is_numeric($row['base_salary'] ?? null) ? (float) $row['base_salary'] : null,
                    'currency'                     => $row['currency'] ?? 'KES',
                    'annual_leave_days'            => is_numeric($row['annual_leave_days'] ?? null) ? (int) $row['annual_leave_days'] : 21,
                    'leave_balance'                => is_numeric($row['leave_balance'] ?? null) ? (float) $row['leave_balance'] : 21.00,
                    'id_number'                    => $this->safeString($row['id_number'] ?? null),
                    'kra_pin'                      => $this->safeString($row['kra_pin'] ?? null),
                    'nssf_number'                  => $this->safeString($row['nssf_number'] ?? null),
                    'nhif_number'                  => $this->safeString($row['nhif_number'] ?? null),
                    'date_of_birth'                => $this->parseDate($row['date_of_birth'] ?? null),
                    'gender'                       => $row['gender'] ?? null,
                    'marital_status'               => $row['marital_status'] ?? null,
                    'education_level'              => $row['education_level'] ?? null,
                    'skills'                       => !empty($row['skills']) ? json_decode($row['skills'], true) : null,
                    'certifications'               => !empty($row['certifications']) ? json_decode($row['certifications'], true) : null,
                    'status'                       => $row['status'] ?? 'probation',
                    'notes'                        => $row['notes'] ?? null,
                    'created_by'                   => auth()->id(),
                ]
            );
        });
    }

    public function rules(): array
    {
        return [
            '*.email'           => 'required|email',
            '*.name'            => 'required|string|max:255',
            '*.department'      => 'required|string|max:255',
            '*.role'            => 'nullable|in:admin,manager,sales_rep,finance,logistics',
            '*.employment_type' => 'nullable|in:full_time,part_time,contract,intern',
            '*.status'          => 'nullable|in:active,on_leave,suspended,terminated,probation',
            '*.gender'          => 'nullable|in:male,female,other,prefer_not_to_say',
            '*.marital_status'  => 'nullable|in:single,married,divorced,widowed',
        ];
    }
}