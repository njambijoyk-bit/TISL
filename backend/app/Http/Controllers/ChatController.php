<?php
namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Log;
use App\Services\Chat\MimiSessionService;
use App\Services\Chat\MimiQueryLogService;
use App\Services\Chat\MimiBlockService;
use App\Models\Product;
use App\Models\Service;
use App\Models\ServiceCategory;
use App\Models\Order;
use App\Models\Quote;
use App\Models\Customer;
use App\Models\User;
use App\Models\QuoteRequest;
use App\Models\Project;
use App\Models\ReferralCode;
use App\Models\Payment;

class ChatController extends Controller
{
    public function __construct(
        private readonly MimiSessionService  $sessionService,
        private readonly MimiQueryLogService $queryLogService,
        private readonly MimiBlockService    $blockService,
    ) {}

    public function chat(Request $request)
    {
        // ── NEW: session + block check ────────────────────────────────────────
        $session = $this->sessionService->resolveOrCreate($request, $request->user());
 
        $block = $this->blockService->checkBlocked($request, $request->user());
        if ($block) {
            $this->sessionService->markBlocked($session, $block->reason ?? '');
            $this->queryLogService->logQuery(
                session:       $session,
                query:         $request->message ?? '',
                response:      null,
                geminiRaw:     [],
                responseMs:    0,
                wasBlocked:    true,
                errorMessage:  'Actor is blocked',
            );
            return response()->json([
                'error' => $this->blockService->getBlockedMessage($block->reason),
            ], 403);
        }
        // ─────────────────────────────────────────────────────────────────────
 
        // ── EXISTING: validation (unchanged) ─────────────────────────────────
        $request->validate([
            'message' => 'required|string|max:2000',
            'history' => 'array|max:20',
        ]);
 
        $user       = $request->user();
        $role       = $user->role ?? 'customer';
        $isStaff    = $user->isStaff();
        $isCustomer = $user->isCustomer();
 
        $context = [
            'products'          => $this->getProductsContext($isStaff),
            'services'          => $this->getServicesContext(),
            'serviceCategories' => $this->getServiceCategoriesContext(),
            'customerData'      => $isCustomer ? $this->getCustomerContext($user) : null,
            'adminData'         => $isStaff    ? $this->getAdminContext($user, $role, $request->message) : null,
            'userRole'          => $role,
        ];
 
        $systemPrompt = $this->buildSystemPrompt($context, $isStaff, $isCustomer);
 
        $history = collect($request->history ?? [])
            ->map(fn($msg) => [
                'role'  => $msg['role'] === 'assistant' ? 'model' : 'user',
                'parts' => [['text' => $msg['content']]],
            ])
            ->values()
            ->toArray();
 
        $contents = array_merge(
            [
                ['role' => 'user',  'parts' => [['text' => $systemPrompt]]],
                ['role' => 'model', 'parts' => [['text' => "Understood! I am Mimi, TISL Store's assistant. Ready to help with products, orders, quotes, payments, and more."]]],
            ],
            $history,
            [['role' => 'user', 'parts' => [['text' => $request->message]]]]
        );
        // ── END EXISTING ──────────────────────────────────────────────────────
 
        // ── NEW: timed Gemini call ────────────────────────────────────────────
        $startMs  = (int) (microtime(true) * 1000);
        $response = $this->callGemini($contents);             
        $elapsed  = (int) (microtime(true) * 1000) - $startMs;
 
        [$geminiRaw, $httpStatus, $errorMessage] = $this->extractGeminiMeta($response);
 
        $this->queryLogService->logQuery(
            session:      $session,
            query:        $request->message,
            response:     $response,
            geminiRaw:    $geminiRaw,
            responseMs:   $elapsed,
            errorMessage: $errorMessage,
            httpStatus:   $httpStatus,
        );
 
        if ($errorMessage) {
            $this->sessionService->touchFailed($session);
        } else {
            $this->sessionService->touchActive($session);
        }
 
        return $this->withSessionHeader($response, $session->session_token);
        // ─────────────────────────────────────────────────────────────────────
    }

    // =========================================================================
    // PRODUCTS / SERVICES / CATEGORIES — shared across roles
    // =========================================================================

