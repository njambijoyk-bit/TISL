<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Log;
use App\Models\Product;
use App\Models\Service; 
use App\Models\ServiceCategory;
use App\Models\Order;
use App\Models\Quote;
use App\Models\Customer;

class ChatController extends Controller
{
    public function chat(Request $request)
    {
        $request->validate([
            'message' => 'required|string|max:1000',
            'history' => 'array',
        ]);

        // ── Build products context ────────────────────────────────────────
        // Product model: is_visible (boolean), status (string), name, price,
        // in_stock (boolean), category (belongsTo Category), brand (belongsTo Brand)
        try {
            $products = Product::where('is_visible', true)
                ->where('status', 'active')
                ->select('name', 'price', 'in_stock', 'category_id', 'brand_id', 'short_description')
                ->with([
                    'category:id,name',
                    'brand:id,name',
                ])
                ->limit(30)
                ->get()
                ->map(fn($p) =>
                    "{$p->name} " .
                    "(KSh " . number_format($p->price, 2) . ") " .
                    "— Category: " . ($p->category?->name ?? 'Uncategorised') . " " .
                    "— Brand: " . ($p->brand?->name ?? 'N/A') . " " .
                    "— " . ($p->in_stock ? 'In Stock' : 'Out of Stock')
                )
                ->join("\n");
        } catch (\Exception $e) {
            Log::error('Mimi: failed to load products — ' . $e->getMessage());
            $products = 'Products temporarily unavailable.';
        }

        // ── Build service categories context ──────────────────────────────
        // ServiceCategory model: is_active (boolean), name, description
                try {
            $serviceCategories = ServiceCategory::where('is_active', true)
                ->select('name', 'description')
                ->ordered()
                ->limit(15)
                ->get()
                ->map(fn($s) => "- {$s->name}" . ($s->description ? ": {$s->description}" : ''))
                ->join("\n");
        } catch (\Exception $e) {
            Log::error('Mimi: failed to load service categories — ' . $e->getMessage());
            $serviceCategories = 'Service categories temporarily unavailable.';
        }

        // ── Build actual services context ─────────────────────────────────
        try {
            $servicesList = Service::where('is_available', true)
                ->where('is_visible', true)
                ->where('status', 'active')
                ->select('name', 'base_price', 'pricing_model', 'short_description', 'category_id', 'service_category')
                ->with(['category:id,name'])
                ->limit(30)
                ->get()
                ->map(fn($s) => 
                    "{$s->name} " .
                    "(Base: KSh " . number_format($s->base_price ?? 0, 2) . " - {$s->pricing_model}) " .
                    "— Category: " . ($s->category?->name ?? $s->service_category ?? 'Uncategorized') . " " .
                    ($s->short_description ? "— {$s->short_description}" : "")
                )
                ->join("\n");
        } catch (\Exception $e) {
            Log::error('Mimi: failed to load services — ' . $e->getMessage());
            $servicesList = 'Services temporarily unavailable.';
        }

        // ── Build customer context (logged-in users only) ─────────────────
        // Order model: customer_id (FK to Customer), total (decimal), status, created_at, order_number
        // Quote model: customer_id (FK to Customer), total (decimal), status, created_at, quote_number
        // Both Order and Quote belong to Customer, NOT User directly.
        // Auth user is a User — we resolve their Customer record first.
        $customerContext = '';

        if (Auth::check()) {
            $user = Auth::user();

            try {
                // Resolve the Customer record linked to this User
                // Customer model stores user_id or email — check via email match
                $customer = Customer::where('email', $user->email)->first();

                if ($customer) {
                    // Orders: customer_id, order_number, status, total, created_at
                    $orders = Order::where('customer_id', $customer->id)
                        ->select('id', 'order_number', 'status', 'total', 'created_at')
                        ->latest()
                        ->limit(5)
                        ->get()
                        ->map(fn($o) =>
                            "Order #{$o->order_number} " .
                            "— Status: {$o->status} " .
                            "— KSh " . number_format($o->total, 2) .
                            " — " . $o->created_at->format('M d, Y')
                        )
                        ->join("\n") ?: 'No orders yet.';

                    // Quotes: customer_id, quote_number, status, total, valid_until
                    $quotes = Quote::where('customer_id', $customer->id)
                        ->select('id', 'quote_number', 'status', 'total', 'valid_until')
                        ->latest()
                        ->limit(3)
                        ->get()
                        ->map(fn($q) =>
                            "Quote #{$q->quote_number} " .
                            "— Status: {$q->status} " .
                            "— KSh " . number_format($q->total, 2) .
                            ($q->valid_until ? " — Valid until: " . $q->valid_until->format('M d, Y') : '')
                        )
                        ->join("\n") ?: 'No quotes yet.';

                    $customerContext = "
════════════════════════════════════════
LOGGED IN CUSTOMER
════════════════════════════════════════
Name:  {$user->name}
Email: {$user->email}

THEIR RECENT ORDERS:
{$orders}

THEIR RECENT QUOTES:
{$quotes}
";
                }
            } catch (\Exception $e) {
                Log::error('Mimi: failed to load customer context — ' . $e->getMessage());
                // Silently continue — Mimi still works, just without personal data
            }
        }

        // ── System prompt ─────────────────────────────────────────────────
        $systemPrompt = "
You are Mimi, BlueArc Store's friendly and knowledgeable customer assistant based in Nairobi, Kenya.
You are warm, concise, and professional. You respond in the same language the customer uses.
Never make up prices or product details not listed below.
Always encourage customers to visit the store or request a quote for complex needs.
If you cannot answer something, direct the customer to the Contact page or suggest they call directly.

════════════════════════════════════════
STORE INFORMATION
════════════════════════════════════════
Name: BlueArc Store
Location: Nairobi, Kenya
Delivery: Free on orders over KSh 5,000
Returns: 30-day return policy
Payment: Secure payment accepted. Some items have negotiable prices.

════════════════════════════════════════
HOW THE WEBSITE WORKS — CUSTOMER FLOWS
════════════════════════════════════════

PLACING AN ORDER:
1. Browse products at /products or search using the search bar in the header
2. Click a product to open its detail page
3. Choose quantity and any available variants (size, colour, etc.)
4. Click 'Add to Cart' or 'Buy Now'
   - 'Add to Cart' adds it to the cart for later checkout
   - 'Buy Now' goes straight to checkout
5. Go to /cart to review your items
6. Click 'Checkout' — you must be logged in to complete an order
7. Fill in your delivery details and confirm the order
8. You will receive an order confirmation and can track it under My Orders (/orders)

TRACKING AN ORDER:
1. Log in to your account
2. Go to My Orders at /orders
3. Click any order to see its full details and current status
   - Order statuses: pending → confirmed → processing → shipped → delivered
   - If there is an issue, contact us via the Contact page

REQUESTING A QUOTE:
1. Go to /request-quote (you must be logged in)
2. Fill in the service or product details you need quoted
3. Submit — the BlueArc team will review and send you a formal quote
4. Track your quote requests at /my-quote-requests
5. Once a quote is issued, it appears at /my-quotes
6. Quote statuses: draft → pending → approved/rejected/converted
7. You can accept or decline a quote from the quote detail page
8. An accepted quote can be converted directly into an order

SERVICES:
1. Browse services at /services
2. Click a service to see its full details
3. To book or enquire, click 'Request a Quote' on the service page
4. This takes you to /request-quote with the service pre-filled

WISHLIST:
1. Click the heart icon on any product to add it to your wishlist
2. View your wishlist at /wishlist
3. You can add wishlist items directly to cart from the wishlist page

QUOTE LIST:
- The quote list (clipboard icon in the header) is for collecting products
  you want to request a bulk or custom quote for
- Add products to your quote list then submit as a single quote request

ACCOUNT REGISTRATION:
1. Click 'Register' in the header
2. Fill in your name, email and password
3. You can then log in and access orders, quotes, and projects

PROJECTS:
- Projects are collaborative workspaces created by the BlueArc admin team
- If you have been added to a project, it appears at /my-projects
- You can view project details, status, tasks, and milestones
- Project statuses: planning, active, on_hold, completed, cancelled
- To request a project, use the quote request flow or contact us directly

SPECIALS:
- Visit /specials to see all current discounted and on-sale products
- Specials are time-limited so prices may change

CONTACT:
- Visit /contact for the contact form and store details
- You can also chat with me (Mimi) for instant help

════════════════════════════════════════
DATA MODEL AWARENESS — HOW THINGS RELATE
════════════════════════════════════════

PRODUCTS:
- Each product belongs to one Category and one Brand
- Products can have Variants (e.g. size, colour) with their own prices
- Key fields: name, price, original_price, in_stock, stock_quantity,
  short_description, description, specifications (key-value object),
  features (array), is_new, on_sale, is_featured, price_is_negotiable,
  has_variants, variants (array), sku, rating, badge
- Reviews belong to products and have a rating (1–5) and comment
- Discount percentage = ((original_price - price) / original_price) × 100

CATEGORIES:
- Categories can be parent categories or subcategories (parent_id field)
- Each product belongs to one category
- Browsing /products?category=ID filters by that category

BRANDS:
- Each product belongs to one brand
- Browsing /products?brand=ID filters by that brand
- Brands have logo_url for display

ORDERS:
- An order belongs to a Customer (via customer_id)
- Order has an order_number (format: BlueArc-YEAR-NNNNN)
- Orders contain order items (each linked to a product or service)
- Order item types: product, service, custom_product, custom_service, fee
- Order statuses: pending, confirmed, processing, ready_for_pickup,
  shipped, delivered, cancelled, failed
- Payment statuses: unpaid, partially_paid, paid, refunded, failed
- Order types: standard, quotation, bulk, b2b, service, mixed, project
- Orders have: total, subtotal, tax, discount, shipping_cost fields

QUOTES:
- A quote is created by the BlueArc admin in response to a quote request
- Quote has a quote_number (format: QT-YEAR-NNNNN)
- Quote statuses: draft, pending, revised, approved, rejected, expired, converted
- A quote contains line items (products/services + quantities + prices)
- Customers can approve or reject a quote
- An approved quote can be converted to an order
- Quotes have a valid_from and valid_until date (default 30 days)
- Quote types: product, service, mixed

QUOTE REQUESTS:
- A quote request is submitted by a customer
- Request number format: QR-YEAR-NNNNN
- Statuses: pending, reviewing, quoted, rejected, expired
- The admin reviews it and creates a formal Quote in response
- Requests expire after 30 days by default

SERVICES:
- Services belong to ServiceCategory (via category_id)
- Each service has: name, base_price, pricing_model (fixed/hourly/daily/
  project_based/subscription), hourly_rate, daily_rate, minimum_charge
- Services are booked via the quote request flow

PROJECTS:
- Projects are created and managed by the admin team
- Customers are assigned to projects they are part of
- Projects have statuses: planning, active, on_hold, completed, cancelled
- Projects contain tasks, milestones, messages, items, and links

USERS & CUSTOMERS:
- Users have roles: customer, admin, super_admin, manager, sales_rep
- Each customer-facing user has a linked Customer record
- Customers can place orders, request quotes, manage wishlist and quote list

════════════════════════════════════════
LIVE STORE DATA
════════════════════════════════════════

AVAILABLE PRODUCTS:
{$products}

SERVICE CATEGORIES (Types of Services We Offer):
{$serviceCategories}

AVAILABLE SERVICES:
{$servicesList}
{$customerContext}";

        // ── Build Gemini conversation history ─────────────────────────────
        $history = collect($request->history ?? [])
            ->map(fn($msg) => [
                'role'  => $msg['role'] === 'assistant' ? 'model' : 'user',
                'parts' => [['text' => $msg['content']]],
            ])
            ->values()
            ->toArray();

        // Prepend system prompt as the opening exchange
        $contents = array_merge(
            [
                [
                    'role'  => 'user',
                    'parts' => [['text' => $systemPrompt]],
                ],
                [
                    'role'  => 'model',
                    'parts' => [['text' => 'Understood! I am Mimi, BlueArc Store\'s assistant. I am ready to help customers with products, services, orders, quotes, and anything else they need.']],
                ],
            ],
            $history,
            [
                [
                    'role'  => 'user',
                    'parts' => [['text' => $request->message]],
                ],
            ]
        );

        // ── Call Gemini API ───────────────────────────────────────────────
        try {
            $response = Http::timeout(20)
                ->withHeaders(['Content-Type' => 'application/json'])
                ->post(
                    'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=' . env('GEMINI_API_KEY'),
                   // or 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=' . env('GEMINI_API_KEY'),
                    [
                        'contents' => $contents,
                        'generationConfig' => [
                            'temperature'     => 0.7,
                            'maxOutputTokens' => 1024,
                        ],
                    ]
                );

            if ($response->failed()) {
                Log::error('Gemini API failed — Status: ' . $response->status() . ' Body: ' . $response->body());
                return response()->json([
                    'error' => 'Mimi is unavailable right now. Please try again shortly.',
                    'debug' => config('app.debug') ? $response->body() : null,
                ], 500);
            }

            $reply = $response->json('candidates.0.content.parts.0.text')
                ?? 'Sorry, I could not process that. Please try again.';

            return response()->json(['reply' => $reply]);

        } catch (\Illuminate\Http\Client\ConnectionException $e) {
            Log::error('Gemini connection error: ' . $e->getMessage());
            return response()->json([
                'error' => 'Mimi could not connect to the AI service. Please check your internet connection and try again.',
            ], 503);
        } catch (\Exception $e) {
            Log::error('Gemini unexpected error: ' . $e->getMessage());
            return response()->json([
                'error' => 'An unexpected error occurred. Please try again.',
                'debug' => config('app.debug') ? $e->getMessage() : null,
            ], 500);
        }
    }
}