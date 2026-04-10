<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use App\Models\User;
use Illuminate\Support\Facades\Hash;

class AdminUserSeeder extends Seeder
{
    /**
     * Run the database seeds.
     */
    public function run(): void
    {
        // Check if admin already exists
        $adminExists = User::where('email', 'admin@tisl.com')->exists();
        
        if (!$adminExists) {
            User::create([
                'name' => 'TISL Admin',
                'email' => 'admin@tisl.com',
                'password' => Hash::make('admin123456'), // Change this password!
                'phone' => '0700000000',
                'role' => 'admin',
                'status' => 'active',
                'email_verified_at' => now(),
            ]);

            $this->command->info('✅ Admin user created successfully!');
            $this->command->info('📧 Email: admin@tisl.com');
            $this->command->info('🔑 Password: admin123');
            $this->command->warn('⚠️  PLEASE CHANGE THIS PASSWORD AFTER FIRST LOGIN!');
        } else {
            $this->command->info('ℹ️  Admin user already exists.');
        }

        // Create a test customer
        $customerExists = User::where('email', 'customer@test.com')->exists();
        
        if (!$customerExists) {
            User::create([
                'name' => 'Test Customer',
                'email' => 'customer@test.com',
                'password' => Hash::make('password123'),
                'phone' => '0711111111',
                'role' => 'customer',
                'status' => 'active',
                'email_verified_at' => now(),
            ]);

            $this->command->info('✅ Test customer created successfully!');
            $this->command->info('📧 Email: customer@test.com');
            $this->command->info('🔑 Password: password123');
        }
    }
}