    private function getProductsContext(bool $isStaff): string
    {
        try {
            return Product::query()
                ->when(!$isStaff, fn($q) => $q->where('is_visible', true)->where('status', 'active'))
                ->select('id', 'name', 'price', 'original_price', 'in_stock', 'stock_quantity', 'short_description', 'category_id', 'brand_id', 'sku', 'on_sale', 'is_featured')
                ->with(['category:id,name', 'brand:id,name'])
                ->limit($isStaff ? 50 : 30)
                ->get()
                ->map(fn($p) =>
                    "[ID:{$p->id}] {$p->name} — KSh " . number_format($p->price, 2) .
                    ($p->original_price > $p->price ? " (was KSh " . number_format($p->original_price, 2) . ")" : "") .
                    " | Stock: " . ($p->in_stock ? "{$p->stock_quantity}" : "Out") .
                    " | Category: " . ($p->category?->name ?? 'N/A') .
                    " | Brand: " . ($p->brand?->name ?? 'N/A') .
                    ($p->on_sale     ? " | 🔥 ON SALE"  : "") .
                    ($p->is_featured ? " | ⭐ Featured" : "")
                )->join("\n") ?: 'No products available.';
        } catch (\Exception $e) {
            Log::warning('Mimi: products context failed', ['error' => $e->getMessage()]);
            return 'Products data temporarily unavailable.';
        }
    }

    private function getServicesContext(): string
    {
        try {
            return Service::where('is_available', true)
                ->where('is_visible', true)
                ->where('status', 'active')
                ->select('id', 'name', 'base_price', 'pricing_model', 'short_description', 'category_id', 'service_category')
                ->with(['category:id,name'])
                ->limit(30)
                ->get()
                ->map(fn($s) =>
                    "[ID:{$s->id}] {$s->name} — Base: KSh " . number_format($s->base_price ?? 0, 2) . " ({$s->pricing_model})" .
                    " | Category: " . ($s->category?->name ?? $s->service_category ?? 'N/A') .
                    ($s->short_description ? " | {$s->short_description}" : "")
                )->join("\n") ?: 'No services available.';
        } catch (\Exception $e) {
            Log::warning('Mimi: services context failed', ['error' => $e->getMessage()]);
            return 'Services data temporarily unavailable.';
        }
    }

    private function getServiceCategoriesContext(): string
    {
        try {
            return ServiceCategory::where('is_active', true)
                ->select('id', 'name', 'description')
                ->ordered()
                ->limit(15)
                ->get()
                ->map(fn($s) => "[ID:{$s->id}] {$s->name}" . ($s->description ? ": {$s->description}" : ""))
                ->join("\n") ?: 'No service categories.';
        } catch (\Exception $e) {
            Log::warning('Mimi: service categories context failed', ['error' => $e->getMessage()]);
            return 'Service categories unavailable.';
        }
    }

    // =========================================================================
    // CUSTOMER CONTEXT
    // Scoped strictly to the authenticated customer — never leaks other records.
    // =========================================================================

