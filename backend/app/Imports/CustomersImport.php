<?php

namespace App\Imports;

use App\Models\User;
use App\Models\Customer;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\DB;
use Maatwebsite\Excel\Concerns\ToModel;
use Maatwebsite\Excel\Concerns\WithHeadingRow;
use Maatwebsite\Excel\Concerns\WithChunkReading;
use Maatwebsite\Excel\Concerns\WithValidation;
use Maatwebsite\Excel\Concerns\WithBatchInserts;

class CustomersImport implements ToModel, WithHeadingRow, WithChunkReading, WithValidation
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

        return DB::transaction(function () use ($row, $email) {
            // 1. Create or find User
            $user = User::updateOrCreate(
                ['email' => $email],
                [
                    'name'              => $row['name'] ?? 'Customer',
                    'password'          => Hash::make($row['password'] ?? 'TempPass123!'),
                    'role'              => 'customer',
                    'phone'             => $this->normalizeKenyanPhone($row['phone'] ?? null),
                    'company_name'      => $row['company_name'] ?? null,
                    'status'            => $row['status'] ?? 'active',
                    'email_verified_at' => !empty($row['email_verified']) ? now() : null,
                    'oauth_provider'    => 'email',
                ]
            );

            // 2. Create/Update Customer record
            $nameParts = explode(' ', trim($row['name'] ?? ''), 2);
            
            return Customer::updateOrCreate(
                ['user_id' => $user->id],
                [
                    'email'                      => $email, 
                    'customer_number'            => $row['customer_number'] ?? ('CUST-' . date('Y') . '-' . str_pad($user->id, 4, '0', STR_PAD_LEFT)),
                    'first_name'                 => $nameParts[0] ?? '',
                    'last_name'                  => $nameParts[1] ?? '',
                    'phone'                      => $this->normalizeKenyanPhone($row['phone'] ?? null),
                    'alternate_phone'            => $this->normalizeKenyanPhone($row['alternate_phone'] ?? null),
                    'profile_image'              => $row['profile_image'] ?? null,
                    'birthday'                   => $this->parseDate($row['birthday'] ?? null),
                    'company_name'               => $row['company_name'] ?? null,
                    'company_registration_number'=> $row['company_registration_number'] ?? null,
                    'tax_id'                     => $row['tax_id'] ?? null,
                    'customer_type'              => $row['customer_type'] ?? 'individual',
                    'tier'                       => $row['tier'] ?? 'bronze',
                    'default_shipping_address'   => $row['default_shipping_address'] ?? null,
                    'default_billing_address'    => $row['default_billing_address'] ?? null,
                    'has_credit_account'         => !empty($row['has_credit_account']) ? 1 : 0,
                    'credit_limit'               => $row['credit_limit'] ?? null,
                    'discount_percentage'        => $row['discount_percentage'] ?? 0.00,
                    'store_credit'               => $row['store_credit'] ?? 0.00,
                    'loyalty_points'             => $row['loyalty_points'] ?? 0,
                    'status'                     => $row['status'] ?? 'active',
                    'status_reason'              => $row['status_reason'] ?? null,
                    'is_verified'                => !empty($row['is_verified']) ? 1 : 0,
                    'tags'                       => !empty($row['tags']) ? json_decode($row['tags'], true) : null,
                    'notes'                      => $row['notes'] ?? null,
                    'preferences'                => !empty($row['preferences']) ? json_decode($row['preferences'], true) : null,
                    'website'                    => $this->safeString($row['website'] ?? null),
                    'whatsapp'                   => $this->normalizeKenyanPhone($row['whatsapp'] ?? null),
                    'assigned_sales_rep'         => $row['assigned_sales_rep'] ?? null,
                ]
            );
        });
    }

    public function rules(): array
    {
        return [
            '*.email'         => 'required|email',
            '*.name'          => 'required|string|max:255',
            '*.phone'         => 'nullable|max:255', // Removed 'string' to allow Excel numeric parsing
            '*.customer_type' => 'nullable|in:individual,business,wholesale,contractor',
            '*.tier'          => 'nullable|in:bronze,silver,gold,platinum',
            '*.status'        => 'nullable|in:active,inactive,suspended,blacklisted',
        ];
    }
}