<?php

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;
use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\OAuthController;
use App\Http\Controllers\Api\ProductController;
use App\Http\Controllers\Api\AuctionController;
use App\Http\Controllers\Api\CategoryController;
use App\Http\Controllers\Api\BrandController;
use App\Http\Controllers\Api\CustomerController;
use App\Http\Controllers\Api\QuoteController;
use App\Http\Controllers\Api\ServiceController;
use App\Http\Controllers\Api\ServiceCategoryController;
use App\Http\Controllers\Api\QuoteRequestController;
use App\Http\Controllers\Api\OrderController;
use App\Http\Controllers\Api\HamperController;
use App\Http\Controllers\Api\PublicHamperController;
use App\Http\Controllers\Api\HamperCheckoutController;
use App\Http\Controllers\Api\ProductReviewController;
use App\Http\Controllers\Api\CustomerAddressController;
use App\Http\Controllers\Api\NotificationController;
use App\Http\Controllers\Api\ReferralController;
use App\Http\Controllers\Api\CurrencyController;
use App\Http\Controllers\Api\ContentPageController;
use App\Http\Controllers\Api\ContentSectionController;
use App\Http\Controllers\Api\PaymentController;
use App\Http\Controllers\Api\ProjectController;
use App\Http\Controllers\Api\ProjectParticipantController;
use App\Http\Controllers\Api\ProjectLinkController;
use App\Http\Controllers\Api\ProjectItemController;
use App\Http\Controllers\Api\ProjectTaskController;
use App\Http\Controllers\Api\ProjectMilestoneController;
use App\Http\Controllers\Api\ProjectMessageController;
use App\Http\Controllers\Api\ProjectActivityController;
use App\Http\Controllers\Api\UserController;
use App\Http\Controllers\Api\VerificationController;
use App\Http\Controllers\Api\PromoCodeController;
use App\Http\Controllers\ChatController;
use App\Http\Controllers\Api\EmployeeController;
use App\Http\Controllers\Api\WorkController;
use App\Http\Controllers\Api\ReportsController;
use App\Http\Controllers\Api\TicketController;
use App\Http\Controllers\Api\LoyaltyController;
use App\Http\Controllers\Api\ReviewEligibilityController;
use App\Http\Controllers\Api\ShippingOptionController;
use App\Http\Controllers\Api\CustomerTierController;
use App\Http\Controllers\Api\PublicationController;
use App\Http\Controllers\Api\PublicationCommentController;

use App\Http\Controllers\Api\Careers\PublicJobController;
use App\Http\Controllers\Api\Careers\ApplicantAuthController;
use App\Http\Controllers\Api\Careers\ApplicantPortalController;
use App\Http\Controllers\Api\Careers\AdminAIScreeningController;
use App\Http\Controllers\Api\Careers\AdminApplicationController;
use App\Http\Controllers\Api\Careers\AdminJobController;
use App\Http\Controllers\Api\Careers\AdminApplicantController;

//use App\Http\Controllers\Jobs\ScreenApplicationJob;
/*
|--------------------------------------------------------------------------
| API Routes
|--------------------------------------------------------------------------
*/

// ============================================
// PUBLIC ROUTES (No Authentication Required)
// ============================================
Route::post('/chat/guest', [ChatController::class, 'chatGuest'])
    ->middleware('throttle:10,1'); // Strict limit for guests
// Authentication Routes
Route::prefix('auth')->group(function () {
    Route::post('/register', [AuthController::class, 'register']);
    Route::post('/login', [AuthController::class, 'login']);
    Route::post('/forgot-password', [AuthController::class, 'forgotPassword']);
    Route::post('/reset-password', [AuthController::class, 'resetPassword']);
    Route::post('/force-change-password', [AuthController::class, 'forceChangePassword']);
});

// Public shipping options (for checkout)
Route::get('/shipping-options', [ShippingOptionController::class, 'publicIndex']);

// ── Public: Customer tiers & types (for checkout/dropdowns) ──
Route::get('/customer-tiers', [CustomerTierController::class, 'publicTiers']);
Route::get('/customer-type-discounts', [CustomerTierController::class, 'publicTypes']);

// Public
Route::get('/publications', [PublicationController::class, 'publicIndex']);
Route::get('/publications/{slug}', [PublicationController::class, 'publicShow']);
Route::post('/publications/{id}/comments', [PublicationCommentController::class, 'store']);

// ============================================
// CAREERS — PUBLIC
// ============================================
Route::prefix('careers')->group(function () {
    Route::get('/jobs',         [PublicJobController::class, 'index']);
    Route::get('/jobs/{slug}',  [PublicJobController::class, 'show']);

    Route::post('/forgot-password',[ApplicantAuthController::class, 'forgotPassword']);
    Route::post('/reset-password', [ApplicantAuthController::class, 'resetPassword']);

    Route::prefix('auth')->group(function () {
        Route::post('/register',       [ApplicantAuthController::class, 'register']);
        Route::post('/login',          [ApplicantAuthController::class, 'login']);
    });
});

// OAuth Routes
Route::prefix('auth')->group(function () {
    Route::get('/{provider}', [OAuthController::class, 'redirectToProvider'])
        ->where('provider', 'google');
    Route::get('/{provider}/callback', [OAuthController::class, 'handleProviderCallback'])
        ->where('provider', 'google');
});

// Public — email verification callback
Route::get('/email/verify/{id}/{hash}', [VerificationController::class, 'verifyEmail'])
    ->middleware(['signed'])
    ->name('api.verify.email');

// Daraja hits this directly — must not be behind any middleware
Route::post('/payments/callback', [PaymentController::class, 'callback'])
    ->name('payments.callback');

// PUBLIC PRODUCTS - ANYONE CAN VIEW (NO AUTH REQUIRED)
Route::get('/products', [ProductController::class, 'index']);
Route::get('/products/featured', [ProductController::class, 'featured']);
Route::get('/products/new-arrivals', [ProductController::class, 'newArrivals']);
Route::get('/products/on-sale', [ProductController::class, 'onSale']);
Route::get('/products/{id}', [ProductController::class, 'show']);
Route::get('/products/{id}/related', [ProductController::class, 'related']);
Route::get('/products/{id}/reviews', [ProductReviewController::class, 'index']);
Route::post('/reviews/{id}/helpful', [ProductReviewController::class, 'markHelpful']);

// Auctions (Public)
Route::get('/auctions', [AuctionController::class, 'index']);
Route::get('/auctions/{id}', [AuctionController::class, 'show']);
Route::get('/auctions/{id}/stream', [AuctionController::class, 'stream']);

Route::get('/content', [ContentPageController::class, 'publicIndex']);
Route::get('/content/{slug}', [ContentPageController::class, 'showBySlug']);


// PUBLIC CATEGORIES & BRANDS
Route::get('/categories', [CategoryController::class, 'index']);
Route::get('/categories/main', [CategoryController::class, 'main']);
Route::get('/categories/{id}', [CategoryController::class, 'show']);
Route::get('/categories/{id}/subcategories', [CategoryController::class, 'subcategories']);

Route::get('/brands', [BrandController::class, 'index']);
Route::get('/brands/featured', [BrandController::class, 'featured']);
Route::get('/brands/{id}', [BrandController::class, 'show']);

