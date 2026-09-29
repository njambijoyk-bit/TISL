<?php

namespace App\Services\Backup;

/**
 * Which database tables belong to which module, for backups.
 *
 * This is the map the backup engine walks: for every ACTIVE module it exports
 * that module's tables; a disabled module's tables are skipped (and flagged in
 * the UI). Core is always included.
 *
 * The lists grow as each module is built out. Any live table that is neither
 * listed here nor in EXCLUDE is reported to the admin as "unassigned" so it is
 * never silently dropped from a backup.
 */
final class ModuleTables
{
    /**
     * module_key => [tables]. 'core' is always backed up.
     * Extend each list as the module's schema is finalised.
     */
    public const MAP = [
        'core' => [
            'users', 'customers', 'customer_addresses', 'customer_notes',
            'currencies', 'currency_activity_logs',
            'units_of_measure', 'unit_locale_defaults',
            'tax_rules', 'tax_districts', 'tax_rule_districts',
            'tax_applicability', 'tax_applications', 'tax_legitimacy_certificates', 'tax_activity_logs',
            'withholding_certificates', 'withholding_classifications',
            'withholding_clearances', 'withholding_activity_logs',
            'orders', 'order_items',
            // Books: chart of accounts, numbering, vouchers and everything they post.
            'ledger_groups', 'ledgers', 'voucher_types', 'voucher_series', 'payment_methods',
            'financial_years', 'accounting_settings', 'voucher_edit_limits',
            'vouchers', 'voucher_items', 'voucher_item_taxes', 'voucher_entries', 'voucher_bill_refs',
            'stock_movements', 'voucher_audit_logs', 'voucher_tenders',
            'gift_vouchers', 'gift_voucher_transactions', 'company_profile', 'currency_rates',
            'quotes', 'quote_items', 'quote_requests',
            'referral_codes', 'referral_code_usage',
            'admin_saved_notes', 'vault_settings', 'nav_links',
            // Multi-location (Core): branches + staff clearance + offered-at/priced-at.
            // Stock movement/transfers live in the Inventory (Extras) tier.
            'locations', 'location_user', 'location_offering', 'location_price',
            // TODO: loyalty, payments, credit accounts, tickets, content pages,
            // policies, publications, notifications, bookings, reconciliation…
        ],

        'ecommerce' => [
            'products', 'product_images', 'product_options', 'product_option_values',
            'product_variants', 'product_variant_options', 'product_variant_units',
            'variant_location_stock',
            // products.default_unit_id / alternate_unit_id point at units_of_measure
            // (Core, always backed up). The whole table is dumped and restore is
            // column-drift-safe, so those columns travel with 'products' — no extra
            // entry needed. product_activity_logs records variant/unit changes.
            'product_activity_logs',
            'product_reviews',
            'categories', 'brands',
            'services', 'service_categories',
            // service options, packages (variants) and structured requirements
            'service_options', 'service_option_values', 'service_variants', 'service_variant_options', 'service_requirements',
            // saved services (wishlist.service_ids) and quote-list lines with their chosen package + answers
            'customer_wishlists', 'customer_quote_lists',
            'hamper_customer_eligibility',
            // TODO: hampers, hamper_items, auctions, bids, wishlists, specials…
            // (hamper/auction orders were retired — they sell through the normal checkout)
        ],

        'extras' => [
            'inventory_categories', 'inventory_locations', 'inventory_items', 'inventory_instances',
            'inventory_groups', 'inventory_group_members', 'inventory_assignments',
            'inventory_lifecycle_movements', 'inventory_location_movements',
            'inventory_repairs', 'inventory_disputes',
            'inventory_return_audits', 'inventory_return_audit_items',
            'inventory_export_logs', 'inventory_export_presets',
            // TODO: delivery_*, drivers, employees, worksheets, search analytics, algorithm…
        ],

        'careers'        => ['application_status_history' /* TODO: job_vacancies, applicants, applications, application_documents… */],
        'projects'       => [/* TODO: projects, milestones, tasks, project_messages, participants, links, items */],
        'listings'       => [/* built later */],
        'campaigns'      => [/* built later */],
        'courses'        => [/* built later */],
        'accommodations' => [/* built later */],
        'menus'          => [/* built later */],
        'events'         => [/* built later */],
        'memberships'    => [/* built later */],
    ];

    /**
     * Never backed up: the licensing/identity layer and framework system tables.
     * (The backup config itself is excluded too — a restore must not carry it.)
     */
    public const EXCLUDE = [
        // Licensing / identity
        'installation', 'modules', 'module_locks', 'license_attempts',
        // Backup feature's own state
        'backup_settings', 'backup_runs', 'module_table_map',
        // Framework / transient
        'migrations', 'sessions', 'cache', 'cache_locks',
        'jobs', 'job_batches', 'failed_jobs',
        'password_reset_tokens', 'personal_access_tokens',
    ];

    /** Tables declared for a module (empty array if none yet). */
    public static function for(string $moduleKey): array
    {
        return self::MAP[$moduleKey] ?? [];
    }

    /** All tables claimed by any module (used to find "unassigned" live tables). */
    public static function allClaimed(): array
    {
        return array_values(array_unique(array_merge(...array_values(self::MAP))));
    }
}
