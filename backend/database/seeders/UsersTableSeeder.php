<?php

namespace Database\Seeders;

use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;

class UsersTableSeeder extends Seeder
{
    /**
     * Run the database seeds.
     */
    public function run(): void
    {
        $users = [
            // Super Admins
            [
                'name' => 'Super Admin One',
                'email' => 'superadmin1@example.com',
                'phone' => '0700000001',
                'role' => 'super_admin',
            ],
            [
                'name' => 'Super Admin Two',
                'email' => 'superadmin2@example.com',
                'phone' => '0700000002',
                'role' => 'super_admin',
            ],

            // Admins
            [
                'name' => 'Admin One',
                'email' => 'admin1@example.com',
                'phone' => '0700000003',
                'role' => 'admin',
            ],
            [
                'name' => 'Admin Two',
                'email' => 'admin2@example.com',
                'phone' => '0700000004',
                'role' => 'admin',
            ],

            // Managers
            [
                'name' => 'Manager One',
                'email' => 'manager1@example.com',
                'phone' => '0700000005',
                'role' => 'manager',
            ],
            [
                'name' => 'Manager Two',
                'email' => 'manager2@example.com',
                'phone' => '0700000006',
                'role' => 'manager',
            ],

            // Sales Reps
            [
                'name' => 'Sales Rep One',
                'email' => 'sales1@example.com',
                'phone' => '0700000007',
                'role' => 'sales_rep',
            ],
            [
                'name' => 'Sales Rep Two',
                'email' => 'sales2@example.com',
                'phone' => '0700000008',
                'role' => 'sales_rep',
            ],
        ];

        foreach ($users as $data) {
            // Avoid duplicates if seeder is re-run (email already unique)
            $exists = User::where('email', $data['email'])->exists();

            if (!$exists) {
                $user = User::create([
                    'name' => $data['name'],
                    'email' => $data['email'],
                    'password' => Hash::make('ChangeMe123!'), // change in prod
                    'phone' => $data['phone'],
                    'role' => $data['role'],
                    'status' => 'active',
                    'email_verified_at' => now(),
                ]);

                $this->command?->info("✅ Created {$data['role']} user: {$user->email}");
            } else {
                $this->command?->info("ℹ️ User already exists: {$data['email']}");
            }
        }

        $this->command?->warn('⚠️ Default password for all seeded users: ChangeMe123! (change in production)');
    }
}
