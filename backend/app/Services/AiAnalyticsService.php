<?php

namespace App\Services;

use App\Models\AiProviderKey;
use App\Models\AiAnalyticsModule;
use App\Models\AiAnalyticsSession;
use App\Models\AiAnalyticsOutput;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class AiAnalyticsService
{
    // ── Get active key or throw ──────────────────────────────────────
    public function getActiveKey(): AiProviderKey
    {
        $key = AiProviderKey::active()->first();

        if (!$key) {
            throw new \Exception('No active AI provider key configured.');
        }

        return $key;
    }

    // ── Core analysis method ─────────────────────────────────────────
    public function analyse(
        string  $moduleKey,
        int     $adminId,
        ?int    $entityId     = null,
        ?string $entityType   = null,
        string  $outputType   = 'summary',
        ?string $customPrompt = null,      // free-form question from admin
    ): AiAnalyticsOutput {

        // ── Validate module exists and is enabled ────────────────────
        $module = AiAnalyticsModule::where('key', $moduleKey)->first();

        if (!$module) {
            throw new \Exception("Unknown AI module: '{$moduleKey}'.");
        }

        if (!$module->is_enabled) {
            throw new \Exception("AI module '{$module->label}' is currently disabled.");
        }

        // ── Build prompt server-side ─────────────────────────────────
        $prompt = $this->buildPrompt($moduleKey, $outputType, $entityId, $entityType, $customPrompt);

        $key       = $this->getActiveKey();
        $startTime = microtime(true);

        try {
            // ── Call the right provider ──────────────────────────────
            $result = match($key->provider) {
                'anthropic' => $this->callAnthropic($key->getDecryptedKey(), $prompt),
                'gemini'    => $this->callGemini($key->getDecryptedKey(), $prompt),
                'openai'    => $this->callOpenAI($key->getDecryptedKey(), $prompt),
                default     => throw new \Exception("Unsupported provider: {$key->provider}"),
            };

            $duration = (int) ((microtime(true) - $startTime) * 1000);

            // ── Log successful session ───────────────────────────────
            $session = AiAnalyticsSession::create([
                'api_key_id'        => $key->id,
                'module_key'        => $moduleKey,
                'admin_id'          => $adminId,
                'prompt_tokens'     => $result['prompt_tokens'],
                'completion_tokens' => $result['completion_tokens'],
                'cost_estimate'     => $this->estimateCost($key->provider, $result['prompt_tokens'], $result['completion_tokens']),
                'model_used'        => $result['model'],
                'status'            => 'success',
                'response_time_ms'  => $duration,
            ]);

            $key->update(['last_used_at' => now()]);

            return AiAnalyticsOutput::create([
                'session_id'  => $session->id,
                'entity_type' => $entityType,
                'entity_id'   => $entityId,
                'output_type' => $outputType,
                'content'     => $result['content'],
            ]);

        } catch (\Exception $e) {
            $duration = (int) ((microtime(true) - $startTime) * 1000);

            AiAnalyticsSession::create([
                'api_key_id'       => $key?->id ?? 0,
                'module_key'       => $moduleKey,
                'admin_id'         => $adminId,
                'status'           => 'failed',
                'error_message'    => $e->getMessage(),
                'response_time_ms' => $duration,
            ]);

            throw $e;
        }
    }

    // ════════════════════════════════════════════════════════════════
    // ── Prompt building ──────────────────────────────────────────────
    // ════════════════════════════════════════════════════════════════

    private function buildPrompt(
        string  $moduleKey,
        string  $outputType,
        ?int    $entityId,
        ?string $entityType,
        ?string $customPrompt
    ): string {
        $data = match($moduleKey) {
            'orders'    => $this->fetchOrdersData($entityId),
            'projects'  => $this->fetchProjectsData($entityId),
            'bookings'  => $this->fetchBookingsData($entityId),
            'work'      => $this->fetchWorkData($entityId),
            'inventory' => $this->fetchInventoryData($entityId),
            'customers' => $this->fetchCustomersData($entityId),
            'finance'   => $this->fetchFinanceData($entityId),
            'auctions'  => $this->fetchAuctionsData($entityId),
            default     => throw new \Exception("No data fetcher for module: {$moduleKey}"),
        };

        $systemContext = "You are a business intelligence analyst for a Kenyan e-commerce and services platform. "
            . "All monetary values are in KES (Kenyan Shillings). "
            . "Be concise, data-driven, and actionable. Avoid generic advice — reference the actual numbers provided.";

        $dataBlock = "=== LIVE DATA ===\n" . json_encode($data, JSON_PRETTY_PRINT) . "\n=== END DATA ===\n\n";

        // ── Free-form: inject data as context, then answer the custom question ──
        if ($customPrompt) {
            return "{$systemContext}\n\n"
                . "Here is the current data for the {$moduleKey} module:\n\n"
                . $dataBlock
                . "Admin question: {$customPrompt}\n\n"
                . "Answer based strictly on the data provided above.";
        }

        // ── Structured: data + output-type instruction ───────────────
        $instruction = match($outputType) {
            'summary'        => "Provide a concise summary of the current state. Highlight key metrics, volume, and anything notable.",
            'insight'        => "Surface 3-5 data-driven insights or patterns an admin should know about. Reference specific numbers.",
            'risk'           => "Identify risks, anomalies, or red flags. What needs immediate attention? Be specific.",
            'recommendation' => "Based on this data, what are the top 3 recommended actions the team should take right now?",
            default          => "Provide a concise summary of the current state.",
        };

        return "{$systemContext}\n\n"
            . "Here is the current data for the {$moduleKey} module:\n\n"
            . $dataBlock
            . $instruction;
    }

    // ════════════════════════════════════════════════════════════════
    // ── Module data fetchers ─────────────────────────────────────────
    // ════════════════════════════════════════════════════════════════

    private function fetchOrdersData(?int $entityId): array
    {
        // ── Single order ─────────────────────────────────────────────
        if ($entityId) {
            $order = DB::selectOne("
                SELECT o.id, o.order_number, o.status, o.payment_status,
                    o.total, o.total_kes, o.currency, o.created_at,
                    CONCAT(c.first_name, ' ', c.last_name) as customer_name,
                    c.tier as customer_tier
                FROM orders o
                LEFT JOIN customers c ON c.id = o.customer_id
                WHERE o.id = ?
            ", [$entityId]);

            $items = DB::select("
                SELECT oi.quantity, oi.unit_price, oi.line_total,
                    oi.line_total_after_discount, oi.product_name
                FROM order_items oi
                WHERE oi.order_id = ?
            ", [$entityId]);

            return ['order' => $order, 'items' => $items];
        }

        // ── Module-wide (last 30 days) ───────────────────────────────
        $stats = DB::selectOne("
            SELECT
                COUNT(*)                                                          AS total_orders,
                SUM(total_kes)                                                    AS total_revenue,
                ROUND(AVG(total_kes), 2)                                          AS avg_order_value,
                COUNT(CASE WHEN status = 'cancelled'        THEN 1 END)          AS cancellations,
                COUNT(CASE WHEN status = 'pending'          THEN 1 END)          AS pending,
                COUNT(CASE WHEN status = 'delivered'        THEN 1 END)          AS completed,
                COUNT(CASE WHEN payment_status = 'unpaid'   THEN 1 END)          AS unpaid_orders,
                SUM(CASE WHEN payment_status = 'unpaid' THEN total_kes END)      AS unpaid_revenue
            FROM orders
            WHERE created_at >= NOW() - INTERVAL 30 DAY
            AND deleted_at IS NULL
        ");

        $byStatus = DB::select("
            SELECT status, COUNT(*) as count, SUM(total_kes) as revenue
            FROM orders
            WHERE created_at >= NOW() - INTERVAL 30 DAY
            AND deleted_at IS NULL
            GROUP BY status
        ");

        $topProducts = DB::select("
            SELECT oi.product_name, SUM(oi.quantity) as units_sold,
                SUM(oi.line_total_after_discount) as revenue
            FROM order_items oi
            JOIN orders o ON o.id = oi.order_id
            WHERE o.created_at >= NOW() - INTERVAL 30 DAY
            AND o.deleted_at IS NULL
            GROUP BY oi.product_name
            ORDER BY revenue DESC
            LIMIT 5
        ");

        $dailyTrend = DB::select("
            SELECT DATE(created_at) as date, COUNT(*) as orders, SUM(total_kes) as revenue
            FROM orders
            WHERE created_at >= NOW() - INTERVAL 14 DAY
            AND deleted_at IS NULL
            GROUP BY DATE(created_at)
            ORDER BY date ASC
        ");

        return compact('stats', 'byStatus', 'topProducts', 'dailyTrend');
    }

    // ─────────────────────────────────────────────────────────────────

    private function fetchProjectsData(?int $entityId): array
    {
        if ($entityId) {
            $project = DB::selectOne("
                SELECT p.id, p.project_number, p.title, p.status, p.priority,
                    p.target_end_date, p.base_currency,
                    COUNT(t.id) as total_tasks,
                    COUNT(CASE WHEN t.status = 'done' THEN 1 END) as completed_tasks,
                    COUNT(CASE WHEN t.status = 'blocked' THEN 1 END) as blocked_tasks
                FROM projects p
                LEFT JOIN project_tasks t ON t.project_id = p.id
                WHERE p.id = ?
                GROUP BY p.id
            ", [$entityId]);

            $participants = DB::select("
                SELECT u.name, u.role, pp.role as project_role, pp.status
                FROM project_participants pp
                JOIN users u ON u.id = pp.admin_user_id
                WHERE pp.project_id = ? AND pp.participant_type = 'admin'
            ", [$entityId]);

            return ['project' => $project, 'participants' => $participants];
        }

        $stats = DB::selectOne("
            SELECT
                COUNT(*)                                                               AS total_projects,
                COUNT(CASE WHEN status = 'active'    THEN 1 END)                      AS active,
                COUNT(CASE WHEN status = 'completed' THEN 1 END)                      AS completed,
                COUNT(CASE WHEN status = 'on_hold'   THEN 1 END)                      AS on_hold,
                COUNT(CASE WHEN status = 'planning'  THEN 1 END)                      AS planning,
                COUNT(CASE WHEN target_end_date < NOW() AND status NOT IN ('completed','cancelled') THEN 1 END) AS overdue
            FROM projects
        ");

        $taskStats = DB::selectOne("
            SELECT
                COUNT(*)                                                  AS total_tasks,
                COUNT(CASE WHEN status = 'done'    THEN 1 END)           AS completed,
                COUNT(CASE WHEN status = 'blocked' THEN 1 END)           AS blocked,
                COUNT(CASE WHEN status = 'doing'   THEN 1 END)           AS in_progress,
                COUNT(CASE WHEN due_date < NOW() AND status != 'done' THEN 1 END) AS past_due
            FROM project_tasks
            WHERE created_at >= NOW() - INTERVAL 30 DAY
        ");

        $atRisk = DB::select("
            SELECT p.id, p.title, p.target_end_date, p.status,
                COUNT(CASE WHEN t.status = 'blocked' THEN 1 END) as blocked_tasks
            FROM projects p
            LEFT JOIN project_tasks t ON t.project_id = p.id
            WHERE p.status = 'active'
            AND p.target_end_date <= NOW() + INTERVAL 7 DAY
            GROUP BY p.id
            ORDER BY p.target_end_date ASC
            LIMIT 5
        ");

        return compact('stats', 'taskStats', 'atRisk');
    }

    // ─────────────────────────────────────────────────────────────────

    private function fetchBookingsData(?int $entityId): array
    {
        if ($entityId) {
            $booking = DB::selectOne("
                SELECT b.*, CONCAT(c.first_name, ' ', c.last_name) as customer_name,
                    s.name as service_name
                FROM bookings b
                LEFT JOIN customers c ON c.id = b.customer_id
                LEFT JOIN services  s ON s.id = b.service_id
                WHERE b.id = ?
            ", [$entityId]);

            return ['booking' => $booking];
        }

        $stats = DB::selectOne("
            SELECT
                COUNT(*)                                                      AS total_bookings,
                COUNT(CASE WHEN status = 'confirmed'  THEN 1 END)            AS confirmed,
                COUNT(CASE WHEN status = 'cancelled'  THEN 1 END)            AS cancelled,
                COUNT(CASE WHEN status = 'no_show'    THEN 1 END)            AS no_shows,
                COUNT(CASE WHEN status = 'completed'  THEN 1 END)            AS completed,
                ROUND(COUNT(CASE WHEN status = 'no_show' THEN 1 END) * 100.0 / NULLIF(COUNT(*),0), 1) AS no_show_rate
            FROM bookings
            WHERE created_at >= NOW() - INTERVAL 30 DAY
        ");

        $peakHours = DB::select("
            SELECT HOUR(scheduled_at) as hour, COUNT(*) as bookings
            FROM bookings
            WHERE created_at >= NOW() - INTERVAL 30 DAY
            GROUP BY HOUR(scheduled_at)
            ORDER BY bookings DESC
            LIMIT 5
        ");

        $byService = DB::select("
            SELECT s.name, COUNT(*) as bookings,
                   COUNT(CASE WHEN b.status = 'no_show' THEN 1 END) as no_shows
            FROM bookings b
            JOIN services s ON s.id = b.service_id
            WHERE b.created_at >= NOW() - INTERVAL 30 DAY
            GROUP BY s.id, s.name
            ORDER BY bookings DESC
            LIMIT 5
        ");

        return compact('stats', 'peakHours', 'byService');
    }

    // ─────────────────────────────────────────────────────────────────

    private function fetchWorkData(?int $entityId): array
    {
        if ($entityId) {
            $task = DB::selectOne("
                SELECT t.id, t.title, t.status, t.priority, t.due_date,
                    u.name as assignee_name, p.title as project_name
                FROM project_tasks t
                LEFT JOIN users u    ON u.id = t.assigned_to
                LEFT JOIN projects p ON p.id = t.project_id
                WHERE t.id = ?
            ", [$entityId]);

            return ['task' => $task];
        }

        $stats = DB::selectOne("
            SELECT
                COUNT(*)                                                               AS total_tasks,
                COUNT(CASE WHEN status = 'done'    THEN 1 END)                        AS completed,
                COUNT(CASE WHEN status = 'doing'   THEN 1 END)                        AS in_progress,
                COUNT(CASE WHEN status = 'blocked' THEN 1 END)                        AS blocked,
                COUNT(CASE WHEN due_date < NOW() AND status != 'done' THEN 1 END)     AS past_due
            FROM project_tasks
            WHERE created_at >= NOW() - INTERVAL 30 DAY
        ");

        $byAssignee = DB::select("
            SELECT u.name,
                COUNT(*) as total,
                COUNT(CASE WHEN t.status = 'done'    THEN 1 END) as completed,
                COUNT(CASE WHEN t.status = 'blocked' THEN 1 END) as blocked
            FROM project_tasks t
            JOIN users u ON u.id = t.assigned_to
            WHERE t.created_at >= NOW() - INTERVAL 30 DAY
            GROUP BY u.id, u.name
            ORDER BY total DESC
            LIMIT 8
        ");

        $milestonesAtRisk = DB::select("
            SELECT m.title, m.due_date, m.status, m.amount, m.currency,
                p.title as project_name,
                COUNT(t.id) as remaining_tasks
            FROM project_milestones m
            JOIN projects p ON p.id = m.project_id
            LEFT JOIN project_tasks t ON t.project_id = m.project_id AND t.status != 'done'
            WHERE m.due_date <= NOW() + INTERVAL 7 DAY
            AND m.status NOT IN ('completed', 'approved')
            GROUP BY m.id
            ORDER BY m.due_date ASC
            LIMIT 5
        ");

        return compact('stats', 'byAssignee', 'milestonesAtRisk');
    }

    // ─────────────────────────────────────────────────────────────────

    private function fetchInventoryData(?int $entityId): array
    {
        if ($entityId) {
            $item = DB::selectOne("
                SELECT p.id, p.name, p.sku, p.stock_quantity,
                    p.price, p.status
                FROM products p
                WHERE p.id = ?
            ", [$entityId]);

            return ['item' => $item];
        }

        $stats = DB::selectOne("
            SELECT
                COUNT(*)                                                    AS total_products,
                COUNT(CASE WHEN stock_quantity = 0    THEN 1 END)           AS out_of_stock,
                COUNT(CASE WHEN stock_quantity > 0
                        AND stock_quantity <= 5    THEN 1 END)           AS low_stock,
                COUNT(CASE WHEN stock_quantity > 5    THEN 1 END)           AS healthy_stock,
                SUM(stock_quantity * price)                                 AS total_inventory_value
            FROM products
            WHERE status = 'active'
        ");

        $lowStock = DB::select("
            SELECT name, sku, stock_quantity
            FROM products
            WHERE stock_quantity <= 5 AND stock_quantity > 0 AND status = 'active'
            ORDER BY stock_quantity ASC
            LIMIT 10
        ");

        $slowMoving = DB::select("
            SELECT p.name, p.sku, p.stock_quantity,
                   COALESCE(SUM(oi.quantity), 0) as units_sold_30d
            FROM products p
            LEFT JOIN order_items oi ON oi.product_id = p.id
            LEFT JOIN orders o       ON o.id = oi.order_id AND o.created_at >= NOW() - INTERVAL 30 DAY
            WHERE p.status = 'active' AND p.stock_quantity > 0
            GROUP BY p.id
            HAVING units_sold_30d < 2
            ORDER BY p.stock_quantity DESC
            LIMIT 10
        ");

        return compact('stats', 'lowStock', 'slowMoving');
    }

    // ─────────────────────────────────────────────────────────────────

    private function fetchCustomersData(?int $entityId): array
    {
        if ($entityId) {
            $customer = DB::selectOne("
                SELECT c.id, CONCAT(c.first_name, ' ', c.last_name) as name,
                    c.email, c.tier, c.loyalty_points,
                    c.store_credit, c.created_at,
                    COUNT(o.id)          as total_orders,
                    SUM(o.total_kes)     as lifetime_value,
                    MAX(o.created_at)    as last_order_at
                FROM customers c
                LEFT JOIN orders o ON o.customer_id = c.id
                WHERE c.id = ?
                GROUP BY c.id
            ", [$entityId]);

            return ['customer' => $customer];
        }

        $stats = DB::selectOne("
            SELECT
                COUNT(*)                                                        AS total_customers,
                COUNT(CASE WHEN tier = 'bronze'   THEN 1 END)                  AS bronze,
                COUNT(CASE WHEN tier = 'silver'   THEN 1 END)                  AS silver,
                COUNT(CASE WHEN tier = 'gold'     THEN 1 END)                  AS gold,
                COUNT(CASE WHEN tier = 'platinum' THEN 1 END)                  AS platinum,
                COUNT(CASE WHEN created_at >= NOW() - INTERVAL 30 DAY THEN 1 END) AS new_this_month,
                SUM(loyalty_points)                                             AS total_loyalty_points,
                SUM(store_credit)                                               AS total_store_credit
            FROM customers
        ");

        $churnRisk = DB::select("
            SELECT c.id, CONCAT(c.first_name, ' ', c.last_name) as name,
                c.tier, MAX(o.created_at) as last_order_at,
                DATEDIFF(NOW(), MAX(o.created_at)) as days_since_order
            FROM customers c
            LEFT JOIN orders o ON o.customer_id = c.id
            GROUP BY c.id
            HAVING days_since_order > 60 OR days_since_order IS NULL
            ORDER BY days_since_order DESC
            LIMIT 10
        ");

        $topByValue = DB::select("
            SELECT CONCAT(c.first_name, ' ', c.last_name) as name,
                c.tier, SUM(o.total_kes) as lifetime_value, COUNT(o.id) as orders
            FROM customers c
            JOIN orders o ON o.customer_id = c.id
            WHERE o.created_at >= NOW() - INTERVAL 90 DAY
            GROUP BY c.id
            ORDER BY lifetime_value DESC
            LIMIT 5
        ");

        return compact('stats', 'churnRisk', 'topByValue');
    }

    // ─────────────────────────────────────────────────────────────────

    private function fetchFinanceData(?int $entityId): array
    {
        $revenue = DB::selectOne("
            SELECT
                SUM(CASE WHEN created_at >= NOW() - INTERVAL 30 DAY THEN total_kes END) AS revenue_30d,
                SUM(CASE WHEN created_at >= NOW() - INTERVAL 7  DAY THEN total_kes END) AS revenue_7d,
                SUM(CASE WHEN MONTH(created_at) = MONTH(NOW())
                        AND YEAR(created_at)  = YEAR(NOW())  THEN total_kes END)       AS revenue_mtd
            FROM orders
            WHERE payment_status = 'paid'
            AND deleted_at IS NULL
        ");

        $paymentMethods = DB::select("
            SELECT method, COUNT(*) as transactions, SUM(amount_received) as total
            FROM payments
            WHERE created_at >= NOW() - INTERVAL 30 DAY
            AND status = 'confirmed'
            GROUP BY method
            ORDER BY total DESC
        ");

        $creditAccounts = DB::selectOne("
            SELECT
                COUNT(*)                                                              AS total_accounts,
                COUNT(CASE WHEN credit_used > 0 THEN 1 END)                         AS accounts_with_balance,
                SUM(credit_used)                                                     AS total_outstanding,
                COUNT(CASE WHEN credit_limit IS NOT NULL
                            AND credit_used >= credit_limit * 0.9 THEN 1 END)       AS near_limit,
                SUM(credit_limit)                                                    AS total_credit_extended
            FROM customers
            WHERE has_credit_account = 1
            AND deleted_at IS NULL
        ");

        $creditSchedules = DB::selectOne("
            SELECT
                COUNT(*)                                                     AS total_schedules,
                COUNT(CASE WHEN status = 'active'    THEN 1 END)            AS active,
                COUNT(CASE WHEN status = 'defaulted' THEN 1 END)            AS defaulted,
                COUNT(CASE WHEN next_due_date < NOW()
                            AND status = 'active' THEN 1 END)               AS overdue_installments,
                SUM(total_amount)                                            AS total_value
            FROM customer_credit_schedules
        ");

        $storeCredit = DB::selectOne("
            SELECT SUM(store_credit) as total_issued,
                COUNT(CASE WHEN store_credit > 0 THEN 1 END) as holders
            FROM customers
            WHERE deleted_at IS NULL
        ");

        return compact('revenue', 'paymentMethods', 'creditAccounts', 'creditSchedules', 'storeCredit');
    }

    // ─────────────────────────────────────────────────────────────────

    private function fetchAuctionsData(?int $entityId): array
    {
        if ($entityId) {
            $auction = DB::selectOne("
                SELECT a.id, a.status, a.start_price, a.current_price, a.reserve_price,
                    a.bid_increment, a.end_time, a.max_winners,
                    COUNT(b.id) as total_bids,
                    COUNT(DISTINCT b.bidder_id) as unique_bidders
                FROM auctions a
                LEFT JOIN auction_bids b ON b.auction_id = a.id
                WHERE a.id = ?
                GROUP BY a.id
            ", [$entityId]);

            return ['auction' => $auction];
        }

        $stats = DB::selectOne("
            SELECT
                COUNT(*)                                                             AS total_auctions,
                COUNT(CASE WHEN status = 'active'    THEN 1 END)                   AS active,
                COUNT(CASE WHEN status = 'ended'     THEN 1 END)                   AS ended,
                COUNT(CASE WHEN status = 'cancelled' THEN 1 END)                   AS cancelled,
                COUNT(CASE WHEN status = 'scheduled' THEN 1 END)                   AS scheduled,
                COUNT(CASE WHEN reserve_price IS NOT NULL
                            AND current_price >= reserve_price THEN 1 END)         AS reserve_met,
                SUM(CASE WHEN status = 'ended' THEN current_price END)             AS total_sold_value,
                ROUND(AVG(CASE WHEN status = 'ended' THEN current_price END), 2)   AS avg_sale_price
            FROM auctions
            WHERE created_at >= NOW() - INTERVAL 30 DAY
        ");

        $topAuctions = DB::select("
            SELECT a.id, a.current_price, a.reserve_price, a.end_time, a.status,
                COUNT(b.id) as bid_count
            FROM auctions a
            LEFT JOIN auction_bids b ON b.auction_id = a.id
            WHERE a.created_at >= NOW() - INTERVAL 30 DAY
            GROUP BY a.id
            ORDER BY bid_count DESC
            LIMIT 5
        ");

        $endingSoon = DB::select("
            SELECT a.id, a.current_price, a.reserve_price, a.end_time,
                COUNT(b.id) as bid_count
            FROM auctions a
            LEFT JOIN auction_bids b ON b.auction_id = a.id
            WHERE a.status = 'active'
            AND a.end_time <= NOW() + INTERVAL 24 HOUR
            GROUP BY a.id
            ORDER BY a.end_time ASC
            LIMIT 5
        ");

        return compact('stats', 'topAuctions', 'endingSoon');
    }

    // ════════════════════════════════════════════════════════════════
    // ── Provider calls ───────────────────────────────────────────────
    // ════════════════════════════════════════════════════════════════

    private function callAnthropic(string $apiKey, string $prompt): array
    {
        $response = Http::withHeaders([
            'x-api-key'         => $apiKey,
            'anthropic-version' => '2023-06-01',
            'content-type'      => 'application/json',
        ])->post('https://api.anthropic.com/v1/messages', [
            'model'      => 'claude-sonnet-4-20250514',
            'max_tokens' => 1024,
            'messages'   => [
                ['role' => 'user', 'content' => $prompt]
            ],
        ]);

        if (!$response->successful()) {
            throw new \Exception('Anthropic API error: ' . $response->body());
        }

        $data = $response->json();

        return [
            'content'           => $data['content'][0]['text'] ?? '',
            'prompt_tokens'     => $data['usage']['input_tokens'] ?? 0,
            'completion_tokens' => $data['usage']['output_tokens'] ?? 0,
            'model'             => $data['model'] ?? 'claude-sonnet-4-20250514',
        ];
    }

    private function callGemini(string $apiKey, string $prompt): array
    {
        $model    = 'gemini-2.5-flash';
        $response = Http::post(
            "https://generativelanguage.googleapis.com/v1beta/models/{$model}:generateContent?key={$apiKey}",
            [
                'contents' => [['parts' => [['text' => $prompt]]]],
            ]
        );

        if (!$response->successful()) {
            throw new \Exception('Gemini API error: ' . $response->body());
        }

        $data = $response->json();

        return [
            'content'           => $data['candidates'][0]['content']['parts'][0]['text'] ?? '',
            'prompt_tokens'     => $data['usageMetadata']['promptTokenCount'] ?? 0,
            'completion_tokens' => $data['usageMetadata']['candidatesTokenCount'] ?? 0,
            'model'             => $model,
        ];
    }

    private function callOpenAI(string $apiKey, string $prompt): array
    {
        $response = Http::withHeaders([
            'Authorization' => "Bearer {$apiKey}",
            'Content-Type'  => 'application/json',
        ])->post('https://api.openai.com/v1/chat/completions', [
            'model'    => 'gpt-4o-mini',
            'messages' => [['role' => 'user', 'content' => $prompt]],
        ]);

        if (!$response->successful()) {
            throw new \Exception('OpenAI API error: ' . $response->body());
        }

        $data = $response->json();

        return [
            'content'           => $data['choices'][0]['message']['content'] ?? '',
            'prompt_tokens'     => $data['usage']['prompt_tokens'] ?? 0,
            'completion_tokens' => $data['usage']['completion_tokens'] ?? 0,
            'model'             => $data['model'] ?? 'gpt-4o-mini',
        ];
    }

    // ── Cost estimator ───────────────────────────────────────────────
    private function estimateCost(string $provider, int $promptTokens, int $completionTokens): float
    {
        $rates = [
            'anthropic' => ['in' => 0.003,   'out' => 0.015],
            'gemini'    => ['in' => 0.000075, 'out' => 0.0003],
            'openai'    => ['in' => 0.00015,  'out' => 0.0006],
        ];

        $rate = $rates[$provider] ?? ['in' => 0, 'out' => 0];

        return round(
            ($promptTokens / 1000 * $rate['in']) +
            ($completionTokens / 1000 * $rate['out']),
            6
        );
    }
}