<?php

namespace Tests\Unit;

use App\Services\Access\Catalog;
use PHPUnit\Framework\TestCase;

/**
 * Role names are gone from the code: every check asks for a permission, and these tests keep it that way.
 *
 * 1. No PHP in app/ or routes/ may compare a role name, test a list of role names, or use the old role: middleware. (Role keys that are DATA, such as the
 *    roles a vault policy names, are matched with holdsAny() on a variable, which is allowed.)
 * 2. The built-in roles hold, by default, exactly what the old role lists allowed (a snapshot, so a change to the defaults is a decision, not an accident).
 */
class NoRoleNamesInCodeTest extends TestCase
{
    /** Roles named in code are only allowed inside the access engine and its seed. */
    private const ALLOWED = ['app/Services/Access/', 'app/Models/Access/'];

    private const NAMES = 'super_admin|admin|manager|finance|logistics|sales_rep|driver|customer|vendor|senior_accountant|cashier|chef';

    /** Source with comments removed, so what the code says about roles in words does not count. */
    private function code(string $file): string
    {
        $out = '';
        foreach (token_get_all((string) file_get_contents($file)) as $t) {
            if (is_array($t) && in_array($t[0], [T_COMMENT, T_DOC_COMMENT], true)) {
                $out .= str_repeat("\n", substr_count($t[1], "\n"));
                continue;
            }
            $out .= is_array($t) ? $t[1] : $t;
        }

        return $out;
    }

    /** @return string[] */
    private function files(): array
    {
        $root = realpath(__DIR__ . '/../..');
        $files = [];
        foreach (['app', 'routes'] as $dir) {
            $it = new \RecursiveIteratorIterator(new \RecursiveDirectoryIterator($root . '/' . $dir, \FilesystemIterator::SKIP_DOTS));
            foreach ($it as $f) {
                if ($f->isFile() && $f->getExtension() === 'php') {
                    $rel = str_replace('\\', '/', substr($f->getPathname(), strlen($root) + 1));
                    foreach (self::ALLOWED as $ok) {
                        if (str_starts_with($rel, $ok)) {
                            continue 2;
                        }
                    }
                    $files[$rel] = $f->getPathname();
                }
            }
        }

        return $files;
    }

    public function test_no_code_compares_or_lists_role_names(): void
    {
        $n = self::NAMES;
        $patterns = [
            'compares ->role with a role name' => "/->role\\s*[!=]==?\\s*['\"](?:{$n})['\"]/",
            'compares a role name with ->role' => "/['\"](?:{$n})['\"]\\s*[!=]==?\\s*[^;]*->role\\b/",
            'tests ->role against a list of role names' => "/in_array\\(\\s*[^;]*->role\\s*,\\s*\\[\\s*['\"](?:{$n})['\"]/",
            'asks for a list of role names (holdsAny / hasAnyRole)' => "/(?:holdsAny|hasAnyRole)\\(\\s*\\[/",
            'uses isSuperAdmin / isAdmin / isOperational' => "/(?:isSuperAdmin|isOperational)\\(|->isAdmin\\(\\)/",
            'uses the old role: middleware' => "/['\"]role:(?:{$n})\\b/",
            'names an owner / sales / logistics role' => "/['\"](?:super_admin|sales_rep|logistics|senior_accountant)['\"]/",
        ];
        $found = [];
        foreach ($this->files() as $rel => $path) {
            $src = $this->code($path);
            foreach ($patterns as $why => $re) {
                if (preg_match_all($re, $src, $m, PREG_OFFSET_CAPTURE)) {
                    foreach ($m[0] as [$text, $at]) {
                        $found[] = $rel . ':' . (substr_count(substr($src, 0, $at), "\n") + 1) . "  {$why}: " . trim($text);
                    }
                }
            }
        }
        $this->assertSame([], $found, "Role names must not be written in code; ask for a permission instead:\n" . implode("\n", $found));
    }

