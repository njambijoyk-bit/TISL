<?php

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;
use App\Http\Controllers\ChatController;
use App\Http\Controllers\VaultController;
use App\Http\Controllers\Admin\AiAnalyticsController;
use App\Http\Controllers\Admin\MimiAnalyticsController;
use App\Http\Controllers\Admin\LogExportController;
use App\Http\Controllers\Admin\ModuleController;
use App\Http\Controllers\Admin\BackupController;
use App\Http\Controllers\Admin\LocationController;
use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\CustomerSyncController;
use App\Http\Controllers\Api\PolicyController;
use App\Http\Controllers\Api\OAuthController;
use App\Http\Controllers\Api\ProductController;
use App\Http\Controllers\Api\AuctionController;
use App\Http\Controllers\Api\CategoryController;
use App\Http\Controllers\Api\BrandController;
use App\Http\Controllers\Api\BugReportController;
use App\Http\Controllers\Api\CustomerController;
use App\Http\Controllers\Api\ServiceController;
use App\Http\Controllers\Api\ServiceCatalogController;
use App\Http\Controllers\Api\ServiceCategoryController;
use App\Http\Controllers\Api\SearchEventController;
use App\Http\Controllers\Api\OrderController;
use App\Http\Controllers\Api\HamperController;
use App\Http\Controllers\Api\BooksMasterController;
use App\Http\Controllers\Api\CompanyProfileController;
use App\Http\Controllers\Api\QuotationController;
use App\Http\Controllers\Api\CheckoutController;
use App\Http\Controllers\Api\GiftVoucherController;
use App\Http\Controllers\Api\CustomerAccountController;
use App\Http\Controllers\Api\BooksVoucherController;
use App\Http\Controllers\Api\PublicHamperController;
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
use App\Http\Controllers\Api\InventoryController;
use App\Http\Controllers\Api\UserController;
use App\Http\Controllers\Api\VerificationController;
use App\Http\Controllers\Api\PromoCodeController;
use App\Http\Controllers\Api\EmployeeController;
use App\Http\Controllers\Api\TicketController;
use App\Http\Controllers\Api\LoyaltyController;
use App\Http\Controllers\Api\ShippingOptionController;
use App\Http\Controllers\Api\CustomerTierController;
use App\Http\Controllers\Api\AlgorithmController;
use App\Http\Controllers\Api\CustomerPinController;
use App\Http\Controllers\Api\PublicationController;
use App\Http\Controllers\Api\PublicationCommentController;
use App\Http\Controllers\Api\SearchAnalyticsController;
use App\Http\Controllers\Api\AdminSavedNoteController;
use App\Http\Controllers\Api\ProductVariantController;
use App\Http\Controllers\Api\UnitOfMeasureController;
use App\Http\Controllers\Api\TaxController;
use App\Http\Controllers\Api\WithholdingController;
use App\Http\Controllers\Api\TaxLegitimacyCertificateController;
use App\Http\Controllers\Api\AppearanceController;

use App\Http\Controllers\Api\Careers\PublicJobController;
use App\Http\Controllers\Api\Careers\ApplicantAuthController;
use App\Http\Controllers\Api\Careers\ApplicantPortalController;
use App\Http\Controllers\Api\Careers\AdminAIScreeningController;
use App\Http\Controllers\Api\Careers\AdminApplicationController;
use App\Http\Controllers\Api\Careers\AdminJobController;
use App\Http\Controllers\Api\Careers\AdminApplicantController;
use App\Http\Controllers\Api\CustomerCreditController;
use App\Http\Controllers\Api\CustomerCreditCustomerController;

use App\Http\Controllers\Api\DeliveryManifestController;
use App\Http\Controllers\Api\DeliveryRouteController;
use App\Http\Controllers\Api\DeliveryInsightController;
use App\Http\Controllers\Api\DriverManifestController;
use App\Http\Controllers\Api\OrderShipmentController;
use App\Http\Controllers\Api\DeliveryMoneyController;
use App\Http\Controllers\Api\CustomerEnrouteController;
use App\Http\Controllers\Api\AssetAccountingController;
use App\Http\Controllers\Api\InsightController;
use App\Http\Controllers\Api\DeliveryIncidentController;
use App\Http\Controllers\Api\DeliveryRatingController;
use App\Http\Controllers\Api\DeliveryStatsController;

//use App\Http\Controllers\Jobs\ScreenApplicationJob;
/*
|--------------------------------------------------------------------------
| API Routes
|--------------------------------------------------------------------------
*/
Route::get('/ping', function () {
    return response()->json([
        'status' => 'success',
        'message' => 'Laravel is alive and routing correctly!',
        'time' => now()->toDateTimeString(),
        'env' => app()->environment(),
    ]);
});
// ============================================
// PUBLIC ROUTES (No Authentication Required)
// ============================================
Route::post('/chat/guest', [ChatController::class, 'chatGuest'])
    ->middleware('throttle:10,1'); // Strict limit for guests

// Active modules — feeds storefront + admin navigation. Reveals only which
// modules are on, which the UI and footer already show.
Route::get('/modules/active', function (\App\Services\Licensing\LicenseManager $m) {
    $active = array_values(array_filter(
        array_values(\App\Services\Licensing\LicenseFormat::MODULES),
        fn ($k) => $m->isActive($k)
    ));

    return response()->json([
        'core'     => true,
        'active'   => $active,
        'verified' => $m->installationVerified(),
    ]);
});

// Storefront navigation — visible links for the customer header.
Route::get('/nav', [\App\Http\Controllers\Admin\NavController::class, 'publicNav']);

// Active branches — feeds the storefront branch picker (multi-location).
Route::get('/locations', [LocationController::class, 'publicIndex']);
// Authentication Routes
Route::prefix('auth')->group(function () {
    Route::post('/register', [AuthController::class, 'register']);
    Route::post('/login', [AuthController::class, 'login']);
    Route::post('/forgot-password', [AuthController::class, 'forgotPassword']);
    Route::post('/reset-password', [AuthController::class, 'resetPassword']);
    Route::post('/force-change-password', [AuthController::class, 'forceChangePassword']);
});

Route::get('/bug-reports/search', [BugReportController::class, 'search']);
Route::post('/bug-reports/screenshot', [BugReportController::class, 'uploadScreenshot']);

Route::post('/search-events', [SearchEventController::class, 'store']);

// Campaigns, public: the list, the homepage one, and a campaign by its address (the Campaigns module; a signed-in visitor, if any, is read for audience rules)
Route::prefix('campaigns')->middleware('module:campaigns')->group(function () {
    $c = \App\Http\Controllers\Api\PublicCampaignController::class;
    Route::get('/',         [$c, 'index']);
    Route::get('/featured', [$c, 'featured']);
    Route::get('/{slug}',   [$c, 'show'])->where('slug', '[a-z0-9-]+');
    Route::post('/{slug}/event', [$c, 'event'])->where('slug', '[a-z0-9-]+')->middleware('throttle:90,1');
});

// Engagement Engine, public: which controls the storefront shows (the Extras module)
Route::get('/engagement/config', [\App\Http\Controllers\Api\EngagementSettingsController::class, 'config'])->middleware('module:extras');
Route::prefix('engagement')->middleware('module:extras')->group(function () {
    $c = \App\Http\Controllers\Api\EngagementPostController::class;
    Route::get('/{type}/{id}/posts', [$c, 'index'])->whereNumber('id')->where('type', '[a-z]+');
    Route::get('/{type}/{id}/can',   [$c, 'can'])->whereNumber('id')->where('type', '[a-z]+');
    Route::post('/{type}/{id}/posts', [$c, 'store'])->whereNumber('id')->where('type', '[a-z]+')->middleware('throttle:20,1');
    Route::post('/posts/{id}/replies', [$c, 'reply'])->whereNumber('id')->middleware('throttle:20,1');
    Route::get('/{type}/{id}/reactions', [$c, 'reactionState'])->whereNumber('id')->where('type', '[a-z]+');
    Route::post('/{type}/{id}/react',    [$c, 'react'])->whereNumber('id')->where('type', '[a-z]+')->middleware('throttle:60,1');
    Route::post('/{type}/{id}/report',   [$c, 'report'])->whereNumber('id')->where('type', '[a-z]+')->middleware('throttle:10,1');
    Route::middleware('auth:sanctum')->group(function () use ($c) {
        Route::put('/posts/{id}',    [$c, 'update'])->whereNumber('id');
        Route::delete('/posts/{id}', [$c, 'destroy'])->whereNumber('id');
    });
});

// The world feed, public: pins, one pin, one board and the picture download (the Campaigns module; a signed-in visitor, if any, is read for the Following tab)
Route::prefix('world')->middleware('module:campaigns')->group(function () {
    $c = \App\Http\Controllers\Api\PublicWorldController::class;
    Route::get('/pins',               [$c, 'pins'])->middleware('throttle:120,1');
    Route::get('/pins/{id}',          [$c, 'pin'])->whereNumber('id');
    Route::get('/pins/{id}/download', [$c, 'download'])->whereNumber('id')->middleware('throttle:30,1');
    Route::get('/boards',             [$c, 'boards']);
    Route::get('/boards/{id}',        [$c, 'board'])->whereNumber('id');
    Route::get('/moodboards',         [$c, 'moodboards']);
    Route::get('/moodboards/{id}',    [$c, 'moodboard'])->whereNumber('id');
});

// A signed-in person's own boards and pins, and following (the Campaigns module)
Route::middleware(['auth:sanctum', 'module:campaigns'])->group(function () {
    $c = \App\Http\Controllers\Api\MyBoardController::class;
    Route::prefix('my')->group(function () use ($c) {
        Route::get('/boards',  [$c, 'index']);
        Route::post('/boards', [$c, 'store'])->middleware('throttle:30,1');
        Route::get('/boards/{id}',    [$c, 'show'])->whereNumber('id');
        Route::put('/boards/{id}',    [$c, 'update'])->whereNumber('id');
        Route::delete('/boards/{id}', [$c, 'destroy'])->whereNumber('id');
        Route::post('/boards/{id}/pins', [$c, 'addPins'])->whereNumber('id')->middleware('throttle:60,1');
        Route::delete('/boards/{id}/pins/{pinId}', [$c, 'removePin'])->whereNumber('id')->whereNumber('pinId');
        Route::post('/pins', [$c, 'storePin'])->middleware('throttle:20,1');
        Route::put('/pins/{id}',    [$c, 'updatePin'])->whereNumber('id');
        Route::delete('/pins/{id}', [$c, 'destroyPin'])->whereNumber('id');
        Route::get('/following', [$c, 'following']);
        $mm = \App\Http\Controllers\Api\MyMoodboardController::class;
        Route::get('/moodboards/presets', [$mm, 'presets']);
        Route::get('/moodboards/pins',    [$mm, 'pins']);
        Route::get('/moodboards',         [$mm, 'index']);
        Route::post('/moodboards',        [$mm, 'store'])->middleware('throttle:20,1');
        Route::get('/moodboards/{id}',    [$mm, 'show'])->whereNumber('id');
        Route::put('/moodboards/{id}',    [$mm, 'update'])->whereNumber('id')->middleware('throttle:60,1');
        Route::post('/moodboards/{id}/publish', [$mm, 'publish'])->whereNumber('id');
        Route::post('/moodboards/{id}/private', [$mm, 'makePrivate'])->whereNumber('id');
        Route::delete('/moodboards/{id}', [$mm, 'destroy'])->whereNumber('id');
    });
    Route::post('/world/boards/{id}/follow',   [$c, 'follow'])->whereNumber('id')->middleware('throttle:60,1');
    Route::delete('/world/boards/{id}/follow', [$c, 'unfollow'])->whereNumber('id');
});

// Auth required — must be registered BEFORE /{key} to avoid route conflict
Route::middleware('auth:sanctum')->group(function () {
    Route::get('/policies/check-reacceptance', [PolicyController::class, 'checkReacceptance']);
    Route::post('/policies/accept', [PolicyController::class, 'recordAcceptance']);
    Route::get('/ai-assistant/policy-status', [PolicyController::class, 'mimiStatus']);
});

// Public
Route::get('/policies', [PolicyController::class, 'index']);
Route::get('/policies/{key}', [PolicyController::class, 'show']);

// Memoranda — notes with debit / credit lines that post nothing. Staff write them (a driver too); finance edits, converts and dismisses (checked in the controller).
Route::middleware('auth:sanctum')->prefix('memoranda')->group(function () {
    Route::get('/',                    [\App\Http\Controllers\Api\MemorandumController::class, 'index']);
    Route::post('/',                   [\App\Http\Controllers\Api\MemorandumController::class, 'store']);
    Route::get('/{id}',                [\App\Http\Controllers\Api\MemorandumController::class, 'show'])->whereNumber('id');
    Route::put('/{id}',                [\App\Http\Controllers\Api\MemorandumController::class, 'update'])->whereNumber('id');
    Route::delete('/{id}',             [\App\Http\Controllers\Api\MemorandumController::class, 'destroy'])->whereNumber('id');
    Route::post('/{id}/convert',       [\App\Http\Controllers\Api\MemorandumController::class, 'convert'])->whereNumber('id');
});

// Checkout — open to guests too; a signed-in customer's token (if sent) makes it their prices, tier and vouchers
Route::prefix('checkout')->group(function () {
    Route::get('/options', [CheckoutController::class, 'options']);
    Route::post('/quote', [CheckoutController::class, 'quote']);
    Route::post('/place', [CheckoutController::class, 'place']);
});

// Public shipping options (for checkout)
Route::get('/shipping-options', [ShippingOptionController::class, 'publicIndex']);

// ── Public: Customer tiers & types (for checkout/dropdowns) ──
Route::get('/customer-tiers', [CustomerTierController::class, 'publicTiers']);
Route::get('/customer-type-discounts', [CustomerTierController::class, 'publicTypes']);

// Public
// A staff member's calendar as a subscription feed (the secret token in the link is the key)
Route::get('/calendar/feed/{token}', [\App\Http\Controllers\Api\CalendarController::class, 'feed'])->where('token', '[A-Za-z0-9]+(\.ics)?');

Route::get('/publications', [PublicationController::class, 'publicIndex']);
Route::get('/publications/{slug}', [PublicationController::class, 'publicShow']);
Route::post('/publications/{id}/comments', [PublicationCommentController::class, 'store']);



Route::post('/bug-reports', [BugReportController::class, 'store'])
    ->middleware('throttle:5,1');  // 5 per minute per IP — spam guard
 