    private function getCustomerContext(User $user): ?string
    {
        try {
            // ── Correct FK: user_id, not email ────────────────────────────────
            $customer = Customer::where('user_id', $user->id)->first();
            if (!$customer) return null;

            // ── Orders ────────────────────────────────────────────────────────
            $orders = Order::where('customer_id', $customer->id)
                ->select('id', 'order_number', 'status', 'total', 'total_kes', 'currency', 'payment_status', 'created_at')
                ->latest()
                ->limit(8)
                ->get()
                ->map(fn($o) =>
                    "📦 Order #{$o->order_number} | Status: {$o->status} | Payment: {$o->payment_status}" .
                    " | KSh " . number_format($o->total_kes ?? $o->total, 2) .
                    " | {$o->created_at->format('M d, Y')}"
                )->join("\n") ?: 'No orders yet.';

            // ── Quotes ────────────────────────────────────────────────────────
            $quotes = Quote::where('customer_id', $customer->id)
                ->select('id', 'quote_number', 'status', 'total', 'valid_until', 'created_at')
                ->latest()
                ->limit(5)
                ->get()
                ->map(fn($q) =>
                    "📄 Quote #{$q->quote_number} | Status: {$q->status} | KSh " . number_format($q->total, 2) .
                    ($q->valid_until ? " | Valid until: {$q->valid_until->format('M d, Y')}" : "") .
                    " | Created: {$q->created_at->format('M d, Y')}"
                )->join("\n") ?: 'No quotes yet.';

            // ── Quote Requests ─────────────────────────────────────────────────
            $quoteRequests = QuoteRequest::where('customer_id', $customer->id)
                ->select('id', 'request_number', 'status', 'request_title', 'created_at')
                ->latest()
                ->limit(3)
                ->get()
                ->map(fn($qr) =>
                    "🔍 Request #{$qr->request_number} | {$qr->request_title} | Status: {$qr->status} | {$qr->created_at->format('M d, Y')}"
                )->join("\n") ?: 'No quote requests.';

            // ── Projects ──────────────────────────────────────────────────────
            $projects = Project::whereHas('participants', fn($q) =>
                $q->where('customer_id', $customer->id)
            )->select('id', 'title', 'status', 'created_at')
                ->latest()
                ->limit(3)
                ->get()
                ->map(fn($p) =>
                    "🚀 Project: {$p->title} | Status: {$p->status} | Started: {$p->created_at->format('M d, Y')}"
                )->join("\n") ?: 'No active projects.';

            // ── Payment history (per order, customer-safe fields only) ─────────
            $payments = Payment::where('customer_id', $customer->id)
                ->select('id', 'payment_number', 'status', 'amount_expected', 'mpesa_amount_confirmed', 'mpesa_receipt_number', 'failure_reason', 'initiated_at', 'confirmed_at', 'order_id')
                ->latest()
                ->limit(5)
                ->get()
                ->map(fn($p) =>
                    "💳 {$p->payment_number} | Status: {$p->status}" .
                    ($p->status === 'confirmed'
                        ? " | Paid: KSh " . number_format($p->mpesa_amount_confirmed, 2) . " | Receipt: {$p->mpesa_receipt_number}"
                        : " | Expected: KSh " . number_format($p->amount_expected, 2)) .
                    ($p->failure_reason ? " | Reason: {$p->failure_reason}" : "") .
                    " | {$p->initiated_at?->format('M d, Y')}"
                )->join("\n") ?: 'No payment history.';

            // ── My referral code (the code they share with others) ─────────────
            $myReferralCode = ReferralCode::where('customer_id', $customer->id)
                ->where('type', 'customer_referral')
                ->select('code', 'times_used', 'total_revenue', 'referrer_reward_value', 'referrer_reward_type', 'status', 'valid_until')
                ->first();

            $referralSection = 'No personal referral code yet.';
            if ($myReferralCode) {
                $referralSection =
                    "🔗 Your referral code: {$myReferralCode->code}" .
                    " | Used: {$myReferralCode->times_used} times" .
                    " | Revenue generated: KSh " . number_format($myReferralCode->total_revenue, 2) .
                    " | Reward per referral: {$myReferralCode->referrer_reward_type} — KSh " . number_format($myReferralCode->referrer_reward_value, 2) .
                    " | Status: {$myReferralCode->status}" .
                    ($myReferralCode->valid_until ? " | Expires: {$myReferralCode->valid_until->format('M d, Y')}" : " | No expiry");
            }

            // ── Promo codes assigned specifically to this customer ─────────────
            $promoCodes = ReferralCode::where('target_customer_id', $customer->id)
                ->whereIn('status', ['active', 'depleted', 'paused'])
                ->select('code', 'name', 'reward_type', 'reward_value', 'times_used', 'max_uses', 'valid_until', 'status', 'type')
                ->latest()
                ->limit(5)
                ->get()
                ->map(fn($c) =>
                    "🎟 {$c->code} ({$c->name}) | " .
                    ($c->reward_type === 'percentage'
                        ? "{$c->reward_value}% off"
                        : "KSh " . number_format($c->reward_value, 2) . " off") .
                    " | Used: {$c->times_used}" . ($c->max_uses ? "/{$c->max_uses}" : "") .
                    " | Status: {$c->status}" .
                    ($c->valid_until ? " | Expires: {$c->valid_until->format('M d, Y')}" : "")
                )->join("\n") ?: 'No personal promo codes assigned.';

            // ── Referral code they used when signing up ────────────────────────
            $usedReferralSection = '';
            if ($customer->referred_by_code_id) {
                $usedCode = ReferralCode::find($customer->referred_by_code_id);
                if ($usedCode) {
                    $usedReferralSection = "\n🎁 Signed up with referral code: {$usedCode->code}" .
                        ($customer->referral_completed_at
                            ? " | Referral completed: {$customer->referral_completed_at->format('M d, Y')}"
                            : " | Referral pending — place your first order to activate it");
                }
            }

            // ── Customer profile summary ───────────────────────────────────────
            return "
════════════════════════════════════════
👤 CUSTOMER PROFILE
════════════════════════════════════════
Name: {$user->name}
Email: {$user->email} | Phone: {$user->phone}
Customer #: {$customer->customer_number} | Tier: " . strtoupper($customer->tier ?? 'bronze') . "
Member Since: {$customer->created_at->format('M d, Y')}
Total Orders: {$customer->total_orders} | Total Spent: KSh " . number_format($customer->total_spent ?? 0, 2) . "
Store Credit: KSh " . number_format($customer->store_credit ?? 0, 2) . " | Loyalty Points: " . ($customer->loyalty_points ?? 0) . "
{$usedReferralSection}

════════════════════════════════════════
📦 RECENT ORDERS (last 8)
════════════════════════════════════════
{$orders}

════════════════════════════════════════
💳 RECENT PAYMENTS (last 5)
════════════════════════════════════════
{$payments}

════════════════════════════════════════
📄 RECENT QUOTES (last 5)
════════════════════════════════════════
{$quotes}

════════════════════════════════════════
🔍 RECENT QUOTE REQUESTS (last 3)
════════════════════════════════════════
{$quoteRequests}

════════════════════════════════════════
🚀 ACTIVE PROJECTS (last 3)
════════════════════════════════════════
{$projects}

════════════════════════════════════════
🎟 YOUR PROMO CODES
════════════════════════════════════════
{$promoCodes}

════════════════════════════════════════
🔗 YOUR REFERRAL CODE
════════════════════════════════════════
{$referralSection}
";
        } catch (\Exception $e) {
            Log::warning('Mimi: customer context failed', ['error' => $e->getMessage(), 'user_id' => $user->id]);
            return null;
        }
    }

