<?php

namespace Tests\Feature;

use Illuminate\Support\Facades\Route;
use Tests\TestCase;

/**
 * Every staff route asks for something more than "may open the admin area", except the areas below, where the controller, a policy or the service
 * checks the person itself (and these lists say why). A new route in a new area therefore cannot be left open by accident: either it gets a permission,
 * or someone adds its prefix here and says who checks it.
 */
class AdminRoutesNeedAPermissionTest extends TestCase
{
    /** prefix => why a route in it may rely on the admin area alone */
    private const CHECKED_INSIDE = [
        'api/admin/vault' => 'the vault policies decide per document and folder',
        'api/admin/campaigns' => 'CampaignAccess: builders see their own, publishers decide',
        'api/admin/boards' => 'CampaignAccess',
        'api/admin/moodboards' => 'CampaignAccess',
        'api/admin/pins' => 'CampaignAccess',
        'api/admin/users' => 'UserPolicy: clearance and users.manage',
        'api/admin/ai-analytics' => 'AiProviderKeyPolicy and the module switches',
        'api/admin/verification' => 'VerificationService: assignments, verification.manage and override',
        'api/admin/attendance' => 'AttendanceService: everyone marks their own day; verifying and settling need attendance permissions',
        'api/admin/loyalty' => 'LoyaltyPolicy: grant, deduct, configure',
        'api/admin/engagement' => 'EngagementAccess: view, moderate, settings',
        'api/admin/petty-cash' => 'PettyCashService: a till spends its own float; top-up and the float need books.pettycash',
        'api/admin/calendar' => 'CalendarService: your own calendar; the team calendar needs calendar.team',
        'api/admin/my-payslips' => 'only ever the signed-in person\'s own payslips',
        'api/admin/currencies' => 'read-only lookup every screen needs (changes need currency.manage)',
        'api/admin/activity-feed' => 'ActivityFeedService shows each person only the feeds their permissions open',
        'api/modules/setup' => 'first-time ownership code, open to staff only while the install is unverified',
    ];

    public function test_every_staff_route_has_a_permission_or_a_named_reason(): void
    {
        $open = [];
        foreach (Route::getRoutes()->getRoutes() as $route) {
            $uri = $route->uri();
            if (! str_starts_with($uri, 'api/admin/') && ! str_starts_with($uri, 'api/modules/setup')) {
                continue;
            }
            $perms = [];
            foreach ($route->middleware() as $m) {
                if (is_string($m) && str_starts_with($m, 'permission:')) {
                    $perms[] = substr($m, 11);
                }
            }
            if ($perms !== ['admin.access']) {
                continue;
            }
            foreach (array_keys(self::CHECKED_INSIDE) as $prefix) {
                if (str_starts_with($uri, $prefix)) {
                    continue 2;
                }
            }
            $open[] = implode('|', array_diff($route->methods(), ['HEAD'])) . ' ' . $uri;
        }
        sort($open);
        $this->assertSame([], $open, "These staff routes only need the admin area. Give them a permission, or list their prefix in CHECKED_INSIDE with the reason:\n" . implode("\n", $open));
    }
}
