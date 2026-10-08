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
    public const VERSION = 4;

    /** The key of the owner role: the one role that holds every permission, including ones added later. It cannot be changed or deleted. */
    public const OWNER = 'super_admin';

    /** Permissions added after version 1, by the version that added them. The seeder gives a new permission to the built-in roles that hold it by default once, and never again (an admin may take it back). */
    public const ADDED = [
        4 => ['customers.view', 'customers.manage', 'customers.tiers', 'credit.view', 'quotes.view', 'catalogue.view', 'catalogue.edit', 'auctions.manage', 'shipping.manage',
            'content.manage', 'tickets.manage', 'bookings.manage'],
        3 => ['books.writeoff', 'books.bounce', 'books.pettycash', 'quotes.write', 'loyalty.grant', 'loyalty.deduct', 'loyalty.configure', 'loyalty.export', 'customers.represent',
            'stock.override_expiry', 'stock.expiry_alerts', 'verification.manage', 'verification.override', 'vendors.approve', 'calendar.team', 'attendance.manage', 'attendance.arbitrate',
            'hr.view', 'hr.purge', 'hr.team', 'projects.manage', 'projects.moderate', 'campaigns.admin', 'campaigns.purge', 'catalogue.publish', 'catalogue.purge', 'engagement.view',
            'engagement.moderate', 'engagement.settings', 'insight.ops', 'driver.app', 'ai.keys', 'vault.bypass', 'settings.delete'],
        2 => ['system.restore', 'system.logs', 'policies.manage', 'appearance.manage', 'vault.policies', 'vault.settings', 'users.manage', 'users.purge', 'tickets.purge', 'tax.view', 'tax.manage',
            'currency.manage', 'currency.base', 'inventory.accounting', 'inventory.manage', 'catalogue.settings', 'hampers.manage', 'promos.manage', 'promos.admin', 'algorithm.manage',
            'algorithm.run', 'projects.use', 'projects.delete', 'projects.purge', 'hr.manage', 'careers.manage', 'analytics.view', 'insight.mimi', 'resources.manage'],
    ];

    /**
     * A permission that already existed but a built-in role now holds by default: version => role key => permissions. The seeder gives it once, when it
     * upgrades from an older version, and never takes it back. (The sales rep manages milestones and posts messages, so it needs to open projects.)
     */
    public const GRANTED = [
        4 => ['sales_rep' => ['projects.use']],
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
        // added in R4: one for each role-name check that was left in the code
        'books.writeoff'    => [null, 'Books', 'Write off what customers owe', true],
        'books.bounce'      => [null, 'Books', 'Record a bounced cheque', true],
        'books.pettycash'   => [null, 'Books', 'Top up petty cash, set the float and see every till\'s spends', true],
        'quotes.write'      => [null, 'Customers', 'Write, change and send quotations', true],
        'loyalty.grant'     => [null, 'Customers', 'Give loyalty points and redeem points for a customer', true],
        'loyalty.deduct'    => [null, 'Customers', 'Take loyalty points away', true],
        'loyalty.configure' => [null, 'Customers', 'Change the loyalty rules and settings', true],
        'loyalty.export'    => [null, 'Customers', 'Export loyalty data', false],
        'customers.represent' => [null, 'Customers', 'Can be a customer\'s sales representative', false],
        'stock.override_expiry' => [null, 'Stock', 'Sell expired stock, with a reason', true],
        'stock.expiry_alerts' => [null, 'Stock', 'Get the expiry warnings', false],
        'verification.manage' => [null, 'Stock', 'Hand out verification work and check anyone\'s', true],
        'verification.override' => [null, 'Stock', 'Verify any item assigned to you, whatever its rules', true],
        'vendors.approve'   => [null, 'Purchases', 'Make and approve vendor accounts', true],
        'calendar.team'     => [null, 'People', 'See the team calendar and other people\'s calendars', false],
        'attendance.manage' => [null, 'People', 'Mark and verify attendance and set the attendance rules', true],
        'attendance.arbitrate' => [null, 'People', 'Settle attendance disputes, see who reported, mark your own day', true],
        'hr.view'           => ['extras', 'People', 'See employee records', false],
        'hr.purge'          => ['extras', 'People', 'Delete employee records for good', true],
        'hr.team'           => ['extras', 'People', 'Edit the records of the people who report to you', true],
        'projects.manage'   => ['projects', 'Projects', 'Manage milestones and post staff messages', true],
        'projects.moderate' => ['projects', 'Projects', 'Edit or remove anyone\'s project messages and see internal notes', true],
        'campaigns.admin'   => ['campaigns', 'Campaigns', 'Change the customer pin settings and see who looked', true],
        'campaigns.purge'   => ['campaigns', 'Campaigns', 'Delete boards, campaigns, pins and moodboards for good', true],
        'catalogue.publish' => ['ecommerce', 'Catalogue', 'Make price lists and catalogues live', true],
        'catalogue.purge'   => ['ecommerce', 'Catalogue', 'Delete price lists and catalogues for good', true],
        'engagement.view'   => ['extras', 'Marketing', 'See the reviews, comments and reports waiting for a decision', false],
        'engagement.moderate' => ['extras', 'Marketing', 'Approve, hide and decide on reviews, comments and reports', true],
        'engagement.settings' => ['extras', 'Marketing', 'Change who can review, comment and like', true],
        'insight.ops'       => [null, 'Insight', 'See operational insight and activity: hampers, auctions, promotions, deliveries, projects, leave', false],
        'driver.app'        => ['extras', 'Delivery', 'Use the driver app: manifests, ratings, incidents and payslips', true],
        'ai.keys'           => [null, 'System', 'Manage the AI provider keys', true],
        'vault.bypass'      => [null, 'Vault', 'Get past the vault policies', true],
        'settings.delete'   => [null, 'System', 'Delete shipping options, customer tiers and customer types', true],
        // added with the area permissions (version 4): one for each area that only needed the admin area before
        'customers.view'    => [null, 'Customers', 'See customers, their addresses, orders and notes', false],
        'customers.manage'  => [null, 'Customers', 'Add and change customers, addresses, tags and sales rep assignments, and import customers', true],
        'customers.tiers'   => [null, 'Customers', 'Change customer tiers and customer type discounts', true],
        'credit.view'       => [null, 'Customers', 'See a customer\'s credit account: summary, statement, schedules and invoices', false],
        'quotes.view'       => [null, 'Customers', 'See quotations', false],
        'catalogue.view'    => ['ecommerce', 'Catalogue', 'See products, services, categories, brands, units and variants', false],
        'catalogue.edit'    => ['ecommerce', 'Catalogue', 'Add and change products, variants, services, categories, brands, images and units', true],
        'auctions.manage'   => ['ecommerce', 'Catalogue', 'Make and run auctions', true],
        'shipping.manage'   => [null, 'Delivery', 'Add and change shipping options', true],
        'content.manage'    => [null, 'System', 'Edit the storefront content pages: about, contact, homepage, footer', true],
        'tickets.manage'    => [null, 'Support', 'See, answer and assign support tickets', true],
        'bookings.manage'   => [null, 'Operations', 'See and manage bookings', true],
    ];

    /** What the admin role does not hold by default (the owner holds everything, and builds roles that hold these). Admin gets everything else. */
    public const OWNER_ONLY = ['system.modules', 'system.devtools', 'system.restore', 'access.roles', 'books.period', 'payroll.run', 'currency.base',
        'vault.settings', 'algorithm.run', 'projects.purge', 'tickets.purge', 'users.purge',
        'books.writeoff', 'books.bounce', 'verification.override', 'attendance.arbitrate', 'hr.purge', 'projects.moderate', 'campaigns.purge', 'driver.app',
        'vault.bypass', 'ai.keys', 'settings.delete'];

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
     * `acts_as` is no longer used for any decision (every check asks for a permission); the column stays so old data and the SQL script still fit.
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
            'senior_accountant' => ['name' => 'Senior accountant', 'kind' => 'staff', 'min_clearance' => 4, 'scope_type' => 'global', 'data_scope' => 'all', 'module' => null, 'acts_as' => [],
                'description' => 'Sees every branch for the books. Posts and reviews. Cannot change security, roles or the modules.', 'modules' => ['*'],
                'permissions' => array_merge(self::STAFF, ['books.view', 'books.post', 'books.review', 'payroll.run', 'stock.view', 'stock.manage', 'inventory.view', 'vendors.view', 'vendors.manage', 'credit.act',
                    'campaigns.build', 'catalogue.pricelists', 'menus.view', 'menus.manage', 'tax.view', 'tax.manage', 'currency.manage', 'currency.base', 'inventory.accounting',
                    'promos.manage', 'projects.use', 'analytics.view', 'books.writeoff', 'books.bounce', 'books.pettycash', 'quotes.write', 'verification.manage', 'hr.view', 'loyalty.grant',
                    'loyalty.deduct', 'loyalty.export', 'catalogue.publish', 'engagement.view', 'customers.view', 'customers.manage', 'credit.view', 'quotes.view', 'catalogue.view', 'catalogue.edit', 'tickets.manage']),
                'approvals' => ['journal.approve' => null, 'purchase.approve' => null, 'refund.approve' => null], 'sort' => 30],
            'manager' => ['name' => 'Manager', 'kind' => 'staff', 'min_clearance' => 3, 'scope_type' => 'assigned', 'data_scope' => 'all', 'module' => null, 'acts_as' => [],
                'description' => 'Manages a branch: the default one plus any granted.', 'modules' => ['*'],
                'permissions' => array_merge(self::STAFF, ['books.view', 'stock.view', 'inventory.view', 'vendors.view', 'menus.view', 'campaigns.build', 'campaigns.publish', 'catalogue.pricelists',
                    'catalogue.delete', 'credit.act', 'delivery.manage', 'tax.view', 'inventory.accounting', 'inventory.manage', 'catalogue.settings', 'promos.manage', 'projects.use',
                    'analytics.view', 'insight.mimi', 'resources.manage', 'quotes.write', 'calendar.team', 'hr.view', 'hr.team', 'stock.override_expiry', 'stock.expiry_alerts', 'loyalty.grant',
                    'loyalty.deduct', 'loyalty.export', 'projects.manage', 'catalogue.publish', 'engagement.view', 'engagement.moderate', 'insight.ops', 'vendors.approve', 'users.manage', 'customers.view', 'customers.manage', 'credit.view', 'quotes.view', 'catalogue.view', 'catalogue.edit', 'auctions.manage', 'shipping.manage', 'tickets.manage', 'bookings.manage']),
                'approvals' => ['campaign.publish' => null], 'sort' => 40],
            'finance' => ['name' => 'Finance', 'kind' => 'staff', 'min_clearance' => 3, 'scope_type' => 'assigned', 'data_scope' => 'all', 'module' => null, 'acts_as' => [],
                'description' => 'Does the finance work of the branches assigned or granted.', 'modules' => ['*'],
                'permissions' => array_merge(self::STAFF, ['books.view', 'books.post', 'payroll.run', 'stock.view', 'stock.manage', 'inventory.view', 'vendors.view', 'vendors.manage',
                    'menus.view', 'menus.manage', 'campaigns.build', 'catalogue.pricelists', 'credit.act', 'tax.view', 'tax.manage', 'currency.manage', 'currency.base', 'inventory.accounting',
                    'promos.manage', 'projects.use', 'analytics.view', 'books.writeoff', 'books.bounce', 'books.pettycash', 'quotes.write', 'verification.manage', 'hr.view', 'loyalty.grant',
                    'loyalty.deduct', 'loyalty.export', 'catalogue.publish', 'engagement.view', 'customers.view', 'customers.manage', 'credit.view', 'quotes.view', 'catalogue.view', 'catalogue.edit', 'tickets.manage']),
                'approvals' => [], 'sort' => 50],
            'logistics' => ['name' => 'Logistics', 'kind' => 'staff', 'min_clearance' => 2, 'scope_type' => 'assigned', 'data_scope' => 'all', 'module' => null, 'acts_as' => [],
                'description' => 'Runs deliveries.', 'modules' => ['*'], 'permissions' => array_merge(self::STAFF, ['delivery.manage', 'hr.view', 'customers.view', 'quotes.view', 'catalogue.view', 'shipping.manage', 'tickets.manage']), 'approvals' => [], 'sort' => 60],
            'sales_rep' => ['name' => 'Sales representative', 'kind' => 'staff', 'min_clearance' => 2, 'scope_type' => 'assigned', 'data_scope' => 'assigned', 'module' => null, 'acts_as' => [],
                'description' => 'Works with the customers assigned to them.', 'modules' => ['*'], 'permissions' => array_merge(self::STAFF, ['campaigns.build', 'catalogue.pricelists', 'quotes.write', 'loyalty.grant', 'customers.represent', 'projects.manage', 'projects.use', 'engagement.view', 'users.manage', 'customers.view', 'customers.manage', 'credit.view', 'quotes.view', 'catalogue.view', 'tickets.manage', 'bookings.manage']), 'approvals' => [], 'sort' => 70],
            'cashier' => ['name' => 'Cashier', 'kind' => 'staff', 'min_clearance' => 1, 'scope_type' => 'assigned', 'data_scope' => 'own', 'module' => null, 'acts_as' => [],
                'description' => 'Takes payments at a branch. Their permissions are added as the till features are tied to permissions.', 'modules' => ['*'], 'permissions' => ['admin.access', 'customers.view', 'catalogue.view', 'bookings.manage'], 'approvals' => [], 'sort' => 80],
            'chef' => ['name' => 'Chef', 'kind' => 'staff', 'min_clearance' => 1, 'scope_type' => 'assigned', 'data_scope' => 'all', 'module' => 'menus', 'acts_as' => [],
                'description' => 'Works with recipes and production in the kitchen.', 'modules' => ['menus'], 'permissions' => ['admin.access', 'menus.view', 'menus.manage'], 'approvals' => [], 'sort' => 90],
            'driver' => ['name' => 'Driver', 'kind' => 'staff', 'min_clearance' => 1, 'scope_type' => 'assigned', 'data_scope' => 'own', 'module' => 'extras', 'acts_as' => [],
                'description' => 'Delivers goods. Uses the driver screens only.', 'modules' => ['extras'], 'permissions' => ['driver.app'], 'approvals' => [], 'sort' => 100],
            'customer' => ['name' => 'Customer', 'kind' => 'portal', 'min_clearance' => 0, 'scope_type' => 'own', 'data_scope' => 'own', 'module' => null, 'acts_as' => [],
                'description' => 'Shops and sees their own account.', 'modules' => [], 'permissions' => [], 'approvals' => [], 'sort' => 110],
            'vendor' => ['name' => 'Vendor', 'kind' => 'portal', 'min_clearance' => 0, 'scope_type' => 'own', 'data_scope' => 'own', 'module' => null, 'acts_as' => [],
                'description' => 'A supplier who sees their own orders and statements.', 'modules' => [], 'permissions' => [], 'approvals' => [], 'sort' => 120],
            'applicant' => ['name' => 'Job applicant', 'kind' => 'portal', 'min_clearance' => 0, 'scope_type' => 'own', 'data_scope' => 'own', 'module' => 'careers', 'acts_as' => [],
                'description' => 'Sees their own job applications.', 'modules' => [], 'permissions' => [], 'approvals' => [], 'sort' => 130],
        ];
    }
}
