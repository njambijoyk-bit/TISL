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
    public const VERSION = 26;

    /** The key of the owner role: the one role that holds every permission, including ones added later. It cannot be changed or deleted. */
    public const OWNER = 'super_admin';

    /** Permissions added after version 1, by the version that added them. The seeder gives a new permission to the built-in roles that hold it by default once, and never again (an admin may take it back). */
    public const ADDED = [
        26 => ['projects.view_all', 'projects.create', 'projects.edit', 'projects.stage', 'projects.close', 'projects.freeze', 'projects.transfer', 'projects.confidential', 'projects.phases', 'projects.fields.sensitive', 'projects.export', 'projects.links', 'projects.members.view', 'projects.members.manage', 'projects.log.view', 'projects.log.export', 'projects.guests', 'projects.access.rules', 'projects.locks.reset', 'projects.approve', 'projects.security.view', 'projects.config.view', 'projects.config.manage', 'projects.config.industry', 'projects.config.names', 'projects.naming.personal', 'projects.config.fields', 'projects.config.stages', 'projects.config.roles', 'projects.shortcuts', 'projects.config.actions', 'projects.leads.view', 'projects.leads.manage', 'projects.pipeline', 'projects.clients.view', 'projects.clients.manage', 'projects.parties', 'projects.interactions', 'projects.health.view', 'projects.flags', 'projects.clients.export', 'projects.directory.yellow', 'projects.directory.white', 'projects.directory.contacts', 'projects.directory.staff', 'projects.directory.manage', 'projects.directory.visibility', 'projects.directory.publish', 'projects.directory.export', 'projects.money.view', 'projects.money.budget', 'projects.money.bill', 'projects.money.disbursements', 'projects.money.rates', 'projects.money.writeoff', 'projects.money.retention', 'projects.money.held.view', 'projects.money.held.pay', 'projects.ledgers.create', 'projects.ledgers.bank', 'projects.tasks', 'projects.scope', 'projects.dates', 'projects.changes', 'projects.changes.approve', 'projects.time.log', 'projects.time.approve', 'projects.time.others', 'projects.capacity', 'projects.daily', 'projects.materials', 'projects.plant', 'projects.subcontracts', 'projects.inspections', 'projects.messages.client', 'projects.messages.internal', 'projects.messages.moderate', 'projects.meetings', 'projects.inbox.all', 'projects.files.view', 'projects.files.manage', 'projects.files.share', 'projects.files.sign', 'projects.templates', 'projects.team.view', 'projects.team.manage', 'projects.team.checklists', 'projects.casebook.report', 'projects.casebook.handle', 'projects.casebook.configure', 'projects.casebook.identity', 'projects.insights', 'projects.insights.team', 'projects.kpis', 'projects.rules'],
        25 => ['events.admin'],
        24 => ['books.budget.exceed'],
        23 => ['books.budget.approve'],
        22 => ['books.planning'],
        21 => ['books.tax.view', 'books.tax.control', 'books.tax.admin', 'books.tax.override'],
        20 => ['books.statements', 'books.reports.settings', 'books.reports.format', 'books.reports.reconcile_setup', 'books.reports.approval', 'books.reconcile', 'books.reconcile.approve', 'books.close.prepare'],
        19 => ['bulkimport.core', 'bulkimport.ecommerce', 'bulkimport.menus', 'bulkimport.memberships', 'bulkimport.events', 'bulkimport.courses', 'bulkimport.campaigns', 'bulkimport.careers', 'bulkimport.projects', 'bulkimport.listings', 'bulkimport.accommodations', 'bulkimport.extras'],
        18 => ['tenders.view', 'tenders.manage', 'prequalification.view', 'prequalification.manage', 'vendors.portal'],
        17 => ['menus.configure', 'menus.tips.view', 'menus.tips.issue', 'menus.tips.issue_self', 'menus.tips.reverse', 'menus.packaging.waive'],
        16 => ['units.view', 'units.manage'],
        15 => ['menus.till'],
        14 => ['pos.view', 'pos.sell', 'pos.invoice', 'pos.order', 'pos.return', 'pos.discount', 'pos.void', 'pos.reprint', 'pos.shift', 'pos.supervise', 'pos.manage'],
        13 => ['security.manage'],
        12 => ['security.view'],
        11 => ['events.view', 'events.edit', 'events.delete', 'events.sell', 'events.checkin', 'events.refund'],
        10 => ['codes.view', 'codes.manage', 'codes.print'],
        9 => ['payments.keys'],
        8 => ['notifications.view', 'notifications.send', 'notifications.settings', 'notifications.keys.purge'],
        7 => ['mimi.knowledge', 'mimi.routing'],
        6 => ['imports.view', 'imports.export', 'imports.manage'],
        5 => ['costcentres.view', 'costcentres.manage'],
        4 => ['customers.view', 'customers.manage', 'customers.tiers', 'credit.view', 'quotes.view', 'catalogue.view', 'catalogue.edit', 'auctions.manage', 'shipping.manage',
            'content.manage', 'tickets.manage', 'bookings.manage'],
        3 => ['books.writeoff', 'books.bounce', 'books.pettycash', 'quotes.write', 'loyalty.grant', 'loyalty.deduct', 'loyalty.configure', 'loyalty.export', 'customers.represent',
            'stock.override_expiry', 'stock.expiry_alerts', 'verification.manage', 'verification.override', 'vendors.approve', 'calendar.team', 'attendance.manage', 'attendance.arbitrate',
            'hr.view', 'hr.purge', 'hr.team', 'campaigns.admin', 'campaigns.purge', 'catalogue.publish', 'catalogue.purge', 'engagement.view',
            'engagement.moderate', 'engagement.settings', 'insight.ops', 'driver.app', 'ai.keys', 'vault.bypass', 'settings.delete'],
        2 => ['system.restore', 'system.logs', 'policies.manage', 'appearance.manage', 'vault.policies', 'vault.settings', 'users.manage', 'users.purge', 'tickets.purge', 'tax.view', 'tax.manage',
            'currency.manage', 'currency.base', 'inventory.accounting', 'inventory.manage', 'catalogue.settings', 'hampers.manage', 'promos.manage', 'promos.admin', 'algorithm.manage',
            'algorithm.run', 'projects.use', 'projects.delete', 'projects.purge', 'hr.manage', 'careers.manage', 'analytics.view', 'insight.mimi', 'resources.manage'],
    ];

    /**
     * A permission that already existed but a built-in role now holds by default: version => role key => permissions. The seeder gives it once, when it
     * upgrades from an older version, and never takes it back. (The sales rep works with customers' projects, so it needs to open them.)
     */
    public const GRANTED = [
        18 => ['manager' => ['tenders.view', 'prequalification.view'], 'senior_accountant' => ['tenders.view', 'tenders.manage', 'prequalification.view']],
        4 => ['sales_rep' => ['projects.use']],
    ];

    /** The areas branch limits are switched on for, one at a time. key => label. */
    public const AREAS = ['books' => 'Books: vouchers, day book and reports', 'stock' => 'Stock: stock, transfers, counts and jobs'];

    /** Which area a permission belongs to (for the branch limit mode that applies to it). */
    public static function areaOf(string $permission): string
    {
        return match (explode('.', $permission)[0]) {
            'books', 'tax', 'currency', 'credit', 'pos' => 'books',
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
        'books.statements'  => [null, 'Books', 'Change which financial statement line a ledger or ledger group reports under, and edit the statements tree', true],
        'books.reports.settings' => [null, 'Books', 'Open the Reports settings tab', false],
        'books.reports.format' => [null, 'Books', 'Change how reports look and are worked out: decimals, units, ageing buckets, ratio inputs, headers and signatories', true],
        'books.reports.reconcile_setup' => [null, 'Books', 'Choose which ledger groups can be reconciled and how, and which accounts count as cash and bank in reports', true],
        'books.reports.approval' => [null, 'Books', 'Change whether reconciliations and the year-end close need a second approver', true],
        'books.tax.view' => [null, 'Books', 'Open the Tax control tab (view only unless the person may change it)', false],
        'books.tax.control' => [null, 'Books', 'Change how tax behaves: categories and methods, where taxes are kept, rounding, taxes that apply regardless', true],
        'books.tax.admin' => [null, 'Books', 'Tax administrator: change the company\'s tax registrations and filing settings', true],
        'books.tax.override' => [null, 'Books', 'Change what a tax is calculated on, on a document, where the tax allows it (a reason is kept)', true],
        'books.reconcile'   => [null, 'Books', 'Prepare a reconciliation of a bank, mobile-money, cash or other account', true],
        'books.reconcile.approve' => [null, 'Books', 'Approve a reconciliation that someone else prepared', true],
        'books.close.prepare' => [null, 'Books', 'Prepare the year-end close for approval', true],
        'books.budget.exceed' => [null, 'Books', 'Post a voucher that takes spending over its budget without being stopped or waiting for approval', true],
        'books.budget.approve' => [null, 'Books', 'Approve, send back, lock or reopen a budget version that someone else prepared', true],
        'books.planning'    => [null, 'Books', 'Set budgets and the cash forecast assumptions (recurring payments and receipts, collection and payment timing)', true],
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
        'security.view'     => [null, 'Access', 'See the sign-in log: who signed in, wrong passwords, waits and alerts', false],
        'security.manage'   => [null, 'Access', 'Change the sign-in rules: who must use a passkey, from what date, and the switch that turns the rule on', true],
        'catalogue.pricelists' => ['ecommerce', 'Catalogue', 'Make price lists, catalogues and brochures', true],
        'catalogue.delete'  => ['ecommerce', 'Catalogue', 'Delete products, services, categories, brands and images', true],
        'campaigns.build'   => ['campaigns', 'Campaigns', 'Build campaigns and send them for approval', true],
        'campaigns.publish' => ['campaigns', 'Campaigns', 'Publish, pause and archive campaigns', true],
        'pos.view'          => ['extras', 'Point of sale', 'Open the point of sale, search the catalogue and see one\'s own sales', false],
        'pos.sell'          => ['extras', 'Point of sale', 'Make cash sales at a station', true],
        'pos.invoice'       => ['extras', 'Point of sale', 'Invoice a customer on credit from the point of sale', true],
        'pos.order'         => ['extras', 'Point of sale', 'Take a sales order, with or without a deposit, from the point of sale', true],
        'pos.return'        => ['extras', 'Point of sale', 'Start a credit note to take items back (a supervisor\'s PIN completes it)', true],
        'pos.discount'      => ['extras', 'Point of sale', 'Give a discount at the point of sale, up to the limit of one\'s role', true],
        'pos.void'          => ['extras', 'Point of sale', 'Remove a line or void an open sale', true],
        'pos.reprint'       => ['extras', 'Point of sale', 'Print a receipt again (marked as a copy)', false],
        'pos.shift'         => ['extras', 'Point of sale', 'Open and close one\'s own shift and count the drawer', true],
        'pos.supervise'     => ['extras', 'Point of sale', 'Hold a supervisor PIN that approves returns, large discounts and voids; see every shift', true],
        'pos.manage'        => ['extras', 'Point of sale', 'Set up stations, receipt paper sizes and PINs, and see the point of sale reports', true],
        'menus.view'        => ['menus', 'Menus', 'See recipes and production', false],
        'menus.manage'      => ['menus', 'Menus', 'Make recipes and record production', true],
        'menus.till'        => ['menus', 'Menus', 'Run the food till, the floor and handing orders over, without recipes, costs or setup (for a cashier or waiter)', true],
        'menus.configure'   => ['menus', 'Menus', 'Change the Menus configuration: the currency, the accounts, the tips rules, packaging, stations, kiosks and channels', true],
        'menus.tips.view'   => ['menus', 'Menus', 'See the tips, today\'s and the ones waiting to be handed over', false],
        'menus.tips.issue'  => ['menus', 'Menus', 'Hand tips over to other people (the money is paid out of the till and booked)', true],
        'menus.tips.issue_self' => ['menus', 'Menus', 'Hand one\'s own tip over to oneself (a narration is asked)', true],
        'menus.tips.reverse' => ['menus', 'Menus', 'Undo a tip that was handed over by mistake', true],
        'menus.packaging.waive' => ['menus', 'Menus', 'Waive or remove takeaway packaging that is compulsory and has a price', true],
        'courses.view'      => ['courses', 'Courses', 'See the courses, recipes, notes and live classes', false],
        'courses.manage'    => ['courses', 'Courses', 'Make and change courses, recipes, notes and live classes, and set them up', true],
        'courses.teach'     => ['courses', 'Courses', 'Change the courses one teaches', false],
        'courses.enrol'     => ['courses', 'Courses', 'Enrol students and take payments for their fees', true],
        'courses.refund'    => ['courses', 'Courses', 'Refund an enrolment, also after the refund window', true],
        'courses.grant'     => ['courses', 'Courses', 'Give people access to a course, or end it', true],
        'memberships.view'    => ['memberships', 'Memberships', 'See membership plans and members', false],
        'memberships.manage'  => ['memberships', 'Memberships', 'Make and change membership plans, their benefits and the settings', true],
        'memberships.enrol'   => ['memberships', 'Memberships', 'Sign members up and take their payments', true],
        'memberships.refund'  => ['memberships', 'Memberships', 'Refund a membership payment', true],
        'memberships.grant'   => ['memberships', 'Memberships', 'Give a membership without billing, or end one', true],
        'memberships.checkin' => ['memberships', 'Memberships', 'Check members in at the door or desk', false],
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
        // units of measure are Core (version 16): they serve stock, books, tax and every module, so they no longer sit with the E-commerce catalogue permissions
        'units.view'        => [null, 'Settings', 'See the units of measure and how they convert', false],
        'units.manage'      => [null, 'Settings', 'Add and change units of measure and the units each place uses by default', true],
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
        'projects.use'      => ['projects', 'Projects', 'Open Projects and work on the projects you are on', false],
        'projects.delete'   => ['projects', 'Projects', 'Put projects and their parts in the trash and take them back out', true],
        'projects.purge'    => ['projects', 'Projects', 'Delete from the Projects trash for good', true],
        'hr.manage'         => ['extras', 'People', 'Manage employee records', true],
        'careers.manage'    => ['careers', 'People', 'Post jobs and manage applications', true],
        'analytics.view'    => ['extras', 'Insight', 'See search and customer analytics', false],
        'insight.mimi'      => [null, 'Insight', 'See the Mimi chat analytics and block abusers', true],
        'mimi.knowledge'    => [null, 'Insight', 'Write and review the entries Mimi answers from, and see the questions she could not answer', true],
        'mimi.routing'      => [null, 'System', 'Choose how Mimi answers and what she may send to an outside AI, per kind of account', true],
        'notifications.view'       => [null, 'System', 'See the notification log, the messages waiting to be sent by hand, and the history of the settings', false],
        'notifications.send'       => [null, 'System', 'Send waiting WhatsApp messages by hand, retry failed ones and send a test message', true],
        'notifications.settings'   => [null, 'System', 'Set up email and WhatsApp (keys, passwords, rules) and roll a change back', true],
        'notifications.keys.purge' => [null, 'System', 'Delete old keys and passwords kept in the history of the notification settings', true],
        'events.view'       => ['events', 'Events', 'See events, their tickets and the guest list', false],
        'events.edit'       => ['events', 'Events', 'Add and change events, sessions and ticket types, and publish them', true],
        'events.delete'     => ['events', 'Events', 'Delete events', true],
        'events.sell'       => ['events', 'Events', 'Sell tickets at the box office and give complimentary tickets', true],
        'events.checkin'    => ['events', 'Events', 'Check people in at the door (scan or search)', false],
        'events.refund'     => ['events', 'Events', 'Approve or decline ticket refunds and cancel tickets', true],
        'events.admin'      => ['events', 'Events', 'Run the events platform: categories, outside organisers, vendors and venues (verify, suspend, set commission) and approve their events', true],
        'codes.view'        => [null, 'Codes', 'See the Codes page and look up what a code stands for', false],
        'codes.manage'      => [null, 'Codes', 'Give products, batches and assets their barcodes and change or retire a code', true],
        'codes.print'       => [null, 'Codes', 'Print code labels and sheets', false],
        'payments.keys'     => [null, 'System', 'Set the M-Pesa (and card) payment keys, roll a change back and delete old keys from the history', true],
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
        'vendors.portal'    => ['extras', 'Purchases', 'Manage the vendor portal: registrations, portal access and vendor approvals', true],
        'tenders.view'      => ['extras', 'Purchases', 'See tenders and who they were sent to', false],
        'tenders.manage'    => ['extras', 'Purchases', 'Post, change, close and email tender notices and their files', true],
        'prequalification.view'      => ['extras', 'Purchases', 'See which vendors are pre-qualified', false],
        'prequalification.manage'    => ['extras', 'Purchases', 'Record who is pre-qualified, with the reason', true],
        'bulkimport.core' => [null, 'Data import', 'Bulk import Core (customers, employees...) data from CSV, JSON, XML, Excel or Markdown files', true],
        'bulkimport.ecommerce' => ['ecommerce', 'Data import', 'Bulk import E-commerce data from CSV, JSON, XML, Excel or Markdown files', true],
        'bulkimport.menus' => ['menus', 'Data import', 'Bulk import Menus data from CSV, JSON, XML, Excel or Markdown files', true],
        'bulkimport.memberships' => ['memberships', 'Data import', 'Bulk import Memberships data from CSV, JSON, XML, Excel or Markdown files', true],
        'bulkimport.events' => ['events', 'Data import', 'Bulk import Events data from CSV, JSON, XML, Excel or Markdown files', true],
        'bulkimport.courses' => ['courses', 'Data import', 'Bulk import Courses data from CSV, JSON, XML, Excel or Markdown files', true],
        'bulkimport.campaigns' => ['campaigns', 'Data import', 'Bulk import Campaigns data from CSV, JSON, XML, Excel or Markdown files', true],
        'bulkimport.careers' => ['careers', 'Data import', 'Bulk import Careers data from CSV, JSON, XML, Excel or Markdown files', true],
        'bulkimport.projects' => ['projects', 'Data import', 'Bulk import Projects data from CSV, JSON, XML, Excel or Markdown files', true],
        'bulkimport.listings' => ['listings', 'Data import', 'Bulk import Listings data from CSV, JSON, XML, Excel or Markdown files', true],
        'bulkimport.accommodations' => ['accommodations', 'Data import', 'Bulk import Accommodations data from CSV, JSON, XML, Excel or Markdown files', true],
        'bulkimport.extras' => ['extras', 'Data import', 'Bulk import Extras data from CSV, JSON, XML, Excel or Markdown files', true],
        'calendar.team'     => [null, 'People', 'See the team calendar and other people\'s calendars', false],
        'attendance.manage' => [null, 'People', 'Mark and verify attendance and set the attendance rules', true],
        'attendance.arbitrate' => [null, 'People', 'Settle attendance disputes, see who reported, mark your own day', true],
        'hr.view'           => ['extras', 'People', 'See employee records', false],
        'hr.purge'          => ['extras', 'People', 'Delete employee records for good', true],
        'hr.team'           => ['extras', 'People', 'Edit the records of the people who report to you', true],
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
        // cost centres (version 5)
        'costcentres.view'  => [null, 'Books', 'See the cost centres and their defaults', false],
        'costcentres.manage' => [null, 'Books', 'Add, change and nest cost centres and set their defaults', true],
        // other companies' books (version 6): opened from a file or a fetch, never stored
        'imports.view'      => [null, 'Books', 'Open another company\'s books from a .wnkjap file or a connection (view only, nothing is stored)', false],
        'imports.export'    => [null, 'Books', 'Make .wnkjap exports of these books and the keys other companies fetch them with', true],
        'imports.manage'    => [null, 'Books', 'Keep the connections to other companies\' sites', true],
        // Projects, rebuilt (version 26, docs/PROJECTS_STAGE1_SPEC.md). All are listed now so roles can be prepared once; each starts to matter when its stage is built.
        'projects.view_all' => ['projects', 'Projects', 'See every project that is not confidential', false],
        'projects.create' => ['projects', 'Projects', 'Start a project', true],
        'projects.edit' => ['projects', 'Projects', 'Change a project\'s details', true],
        'projects.stage' => ['projects', 'Projects', 'Move a project from stage to stage', true],
        'projects.close' => ['projects', 'Projects', 'Close and reopen a project', true],
        'projects.freeze' => ['projects', 'Projects', 'Freeze a finished project so nothing on it can change, and unfreeze it', true],
        'projects.transfer' => ['projects', 'Projects', 'Hand a project to another lead', true],
        'projects.confidential' => ['projects', 'Projects', 'Make a project confidential (only the people on it can find it) or open', true],
        'projects.phases' => ['projects', 'Projects', 'Add and change a project\'s phases', true],
        'projects.fields.sensitive' => ['projects', 'Projects', 'See project fields marked sensitive', false],
        'projects.export' => ['projects', 'Projects', 'Export project lists and details', false],
        'projects.links' => ['projects', 'Projects', 'Attach records from other modules to a project, and remove them', true],
        'projects.members.view' => ['projects', 'Projects: access', 'See who can get into a project', false],
        'projects.members.manage' => ['projects', 'Projects: access', 'Invite people to a project, remove them and change their project role', true],
        'projects.log.view' => ['projects', 'Projects: access', 'Read the Projects activity log', false],
        'projects.log.export' => ['projects', 'Projects: access', 'Export the Projects activity log', false],
        'projects.guests' => ['projects', 'Projects: access', 'Invite an outsider to a project by link', true],
        'projects.access.rules' => ['projects', 'Projects: access', 'Set hours, end dates and locked areas on a project', true],
        'projects.locks.reset' => ['projects', 'Projects: access', 'Approve a locked-area password reset', true],
        'projects.approve' => ['projects', 'Projects: access', 'Approve serious actions in Projects as a supervisor', true],
        'projects.security.view' => ['projects', 'Projects: access', 'See security alerts raised inside Projects', false],
        'projects.config.view' => ['projects', 'Projects: configuration', 'Open the Projects configuration page', false],
        'projects.config.manage' => ['projects', 'Projects: configuration', 'Change Projects settings and roll them back', true],
        'projects.config.industry' => ['projects', 'Projects: configuration', 'Change the default industry', true],
        'projects.config.names' => ['projects', 'Projects: configuration', 'Rename project fields for the company', true],
        'projects.naming.personal' => ['projects', 'Projects: configuration', 'Choose my own industry names for my screens', false],
        'projects.config.fields' => ['projects', 'Projects: configuration', 'Add and change extra project fields', true],
        'projects.config.stages' => ['projects', 'Projects: configuration', 'Add and change project types and stages', true],
        'projects.config.roles' => ['projects', 'Projects: configuration', 'Add and change project roles', true],
        'projects.shortcuts' => ['projects', 'Projects: configuration', 'Change the company\'s shortcut keys for Projects', true],
        'projects.config.actions' => ['projects', 'Projects: configuration', 'Decide which actions are serious and what they need', true],
        'projects.leads.view' => ['projects', 'Projects: relationships', 'See leads', false],
        'projects.leads.manage' => ['projects', 'Projects: relationships', 'Add, change and convert leads', true],
        'projects.pipeline' => ['projects', 'Projects: relationships', 'Work the pipeline of opportunities', true],
        'projects.clients.view' => ['projects', 'Projects: relationships', 'Open client pages', false],
        'projects.clients.manage' => ['projects', 'Projects: relationships', 'Change a client\'s contacts, roles and account manager', true],
        'projects.parties' => ['projects', 'Projects: relationships', 'Add and change other parties', true],
        'projects.interactions' => ['projects', 'Projects: relationships', 'Log calls, visits and notes', true],
        'projects.health.view' => ['projects', 'Projects: relationships', 'See relationship health and worth', false],
        'projects.flags' => ['projects', 'Projects: relationships', 'Put a flag on a client and remove it', true],
        'projects.clients.export' => ['projects', 'Projects: relationships', 'Export clients and contacts', false],
        'projects.directory.yellow' => ['projects', 'Projects: directory', 'Open the yellow pages', false],
        'projects.directory.white' => ['projects', 'Projects: directory', 'Open the white pages', false],
        'projects.directory.contacts' => ['projects', 'Projects: directory', 'Reveal phone numbers and emails in the directory', false],
        'projects.directory.staff' => ['projects', 'Projects: directory', 'See staff details in the directory', false],
        'projects.directory.manage' => ['projects', 'Projects: directory', 'Add and change directory entries, categories and trades', true],
        'projects.directory.visibility' => ['projects', 'Projects: directory', 'Set who can see a directory entry', true],
        'projects.directory.publish' => ['projects', 'Projects: directory', 'Make a directory entry public', true],
        'projects.directory.export' => ['projects', 'Projects: directory', 'Export the directory', false],
        'projects.money.view' => ['projects', 'Projects: money', 'See a project\'s money', false],
        'projects.money.budget' => ['projects', 'Projects: money', 'Set and change a project budget', true],
        'projects.money.bill' => ['projects', 'Projects: money', 'Raise bills from a project', true],
        'projects.money.disbursements' => ['projects', 'Projects: money', 'Record costs paid for a client', true],
        'projects.money.rates' => ['projects', 'Projects: money', 'Set rates for people and projects', true],
        'projects.money.writeoff' => ['projects', 'Projects: money', 'Write off time or costs on a project', true],
        'projects.money.retention' => ['projects', 'Projects: money', 'Release retention', true],
        'projects.money.held.view' => ['projects', 'Projects: money', 'See money held for clients', false],
        'projects.money.held.pay' => ['projects', 'Projects: money', 'Pay out of money held for a client', true],
        'projects.ledgers.create' => ['projects', 'Projects: money', 'Create a ledger in Books from a project', true],
        'projects.ledgers.bank' => ['projects', 'Projects: money', 'Create a bank ledger in Books from a project', true],
        'projects.tasks' => ['projects', 'Projects: work', 'Create and assign tasks', true],
        'projects.scope' => ['projects', 'Projects: work', 'Change scope lines', true],
        'projects.dates' => ['projects', 'Projects: work', 'Add and change key dates', true],
        'projects.changes' => ['projects', 'Projects: work', 'Raise a change', true],
        'projects.changes.approve' => ['projects', 'Projects: work', 'Approve a change', true],
        'projects.time.log' => ['projects', 'Projects: work', 'Log my time', true],
        'projects.time.approve' => ['projects', 'Projects: work', 'Approve timesheets', true],
        'projects.time.others' => ['projects', 'Projects: work', 'Change other people\'s time', true],
        'projects.capacity' => ['projects', 'Projects: work', 'See team load and plan people', false],
        'projects.daily' => ['projects', 'Projects: work', 'Write the daily record', true],
        'projects.materials' => ['projects', 'Projects: work', 'Request and issue materials', true],
        'projects.plant' => ['projects', 'Projects: work', 'Assign plant and equipment and record hours', true],
        'projects.subcontracts' => ['projects', 'Projects: work', 'Manage subcontracts and their bills', true],
        'projects.inspections' => ['projects', 'Projects: work', 'Run inspections and snag lists', true],
        'projects.messages.client' => ['projects', 'Projects: communication', 'Message clients on a project', true],
        'projects.messages.internal' => ['projects', 'Projects: communication', 'See and write team-only notes', true],
        'projects.messages.moderate' => ['projects', 'Projects: communication', 'Edit or remove anyone\'s project messages', true],
        'projects.meetings' => ['projects', 'Projects: communication', 'Plan, move and cancel meetings', true],
        'projects.inbox.all' => ['projects', 'Projects: communication', 'See every conversation on projects I can open', false],
        'projects.files.view' => ['projects', 'Projects: documents', 'Open project files', false],
        'projects.files.manage' => ['projects', 'Projects: documents', 'Add, replace and remove project files', true],
        'projects.files.share' => ['projects', 'Projects: documents', 'Share a project file with the client', true],
        'projects.files.sign' => ['projects', 'Projects: documents', 'Ask for sign-off on a file', true],
        'projects.templates' => ['projects', 'Projects: documents', 'Manage document templates', true],
        'projects.team.view' => ['projects', 'Projects: people', 'Open the team view', false],
        'projects.team.manage' => ['projects', 'Projects: people', 'Set goals, write reviews and one-to-one notes', true],
        'projects.team.checklists' => ['projects', 'Projects: people', 'Run joining and leaving checklists', true],
        'projects.casebook.report' => ['projects', 'Projects: people', 'Report something in the casebook', true],
        'projects.casebook.handle' => ['projects', 'Projects: people', 'Receive and handle casebook reports', true],
        'projects.casebook.configure' => ['projects', 'Projects: people', 'Set casebook routing and hidden-name rules', true],
        'projects.casebook.identity' => ['projects', 'Projects: people', 'Reveal a hidden name on a casebook report', false],
        'projects.insights' => ['projects', 'Projects: insights', 'See scorecards for my projects', false],
        'projects.insights.team' => ['projects', 'Projects: insights', 'See scorecards for people', false],
        'projects.kpis' => ['projects', 'Projects: insights', 'Set KPIs and targets', true],
        'projects.rules' => ['projects', 'Projects: insights', 'Create automatic rules', true],
    ];

    /** What the admin role does not hold by default (the owner holds everything, and builds roles that hold these). Admin gets everything else. */
    public const OWNER_ONLY = ['system.modules', 'system.devtools', 'system.restore', 'access.roles', 'books.period', 'books.statements', 'books.reports.format', 'books.reports.reconcile_setup', 'books.reports.approval', 'books.close.prepare', 'books.tax.control', 'books.tax.admin', 'payroll.run', 'currency.base',
        'vault.settings', 'algorithm.run', 'projects.purge', 'tickets.purge', 'users.purge',
        'books.writeoff', 'books.bounce', 'verification.override', 'attendance.arbitrate', 'hr.purge', 'campaigns.purge', 'driver.app',
        'vault.bypass', 'ai.keys', 'settings.delete', 'mimi.routing', 'notifications.keys.purge', 'payments.keys', 'security.manage', 'projects.ledgers.bank', 'projects.casebook.identity'];

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
        return self::withProjects(self::withUnits(self::builtInRoles()));
    }

    /**
     * Units of measure became their own Core permissions (version 16). A built-in role that could change the catalogue can change units, and one that could see any of the
     * places that use units (catalogue, tax, stock, menus) can see them, so nobody loses the units page or the unit lists on the forms.
     *
     * @param array<string, array<string, mixed>> $roles
     */
    private static function withUnits(array $roles): array
    {
        foreach ($roles as $key => $role) {
            if (! is_array($role['permissions'])) {
                continue;
            }
            $has = fn (array $any) => (bool) array_intersect($any, $role['permissions']);
            $add = array_merge($has(['catalogue.edit']) ? ['units.manage'] : [], $has(['catalogue.view', 'catalogue.edit', 'tax.view', 'stock.view', 'menus.view']) ? ['units.view'] : []);
            $roles[$key]['permissions'] = array_values(array_unique(array_merge($role['permissions'], $add)));
        }

        return $roles;
    }

    /**
     * What the built-in roles hold in the rebuilt Projects module by default (version 26). Admin holds everything that is not owner-only, as always.
     * A role only gets these if it already opens Projects (`projects.use`), so a role without Projects is left alone.
     */
    private const PROJECTS_DEFAULTS = [
        'manager' => ['projects.view_all', 'projects.create', 'projects.edit', 'projects.stage', 'projects.close', 'projects.phases', 'projects.export', 'projects.links', 'projects.members.view', 'projects.members.manage', 'projects.config.view', 'projects.naming.personal', 'projects.leads.view', 'projects.leads.manage', 'projects.pipeline', 'projects.clients.view', 'projects.clients.manage', 'projects.parties', 'projects.interactions', 'projects.health.view', 'projects.directory.yellow', 'projects.directory.white', 'projects.directory.manage', 'projects.money.view', 'projects.money.budget', 'projects.tasks', 'projects.scope', 'projects.dates', 'projects.changes', 'projects.time.log', 'projects.time.approve', 'projects.capacity', 'projects.daily', 'projects.materials', 'projects.plant', 'projects.inspections', 'projects.messages.client', 'projects.messages.internal', 'projects.meetings', 'projects.inbox.all', 'projects.files.view', 'projects.files.manage', 'projects.files.share', 'projects.files.sign', 'projects.team.view', 'projects.team.checklists', 'projects.casebook.report', 'projects.insights'],
        'finance' => ['projects.view_all', 'projects.export', 'projects.links', 'projects.members.view', 'projects.naming.personal', 'projects.clients.view', 'projects.health.view', 'projects.directory.yellow', 'projects.money.view', 'projects.money.budget', 'projects.money.bill', 'projects.money.disbursements', 'projects.time.log', 'projects.files.view', 'projects.casebook.report', 'projects.insights'],
        'senior_accountant' => ['projects.view_all', 'projects.export', 'projects.links', 'projects.members.view', 'projects.naming.personal', 'projects.clients.view', 'projects.health.view', 'projects.directory.yellow', 'projects.money.view', 'projects.money.budget', 'projects.money.bill', 'projects.money.disbursements', 'projects.time.log', 'projects.files.view', 'projects.casebook.report', 'projects.insights'],
        'sales_rep' => ['projects.create', 'projects.links', 'projects.naming.personal', 'projects.leads.view', 'projects.leads.manage', 'projects.pipeline', 'projects.clients.view', 'projects.clients.manage', 'projects.interactions', 'projects.directory.yellow', 'projects.directory.white', 'projects.tasks', 'projects.time.log', 'projects.daily', 'projects.messages.client', 'projects.messages.internal', 'projects.meetings', 'projects.files.view', 'projects.files.manage', 'projects.casebook.report'],
    ];

    /** @param array<string, array<string, mixed>> $roles */
    private static function withProjects(array $roles): array
    {
        foreach (self::PROJECTS_DEFAULTS as $key => $add) {
            if (isset($roles[$key]) && is_array($roles[$key]['permissions']) && in_array('projects.use', $roles[$key]['permissions'], true)) {
                $roles[$key]['permissions'] = array_values(array_unique(array_merge($roles[$key]['permissions'], $add)));
            }
        }

        return $roles;
    }

    /** @return array<string, array<string, mixed>> */
    private static function builtInRoles(): array
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
                'permissions' => array_merge(self::STAFF, ['books.view', 'books.post', 'books.review', 'books.statements', 'books.reports.settings', 'books.reports.format', 'books.reconcile', 'books.reconcile.approve', 'books.close.prepare', 'books.planning', 'books.budget.approve', 'books.budget.exceed', 'books.tax.view', 'books.tax.override', 'payroll.run', 'stock.view', 'stock.manage', 'inventory.view', 'vendors.view', 'vendors.manage', 'tenders.view', 'tenders.manage', 'prequalification.view', 'credit.act',
                    'campaigns.build', 'catalogue.pricelists', 'menus.view', 'menus.manage', 'menus.configure', 'menus.tips.view', 'menus.tips.reverse', 'tax.view', 'tax.manage', 'currency.manage', 'currency.base', 'inventory.accounting',
                    'promos.manage', 'projects.use', 'analytics.view', 'books.writeoff', 'books.bounce', 'books.pettycash', 'quotes.write', 'verification.manage', 'hr.view', 'loyalty.grant',
                    'loyalty.deduct', 'loyalty.export', 'catalogue.publish', 'engagement.view', 'customers.view', 'customers.manage', 'credit.view', 'quotes.view', 'catalogue.view', 'catalogue.edit', 'tickets.manage', 'costcentres.view', 'costcentres.manage', 'imports.view']),
                'approvals' => ['journal.approve' => null, 'purchase.approve' => null, 'refund.approve' => null], 'sort' => 30],
            'manager' => ['name' => 'Manager', 'kind' => 'staff', 'min_clearance' => 3, 'scope_type' => 'assigned', 'data_scope' => 'all', 'module' => null, 'acts_as' => [],
                'description' => 'Manages a branch: the default one plus any granted.', 'modules' => ['*'],
                'permissions' => array_merge(self::STAFF, ['books.view', 'stock.view', 'inventory.view', 'vendors.view', 'menus.view', 'menus.till', 'menus.tips.view', 'menus.tips.issue', 'menus.tips.reverse', 'menus.packaging.waive', 'campaigns.build', 'campaigns.publish', 'catalogue.pricelists',
                    'pos.view', 'pos.sell', 'pos.invoice', 'pos.order', 'pos.return', 'pos.discount', 'pos.void', 'pos.reprint', 'pos.shift', 'pos.supervise', 'pos.manage',
                    'catalogue.delete', 'credit.act', 'delivery.manage', 'tax.view', 'inventory.accounting', 'inventory.manage', 'catalogue.settings', 'promos.manage', 'projects.use',
                    'analytics.view', 'insight.mimi', 'resources.manage', 'quotes.write', 'calendar.team', 'hr.view', 'hr.team', 'stock.override_expiry', 'stock.expiry_alerts', 'loyalty.grant',
                    'loyalty.deduct', 'loyalty.export', 'catalogue.publish', 'engagement.view', 'engagement.moderate', 'insight.ops', 'vendors.approve', 'tenders.view', 'prequalification.view', 'users.manage', 'customers.view', 'customers.manage', 'credit.view', 'quotes.view', 'catalogue.view', 'catalogue.edit', 'auctions.manage', 'shipping.manage', 'tickets.manage', 'bookings.manage', 'costcentres.view', 'codes.view', 'codes.manage', 'codes.print', 'events.view', 'events.edit', 'events.sell', 'events.checkin', 'events.refund']),
                'approvals' => ['campaign.publish' => null], 'sort' => 40],
            'finance' => ['name' => 'Finance', 'kind' => 'staff', 'min_clearance' => 3, 'scope_type' => 'assigned', 'data_scope' => 'all', 'module' => null, 'acts_as' => [],
                'description' => 'Does the finance work of the branches assigned or granted.', 'modules' => ['*'],
                'permissions' => array_merge(self::STAFF, ['books.view', 'books.post', 'payroll.run', 'stock.view', 'stock.manage', 'inventory.view', 'vendors.view', 'vendors.manage',
                    'menus.view', 'menus.manage', 'menus.configure', 'menus.tips.view', 'menus.tips.reverse', 'campaigns.build', 'catalogue.pricelists', 'credit.act', 'tax.view', 'tax.manage', 'currency.manage', 'currency.base', 'inventory.accounting',
                    'promos.manage', 'projects.use', 'analytics.view', 'books.writeoff', 'books.bounce', 'books.pettycash', 'quotes.write', 'verification.manage', 'hr.view', 'loyalty.grant',
                    'loyalty.deduct', 'loyalty.export', 'catalogue.publish', 'engagement.view', 'customers.view', 'customers.manage', 'credit.view', 'quotes.view', 'catalogue.view', 'catalogue.edit', 'tickets.manage', 'costcentres.view', 'costcentres.manage', 'imports.view']),
                'approvals' => [], 'sort' => 50],
            'logistics' => ['name' => 'Logistics', 'kind' => 'staff', 'min_clearance' => 2, 'scope_type' => 'assigned', 'data_scope' => 'all', 'module' => null, 'acts_as' => [],
                'description' => 'Runs deliveries.', 'modules' => ['*'], 'permissions' => array_merge(self::STAFF, ['delivery.manage', 'hr.view', 'customers.view', 'quotes.view', 'catalogue.view', 'shipping.manage', 'tickets.manage']), 'approvals' => [], 'sort' => 60],
            'sales_rep' => ['name' => 'Sales representative', 'kind' => 'staff', 'min_clearance' => 2, 'scope_type' => 'assigned', 'data_scope' => 'assigned', 'module' => null, 'acts_as' => [],
                'description' => 'Works with the customers assigned to them.', 'modules' => ['*'], 'permissions' => array_merge(self::STAFF, ['campaigns.build', 'catalogue.pricelists', 'quotes.write', 'loyalty.grant', 'customers.represent', 'projects.use', 'engagement.view', 'users.manage', 'customers.view', 'customers.manage', 'credit.view', 'quotes.view', 'catalogue.view', 'tickets.manage', 'bookings.manage']), 'approvals' => [], 'sort' => 70],
            'cashier' => ['name' => 'Cashier', 'kind' => 'staff', 'min_clearance' => 1, 'scope_type' => 'assigned', 'data_scope' => 'own', 'module' => null, 'acts_as' => [],
                'description' => 'Takes payments at a branch: sells at the point of sale from a station, invoices, takes orders and starts returns (a supervisor\'s PIN completes them).', 'modules' => ['*'], 'permissions' => ['admin.access', 'customers.view', 'catalogue.view', 'bookings.manage', 'pos.view', 'pos.sell', 'pos.invoice', 'pos.order', 'pos.return', 'pos.discount', 'pos.void', 'pos.reprint', 'pos.shift', 'menus.till', 'menus.tips.view', 'menus.tips.issue'], 'approvals' => [], 'sort' => 80],
            'chef' => ['name' => 'Chef', 'kind' => 'staff', 'min_clearance' => 1, 'scope_type' => 'assigned', 'data_scope' => 'all', 'module' => 'menus', 'acts_as' => [],
                'description' => 'Works with recipes and production in the kitchen.', 'modules' => ['menus'], 'permissions' => ['admin.access', 'menus.view', 'menus.manage'], 'approvals' => [], 'sort' => 90],
            'driver' => ['name' => 'Driver', 'kind' => 'staff', 'min_clearance' => 1, 'scope_type' => 'assigned', 'data_scope' => 'own', 'module' => 'extras', 'acts_as' => [],
                'description' => 'Delivers goods. Uses the driver screens only.', 'modules' => ['extras'], 'permissions' => ['driver.app'], 'approvals' => [], 'sort' => 100],
            'customer' => ['name' => 'Customer', 'kind' => 'portal', 'min_clearance' => 0, 'scope_type' => 'own', 'data_scope' => 'own', 'module' => null, 'acts_as' => [],
                'description' => 'Shops and sees their own account.', 'modules' => [], 'permissions' => [], 'approvals' => [], 'sort' => 110],
            'vendor' => ['name' => 'Vendor', 'kind' => 'portal', 'min_clearance' => 0, 'scope_type' => 'own', 'data_scope' => 'own', 'module' => null, 'acts_as' => [],
                'description' => 'A supplier who sees their own orders and statements.', 'modules' => [], 'permissions' => [], 'approvals' => [], 'sort' => 120],
            'event_organiser' => ['name' => 'Event organiser', 'kind' => 'portal', 'min_clearance' => 0, 'scope_type' => 'own', 'data_scope' => 'own', 'module' => 'events', 'acts_as' => [],
                'description' => 'An outside organiser, given when TISL verifies them. Runs their own events only (never the cash desk, refunds or company settings).', 'modules' => ['events'], 'permissions' => ['admin.access', 'events.view', 'events.edit', 'events.checkin'], 'approvals' => [], 'sort' => 125],
            'applicant' => ['name' => 'Job applicant', 'kind' => 'portal', 'min_clearance' => 0, 'scope_type' => 'own', 'data_scope' => 'own', 'module' => 'careers', 'acts_as' => [],
                'description' => 'Sees their own job applications.', 'modules' => [], 'permissions' => [], 'approvals' => [], 'sort' => 130],
        ];
    }
}