Route::get('/bug-reports/track/{token}', [BugReportController::class, 'track']);

// ============================================================
// DEV GATED UX (no Laravel auth — uses one-time key + cache token)
// ============================================================
Route::prefix('dev')->group(function () {
    Route::post('/auth',         [BugReportController::class, 'devAuth']);
 
    // These require X-Dev-Token header (checked inside controller)
    Route::get('/notes',         [BugReportController::class, 'devNoteIndex']);
    Route::post('/notes',        [BugReportController::class, 'devNoteStoreByDev']);
    Route::put('/notes/{id}',    [BugReportController::class, 'devNoteUpdateByDev']);
});

// ============================================
// CAREERS — PUBLIC
// ============================================
Route::prefix('careers')->middleware('module:careers')->group(function () {
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
// Active currencies for the storefront price toggle (?currency= / X-Currency)
Route::get('/currencies', [CurrencyController::class, 'publicIndex']);

    Route::middleware('module:ecommerce')->group(function () {
Route::get('/products', [ProductController::class, 'index']);
Route::get('/products/featured', [ProductController::class, 'featured']);
Route::get('/products/new-arrivals', [ProductController::class, 'newArrivals']);
Route::get('/products/on-sale', [ProductController::class, 'onSale']);
Route::get('/products/{id}', [ProductController::class, 'show']);
Route::get('/products/{id}/related', [ProductController::class, 'related']);
Route::get('/products/{id}/variants', [ProductVariantController::class, 'publicShow'])->whereNumber('id');

// Auctions (Public)
Route::get('/auctions', [AuctionController::class, 'index']);
Route::get('/auctions/{id}', [AuctionController::class, 'show']);
Route::get('/auctions/{id}/stream', [AuctionController::class, 'stream']);
Route::get('/auctions/{id}/quote', [AuctionController::class, 'publicQuote']);
    });

Route::get('/content', [ContentPageController::class, 'publicIndex']);
Route::get('/content/{slug}', [ContentPageController::class, 'showBySlug']);


// PUBLIC CATEGORIES & BRANDS
    Route::middleware('module:ecommerce')->group(function () {
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
Route::get('/services/{id}/packages', [ServiceCatalogController::class, 'publicPackages'])->whereNumber('id');
Route::get('/services/{id}/booking', [\App\Http\Controllers\Api\MyBookingController::class, 'availability'])->whereNumber('id')->middleware('throttle:60,1');
Route::get('/services/{id}', [ServiceController::class, 'show']);
Route::get('/services/{id}/related', [ServiceController::class, 'related']);

// PUBLIC SERVICE CATEGORIES
Route::get('/service-categories', [ServiceCategoryController::class, 'index']);
Route::get('/service-categories/main', [ServiceCategoryController::class, 'main']);
Route::get('/service-categories/{id}', [ServiceCategoryController::class, 'show']);
Route::get('/service-categories/{id}/subcategories', [ServiceCategoryController::class, 'subcategories']);
    });

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

    // My bookings (customers): book, see mine, cancel
    Route::get('/my-bookings',                [\App\Http\Controllers\Api\MyBookingController::class, 'index']);
    Route::post('/my-bookings/quote',         [\App\Http\Controllers\Api\MyBookingController::class, 'quote']);
    Route::post('/my-bookings',               [\App\Http\Controllers\Api\MyBookingController::class, 'store']);
    Route::post('/my-bookings/{id}/cancel',   [\App\Http\Controllers\Api\MyBookingController::class, 'cancel'])->whereNumber('id');

    Route::post('/auctions/{auction}/bid', [AuctionController::class, 'placeBid']);
    Route::get('/auctions/{auction}/registration', [AuctionController::class, 'registration']);
    Route::post('/auctions/{auction}/register', [AuctionController::class, 'register']);

    // ============================================
    // CAREERS — APPLICANT PORTAL (auth:sanctum resolves Applicant model)
    // ============================================
    Route::prefix('careers')->middleware('applicant')->middleware('module:careers')->group(function () {
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
        Route::get('/', [NotificationController::class, 'index']);
        Route::get('/unread-count', [NotificationController::class, 'unreadCount']);
        Route::post('/mark-all-read', [NotificationController::class, 'markAllRead']);
        Route::post('/{id}/read', [NotificationController::class, 'markAsRead']);
        Route::delete('/{id}', [NotificationController::class, 'destroy']);
    });

    // ============================================
    // LICENSING — SETUP + MODULE CENTER
    // ============================================
    // Setup (ownership code) is open to any staff user while the install is
    // unverified, so a fresh site can be set up. Module Center is superadmin.
    Route::middleware('role:admin,super_admin,manager,finance,logistics,sales_rep')->group(function () {
        Route::get('/modules/setup-status', [ModuleController::class, 'status']);
        Route::post('/modules/setup',       [ModuleController::class, 'setup']);
    });
    Route::middleware('role:super_admin')->prefix('admin/modules')->group(function () {
        Route::get('/',                 [ModuleController::class, 'index']);
        Route::get('/attempts',         [ModuleController::class, 'attempts']);
        Route::post('/activate',        [ModuleController::class, 'activate']);
        Route::patch('/{moduleKey}/toggle', [ModuleController::class, 'toggle']);
    });

    // ============================================
    // BACKUPS (Core) — config + run: admin/super_admin; restore: super_admin
    // ============================================
    // EXPIRING STOCK (Core) — the expiry list: see it (finance, managers), act on it (finance, admins)
    Route::middleware('role:admin,super_admin,finance,manager')->prefix('admin/stock/expiry')->group(function () {
        Route::get('/', [\App\Http\Controllers\Admin\ExpiredStockController::class, 'index']);
        Route::middleware('role:admin,super_admin,finance')->group(function () {
            Route::post('/write-off', [\App\Http\Controllers\Admin\ExpiredStockController::class, 'writeOff']);
            Route::post('/return-to-supplier', [\App\Http\Controllers\Admin\ExpiredStockController::class, 'returnToSupplier']);
        });
    });

    // HELD STOCK (Core) — quarantine, recall, trace, clearance price: see (finance, managers), act (finance, admins)
    Route::middleware('role:admin,super_admin,finance,manager')->prefix('admin/stock/holds')->group(function () {
        $c = \App\Http\Controllers\Admin\StockHoldController::class;
        Route::get('/', [$c, 'index']);
        Route::get('/search', [$c, 'search']);
        Route::get('/{id}', [$c, 'show'])->whereNumber('id');
        Route::middleware('role:admin,super_admin,finance')->group(function () use ($c) {
            Route::post('/{id}/quarantine', [$c, 'quarantine'])->whereNumber('id');
            Route::post('/{id}/release', [$c, 'release'])->whereNumber('id');
            Route::post('/{id}/recall', [$c, 'recall'])->whereNumber('id');
            Route::post('/{id}/cancel-recall', [$c, 'cancelRecall'])->whereNumber('id');
            Route::post('/{id}/notify', [$c, 'notify'])->whereNumber('id');
            Route::post('/{id}/clearance', [$c, 'clearance'])->whereNumber('id');
        });
    });

    // STOCK TRANSFERS (Core) — see: finance, managers; send / receive / cancel: finance, admins
    Route::middleware('role:admin,super_admin,finance,manager')->prefix('admin/stock/transfers')->group(function () {
        $c = \App\Http\Controllers\Admin\StockTransferController::class;
        Route::get('/', [$c, 'index']);
        Route::get('/{id}', [$c, 'show'])->whereNumber('id');
        Route::middleware('role:admin,super_admin,finance')->group(function () use ($c) {
            Route::post('/', [$c, 'store']);
            Route::post('/{id}/receive', [$c, 'receive'])->whereNumber('id');
            Route::post('/{id}/cancel', [$c, 'cancel'])->whereNumber('id');
        });
    });

    // STOCK COUNTS, RECIPES & PRODUCTION, STOCK JOURNAL (Core) — see: finance, managers; act: finance, admins
    Route::middleware('role:admin,super_admin,finance,manager')->prefix('admin/stock')->group(function () {
        $n = \App\Http\Controllers\Admin\StockCountController::class;
        Route::get('/journal', [\App\Http\Controllers\Admin\StockJournalController::class, 'index']);
        Route::get('/reports/summary',   [\App\Http\Controllers\Admin\StockReportController::class, 'summary']);
        Route::get('/reports/monthly',   [\App\Http\Controllers\Admin\StockReportController::class, 'monthly']);
        Route::get('/reports/movements', [\App\Http\Controllers\Admin\StockReportController::class, 'movements']);
        Route::get('/reports/query',     [\App\Http\Controllers\Admin\StockReportController::class, 'query']);
        Route::get('/reports/find',      [\App\Http\Controllers\Admin\StockReportController::class, 'find']);
        Route::get('/counts', [$n, 'index']);
        Route::get('/counts/{id}', [$n, 'show'])->whereNumber('id');
        Route::middleware('role:admin,super_admin,finance')->group(function () use ($n) {
            Route::post('/counts', [$n, 'store']);
            Route::put('/counts/{id}', [$n, 'save'])->whereNumber('id');
            Route::post('/counts/{id}/post', [$n, 'post'])->whereNumber('id');
            Route::post('/counts/{id}/cancel', [$n, 'cancel'])->whereNumber('id');
        });
    });

    // JOBS / WORK IN PROGRESS (Core) — see: finance, managers; act: finance, admins
    Route::middleware('role:admin,super_admin,finance,manager')->prefix('admin/stock/jobs')->group(function () {
        $c = \App\Http\Controllers\Admin\StockJobController::class;
        Route::get('/', [$c, 'index']);
        Route::get('/{id}', [$c, 'show'])->whereNumber('id');
        Route::middleware('role:admin,super_admin,finance')->group(function () use ($c) {
            Route::post('/', [$c, 'store']);
            Route::post('/{id}/issue', [$c, 'issue'])->whereNumber('id');
            Route::post('/{id}/lines/{lineId}/return', [$c, 'returnLine'])->whereNumber('id')->whereNumber('lineId');
            Route::post('/{id}/complete', [$c, 'complete'])->whereNumber('id');
            Route::post('/{id}/invoice', [$c, 'invoice'])->whereNumber('id');
            Route::post('/{id}/cancel', [$c, 'cancel'])->whereNumber('id');
        });
    });

    // RECIPES & PRODUCTION (Menus) — see: finance, managers; act: finance, admins
    Route::middleware(['module:menus', 'role:admin,super_admin,finance,manager'])->prefix('admin/menus')->group(function () {
        $r = \App\Http\Controllers\Admin\RecipeController::class;
        Route::get('/recipes', [$r, 'index']);
        Route::middleware('role:admin,super_admin,finance')->group(function () use ($r) {
            Route::put('/recipes', [$r, 'save']);
            Route::delete('/recipes/{id}', [$r, 'destroy'])->whereNumber('id');
            Route::post('/recipes/{id}/produce', [$r, 'produce'])->whereNumber('id');
            Route::post('/production/{id}/cancel', [$r, 'cancelRun'])->whereNumber('id');
        });
    });

    // VENDORS (Core) — a vendor is a Sundry Creditors ledger (no login or portal). See: finance, managers; manage: finance, admins
    Route::middleware(['role:admin,super_admin,finance,manager'])->prefix('admin/vendors')->group(function () {
        $c = \App\Http\Controllers\Admin\VendorController::class;
        Route::get('/', [$c, 'index']);
        Route::get('/{id}', [$c, 'show'])->whereNumber('id');
        Route::middleware('role:admin,super_admin,finance')->group(function () use ($c) {
            Route::post('/', [$c, 'store']);
            Route::put('/{id}', [$c, 'update'])->whereNumber('id');
        });
    });

    // STOCK & EXPIRY settings (Core) — what happens to expired goods; admin / super_admin
    Route::middleware('role:admin,super_admin')->prefix('admin/stock/settings')->group(function () {
        Route::get('/',                [\App\Http\Controllers\Admin\StockSettingsController::class, 'show']);
        Route::put('/',                [\App\Http\Controllers\Admin\StockSettingsController::class, 'update']);
        Route::get('/targets',         [\App\Http\Controllers\Admin\StockSettingsController::class, 'targets']);
        Route::put('/overrides',       [\App\Http\Controllers\Admin\StockSettingsController::class, 'saveOverride']);
        Route::delete('/overrides/{id}', [\App\Http\Controllers\Admin\StockSettingsController::class, 'deleteOverride'])->whereNumber('id');
    });

    Route::middleware('role:admin,super_admin')->prefix('admin/backups')->group(function () {
        Route::get('/settings', [BackupController::class, 'settings']);
        Route::put('/settings',  [BackupController::class, 'updateSettings']);
        Route::get('/plan',      [BackupController::class, 'plan']);
        Route::get('/tables',    [BackupController::class, 'tables']);
        Route::post('/tables',   [BackupController::class, 'assignTables']);
        Route::get('/runs',      [BackupController::class, 'runs']);
        Route::post('/run',      [BackupController::class, 'run']);
        Route::post('/download', [BackupController::class, 'download']);
    });
    // Storefront navigation manager (admin/super_admin)
    Route::middleware('role:admin,super_admin')->prefix('admin/navigation')->group(function () {
        Route::get('/',        [\App\Http\Controllers\Admin\NavController::class, 'index']);
        Route::put('/{id}',    [\App\Http\Controllers\Admin\NavController::class, 'update']);
    });

    // BOOKS (vouchers, ledgers, reports) — finance roles; period control is super_admin
    Route::middleware('role:admin,super_admin,finance,manager')->prefix('admin/books')->group(function () {
        Route::get('/vouchers',                 [BooksVoucherController::class, 'index']);
        Route::get('/vouchers/{id}/customer-copy', [\App\Http\Controllers\Api\DocumentMailController::class, 'copy'])->whereNumber('id');
        Route::get('/mail/documents',           [\App\Http\Controllers\Api\DocumentMailController::class, 'documents']);
        Route::get('/mail/sent',                [\App\Http\Controllers\Api\DocumentMailController::class, 'sent']);
        Route::get('/movement/ledger-items',    [\App\Http\Controllers\Api\MovementReportController::class, 'ledgerItems']);
        Route::get('/movement/item-vouchers',   [\App\Http\Controllers\Api\MovementReportController::class, 'itemVouchers']);
        Route::get('/movement/item-ledgers',    [\App\Http\Controllers\Api\MovementReportController::class, 'itemLedgers']);
        Route::get('/movement/products',        [\App\Http\Controllers\Api\MovementReportController::class, 'products']);
        Route::get('/movement/money-flow',      [\App\Http\Controllers\Api\MovementReportController::class, 'moneyFlow']);
        Route::get('/vouchers/export',          [BooksVoucherController::class, 'exportList']);
        Route::get('/lookup',                   [BooksVoucherController::class, 'lookup']);
        Route::get('/products/{id}/variants',   [BooksVoucherController::class, 'productVariants']);
        Route::get('/stock-batches',            [BooksVoucherController::class, 'stockBatches']);
        Route::get('/vouchers/next-number',     [BooksVoucherController::class, 'nextNumber']);
        Route::get('/vouchers/entitlements', [BooksVoucherController::class, 'entitlements']);
        Route::get('/edit-log', [BooksVoucherController::class, 'editLog']);
            Route::get('/cheques', [BooksVoucherController::class, 'cheques']);
            Route::get('/cash', [BooksVoucherController::class, 'cash']);
            Route::get('/cash/counts', [BooksVoucherController::class, 'cashCounts']);
            Route::get('/customers/{customerId}/credits', [BooksVoucherController::class, 'customerCredits'])->whereNumber('customerId');
            Route::get('/ledgers/{ledgerId}/open-bills', [BooksVoucherController::class, 'openBills'])->whereNumber('ledgerId');
        Route::get('/vouchers/{id}/versions', [BooksVoucherController::class, 'versions'])->whereNumber('id');
        Route::get('/vouchers/{id}/returnable', [BooksVoucherController::class, 'returnable'])->whereNumber('id');
        Route::get('/vouchers/{id}/share', [BooksVoucherController::class, 'shareInfo'])->whereNumber('id');
        Route::get('/vouchers/check-supplier-invoice', [BooksVoucherController::class, 'checkSupplierInvoice']);
        Route::post('/vouchers/preview',        [BooksVoucherController::class, 'preview']);
        Route::get('/vouchers/{id}',            [BooksVoucherController::class, 'show']);
        Route::get('/vouchers/{id}/export',     [BooksVoucherController::class, 'export']);
        Route::get('/reports/{name}',           [BooksVoucherController::class, 'report']);
        Route::get('/dashboard/{tab}',          [\App\Http\Controllers\Api\BooksDashboardController::class, 'show']);
        Route::get('/credit/overview',          [CustomerAccountController::class, 'overview']);
        Route::get('/customer-accounts/{customerId}', [CustomerAccountController::class, 'show']);
        Route::get('/gift-vouchers',            [GiftVoucherController::class, 'index']);
        Route::get('/gift-vouchers/reconcile',  [GiftVoucherController::class, 'reconcile']);
        Route::get('/gift-vouchers/{id}',       [GiftVoucherController::class, 'show']);
        Route::get('/groups',                   [BooksMasterController::class, 'groups']);
        Route::get('/item-accounts',            [BooksMasterController::class, 'itemAccounts']);
        Route::get('/ledgers',                  [BooksMasterController::class, 'ledgers']);
        Route::get('/voucher-types',            [BooksMasterController::class, 'types']);
        Route::get('/payment-methods',          [BooksMasterController::class, 'paymentMethods']);
        Route::get('/settings',                 [BooksMasterController::class, 'settings']);
        Route::post('/series/preview',          [BooksMasterController::class, 'previewSeries']);

        Route::middleware('role:admin,super_admin,finance')->group(function () {
            Route::put('/customer-accounts/{customerId}/terms',     [CustomerAccountController::class, 'terms']);
            Route::post('/customer-accounts/{customerId}/adjust',   [CustomerAccountController::class, 'adjust']);
            Route::post('/customer-accounts/{customerId}/interest', [CustomerAccountController::class, 'interest']);
            Route::post('/gift-vouchers',              [GiftVoucherController::class, 'store']);
            Route::post('/gift-vouchers/{id}/cancel',  [GiftVoucherController::class, 'cancel']);
            Route::post('/gift-vouchers/expire-due',   [GiftVoucherController::class, 'expireDue']);
            Route::post('/reconciliation/loyalty-true-up', [BooksVoucherController::class, 'loyaltyTrueUp']);
            Route::post('/reconciliation/stock-refresh', [BooksVoucherController::class, 'stockRefresh']);
            Route::post('/vouchers',                [BooksVoucherController::class, 'store']);
            Route::put('/vouchers/{id}',            [BooksVoucherController::class, 'update']);
            Route::post('/vouchers/{id}/cancel',    [BooksVoucherController::class, 'cancel']);
            Route::post('/vouchers/{id}/refund-to-gift-voucher', [BooksVoucherController::class, 'refundToGiftVoucher']);
            Route::post('/vouchers/{id}/convert',   [BooksVoucherController::class, 'convert']);
            Route::post('/vouchers/{id}/return',    [BooksVoucherController::class, 'createReturn'])->whereNumber('id');
            Route::post('/vouchers/{id}/email',     [BooksVoucherController::class, 'emailDocument'])->whereNumber('id');
            Route::post('/vouchers/{id}/whatsapp',  [\App\Http\Controllers\Api\DocumentMailController::class, 'whatsapp'])->whereNumber('id');
            Route::post('/mail/send',               [\App\Http\Controllers\Api\DocumentMailController::class, 'send']);
            Route::post('/vouchers/{id}/receive',   [BooksVoucherController::class, 'receive']);
            Route::post('/cash/count', [BooksVoucherController::class, 'cashCount']);
            Route::post('/cash/hand-in', [BooksVoucherController::class, 'cashHandIn']);
            Route::post('/cheques/{id}/move',   [BooksVoucherController::class, 'chequeMove'])->whereNumber('id');
            Route::post('/cheques/{id}/bounce', [BooksVoucherController::class, 'chequeBounce'])->whereNumber('id');
            Route::post('/vouchers/{id}/write-off',   [BooksVoucherController::class, 'writeOff'])->whereNumber('id');
            Route::post('/ledgers/{ledgerId}/write-off', [BooksVoucherController::class, 'writeOffParty'])->whereNumber('ledgerId');
            Route::post('/vouchers/{id}/apply-credit',   [BooksVoucherController::class, 'applyCredit'])->whereNumber('id');
            Route::post('/vouchers/{id}/release-credit', [BooksVoucherController::class, 'releaseCredit'])->whereNumber('id');
            Route::post('/vouchers/{id}/request-payment', [BooksVoucherController::class, 'requestPayment']);
            Route::put('/item-accounts',            [BooksMasterController::class, 'updateItemAccounts']);
            Route::post('/groups',                  [BooksMasterController::class, 'storeGroup']);
            Route::put('/groups/{id}',              [BooksMasterController::class, 'updateGroup']);
            Route::delete('/groups/{id}',           [BooksMasterController::class, 'destroyGroup']);
            Route::post('/ledgers',                 [BooksMasterController::class, 'storeLedger']);
            Route::put('/ledgers/{id}',             [BooksMasterController::class, 'updateLedger']);
            Route::delete('/ledgers/{id}',          [BooksMasterController::class, 'destroyLedger']);
            Route::put('/voucher-types/{id}',       [BooksMasterController::class, 'updateType']);
            Route::post('/voucher-types/{typeId}/series', [BooksMasterController::class, 'storeSeries']);
            Route::put('/series/{id}',              [BooksMasterController::class, 'updateSeries']);
            Route::delete('/series/{id}',           [BooksMasterController::class, 'destroySeries']);
            Route::post('/payment-methods',         [BooksMasterController::class, 'storeMethod']);
            Route::put('/payment-methods/{id}',     [BooksMasterController::class, 'updateMethod']);
            Route::delete('/payment-methods/{id}',  [BooksMasterController::class, 'destroyMethod']);
            Route::post('/financial-years',         [BooksMasterController::class, 'storeYear']);
        });

        Route::middleware('role:super_admin')->group(function () {
            Route::put('/settings',                 [BooksMasterController::class, 'updateSettings']);
            Route::put('/company',                  [CompanyProfileController::class, 'update']);
            Route::post('/company/logo',            [CompanyProfileController::class, 'uploadLogo']);
            Route::delete('/company/logo',          [CompanyProfileController::class, 'removeLogo']);
            Route::put('/edit-limits',              [BooksMasterController::class, 'saveEditLimits']);
            Route::post('/financial-years/{id}/close', [BooksMasterController::class, 'closeYear']);
        });
    });

    // Branches / multi-location (Core) — admin/super_admin
    Route::middleware('role:admin,super_admin')->prefix('admin/locations')->group(function () {
        Route::get('/',                 [LocationController::class, 'index']);
        Route::get('/options',          [LocationController::class, 'formOptions']);
        Route::post('/',                [LocationController::class, 'store']);
        Route::get('/{id}',             [LocationController::class, 'show']);
        Route::put('/{id}',             [LocationController::class, 'update']);
        Route::delete('/{id}',          [LocationController::class, 'destroy']);
        Route::patch('/{id}/default',   [LocationController::class, 'setDefault']);
    });

    Route::middleware('role:super_admin')->prefix('admin/backups')->group(function () {
        Route::get('/restore/files',   [BackupController::class, 'restoreFiles']);
        Route::post('/restore/upload', [BackupController::class, 'restoreUpload']);
        Route::post('/restore/pull',   [BackupController::class, 'restorePull']);
    });

    // ============================================
    // CUSTOMER ROUTES
    // ============================================
    Route::middleware('role:customer')->prefix('customer')->group(function () {
        // Customer Profile & Settings
        Route::get('/profile', [CustomerController::class, 'profile']);
        Route::put('/profile', [CustomerController::class, 'updateProfile']);
        Route::post('/profile/upload-image', [CustomerController::class, 'uploadCustomerImage']);

        Route::prefix('bug-reports')->group(function () {
            Route::get('/',      [BugReportController::class, 'customerIndex']);
            Route::get('/{id}',  [BugReportController::class, 'customerShow']);
        });

        // Customer sync
        Route::get('cart',            [CustomerSyncController::class, 'getCart']);
        Route::post('cart/sync',      [CustomerSyncController::class, 'syncCart']);

        Route::get('wishlist',        [CustomerSyncController::class, 'getWishlist']);
        Route::post('wishlist/sync',  [CustomerSyncController::class, 'syncWishlist']);

        Route::get('quote-list',      [CustomerSyncController::class, 'getQuoteList']);
        Route::post('quote-list/sync',[CustomerSyncController::class, 'syncQuoteList']);

        Route::get('note', [CustomerSyncController::class, 'getNote']);
        Route::post('note/sync', [CustomerSyncController::class, 'syncNote']);
        Route::delete('note', [CustomerSyncController::class, 'clearNote']);

        Route::delete('cart', [CustomerSyncController::class, 'clearCart']);
        Route::delete('wishlist', [CustomerSyncController::class, 'clearWishlist']);
        Route::delete('quote-list', [CustomerSyncController::class, 'clearQuoteList']);
        
        // My account: what I owe, what I have paid over, how to pay
        Route::get('/account', [\App\Http\Controllers\Api\MyAccountController::class, 'show']);
        Route::get('/account/statement/export', [\App\Http\Controllers\Api\MyAccountController::class, 'statementExport']);
        Route::get('/account/outstandings/export', [\App\Http\Controllers\Api\MyAccountController::class, 'outstandingsExport']);
        Route::get('/account/documents', [\App\Http\Controllers\Api\MyAccountController::class, 'documents']);
        Route::get('/account/documents/{id}/download', [\App\Http\Controllers\Api\MyAccountController::class, 'documentDownload'])->whereNumber('id');

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
        
        // Checkout on the books — cart in, Sales Order (and Cash Sale when paid) out
        Route::prefix('checkout')->group(function () {
            Route::get('/attempts/{id}', [CheckoutController::class, 'attempt']);
            Route::post('/orders/{id}/pay', [CheckoutController::class, 'payOrder']);
        });
        Route::get('/gift-vouchers', [GiftVoucherController::class, 'mine']);
        Route::get('/wallet', [\App\Http\Controllers\Api\CustomerWalletController::class, 'show']);
        Route::prefix('sales-orders')->group(function () {
            Route::get('/', [CheckoutController::class, 'orders']);
            Route::get('/{id}', [CheckoutController::class, 'order']);
            Route::put('/{id}', [CheckoutController::class, 'updateOrder']);
            Route::post('/{id}/cancel', [CheckoutController::class, 'cancelOrder']);
            Route::post('/documents/{id}/review', [CheckoutController::class, 'reviewDocument']);
        });

        Route::get('/payments/order/{orderId}', [PaymentController::class, 'customerOrderPayments']);

        // ── Customer hamper routes (auth required) ────────────────────────────────────
        Route::prefix('hampers')->middleware('module:ecommerce')->group(function () {
            Route::get('/',                              [PublicHamperController::class, 'index']);
            Route::get('/{slug}',                       [PublicHamperController::class, 'show']);
        });

        // A customer's order or quotation number -> its id (the pages show the number in the address, never the id)
        Route::get('/document-ref', [\App\Http\Controllers\Api\CustomerDocumentRefController::class, 'resolve']);

        // Quotations (Customer) — priced quotes for a request, accept / decline / ask for changes
        Route::prefix('quotations')->group(function () {
            Route::get('/', [QuotationController::class, 'myIndex']);
            Route::post('/', [QuotationController::class, 'request']);
            Route::get('/{id}', [QuotationController::class, 'myShow']);
            Route::post('/{id}/accept', [QuotationController::class, 'accept']);
            Route::post('/{id}/decline', [QuotationController::class, 'decline']);
            Route::post('/{id}/revision', [QuotationController::class, 'revision']);
        });

        Route::prefix('projects')->middleware('module:projects')->group(function () {
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


        Route::prefix('tickets')->group(function () {
            Route::get('/',            [TicketController::class, 'myTickets']);
            Route::post('/',           [TicketController::class, 'store']);
            Route::get('/{id}',        [TicketController::class, 'customerShow']);
            Route::post('/{id}/reply', [TicketController::class, 'customerReply']);
            Route::post('/{id}/close', [TicketController::class, 'customerClose']);
        });
        // ── Credit Account (Customer — read only) ───────────────
        Route::prefix('credit')->group(function () {
            Route::get('/summary',          [CustomerCreditCustomerController::class, 'summary']);
            Route::get('/statement',        [CustomerCreditCustomerController::class, 'statement']);
            Route::get('/invoices',         [CustomerCreditCustomerController::class, 'invoices']);
            Route::get('/invoices/{inv}',   [CustomerCreditCustomerController::class, 'showInvoice']);
            Route::get('/schedules',        [CustomerCreditCustomerController::class, 'schedules']);
        });

        // ── DELIVERY — CUSTOMER ────────────────────────────────────────────────────
        Route::prefix('delivery')->middleware('module:extras')->group(function () {
            // The manifest carrying their goods while it is on the road
            Route::get('/enroute',                    [CustomerEnrouteController::class, 'index']);
            Route::get('/enroute/{manifestId}',       [CustomerEnrouteController::class, 'show'])->whereNumber('manifestId');

            // Track shipment for their order
            Route::get('/orders/{orderId}/shipment', [OrderShipmentController::class, 'showForOrder']);
            Route::get('/orders/{orderId}/pings',    [OrderShipmentController::class, 'getLivePings']);
            Route::get('/orders/{orderId}/driver-rating', [DeliveryRatingController::class, 'driverRatingForOrder']);
            Route::get('/orders/{orderId}/tracking', [DeliveryRouteController::class, 'getCustomerTracking']);

            // Rate a delivery after it's completed
            Route::post('/ratings', [DeliveryRatingController::class, 'store']);

            // File an incident (e.g. rude driver)
            Route::post('/incidents', [DeliveryIncidentController::class, 'store']);

            // View their own ratings & incidents history
            Route::get('/my-ratings', [DeliveryRatingController::class, 'myRatings']);
            Route::get('/my-incidents', [DeliveryIncidentController::class, 'myIncidentsCustomer']);
        });
    });

    // ============================================
    // DRIVER ROUTES
    // ============================================
    Route::middleware('role:driver')->prefix('driver')->middleware('module:extras')->group(function () {

        // The driver's own payslips (their own only, approved or paid runs)
        Route::get('/my-payslips',          [\App\Http\Controllers\Api\MyPayslipController::class, 'index']);
        Route::get('/my-payslips/{runId}',  [\App\Http\Controllers\Api\MyPayslipController::class, 'show'])->whereNumber('runId');

        // Manifests assigned to this driver
        Route::prefix('manifests')->group(function () {
            Route::get('/',           [DriverManifestController::class, 'index']);
            Route::get('/{id}',       [DriverManifestController::class, 'show']);
            Route::post('/{id}/start',[DriverManifestController::class, 'startTrip']);
            Route::get('/{id}/route', [DeliveryRouteController::class, 'getDriverRoute']);
            Route::get('/{id}/pings', [DriverManifestController::class, 'myPings']);
            Route::post('/{id}/route/optimize', [DeliveryRouteController::class, 'driverOptimizeRoute']);
            Route::post('/{id}/route/reorder', [DeliveryRouteController::class, 'reorderStops']);
            Route::post('/{id}/stops/{itemId}/skip', [DeliveryRouteController::class, 'skipStop']);
        });
        
        Route::post('incidents', [DeliveryIncidentController::class, 'storeDriverIncident']);

        // GPS ping — throttled: 240/min ceiling (1 per 15s normal cadence)
        Route::post('/ping', [DriverManifestController::class, 'ping'])
            ->middleware('throttle:240,1');

        // Stop management
        Route::post('/stops/{itemId}/update', [DriverManifestController::class, 'updateStop']);
        Route::post('/stops/{itemId}/update-proof', [DriverManifestController::class, 'updateProof']);
        Route::post('/stops/{itemId}/retry',  [DriverManifestController::class, 'retryStop']);

        // Driver's own ratings
        Route::get('/ratings', [DriverManifestController::class, 'myRatings']);
        Route::get('/my-rating-summary', [DeliveryRatingController::class, 'myRatingSummary']);

        // Incidents filed against the driver that they're allowed to see
        Route::get('/incidents', [DeliveryIncidentController::class, 'myIncidents']);
    });

    // ============================================
    // ADMIN/MANAGER/SALES REP ROUTES
    // ============================================
    // Staff area. Drivers are not here: their app uses /driver/* only.
    Route::middleware('role:admin,super_admin,manager,finance,logistics,sales_rep')->prefix('admin')->group(function () {

        // Boards, staff side (the Campaigns module): builders see their own; publishers see all and decide approvals
        Route::prefix('boards')->middleware('module:campaigns')->group(function () {
            $c = \App\Http\Controllers\Api\CampaignBoardController::class;
            Route::get('/',                      [$c, 'index']);
            Route::post('/',                     [$c, 'store']);
            Route::get('/{id}',                  [$c, 'show'])->whereNumber('id');
            Route::get('/{id}/views',            [$c, 'views'])->whereNumber('id');
            Route::put('/{id}',                  [$c, 'update'])->whereNumber('id');
            Route::post('/{id}/pins',            [$c, 'addPins'])->whereNumber('id');
            Route::put('/{id}/pins/order',       [$c, 'reorder'])->whereNumber('id');
            Route::delete('/{id}/pins/{pinId}',  [$c, 'removePin'])->whereNumber('id')->whereNumber('pinId');
            Route::post('/{id}/submit',          [$c, 'submit'])->whereNumber('id');
            Route::post('/{id}/withdraw',        [$c, 'withdraw'])->whereNumber('id');
            Route::post('/{id}/approve',         [$c, 'approve'])->whereNumber('id');
            Route::post('/{id}/reject',          [$c, 'reject'])->whereNumber('id');
            Route::post('/{id}/hide',            [$c, 'hide'])->whereNumber('id');
            Route::post('/{id}/unhide',          [$c, 'unhide'])->whereNumber('id');
            Route::delete('/{id}',               [$c, 'destroy'])->whereNumber('id');
            Route::post('/{id}/restore',         [$c, 'restore'])->whereNumber('id');
            Route::delete('/{id}/purge',         [$c, 'purge'])->whereNumber('id');
        });

        Route::prefix('moodboards')->middleware('module:campaigns')->group(function () {
            $c = \App\Http\Controllers\Api\CampaignMoodboardController::class;
            Route::get('/presets', [$c,'presets']);
            Route::get('/', [$c,'index']); Route::post('/', [$c,'store']);
            Route::get('/{id}', [$c,'show'])->whereNumber('id'); Route::put('/{id}', [$c,'update'])->whereNumber('id'); Route::delete('/{id}', [$c,'destroy'])->whereNumber('id');
            Route::post('/{id}/template', [$c,'saveTemplate'])->whereNumber('id');
            Route::post('/{id}/restore', [$c,'restore'])->whereNumber('id'); Route::delete('/{id}/purge', [$c,'purge'])->whereNumber('id'); Route::get('/{id}/views', [$c,'views'])->whereNumber('id');
            foreach (['submit','withdraw','approve','reject','hide','unhide'] as $a) { Route::post("/{id}/$a", [$c,$a])->whereNumber('id'); }
        });

        // Engagement Engine settings (Extras): admin and super admin, checked in the controller
        Route::prefix('engagement')->middleware('module:extras')->group(function () {
            $c = \App\Http\Controllers\Api\EngagementSettingsController::class;
            Route::get('/settings', [$c, 'show']);
            Route::put('/settings', [$c, 'update']);
            Route::post('/preset',  [$c, 'preset']);
            $m = \App\Http\Controllers\Api\EngagementModerationController::class;
            Route::get('/posts', [$m, 'index']);
            Route::post('/posts/{id}/approve', [$m, 'approve'])->whereNumber('id');
            Route::post('/posts/{id}/hide',    [$m, 'hide'])->whereNumber('id');
            Route::post('/posts/{id}/remove',  [$m, 'remove'])->whereNumber('id');
            Route::get('/top', [$m, 'top']);
            Route::get('/reports', [$m, 'reportCases']);
            Route::post('/reports/decide', [$m, 'decideReport']);
        });

        // The pin library (the Campaigns module): builders make pins and change their own; hiding is for admin, super admin and manager
        Route::prefix('pins')->middleware('module:campaigns')->group(function () {
            $c = \App\Http\Controllers\Api\CampaignPinController::class;
            Route::get('/',                [$c, 'index']);
            Route::post('/',               [$c, 'store']);
            Route::put('/{id}',            [$c, 'update'])->whereNumber('id');
            Route::post('/{id}/media',     [$c, 'media'])->whereNumber('id');
            Route::post('/{id}/hide',      [$c, 'hide'])->whereNumber('id');
            Route::post('/{id}/unhide',    [$c, 'unhide'])->whereNumber('id');
            Route::delete('/{id}',         [$c, 'destroy'])->whereNumber('id');
            Route::post('/{id}/restore',   [$c, 'restore'])->whereNumber('id');
            Route::delete('/{id}/purge',   [$c, 'purge'])->whereNumber('id');
        });

        // Campaigns (the Campaigns module): builders see their own; publishing is for admin, super admin and manager (checked in the controller)
        Route::prefix('campaigns')->middleware('module:campaigns')->group(function () {
            $c = \App\Http\Controllers\Api\CampaignController::class;
            Route::get('/types',            [$c, 'types']);
            Route::get('/catalogue',        [$c, 'catalogue']);
            Route::get('/world-options',    [$c, 'worldOptions']);
            Route::get('/',                 [$c, 'index']);
            Route::post('/',                [$c, 'store']);
            Route::get('/{id}',             [$c, 'show'])->whereNumber('id');
            Route::get('/{id}/numbers',     [$c, 'numbers'])->whereNumber('id');
            Route::put('/{id}',             [$c, 'update'])->whereNumber('id');
            Route::put('/{id}/page',        [$c, 'savePage'])->whereNumber('id');
            Route::post('/{id}/media',      [$c, 'uploadMedia'])->whereNumber('id');
            Route::post('/{id}/cover',      [$c, 'uploadCover'])->whereNumber('id');
            Route::delete('/{id}/cover',    [$c, 'removeCover'])->whereNumber('id');
            Route::post('/{id}/submit',     [$c, 'submit'])->whereNumber('id');
            Route::post('/{id}/withdraw',   [$c, 'withdraw'])->whereNumber('id');
            Route::post('/{id}/approve',    [$c, 'approve'])->whereNumber('id');
            Route::post('/{id}/reject',     [$c, 'reject'])->whereNumber('id');
            Route::post('/{id}/publish',    [$c, 'publish'])->whereNumber('id');
            Route::post('/{id}/unpublish',  [$c, 'unpublish'])->whereNumber('id');
            Route::post('/{id}/pause',      [$c, 'pause'])->whereNumber('id');
            Route::post('/{id}/archive',    [$c, 'archive'])->whereNumber('id');
            Route::delete('/{id}',          [$c, 'destroy'])->whereNumber('id');
        });

        // The merged activity timeline: every log on the site, each only to the roles allowed to see it
        Route::get('/activity-feed', [\App\Http\Controllers\Api\ActivityFeedController::class, 'index']);

        // All auction activity across auctions (the Activity logs > Auctions tab)
        Route::get('/auction-orders/activity', [AuctionController::class, 'globalActivityLog'])->middleware('module:ecommerce');
        // Dashboard
        // Route::get('/dashboard', [AdminController::class, 'dashboard']);

        
        Route::get('/users', [AuthController::class, 'getAdminUsers']);
      
        Route::get('/customers/{customerId}/orders', [OrderController::class, 'adminCustomerOrders']);
        // Products Management
        Route::prefix('products')->middleware('module:ecommerce')->group(function () {
            Route::post('/', [ProductController::class, 'store']);
            Route::get('/next-sku', [ProductController::class, 'nextSku']);
            Route::get('/', [ProductController::class, 'adminIndex']);
            Route::get('/trash', [ProductController::class, 'trashIndex']); // trashed products list
            Route::post('/restore-multiple', [ProductController::class, 'restoreMultiple']); // bulk restore
            Route::post('/force-delete-multiple', [ProductController::class, 'forceDeleteMultiple'])->middleware('role:admin,super_admin,manager'); // bulk permanent delete

            Route::post('/bulk-update-flags', [ProductController::class, 'bulkUpdateFlags']);
            Route::post('/bulk-update-status', [ProductController::class, 'bulkUpdateStatus']);

            Route::get('/{id}', [ProductController::class, 'adminShow']); 
            Route::put('/{id}', [ProductController::class, 'update']);
            Route::post('/{id}/bulk-update', [ProductController::class, 'bulkUpdate']);
            Route::delete('/{id}', [ProductController::class, 'destroy'])->middleware('role:admin,super_admin,manager');
            Route::post('/{id}/restore', [ProductController::class, 'restore']); // restore single
            Route::delete('/{id}/force', [ProductController::class, 'forceDelete'])->middleware('role:admin,super_admin,manager'); // permanent delete single
            Route::put('/{id}/stock', [ProductController::class, 'updateStock']);
            // Per-branch stock + price grid (multi-location)
            Route::get('/{id}/branch-stock', [ProductController::class, 'branchStock']);
            Route::put('/{id}/branch-stock', [ProductController::class, 'saveBranchStock']);

            // Options / values / variants / units / images — nested under the existing
            // products/{id} pattern, same style as {id}/addresses.
            Route::prefix('{id}/options')->group(function () {
                Route::get('/', [ProductVariantController::class, 'adminIndexOptions']);
                Route::post('/', [ProductVariantController::class, 'adminStoreOption']);
                Route::put('/{optionId}', [ProductVariantController::class, 'adminUpdateOption']);
                Route::delete('/{optionId}', [ProductVariantController::class, 'adminDestroyOption'])->middleware('role:admin,super_admin,manager');

                Route::post('/{optionId}/values', [ProductVariantController::class, 'adminStoreOptionValue']);
                Route::put('/{optionId}/values/{valueId}', [ProductVariantController::class, 'adminUpdateOptionValue']);
                Route::delete('/{optionId}/values/{valueId}', [ProductVariantController::class, 'adminDestroyOptionValue'])->middleware('role:admin,super_admin,manager');
            });

            Route::prefix('{id}/variants')->group(function () {
                Route::get('/', [ProductVariantController::class, 'adminIndexVariants']);
                Route::post('/', [ProductVariantController::class, 'adminStoreVariant']);
                Route::get('/{variantId}', [ProductVariantController::class, 'adminShowVariant']);
                Route::put('/{variantId}', [ProductVariantController::class, 'adminUpdateVariant']);
                Route::delete('/{variantId}', [ProductVariantController::class, 'adminDestroyVariant'])->middleware('role:admin,super_admin,manager');
                Route::post('/{variantId}/set-default', [ProductVariantController::class, 'adminSetDefaultVariant']);
            });

            Route::prefix('{id}/images')->group(function () {
                Route::get('/', [ProductVariantController::class, 'adminIndexImages']);
                Route::post('/', [ProductVariantController::class, 'adminStoreImage']);
                Route::post('/{imageId}/set-primary', [ProductVariantController::class, 'adminSetPrimaryImage']);
            });
        });

        Route::prefix('images')->group(function () {
            Route::put('/{imageId}', [ProductVariantController::class, 'adminUpdateImage']);
            Route::delete('/{imageId}', [ProductVariantController::class, 'adminDestroyImage'])->middleware('role:admin,super_admin,manager');
        });

        Route::prefix('variants/{variantId}/units')->group(function () {
            Route::get('/', [ProductVariantController::class, 'adminIndexUnits']);
            Route::post('/', [ProductVariantController::class, 'adminStoreUnit']);
        });

        Route::prefix('variant-units')->group(function () {
            Route::put('/{unitId}', [ProductVariantController::class, 'adminUpdateUnit']);
            Route::delete('/{unitId}', [ProductVariantController::class, 'adminDestroyUnit'])->middleware('role:admin,super_admin,manager');
        });

        // Units of measure
        Route::prefix('units-of-measure')->group(function () {
            Route::get('/', [UnitOfMeasureController::class, 'adminIndex']);
            Route::post('/', [UnitOfMeasureController::class, 'adminStore']);
            Route::get('/convert', [UnitOfMeasureController::class, 'convert']); // must sit above /{id}
            Route::get('/{id}', [UnitOfMeasureController::class, 'adminShow']);
            Route::put('/{id}', [UnitOfMeasureController::class, 'adminUpdate']);
            Route::delete('/{id}', [UnitOfMeasureController::class, 'adminDestroy']);
        });

        Route::prefix('unit-locale-defaults')->group(function () {
            Route::get('/', [UnitOfMeasureController::class, 'adminIndexLocaleDefaults']);
            Route::post('/', [UnitOfMeasureController::class, 'adminStoreLocaleDefault']);
            Route::delete('/{id}', [UnitOfMeasureController::class, 'adminDestroyLocaleDefault']);
        });

        // Admin Auction Management
        Route::prefix('auctions')->middleware('module:ecommerce')->group(function () {
            Route::post('/', [AuctionController::class, 'store']);
            Route::get('/', [AuctionController::class, 'adminIndex']);
            Route::get('/trashed', [AuctionController::class, 'trashed']);
            Route::get('/charge-options', [AuctionController::class, 'chargeOptions']);
            Route::get('/{auction}/quote', [AuctionController::class, 'chargeQuote']);
            Route::get('/{auction}/registrations', [AuctionController::class, 'registrations']);
            Route::post('/{auction}/release-deposits', [AuctionController::class, 'releaseDeposits']);
            Route::get('/{auction}', [AuctionController::class, 'adminShow']);
            Route::put('/{auction}', [AuctionController::class, 'update']);
            Route::post('/{auction}/create-order', [AuctionController::class, 'createOrder']);
            Route::post('/{auction}/close', [AuctionController::class, 'closeNow']);
            Route::delete('/{auction}', [AuctionController::class, 'destroy']);
            Route::post('/{id}/restore', [AuctionController::class, 'restore']);  // ← new
            Route::delete('/{id}/force', [AuctionController::class, 'forceDestroy']); 
            // Auction activity log
            Route::get('/{auction}/activity', [AuctionController::class, 'auctionActivityLog']);
        });


        // Categories Management
        Route::prefix('categories')->middleware('module:ecommerce')->group(function () {
            Route::post('/', [CategoryController::class, 'store']);
            Route::put('/{id}', [CategoryController::class, 'update']);
            Route::delete('/{id}', [CategoryController::class, 'destroy'])->middleware('role:admin,super_admin,manager');
        });

        // Brands Management
        Route::prefix('brands')->middleware('module:ecommerce')->group(function () {
            Route::get('/', [BrandController::class, 'adminIndex']);
            Route::get('/{id}', [BrandController::class, 'show']); 
            Route::post('/', [BrandController::class, 'store']);
            Route::put('/{id}', [BrandController::class, 'update']);
            Route::delete('/{id}', [BrandController::class, 'destroy'])->middleware('role:admin,super_admin,manager');
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
            Route::post('/{id}/add-credit', [CustomerController::class, 'addCredit'])->middleware('role:finance,manager,admin,super_admin');
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

            // ── Credit Account (Admin) ──────────────────────────────
            // Any staff role can view; only finance, manager, admin, super_admin can act.
            Route::prefix('/{id}/credit')->group(function () {
                Route::get('/summary',                              [CustomerCreditController::class, 'summary']);
                Route::get('/statement',                            [CustomerCreditController::class, 'statement']);
                Route::post('/payment',                             [CustomerCreditController::class, 'recordPayment'])->middleware('role:finance,manager,admin,super_admin');
                Route::post('/adjustment',                          [CustomerCreditController::class, 'adjustment'])->middleware('role:finance,manager,admin,super_admin');
                Route::post('/interest',                            [CustomerCreditController::class, 'applyInterest'])->middleware('role:finance,manager,admin,super_admin');

                // Schedules
                Route::get('/schedules',                            [CustomerCreditController::class, 'schedules']);
                Route::post('/schedules',                           [CustomerCreditController::class, 'createSchedule'])->middleware('role:finance,manager,admin,super_admin');
                Route::get('/schedules/{sid}',                      [CustomerCreditController::class, 'showSchedule']);
                Route::patch('/schedules/{sid}/cancel',             [CustomerCreditController::class, 'cancelSchedule'])->middleware('role:finance,manager,admin,super_admin');
                Route::patch('/schedules/{sid}/items/{iid}/pay',    [CustomerCreditController::class, 'payInstallment'])->middleware('role:finance,manager,admin,super_admin');
                Route::patch('/schedules/{sid}/items/{iid}/waive',  [CustomerCreditController::class, 'waiveInstallment'])->middleware('role:finance,manager,admin,super_admin');

                // Invoices
                Route::get('/invoices',                             [CustomerCreditController::class, 'invoices']);
                Route::post('/invoices',                            [CustomerCreditController::class, 'createInvoice'])->middleware('role:finance,manager,admin,super_admin');
                Route::get('/invoices/{inv}',                       [CustomerCreditController::class, 'showInvoice']);
                Route::patch('/invoices/{inv}/status',              [CustomerCreditController::class, 'updateInvoiceStatus'])->middleware('role:finance,manager,admin,super_admin');
                Route::post('/invoices/{inv}/send',                 [CustomerCreditController::class, 'sendInvoice'])->middleware('role:finance,manager,admin,super_admin');
            });
        });

        // Services Management
        Route::prefix('services')->middleware('module:ecommerce')->group(function () {
            Route::get('/', [ServiceController::class, 'adminIndex']);
            Route::post('/', [ServiceController::class, 'store']);
            Route::get('/next-sku', [ServiceController::class, 'nextSku']);
            Route::get('/trash', [ServiceController::class, 'trash']);
            Route::post('/restore-multiple', [ServiceController::class, 'restoreMultiple']);
            Route::post('/force-delete-multiple', [ServiceController::class, 'forceDeleteMultiple'])->middleware('role:admin,super_admin,manager');
            Route::get('/statistics', [ServiceController::class, 'statistics']);
            Route::get('/available', [ServiceController::class, 'getAvailableServices']); 
            Route::get('/products/available', [ServiceController::class, 'getAvailableProducts']); 
            Route::get('/{id}', [ServiceController::class, 'adminShow']);
            Route::put('/{id}', [ServiceController::class, 'update']);
            Route::delete('/{id}', [ServiceController::class, 'destroy'])->middleware('role:admin,super_admin,manager');
            Route::post('/{id}/restore', [ServiceController::class, 'restore']);
            Route::post('/{id}/publish', [ServiceController::class, 'publish']);
            Route::post('/{id}/unpublish', [ServiceController::class, 'unpublish']);

            // Options, packages (variants) and requirements
            Route::get('/{id}/catalog',                                   [ServiceCatalogController::class, 'adminCatalog']);
            Route::post('/{id}/options',                                  [ServiceCatalogController::class, 'storeOption']);
            Route::put('/{id}/options/{optionId}',                        [ServiceCatalogController::class, 'updateOption']);
            Route::delete('/{id}/options/{optionId}',                     [ServiceCatalogController::class, 'destroyOption']);
            Route::post('/{id}/options/{optionId}/values',                [ServiceCatalogController::class, 'storeOptionValue']);
            Route::put('/{id}/options/{optionId}/values/{valueId}',       [ServiceCatalogController::class, 'updateOptionValue']);
            Route::delete('/{id}/options/{optionId}/values/{valueId}',    [ServiceCatalogController::class, 'destroyOptionValue']);
            Route::post('/{id}/variants/generate',                        [ServiceCatalogController::class, 'generateVariants']);
            Route::post('/{id}/variants',                                 [ServiceCatalogController::class, 'storeVariant']);
            Route::put('/{id}/variants/{variantId}',                      [ServiceCatalogController::class, 'updateVariant']);
            Route::put('/{id}/variants/{variantId}/materials',            [ServiceCatalogController::class, 'saveMaterials']);
            Route::put('/{id}/fees',                                      [ServiceCatalogController::class, 'saveFees']);
            Route::delete('/{id}/variants/{variantId}',                   [ServiceCatalogController::class, 'destroyVariant']);
            Route::post('/{id}/requirements',                             [ServiceCatalogController::class, 'storeRequirement']);
            Route::put('/{id}/requirements/{requirementId}',              [ServiceCatalogController::class, 'updateRequirement']);
            Route::delete('/{id}/requirements/{requirementId}',           [ServiceCatalogController::class, 'destroyRequirement']);
        });

        // Calendar: mine, the team's, and the subscription link
        Route::prefix('calendar')->group(function () {
            $c = \App\Http\Controllers\Api\CalendarController::class;
            Route::get('/',                     [$c, 'mine']);
            Route::get('/team',                 [$c, 'team']);
            Route::get('/subscription',         [$c, 'subscription']);
            Route::post('/subscription/rotate', [$c, 'rotate']);
        });

        // Verification: the verifier's register and statuses (any staff; the service checks what is theirs) and the set-up (admin, finance)
        Route::prefix('verification')->group(function () {
            $c = \App\Http\Controllers\Api\VerificationController::class;
            Route::get('/',                          [$c, 'index']);
            Route::get('/items',                     [$c, 'items']);
            Route::get('/pick-list',                 [$c, 'pickList']);
            Route::get('/report',                    [$c, 'report']);
            Route::get('/report/vouchers',           [$c, 'reportType']);
            Route::get('/items/{id}',                [$c, 'show'])->whereNumber('id');
            Route::post('/items/{id}/mark',          [$c, 'mark'])->whereNumber('id');
            Route::post('/items/{id}/pick',          [$c, 'pick'])->whereNumber('id');
            Route::get('/config',                    [$c, 'config']);
            Route::post('/assignments',              [$c, 'saveAssignment']);
            Route::put('/assignments/{id}',          [$c, 'saveAssignment'])->whereNumber('id');
            Route::delete('/assignments/{id}',       [$c, 'deleteAssignment'])->whereNumber('id');
            Route::put('/settings',                  [$c, 'saveSettings']);
        });

        // My payslips: any staff member, their own only
        Route::get('/my-payslips',                [\App\Http\Controllers\Api\MyPayslipController::class, 'index']);
        Route::get('/my-payslips/{runId}',        [\App\Http\Controllers\Api\MyPayslipController::class, 'show'])->whereNumber('runId');

        // Payroll: runs, payslips, and the editable components (super admin and finance only)
        Route::prefix('payroll')->middleware('role:super_admin,finance')->group(function () {
            $c = \App\Http\Controllers\Api\PayrollController::class;
            Route::get('/',                          [$c, 'index']);
            Route::post('/runs',                     [$c, 'create']);
            Route::get('/runs/{id}',                 [$c, 'show'])->whereNumber('id');
            Route::post('/runs/{id}/refresh',        [$c, 'refresh'])->whereNumber('id');
            Route::post('/runs/{id}/adjust',         [$c, 'adjust'])->whereNumber('id');
            Route::post('/runs/{id}/approve',        [$c, 'approve'])->whereNumber('id');
            Route::post('/runs/{id}/pay',            [$c, 'pay'])->whereNumber('id');
            Route::post('/runs/{id}/cancel',         [$c, 'cancel'])->whereNumber('id');
            Route::get('/runs/{id}/csv',             [$c, 'csv'])->whereNumber('id');
            Route::get('/gratuity',                  [$c, 'gratuity']);
            Route::get('/settings',                  [$c, 'settings']);
            Route::put('/settings',                  [$c, 'saveSettings']);
            Route::post('/components',               [$c, 'saveComponent']);
            Route::put('/components/{id}',           [$c, 'saveComponent'])->whereNumber('id');
            Route::delete('/components/{id}',        [$c, 'deleteComponent'])->whereNumber('id');
            Route::put('/items/{userId}',            [$c, 'saveItems'])->whereNumber('userId');
        });

        // Attendance: sign in/out, the staff calendar, marking and verifying, disputes (the service decides who may do what)
        Route::prefix('attendance')->group(function () {
            $c = \App\Http\Controllers\Api\AttendanceController::class;
            Route::get('/',                   [$c, 'index']);
            Route::get('/day',                [$c, 'day']);
            Route::post('/sign-in',           [$c, 'signIn']);
            Route::post('/sign-out',          [$c, 'signOut']);
            Route::post('/mark',              [$c, 'mark']);
            Route::post('/accept-inferred',   [$c, 'acceptInferred']);
            Route::post('/verify',            [$c, 'verify']);
            Route::post('/verify-month',      [$c, 'verifyMonth']);
            Route::post('/disputes',          [$c, 'dispute']);
            Route::post('/disputes/{id}/resolve', [$c, 'resolve'])->whereNumber('id');
            Route::get('/config',             [$c, 'config']);
            Route::put('/settings',           [$c, 'saveSettings']);
            Route::put('/markers/{staffId}',  [$c, 'saveMarkers'])->whereNumber('staffId');
        });

        // Petty cash: the boxes, spending with a receipt, top-ups to the float (a custodian or finance; the controller decides who may do what)
        Route::prefix('petty-cash')->group(function () {
            $c = \App\Http\Controllers\Api\PettyCashController::class;
            Route::get('/',              [$c, 'index']);
            Route::get('/options',       [$c, 'options']);
            Route::post('/spend',        [$c, 'spend']);
            Route::post('/spend/{id}/cancel', [$c, 'cancel'])->whereNumber('id');
            Route::post('/top-up',       [$c, 'topUp']);
            Route::put('/float',         [$c, 'setFloat']);
        });

        // Bookings: the list, a new booking for a customer, and what happens to one
        Route::prefix('bookings')->group(function () {
            $c = \App\Http\Controllers\Api\BookingController::class;
            Route::get('/',                    [$c, 'index']);
            Route::get('/options',             [$c, 'options']);
            Route::get('/slots',               [$c, 'slots']);
            Route::post('/quote',              [$c, 'quote']);
            Route::post('/',                   [$c, 'store']);
            Route::get('/{id}',                [$c, 'show'])->whereNumber('id');
            Route::post('/{id}/reschedule',    [$c, 'reschedule'])->whereNumber('id');
            Route::post('/{id}/cancel',        [$c, 'cancel'])->whereNumber('id');
            Route::post('/{id}/no-show',       [$c, 'noShow'])->whereNumber('id');
            Route::post('/{id}/complete',      [$c, 'complete'])->whereNumber('id');
            Route::get('/{id}/notice',         [$c, 'notice'])->whereNumber('id');
            Route::post('/{id}/email',         [$c, 'email'])->whereNumber('id');
        });

        // Staff, rooms, tables and equipment that can be booked
        Route::prefix('resources')->middleware('role:admin,super_admin,manager')->group(function () {
            $c = \App\Http\Controllers\Api\BookableResourceController::class;
            Route::get('/',                          [$c, 'index']);
            Route::post('/',                         [$c, 'store']);
            Route::put('/{id}',                      [$c, 'update'])->whereNumber('id');
            Route::delete('/{id}',                   [$c, 'destroy'])->whereNumber('id');
            Route::put('/{id}/hours',                [$c, 'saveHours'])->whereNumber('id');
            Route::post('/{id}/time-off',            [$c, 'addTimeOff'])->whereNumber('id');
            Route::delete('/{id}/time-off/{offId}',  [$c, 'removeTimeOff'])->whereNumber('id')->whereNumber('offId');
            Route::put('/{id}/services',             [$c, 'saveServices'])->whereNumber('id');
            Route::get('/{id}/slots',                [$c, 'slots'])->whereNumber('id');
            Route::get('/for-service/{serviceId}',   [$c, 'forService'])->whereNumber('serviceId');
            Route::put('/for-service/{serviceId}',   [$c, 'saveForService'])->whereNumber('serviceId');
        });

        // Services settings: cancellation and reschedule windows, and the defaults of every service fee
        Route::prefix('service-settings')->middleware('module:ecommerce')->group(function () {
            Route::get('/', [\App\Http\Controllers\Api\ServiceSettingsController::class, 'show']);
            Route::put('/', [\App\Http\Controllers\Api\ServiceSettingsController::class, 'update'])->middleware('role:admin,super_admin,manager');
        });

        // Service Categories Management
        Route::prefix('service-categories')->middleware('module:ecommerce')->group(function () {
            Route::get('/', [ServiceCategoryController::class, 'adminIndex']);
            Route::post('/', [ServiceCategoryController::class, 'store']);
            Route::get('/{id}', [ServiceCategoryController::class, 'adminShow']);
            Route::put('/{id}', [ServiceCategoryController::class, 'update']);
            Route::delete('/{id}', [ServiceCategoryController::class, 'destroy'])->middleware('role:admin,super_admin,manager');
            Route::post('/reorder', [ServiceCategoryController::class, 'reorder']);
        });
        
        // Currencies — read-only here (product/service forms need the list).
        // All currency writes live in the FINANCE group below.
        Route::prefix('currencies')->group(function () {
            Route::get('/', [CurrencyController::class, 'index']);
            Route::get('/base', [CurrencyController::class, 'getBaseCurrency']);
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

        
        // Quotations (Admin) — the priced document; requests stay the intake
        Route::prefix('quotations')->group(function () {
            Route::get('/', [QuotationController::class, 'index']);
            Route::get('/meta', [QuotationController::class, 'meta']);
            Route::get('/lookup', [QuotationController::class, 'lookup']);
            Route::post('/preview', [QuotationController::class, 'preview']);
            Route::get('/{id}', [QuotationController::class, 'show']);
            Route::put('/{id}', [QuotationController::class, 'update']);
            Route::post('/{id}/send', [QuotationController::class, 'send']);
            Route::post('/{id}/withdraw', [QuotationController::class, 'withdraw']);
            Route::get('/{id}/export', [QuotationController::class, 'export']);
        });

        
        // Orders (retired): read-only views for the screens that still show them. Orders are vouchers now.
        Route::prefix('orders')->group(function () {
            Route::get('/', [OrderController::class, 'index']);
            Route::get('/activity', [OrderController::class, 'getAllOrderActivity']);
            Route::get('/statistics', [OrderController::class, 'statistics']);
            Route::get('/{customerId}/order-statistics', [OrderController::class, 'customerOrderStatistics']);
            Route::get('/{id}', [OrderController::class, 'adminShow']);
            Route::get('/{id}/payments', [PaymentController::class, 'adminOrderPaymentHistory']);
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

        Route::prefix('projects')->middleware('module:projects')->group(function () {
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

        Route::prefix('employees')->middleware('module:extras')->group(function () {
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

            Route::post('/{id}/verify-email', [UserController::class, 'verifyEmail']);
            Route::post('/{id}/verify-phone', [UserController::class, 'verifyPhone']);
        });

        // Referral Codes Management
        Route::prefix('referrals')->group(function () {
            Route::get('/',                      [ReferralController::class, 'index']);
            Route::get('/statistics',            [ReferralController::class, 'statistics']);
            Route::get('/analytics',             [ReferralController::class, 'analytics']);
            Route::get('/top-performers',        [ReferralController::class, 'topPerformers']);
            Route::get('/activity',              [ReferralController::class, 'activityLog']);
            Route::get('/programme-settings',    [ReferralController::class, 'programmeSettings']);
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
            Route::post('/{customerId}/grant-credit', [LoyaltyController::class, 'grantCredit'])->middleware('role:finance,manager,admin,super_admin');
            Route::post('/{customerId}/deduct-credit',[LoyaltyController::class, 'deductCredit'])->middleware('role:finance,manager,admin,super_admin');
            Route::post('/{customerId}/redeem',       [LoyaltyController::class, 'redeem']);
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

        Route::prefix('credit')->group(function () {
            Route::get('/global-summary', [CustomerCreditController::class, 'globalSummary']);
            Route::get('/global-customers', [CustomerCreditController::class, 'globalCustomers']);
        });

        // Bug Reports
        Route::prefix('bug-reports')->middleware('role:super_admin')->group(function () {
            Route::get('/',                     [BugReportController::class, 'adminIndex']);
            Route::get('/{id}',                 [BugReportController::class, 'adminShow']);
            Route::patch('/{id}/status',        [BugReportController::class, 'updateStatus']);
            Route::patch('/{id}/priority',      [BugReportController::class, 'updatePriority']);
            Route::delete('/{id}',              [BugReportController::class, 'adminDestroy']);
        });

        // Dev Notes (admin entering on behalf of dev)
        Route::prefix('dev-notes')->middleware('role:super_admin')->group(function () {
            Route::get('/',              [BugReportController::class, 'devNoteIndex']);
            Route::post('/',             [BugReportController::class, 'devNoteStore']);
            Route::put('/{id}',          [BugReportController::class, 'devNoteUpdate']);
            Route::patch('/{id}/status', [BugReportController::class, 'devNoteStatus']);
            Route::delete('/{id}',       [BugReportController::class, 'devNoteDestroy']);
        });

        // Dev Access Keys (admin board)
        Route::prefix('dev-keys')->middleware('role:super_admin')->group(function () {
            Route::get('/active',        [BugReportController::class, 'activeKey']);
            Route::post('/regenerate',   [BugReportController::class, 'regenerateKey']);
            Route::get('/logs',          [BugReportController::class, 'keyLogs']);
        });

        // ── AI Analytics ─────────────────────────────────────────────────────────────
        Route::prefix('ai-analytics')->middleware('module:extras')->group(function () {

            // Keys (super_admin only — policy handles it)
            Route::get   ('keys',              [AiAnalyticsController::class, 'indexKeys']);
            Route::post  ('keys',              [AiAnalyticsController::class, 'storeKey']);
            Route::post  ('keys/{key}/activate',[AiAnalyticsController::class, 'activateKey']);
            Route::put   ('keys/{key}',        [AiAnalyticsController::class, 'updateKey']);
            Route::post  ('keys/{key}/first',  [AiAnalyticsController::class, 'firstChoice']);
            Route::post  ('keys/{key}/test',   [AiAnalyticsController::class, 'testKey']);
            Route::delete('keys/{key}',        [AiAnalyticsController::class, 'destroyKey']);

            // Modules
            Route::get   ('modules',                    [AiAnalyticsController::class, 'indexModules']);
            Route::patch ('modules/{module}/toggle',    [AiAnalyticsController::class, 'toggleModule']);

            // Sessions & stats
            Route::get('sessions',      [AiAnalyticsController::class, 'indexSessions']);
            Route::get('sessions/stats',[AiAnalyticsController::class, 'sessionStats']);

            // Analyse
            Route::post('analyse', [AiAnalyticsController::class, 'analyse']);

            // Outputs
            Route::get  ('outputs/{moduleKey}',        [AiAnalyticsController::class, 'moduleOutputs']);
            Route::patch('outputs/{output}/dismiss',   [AiAnalyticsController::class, 'dismissOutput']);
        });

        Route::get('customers/{customerId}/note', [AdminSavedNoteController::class, 'show']);
        Route::post('customers/{customerId}/note/save', [AdminSavedNoteController::class, 'save']);
        Route::get('customers/{customerId}/note/saved', [AdminSavedNoteController::class, 'index']);
        Route::delete('customers/{customerId}/note/saved/{snapshotId}', [AdminSavedNoteController::class, 'destroy']);

        // ── VAULT ─────────────────────────────────────────────────────────────────────
        Route::prefix('vault')->group(function () {

                // Folders
                Route::get('folders',                          [VaultController::class, 'folderTree']);
                Route::get('folders/{folder}',                 [VaultController::class, 'showFolder']);
                Route::get('contents',                      [VaultController::class, 'folderContents']);
                Route::post('folders',                         [VaultController::class, 'createFolder']);
                Route::put('folders/{folder}',                 [VaultController::class, 'updateFolder']);
                Route::delete('folders/{folder}',              [VaultController::class, 'deleteFolder']);
                Route::post('folders/{folder}/move',           [VaultController::class, 'moveFolder']);
                Route::post('folders/{folder}/archive',        [VaultController::class, 'archiveFolder']);
                Route::post('folders/{folder}/unlock',         [VaultController::class, 'unlockFolder']);
                Route::post('folders/{folder}/password',       [VaultController::class, 'setFolderPassword']);
                Route::delete('folders/{folder}/password',     [VaultController::class, 'removeFolderPassword']);
                Route::post('folders/{folder}/restore',        [VaultController::class, 'restoreFolder']);

                // Documents
                Route::get('documents/{document}',             [VaultController::class, 'showDocument']);
                Route::post('documents',                       [VaultController::class, 'uploadDocument']);
                Route::put('documents/{document}',             [VaultController::class, 'updateDocument']);
                Route::delete('documents/{document}',          [VaultController::class, 'deleteDocument']);
                Route::post('documents/{document}/version',    [VaultController::class, 'uploadVersion']);
                Route::post('documents/{document}/move',       [VaultController::class, 'moveDocument']);
                Route::post('documents/{document}/copy',       [VaultController::class, 'copyDocument']);
                Route::post('documents/{document}/archive',    [VaultController::class, 'archiveDocument']);
                Route::post('documents/{document}/unlock',     [VaultController::class, 'unlockDocument']);
                Route::post('documents/{document}/password',   [VaultController::class, 'setDocumentPassword']);
                Route::delete('documents/{document}/password', [VaultController::class, 'removeDocumentPassword']);
                Route::get('documents/{document}/preview',     [VaultController::class, 'previewDocument']);
                Route::get('/documents/{document}/stream',     [VaultController::class, 'streamDocument']);
                Route::get('documents/{document}/download',    [VaultController::class, 'downloadDocument']);
                Route::post('documents/{document}/restore',    [VaultController::class, 'restoreDocument']);

                // Archiver
                Route::get('archiver/configs',                 [VaultController::class, 'listArchiverConfigs']);
                Route::post('archiver/configs',                [VaultController::class, 'createArchiverConfig']);
                Route::post('archiver/configs/run-multiple',   [VaultController::class, 'runMultipleArchiverConfigs']);
                Route::put('archiver/configs/{config}',        [VaultController::class, 'updateArchiverConfig']);
                Route::post('archiver/configs/{config}/run',   [VaultController::class, 'runArchiverConfig']);
                Route::get('archiver/runs',                    [VaultController::class, 'listArchiveRuns']);
                Route::get('archiver/runs/{run}',              [VaultController::class, 'showArchiveRun']);

                // Policies — super_admin + admin only
                Route::middleware('role:admin,super_admin')->group(function () {
                    Route::get('policies',                     [VaultController::class, 'listPolicies']);
                    Route::post('policies',                    [VaultController::class, 'createPolicy']);
                    Route::put('policies/{vaultPolicy}',       [VaultController::class, 'updatePolicy']);
                    Route::delete('policies/{vaultPolicy}',    [VaultController::class, 'deletePolicy']);
                });

                // Settings — super_admin only
                Route::get('settings',                         [VaultController::class, 'getSettings']);
                Route::middleware('role:super_admin')->group(function () {
                    Route::put('settings',                     [VaultController::class, 'updateSettings']);
                });

                // Logs
                Route::get('logs',                             [VaultController::class, 'accessLogs']);
            });
    });

    // ============================================
    // FINANCE ROUTES
    // ============================================
    Route::middleware('role:finance,manager,admin,super_admin')->prefix('admin')->group(function () {

        // ============================================
        // TAX, WITHHOLDING, TAX CERTIFICATES, CURRENCY CONFIG
        // Reads:  finance, manager, admin, super_admin (this group)
        // Writes: finance, admin, super_admin only — mirrors
        //         TaxLegitimacyCertificatePolicy / WithholdingCertificatePolicy.
        // URIs are unchanged from before the move.
        // ============================================
        Route::where(['id' => '[0-9]+'])->group(function () {

            // ---------- Reads ----------
            Route::prefix('tax')->group(function () {
                Route::get('types',         [TaxController::class, 'adminIndexTypes']);
                Route::get('rates',         [TaxController::class, 'adminIndexRates']);
                Route::get('rules',         [TaxController::class, 'adminIndexRules']);
                Route::get('districts',     [TaxController::class, 'adminIndexDistricts']);
                Route::get('applicability', [TaxController::class, 'adminIndexApplicability']);
                Route::get('applications',  [TaxController::class, 'adminIndexApplications']);
            });

            Route::prefix('withholding')->group(function () {
                Route::get('classifications',            [WithholdingController::class, 'adminIndexClassifications']);
                Route::get('certificates',               [WithholdingController::class, 'adminIndexCertificates']);
                Route::get('certificates/{id}',          [WithholdingController::class, 'adminShowCertificate']);
                Route::get('credits',                    [WithholdingController::class, 'adminIndexCredits']);
                Route::get('credits/{id}',               [WithholdingController::class, 'adminShowCredit']);
                Route::get('credits/{id}/clearances',    [WithholdingController::class, 'adminIndexClearances']);
            });

            // Customer account currency — history (read) and change (write, below)
            Route::get('customers/{id}/currency-log', [CustomerController::class, 'adminCurrencyLog']);

            Route::prefix('tax-legitimacy-certificates')->group(function () {
                Route::get('/',     [TaxLegitimacyCertificateController::class, 'adminIndex']);
                Route::get('/{id}', [TaxLegitimacyCertificateController::class, 'adminShow']);
            });

            // ---------- Writes ----------
            Route::middleware('role:finance,admin,super_admin')->group(function () {

                Route::prefix('tax')->group(function () {
                    Route::post('types',          [TaxController::class, 'adminStoreType']);
                    Route::put('types/{id}',      [TaxController::class, 'adminUpdateType']);
                    Route::delete('types/{id}',   [TaxController::class, 'adminDestroyType']);

                    Route::post('rates',          [TaxController::class, 'adminStoreRate']);
                    Route::put('rates/{id}',      [TaxController::class, 'adminUpdateRate']);
                    Route::delete('rates/{id}',   [TaxController::class, 'adminDestroyRate']);

                    Route::post('rules',                [TaxController::class, 'adminStoreRule']);
                    Route::put('rules/{id}',            [TaxController::class, 'adminUpdateRule']);
                    Route::delete('rules/{id}',         [TaxController::class, 'adminDestroyRule']);
                    Route::put('rules/{id}/districts',  [TaxController::class, 'adminSyncRuleDistricts']);

                    Route::post('districts',        [TaxController::class, 'adminStoreDistrict']);
                    Route::put('districts/{id}',    [TaxController::class, 'adminUpdateDistrict']);
                    Route::delete('districts/{id}', [TaxController::class, 'adminDestroyDistrict']);

                    Route::post('applicability',        [TaxController::class, 'adminStoreApplicability']);
                    Route::put('applicability/{id}',    [TaxController::class, 'adminUpdateApplicability']);
                    Route::delete('applicability/{id}', [TaxController::class, 'adminDestroyApplicability']);
                });

                Route::prefix('withholding')->group(function () {
                    Route::post('classifications',          [WithholdingController::class, 'adminStoreClassification']);
                    Route::put('classifications/{id}',      [WithholdingController::class, 'adminUpdateClassification']);
                    Route::delete('classifications/{id}',   [WithholdingController::class, 'adminDestroyClassification']);

                    Route::post('certificates',                    [WithholdingController::class, 'adminStoreCertificate']);
                    Route::post('certificates/{id}/mark-issued',   [WithholdingController::class, 'adminMarkIssued']);
                    Route::post('certificates/{id}/mark-received', [WithholdingController::class, 'adminMarkReceived']);

                    Route::put('customers/{id}/profile',        [WithholdingController::class, 'adminUpdateCustomerProfile']);

                    Route::post('credits',                      [WithholdingController::class, 'adminStoreCredit']);
                    Route::post('credits/{id}/apply-clearance', [WithholdingController::class, 'adminApplyClearance']);
                    Route::post('credits/{id}/write-off',       [WithholdingController::class, 'adminWriteOff']);
                });

                Route::prefix('tax-legitimacy-certificates')->group(function () {
                    Route::post('/',             [TaxLegitimacyCertificateController::class, 'adminStore']);
                    Route::put('/{id}',          [TaxLegitimacyCertificateController::class, 'adminUpdate']);
                    Route::delete('/{id}',       [TaxLegitimacyCertificateController::class, 'adminDestroy']);
                    Route::post('/{id}/verify',  [TaxLegitimacyCertificateController::class, 'adminVerify']);
                    Route::post('/{id}/revoke',  [TaxLegitimacyCertificateController::class, 'adminRevoke']);
                });

                Route::put('customers/{id}/currency', [CustomerController::class, 'adminUpdateCurrency']);

                Route::prefix('currencies')->group(function () {
                    Route::post('/',                 [CurrencyController::class, 'store']);
                    // Changing the base currency restates every figure: super admin and finance only
                    Route::post('/base',             [CurrencyController::class, 'setBaseCurrency'])->middleware('role:super_admin,finance');
                    Route::put('/{id}',              [CurrencyController::class, 'update']);
                    Route::patch('/{id}/anchor-rate', [CurrencyController::class, 'updateAnchorRate']);
                    Route::patch('/{id}/status',     [CurrencyController::class, 'toggleStatus']);
                    Route::delete('/{id}',           [CurrencyController::class, 'destroy'])->middleware('role:super_admin,finance');
                });
            });
        });

        // PAYMENTS
        Route::prefix('payments')->group(function () {
            Route::get('/',                          [PaymentController::class, 'index']);
            Route::post('/initiate',                 [PaymentController::class, 'initiate']);
            Route::get('/summary',                    [PaymentController::class, 'summary']);
            Route::get('/order-payments', [PaymentController::class, 'orderPayments']);
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
        Route::prefix('projects')->middleware('module:projects')->group(function () {
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


        // Own employee record
        Route::prefix('employees')->middleware('module:extras')->group(function () {
            Route::get('/my-record', [EmployeeController::class, 'myRecord']);
        });


        Route::prefix('analytics')->middleware('module:extras')->group(function () {
            Route::get('dashboard',                [SearchAnalyticsController::class, 'dashboard']);
            Route::get('sessions',                 [SearchAnalyticsController::class, 'sessions']);
            Route::get('sessions/{sessionId}',     [SearchAnalyticsController::class, 'sessionDetail']);
            Route::get('customers',                [SearchAnalyticsController::class, 'customers']);
            Route::get('customers/{customerId}',   [SearchAnalyticsController::class, 'customerDetail']);
        });
    });

    // ============================================
    // LOGISTICS ROUTES
    // ============================================
    Route::middleware('role:logistics,manager,admin,super_admin')->prefix('admin')->group(function () {

        // ── DELIVERY — ADMIN ──────────────────────────────────────────────────────
        Route::prefix('delivery')->middleware('module:extras')->group(function () {

            Route::get('/drivers',                           [DeliveryManifestController::class, 'activeDrivers']);
            Route::post('/drivers/check-safety',             [DeliveryManifestController::class, 'checkDriverSafety']);
            
            Route::post('/orders/eligibility', [DeliveryManifestController::class, 'checkOrderEligibility']);
            
            // Manifests CRUD
            Route::prefix('manifests')->group(function () {
                Route::get('/',                              [DeliveryManifestController::class, 'index']);
                Route::get('/statistics',                    [DeliveryManifestController::class, 'statistics']);
                Route::get('/delivery-notes',                [DeliveryManifestController::class, 'deliveryNotes']);
                Route::post('/',                             [DeliveryManifestController::class, 'store']);
                Route::post('/ai-generate',                  [DeliveryManifestController::class, 'aiGenerate']);
                Route::post('/ai-create',                    [DeliveryManifestController::class, 'aiCreate']);
                Route::post('/transfer-items',               [DeliveryManifestController::class, 'transferItems']);
                Route::get('/returned-items',                [DeliveryManifestController::class, 'getReturnedItems']);
                Route::get('/failed-items',                  [DeliveryManifestController::class, 'getFailedItems']);
                // NEW: Hard delete manifest if empty (must be before {id} catch-all)
                Route::delete('/{id}/force',                 [DeliveryManifestController::class, 'deleteIfEmpty']);                
                Route::get('/{id}',                          [DeliveryManifestController::class, 'show']);
                Route::patch('/{id}',                        [DeliveryManifestController::class, 'update']);
                Route::delete('/{id}',                       [DeliveryManifestController::class, 'destroy']);
                Route::get('/{id}/pings',                    [DeliveryManifestController::class, 'getLivePings']);

                // Route planning (admin)
                Route::get('/{id}/route', [DeliveryRouteController::class, 'getRoutePlan']);
                Route::post('/{id}/route', [DeliveryRouteController::class, 'saveRoutePlan']);
                Route::post('/{id}/route/optimize', [DeliveryRouteController::class, 'optimizeRoute']);

                // Lifecycle
                Route::post('/{id}/dispatch',                [DeliveryManifestController::class, 'dispatchManifest']);
                Route::post('/{id}/cancel',                  [DeliveryManifestController::class, 'cancel']);
                Route::post('/{id}/reassign-driver',         [DeliveryManifestController::class, 'reassignDriver']);

                // External delivery item override (courier, pickup, third_party)
                Route::patch('/{manifestId}/items/{itemId}/override-external', [DeliveryManifestController::class, 'overrideExternalItemStatus']);

                // Admin force-complete (non-internal-driver workflows)
                Route::post('/{id}/complete', [DeliveryManifestController::class, 'completeManifest']);

                // Money: cash collected at the door (Receipt) and what the trip cost (Payment)
                Route::get('/{id}/money',                    [DeliveryMoneyController::class, 'show']);
                Route::post('/{id}/items/{itemId}/collect',  [DeliveryMoneyController::class, 'collect']);
                Route::delete('/{id}/items/{itemId}/collect',[DeliveryMoneyController::class, 'cancelCollection']);
                Route::post('/{id}/costs',                   [DeliveryMoneyController::class, 'addCost']);
                Route::delete('/{id}/costs/{costId}',        [DeliveryMoneyController::class, 'cancelCost']);

                // Items
                Route::post('/{id}/items',                   [DeliveryManifestController::class, 'addItems']);
                Route::delete('/{id}/items/{itemId}',        [DeliveryManifestController::class, 'removeItem']);
                
                Route::get('/{id}/participants',             [DeliveryIncidentController::class, 'manifestParticipants']);

                // AI manifest generation
                Route::post('/ai-generate',                  [DeliveryManifestController::class, 'aiGenerate']);

                // Print / export
                Route::get('/{id}/print',                    [DeliveryManifestController::class, 'printData']);
            });
        
            Route::prefix('insights')->group(function () {
                Route::get('/{entityType}', [DeliveryInsightController::class, 'history']); // fleet-wide, no entityId
                Route::get('/{entityType}/{entityId}', [DeliveryInsightController::class, 'history']);
                Route::get('/{entityType}/{entityId}/latest', [DeliveryInsightController::class, 'latest']);
            });

            // Incidents — admin full access
            Route::prefix('incidents')->group(function () {
                Route::get('/',       [DeliveryIncidentController::class, 'index']);
                Route::post('/',      [DeliveryIncidentController::class, 'store']);
                Route::patch('/{id}', [DeliveryIncidentController::class, 'update']);
                Route::post('/admin-report', [DeliveryIncidentController::class, 'storeAdminIncident']);
            });

            // Ratings — admin view + controls
            Route::prefix('ratings')->group(function () {
                Route::get('/drivers/{driverId}',           [DeliveryRatingController::class, 'driverRatings']);
                Route::post('/drivers/{driverId}/adjust',   [DeliveryRatingController::class, 'adjust']);
                Route::patch('/{ratingId}/visibility',      [DeliveryRatingController::class, 'toggleVisibility']);
                Route::get('/fleet-kpis', [DeliveryRatingController::class, 'fleetRatingKpis']);
            });

            // Stats & performance
            Route::prefix('stats')->group(function () {
                Route::get('/overview',              [DeliveryStatsController::class, 'overview']);
                Route::get('/drivers',               [DeliveryStatsController::class, 'driverPerformance']);
                Route::get('/drivers/{driverId}',    [DeliveryStatsController::class, 'driverDetail']);
                Route::get('/manifests/{id}/trail',  [DeliveryStatsController::class, 'locationTrail']);
            });
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

        // Own employee record
        Route::prefix('employees')->group(function () {
            Route::get('/my-record', [EmployeeController::class, 'myRecord']);
        });
    });

    // ── Mimi analytics (admin/super_admin/manager) ─────────────────────────────────────
    Route::middleware(['auth:sanctum', 'role:admin,super_admin,manager'])
        ->prefix('admin/mimi')
        ->group(function () {
            Route::get('/sessions',              [MimiAnalyticsController::class, 'sessions']);
            Route::get('/sessions/{id}',         [MimiAnalyticsController::class, 'sessionDetail']);
            Route::get('/queries',               [MimiAnalyticsController::class, 'queries']);
            Route::patch('/queries/{id}/flag',   [MimiAnalyticsController::class, 'flagQuery']);
            Route::get('/reports',               [MimiAnalyticsController::class, 'reports']);
            Route::get('/search-actors',         [MimiAnalyticsController::class, 'searchActors']);
            Route::post('/block',                [MimiAnalyticsController::class, 'block']);
            Route::delete('/block/{id}',         [MimiAnalyticsController::class, 'unblock']);
            Route::get('/blocks',                [MimiAnalyticsController::class, 'blocks']);
        });
        
    // CALCULATOR — every staff role; each insight pack inside checks the role of the pages its figures come from
    Route::middleware('role:super_admin,admin,manager,finance,sales_rep,logistics')->prefix('admin/insight')->group(function () {
        Route::get('/reference',  [InsightController::class, 'reference']);
        Route::post('/contexts',  [InsightController::class, 'contexts']);
        Route::post('/answer',    [InsightController::class, 'answer']);
        Route::post('/explain',   [InsightController::class, 'explain'])->middleware('throttle:20,1');
    });

    // ASSETS — depreciation, register and the ledgers a category posts to: finance too (they review and post it)
    Route::middleware('role:admin,super_admin,manager,finance')->prefix('admin/inventory')->group(function () {
        Route::get('/accounting/options',              [AssetAccountingController::class, 'options']);
        Route::post('/categories/{id}/setup-ledgers',  [AssetAccountingController::class, 'setupCategoryLedgers']);
        Route::get('/depreciation/preview',            [AssetAccountingController::class, 'preview']);
        Route::post('/depreciation/post',              [AssetAccountingController::class, 'post']);
        Route::post('/depreciation/{voucherId}/undo',  [AssetAccountingController::class, 'undo']);
        Route::get('/depreciation/history',            [AssetAccountingController::class, 'history']);
        Route::get('/register',                        [AssetAccountingController::class, 'register']);
        Route::get('/reconcile',                       [AssetAccountingController::class, 'reconcile']);
        Route::get('/instances/{instanceId}/book-value', [AssetAccountingController::class, 'show']);
    });

    // ============================================
    // INVENTORY — ADMIN / MANAGER
    // ============================================
    Route::middleware('role:admin,super_admin,manager')
        ->prefix('admin/inventory')   // Core: every business has furniture and laptops (the asset register)
        ->group(function () {

            // ── Catalogue ────────────────────────────────────────────────────
            Route::prefix('categories')->group(function () {
                Route::get('/',        [InventoryController::class, 'categoriesIndex']);
                Route::post('/',       [InventoryController::class, 'categoriesStore']);
                Route::put('/{id}',    [InventoryController::class, 'categoriesUpdate']);
                Route::delete('/{id}', [InventoryController::class, 'categoriesDestroy']);
            });

            Route::prefix('locations')->group(function () {
                Route::get('/',        [InventoryController::class, 'locationsIndex']);
                Route::post('/',       [InventoryController::class, 'locationsStore']);
                Route::put('/{id}',    [InventoryController::class, 'locationsUpdate']);
                Route::delete('/{id}', [InventoryController::class, 'locationsDestroy']);
            });

            Route::prefix('items')->group(function () {
                Route::get('/',        [InventoryController::class, 'itemsIndex']);
                Route::post('/',       [InventoryController::class, 'itemsStore']);
                Route::get('/{id}',    [InventoryController::class, 'itemsShow']);
                Route::put('/{id}',    [InventoryController::class, 'itemsUpdate']);
                Route::delete('/{id}', [InventoryController::class, 'itemsDestroy']);
            });

            // ── Instances ────────────────────────────────────────────────────
            Route::prefix('instances')->group(function () {
                Route::get('/',                          [InventoryController::class, 'instancesIndex']);
                Route::post('/',                         [InventoryController::class, 'instancesStore']);
                Route::get('/{id}',                      [InventoryController::class, 'instancesShow']);
                Route::put('/{id}',                      [InventoryController::class, 'instancesUpdate']);
                Route::delete('/{id}',                   [InventoryController::class, 'instancesDestroy']);
                Route::get('/{id}/ledger',               [InventoryController::class, 'instancesLedger']);
                Route::get('/{id}/location-history',     [InventoryController::class, 'instancesLocationHistory']);
                Route::post('/{id}/move',                [InventoryController::class, 'instancesMove']);
                Route::post('/{id}/declare-obsolete',    [InventoryController::class, 'instancesDeclareObsolete']);
                Route::post('/{id}/write-off',           [InventoryController::class, 'instancesWriteOff']);
                Route::post('/{id}/dispose',             [InventoryController::class, 'instancesDispose']);
            });

            // ── Assignments ──────────────────────────────────────────────────
            Route::prefix('assignments')->group(function () {
                Route::get('/',                  [InventoryController::class, 'assignmentsIndex']);
                Route::get('/{id}',              [InventoryController::class, 'assignmentsShow']);
                Route::post('/issue',            [InventoryController::class, 'assignmentsIssue']);
                Route::post('/loan',             [InventoryController::class, 'assignmentsLoan']);
                Route::post('/department',       [InventoryController::class, 'assignmentsDepartment']);
                Route::post('/group',            [InventoryController::class, 'assignmentsGroup']);
                Route::post('/{id}/return',      [InventoryController::class, 'assignmentsReturn']);
                Route::post('/mark-overdue',     [InventoryController::class, 'assignmentsMarkOverdue']);
            });

            // ── Groups ───────────────────────────────────────────────────────
            Route::prefix('groups')->group(function () {
                Route::get('/',                           [InventoryController::class, 'groupsIndex']);
                Route::post('/',                          [InventoryController::class, 'groupsStore']);
                Route::put('/{id}',                       [InventoryController::class, 'groupsUpdate']);
                Route::delete('/{id}',                    [InventoryController::class, 'groupsDestroy']);
                Route::post('/{id}/members',              [InventoryController::class, 'groupsAddMember']);
                Route::delete('/{id}/members/{memberId}', [InventoryController::class, 'groupsRemoveMember']);
            });

            // ── Repairs ──────────────────────────────────────────────────────
            Route::prefix('repairs')->group(function () {
                Route::get('/',               [InventoryController::class, 'repairsIndex']);
                Route::post('/',              [InventoryController::class, 'repairsReport']);
                Route::get('/{id}',           [InventoryController::class, 'repairsShow']);
                Route::post('/{id}/send',     [InventoryController::class, 'repairsSend']);
                Route::post('/{id}/complete', [InventoryController::class, 'repairsComplete']);
                Route::post('/{id}/unrepairable', [InventoryController::class, 'repairsUnrepairable']);
            });

            // ── Disputes ─────────────────────────────────────────────────────
            Route::prefix('disputes')->group(function () {
                Route::get('/',           [InventoryController::class, 'disputesIndex']);
                Route::post('/',          [InventoryController::class, 'disputesOpen']);
                Route::get('/{id}',       [InventoryController::class, 'disputesShow']);
                Route::post('/{id}/rule', [InventoryController::class, 'disputesRule']);
            });

            // ── Return Audits ────────────────────────────────────────────────
            Route::prefix('audits')->group(function () {
                Route::get('/',                              [InventoryController::class, 'auditsIndex']);
                Route::post('/',                             [InventoryController::class, 'auditsCreate']);
                Route::get('/{id}',                          [InventoryController::class, 'auditsShow']);
                Route::post('/{id}/finalise',                [InventoryController::class, 'auditsFinalise']);
                Route::put('/{auditId}/items/{itemId}',      [InventoryController::class, 'auditsRecordItem']);
            });

            // ── Lifecycle Ledger ─────────────────────────────────────────────
            Route::get('/ledger', [InventoryController::class, 'ledgerIndex']);

            // ── Export ───────────────────────────────────────────────────────
            Route::prefix('export')->group(function () {
                Route::post('/run',          [InventoryController::class, 'exportRun']);
                Route::get('/logs',          [InventoryController::class, 'exportLogs']);
                Route::get('/presets',       [InventoryController::class, 'exportPresetsIndex']);
                Route::post('/presets',      [InventoryController::class, 'exportPresetsSave']);
                Route::delete('/presets/{id}', [InventoryController::class, 'exportPresetsDestroy']);
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

        Route::prefix('policies')->group(function () {
            Route::get('/',                    [PolicyController::class, 'adminIndex']);
            Route::get('/reports',             [PolicyController::class, 'reports']);
            Route::get('/{id}',                [PolicyController::class, 'adminShow']);
            Route::put('/{id}',                [PolicyController::class, 'update']);
            Route::get('/{id}/acceptances',    [PolicyController::class, 'acceptances']);
            Route::get('/{id}/change-logs',    [PolicyController::class, 'changeLogs']);
        });

        Route::prefix('logs')->group(function () {
            Route::get('/export/meta',   [LogExportController::class, 'meta']);
            Route::post('/export',       [LogExportController::class, 'export']);
        });

        
        Route::prefix('projects')->middleware('module:projects')->group(function () {
            Route::delete('/{project}', [ProjectController::class, 'adminDestroy']);          // soft delete → trash
            Route::post('/{project}/transfer-ownership', [ProjectController::class, 'transferOwnership']);
            Route::post('/{id}/restore', [ProjectController::class, 'adminRestore']);
        });
        
        // ── Admin hamper routes ───────────────────────────────────────────────────────
        Route::prefix('hampers')->middleware('module:ecommerce')->group(function () {           
            Route::get('/',                                     [HamperController::class, 'index']);
            Route::get('/stats',                                [HamperController::class, 'stats']); 
            Route::post('/',                                    [HamperController::class, 'store']);
            Route::get('/activity',                             [HamperController::class, 'globalActivityLog']);
            Route::get('/{id}',                                 [HamperController::class, 'show']);
            Route::put('/{id}',                                 [HamperController::class, 'update']);
            Route::delete('/{id}',                              [HamperController::class, 'destroy']);
            Route::get('/{id}/activity',                        [HamperController::class, 'activityLogs']);
            Route::get('/{id}/eligible-customers',               [HamperController::class, 'eligibleCustomers']);
        
            // products
            Route::post('/{id}/products',                       [HamperController::class, 'addProduct']);
            Route::delete('/{id}/products/{productId}',         [HamperController::class, 'removeProduct']);
            Route::patch('/{id}/items/{itemId}',                [HamperController::class, 'updateItem']);
            Route::post('/{id}/distribute-prices',              [HamperController::class, 'distributePrices']);
            Route::post('/{id}/reprice-items',                  [HamperController::class, 'repriceItems']);
            Route::post('/{id}/cover-image',                    [HamperController::class, 'uploadCoverImage']);
            Route::get('/{id}/suggest-products',                [HamperController::class, 'suggestProducts']);
        
            // eligibility
            Route::get('/{id}/eligibility',                     [HamperController::class, 'listEligibility']);
            Route::post('/{id}/eligibility',                    [HamperController::class, 'addCustomer']);
            Route::get('/{id}/eligibility/search',              [HamperController::class, 'searchCustomers']);
            Route::patch('/{id}/eligibility/{customerId}',      [HamperController::class, 'updateCustomerStatus']);
        
            // orders
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
            Route::put('/programme-settings',    [ReferralController::class, 'updateProgrammeSettings']);
            Route::put('/{id}',                  [ReferralController::class, 'update']);
            Route::delete('/{id}',               [ReferralController::class, 'destroy']);
            Route::post('/{id}/activate',        [ReferralController::class, 'activate']);
        });

        Route::prefix('employees')->middleware('module:extras')->group(function () {
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
    });

    // ── ALGORITHM — ADMIN ──────────────────────────────────────────────────────
    Route::middleware('role:admin,super_admin')
        ->prefix('admin/algorithm')->middleware('module:extras')
        ->group(function () {
            Route::get('/config',               [AlgorithmController::class, 'getConfig']);
            Route::put('/config',               [AlgorithmController::class, 'saveConfig']);
            Route::get('/scores',               [AlgorithmController::class, 'getScores']);
            Route::get('/scores/{customerId}',  [AlgorithmController::class, 'getCustomerScore']);

            // Segment rules CRUD
            Route::post('/segment-rules',       [AlgorithmController::class, 'storeSegmentRule']);
            Route::put('/segment-rules/{id}',   [AlgorithmController::class, 'updateSegmentRule']);
            Route::delete('/segment-rules/{id}',[AlgorithmController::class, 'deleteSegmentRule']);

            // ── Catalogue boosts ─────────────────────────────────────────────
            Route::get('/catalogue-boosts',                              [AlgorithmController::class, 'getCatalogueBoosts']);
            Route::put('/catalogue-boosts/{entityType}/{entityId}',      [AlgorithmController::class, 'upsertCatalogueBoost']);
            Route::delete('/catalogue-boosts/{entityType}/{entityId}',   [AlgorithmController::class, 'deleteCatalogueBoost']);

            // ── Customer ranked products & pins ─────────────────────────────────────
            Route::get('/customers/{customerId}/ranked-products',                          [AlgorithmController::class, 'getCustomerRankedProducts']);
            Route::post('/customers/{customerId}/pins',                                    [AlgorithmController::class, 'pinProduct']);
            Route::delete('/customers/{customerId}/pins/{entityType}/{entityId}',          [AlgorithmController::class, 'unpinProduct']);
        });

    // ============================================
    // CAREERS — ADMIN
    // ============================================
    Route::middleware(['role:admin,super_admin'])
        ->prefix('admin/careers')->middleware('module:careers')
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
            Route::post('/applications/{id}/rescreen',     [AdminAIScreeningController::class, 'rescreen']);
            Route::get('/documents/{document}/download',   [AdminApplicationController::class, 'downloadDocument'])
                ->name('admin.careers.documents.download');
        });

        
    // Run scoring — super_admin only (matches your existing destructive-action pattern)
    Route::middleware('role:super_admin')
    ->prefix('admin/algorithm')->middleware('module:extras')
    ->group(function () {
        Route::post('/run', [AlgorithmController::class, 'runScoring']);
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

        Route::prefix('projects')->middleware('module:projects')->group(function () {
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

Route::get('/company', [CompanyProfileController::class, 'show']);
Route::get('/company/logo', [CompanyProfileController::class, 'logo']);

// ── Appearance / Theme ─────────────────────────────────────────────────────
Route::get('/appearance/options', [AppearanceController::class, 'options']);

Route::middleware('auth:sanctum')->group(function () {
    Route::get('/appearance/preferences', [AppearanceController::class, 'getUserPreferences']);
    Route::post('/appearance/preferences', [AppearanceController::class, 'saveUserPreferences']);
});

Route::middleware(['auth:sanctum', 'role:admin,super_admin'])->group(function () {
    Route::get('/admin/appearance/colourings', [AppearanceController::class, 'adminColourings']);
    Route::post('/admin/appearance/colourings', [AppearanceController::class, 'adminStoreColouring']);
    Route::patch('/admin/appearance/colourings/{id}', [AppearanceController::class, 'adminUpdateColouring']);
    Route::delete('/admin/appearance/colourings/{id}', [AppearanceController::class, 'adminDeleteColouring']);

    Route::get('/admin/appearance/fonts', [AppearanceController::class, 'adminFonts']);
    Route::patch('/admin/appearance/fonts/{id}', [AppearanceController::class, 'adminUpdateFont']);

    Route::get('/admin/appearance/icon-styles', [AppearanceController::class, 'adminIconStyles']);
    Route::patch('/admin/appearance/icon-styles/{id}', [AppearanceController::class, 'adminUpdateIconStyle']);

});

// ============================================
// CATCH-ALL FOR 404
// ============================================
Route::fallback(function () {
    return response()->json([
        'message' => 'Route not found'
    ], 404);
});