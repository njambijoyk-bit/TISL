<?php

namespace App\Services\Access;

/**
 * What ships with the app: the clearance levels, the built-in roles, and the permissions they hold.
 *
 * It is written so that today's behaviour is reproduced exactly: each permission below stands for one of the role lists the routes have
 * been using, and the roles that were in that list hold it. New things (Senior accountant, Chef, Cashier) are added on top.
 * `VERSION` goes up whenever something is added here; the seeder only adds what is missing and never takes back what an admin changed.
 */
class Catalog
{
    public const VERSION = 2;

    /** Permissions added after version 1, by the version that added them. The seeder gives a new permission to the built-in roles that hold it by default once, and never again (an admin may take it back). */
    public const ADDED = [
        2 => ['system.restore', 'system.logs', 'policies.manage', 'appearance.manage', 'vault.policies', 'vault.settings', 'users.manage', 'users.purge', 'tickets.purge', 'tax.view', 'tax.manage',
            'currency.manage', 'currency.base', 'inventory.accounting', 'inventory.manage', 'catalogue.settings', 'hampers.manage', 'promos.manage', 'promos.admin', 'algorithm.manage',
            'algorithm.run', 'projects.use', 'projects.delete', 'projects.purge', 'hr.manage', 'careers.manage', 'analytics.view', 'insight.mimi', 'resources.manage'],
    ];

    /** The areas branch limits are switched on for, one at a time. key => label. */
    public const AREAS = ['books' => 'Books: vouchers, day book and reports', 'stock' => 'Stock: stock, transfers, counts and jobs'];

    /** Which area a permission belongs to (for the branch limit mode that applies to it). */
    public static function areaOf(string $permission): string
    {
        return match (explode('.', $permission)[0]) {
            'books', 'tax', 'currency', 'credit' => 'books',
            'stock', 'inventory', 'vendors', 'menus' => 'stock',
            default => 'general',
        };
    }

    /** The catalogue version that introduced a permission. */
    public static function since(string $permission): int
    {
        foreach (self::ADDED as $version => $keys) {
            if (in_array($permission, $keys, true)) {
                return $version;
            }
        }

        return 1;
    }

    /** level => [name, description]. The names can be changed in the database. */
    public const LEVELS = [
        0 => ['No staff access', 'Customers, vendors and applicants. They only ever see their own things.'],
        1 => ['Staff', 'Does a defined job at a branch, for example a cashier, a chef or a driver.'],
        2 => ['Officer', 'Runs a function, for example sales or logistics.'],
        3 => ['Manager', 'Manages a branch or a function, or does the finance work of a branch.'],
        4 => ['Senior', 'Sees across every branch for their field, for example the senior accountant.'],
        5 => ['Administrator', 'Runs the system day to day.'],
        6 => ['Owner', 'Everything, including security and the modules. Only the owner makes administrators.'],
    ];