    /**
     * What each original role holds by default. Before the engine, route lists said who could do what; each list became a permission, and the roles
     * that were on the list hold it. The owner holds everything. A deliberate change to a default belongs here and in docs/IDENTITY_AND_ACCESS_PLAN.md.
     */
    private const DEFAULT_HOLDERS = [
        'admin.access' => ['super_admin', 'admin', 'manager', 'finance', 'logistics', 'sales_rep'],
        'books.view' => ['super_admin', 'admin', 'manager', 'finance'],
        'books.post' => ['super_admin', 'admin', 'finance'],
        'books.review' => ['super_admin', 'admin'],
        'books.period' => ['super_admin'],
        'stock.view' => ['super_admin', 'admin', 'manager', 'finance'],
        'stock.manage' => ['super_admin', 'admin', 'finance'],
        'stock.settings' => ['super_admin', 'admin'],
        'inventory.view' => ['super_admin', 'admin', 'manager', 'finance'],
        'vendors.view' => ['super_admin', 'admin', 'manager', 'finance'],
        'vendors.manage' => ['super_admin', 'admin', 'finance'],
        'credit.act' => ['super_admin', 'admin', 'manager', 'finance'],
        'payroll.run' => ['super_admin', 'finance'],
        'delivery.manage' => ['super_admin', 'admin', 'manager', 'logistics'],
        'insight.view' => ['super_admin', 'admin', 'manager', 'finance', 'logistics', 'sales_rep'],
        'locations.manage' => ['super_admin', 'admin'],
        'system.modules' => ['super_admin'],
        'system.backups' => ['super_admin', 'admin'],
        'system.navigation' => ['super_admin', 'admin'],
        'system.devtools' => ['super_admin'],
        'access.view' => ['super_admin', 'admin'],
        'access.manage' => ['super_admin', 'admin'],
        'access.roles' => ['super_admin'],
        'security.view' => ['super_admin', 'admin'],
        'security.manage' => ['super_admin'],
        'catalogue.pricelists' => ['super_admin', 'admin', 'manager', 'finance', 'sales_rep'],
        'catalogue.delete' => ['super_admin', 'admin', 'manager'],
        'campaigns.build' => ['super_admin', 'admin', 'manager', 'finance', 'sales_rep'],
        'campaigns.publish' => ['super_admin', 'admin', 'manager'],
        'menus.view' => ['super_admin', 'admin', 'manager', 'finance'],
        'menus.manage' => ['super_admin', 'admin', 'finance'],
        'system.restore' => ['super_admin'],
        'system.logs' => ['super_admin', 'admin'],
        'policies.manage' => ['super_admin', 'admin'],
        'appearance.manage' => ['super_admin', 'admin'],
        'vault.policies' => ['super_admin', 'admin'],
        'vault.settings' => ['super_admin'],
        'users.manage' => ['super_admin', 'admin', 'manager', 'sales_rep'],
        'tickets.purge' => ['super_admin'],
        'users.purge' => ['super_admin'],
        'tax.view' => ['super_admin', 'admin', 'manager', 'finance'],
        'tax.manage' => ['super_admin', 'admin', 'finance'],
        'currency.manage' => ['super_admin', 'admin', 'finance'],
        'currency.base' => ['super_admin', 'finance'],
        'inventory.accounting' => ['super_admin', 'admin', 'manager', 'finance'],
        'inventory.manage' => ['super_admin', 'admin', 'manager'],
        'catalogue.settings' => ['super_admin', 'admin', 'manager'],
        'hampers.manage' => ['super_admin', 'admin'],
        'promos.manage' => ['super_admin', 'admin', 'manager', 'finance'],
        'promos.admin' => ['super_admin', 'admin'],
        'algorithm.manage' => ['super_admin', 'admin'],
        'algorithm.run' => ['super_admin'],
        'projects.use' => ['super_admin', 'admin', 'manager', 'finance', 'sales_rep'],
        'projects.delete' => ['super_admin', 'admin'],
        'projects.purge' => ['super_admin'],
        'hr.manage' => ['super_admin', 'admin'],
        'careers.manage' => ['super_admin', 'admin'],
        'analytics.view' => ['super_admin', 'admin', 'manager', 'finance'],
        'insight.mimi' => ['super_admin', 'admin', 'manager'],
        'mimi.knowledge' => ['super_admin', 'admin'],
        'mimi.routing' => ['super_admin'],
        'notifications.view' => ['super_admin', 'admin'],
        'notifications.send' => ['super_admin', 'admin'],
        'notifications.settings' => ['super_admin', 'admin'],
        'notifications.keys.purge' => ['super_admin'],
        'events.view' => ['super_admin', 'admin', 'manager'],
        'events.edit' => ['super_admin', 'admin', 'manager'],
        'events.delete' => ['super_admin', 'admin'],
        'events.sell' => ['super_admin', 'admin', 'manager'],
        'events.checkin' => ['super_admin', 'admin', 'manager'],
        'events.refund' => ['super_admin', 'admin', 'manager'],
        'codes.view' => ['super_admin', 'admin', 'manager'],
        'codes.manage' => ['super_admin', 'admin', 'manager'],
        'codes.print' => ['super_admin', 'admin', 'manager'],
        'payments.keys' => ['super_admin'],
        'resources.manage' => ['super_admin', 'admin', 'manager'],
        'books.writeoff' => ['super_admin', 'finance'],
        'books.bounce' => ['super_admin', 'finance'],
        'books.pettycash' => ['super_admin', 'admin', 'finance'],
        'quotes.write' => ['super_admin', 'admin', 'manager', 'finance', 'sales_rep'],
        'loyalty.grant' => ['super_admin', 'admin', 'manager', 'finance', 'sales_rep'],
        'loyalty.deduct' => ['super_admin', 'admin', 'manager', 'finance'],
        'loyalty.configure' => ['super_admin', 'admin'],
        'loyalty.export' => ['super_admin', 'admin', 'manager', 'finance'],
        'customers.represent' => ['super_admin', 'admin', 'sales_rep'],
        'stock.override_expiry' => ['super_admin', 'admin', 'manager'],
        'stock.expiry_alerts' => ['super_admin', 'admin', 'manager'],
        'verification.manage' => ['super_admin', 'admin', 'finance'],
        'verification.override' => ['super_admin'],
        'vendors.approve' => ['super_admin', 'admin', 'manager'],
        'calendar.team' => ['super_admin', 'admin', 'manager'],
        'attendance.manage' => ['super_admin', 'admin'],
        'attendance.arbitrate' => ['super_admin'],
        'hr.view' => ['super_admin', 'admin', 'manager', 'finance', 'logistics'],
        'hr.purge' => ['super_admin'],
        'hr.team' => ['super_admin', 'admin', 'manager'],
        'projects.manage' => ['super_admin', 'admin', 'manager', 'sales_rep'],
        'projects.moderate' => ['super_admin'],
        'campaigns.admin' => ['super_admin', 'admin'],
        'campaigns.purge' => ['super_admin'],
        'catalogue.publish' => ['super_admin', 'admin', 'manager', 'finance'],
        'catalogue.purge' => ['super_admin', 'admin'],
        'engagement.view' => ['super_admin', 'admin', 'manager', 'finance', 'sales_rep'],
        'engagement.moderate' => ['super_admin', 'admin', 'manager'],
        'engagement.settings' => ['super_admin', 'admin'],
        'insight.ops' => ['super_admin', 'admin', 'manager'],
        'driver.app' => ['super_admin', 'driver'],
        'ai.keys' => ['super_admin'],
        'vault.bypass' => ['super_admin'],
        'settings.delete' => ['super_admin'],
        'customers.view' => ['super_admin', 'admin', 'manager', 'finance', 'logistics', 'sales_rep'],
        'customers.manage' => ['super_admin', 'admin', 'manager', 'finance', 'sales_rep'],
        'customers.tiers' => ['super_admin', 'admin'],
        'credit.view' => ['super_admin', 'admin', 'manager', 'finance', 'sales_rep'],
        'quotes.view' => ['super_admin', 'admin', 'manager', 'finance', 'logistics', 'sales_rep'],
        'catalogue.view' => ['super_admin', 'admin', 'manager', 'finance', 'logistics', 'sales_rep'],
        'catalogue.edit' => ['super_admin', 'admin', 'manager', 'finance'],
        'auctions.manage' => ['super_admin', 'admin', 'manager'],
        'shipping.manage' => ['super_admin', 'admin', 'manager', 'logistics'],
        'content.manage' => ['super_admin', 'admin'],
        'tickets.manage' => ['super_admin', 'admin', 'manager', 'finance', 'logistics', 'sales_rep'],
        'bookings.manage' => ['super_admin', 'admin', 'manager', 'sales_rep'],
        'costcentres.view' => ['super_admin', 'admin', 'manager', 'finance'],
        'costcentres.manage' => ['super_admin', 'admin', 'finance'],
        'imports.view' => ['super_admin', 'admin', 'finance'],
        'imports.export' => ['super_admin', 'admin'],
        'imports.manage' => ['super_admin', 'admin'],
    ];

    public function test_the_original_roles_hold_what_the_old_lists_gave_them(): void
    {
        $roles = Catalog::roles();
        $this->assertSame(array_keys(Catalog::PERMISSIONS), array_keys(self::DEFAULT_HOLDERS), 'The snapshot must list every permission, in catalogue order. Add the new one(s).');
        foreach (self::DEFAULT_HOLDERS as $permission => $expected) {
            $actual = [];
            foreach (['super_admin', 'admin', 'manager', 'finance', 'logistics', 'sales_rep', 'driver'] as $r) {
                $p = $roles[$r]['permissions'];
                if ($p === '*' || in_array($permission, $p, true)) {
                    $actual[] = $r;
                }
            }
            $this->assertSame($expected, $actual, "Default holders of {$permission} changed");
        }
    }
}
