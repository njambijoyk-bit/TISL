<?php

namespace App\Services;

use Illuminate\Support\Facades\DB;
use Carbon\Carbon;

class SearchAnalyticsService
{
    // ── Date range helper ─────────────────────────────────────────────────────

    private function dateRange(?string $from, ?string $to): array
    {
        return [
            $from ? Carbon::parse($from)->startOfDay() : Carbon::now()->subDays(30)->startOfDay(),
            $to   ? Carbon::parse($to)->endOfDay()     : Carbon::now()->endOfDay(),
        ];
    }

    // ─────────────────────────────────────────────────────────────────────────
    // DASHBOARD
    // ─────────────────────────────────────────────────────────────────────────

    public function dashboardStats(?string $from, ?string $to): array
    {
        [$start, $end] = $this->dateRange($from, $to);

        // ── Top-level counts ─────────────────────────────────────────────────
        $totals = DB::selectOne("
            SELECT
                COUNT(*)                                        AS total_events,
                COUNT(DISTINCT session_id)                      AS total_sessions,
                COUNT(DISTINCT CASE WHEN customer_id IS NOT NULL THEN customer_id END) AS unique_customers,
                COUNT(DISTINCT CASE WHEN customer_id IS NULL    THEN session_id  END) AS guest_sessions,
                SUM(event_type = 'search')                      AS search_events,
                SUM(event_type = 'product_not_found')           AS zero_result_searches,
                SUM(event_type = 'add_to_cart')                 AS cart_adds,
                SUM(event_type = 'add_to_wishlist')             AS wishlist_adds,
                SUM(event_type = 'add_to_quotelist')            AS quotelist_adds,
                SUM(event_type = 'product_view')                AS product_views,
                SUM(event_type = 'service_view')                AS service_views
            FROM search_events
            WHERE occurred_at BETWEEN ? AND ?
        ", [$start, $end]);

        // ── Zero-result searches (what to stock) ─────────────────────────────
        $zeroResults = DB::select("
            SELECT query, COUNT(*) AS times, COUNT(DISTINCT session_id) AS sessions
            FROM search_events
            WHERE event_type = 'product_not_found'
              AND occurred_at BETWEEN ? AND ?
              AND query IS NOT NULL
            GROUP BY query
            ORDER BY times DESC
            LIMIT 20
        ", [$start, $end]);

        // ── Top searches with conversion ──────────────────────────────────────
        $topSearches = DB::select("
            SELECT
                s.query,
                s.searches,
                COALESCE(a.cart_adds, 0)      AS cart_adds,
                COALESCE(a.wishlist_adds, 0)  AS wishlist_adds,
                ROUND(COALESCE(a.cart_adds, 0) / s.searches * 100, 1) AS cart_conversion_pct
            FROM (
                SELECT query, COUNT(*) AS searches
                FROM search_events
                WHERE event_type IN ('search','product_not_found')
                  AND occurred_at BETWEEN ? AND ?
                  AND query IS NOT NULL
                GROUP BY query
                ORDER BY searches DESC
                LIMIT 30
            ) s
            LEFT JOIN (
                SELECT originating_query,
                       SUM(event_type = 'add_to_cart')     AS cart_adds,
                       SUM(event_type = 'add_to_wishlist') AS wishlist_adds
                FROM search_events
                WHERE event_type IN ('add_to_cart','add_to_wishlist')
                  AND occurred_at BETWEEN ? AND ?
                  AND originating_query IS NOT NULL
                GROUP BY originating_query
            ) a ON a.originating_query = s.query
            ORDER BY s.searches DESC
        ", [$start, $end, $start, $end]);

        // ── Trending products (views last period) ─────────────────────────────
        $trendingProducts = DB::select("
            SELECT
                entity_id,
                entity_name,
                entity_sku,
                COUNT(*)                                                    AS views,
                SUM(event_type = 'add_to_cart')                            AS cart_adds,
                SUM(event_type = 'add_to_wishlist')                        AS wishlist_adds,
                COUNT(DISTINCT session_id)                                  AS unique_sessions
            FROM search_events
            WHERE event_type IN ('product_view','add_to_cart','add_to_wishlist')
              AND entity_type = 'product'
              AND occurred_at BETWEEN ? AND ?
            GROUP BY entity_id, entity_name, entity_sku
            ORDER BY views DESC
            LIMIT 20
        ", [$start, $end]);

        // ── Top filters clicked ───────────────────────────────────────────────
        $topFilters = DB::select("
            SELECT filter_type, filter_value, search_context, COUNT(*) AS clicks
            FROM search_events
            WHERE event_type = 'filter'
              AND occurred_at BETWEEN ? AND ?
            GROUP BY filter_type, filter_value, search_context
            ORDER BY clicks DESC
            LIMIT 20
        ", [$start, $end]);

        // ── Sessions per day trend ────────────────────────────────────────────
        $sessionsTrend = DB::select("
            SELECT
                DATE(occurred_at)              AS day,
                COUNT(DISTINCT session_id)     AS sessions,
                COUNT(DISTINCT customer_id)    AS customers,
                COUNT(*)                       AS events
            FROM search_events
            WHERE occurred_at BETWEEN ? AND ?
            GROUP BY DATE(occurred_at)
            ORDER BY day ASC
        ", [$start, $end]);

        // ── Repeat searchers (same query same session = frustration signal) ───
        $frustratedSessions = DB::select("
            SELECT session_id, query, COUNT(*) AS repeat_count,
                   MAX(customer_id) AS customer_id
            FROM search_events
            WHERE event_type IN ('search','product_not_found')
              AND occurred_at BETWEEN ? AND ?
              AND query IS NOT NULL
            GROUP BY session_id, query
            HAVING repeat_count > 2
            ORDER BY repeat_count DESC
            LIMIT 20
        ", [$start, $end]);

        return [
            'totals'               => $totals,
            'zero_result_searches' => $zeroResults,
            'top_searches'         => $topSearches,
            'trending_products'    => $trendingProducts,
            'top_filters'          => $topFilters,
            'sessions_trend'       => $sessionsTrend,
            'frustrated_sessions'  => $frustratedSessions,
            'period'               => ['from' => $start->toDateString(), 'to' => $end->toDateString()],
        ];
    }

    // ─────────────────────────────────────────────────────────────────────────
    // SESSIONS LIST
    // ─────────────────────────────────────────────────────────────────────────

    public function sessionsList(?string $from, ?string $to, int $page = 1, int $perPage = 30): array
    {
        [$start, $end] = $this->dateRange($from, $to);
        $offset = ($page - 1) * $perPage;

        $sessions = DB::select("
            SELECT
                se.session_id,
                se.customer_id,
                se.user_id,
                CONCAT(c.first_name, ' ', c.last_name) AS customer_name,
                c.customer_number,
                c.email                                 AS customer_email,
                c.tier,
                MIN(se.occurred_at)                     AS started_at,
                MAX(se.occurred_at)                     AS last_event_at,
                COUNT(*)                                AS total_events,
                SUM(se.event_type = 'search')           AS searches,
                SUM(se.event_type = 'product_not_found') AS zero_results,
                SUM(se.event_type = 'product_view')     AS product_views,
                SUM(se.event_type = 'service_view')     AS service_views,
                SUM(se.event_type = 'add_to_cart')      AS cart_adds,
                SUM(se.event_type = 'add_to_wishlist')  AS wishlist_adds,
                SUM(se.event_type = 'add_to_quotelist') AS quotelist_adds,
                se.ip_address
            FROM search_events se
            LEFT JOIN customers c ON c.id = se.customer_id
            WHERE se.occurred_at BETWEEN ? AND ?
            GROUP BY
                se.session_id, se.customer_id, se.user_id,
                customer_name, c.customer_number, c.email, c.tier, se.ip_address
            ORDER BY last_event_at DESC
            LIMIT ? OFFSET ?
        ", [$start, $end, $perPage, $offset]);

        $total = DB::selectOne("
            SELECT COUNT(DISTINCT session_id) AS cnt
            FROM search_events
            WHERE occurred_at BETWEEN ? AND ?
        ", [$start, $end])->cnt;

        return [
            'data'        => $sessions,
            'total'       => $total,
            'per_page'    => $perPage,
            'current_page'=> $page,
            'last_page'   => (int) ceil($total / $perPage),
        ];
    }

    // ─────────────────────────────────────────────────────────────────────────
    // SINGLE SESSION JOURNEY
    // ─────────────────────────────────────────────────────────────────────────

    public function sessionJourney(string $sessionId): array
    {
        $events = DB::select("
            SELECT
                se.*,
                CONCAT(c.first_name, ' ', c.last_name) AS customer_name,
                c.customer_number,
                c.email AS customer_email,
                c.tier,
                c.total_orders,
                c.total_spent
            FROM search_events se
            LEFT JOIN customers c ON c.id = se.customer_id
            WHERE se.session_id = ?
            ORDER BY se.occurred_at ASC
        ", [$sessionId]);

        if (empty($events)) {
            return ['events' => [], 'summary' => null];
        }

        $first = $events[0];
        $last  = $events[count($events) - 1];

        $summary = [
            'session_id'     => $sessionId,
            'customer_id'    => $first->customer_id,
            'customer_name'  => $first->customer_name,
            'customer_number'=> $first->customer_number,
            'customer_email' => $first->customer_email,
            'tier'           => $first->tier,
            'total_orders'   => $first->total_orders,
            'total_spent'    => $first->total_spent,
            'started_at'     => $first->occurred_at,
            'ended_at'       => $last->occurred_at,
            'duration_mins'  => round(
                (strtotime($last->occurred_at) - strtotime($first->occurred_at)) / 60, 1
            ),
            'total_events'   => count($events),
            'ip_address'     => $first->ip_address,
            'user_agent'     => $first->user_agent,
        ];

        return ['events' => $events, 'summary' => $summary];
    }

    // ─────────────────────────────────────────────────────────────────────────
    // CUSTOMERS LIST (with store counts)
    // ─────────────────────────────────────────────────────────────────────────

    public function customersList(?string $from, ?string $to, int $page = 1, int $perPage = 30): array
    {
        [$start, $end] = $this->dateRange($from, $to);
        $offset = ($page - 1) * $perPage;

        $customers = DB::select("
            SELECT
                c.id                AS customer_id,
                c.customer_number,
                CONCAT(c.first_name, ' ', c.last_name) AS name,
                c.email,
                c.phone,
                c.tier,
                c.status,
                c.total_orders,
                c.total_spent,
                c.loyalty_points,
                c.store_credit,
                c.last_order_date,
                -- Cart
                JSON_LENGTH(COALESCE(cc.items, '[]'))   AS cart_items,
                cc.updated_at                            AS cart_updated_at,
                -- Wishlist
                JSON_LENGTH(COALESCE(cw.ids,   '[]'))   AS wishlist_count,
                cw.updated_at                            AS wishlist_updated_at,
                -- Quote list
                JSON_LENGTH(COALESCE(cql.items,'[]'))   AS quotelist_items,
                cql.updated_at                           AS quotelist_updated_at,
                -- Analytics activity in period
                COUNT(DISTINCT se.session_id)            AS sessions_in_period,
                SUM(se.event_type = 'search')            AS searches_in_period,
                SUM(se.event_type = 'add_to_cart')       AS cart_adds_in_period,
                MAX(se.occurred_at)                      AS last_activity_at
            FROM customers c
            LEFT JOIN customer_carts       cc  ON cc.customer_id  = c.id
            LEFT JOIN customer_wishlists   cw  ON cw.customer_id  = c.id
            LEFT JOIN customer_quote_lists cql ON cql.customer_id = c.id
            LEFT JOIN search_events        se  ON se.customer_id  = c.id
                AND se.occurred_at BETWEEN ? AND ?
            WHERE c.deleted_at IS NULL
            GROUP BY
                c.id, c.customer_number, c.first_name, c.last_name,
                c.email, c.phone, c.tier, c.status, c.total_orders,
                c.total_spent, c.loyalty_points, c.store_credit,
                c.last_order_date, cc.items, cc.updated_at,
                cw.ids, cw.updated_at, cql.items, cql.updated_at
            ORDER BY last_activity_at DESC, c.total_spent DESC
            LIMIT ? OFFSET ?
        ", [$start, $end, $perPage, $offset]);

        $total = DB::selectOne("SELECT COUNT(*) AS cnt FROM customers WHERE deleted_at IS NULL")->cnt;

        return [
            'data'         => $customers,
            'total'        => $total,
            'per_page'     => $perPage,
            'current_page' => $page,
            'last_page'    => (int) ceil($total / $perPage),
        ];
    }

    // ─────────────────────────────────────────────────────────────────────────
    // SINGLE CUSTOMER DETAIL
    // ─────────────────────────────────────────────────────────────────────────

    public function customerDetail(int $customerId, ?string $from, ?string $to): array
    {
        [$start, $end] = $this->dateRange($from, $to);

        // ── Customer profile ──────────────────────────────────────────────────
        $customer = DB::selectOne("
            SELECT
                c.*,
                u.name           AS user_name,
                u.role,
                u.status         AS user_status,
                u.last_login_at  AS user_last_login,
                JSON_LENGTH(COALESCE(cc.items,  '[]')) AS cart_items,
                cc.items                               AS cart_data,
                cc.updated_at                          AS cart_updated_at,
                JSON_LENGTH(COALESCE(cw.ids,    '[]')) AS wishlist_count,
                cw.ids                                 AS wishlist_data,
                cw.updated_at                          AS wishlist_updated_at,
                JSON_LENGTH(COALESCE(cql.items, '[]')) AS quotelist_items,
                cql.items                              AS quotelist_data,
                cql.updated_at                         AS quotelist_updated_at
            FROM customers c
            LEFT JOIN users                u   ON u.id  = c.user_id
            LEFT JOIN customer_carts       cc  ON cc.customer_id  = c.id
            LEFT JOIN customer_wishlists   cw  ON cw.customer_id  = c.id
            LEFT JOIN customer_quote_lists cql ON cql.customer_id = c.id
            WHERE c.id = ? AND c.deleted_at IS NULL
        ", [$customerId]);

        if (!$customer) return ['customer' => null];

        // ── Analytics summary for period ──────────────────────────────────────
        $analytics = DB::selectOne("
            SELECT
                COUNT(DISTINCT session_id)              AS total_sessions,
                COUNT(*)                                AS total_events,
                SUM(event_type = 'search')              AS searches,
                SUM(event_type = 'product_not_found')   AS zero_results,
                SUM(event_type = 'product_view')        AS product_views,
                SUM(event_type = 'service_view')        AS service_views,
                SUM(event_type = 'add_to_cart')         AS cart_adds,
                SUM(event_type = 'add_to_wishlist')     AS wishlist_adds,
                SUM(event_type = 'add_to_quotelist')    AS quotelist_adds,
                SUM(event_type = 'filter')              AS filter_clicks,
                MIN(occurred_at)                        AS first_event,
                MAX(occurred_at)                        AS last_event
            FROM search_events
            WHERE customer_id = ? AND occurred_at BETWEEN ? AND ?
        ", [$customerId, $start, $end]);

        // ── Their sessions in period ──────────────────────────────────────────
        $sessions = DB::select("
            SELECT
                session_id,
                MIN(occurred_at)                        AS started_at,
                MAX(occurred_at)                        AS last_event_at,
                COUNT(*)                                AS events,
                SUM(event_type = 'search')              AS searches,
                SUM(event_type = 'add_to_cart')         AS cart_adds,
                SUM(event_type = 'product_view')        AS product_views,
                GROUP_CONCAT(
                    DISTINCT CASE WHEN event_type IN ('search','product_not_found')
                    THEN query END
                    ORDER BY occurred_at ASC SEPARATOR ', '
                )                                       AS queries_in_session
            FROM search_events
            WHERE customer_id = ? AND occurred_at BETWEEN ? AND ?
            GROUP BY session_id
            ORDER BY started_at DESC
        ", [$customerId, $start, $end]);

        // ── What they searched most ───────────────────────────────────────────
        $topQueries = DB::select("
            SELECT query, COUNT(*) AS times,
                   SUM(had_results = 0) AS times_not_found
            FROM search_events
            WHERE customer_id = ?
              AND event_type IN ('search','product_not_found')
              AND query IS NOT NULL
              AND occurred_at BETWEEN ? AND ?
            GROUP BY query
            ORDER BY times DESC
            LIMIT 15
        ", [$customerId, $start, $end]);

        // ── Products they viewed / interacted with ────────────────────────────
        $productActivity = DB::select("
            SELECT
                entity_id, entity_name, entity_sku,
                SUM(event_type = 'product_view')     AS views,
                SUM(event_type = 'add_to_cart')      AS cart_adds,
                SUM(event_type = 'add_to_wishlist')  AS wishlist_adds,
                SUM(event_type = 'add_to_quotelist') AS quotelist_adds,
                MAX(occurred_at)                     AS last_seen
            FROM search_events
            WHERE customer_id = ?
              AND entity_type = 'product'
              AND occurred_at BETWEEN ? AND ?
            GROUP BY entity_id, entity_name, entity_sku
            ORDER BY views DESC
            LIMIT 20
        ", [$customerId, $start, $end]);

        return [
            'customer'         => $customer,
            'analytics'        => $analytics,
            'sessions'         => $sessions,
            'top_queries'      => $topQueries,
            'product_activity' => $productActivity,
            'period'           => ['from' => $start->toDateString(), 'to' => $end->toDateString()],
        ];
    }
}