    // =========================================================================
    // ADMIN CONTEXT
    // Intent-driven: detects what the admin is asking and fetches relevant data.
    // Always injects base stats so the AI has something to work with even on
    // general queries.
    // =========================================================================

    private function getAdminContext(User $user, string $role, string $message): string
    {
        $intent = $this->detectAdminIntent($message);
        $parts  = [];

        // ── Always inject base stats ───────────────────────────────────────────
        $parts['stats'] = $this->getAdminStats($role, $user);

        // ── Intent-specific data ───────────────────────────────────────────────
        switch ($intent['type']) {

            case 'order_lookup':
                $order = Order::with(['customer:id,first_name,last_name,email', 'items'])
                    ->where('order_number', $intent['identifier'])
                    ->orWhere('id', is_numeric($intent['identifier']) ? $intent['identifier'] : 0)
                    ->first();
                $parts['lookup'] = $order
                    ? $this->formatOrderDetail($order)
                    : "Order '{$intent['identifier']}' not found.";
                break;

            case 'payment_lookup':
                $payment = Payment::with(['order:id,order_number', 'customer:id,first_name,last_name,email'])
                    ->where('payment_number', $intent['identifier'])
                    ->orWhere('mpesa_receipt_number', $intent['identifier'])
                    ->orWhere('id', is_numeric($intent['identifier']) ? $intent['identifier'] : 0)
                    ->first();

                // Finance can only see their own payments
                if ($payment && $role === 'finance' && $payment->initiated_by !== $user->id) {
                    $parts['lookup'] = "You don't have access to that payment record.";
                } else {
                    $parts['lookup'] = $payment
                        ? $this->formatPaymentDetail($payment)
                        : "Payment '{$intent['identifier']}' not found.";
                }
                break;

            case 'quote_lookup':
                $quote = Quote::with(['customer:id,first_name,last_name,email', 'items'])
                    ->where('quote_number', $intent['identifier'])
                    ->orWhere('id', is_numeric($intent['identifier']) ? $intent['identifier'] : 0)
                    ->first();
                $parts['lookup'] = $quote
                    ? $this->formatQuoteDetail($quote)
                    : "Quote '{$intent['identifier']}' not found.";
                break;

            case 'customer_lookup':
                $customer = Customer::with(['user:id,name,email,phone'])
                    ->where('email', $intent['identifier'])
                    ->orWhere('customer_number', $intent['identifier'])
                    ->orWhere('id', is_numeric($intent['identifier']) ? $intent['identifier'] : 0)
                    ->first();
                $parts['lookup'] = $customer
                    ? $this->formatCustomerDetail($customer)
                    : "Customer '{$intent['identifier']}' not found.";
                break;

            case 'recent_activity':
                $parts['recent'] = $this->getRecentActivity($role, $user, $intent['filter'] ?? null);
                break;

            case 'payment_summary':
                $parts['payments'] = $this->getPaymentSummary($role, $user);
                break;
        }

        return json_encode($parts, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
    }

    // =========================================================================
    // INTENT DETECTION
    // =========================================================================

    private function detectAdminIntent(string $message): array
    {
        $msg = strtolower($message);

        // Payment number: PAY-2025-42-001
        if (preg_match('/(pay-\d{4}-\d+-\d+)/i', $message, $m)) {
            return ['type' => 'payment_lookup', 'identifier' => strtoupper($m[1])];
        }

        // M-Pesa receipt: alphanumeric ~10 chars like QJK8QX1234
        if (preg_match('/\b([A-Z]{2,3}\d{7,10})\b/i', $message, $m)) {
            return ['type' => 'payment_lookup', 'identifier' => strtoupper($m[1])];
        }

        // Order number: TISL-2025-00001 or TISL-2025-00001
        if (preg_match('/([A-Z]+-\d{4}-\d+)/i', $message, $m)) {
            return ['type' => 'order_lookup', 'identifier' => strtoupper($m[1])];
        }
        if (preg_match('/order\s*#?\s*(\d+)/i', $message, $m)) {
            return ['type' => 'order_lookup', 'identifier' => $m[1]];
        }

        // Quote number: QT-2025-001
        if (preg_match('/(qt-\d{4}-\d+)/i', $message, $m)) {
            return ['type' => 'quote_lookup', 'identifier' => strtoupper($m[1])];
        }
        if (preg_match('/quote\s*#?\s*(\w+)/i', $message, $m)) {
            return ['type' => 'quote_lookup', 'identifier' => strtoupper($m[1])];
        }

        // Customer: email, customer number CUST-2025-0001, or "customer 42"
        if (preg_match('/([a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,})/i', $message, $m)) {
            return ['type' => 'customer_lookup', 'identifier' => $m[1]];
        }
        if (preg_match('/(cust-\d{4}-\d+)/i', $message, $m)) {
            return ['type' => 'customer_lookup', 'identifier' => strtoupper($m[1])];
        }
        if (preg_match('/customer\s+#?(\d+)/i', $message, $m)) {
            return ['type' => 'customer_lookup', 'identifier' => $m[1]];
        }

        // Payment-specific queries
        if (preg_match('/(pending payment|failed payment|payment status|payments today|payment summary)/i', $msg)) {
            return ['type' => 'payment_summary'];
        }

        // Recent activity
        if (preg_match('/(recent|latest|new|pending|today|this week)/i', $msg)) {
            $filter = null;
            if (preg_match('/(pending|confirmed|processing|shipped|delivered|cancelled|failed)/i', $msg, $f)) {
                $filter = strtolower($f[1]);
            }
            return ['type' => 'recent_activity', 'filter' => $filter];
        }

        return ['type' => 'general'];
    }

    // =========================================================================
    // FORMATTERS
    // =========================================================================

    private function formatOrderDetail(Order $order): string
    {
        $customer = $order->customer;
        $name     = $customer
            ? trim(($customer->first_name ?? '') . ' ' . ($customer->last_name ?? ''))
            : 'Unknown';

        $items = $order->items->map(fn($i) =>
            "  • {$i->getDisplayName()} × {$i->quantity} @ KSh " . number_format($i->unit_price, 2)
        )->join("\n") ?: '  No items';

        return "
📦 ORDER #{$order->order_number}
Customer: {$name} ({$customer?->email})
Status: {$order->status} | Payment: {$order->payment_status}
Total: KSh " . number_format($order->total_kes ?? $order->total, 2) . "
Created: {$order->created_at->format('M d, Y H:i')}
ITEMS:
{$items}";
    }

    private function formatPaymentDetail(Payment $payment): string
    {
        $customer = $payment->customer;
        $name     = $customer
            ? trim(($customer->first_name ?? '') . ' ' . ($customer->last_name ?? ''))
            : 'Unknown';

        return "
💳 PAYMENT {$payment->payment_number}
Order: #{$payment->order?->order_number}
Customer: {$name} ({$customer?->email})
Status: {$payment->status}
Expected: KSh " . number_format($payment->amount_expected, 2) .
($payment->mpesa_amount_confirmed
    ? "\nConfirmed: KSh " . number_format($payment->mpesa_amount_confirmed, 2) . " | Receipt: {$payment->mpesa_receipt_number}"
    : "") .
($payment->failure_reason ? "\nFailure: {$payment->failure_reason}" : "") .
"\nInitiated: {$payment->initiated_at?->format('M d, Y H:i')}" .
($payment->confirmed_at ? " | Confirmed: {$payment->confirmed_at->format('M d, Y H:i')}" : "") .
"\nDispute: {$payment->dispute_status}";
    }

    private function formatQuoteDetail(Quote $quote): string
    {
        $customer = $quote->customer;
        $name     = $customer
            ? trim(($customer->first_name ?? '') . ' ' . ($customer->last_name ?? ''))
            : 'Unknown';

        $items = $quote->items->map(fn($i) =>
            "  • " . ($i->product_name ?? $i->service_name ?? $i->name ?? 'Item') . " × {$i->quantity} @ KSh " . number_format($i->unit_price ?? $i->price ?? 0, 2)
        )->join("\n") ?: '  No items';

        return "
📄 QUOTE #{$quote->quote_number}
Customer: {$name} ({$customer?->email})
Status: {$quote->status}
Total: KSh " . number_format($quote->total, 2) .
($quote->valid_until ? "\nValid Until: {$quote->valid_until->format('M d, Y')}" : "") .
"\nCreated: {$quote->created_at->format('M d, Y H:i')}
ITEMS:
{$items}";
    }

    private function formatCustomerDetail(Customer $customer): string
    {
        $orderCount = Order::where('customer_id', $customer->id)->count();
        $quoteCount = Quote::where('customer_id', $customer->id)->count();
        $totalSpent = Order::where('customer_id', $customer->id)->where('payment_status', 'paid')->sum('total_kes');
        $openDisputes = Payment::where('customer_id', $customer->id)->whereIn('dispute_status', ['raised', 'investigating'])->count();

        return "
👤 CUSTOMER: {$customer->first_name} {$customer->last_name}
Email: {$customer->email} | Phone: {$customer->phone}
Customer #: {$customer->customer_number} | Tier: " . strtoupper($customer->tier ?? 'bronze') . "
Member Since: {$customer->created_at->format('M d, Y')}
Orders: {$orderCount} | Quotes: {$quoteCount}
Total Spent: KSh " . number_format($totalSpent, 2) .
($customer->company_name ? "\nCompany: {$customer->company_name}" : "") .
($openDisputes > 0 ? "\n⚠️ Open payment disputes: {$openDisputes}" : "") .
($customer->store_credit > 0 ? "\nStore Credit: KSh " . number_format($customer->store_credit, 2) : "");
    }

    // =========================================================================
    // STATS — always injected for staff
    // =========================================================================

    private function getAdminStats(string $role, User $user): array
    {
        $stats = [
            'orders' => [
                'total'   => Order::count(),
                'pending' => Order::where('status', 'pending')->count(),
                'today'   => Order::whereDate('created_at', today())->count(),
            ],
            'quotes' => [
                'total'   => Quote::count(),
                'pending' => Quote::where('status', 'pending')->count(),
            ],
            'customers' => Customer::count(),
            'products'  => Product::where('status', 'active')->count(),
        ];

        // Finance gets payment stats too
        if (in_array($role, ['finance', 'admin', 'super_admin'])) {
            $paymentQuery = Payment::query();
            if ($role === 'finance') {
                $paymentQuery->where('initiated_by', $user->id);
            }
            $stats['payments'] = [
                'pending'        => (clone $paymentQuery)->where('status', 'pending')->count(),
                'failed'         => (clone $paymentQuery)->where('status', 'failed')->count(),
                'open_disputes'  => (clone $paymentQuery)->whereIn('dispute_status', ['raised', 'investigating'])->count(),
                'today_collected'=> 'KSh ' . number_format(
                    (clone $paymentQuery)->whereDate('confirmed_at', today())->sum('mpesa_amount_confirmed'), 2
                ),
            ];
        }

        // Sales rep sees only their assigned customers
        if ($role === 'sales_rep') {
            $assigned = Customer::where('assigned_sales_rep', $user->id)->pluck('id');
            $stats['orders']['total'] = Order::whereIn('customer_id', $assigned)->count();
            $stats['customers']       = $assigned->count();
        }

        return $stats;
    }

    // =========================================================================
    // RECENT ACTIVITY
    // =========================================================================

    private function getRecentActivity(string $role, User $user, ?string $filter): string
    {
        $query = Order::with(['customer:id,first_name,last_name']);

        if ($filter && in_array($filter, ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'failed'])) {
            $query->where('status', $filter);
        }

        if ($role === 'sales_rep') {
            $assigned = Customer::where('assigned_sales_rep', $user->id)->pluck('id');
            $query->whereIn('customer_id', $assigned);
        }

        return $query->latest()->limit(10)->get()->map(function ($o) {
            $name = $o->customer
                ? trim(($o->customer->first_name ?? '') . ' ' . ($o->customer->last_name ?? ''))
                : 'Unknown';
            return "#{$o->order_number} | {$name} | {$o->status} | KSh " . number_format($o->total_kes ?? $o->total, 2) . " | {$o->created_at->format('M d H:i')}";
        })->join("\n") ?: 'No recent orders found.';
    }

