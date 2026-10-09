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
use App\Models\Books\Voucher;
use App\Models\Books\VoucherType;
use App\Models\Customer;
use App\Models\User;
use App\Models\Project;
use App\Models\ReferralCode;
use App\Models\Payment;
use App\Services\Chat\Local\CallerContext;
use App\Services\Chat\Local\LocalAnswer;
use App\Services\Chat\Local\LocalLayer;

class ChatController extends Controller
{
    public function __construct(
        private readonly MimiSessionService  $sessionService,
        private readonly MimiQueryLogService $queryLogService,
        private readonly MimiBlockService    $blockService,
        private readonly LocalLayer          $local,
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

        // the local layer goes first: our own knowledge and data, under the caller's permissions (config/mimi.php; shadow mode only records)
        if ($early = $this->localFirst($request, $session, $request->user())) {
            return $early;
        }
 
        $user       = $request->user();
        $role       = (string) $user->role;   // only a label for the assistant, never used to decide anything
        $isStaff    = $user->isStaff();
        $isCustomer = $user->isCustomer();
 
        $context = [
            'products'          => $this->getProductsContext($isStaff),
            'services'          => $this->getServicesContext(),
            'serviceCategories' => $this->getServiceCategoriesContext(),
            'customerData'      => $isCustomer ? $this->getCustomerContext($user) : null,
            'adminData'         => $isStaff    ? $this->getAdminContext($user, $request->message) : null,
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
                ['role' => 'model', 'parts' => [['text' => "Understood! I am Mimi, {$this->company()}'s assistant. Ready to help with products, orders, payments, and more."]]],
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
            local:        (array) $request->attributes->get('mimi_local', []),
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

    private function company(): string
    {
        return \App\Models\CompanyProfile::name();
    }

    private function baseCode(): string
    {
        try {
            return app(\App\Services\CurrencyConversionService::class)->getBaseCurrency()->code;
        } catch (\Throwable) {
            return '';
        }
    }

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
                ->select('id', 'name', 'base_price', 'price_unit_id', 'short_description', 'category_id')
                ->with(['category:id,name'])
                ->limit(30)
                ->get()
                ->map(fn($s) =>
                    "[ID:{$s->id}] {$s->name} — From KSh " . number_format($s->base_price ?? 0, 2) . ($s->price_unit_label ? " {$s->price_unit_label}" : '') .
                    " | Category: " . ($s->category?->name ?? 'N/A') .
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
            $orders = $this->salesDocs()->where('customer_id', $customer->id)
                ->with('type:id,name')->latest('date')->latest('id')->limit(8)->get()
                ->map(fn($o) =>
                    "📦 {$o->type?->name} #{$o->voucher_number} | Status: {$o->status}" .
                    ($o->fulfilment_status ? " | Fulfilment: {$o->fulfilment_status}" : '') .
                    " | KSh " . number_format($o->base_total ?? $o->total_amount, 2) .
                    " | {$o->date?->format('M d, Y')}"
                )->join("\n") ?: 'No orders yet.';

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
            $payments = $this->safe(fn() => Payment::where('customer_id', $customer->id)
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
                )->join("\n"), '') ?: 'No payment history.';

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

    private function getAdminContext(User $user, string $message): string
    {
        $intent = $this->detectAdminIntent($message);
        $parts  = [];

        // ── Always inject base stats ───────────────────────────────────────────
        $parts['stats'] = $this->getAdminStats($user);

        // ── Intent-specific data ───────────────────────────────────────────────
        switch ($intent['type']) {

            // Every lookup below goes through the same permissioned resolvers the local layer uses (customers.view, data scope, branch limits, allowlisted
            // fields), and the permission is checked BEFORE anything is read, so "no access" and "not found" cannot be told apart.
            case 'order_lookup':
                $ident = $intent['identifier'];
                $parts['lookup'] = $this->viaResolver('orders.lookup', $user, is_numeric($ident) ? ['ordnum' => $ident] : ['ordref' => $ident],
                    "You don't have the permission to look up customers' orders.", "I couldn't find an order with that number.");
                break;

            case 'payment_lookup':
                $ctx = $this->callerFor($user);
                if (! $ctx->can('books.view') || $ctx->locationIds !== null) {      // payment records are company-wide: for people who see the books, and every branch
                    $parts['lookup'] = "You don't have access to payment records.";
                    break;
                }
                $payment = $this->safe(fn() => Payment::with(['customer:id,first_name,last_name,email'])
                    ->where('payment_number', $intent['identifier'])
                    ->orWhere('mpesa_receipt_number', $intent['identifier'])
                    ->orWhere('id', is_numeric($intent['identifier']) ? $intent['identifier'] : 0)
                    ->first(), null);
                $parts['lookup'] = $payment ? $this->formatPaymentDetail($payment) : "Payment '{$intent['identifier']}' not found.";
                break;

            case 'customer_lookup':
                $ident = $intent['identifier'];
                $slots = str_contains($ident, '@') ? ['email' => $ident] : (is_numeric($ident) ? ['custid' => $ident] : ['custref' => $ident]);
                $parts['lookup'] = $this->viaResolver('customers.lookup', $user, $slots,
                    "You don't have the permission to look up customers.", "I couldn't find a customer with those details.");
                break;

            case 'recent_activity':
                $parts['recent'] = $this->getRecentActivity($user, $intent['filter'] ?? null);
                break;

            case 'payment_summary':
                $parts['payments'] = $this->getPaymentSummary($user);
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

        // Order number as the books write it (WNKJ-SO-00001): the pattern comes from the voucher series, because the old year-style one never matched these
        $found = $this->local->slots()->extract($message)['slots'];
        if (! empty($found['ordref'])) {
            return ['type' => 'order_lookup', 'identifier' => strtoupper($found['ordref'])];
        }

        // M-Pesa receipt: alphanumeric ~10 chars like QJK8QX1234
        if (preg_match('/\b([A-Z]{2,3}\d{7,10})\b/i', $message, $m)) {
            return ['type' => 'payment_lookup', 'identifier' => strtoupper($m[1])];
        }

        // Order / voucher number, e.g. WNKJ-SO-00001
        if (preg_match('/([A-Z]+-\d{4}-\d+)/i', $message, $m)) {
            return ['type' => 'order_lookup', 'identifier' => strtoupper($m[1])];
        }
        if (preg_match('/order\s*#?\s*(\d+)/i', $message, $m)) {
            return ['type' => 'order_lookup', 'identifier' => $m[1]];
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

    private function formatPaymentDetail(Payment $payment): string
    {
        $customer = $payment->customer;
        $name     = $customer
            ? trim(($customer->first_name ?? '') . ' ' . ($customer->last_name ?? ''))
            : 'Unknown';

        return "
💳 PAYMENT {$payment->payment_number}
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

    /** Sales documents (orders, invoices, cash sales) now live in the books as vouchers; the old orders table is gone. */
    private function salesDocs(array $bases = [VoucherType::SALES_ORDER, VoucherType::SALES, VoucherType::CASH_SALE])
    {
        return Voucher::query()->whereHas('type', fn($q) => $q->whereIn('base_type', $bases));
    }

    /** Mimi must still answer when a table behind one of her extras is missing — log it and carry on. */
    private function safe(\Closure $fn, $default)
    {
        try {
            return $fn();
        } catch (\Throwable $e) {
            Log::warning('Mimi context skipped', ['error' => $e->getMessage()]);
            return $default;
        }
    }

    // =========================================================================
    // STATS — always injected for staff
    // =========================================================================

    private function getAdminStats(User $user): array
    {
        $ctx   = $this->callerFor($user);
        $stats = ['products' => Product::where('status', 'active')->count()];

        // orders and customers belong to customers.view, narrowed to the person's data scope and branches
        if ($ctx->can('customers.view')) {
            $stats['orders'] = [
                'total'   => $this->limitSales($this->salesDocs(), $ctx)->count(),
                'pending' => $this->limitSales($this->salesDocs(), $ctx)->where('status', Voucher::DRAFT)->count(),
                'today'   => $this->limitSales($this->salesDocs(), $ctx)->whereDate('created_at', today())->count(),
            ];
            $customers = Customer::query();
            if ($ctx->dataScope === 'assigned') {
                $customers->where('assigned_sales_rep', $user->id);
            } elseif ($ctx->dataScope === 'own') {
                $customers->where('created_by', $user->id);
            }
            $stats['customers'] = $customers->count();
        }

        // payment figures are company-wide: books.view, and not for someone limited to some branches
        if ($ctx->can('books.view') && $ctx->locationIds === null) {
            $stats['payments'] = $this->safe(function () {
                $paymentQuery = Payment::query();
                return [
                    'pending'        => (clone $paymentQuery)->where('status', 'pending')->count(),
                    'failed'         => (clone $paymentQuery)->where('status', 'failed')->count(),
                    'open_disputes'  => (clone $paymentQuery)->whereIn('dispute_status', ['raised', 'investigating'])->count(),
                    'today_collected'=> 'KSh ' . number_format(
                        (clone $paymentQuery)->whereDate('confirmed_at', today())->sum('mpesa_amount_confirmed'), 2
                    ),
                ];
            }, null);
            if ($stats['payments'] === null) {
                unset($stats['payments']);
            }
        }

        return $stats;
    }

    /** Narrow a sales query to what this person may see: their branches, and their data scope (assigned customers, or what they created). */
    private function limitSales($query, CallerContext $ctx)
    {
        if ($ctx->locationIds !== null) {
            $query->where(fn($w) => $w->whereIn('location_id', $ctx->locationIds)->orWhereNull('location_id'));
        }
        if ($ctx->dataScope === 'assigned' && $ctx->user) {
            $query->whereIn('customer_id', Customer::where('assigned_sales_rep', $ctx->user->id)->select('id'));
        } elseif ($ctx->dataScope === 'own' && $ctx->user) {
            $query->where('created_by', $ctx->user->id);
        }

        return $query;
    }

    /** Run a local-layer resolver for this person and turn its answer into text for the prompt: the permission is checked first. */
    private function viaResolver(string $name, User $user, array $slots, string $denied, string $notFound): string
    {
        $ctx = $this->callerFor($user);
        $r   = \App\Services\Chat\Local\ResolverRegistry::all()[$name];
        if (! $ctx->canAll($r->requires())) {
            return $denied;
        }
        $res = $r->run($ctx, $slots);

        return match ($res->status) {
            'ok'     => implode("\n", $res->lines),
            'denied' => $denied,
            default  => $notFound,      // nothing there, or nothing there for this person: the same words
        };
    }

    /** The caller as the local layer sees them. A seam, so tests can supply one without a database. */
    protected function callerFor(User $user): CallerContext
    {
        return CallerContext::forUser($user);
    }

    // =========================================================================
    // RECENT ACTIVITY
    // =========================================================================

    private function getRecentActivity(User $user, ?string $filter): string
    {
        $ctx = $this->callerFor($user);
        if (! $ctx->can('customers.view')) {
            return "You don't have the permission to see customers' orders.";
        }
        $query = $this->limitSales($this->salesDocs()->with(['customer:id,first_name,last_name', 'type:id,name']), $ctx);

        if ($filter === 'cancelled') {
            $query->where('status', Voucher::CANCELLED);
        } elseif ($filter === 'pending') {
            $query->where('status', Voucher::DRAFT);
        } elseif ($filter && in_array($filter, ['confirmed', 'processing', 'shipped', 'delivered'])) {
            $query->where('status', Voucher::POSTED);
        }

        return $query->latest('date')->latest('id')->limit(10)->get()->map(function ($o) {
            $name = $o->customer
                ? trim(($o->customer->first_name ?? '') . ' ' . ($o->customer->last_name ?? ''))
                : ($o->party_name ?: 'Unknown');
            return "{$o->type?->name} #{$o->voucher_number} | {$name} | {$o->status} | KSh " . number_format($o->base_total ?? $o->total_amount, 2) . " | {$o->date?->format('M d')}";
        })->join("\n") ?: 'No recent orders found.';
    }

    // =========================================================================
    // PAYMENT SUMMARY — for finance/admin queries
    // =========================================================================

    private function getPaymentSummary(User $user): string
    {
        return $this->viaResolver('payments.summary', $user, [], 'Payment records are not available to you.', 'Payment records are not available right now.');
    }

    // =========================================================================
    // SYSTEM PROMPT
    // =========================================================================

    private function buildSystemPrompt(array $context, bool $isStaff, bool $isCustomer): string
    {
        $roleBlock = $isStaff
            ? "🔐 YOU ARE HELPING A STAFF MEMBER
The staff data below is already limited to what this person's permissions, data scope and branches allow. You can:
• Report the orders, customers and payments that appear in the data below
• Summarise the stats and recent activity that appear below
If something is not in the data below, say it is not available to this person. Never guess, never invent data."
            : ($isCustomer
                ? "👤 YOU ARE HELPING A LOGGED-IN CUSTOMER
Use ONLY their personal data below — never reference other customers.
You can help with:
• Order tracking and payment status
• Promo codes and referral code
• Projects and account details
If they ask about anything not in their data, direct them to contact support."
                : "🌐 YOU ARE HELPING A GUEST USER
Provide general store information only.
Encourage login for personalized features like order tracking and promo codes.");

        return "
You are Mimi, {$this->company()}'s friendly and knowledgeable assistant .
You are warm, concise, and professional. Respond in the same language the user uses.
Never make up prices, order details, or payment information not found in the data below.
Format monetary values with the currency code, e.g. '{$this->baseCode()} 1,234.00'.

════════════════════════════════════════
STORE INFORMATION
════════════════════════════════════════
Name: {$this->company()} 
Delivery: see the shipping options at checkout | Returns: see the returns policy
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

        if ($early = $this->localFirst($request, $session, null)) {
            return $early;
        }
 
        $context = [
            'products'          => $this->getProductsContext(false),
            'services'          => $this->getServicesContext(),
            'serviceCategories' => $this->getServiceCategoriesContext(),
        ];
 
        $systemPrompt = "
You are Mimi, {$this->company()}'s assistant .
You are warm, concise, and professional.
You ONLY have access to PUBLIC store information below.
If asked about orders, payments, or account details — politely explain they need to log in.
Never ask for passwords or payment details.
 
════════════════════════════════════════
STORE INFORMATION
════════════════════════════════════════
Name: {$this->company()} 
Delivery: see the shipping options at checkout | Returns: see the returns policy
 
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
                ['role' => 'model', 'parts' => [['text' => "Understood! I am Mimi, {$this->company()}'s assistant. I can help you browse products, learn about our services, and guide you through registration."]]],
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
            local:        (array) $request->attributes->get('mimi_local', []),
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
    // LOCAL LAYER  (docs/MIMI_LOCAL_LAYER_GUIDE.html)
    // =========================================================================

    /**
     * Try to settle the message without the old prompt. Returns the reply to send, or null to carry on down the old path
     * (mode off, mode shadow, the local layer failing, or a fallback that allows the old full prompt).
     */
    private function localFirst(Request $request, $session, ?User $user): ?\Illuminate\Http\JsonResponse
    {
        try {
            $ctx    = CallerContext::forUser($user);
            $mode   = $this->local->modeFor($ctx);
            if ($mode === 'off') {
                return null;
            }
            $answer = $this->local->answer($ctx, (string) $request->message);
        } catch (\Throwable $e) {
            Log::warning('Mimi local layer failed, using the old path', ['error' => $e->getMessage()]);
            return null;
        }

        // never the question or the answer: only how it went
        Log::info('mimi.local', ['mode' => $mode, 'kind' => $ctx->kind, 'outcome' => $answer->outcome, 'entry' => $answer->entry?->id,
            'confidence' => round($answer->confidence, 3), 'resolver' => $answer->resolver, 'ms' => round($answer->ms, 1), 'unknown' => round($answer->unknownShare, 2)]);
        // what the local layer decided, kept for the log row the old path writes (so shadow mode can be compared with what was actually sent)
        $request->attributes->set('mimi_local', $this->localColumns($answer, 'ai'));
        if ($mode === 'shadow') {
            return null;
        }

        if ($answer->handled()) {
            return $this->sendLocal($request, $session, $answer->text, $answer->loggableText(), $answer->meta(), $answer->ms, $this->localColumns($answer, $answer->outcome === 'guard' ? 'guard' : 'local'));
        }
        $fallback = $this->local->fallbackFor($ctx);
        if ($fallback === 'ai_scoped') {
            return null;                                    // the old prompt, as the owner has chosen for this kind of account
        }
        if ($fallback === 'ai_public') {
            return $this->askOutside($request, $session, $answer);
        }

        return $this->sendLocal($request, $session, $this->local->noAnswerText(), $this->local->noAnswerText(), ['answered_by' => 'local', 'outcome' => 'none'], $answer->ms, $this->localColumns($answer, 'none'));
    }

    private function localColumns(LocalAnswer $a, string $answeredBy): array
    {
        return ['answered_by' => $answeredBy, 'local_outcome' => $a->outcome, 'kb_entry' => $a->entry?->id, 'confidence' => round($a->confidence, 3), 'resolver' => $a->resolver];
    }

    private function sendLocal(Request $request, $session, string $reply, string $logged, array $meta, float $ms, array $columns = []): \Illuminate\Http\JsonResponse
    {
        $this->queryLogService->logQuery(
            session:    $session,
            query:      (string) $request->message,
            response:   response()->json(['reply' => $logged]),
            geminiRaw:  [],
            responseMs: (int) $ms,
            local:      $columns,
        );
        $this->sessionService->touchActive($session);

        return $this->withSessionHeader(response()->json(['reply' => $reply, 'meta' => $meta]), $session->session_token);
    }

    /**
     * The outside AI as a fallback: the question with emails, phones and reference numbers swapped for tokens, plus public store information and
     * the best public knowledge snippets. No account data, no business data, no history. The real values are put back into the reply here.
     */
    private function askOutside(Request $request, $session, LocalAnswer $answer): \Illuminate\Http\JsonResponse
    {
        $red      = $this->local->redactor()->redact((string) $request->message, $this->local->slots());
        $snippets = collect($answer->snippets)->map(fn ($s) => "- [{$s['id']}] {$s['text']}")->join("\n") ?: '(none)';

        $system = "
You are Mimi, {$this->company()}'s assistant. You are warm, concise and professional. Respond in the same language the user uses.
Use ONLY the public information below. If it does not cover the question, say you are not sure and suggest contacting support.
Never ask for passwords, card details or PINs. Tokens such as [EMAIL_1] stand for private details: keep them exactly as written.

STORE: {$this->company()}
PRODUCTS:
{$this->getProductsContext(false)}

SERVICE CATEGORIES:
{$this->getServiceCategoriesContext()}

SERVICES:
{$this->getServicesContext()}

KNOWLEDGE:
{$snippets}";

        $contents = [
            ['role' => 'user',  'parts' => [['text' => $system]]],
            ['role' => 'model', 'parts' => [['text' => "Understood. I will use only the public information provided."]]],
            ['role' => 'user',  'parts' => [['text' => $red['text']]]],
        ];

        $start    = (int) (microtime(true) * 1000);
        $response = $this->callGemini($contents);
        $elapsed  = (int) (microtime(true) * 1000) - $start;
        [$raw, $httpStatus, $errorMessage] = $this->extractGeminiMeta($response);

        $data = $response->getData(true);
        if (isset($data['reply'])) {
            $data['reply'] = $this->local->redactor()->restore((string) $data['reply'], $red['swaps']);
            $data['meta']  = ['answered_by' => 'ai'];
            $response->setData($data);
        }

        $this->queryLogService->logQuery(session: $session, query: (string) $request->message, response: $response, geminiRaw: $raw,
            responseMs: $elapsed, errorMessage: $errorMessage, httpStatus: $httpStatus,
            local: $this->localColumns($answer, 'ai'));
        $errorMessage ? $this->sessionService->touchFailed($session) : $this->sessionService->touchActive($session);

        return $this->withSessionHeader($response, $session->session_token);
    }

    // =========================================================================
    // GEMINI API CALL
    // =========================================================================

    /**
     * Ask the model behind Mimi. The conversation arrives in the shape the chat has always built it ([{role: user|model, parts: [{text}]}], the first turn being
     * the instructions); it is handed to the AI gateway, which uses the keys set up for Mimi under AI → Keys — any company's model, the next key if one fails.
     * (Until a key is added there, the old GEMINI_API_KEY in the server's environment is still used, if it is set.)
     */
    private function callGemini(array $contents)
    {
        try {
            // the instructions are the first turn; the made-up "Understood!" answer that followed is not needed
            $system   = null;
            $messages = [];
            foreach ($contents as $i => $c) {
                $text = (string) ($c['parts'][0]['text'] ?? '');
                if ($i === 0 && ($c['role'] ?? '') === 'user') {
                    $system = $text;
                    continue;
                }
                if ($i === 1 && ($c['role'] ?? '') === 'model' && $system !== null) {
                    continue;
                }
                $messages[] = ['role' => ($c['role'] ?? 'user') === 'model' ? 'assistant' : 'user', 'content' => $text];
            }

            $gateway = app(\App\Services\Ai\AiGateway::class);
            try {
                $r = $gateway->run('mimi', $system, $messages, ['max_tokens' => 2048, 'temperature' => 0.7, 'timeout' => 30]);
            } catch (\App\Services\Ai\AiGatewayException $e) {
                if ($e->kind !== 'none' || ! env('GEMINI_API_KEY')) {
                    throw $e;
                }
                $r = $this->legacyGemini($system, $messages);   // no key entered on the screen yet
            }

            if ($r['blocked']) {
                return response()->json([
                    'error' => "I'm not able to help with that. Please keep our conversation focused on {$this->company()} topics. 💜"
                ], 422);
            }

            return response()->json(['reply' => $r['text'] !== '' ? $r['text'] : 'Sorry, I could not process that. Please try again.']);

        } catch (\App\Services\Ai\AiGatewayException $e) {
            Log::warning('Mimi model call failed', ['kind' => $e->kind, 'status' => $e->status, 'message' => $e->getMessage(), 'user_id' => Auth::id()]);
            if ($e->kind === 'quota') {
                return response()->json([
                    'reply' => "🙏 I'm temporarily at capacity due to high demand. Please try again in a few minutes, or contact web@targetisl.co.ke for urgent assistance."
                ]);
            }
            if ($e->kind === 'none') {
                return response()->json(['error' => 'Mimi is not set up yet. An admin needs to add an AI key under AI → Keys.'], 503);
            }
            if ($e->kind === 'connection') {
                return response()->json(['error' => 'Mimi could not connect. Please check your connection and try again.'], 503);
            }

            return response()->json(['error' => 'Mimi is unavailable right now. Please try again shortly.'], 500);
        } catch (\Exception $e) {
            Log::error('Mimi unexpected error', ['error' => $e->getMessage()]);
            return response()->json(['error' => 'An unexpected error occurred. Please try again.'], 500);
        }
    }

    /** The key that used to live only in the server's environment — used only while no key has been entered on the screen. */
    private function legacyGemini(?string $system, array $messages): array
    {
        $key = new \App\Models\AiProviderKey(['provider' => 'gemini', 'label' => 'Server environment', 'model' => 'gemini-2.5-flash']);
        $key->api_key = (string) env('GEMINI_API_KEY');

        return app(\App\Services\Ai\AiGateway::class)->chat($key, $system, $messages, ['max_tokens' => 2048, 'temperature' => 0.7, 'timeout' => 30]);
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