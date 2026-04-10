<?php

namespace App\Providers;

use App\Models\Project;
use App\Policies\ProjectPolicy;

use App\Models\User;
use App\Policies\UserPolicy;

use App\Models\Vendor;
use App\Policies\VendorPolicy;

use Illuminate\Foundation\Support\Providers\AuthServiceProvider as ServiceProvider;

class AuthServiceProvider extends ServiceProvider
{
    protected $policies = [
        Project::class => ProjectPolicy::class,
        User::class => UserPolicy::class,
        Vendor::class => VendorPolicy::class,
    ];

    public function boot(): void
    {
        $this->registerPolicies();
    }
}