    // =========================================================================
    // PAYMENT SUMMARY — for finance/admin queries
    // =========================================================================

    private function getPaymentSummary(string $role, User $user): string
    {
        $query = Payment::query();
        if ($role === 'finance') {
            $query->where('initiated_by', $user->id);
        }

        $pending  = (clone $query)->where('status', 'pending')->count();
        $failed   = (clone $query)->where('status', 'failed')->count();
        $disputes = (clone $query)->whereIn('dispute_status', ['raised', 'investigating'])->count();
        $todayKes = (clone $query)->whereDate('confirmed_at', today())->sum('mpesa_amount_confirmed');
        $monthKes = (clone $query)->whereMonth('confirmed_at', now()->month)->whereYear('confirmed_at', now()->year)->sum('mpesa_amount_confirmed');

        $recentPending = (clone $query)->where('status', 'pending')
            ->with(['order:id,order_number', 'customer:id,first_name,last_name'])
            ->latest()
            ->limit(5)
            ->get()
            ->map(function ($p) {
                $name = $p->customer ? trim(($p->customer->first_name ?? '') . ' ' . ($p->customer->last_name ?? '')) : '—';
                return "  {$p->payment_number} | {$name} | KSh " . number_format($p->amount_expected, 2) . " | {$p->initiated_at?->format('M d H:i')}";
            })->join("\n");

        return "
💳 PAYMENT SUMMARY
Today Collected: KSh " . number_format($todayKes, 2) . "
This Month: KSh " . number_format($monthKes, 2) . "
Pending pushes: {$pending}
Failed payments: {$failed}
Open disputes: {$disputes}

Pending (latest 5):
{$recentPending}";
    }

