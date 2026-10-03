<?php

namespace App\Services\Backup;

/**
 * Which database tables belong to which module, for backups.
 *
 * This is the map the backup engine walks: for every ACTIVE module it exports
 * that module's tables; a disabled module's tables are skipped (and flagged in
 * the UI). Core is always included.
 *
 * Core owns everything a voucher or a stock movement touches (vendors, stock, carts,
 * quotes) so a business without E-commerce still backs up its books; E-commerce holds
 * only the catalogue, hampers and auctions.
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
            // Books: chart of accounts, numbering, vouchers and everything they post.
            'ledger_groups', 'ledgers', 'voucher_types', 'voucher_series', 'payment_methods',
            'financial_years', 'accounting_settings', 'voucher_edit_limits',
            'vouchers', 'voucher_items', 'voucher_item_taxes', 'voucher_entries', 'voucher_bill_refs',
            'vendors', 'vendor_products',
            'variant_location_stock', 'customer_carts', 'customer_quote_lists',
            'voucher_versions', 'voucher_instruments', 'cash_counts',
            'stock_movements', 'stock_batches', 'stock_batch_balances', 'stock_batch_events', 'stock_transfers', 'stock_transfer_lines', 'stock_counts', 'stock_count_lines', 'stock_jobs', 'stock_job_lines', 'stock_settings', 'stock_setting_overrides', 'voucher_audit_logs', 'voucher_tenders',
            'gift_vouchers', 'gift_voucher_transactions', 'company_profile', 'currency_rates',
            'referral_codes', 'referral_code_usage',
            'admin_saved_notes', 'vault_settings', 'nav_links',
            // Multi-location (Core): branches + staff clearance + offered-at/priced-at.
            // Stock movement/transfers live in the Inventory (Extras) tier.
            'locations', 'location_user', 'location_offering', 'location_price',
            // Loyalty: the point lots are the register behind Loyalty Points Liability.
            'loyalty_point_transactions', 'loyalty_settings',
            'customer_tiers', 'customer_tier_activities', 'customer_type_discounts',
            'referral_activity_logs',
            // Payments: gateway attempts (linked to receipt vouchers) and the legacy
            // payment / credit / store-credit tables until they are dropped.
            'payment_attempts', 'payments', 'store_credit_transactions',
            'customer_credit_invoices', 'customer_credit_invoice_items',
            'customer_credit_schedules', 'customer_credit_schedule_items', 'customer_credit_transactions',
            'shipping_activities',
            'financial_notes', 'reconciliation_sessions', 'reconciliation_lines',
            // Bookings (polymorphic; a service is the first thing booked), the staff calendar and what can be booked.
            'bookings', 'bookable_resources', 'resource_hours', 'resource_time_off', 'resource_services', 'calendar_entries', 'calendar_tokens',
            // Staff: employee records (payroll and attendance stand on them), attendance, payroll, petty cash, voucher verification.
            'employees', 'leave_logs',
            'attendance_settings', 'attendance_days', 'attendance_markers', 'attendance_disputes',
            'payroll_settings', 'payroll_components', 'payroll_employee_items', 'payroll_runs', 'payroll_lines',
            'petty_cash_floats', 'petty_cash_spends',
            'verification_settings', 'verification_assignments', 'verification_items', 'verification_log',
            // Help desk, content, policies, publications, notifications
            'tickets', 'ticket_replies',
            'content_pages', 'content_sections', 'component_layouts',
            'policies', 'policy_acceptances', 'policy_change_logs',
            'publications', 'publication_blocks', 'publication_comments', 'publication_authors',
            'notifications',
            // Themes / appearance
            'colourings', 'icon_styles', 'appearance_fonts', 'user_appearance_preferences',
            // Mimi AI
            'mimi_sessions', 'mimi_query_logs', 'mimi_blocked_actors',
            // Vault
            'vault_folders', 'vault_documents', 'vault_document_versions',
            'vault_policies', 'vault_policy_assignments', 'vault_policy_conditions',
            'vault_access_logs', 'vault_archiver_configs', 'vault_archive_runs', 'vault_archived_items',
            // Bug reports + developer notes
            'bug_reports', 'bug_report_status_history', 'dev_notes',
        ],

        'ecommerce' => [
            'products', 'product_images', 'product_options', 'product_option_values',
            'product_variants', 'product_variant_options', 'product_variant_units',
            // (per-branch variant stock, carts and quote lists are Core: they feed vouchers and checkout)
            // products.default_unit_id / alternate_unit_id point at units_of_measure
            // (Core, always backed up). The whole table is dumped and restore is
            // column-drift-safe, so those columns travel with 'products' — no extra
            // entry needed. product_activity_logs records variant/unit changes.
            'product_activity_logs',
            'product_reviews',
            'categories', 'brands',
            'services', 'service_categories',
            // fees a service carries (deposit, call-out…) and the cancellation windows
            'service_fees', 'service_settings',
            // service options, packages (variants) and structured requirements
            'service_options', 'service_option_values', 'service_variants', 'service_variant_options', 'service_requirements', 'service_variant_materials',
            // saved products and services (wishlist)
            'customer_wishlists', 'review_helpful_votes',
            'hampers', 'hamper_items', 'hamper_customer_eligibility', 'hamper_activity_logs',
            // (hamper/auction orders were retired — they sell through the normal checkout)
            'auctions', 'auction_bids', 'auction_charges', 'auction_registrations', 'auction_order_activity_logs',
        ],

        'extras' => [
            'inventory_categories', 'inventory_locations', 'inventory_items', 'inventory_instances',
            'inventory_groups', 'inventory_group_members', 'inventory_assignments',
            'inventory_lifecycle_movements', 'inventory_location_movements',
            'inventory_repairs', 'inventory_disputes',
            'inventory_return_audits', 'inventory_return_audit_items',
            'inventory_export_logs', 'inventory_export_presets',
            'purchase_orders', 'purchase_order_items',
            // Delivery + drivers (drivers are users, backed up under Core)
            'delivery_manifests', 'delivery_items', 'delivery_item_vouchers', 'delivery_incidents', 'delivery_ratings',
            'delivery_activity_logs', 'driver_location_pings', 'driver_rating_adjustments',
            // (employees and leave logs moved to Core: payroll and attendance stand on them)
            // Algorithm, search and AI analytics
            'algorithm_config', 'algorithm_segment_rules', 'algorithm_bonus_content',
            'customer_algorithm_scores', 'customer_product_pins', 'search_events',
            'ai_analytics_modules', 'ai_analytics_sessions', 'ai_analytics_outputs',
        ],

        'careers'        => ['job_postings', 'applicants', 'applications', 'application_documents', 'application_status_history'],
        'projects'       => [
            'projects', 'project_milestones', 'project_tasks', 'project_messages',
            'project_participants', 'project_links', 'project_items', 'project_activities',
        ],
        'listings'       => [/* built later */],
        'campaigns'      => [/* built later */],
        'courses'        => [/* built later */],
        'accommodations' => [/* built later */],
        'menus'          => ['recipes', 'recipe_items', 'productions', 'production_lines'],
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
        // Secrets tied to this server: AI keys are encrypted with its APP_KEY (unreadable
        // after a restore elsewhere), developer access keys hold raw keys.
        'ai_provider_keys', 'dev_access_keys', 'dev_access_key_logs',
        // Framework / transient
        'vault_unlock_sessions',
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