    /** key => [module, group, label, is_write]. A null module is core. */
    public const PERMISSIONS = [
        'admin.access'      => [null, 'Admin area', 'Open the admin area', false],
        'books.view'        => [null, 'Books', 'See vouchers, ledgers and financial reports', false],
        'books.post'        => [null, 'Books', 'Create, edit and cancel vouchers', true],
        'books.review'      => [null, 'Books', 'Review and reconcile what others posted', true],
        'books.period'      => [null, 'Books', 'Lock periods and close financial years', true],
        'stock.view'        => [null, 'Stock', 'See stock, batches, transfers and counts', false],
        'stock.manage'      => [null, 'Stock', 'Receive, adjust, transfer, count and write off stock', true],
        'stock.settings'    => [null, 'Stock', 'Change the stock and expiry rules', true],
        'inventory.view'    => [null, 'Stock', 'See the assets and equipment register', false],
        'vendors.view'      => [null, 'Purchases', 'See vendors', false],
        'vendors.manage'    => [null, 'Purchases', 'Add and change vendors', true],
        'credit.act'        => [null, 'Customers', 'Act on a customer\'s credit: payments, adjustments, schedules, invoices', true],
        'payroll.run'       => [null, 'Payroll', 'See and run payroll', true],
        'delivery.manage'   => [null, 'Delivery', 'Manage deliveries, drivers and manifests', true],
        'insight.view'      => [null, 'Insight', 'See the insight reports', false],
        'locations.manage'  => [null, 'System', 'Add and change branches', true],
        'system.modules'    => [null, 'System', 'Switch modules on and off', true],
        'system.backups'    => [null, 'System', 'Run and download backups', true],
        'system.navigation' => [null, 'System', 'Change the storefront navigation', true],
        'system.devtools'   => [null, 'System', 'Developer notes, keys and bug reports', true],
        'access.view'       => [null, 'Access', 'See who holds which roles and branch access', false],
        'access.manage'     => [null, 'Access', 'Give people roles, clearance and branch access', true],
        'access.roles'      => [null, 'Access', 'Create and change roles', true],
        'catalogue.pricelists' => ['ecommerce', 'Catalogue', 'Make price lists, catalogues and brochures', true],
        'catalogue.delete'  => ['ecommerce', 'Catalogue', 'Delete products, services, categories, brands and images', true],
        'campaigns.build'   => ['campaigns', 'Campaigns', 'Build campaigns and send them for approval', true],
        'campaigns.publish' => ['campaigns', 'Campaigns', 'Publish, pause and archive campaigns', true],
        'menus.view'        => ['menus', 'Menus', 'See recipes and production', false],
        'menus.manage'      => ['menus', 'Menus', 'Make recipes and record production', true],
        // added in R2: one for each thing the route role lists used to guard
        'system.restore'    => [null, 'System', 'Restore the database from a backup', true],
        'system.logs'       => [null, 'System', 'Export the activity logs', false],
        'policies.manage'   => [null, 'System', 'Read and change the site policies', true],
        'appearance.manage' => [null, 'System', 'Change colours, fonts and icon styles for everyone', true],
        'vault.policies'    => [null, 'Vault', 'Manage the vault policies', true],
        'vault.settings'    => [null, 'Vault', 'Change the vault settings', true],
        'users.manage'      => [null, 'Access', 'Manage staff accounts', true],
        'tickets.purge'     => [null, 'Support', 'Delete support tickets for good', true],
        'users.purge'       => [null, 'Access', 'Delete user accounts for good', true],
        'tax.view'          => [null, 'Tax and money', 'See taxes, withholding and tax certificates', false],
        'tax.manage'        => [null, 'Tax and money', 'Change taxes, withholding and tax certificates', true],
        'currency.manage'   => [null, 'Tax and money', 'Add and change currencies and a customer account\'s currency', true],
        'currency.base'     => [null, 'Tax and money', 'Change the base currency or delete a currency', true],
        'inventory.accounting' => [null, 'Stock', 'Post asset depreciation and set up asset ledgers', true],
        'inventory.manage'  => [null, 'Stock', 'Manage the asset register: categories, items, assignments and repairs', true],
        'catalogue.settings' => ['ecommerce', 'Catalogue', 'Change the service settings and brochure defaults', true],
        'hampers.manage'    => ['ecommerce', 'Catalogue', 'Make and manage hampers', true],
        'promos.manage'     => [null, 'Marketing', 'Run promo codes and referral codes', true],
        'promos.admin'      => [null, 'Marketing', 'Create, change and delete promo codes and referral programmes', true],
        'algorithm.manage'  => ['extras', 'Marketing', 'Tune the ranking algorithm', true],
        'algorithm.run'     => ['extras', 'Marketing', 'Run customer scoring', true],
        'projects.use'      => ['projects', 'Projects', 'Open projects and take part', false],
        'projects.delete'   => ['projects', 'Projects', 'Delete, restore and transfer projects', true],
        'projects.purge'    => ['projects', 'Projects', 'Delete projects for good', true],
        'hr.manage'         => ['extras', 'People', 'Manage employee records', true],
        'careers.manage'    => ['careers', 'People', 'Post jobs and manage applications', true],
        'analytics.view'    => ['extras', 'Insight', 'See search and customer analytics', false],
        'insight.mimi'      => [null, 'Insight', 'See the Mimi chat analytics and block abusers', true],
        'resources.manage'  => [null, 'Operations', 'Manage bookable staff, rooms, tables and equipment', true],
    ];