    // =========================================================================
    // SYSTEM PROMPT
    // =========================================================================

    private function buildSystemPrompt(array $context, bool $isStaff, bool $isCustomer): string
    {
        $roleBlock = $isStaff
            ? "🔐 YOU ARE STAFF (Role: {$context['userRole']})
You have access to admin data below. You can:
• Look up orders, quotes, customers, payments by number or identifier
• Summarise stats and recent activity
• For finance role: view payment status, pending pushes, disputes for your own payments
• For admin/super_admin: full visibility across all records
Always verify sensitive lookups from the data context provided — never invent data."
            : ($isCustomer
                ? "👤 YOU ARE HELPING A LOGGED-IN CUSTOMER
Use ONLY their personal data below — never reference other customers.
You can help with:
• Order tracking and payment status
• Quote management
• Promo codes and referral code
• Projects and account details
If they ask about anything not in their data, direct them to contact support."
                : "🌐 YOU ARE HELPING A GUEST USER
Provide general store information only.
Encourage login for personalized features like order tracking, quotes, and promo codes.");

        return "
You are Mimi, TISL Store's friendly and knowledgeable assistant based in Nairobi, Kenya.
You are warm, concise, and professional. Respond in the same language the user uses.
Never make up prices, order details, or payment information not found in the data below.
Format monetary values as 'KSh X,XXX.XX'.

════════════════════════════════════════
STORE INFORMATION
════════════════════════════════════════
Name: TISL Store | Location: Nairobi, Kenya
Delivery: Free on orders over KSh 5,000 | Returns: 30-day policy
Payment: M-Pesa STK Push (finance initiates on customer's behalf)

════════════════════════════════════════
YOUR ROLE & ACCESS LEVEL
════════════════════════════════════════
{$roleBlock}

════════════════════════════════════════
LIVE DATA CONTEXT
════════════════════════════════════════
🛍️ PRODUCTS:
{$context['products']}

🔧 SERVICE CATEGORIES:
{$context['serviceCategories']}

⚙️ SERVICES:
{$context['services']}
" . ($context['customerData'] ? "\n{$context['customerData']}" : "")
  . ($context['adminData']   ? "\n🔐 ADMIN/STAFF DATA:\n{$context['adminData']}" : "");
    }

    // =========================================================================
    // GUEST CHAT
    // =========================================================================

    public function chatGuest(Request $request)
    {
        // ── NEW: session + block check ────────────────────────────────────────
        $session = $this->sessionService->resolveOrCreate($request, null);
 
        $block = $this->blockService->checkBlocked($request, null);
        if ($block) {
            $this->sessionService->markBlocked($session, $block->reason ?? '');
            $this->queryLogService->logQuery(
                session:      $session,
                query:        $request->message ?? '',
                response:     null,
                geminiRaw:    [],
                responseMs:   0,
                wasBlocked:   true,
                errorMessage: 'Actor is blocked',
            );
            return response()->json([
                'error' => $this->blockService->getBlockedMessage($block->reason),
            ], 403);
        }
        // ─────────────────────────────────────────────────────────────────────
 
        // ── EXISTING: validation + prompt + history (unchanged) ───────────────
        $request->validate([
            'message' => 'required|string|max:2000',
            'history' => 'array|max:20',
        ]);
 
        $context = [
            'products'          => $this->getProductsContext(false),
            'services'          => $this->getServicesContext(),
            'serviceCategories' => $this->getServiceCategoriesContext(),
        ];
 
        $systemPrompt = "
You are Mimi, TISL Store's assistant based in Nairobi, Kenya.
You are warm, concise, and professional.
You ONLY have access to PUBLIC store information below.
If asked about orders, payments, or account details — politely explain they need to log in.
Never ask for passwords or payment details.
 
════════════════════════════════════════
STORE INFORMATION
════════════════════════════════════════
Name: TISL Store | Location: Nairobi, Kenya
Delivery: Free on orders over KSh 5,000 | Returns: 30-day policy
 
════════════════════════════════════════
LIVE PUBLIC DATA
════════════════════════════════════════
🛍️ PRODUCTS:
{$context['products']}
 
🔧 SERVICE CATEGORIES:
{$context['serviceCategories']}
 
⚙️ SERVICES:
{$context['services']}";
 
        $history = collect($request->history ?? [])
            ->map(fn($msg) => [
                'role'  => $msg['role'] === 'assistant' ? 'model' : 'user',
                'parts' => [['text' => $msg['content']]],
            ])
            ->values()
            ->toArray();
 
        $contents = array_merge(
            [
                ['role' => 'user',  'parts' => [['text' => $systemPrompt]]],
                ['role' => 'model', 'parts' => [['text' => "Understood! I am Mimi, TISL Store's assistant. I can help you browse products, learn about our services, and guide you through registration."]]],
            ],
            $history,
            [['role' => 'user', 'parts' => [['text' => $request->message]]]]
        );
        // ── END EXISTING ──────────────────────────────────────────────────────
 
        // ── NEW: timed Gemini call ────────────────────────────────────────────
        $startMs  = (int) (microtime(true) * 1000);
        $response = $this->callGemini($contents);              // ← untouched
        $elapsed  = (int) (microtime(true) * 1000) - $startMs;
 
        [$geminiRaw, $httpStatus, $errorMessage] = $this->extractGeminiMeta($response);
 
        $this->queryLogService->logQuery(
            session:      $session,
            query:        $request->message,
            response:     $response,
            geminiRaw:    $geminiRaw,
            responseMs:   $elapsed,
            errorMessage: $errorMessage,
            httpStatus:   $httpStatus,
        );
 
        if ($errorMessage) {
            $this->sessionService->touchFailed($session);
        } else {
            $this->sessionService->touchActive($session);
        }
 
        return $this->withSessionHeader($response, $session->session_token);
        // ─────────────────────────────────────────────────────────────────────
    }

    // =========================================================================
    // GEMINI API CALL
    // =========================================================================

    private function callGemini(array $contents)
    {
        try {
            $response = Http::timeout(30)
                ->withHeaders(['Content-Type' => 'application/json'])
                ->post(
                    'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=' . env('GEMINI_API_KEY'),
                    [
                        'contents'         => $contents,
                        'generationConfig' => [
                            'temperature'    => 0.7,
                            'maxOutputTokens'=> 2048,
                            'topP'           => 0.95,
                        ],
                        'safetySettings' => [
                            ['category' => 'HARM_CATEGORY_HARASSMENT',  'threshold' => 'BLOCK_MEDIUM_AND_ABOVE'],
                            ['category' => 'HARM_CATEGORY_HATE_SPEECH', 'threshold' => 'BLOCK_MEDIUM_AND_ABOVE'],
                        ],
                    ]
                );

            if ($response->status() === 429) {
                $errorBody = $response->json();
                $message = $errorBody['error']['message'] ?? 'Rate limit exceeded';
                
                Log::warning('Gemini quota exhausted', [
                    'user_id' => Auth::id(),
                    'message' => $message
                ]);
                
                // 💡 Friendly fallback response
                return response()->json([
                    'reply' => "🙏 I'm temporarily at capacity due to high demand. Please try again in a few minutes, or contact web@targetisl.co.ke for urgent assistance."
                ]);
            }

            if ($response->failed()) {
                Log::error('Gemini API failed', ['status' => $response->status(), 'body' => $response->body()]);
                return response()->json(['error' => 'Mimi is unavailable right now. Please try again shortly.'], 500);
            }

            $reply = $response->json('candidates.0.content.parts.0.text')
                ?? 'Sorry, I could not process that. Please try again.';

            return response()->json(['reply' => trim($reply)]);

        } catch (\Illuminate\Http\Client\ConnectionException $e) {
            Log::error('Gemini connection error', ['error' => $e->getMessage()]);
            return response()->json(['error' => 'Mimi could not connect. Please check your connection and try again.'], 503);
        } catch (\Exception $e) {
            Log::error('Gemini unexpected error', ['error' => $e->getMessage()]);
            return response()->json(['error' => 'An unexpected error occurred. Please try again.'], 500);
        }
    }
    private function extractGeminiMeta(\Illuminate\Http\JsonResponse $response): array
    {
        $data       = $response->getData(true);
        $httpStatus = $response->getStatusCode();
        $error      = $data['error'] ?? null;
 
        // callGemini() never exposes the raw Gemini payload — it only exposes
        // the reply text. For harm scanning we need the raw payload, but since
        // it's built inside callGemini() we can't access it here.
        // We pass an empty array; the harm scanner will still detect Gemini
        // safety blocks from the response_status / error text.
        // If you want full Gemini payload scanning, extract it inside callGemini()
        // and store it on the request: $request->attributes->set('gemini_raw', $payload).
 
        return [[], $httpStatus, $error];
    }
 
    /**
     * Append the session token to the response headers so the frontend
     * can persist it in sessionStorage.
     */
    private function withSessionHeader(
        \Illuminate\Http\JsonResponse $response,
        string $token,
    ): \Illuminate\Http\JsonResponse {
        $response->headers->set('X-Mimi-Session-Token', $token);
        return $response;
    }
}