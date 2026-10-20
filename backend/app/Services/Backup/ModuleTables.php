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
            // the asset register (furniture, equipment, what is issued to staff): every business has some, so it is Core
            'inventory_categories', 'inventory_locations', 'inventory_items', 'inventory_instances',
            'inventory_groups', 'inventory_group_members', 'inventory_assignments',
            'inventory_lifecycle_movements', 'inventory_location_movements',
            'inventory_repairs', 'inventory_disputes',
            'inventory_return_audits', 'inventory_return_audit_items',
            'inventory_export_logs', 'inventory_export_presets', 'asset_depreciation',
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
            'stock_movements', 'stock_batches', 'stock_batch_balances', 'stock_batch_events', 'stock_transfers', 'stock_transfer_lines', 'stock_transfer_ingredient_lines', 'stock_count_ingredient_lines', 'stock_counts', 'stock_count_lines', 'stock_jobs', 'stock_job_lines', 'stock_settings', 'stock_setting_overrides', 'voucher_audit_logs', 'voucher_tenders',
            'gift_vouchers', 'gift_voucher_transactions', 'company_profile', 'currency_rates',
            // Books > Mail: who sent which customer document to whom, when, and whether it went (an audit trail, so Core).
            'document_shares',
            'referral_codes', 'referral_code_usage',
            'admin_saved_notes', 'vault_settings', 'nav_links',
            // Multi-location (Core): branches + staff clearance + offered-at/priced-at.
            // Stock movement/transfers live in the Inventory (Extras) tier.
            'locations', 'location_user', 'location_offering', 'location_price', 'cost_centres', 'cost_centre_settings', 'exchange_keys', 'exchange_connections', 'departments', 'standard_departments', 'employee_cost_centres',
            // Identity and access: clearance levels, roles and what they hold, who holds which role, branch grants, the audit trail.
            'clearance_levels', 'roles', 'permissions', 'role_permissions', 'role_modules', 'role_approvals', 'user_roles', 'user_access_grants', 'access_log', 'access_meta', 'access_settings',
            // Security: who is signed in where, and the one log of sign-in events.
            'auth_sessions', 'security_events', 'auth_credentials', 'security_settings', 'auth_recovery_codes', 'auth_seals',   // (the passkeys people added, the passkey rule's settings, recovery codes and seal phrases: restoring a backup must not lock everyone out)
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
            // Bookings (polymorphic; a service is the first thing booked), the staff calendar and what can be booked.
            'bookings', 'bookable_resources', 'resource_hours', 'resource_time_off', 'resource_services', 'calendar_entries', 'calendar_tokens',
            // Staff: employee records (payroll and attendance stand on them), attendance, payroll, petty cash, voucher verification.
            'employees', 'leave_logs',
            'attendance_settings', 'attendance_days', 'attendance_markers', 'attendance_disputes',
            'payroll_settings', 'payroll_components', 'payroll_employee_items', 'payroll_runs', 'payroll_lines',
            'petty_cash_floats', 'petty_cash_spends',
            'verification_settings', 'verification_assignments', 'verification_items', 'verification_log',
            // Help desk, content, policies, notifications
            'tickets', 'ticket_replies',
            'content_pages', 'content_sections', 'component_layouts',
            'policies', 'policy_acceptances', 'policy_change_logs',
            'notifications', 'notification_settings', 'notification_setting_versions', 'notification_setting_logs', 'notification_deliveries', 'payment_settings', 'payment_setting_versions', 'payment_setting_logs', 'code_settings', 'code_sequences', 'code_aliases', 'code_prints', 'stock_watches', 'stock_watch_runs', 'customer_reminder_prefs', 'cart_reminders', 'price_watch_marks', 'price_drop_notices',
            // Themes / appearance
            'colourings', 'icon_styles', 'appearance_fonts', 'user_appearance_preferences',
            // Mimi AI
            'mimi_sessions', 'mimi_query_logs', 'mimi_blocked_actors', 'mimi_kb_entries', 'mimi_kb_questions', 'mimi_routing',
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
            'categories', 'brands',
            'services', 'service_categories',
            // fees a service carries (deposit, call-out…) and the cancellation windows
            'service_fees', 'service_settings',
            // price lists, the Archive, brochures and catalogues, and their settings
            'price_lists', 'price_list_items', 'price_list_archives', 'brochures', 'brochure_item_meta', 'catalogue_settings',
            // service options, packages (variants) and structured requirements
            'service_options', 'service_option_values', 'service_variants', 'service_variant_options', 'service_requirements', 'service_variant_materials',
            // saved products and services (wishlist)
            'customer_wishlists',
            'hampers', 'hamper_items', 'hamper_customer_eligibility', 'hamper_activity_logs',
            // (hamper/auction orders were retired — they sell through the normal checkout)
            'auctions', 'auction_bids', 'auction_charges', 'auction_registrations', 'auction_order_activity_logs',
        ],

        'extras' => [
            'vendor_orders', 'vendor_order_items',
            'tenders', 'tender_documents', 'tender_invitations',
            'tender_bids', 'tender_bid_items', 'tender_bid_documents',
            'prequalification_templates', 'prequalifications', 'prequalification_documents',
            // Delivery + drivers (drivers are users, backed up under Core)
            'delivery_manifests', 'delivery_items', 'delivery_item_vouchers', 'delivery_costs', 'delivery_incidents', 'delivery_ratings',
            'delivery_activity_logs', 'driver_location_pings', 'driver_rating_adjustments',
            // (employees and leave logs moved to Core: payroll and attendance stand on them)
            // Algorithm, search and AI analytics
            'algorithm_config', 'algorithm_segment_rules', 'algorithm_bonus_content',
            'customer_algorithm_scores', 'customer_product_pins', 'search_events',
            'ai_analytics_modules', 'ai_analytics_sessions', 'ai_analytics_outputs',
            // Engagement Engine: reviews, comments, reactions, reports and their settings
            'engagement_settings', 'engagement_report_reasons', 'engagement_rules', 'engagement_posts', 'engagement_reactions', 'engagement_reports', 'engagement_log',
            // Point of sale: stations, who works at them, the receipt paper of each branch
            'pos_stations', 'pos_station_users', 'pos_branch_settings', 'pos_holds', 'pos_sale_keys', 'pos_pins', 'pos_shifts', 'pos_self_sessions', 'pos_help_requests',
        ],

        'careers'        => ['job_postings', 'applicants', 'applications', 'application_documents', 'application_status_history'],
        'projects'       => [
            'projects', 'project_milestones', 'project_tasks', 'project_messages',
            'project_participants', 'project_links', 'project_items', 'project_activities',
        ],
        'listings'       => [/* built later */],
        'campaigns'      => ['campaigns', 'campaign_sections', 'campaign_items', 'campaign_events',
            'campaign_pins', 'campaign_boards', 'campaign_board_pins', 'campaign_moodboards', 'campaign_board_follows', 'campaign_access_log', 'campaign_settings', 'campaign_pin_uploads', 'preorder_offers', 'preorder_lines', 'preorder_offer_supply'],
        'courses'        => ['course_offerings', 'course_sections', 'course_lessons', 'course_files', 'course_live', 'course_access', 'course_downloads', 'course_settings', 'course_fees', 'course_enrolments', 'course_enrolment_lines', 'course_instalments', 'course_progress', 'course_books', 'course_book_orders', 'course_offering_books', 'course_sessions', 'course_register', 'course_attendance_flags', 'course_quizzes', 'course_questions', 'course_attempts', 'course_certificates', 'course_intakes', 'course_waitlist', 'course_recipe_sources', 'course_kit_items', 'course_kit_handouts'],
        'accommodations' => [/* built later */],
        'menus'          => ['recipes', 'recipe_items', 'productions', 'production_lines', 'menus_ingredient_families', 'menus_ingredient_variants', 'menus_ingredients', 'menus_ingredient_kinds', 'menus_ingredient_items', 'menus_receipts', 'menus_receipt_lines', 'menus_stock_batches', 'menus_stock_moves', 'menus_recipes', 'menus_recipe_lines', 'menus_recipe_steps', 'menus_recipe_times', 'menus_prep_runs', 'menus_prep_run_inputs', 'menus_prep_lots', 'menus_prep_moves', 'menus_prep_counts', 'menus_prep_count_lines', 'menus_uses', 'menus_food_tags', 'menus_productions', 'menus_dish_batches', 'menus_dish_moves', 'recipe_steps', 'menus_dishes', 'menus_settings', 'menus_menus', 'menus_sections', 'menus_section_dishes', 'menus_option_groups', 'menus_options', 'menus_option_uses', 'menus_channels', 'menus_orders', 'menus_order_lines', 'menus_stations', 'menus_tickets', 'menus_areas', 'menus_tables', 'menus_kiosks', 'menus_chefs', 'menus_chef_certs', 'menus_waste', 'menus_counts', 'menus_count_lines', 'menus_transfers', 'menus_transfer_lines', 'menus_requests', 'menus_request_lines', 'menus_shifts', 'menus_days_off', 'menus_rota_patterns', 'menus_swaps', 'menus_open_shifts', 'menus_open_claims', 'menus_premiums', 'menus_holidays', 'menus_overtime', 'menus_clock_sites', 'menus_clock_events', 'menus_plans', 'menus_plan_days', 'menus_subscriptions', 'menus_sub_periods', 'menus_sub_deliveries', 'menus_servings', 'menus_audiences', 'menus_modifier_policies', 'menus_sides', 'menus_side_amounts', 'menus_dish_slots', 'menus_dish_slot_choices', 'menus_dish_servings', 'menus_dish_audiences', 'menus_dish_modifiers', 'menus_packaging_prices', 'menus_packaging_rules', 'menus_order_packaging', 'menus_dish_condiments', 'menus_order_condiments', 'menus_tips', 'menus_tip_events', 'menus_prep_timers'],
        'events'         => ['events', 'event_sessions', 'event_ticket_types', 'event_ticket_type_sessions', 'event_tickets', 'event_checkins', 'event_refund_requests', 'event_settings', 'event_reminders'],
        'memberships'    => ['membership_plans', 'membership_plan_benefits', 'membership_settings', 'memberships', 'membership_periods', 'membership_events', 'membership_credits', 'membership_checkins'],
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
        'auth_challenges',   // single-use questions that run out in two minutes
        'auth_recovery_requests', 'auth_recovery_approvals', 'auth_email_links',   // help getting back into an account: they run out in days, and a restored approval would be a stale one
        'auth_pending_actions',   // "one more step" questions about sensitive actions: they run out in minutes, and a restored one would be a stale approval
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