    /** What only the owner (and a role the owner builds) holds. Admin gets everything else by default. */
    public const OWNER_ONLY = ['system.modules', 'system.devtools', 'system.restore', 'access.roles', 'books.period', 'payroll.run', 'currency.base',
        'vault.settings', 'algorithm.run', 'projects.purge', 'tickets.purge', 'users.purge'];

    /** Things a role can approve, optionally up to an amount. approval key => label. */
    public const APPROVALS = [
        'journal.approve'  => 'Approve journals',
        'purchase.approve' => 'Approve purchases',
        'refund.approve'   => 'Approve refunds',
        'campaign.publish' => 'Publish campaigns',
    ];

    private const STAFF = ['admin.access', 'insight.view'];

    /**
     * key => name, kind, min_clearance, scope_type, data_scope, module, acts_as, description, modules, permissions, approvals.
     * `permissions` of '*' means every permission (also the ones added later). `modules` of ['*'] means every module.
     * `acts_as` are the old role names the role still satisfies in route checks that have not been moved to permissions yet.
     */
    public static function roles(): array
    {
        $all = array_keys(self::PERMISSIONS);
        $notOwnerOnly = array_values(array_diff($all, self::OWNER_ONLY));

        return [
            'super_admin' => ['name' => 'Super admin', 'kind' => 'staff', 'min_clearance' => 6, 'scope_type' => 'global', 'data_scope' => 'all', 'module' => null, 'acts_as' => [],
                'description' => 'Everything, including security and the modules.', 'modules' => ['*'], 'permissions' => '*',
                'approvals' => ['journal.approve' => null, 'purchase.approve' => null, 'refund.approve' => null, 'campaign.publish' => null], 'sort' => 10],
            'admin' => ['name' => 'Admin', 'kind' => 'staff', 'min_clearance' => 5, 'scope_type' => 'global', 'data_scope' => 'all', 'module' => null, 'acts_as' => [],
                'description' => 'Runs the system day to day. Not security roles, the modules, developer tools, period locks or payroll (as before).', 'modules' => ['*'], 'permissions' => $notOwnerOnly,
                'approvals' => ['journal.approve' => null, 'purchase.approve' => null, 'refund.approve' => null, 'campaign.publish' => null], 'sort' => 20],
            'senior_accountant' => ['name' => 'Senior accountant', 'kind' => 'staff', 'min_clearance' => 4, 'scope_type' => 'global', 'data_scope' => 'all', 'module' => null, 'acts_as' => ['finance'],
                'description' => 'Sees every branch for the books. Posts and reviews. Cannot change security, roles or the modules.', 'modules' => ['*'],
                'permissions' => array_merge(self::STAFF, ['books.view', 'books.post', 'books.review', 'payroll.run', 'stock.view', 'stock.manage', 'inventory.view', 'vendors.view', 'vendors.manage', 'credit.act',
                    'campaigns.build', 'catalogue.pricelists', 'menus.view', 'menus.manage', 'tax.view', 'tax.manage', 'currency.manage', 'currency.base', 'inventory.accounting',
                    'promos.manage', 'projects.use', 'analytics.view']),
                'approvals' => ['journal.approve' => null, 'purchase.approve' => null, 'refund.approve' => null], 'sort' => 30],
            'manager' => ['name' => 'Manager', 'kind' => 'staff', 'min_clearance' => 3, 'scope_type' => 'assigned', 'data_scope' => 'all', 'module' => null, 'acts_as' => [],
                'description' => 'Manages a branch: the default one plus any granted.', 'modules' => ['*'],
                'permissions' => array_merge(self::STAFF, ['books.view', 'stock.view', 'inventory.view', 'vendors.view', 'menus.view', 'campaigns.build', 'campaigns.publish', 'catalogue.pricelists',
                    'catalogue.delete', 'credit.act', 'delivery.manage', 'tax.view', 'inventory.accounting', 'inventory.manage', 'catalogue.settings', 'promos.manage', 'projects.use',
                    'analytics.view', 'insight.mimi', 'resources.manage']),
                'approvals' => ['campaign.publish' => null], 'sort' => 40],
            'finance' => ['name' => 'Finance', 'kind' => 'staff', 'min_clearance' => 3, 'scope_type' => 'assigned', 'data_scope' => 'all', 'module' => null, 'acts_as' => [],
                'description' => 'Does the finance work of the branches assigned or granted.', 'modules' => ['*'],
                'permissions' => array_merge(self::STAFF, ['books.view', 'books.post', 'payroll.run', 'stock.view', 'stock.manage', 'inventory.view', 'vendors.view', 'vendors.manage',
                    'menus.view', 'menus.manage', 'campaigns.build', 'catalogue.pricelists', 'credit.act', 'tax.view', 'tax.manage', 'currency.manage', 'currency.base', 'inventory.accounting',
                    'promos.manage', 'projects.use', 'analytics.view']),
                'approvals' => [], 'sort' => 50],
            'logistics' => ['name' => 'Logistics', 'kind' => 'staff', 'min_clearance' => 2, 'scope_type' => 'assigned', 'data_scope' => 'all', 'module' => null, 'acts_as' => [],
                'description' => 'Runs deliveries.', 'modules' => ['*'], 'permissions' => array_merge(self::STAFF, ['delivery.manage']), 'approvals' => [], 'sort' => 60],
            'sales_rep' => ['name' => 'Sales representative', 'kind' => 'staff', 'min_clearance' => 2, 'scope_type' => 'assigned', 'data_scope' => 'assigned', 'module' => null, 'acts_as' => [],
                'description' => 'Works with the customers assigned to them.', 'modules' => ['*'], 'permissions' => array_merge(self::STAFF, ['campaigns.build', 'catalogue.pricelists']), 'approvals' => [], 'sort' => 70],
            'cashier' => ['name' => 'Cashier', 'kind' => 'staff', 'min_clearance' => 1, 'scope_type' => 'assigned', 'data_scope' => 'own', 'module' => null, 'acts_as' => [],
                'description' => 'Takes payments at a branch. Their permissions are added as the till features are tied to permissions.', 'modules' => ['*'], 'permissions' => ['admin.access'], 'approvals' => [], 'sort' => 80],
            'chef' => ['name' => 'Chef', 'kind' => 'staff', 'min_clearance' => 1, 'scope_type' => 'assigned', 'data_scope' => 'all', 'module' => 'menus', 'acts_as' => [],
                'description' => 'Works with recipes and production in the kitchen.', 'modules' => ['menus'], 'permissions' => ['admin.access', 'menus.view', 'menus.manage'], 'approvals' => [], 'sort' => 90],
            'driver' => ['name' => 'Driver', 'kind' => 'staff', 'min_clearance' => 1, 'scope_type' => 'assigned', 'data_scope' => 'own', 'module' => 'extras', 'acts_as' => [],
                'description' => 'Delivers goods. Uses the driver screens only.', 'modules' => ['extras'], 'permissions' => [], 'approvals' => [], 'sort' => 100],
            'customer' => ['name' => 'Customer', 'kind' => 'portal', 'min_clearance' => 0, 'scope_type' => 'own', 'data_scope' => 'own', 'module' => null, 'acts_as' => [],
                'description' => 'Shops and sees their own account.', 'modules' => [], 'permissions' => [], 'approvals' => [], 'sort' => 110],
            'vendor' => ['name' => 'Vendor', 'kind' => 'portal', 'min_clearance' => 0, 'scope_type' => 'own', 'data_scope' => 'own', 'module' => null, 'acts_as' => [],
                'description' => 'A supplier who sees their own orders and statements.', 'modules' => [], 'permissions' => [], 'approvals' => [], 'sort' => 120],
            'applicant' => ['name' => 'Job applicant', 'kind' => 'portal', 'min_clearance' => 0, 'scope_type' => 'own', 'data_scope' => 'own', 'module' => 'careers', 'acts_as' => [],
                'description' => 'Sees their own job applications.', 'modules' => [], 'permissions' => [], 'approvals' => [], 'sort' => 130],
        ];
    }
}