// PUBLIC SERVICES
Route::get('/services', [ServiceController::class, 'index']);
Route::get('/services/featured', [ServiceController::class, 'featured']);
Route::get('/services/types', [ServiceController::class, 'getTypes']);
Route::get('/services/{id}', [ServiceController::class, 'show']);
Route::get('/services/{id}/related', [ServiceController::class, 'related']);

// PUBLIC SERVICE CATEGORIES
Route::get('/service-categories', [ServiceCategoryController::class, 'index']);
Route::get('/service-categories/main', [ServiceCategoryController::class, 'main']);
Route::get('/service-categories/{id}', [ServiceCategoryController::class, 'show']);
Route::get('/service-categories/{id}/subcategories', [ServiceCategoryController::class, 'subcategories']);

// Validate referral code (public - before registration)
Route::post('/referral/validate', [ReferralController::class, 'validateCode']);


// ============================================
// PROTECTED ROUTES (Authentication Required)
// ============================================

Route::middleware('auth:sanctum')->group(function () {
    Route::post('/chat', [ChatController::class, 'chat'])
        ->middleware('throttle:30,1');
    // Authentication
    Route::post('/auth/logout', [AuthController::class, 'logout']);
    Route::get('/auth/me', [AuthController::class, 'me']);
    Route::post('/auth/change-password', [AuthController::class, 'changePassword']);
    Route::post('/auth/profile-picture', [AuthController::class, 'uploadProfilePicture']);

    Route::post('/auctions/{auction}/bid', [AuctionController::class, 'placeBid']);

    // ============================================
    // CAREERS — APPLICANT PORTAL (auth:sanctum resolves Applicant model)
    // ============================================
    Route::prefix('careers')->middleware('applicant')->group(function () {
        Route::post('/auth/logout',                [ApplicantAuthController::class, 'logout']);
        Route::get('/auth/me',                     [ApplicantAuthController::class, 'me']);
        Route::post('/jobs/{jobId}/apply',         [ApplicantPortalController::class, 'apply']);
        Route::post('/applications/{id}/withdraw', [ApplicantPortalController::class, 'withdraw']);
        Route::get('/applications',                [ApplicantPortalController::class, 'myApplications']);
        Route::get('/applications/{id}',           [ApplicantPortalController::class, 'show']);
        Route::post('/applications/{id}/documents',[ApplicantPortalController::class, 'uploadDocument']);
        Route::patch('/portal/profile',            [ApplicantPortalController::class, 'updateProfile']);
        Route::post('/portal/password',            [ApplicantPortalController::class, 'changePasswordSelf']);

        Route::post('/portal/change-password', [ApplicantAuthController::class, 'changePassword']);
    });
    
    // ============================================
    // NOTIFICATIONS (ALL AUTHENTICATED USERS)
    // ============================================
    Route::prefix('notifications')->group(function () {
        //removecommentRoute::get('/', [NotificationController::class, 'index']);
        //removecommentRoute::get('/unread-count', [NotificationController::class, 'unreadCount']);
        //removecommentRoute::post('/mark-all-read', [NotificationController::class, 'markAllRead']);
        //removecommentRoute::post('/{id}/read', [NotificationController::class, 'markAsRead']);
        //removecommentRoute::delete('/{id}', [NotificationController::class, 'destroy']);
    });

    // ============================================
    // CUSTOMER ROUTES
    // ============================================
    Route::middleware('role:customer')->prefix('customer')->group(function () {
        // Customer Profile & Settings
        Route::get('/profile', [CustomerController::class, 'profile']);
        Route::put('/profile', [CustomerController::class, 'updateProfile']);
        Route::post('/profile/upload-image', [CustomerController::class, 'uploadCustomerImage']);
        
        // Email & Phone Verification
        Route::post('/email/resend', [VerificationController::class, 'resendEmailVerification']);
        Route::post('/phone/send-otp', [VerificationController::class, 'sendPhoneOtp']);
        Route::post('/phone/verify', [VerificationController::class, 'verifyPhoneOtp']);
        
        // Customer Addresses
        Route::prefix('addresses')->group(function () {
            //removecommentRoute::get('/', [CustomerAddressController::class, 'index']);
            //removecommentRoute::post('/', [CustomerAddressController::class, 'store']);
            //removecommentRoute::get('/{id}', [CustomerAddressController::class, 'show']);
            //removecommentRoute::put('/{id}', [CustomerAddressController::class, 'update']);
            //removecommentRoute::delete('/{id}', [CustomerAddressController::class, 'destroy']);
            //removecommentRoute::post('/{id}/set-default-shipping', [CustomerAddressController::class, 'setDefaultShipping']);
            //removecommentRoute::post('/{id}/set-default-billing', [CustomerAddressController::class, 'setDefaultBilling']);
        });
        
        // Orders
        Route::prefix('orders')->group(function () {
            Route::get('/', [OrderController::class, 'myOrders']);
            Route::delete('/{id}', [OrderController::class, 'customerTrash']);
            Route::get('/{id}', [OrderController::class, 'show']);
            Route::post('/', [OrderController::class, 'store']);
            Route::put('/{id}', [OrderController::class, 'customerUpdate']);
            Route::post('/{id}/cancel', [OrderController::class, 'customerCancel']);
            Route::post('/{id}/restore', [OrderController::class, 'customerRestore']);
            Route::post('/{id}/rate', [OrderController::class, 'rateOrder']); 
        });

        Route::get('/payments/order/{orderId}', [PaymentController::class, 'customerOrderPayments']);

        // ── Customer hamper routes (auth required) ────────────────────────────────────
        Route::prefix('hampers')->group(function () {
            Route::get('/',                              [PublicHamperController::class, 'index']);
            Route::get('/{slug}',                       [PublicHamperController::class, 'show']);
            Route::get('/{slug}/checkout',              [HamperCheckoutController::class, 'load']);
            Route::post('/{slug}/checkout/validate-promo', [HamperCheckoutController::class, 'validatePromo']);
            Route::post('/{slug}/checkout/place-order', [HamperCheckoutController::class, 'placeOrder']);
        });

        // Quotes
        Route::prefix('quotes')->group(function () {
            Route::get('/', [QuoteController::class, 'myQuotes']);
            Route::get('/{id}', [QuoteController::class, 'show']);
            Route::post('/', [QuoteController::class, 'store']);
            Route::delete('/{id}', [QuoteController::class, 'customerTrash']);
            Route::post('/{id}/accept', [QuoteController::class, 'accept']);
            Route::post('/{id}/reject', [QuoteController::class, 'reject']);
            Route::post('/{id}/request-revision', [QuoteController::class, 'requestRevision']);
            Route::patch('/{id}/customer-update', [QuoteController::class, 'customerUpdate']);
            Route::post('/{id}/convert-to-order', [QuoteController::class, 'convertToOrder']);
        });

        // Quote Requests (Customer)
        Route::prefix('quote-requests')->group(function () {
            Route::get('/', [QuoteRequestController::class, 'myQuoteRequests']);
            Route::post('/', [QuoteRequestController::class, 'store']);
            Route::get('/{id}', [QuoteRequestController::class, 'show']);
            Route::put('/{id}', [QuoteRequestController::class, 'update']);
            Route::post('/{id}/clarify', [QuoteRequestController::class, 'respondToClarification']);
            Route::get('/{id}/attachments/{index}', [QuoteRequestController::class, 'downloadAttachment']);
        });

        Route::prefix('projects')->group(function () {
            Route::get('/', [ProjectController::class, 'customerIndex']);
            Route::post('/', [ProjectController::class, 'customerStore']); // optional, keep if you want
            Route::get('/{project}', [ProjectController::class, 'customerShow']);

            // Participants: customer can invite customers if owner/editor (policy)
            Route::post('/{project}/participants/customer-invite', [ProjectParticipantController::class, 'customerInvite']);
            Route::get('/{project}/participants', [ProjectParticipantController::class, 'index']);

            // Messages: customer_viewer CAN comment ✅
            Route::get('/{project}/messages', [ProjectMessageController::class, 'index']);
            Route::post('/{project}/messages', [ProjectMessageController::class, 'storeCustomerMessage']);
            // Customer (same controller, same method — policy handles permissions)
            Route::put( '/{project}/messages/{message}', [ProjectMessageController::class, 'update']);
            Route::delete('/{project}/messages/{message}',[ProjectMessageController::class, 'destroy']);
            Route::delete('/{project}/messages',          [ProjectMessageController::class, 'destroyBulk']);
            // Note: clearChat is admin-only, no customer route needed

            // Read-only project content
            Route::get('/{project}/links', [ProjectLinkController::class, 'index']);
            Route::get('/{project}/items', [ProjectItemController::class, 'index']);
            Route::get('/{project}/tasks', [ProjectTaskController::class, 'index']);
            
            Route::get('/{project}/milestones', [ProjectMilestoneController::class, 'index']);
            Route::post('/{project}/milestones/{milestone}/approve', [ProjectMilestoneController::class, 'approve']);
            Route::delete('/{project}/milestones/force-delete', [ProjectMilestoneController::class, 'forceDelete']);
        });
        
        // Referrals
        Route::prefix('referrals')->group(function () {
            Route::get('/',         [ReferralController::class, 'myReferrals']);
            Route::get('/code',     [ReferralController::class, 'myCode']);
            Route::get('/earnings', [ReferralController::class, 'earnings']);
        });

        
        // ── PROMO CODES — CUSTOMER ─────────────────────────────────────────────────
        Route::prefix('promo-codes')->group(function () {
            Route::post('/validate',  [PromoCodeController::class, 'validateCode']);
            Route::get('/my-codes',   [PromoCodeController::class, 'myCodes']);
        });

        Route::prefix('loyalty')->group(function () {
            Route::get('/',             [LoyaltyController::class, 'myBalance']);
            Route::get('/transactions', [LoyaltyController::class, 'myTransactions']);
            Route::post('/redeem',      [LoyaltyController::class, 'selfRedeem']);
        });

        Route::post('/products/{productId}/reviews', [ProductReviewController::class, 'store']);
        Route::get('/products/{productId}/can-review', [ReviewEligibilityController::class, 'canReview']);
        
        // Reviews
        Route::prefix('reviews')->group(function () {
            Route::get('/', [ProductReviewController::class, 'myReviews']);
            Route::post('/', [ProductReviewController::class, 'store']);
            Route::put('/{id}', [ProductReviewController::class, 'update']);
            Route::delete('/{id}', [ProductReviewController::class, 'destroy']);
        });

        Route::prefix('tickets')->group(function () {
            Route::get('/',            [TicketController::class, 'myTickets']);
            Route::post('/',           [TicketController::class, 'store']);
            Route::get('/{id}',        [TicketController::class, 'customerShow']);
            Route::post('/{id}/reply', [TicketController::class, 'customerReply']);
            Route::post('/{id}/close', [TicketController::class, 'customerClose']);
        });
    });

    // ============================================
    // ADMIN/MANAGER/SALES REP ROUTES
    // ============================================
    Route::middleware('role:admin,super_admin,manager,finance,logistics,sales_rep')->prefix('admin')->group(function () {
        // Dashboard
        // Route::get('/dashboard', [AdminController::class, 'dashboard']);

        
        Route::get('/users', [AuthController::class, 'getAdminUsers']);
      
        Route::get('/customers/{customerId}/orders', [OrderController::class, 'adminCustomerOrders']);
        // Products Management
        Route::prefix('products')->group(function () {
            Route::post('/', [ProductController::class, 'store']);
            Route::get('/', [ProductController::class, 'adminIndex']);
            Route::get('/trash', [ProductController::class, 'trashIndex']); // trashed products list
            Route::post('/restore-multiple', [ProductController::class, 'restoreMultiple']); // bulk restore
            Route::post('/force-delete-multiple', [ProductController::class, 'forceDeleteMultiple']); // bulk permanent delete

            Route::post('/bulk-update-flags', [ProductController::class, 'bulkUpdateFlags']);

            Route::get('/{id}', [ProductController::class, 'show']); 
            Route::put('/{id}', [ProductController::class, 'update']);
            Route::post('/{id}/bulk-update', [ProductController::class, 'bulkUpdate']);
            Route::delete('/{id}', [ProductController::class, 'destroy']);
            Route::post('/{id}/restore', [ProductController::class, 'restore']); // restore single
            Route::delete('/{id}/force', [ProductController::class, 'forceDelete']); // permanent delete single
            Route::put('/{id}/stock', [ProductController::class, 'updateStock']);
        });

        // Admin Auction Management
        Route::prefix('auctions')->group(function () {
            Route::post('/', [AuctionController::class, 'store']);
            Route::get('/', [AuctionController::class, 'adminIndex']);
            Route::get('/trashed', [AuctionController::class, 'trashed']);
            Route::get('/{auction}', [AuctionController::class, 'adminShow']);
            Route::put('/{auction}', [AuctionController::class, 'update']);
            Route::delete('/{auction}', [AuctionController::class, 'destroy']);
            Route::post('/{id}/restore', [AuctionController::class, 'restore']);  // ← new
            Route::delete('/{id}/force', [AuctionController::class, 'forceDestroy']); 
        });

        // Categories Management
        Route::prefix('categories')->group(function () {
            Route::post('/', [CategoryController::class, 'store']);
            Route::put('/{id}', [CategoryController::class, 'update']);
            Route::delete('/{id}', [CategoryController::class, 'destroy']);
        });

        // Brands Management
        Route::prefix('brands')->group(function () {
            Route::get('/', [BrandController::class, 'adminIndex']);
            Route::get('/{id}', [BrandController::class, 'show']); 
            Route::post('/', [BrandController::class, 'store']);
            Route::put('/{id}', [BrandController::class, 'update']);
            Route::delete('/{id}', [BrandController::class, 'destroy']);
        });

        // Customers Management
        Route::prefix('customers')->group(function () {
            Route::get('/', [CustomerController::class, 'index']);
            Route::get('/statistics', [CustomerController::class, 'statistics']);
            Route::get('/top', [CustomerController::class, 'topCustomers']);
            Route::get('/template', [CustomerController::class, 'downloadTemplate']);
            Route::post('/import', [CustomerController::class, 'bulkImport']);
            Route::get('/upcoming-birthdays', [CustomerController::class, 'upcomingBirthdays']);
            Route::get('/health', [CustomerController::class, 'health']);
            Route::get('/{id}', [CustomerController::class, 'show']);
            Route::put('/{id}', [CustomerController::class, 'update']);
            Route::post('/{id}/upload-image', [CustomerController::class, 'uploadImage']);
            Route::post('/{id}/assign-sales-rep', [CustomerController::class, 'assignSalesRep']);
            Route::post('/{id}/add-tag', [CustomerController::class, 'addTag']);
            Route::post('/{id}/remove-tag', [CustomerController::class, 'removeTag']);
            Route::post('/{id}/add-credit', [CustomerController::class, 'addCredit']);
            Route::post('/{id}/add-loyalty-points', [CustomerController::class, 'addLoyaltyPoints']);

            // Addresses
            Route::prefix('/{id}/addresses')->group(function () {
                Route::get('/',                                   [CustomerAddressController::class, 'adminIndex']);
                Route::post('/',                                  [CustomerAddressController::class, 'adminStore']);
                Route::put('/{addressId}',                        [CustomerAddressController::class, 'adminUpdate']);
                Route::delete('/{addressId}',                     [CustomerAddressController::class, 'adminDestroy']);
                Route::post('/{addressId}/set-default-shipping',  [CustomerAddressController::class, 'adminSetDefaultShipping']);
                Route::post('/{addressId}/set-default-billing',   [CustomerAddressController::class, 'adminSetDefaultBilling']);
            });
        });

        // Services Management
        Route::prefix('services')->group(function () {
            Route::get('/', [ServiceController::class, 'adminIndex']);
            Route::post('/', [ServiceController::class, 'store']);
            Route::get('/trash', [ServiceController::class, 'trash']);
            Route::post('/restore-multiple', [ServiceController::class, 'restoreMultiple']);
            Route::post('/force-delete-multiple', [ServiceController::class, 'forceDeleteMultiple']);
            Route::get('/statistics', [ServiceController::class, 'statistics']);
            Route::get('/available', [ServiceController::class, 'getAvailableServices']); 
            Route::get('/products/available', [ServiceController::class, 'getAvailableProducts']); 
            Route::get('/{id}', [ServiceController::class, 'adminShow']);
            Route::put('/{id}', [ServiceController::class, 'update']);
            Route::delete('/{id}', [ServiceController::class, 'destroy']);
            Route::post('/{id}/restore', [ServiceController::class, 'restore']);
            Route::post('/{id}/publish', [ServiceController::class, 'publish']);
            Route::post('/{id}/unpublish', [ServiceController::class, 'unpublish']);
        });

        // Service Categories Management
        Route::prefix('service-categories')->group(function () {
            Route::get('/', [ServiceCategoryController::class, 'adminIndex']);
            Route::post('/', [ServiceCategoryController::class, 'store']);
            Route::get('/{id}', [ServiceCategoryController::class, 'adminShow']);
            Route::put('/{id}', [ServiceCategoryController::class, 'update']);
            Route::delete('/{id}', [ServiceCategoryController::class, 'destroy']);
            Route::post('/reorder', [ServiceCategoryController::class, 'reorder']);
        });
        
        // Currency Management
        Route::prefix('currencies')->group(function () {
            Route::get('/', [CurrencyController::class, 'index']);
            Route::get('/base', [CurrencyController::class, 'getBaseCurrency']);
            Route::post('/', [CurrencyController::class, 'store']);
            Route::post('/base', [CurrencyController::class, 'setBaseCurrency']);
            Route::put('/{id}', [CurrencyController::class, 'update']);
            Route::patch('/{id}/anchor-rate', [CurrencyController::class, 'updateAnchorRate']);
            Route::patch('/{id}/status', [CurrencyController::class, 'toggleStatus']);
            Route::delete('/{id}', [CurrencyController::class, 'destroy']);
            Route::post('/convert', [CurrencyController::class, 'convert']);
        });

        // Customer Tiers & Type Discounts Management
        Route::prefix('customer-tiers')->group(function () {
            Route::get('/',              [CustomerTierController::class, 'tierIndex']);
            Route::post('/',             [CustomerTierController::class, 'tierStore']);
            Route::put('/{id}',          [CustomerTierController::class, 'tierUpdate']);
            Route::patch('/{id}/status', [CustomerTierController::class, 'tierToggleStatus']);
            Route::delete('/{id}',       [CustomerTierController::class, 'tierDestroy']);
        });

        Route::prefix('customer-type-discounts')->group(function () {
            Route::get('/',              [CustomerTierController::class, 'typeIndex']);
            Route::post('/',             [CustomerTierController::class, 'typeStore']);
            Route::put('/{id}',          [CustomerTierController::class, 'typeUpdate']);
            Route::patch('/{id}/status', [CustomerTierController::class, 'typeToggleStatus']);
            Route::delete('/{id}',       [CustomerTierController::class, 'typeDestroy']);
        });

        Route::get('/customer-tier-activity', [CustomerTierController::class, 'activity']);

        // Shipping Management
        Route::prefix('shipping')->group(function () {
            Route::get('/',              [ShippingOptionController::class, 'index']);
            Route::get('/activity',      [ShippingOptionController::class, 'activity']);
            Route::post('/',             [ShippingOptionController::class, 'store']);
            Route::put('/{id}',          [ShippingOptionController::class, 'update']);
            Route::patch('/{id}/status', [ShippingOptionController::class, 'toggleStatus']);
            Route::delete('/{id}',       [ShippingOptionController::class, 'destroy']);
        });

        // Quotes Management
        Route::prefix('quotes')->group(function () {
            Route::get('/', [QuoteController::class, 'adminIndex']);
            Route::get('/trash', [QuoteController::class, 'trashIndex']);      // trashed only

            Route::post('/restore-multiple', [QuoteController::class, 'restoreMultiple']); // bulk restore
            
            Route::get('/{id}', [QuoteController::class, 'adminShow']);
            Route::post('/', [QuoteController::class, 'store']);
            Route::post('/from-request/{requestId}', [QuoteController::class, 'createFromRequest']);
            Route::put('/{id}', [QuoteController::class, 'update']);
            
            Route::delete('/{id}', [QuoteController::class, 'destroy']);      // soft delete (role rules)
            Route::post('/{id}/restore', [QuoteController::class, 'restore']); // restore single
        });
        
        // Quote Requests Management (Admin)
        Route::prefix('quote-requests')->group(function () {
            Route::get('/', [QuoteRequestController::class, 'index']);
            Route::get('/statistics', [QuoteRequestController::class, 'statistics']);
            Route::get('/{id}', [QuoteRequestController::class, 'adminShow']);
            Route::post('/{id}/assign', [QuoteRequestController::class, 'assign']);
            Route::post('/{id}/clarify', [QuoteRequestController::class, 'requestClarification']);
            Route::post('/{id}/reject', [QuoteRequestController::class, 'reject']);
            Route::post('/{id}/convert', [QuoteRequestController::class, 'convertToQuote']);
            Route::put('/{id}/priority', [QuoteRequestController::class, 'updatePriority']);
            Route::put('/{id}/status', [QuoteRequestController::class, 'updateStatus']);
            Route::post('/{id}/notes', [QuoteRequestController::class, 'addNotes']);
            Route::get('/{id}/attachments/{index}', [QuoteRequestController::class, 'downloadAttachment']);
        });
        
        // Orders Management
        Route::prefix('orders')->group(function () {
            Route::get('/', [OrderController::class, 'index']);
            Route::get('/trash', [OrderController::class, 'trashIndex']);  
            Route::post('/restore-multiple', [OrderController::class, 'restoreMultiple']);
            Route::get('/statistics', [OrderController::class, 'statistics']);
            Route::get('/{customerId}/order-statistics', [OrderController::class, 'customerOrderStatistics']);
            Route::get('/{id}', [OrderController::class, 'adminShow']);
            Route::post('/', [OrderController::class, 'adminCreateOrder']);
            Route::put('/{id}', [OrderController::class, 'update']);
            Route::put('/{id}/edit', [OrderController::class, 'adminUpdateOrder']);
            Route::put('/{id}/status', [OrderController::class, 'updateStatus']);
            Route::post('/{id}/confirm', [OrderController::class, 'confirm']);
            Route::post('/{id}/ship', [OrderController::class, 'ship']);
            Route::post('/{id}/deliver', [OrderController::class, 'deliver']);
            Route::post('/{id}/cancel', [OrderController::class, 'adminCancel']);
            Route::post('/bulk-cancel', [OrderController::class, 'bulkCancel']);
            Route::get('/{id}/refund-preview', [OrderController::class, 'refundPreview']);
            Route::post('/{id}/restore', [OrderController::class, 'restoreOrder']);
            Route::post('/bulk-restore', [OrderController::class, 'bulkRestore']);
            Route::get('/{id}/net-total', [OrderController::class, 'getNetTotal']);
            Route::post('/{id}/generate-invoice', [OrderController::class, 'generateInvoice']);
            Route::put('/{id}/payment-status', [OrderController::class, 'updatePaymentStatus']);
            
            Route::get('/{id}/payments', [PaymentController::class, 'adminOrderPaymentHistory']);
            Route::delete('/{id}', [OrderController::class, 'destroy']);               // ✅ SOFT DELETE
            Route::post('/{id}/restore-trash', [OrderController::class, 'restore']);
        });

        // Content Pages
        Route::prefix('content-pages')->group(function () {
            Route::get('/',                          [ContentPageController::class, 'index']);
            Route::post('/',                         [ContentPageController::class, 'store']);
            Route::get('/{contentPage}',             [ContentPageController::class, 'show']);
            Route::put('/{contentPage}',             [ContentPageController::class, 'update']);
            Route::patch('/{contentPage}/toggle',    [ContentPageController::class, 'toggle']);
            Route::delete('/{contentPage}',          [ContentPageController::class, 'destroy']);

            // Sections (nested under their page)
            Route::prefix('/{contentPage}/sections')->group(function () {
                Route::get('/',                          [ContentSectionController::class, 'index']);
                Route::post('/',                         [ContentSectionController::class, 'store']);
                Route::post('/reorder',                  [ContentSectionController::class, 'reorder']);  // BEFORE /{section}
                Route::post('/upload-image',             [ContentSectionController::class, 'uploadImage']);
                Route::put('/{section}',                 [ContentSectionController::class, 'update']);
                Route::patch('/{section}/toggle',        [ContentSectionController::class, 'toggle']);
                Route::delete('/{section}',              [ContentSectionController::class, 'destroy']);
            });
        });

        Route::prefix('projects')->group(function () {
            // Core project CRUD (some roles may be restricted via policy)
            Route::get('/statistics', [ProjectController::class, 'statistics']);
            Route::get('/trash', [ProjectController::class, 'adminTrashed']);  
            Route::get('/', [ProjectController::class, 'adminIndex']);
            Route::post('/', [ProjectController::class, 'adminStore']);
            Route::get('/{project}', [ProjectController::class, 'adminShow']);
            Route::put('/{project}', [ProjectController::class, 'adminUpdate']);
            Route::get('/{project}/activity', [ProjectActivityController::class, 'index']);

            // Participants
            Route::get('/{project}/participants', [ProjectParticipantController::class, 'index']);
            Route::post('/{project}/participants/add-admin', [ProjectParticipantController::class, 'addAdmin']);
            Route::post('/{project}/participants/add-customer', [ProjectParticipantController::class, 'addCustomer']);
            Route::put('/{project}/participants/{participant}', [ProjectParticipantController::class, 'update']);
            Route::delete('/{project}/participants/{participant}', [ProjectParticipantController::class, 'remove']);
            Route::delete('/{project}/participants/{participant}/force', [ProjectParticipantController::class, 'forceDelete']);

            // Links: exclusive binding contract enforced here
            Route::get('/{project}/links', [ProjectLinkController::class, 'index']);
            Route::post('/{project}/links', [ProjectLinkController::class, 'store']);        // attach quote_request/quote/order
            Route::delete('/{project}/links/{link}', [ProjectLinkController::class, 'destroy']);

            // Items: multi-currency project scope ledger
            Route::get('/{project}/items', [ProjectItemController::class, 'index']);
            Route::post('/{project}/items', [ProjectItemController::class, 'store']);
            Route::put('/{project}/items/{item}', [ProjectItemController::class, 'update']);
            Route::delete('/{project}/items/{item}', [ProjectItemController::class, 'destroy']);

            // Tasks
            Route::get('/{project}/tasks', [ProjectTaskController::class, 'index']);
            Route::post('/{project}/tasks', [ProjectTaskController::class, 'store']);
            Route::put('/{project}/tasks/{task}', [ProjectTaskController::class, 'update']);
            Route::delete('/{project}/tasks/{task}', [ProjectTaskController::class, 'destroy']);

            // Milestones
            Route::get('/{project}/milestones', [ProjectMilestoneController::class, 'index']);
            Route::post('/{project}/milestones', [ProjectMilestoneController::class, 'store']);
            Route::put('/{project}/milestones/{milestone}', [ProjectMilestoneController::class, 'update']);
            Route::post('/{project}/milestones/{milestone}/approve', [ProjectMilestoneController::class, 'approve']);
            Route::post('/{project}/milestones/{milestone}/reject', [ProjectMilestoneController::class, 'reject']);
            Route::delete('/{project}/milestones/force-delete', [ProjectMilestoneController::class, 'forceDelete']);

            // Messages (admin can post internal/customer-visible)
            Route::get('/{project}/messages', [ProjectMessageController::class, 'index']);
            Route::post('/{project}/messages', [ProjectMessageController::class, 'storeAdminMessage']);
            Route::put( '/{project}/messages/{message}', [ProjectMessageController::class, 'update']);
            Route::delete('/{project}/messages/clear',   [ProjectMessageController::class, 'clearChat']);   // MUST be before /{message}
            Route::delete('/{project}/messages/{message}',[ProjectMessageController::class, 'destroy']);
            Route::delete('/{project}/messages',          [ProjectMessageController::class, 'destroyBulk']);
        });

        Route::prefix('employees')->group(function () {
            Route::get('/my-record', [EmployeeController::class, 'myRecord']);
            Route::get('/template', [EmployeeController::class, 'downloadTemplate']);
            Route::post('/import', [EmployeeController::class, 'bulkImport']);
        });

        // User Management
        Route::prefix('users')->group(function () {
            Route::get('/',                          [UserController::class, 'index']);
            Route::get('/statistics',               [UserController::class, 'statistics']);
            Route::get('/departments',              [UserController::class, 'departments']);
            Route::post('/',                        [UserController::class, 'store']);
            Route::get('/{id}',                     [UserController::class, 'show']);
            Route::put('/{id}',                     [UserController::class, 'update']);
            Route::delete('/{id}',                  [UserController::class, 'destroy']);
            Route::post('/{id}/restore',            [UserController::class, 'restore']);
            Route::post('/{id}/force-password-reset',[UserController::class, 'forcePasswordReset']);
            Route::post('/{id}/update-status',      [UserController::class, 'updateStatus']);
            Route::post('/{id}/unlock',             [UserController::class, 'unlockAccount']);
            Route::post('/{id}/reset-password',     [UserController::class, 'resetPassword']);

            Route::post('/{id}/verify-email',   [VerificationController::class, 'adminVerifyEmail']);
            Route::post('/{id}/unverify-email', [VerificationController::class, 'adminUnverifyEmail']);
            Route::post('/{id}/verify-phone',   [VerificationController::class, 'adminVerifyPhone']);
            Route::post('/{id}/unverify-phone', [VerificationController::class, 'adminUnverifyPhone']);
            Route::post('/{id}/lock',           [VerificationController::class, 'lockAccount']);

            Route::post('/bulk-destroy',            [UserController::class, 'bulkDestroy']);
            Route::post('/bulk-restore',            [UserController::class, 'bulkRestore']);
        });

        // Reviews Management
        Route::prefix('reviews')->group(function () {
            Route::get('/', [ProductReviewController::class, 'adminIndex']);
            Route::get('/statistics', [ProductReviewController::class, 'statistics']);
            Route::post('/{id}/approve', [ProductReviewController::class, 'approve']);
            Route::post('/{id}/reject', [ProductReviewController::class, 'reject']);
            Route::delete('/{id}', [ProductReviewController::class, 'adminDestroy']);
        });
        
        // Referral Codes Management
        Route::prefix('referrals')->group(function () {
            Route::get('/',                      [ReferralController::class, 'index']);
            Route::get('/statistics',            [ReferralController::class, 'statistics']);
            Route::get('/analytics',             [ReferralController::class, 'analytics']);
            Route::get('/top-performers',        [ReferralController::class, 'topPerformers']);
            Route::get('/{id}',                  [ReferralController::class, 'show']);
            Route::post('/{id}/pause',           [ReferralController::class, 'pause']);
            Route::post('/{id}/archive',         [ReferralController::class, 'archive']);
            Route::get('/{id}/usage',            [ReferralController::class, 'usage']);
        });

        // ── PROMO CODES — ADMINS ────────────────────────────────────────────────────
        Route::prefix('promo-codes')->group(function () {
            Route::get('/',                    [PromoCodeController::class, 'index']);
            Route::get('/statistics',          [PromoCodeController::class, 'statistics']);
            Route::post('/generate-birthday',  [PromoCodeController::class, 'triggerBirthday']);
            Route::post('/generate-winback',   [PromoCodeController::class, 'triggerWinBack']);
            Route::post('/expire',             [PromoCodeController::class, 'triggerExpire']);
            Route::post('/validate',           [PromoCodeController::class, 'adminValidate']);
            Route::get('/{id}',                [PromoCodeController::class, 'show']);
            Route::post('/{id}/pause',         [PromoCodeController::class, 'pause']);
            Route::post('/{id}/archive',       [PromoCodeController::class, 'archive']);
            Route::get('/{id}/redemptions',    [PromoCodeController::class, 'redemptions']);
        });

        Route::prefix('loyalty')->group(function () {
            Route::get('/',                           [LoyaltyController::class, 'index']);
            Route::get('/settings',                   [LoyaltyController::class, 'getSettings']);
            Route::put('/settings',                   [LoyaltyController::class, 'updateSettings']);
            Route::post('/settings/rules',            [LoyaltyController::class, 'upsertRule']);
            Route::delete('/settings/rules/{ruleId}', [LoyaltyController::class, 'deleteRule']);
            Route::get('/{customerId}',               [LoyaltyController::class, 'show']);
            Route::get('/{customerId}/transactions',  [LoyaltyController::class, 'transactions']);
            Route::post('/{customerId}/grant-points', [LoyaltyController::class, 'grantPoints']);
            Route::post('/{customerId}/deduct-points',[LoyaltyController::class, 'deductPoints']);
            Route::post('/{customerId}/grant-credit', [LoyaltyController::class, 'grantCredit']);
            Route::post('/{customerId}/deduct-credit',[LoyaltyController::class, 'deductCredit']);
            Route::post('/{customerId}/redeem',       [LoyaltyController::class, 'redeem']);
        });

        Route::prefix('work')->group(function () {
            Route::get('/dashboard',   [WorkController::class, 'myDashboard']);
            Route::get('/assignments', [WorkController::class, 'myAssignmentsEndpoint']);
            Route::get('/deadlines',   [WorkController::class, 'myDeadlinesEndpoint']);
        });

        Route::prefix('reports')->group(function () {
            Route::get('revenue',      [ReportsController::class, 'revenue']);
            Route::get('orders',       [ReportsController::class, 'orders']);
            Route::get('products',     [ReportsController::class, 'products']);
            Route::get('brands',       [ReportsController::class, 'brands']);
            Route::get('services',     [ReportsController::class, 'services']);
            Route::get('quote-funnel', [ReportsController::class, 'quoteFunnel']);
            Route::get('projects',     [ReportsController::class, 'projects']);
            Route::get('customers',    [ReportsController::class, 'customers']);
            Route::get('tickets',      [ReportsController::class, 'tickets']);
            Route::get('promos',       [ReportsController::class, 'promos']);
            Route::get('summary',      [ReportsController::class, 'summary']);
        });

        Route::prefix('tickets')->group(function () {
            Route::get('/',                  [TicketController::class, 'adminIndex']);
            Route::get('/statistics',        [TicketController::class, 'statistics']);
            Route::get('/trash',             [TicketController::class, 'trashIndex']);
            Route::get('/{id}',              [TicketController::class, 'adminShow']);
            Route::put('/{id}',              [TicketController::class, 'update']);
            Route::post('/{id}/assign',      [TicketController::class, 'assign']);
            Route::post('/{id}/unassign',    [TicketController::class, 'unassign']);
            Route::post('/{id}/reply',       [TicketController::class, 'adminReply']);
            Route::delete('/{id}',           [TicketController::class, 'destroy']);         // soft-delete (admin)
            Route::post('/{id}/restore',     [TicketController::class, 'restore']);
        });
    });

    // ============================================
    // FINANCE ROUTES
    // ============================================
    Route::middleware('role:finance,admin,super_admin')->prefix('admin')->group(function () {

        // PAYMENTS
        Route::prefix('payments')->group(function () {
            Route::get('/',                          [PaymentController::class, 'index']);
            Route::post('/initiate',                 [PaymentController::class, 'initiate']);
            Route::get('/summary',                    [PaymentController::class, 'summary']);
            Route::get('/order/{orderId}',           [PaymentController::class, 'orderPayments']);
            
            Route::get('/{payment}',                 [PaymentController::class, 'show']);
            Route::get('/{payment}/status',          [PaymentController::class, 'status']);
            Route::post('/{payment}/cancel',         [PaymentController::class, 'cancel']);
            Route::post('/{payment}/retry',          [PaymentController::class, 'retry']);
            Route::post('/{payment}/query-daraja',   [PaymentController::class, 'queryDaraja']);
            Route::post('/{payment}/dispute',        [PaymentController::class, 'raiseDispute']);
            Route::post('/{payment}/dispute/resolve',[PaymentController::class, 'resolveDispute']);
            Route::post('/{payment}/notes',          [PaymentController::class, 'addNotes']);
        });

        // Projects — policy-gated, same as admin
        Route::prefix('projects')->group(function () {
            Route::get('/',                          [ProjectController::class, 'adminIndex']);
            Route::get('/{project}',                 [ProjectController::class, 'adminShow']);
            Route::get('/{project}/activity',        [ProjectActivityController::class, 'index']);
            Route::get('/{project}/participants',    [ProjectParticipantController::class, 'index']);
            Route::get('/{project}/links',           [ProjectLinkController::class, 'index']);
            Route::get('/{project}/items',           [ProjectItemController::class, 'index']);
            Route::get('/{project}/tasks',           [ProjectTaskController::class, 'index']);
            Route::get('/{project}/milestones',      [ProjectMilestoneController::class, 'index']);
            Route::get('/{project}/messages',        [ProjectMessageController::class, 'index']);
            Route::post('/{project}/messages',       [ProjectMessageController::class, 'storeAdminMessage']);
            Route::put('/{project}/messages/{message}',    [ProjectMessageController::class, 'update']);
            Route::delete('/{project}/messages/{message}', [ProjectMessageController::class, 'destroy']);
        });

        // Referrals 
        Route::prefix('referrals')->group(function () {
            Route::get('/',                      [ReferralController::class, 'index']);
            Route::get('/statistics',            [ReferralController::class, 'statistics']);
            Route::get('/analytics',             [ReferralController::class, 'analytics']);
            Route::get('/top-performers',        [ReferralController::class, 'topPerformers']);
            Route::get('/{id}',                  [ReferralController::class, 'show']);
            Route::post('/{id}/pause',           [ReferralController::class, 'pause']);
            Route::post('/{id}/archive',         [ReferralController::class, 'archive']);
            Route::get('/{id}/usage',            [ReferralController::class, 'usage']);
        });

        // Promo Codes — full ops, no destroy
        Route::prefix('promo-codes')->group(function () {
            Route::get('/',                    [PromoCodeController::class, 'index']);
            Route::post('/',                   [PromoCodeController::class, 'store']);
            Route::get('/statistics',          [PromoCodeController::class, 'statistics']);
            Route::post('/generate-birthday',  [PromoCodeController::class, 'triggerBirthday']);
            Route::post('/generate-winback',   [PromoCodeController::class, 'triggerWinBack']);
            Route::post('/expire',             [PromoCodeController::class, 'triggerExpire']);
            Route::post('/validate',           [PromoCodeController::class, 'adminValidate']);
            Route::get('/{id}',                [PromoCodeController::class, 'show']);
            Route::put('/{id}',                [PromoCodeController::class, 'update']);
            Route::post('/{id}/activate',      [PromoCodeController::class, 'activate']);
            Route::post('/{id}/pause',         [PromoCodeController::class, 'pause']);
            Route::post('/{id}/archive',       [PromoCodeController::class, 'archive']);
            Route::get('/{id}/redemptions',    [PromoCodeController::class, 'redemptions']);
        });

        // Reports — financial subset
        Route::prefix('reports')->group(function () {
            Route::get('revenue',       [ReportsController::class, 'revenue']);
            Route::get('orders',        [ReportsController::class, 'orders']);
            Route::get('quote-funnel',  [ReportsController::class, 'quoteFunnel']);
            Route::get('promos',        [ReportsController::class, 'promos']);
            Route::get('summary',       [ReportsController::class, 'summary']);
        });

        // Work dashboard
        Route::prefix('work')->group(function () {
            Route::get('/dashboard',    [WorkController::class, 'myDashboard']);
            Route::get('/assignments',  [WorkController::class, 'myAssignmentsEndpoint']);
            Route::get('/deadlines',    [WorkController::class, 'myDeadlinesEndpoint']);
        });

        // Own employee record
        Route::prefix('employees')->group(function () {
            Route::get('/my-record', [EmployeeController::class, 'myRecord']);
        });
    });

    // ============================================
    // LOGISTICS ROUTES
    // ============================================
    Route::middleware('role:logistics,admin,super_admin')->prefix('admin')->group(function () {

        // Projects — policy-gated, same as admin
        Route::prefix('projects')->group(function () {
            Route::get('/',                          [ProjectController::class, 'adminIndex']);
            Route::get('/{project}',                 [ProjectController::class, 'adminShow']);
            Route::get('/{project}/activity',        [ProjectActivityController::class, 'index']);
            Route::get('/{project}/participants',    [ProjectParticipantController::class, 'index']);
            Route::get('/{project}/links',           [ProjectLinkController::class, 'index']);
            Route::get('/{project}/items',           [ProjectItemController::class, 'index']);
            Route::get('/{project}/tasks',           [ProjectTaskController::class, 'index']);
            Route::get('/{project}/milestones',      [ProjectMilestoneController::class, 'index']);
            Route::get('/{project}/messages',        [ProjectMessageController::class, 'index']);
            Route::post('/{project}/messages',       [ProjectMessageController::class, 'storeAdminMessage']);
            Route::put('/{project}/messages/{message}',    [ProjectMessageController::class, 'update']);
            Route::delete('/{project}/messages/{message}', [ProjectMessageController::class, 'destroy']);
        });

        // Work dashboard
        Route::prefix('work')->group(function () {
            Route::get('/dashboard',    [WorkController::class, 'myDashboard']);
            Route::get('/assignments',  [WorkController::class, 'myAssignmentsEndpoint']);
            Route::get('/deadlines',    [WorkController::class, 'myDeadlinesEndpoint']);
        });

        // Own employee record
        Route::prefix('employees')->group(function () {
            Route::get('/my-record', [EmployeeController::class, 'myRecord']);
        });
    });

    // ============================================
    // SUPER ADMIN & ADMIN ONLY ROUTES
    // ============================================
    Route::middleware('role:admin,super_admin')->prefix('admin')->group(function () {
        Route::apiResource('publications', PublicationController::class);
        Route::get('publications/{id}/comments', [PublicationCommentController::class, 'index']);
        Route::patch('comments/{id}', [PublicationCommentController::class, 'updateStatus']);
        Route::delete('comments/{id}', [PublicationCommentController::class, 'destroy']);
        
        Route::prefix('projects')->group(function () {
            Route::delete('/{project}', [ProjectController::class, 'adminDestroy']);          // soft delete → trash
            Route::post('/{project}/transfer-ownership', [ProjectController::class, 'transferOwnership']);
            Route::post('/{id}/restore', [ProjectController::class, 'adminRestore']);
        });
        
        // ── Admin hamper routes ───────────────────────────────────────────────────────
        Route::prefix('hampers')->group(function () {
            Route::get('/',                                     [HamperController::class, 'index']);
            Route::post('/',                                    [HamperController::class, 'store']);
            Route::get('/{id}',                                 [HamperController::class, 'show']);
            Route::put('/{id}',                                 [HamperController::class, 'update']);
            Route::delete('/{id}',                              [HamperController::class, 'destroy']);
        
            // products
            Route::post('/{id}/products',                       [HamperController::class, 'addProduct']);
            Route::delete('/{id}/products/{productId}',         [HamperController::class, 'removeProduct']);
            Route::get('/{id}/suggest-products',                [HamperController::class, 'suggestProducts']);
        
            // eligibility
            Route::get('/{id}/eligibility',                     [HamperController::class, 'listEligibility']);
            Route::post('/{id}/eligibility',                    [HamperController::class, 'addCustomer']);
            Route::patch('/{id}/eligibility/{customerId}',      [HamperController::class, 'updateCustomerStatus']);
            Route::get('/{id}/eligibility/search',              [HamperController::class, 'searchCustomers']);
        
            // orders
            Route::get('/{id}/orders',                          [HamperController::class, 'orders']);
        });
        
        // ── PROMO CODES — ADMIN ────────────────────────────────────────────────────
        Route::prefix('promo-codes')->group(function () {
            Route::post('/',                   [PromoCodeController::class, 'store']);
            Route::put('/{id}',                [PromoCodeController::class, 'update']);
            Route::delete('/{id}',             [PromoCodeController::class, 'destroy']);
            Route::post('/{id}/activate',      [PromoCodeController::class, 'activate']);
        });

        // Referral Codes Management
        Route::prefix('referrals')->group(function () {
            Route::post('/',                     [ReferralController::class, 'store']);
            Route::put('/{id}',                  [ReferralController::class, 'update']);
            Route::delete('/{id}',               [ReferralController::class, 'destroy']);
            Route::post('/{id}/activate',        [ReferralController::class, 'activate']);
        });

        Route::prefix('employees')->group(function () {
            Route::get('/',                         [EmployeeController::class, 'index']);
            Route::get('/statistics',               [EmployeeController::class, 'statistics']);
            Route::get('/departments',              [EmployeeController::class, 'departments']);
            Route::get('/job-titles',               [EmployeeController::class, 'jobTitles']);
            Route::get('/potential-managers',       [EmployeeController::class, 'potentialManagers']);
            Route::get('/upcoming-birthdays',       [EmployeeController::class, 'upcomingBirthdays']);
            Route::get('/leave-logs',               [EmployeeController::class, 'allLeaveLogs']);
            Route::get('/{id}/leave-logs',          [EmployeeController::class, 'leaveLogs']);
            Route::post('/',                        [EmployeeController::class, 'store']);
            Route::get('/{id}',                     [EmployeeController::class, 'show']);
            Route::put('/{id}',                     [EmployeeController::class, 'update']);
            Route::delete('/{id}',                  [EmployeeController::class, 'destroy']);
            Route::post('/{id}/restore',            [EmployeeController::class, 'restore']);
            Route::post('/{id}/add-skill',          [EmployeeController::class, 'addSkill']);
            Route::post('/{id}/remove-skill',       [EmployeeController::class, 'removeSkill']);
            Route::post('/{id}/add-certification',        [EmployeeController::class, 'addCertification']);
            Route::delete('/{id}/remove-certification/{index}', [EmployeeController::class, 'removeCertification']);
            Route::post('/{id}/add-leave-days',     [EmployeeController::class, 'addLeaveDays']);
            Route::post('/{id}/use-leave-days',     [EmployeeController::class, 'useLeaveDays']);
            Route::post('/{id}/update-status',      [EmployeeController::class, 'updateStatus']);
            Route::delete('/{id}/force',            [EmployeeController::class, 'forceDelete']);
        });

        Route::prefix('users')->group(function () {
            Route::get('/staff-without-employee', [UserController::class, 'staffWithoutEmployee']);
        });
        Route::prefix('work')->group(function () {
            Route::get('/overview', [WorkController::class, 'teamOverview']);
        });
    });

    // ============================================
    // CAREERS — ADMIN
    // ============================================
    Route::middleware(['role:admin,super_admin'])
        ->prefix('admin/careers')
        ->group(function () {
            Route::get('/jobs',              [AdminJobController::class, 'index']);
            Route::post('/jobs',             [AdminJobController::class, 'store']);
            Route::get('/jobs/{id}',         [AdminJobController::class, 'show']);
            Route::put('/jobs/{id}',         [AdminJobController::class, 'update']);
            Route::delete('/jobs/{id}',      [AdminJobController::class, 'destroy']);
            Route::post('/jobs/{id}/publish',[AdminJobController::class, 'publish']);
            Route::post('/jobs/{id}/close',  [AdminJobController::class, 'close']);
            
            Route::get('/applications',              [AdminApplicationController::class, 'index']);
            Route::get('/applications/stats',        [AdminApplicationController::class, 'stats']);
            Route::get('/applications/{id}',         [AdminApplicationController::class, 'show']);
            Route::put('/applications/{id}/status',  [AdminApplicationController::class, 'updateStatus']);
            Route::post('/applications/{id}/note',   [AdminApplicationController::class, 'addNote']);
            Route::get('/jobs/{jobId}/applications', [AdminApplicationController::class, 'byJob']);

            Route::get('/applicants',               [AdminApplicantController::class, 'index']);
            Route::get('/applicants/{id}',          [AdminApplicantController::class, 'show']);
            Route::patch('/applicants/{id}/status', [AdminApplicantController::class, 'updateStatus']);
            Route::post('/applicants/{id}/reset-password', [AdminApplicantController::class, 'resetPassword']);

            Route::post('/applications/{id}/screen',       [AdminAIScreeningController::class, 'screenOne']);
            Route::post('/jobs/{jobId}/screen-all',        [AdminAIScreeningController::class, 'screenBatch']);
            Route::get('/documents/{document}/download',   [AdminApplicationController::class, 'downloadDocument'])
                ->name('admin.careers.documents.download');
        });

    // ============================================
    // SUPER ADMIN ONLY ROUTES
    // ============================================
    Route::middleware('role:super_admin')->prefix('admin')->group(function () {
        // User Management
        // Route::apiResource('users', UserController::class);
        
        // System Settings
        // Route::get('/settings', [SettingsController::class, 'index']);
        // Route::put('/settings', [SettingsController::class, 'update']);

        // ✅ SUPER ADMIN DELETE ORDER
        Route::prefix('orders')->group(function () {
            Route::delete('/{id}/force', [OrderController::class, 'forceDelete']);             // ✅ permanent delete single
            Route::post('/force-delete-multiple', [OrderController::class, 'forceDeleteMultiple']); 
        });

        Route::prefix('quotes')->group(function () {
            Route::delete('/{id}/force', [QuoteController::class, 'forceDelete']);
            Route::post('/force-delete-multiple', [QuoteController::class, 'forceDeleteMultiple']);
        });

        Route::prefix('projects')->group(function () {
            Route::delete('/{project}/force', [ProjectController::class, 'forceDestroy'])
               ->withTrashed();
        });

        Route::prefix('users')->group(function () {
            Route::delete('/{id}/force', [UserController::class, 'forceDelete']);
        });

        Route::prefix('tickets')->group(function () {
            Route::delete('/{id}/force', [TicketController::class, 'forceDelete']);  // permanent delete
        });
    });
});

// ============================================
// CATCH-ALL FOR 404
// ============================================
Route::fallback(function () {
    return response()->json([
        'message' => 'Route not found'
    ], 404);
});