<?php

namespace App\Providers;

use App\Models\Project;
use App\Policies\ProjectPolicy;

use App\Models\User;
use App\Policies\UserPolicy;

use App\Models\Vendor;
use App\Policies\VendorPolicy;

use App\Models\Employee;
use App\Policies\EmployeePolicy;

use App\Models\Payment;
use App\Policies\PaymentPolicy;

use App\Models\Customer;
use App\Policies\LoyaltyPolicy;

use App\Models\Booking;
use App\Policies\BookingPolicy;

use App\Models\AiProviderKey;
use App\Policies\AiProviderKeyPolicy;



use Illuminate\Foundation\Support\Providers\AuthServiceProvider as ServiceProvider;

class AuthServiceProvider extends ServiceProvider
{
    protected $policies = [
        Project::class => ProjectPolicy::class,
        User::class => UserPolicy::class,
        Vendor::class => VendorPolicy::class,
        Employee::class => EmployeePolicy::class,
        Payment::class => PaymentPolicy::class,
        Customer::class => LoyaltyPolicy::class,
        Booking::class => BookingPolicy::class,
        AiProviderKey::class => AiProviderKeyPolicy::class,

    ];

    public function boot(): void
    {
        $this->registerPolicies();
    }
}