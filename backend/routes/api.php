<?php

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;
use App\Http\Controllers\ChatController;
use App\Http\Controllers\VaultController;
use App\Http\Controllers\Admin\AiAnalyticsController;
use App\Http\Controllers\Admin\MimiAnalyticsController;
use App\Http\Controllers\Admin\DataEngineController;
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
use App\Http\Controllers\Api\QuoteController;
use App\Http\Controllers\Api\ServiceController;
use App\Http\Controllers\Api\ServiceCatalogController;
use App\Http\Controllers\Api\ServiceCategoryController;
use App\Http\Controllers\Api\SearchEventController;
use App\Http\Controllers\Api\QuoteRequestController;
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
use App\Http\Controllers\Api\InventoryController;
use App\Http\Controllers\Api\UserController;
use App\Http\Controllers\Api\VerificationController;
use App\Http\Controllers\Api\PromoCodeController;
use App\Http\Controllers\Api\EmployeeController;
use App\Http\Controllers\Api\WorkController;
use App\Http\Controllers\Api\ReportsController;
use App\Http\Controllers\Api\TicketController;
use App\Http\Controllers\Api\LoyaltyController;
use App\Http\Controllers\Api\ReviewEligibilityController;
use App\Http\Controllers\Api\ShippingOptionController;
use App\Http\Controllers\Api\CustomerTierController;
use App\Http\Controllers\Api\AlgorithmController;
use App\Http\Controllers\Api\CustomerPinController;
use App\Http\Controllers\Api\PublicationController;
use App\Http\Controllers\Api\PublicationCommentController;
use App\Http\Controllers\Api\BookingController;
use App\Http\Controllers\Api\BookingStaffController;
use App\Http\Controllers\Api\BookingSettingController;
use App\Http\Controllers\Api\BookingWorksheetController;
use App\Http\Controllers\Api\BookingDisqualificationController;
use App\Http\Controllers\Api\FinancialNoteController;
use App\Http\Controllers\Api\ReconciliationController;
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

// Public
Route::get('/policies', [PolicyController::class, 'index']);
Route::get('/policies/{key}', [PolicyController::class, 'show']);

// Auth required — must be registered BEFORE /{key} to avoid route conflict
Route::middleware('auth:sanctum')->group(function () {
    Route::get('/policies/check-reacceptance', [PolicyController::class, 'checkReacceptance']);
    Route::post('/policies/accept', [PolicyController::class, 'recordAcceptance']);
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

Route::get('/booking-settings/policy', [BookingSettingController::class, 'publicPolicy']);
Route::get('/bookings/slots',          [BookingController::class, 'availableSlots']);


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
Route::get('/products/{id}/reviews', [ProductReviewController::class, 'index']);
Route::post('/reviews/{id}/helpful', [ProductReviewController::class, 'markHelpful']);

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
        $r = \App\Http\Controllers\Admin\RecipeController::class;
        Route::get('/journal', [\App\Http\Controllers\Admin\StockJournalController::class, 'index']);
        Route::get('/counts', [$n, 'index']);
        Route::get('/counts/{id}', [$n, 'show'])->whereNumber('id');
        Route::get('/recipes', [$r, 'index']);
        Route::middleware('role:admin,super_admin,finance')->group(function () use ($n, $r) {
            Route::post('/counts', [$n, 'store']);
            Route::put('/counts/{id}', [$n, 'save'])->whereNumber('id');
            Route::post('/counts/{id}/post', [$n, 'post'])->whereNumber('id');
            Route::post('/counts/{id}/cancel', [$n, 'cancel'])->whereNumber('id');
            Route::put('/recipes', [$r, 'save']);
            Route::delete('/recipes/{id}', [$r, 'destroy'])->whereNumber('id');
            Route::post('/recipes/{id}/produce', [$r, 'produce'])->whereNumber('id');
            Route::post('/production/{id}/cancel', [$r, 'cancelRun'])->whereNumber('id');
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
        Route::get('/vouchers/export',          [BooksVoucherController::class, 'exportList']);
        Route::get('/lookup',                   [BooksVoucherController::class, 'lookup']);
        Route::get('/products/{id}/variants',   [BooksVoucherController::class, 'productVariants']);
        Route::get('/stock-batches',            [BooksVoucherController::class, 'stockBatches']);
        Route::get('/vouchers/next-number',     [BooksVoucherController::class, 'nextNumber']);
        Route::post('/vouchers/preview',        [BooksVoucherController::class, 'preview']);
        Route::get('/vouchers/{id}',            [BooksVoucherController::class, 'show']);
        Route::get('/vouchers/{id}/export',     [BooksVoucherController::class, 'export']);
        Route::get('/reports/{name}',           [BooksVoucherController::class, 'report']);
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
            Route::post('/vouchers/{id}/receive',   [BooksVoucherController::class, 'receive']);
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
            Route::get('/options', [CheckoutController::class, 'options']);
            Route::post('/quote', [CheckoutController::class, 'quote']);
            Route::post('/place', [CheckoutController::class, 'place']);
            Route::get('/attempts/{id}', [CheckoutController::class, 'attempt']);
            Route::post('/orders/{id}/pay', [CheckoutController::class, 'payOrder']);
        });
        Route::get('/gift-vouchers', [GiftVoucherController::class, 'mine']);
        Route::get('/wallet', [\App\Http\Controllers\Api\CustomerWalletController::class, 'show']);
        Route::prefix('sales-orders')->group(function () {
            Route::get('/', [CheckoutController::class, 'orders']);
            Route::get('/{id}', [CheckoutController::class, 'order']);
            Route::post('/{id}/cancel', [CheckoutController::class, 'cancelOrder']);
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
        Route::prefix('hampers')->middleware('module:ecommerce')->group(function () {
            Route::get('/',                              [PublicHamperController::class, 'index']);
            Route::get('/{slug}',                       [PublicHamperController::class, 'show']);
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

        // Quotations (Customer) — priced quotes for a request, accept / decline / ask for changes
        Route::prefix('quotations')->group(function () {
            Route::get('/', [QuotationController::class, 'myIndex']);
            Route::get('/{id}', [QuotationController::class, 'myShow']);
            Route::post('/{id}/accept', [QuotationController::class, 'accept']);
            Route::post('/{id}/decline', [QuotationController::class, 'decline']);
            Route::post('/{id}/revision', [QuotationController::class, 'revision']);
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

        Route::middleware('module:ecommerce')->group(function () {
            Route::post('/products/{productId}/reviews', [ProductReviewController::class, 'store']);
            Route::get('/products/{productId}/can-review', [ReviewEligibilityController::class, 'canReview']);
        });
        
        // Reviews
        Route::prefix('reviews')->middleware('module:ecommerce')->group(function () {
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
        Route::prefix('bookings')->group(function () {
            Route::get('/',               [BookingController::class, 'customerIndex']);
            Route::post('/',              [BookingController::class, 'customerStore']);
            Route::get('/{id}',           [BookingController::class, 'customerShow']);
            Route::post('/{id}/cancel',   [BookingController::class, 'customerCancel']);
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
        // Dashboard
        // Route::get('/dashboard', [AdminController::class, 'dashboard']);

        
        Route::get('/users', [AuthController::class, 'getAdminUsers']);
      
        Route::get('/customers/{customerId}/orders', [OrderController::class, 'adminCustomerOrders']);
        // Products Management
        Route::prefix('products')->middleware('module:ecommerce')->group(function () {
            Route::post('/', [ProductController::class, 'store']);
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
            Route::delete('/{id}/variants/{variantId}',                   [ServiceCatalogController::class, 'destroyVariant']);
            Route::post('/{id}/requirements',                             [ServiceCatalogController::class, 'storeRequirement']);
            Route::put('/{id}/requirements/{requirementId}',              [ServiceCatalogController::class, 'updateRequirement']);
            Route::delete('/{id}/requirements/{requirementId}',           [ServiceCatalogController::class, 'destroyRequirement']);
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
        
        // Quotations (Admin) — the priced document; requests stay the intake
        Route::prefix('quotations')->group(function () {
            Route::get('/', [QuotationController::class, 'index']);
            Route::get('/meta', [QuotationController::class, 'meta']);
            Route::get('/lookup', [QuotationController::class, 'lookup']);
            Route::post('/preview', [QuotationController::class, 'preview']);
            Route::post('/from-request/{requestId}', [QuotationController::class, 'fromRequest']);
            Route::get('/{id}', [QuotationController::class, 'show']);
            Route::put('/{id}', [QuotationController::class, 'update']);
            Route::post('/{id}/send', [QuotationController::class, 'send']);
            Route::post('/{id}/withdraw', [QuotationController::class, 'withdraw']);
            Route::get('/{id}/export', [QuotationController::class, 'export']);
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
            Route::get('/activity', [OrderController::class, 'getAllOrderActivity']);
            Route::get('/statistics', [OrderController::class, 'statistics']);
            Route::get('/{customerId}/order-statistics', [OrderController::class, 'customerOrderStatistics']);
            Route::get('/{id}/activity', [OrderController::class, 'getOrderActivity']);
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

        // Reviews Management
        Route::prefix('reviews')->middleware('module:ecommerce')->group(function () {
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

        Route::prefix('work')->group(function () {
            Route::get('/dashboard',   [WorkController::class, 'myDashboard']);
            Route::get('/assignments', [WorkController::class, 'myAssignmentsEndpoint']);
            Route::get('/deadlines',   [WorkController::class, 'myDeadlinesEndpoint']);

            Route::get('/incomplete-manifests',            [WorkController::class, 'incompleteManifests']);
            Route::get('/driver/{userId}/manifests',       [WorkController::class, 'driverManifests']);
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
            Route::get('system',       [ReportsController::class, 'system']);
            Route::get('extras',       [ReportsController::class, 'extras']);
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

        Route::prefix('bookings')->group(function () {
            Route::get('/',                          [BookingController::class, 'adminIndex']);
            Route::post('/',                         [BookingController::class, 'adminStore']);
            Route::get('/activity',                  [BookingController::class, 'globalActivityLog']);
            Route::get('/{id}',                      [BookingController::class, 'adminShow']);
            Route::put('/{id}',                      [BookingController::class, 'adminUpdate']);
            Route::post('/{id}/cancel',              [BookingController::class, 'adminCancel']);
            Route::post('/{id}/confirm',             [BookingController::class, 'confirm']);
            Route::post('/{id}/status',              [BookingController::class, 'updateStatus']);
            Route::post('/{id}/staff',               [BookingStaffController::class, 'assign']);
            Route::put('/{id}/staff/{staffId}',      [BookingStaffController::class, 'update']);
            Route::delete('/{id}/staff/{staffId}',   [BookingStaffController::class, 'remove']);
            Route::post('/{id}/disqualify',          [BookingDisqualificationController::class, 'disqualify']);
            Route::post('/{id}/reactivate',          [BookingDisqualificationController::class, 'reactivate']);
            Route::get('/{id}/activity',             [BookingController::class, 'activityLog']);

            // Worksheets
            Route::post('/{id}/worksheets',              [BookingWorksheetController::class, 'store']);
            Route::get('/{id}/worksheets/{wsId}',        [BookingWorksheetController::class, 'show']);
            Route::put('/{id}/worksheets/{wsId}',        [BookingWorksheetController::class, 'update']);
            Route::post('/{id}/worksheets/{wsId}/submit',[BookingWorksheetController::class, 'submit']);
            Route::post('/{id}/worksheets/{wsId}/approve',[BookingWorksheetController::class, 'approve']);
            Route::post('/{id}/worksheets/{wsId}/reject', [BookingWorksheetController::class, 'reject']);
            Route::get('/{id}/worksheets/{wsId}/export', [BookingWorksheetController::class, 'exportCsv']);

            // Worksheet items
            Route::post('/{id}/worksheets/{wsId}/items',         [BookingWorksheetController::class, 'addItem']);
            Route::put('/{id}/worksheets/{wsId}/items/{itemId}', [BookingWorksheetController::class, 'updateItem']);
            Route::delete('/{id}/worksheets/{wsId}/items/{itemId}',[BookingWorksheetController::class, 'removeItem']);
            Route::post('/{id}/worksheets/{wsId}/items/reorder', [BookingWorksheetController::class, 'reorderItems']);
        });

        Route::prefix('booking-settings')->group(function () {
            Route::get('/',    [BookingSettingController::class, 'show']);
            Route::put('/',    [BookingSettingController::class, 'update']);
        });

        Route::prefix('booking-disqualifications')->group(function () {
            Route::get('/',         [BookingDisqualificationController::class, 'index']);
            Route::get('/{id}',     [BookingDisqualificationController::class, 'show']);
        });

        Route::prefix('financial-notes')->group(function () {
            Route::get('/',                     [FinancialNoteController::class, 'index']);
            Route::post('/',                    [FinancialNoteController::class, 'store']);
            Route::get('/for-subject',          [FinancialNoteController::class, 'forSubject']);
            Route::get('/resolve-subject',      [FinancialNoteController::class, 'resolveSubject']);
            Route::get('/{financialNote}',      [FinancialNoteController::class, 'show']);
            Route::put('/{financialNote}',      [FinancialNoteController::class, 'update']);
            Route::delete('/{financialNote}',   [FinancialNoteController::class, 'destroy']);
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
                    Route::post('/base',             [CurrencyController::class, 'setBaseCurrency']);
                    Route::put('/{id}',              [CurrencyController::class, 'update']);
                    Route::patch('/{id}/anchor-rate', [CurrencyController::class, 'updateAnchorRate']);
                    Route::patch('/{id}/status',     [CurrencyController::class, 'toggleStatus']);
                    Route::delete('/{id}',           [CurrencyController::class, 'destroy']);
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
        Route::prefix('employees')->middleware('module:extras')->group(function () {
            Route::get('/my-record', [EmployeeController::class, 'myRecord']);
        });

        // Reconciliation
        Route::prefix('reconciliation')->group(function () {
            Route::get('/sessions',                             [ReconciliationController::class, 'indexSessions']);
            Route::post('/sessions',                            [ReconciliationController::class, 'createSession']);
            Route::get('/sessions/{session}',                   [ReconciliationController::class, 'showSession']);
            Route::post('/sessions/{session}/populate',         [ReconciliationController::class, 'populate']);
            Route::post('/sessions/{session}/close',            [ReconciliationController::class, 'closeSession']);
            Route::post('/sessions/{session}/reopen',           [ReconciliationController::class, 'reopenSession']);
            Route::patch('/sessions/{session}/notes',           [ReconciliationController::class, 'updateNotes']);
            Route::get('/sessions/{session}/lines',             [ReconciliationController::class, 'indexLines']);
            Route::put('/lines/{line}',                         [ReconciliationController::class, 'updateLine']);
            Route::put('/lines/{line}/attach-note',             [ReconciliationController::class, 'attachNote']);
        });

        Route::prefix('data-engine')->group(function () {
            Route::get('/export/columns',        [DataEngineController::class, 'exportColumns']);
            Route::post('/export',               [DataEngineController::class, 'export']);
            Route::post('/detect-identifier',    [DataEngineController::class, 'detectIdentifier']);
            Route::post('/diff',                 [DataEngineController::class, 'diff']);
            Route::post('/analyse',              [DataEngineController::class, 'analyse']);
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

            // Shipments (all 3 workflows)
            Route::prefix('shipments')->group(function () {
                Route::post('/',      [OrderShipmentController::class, 'store']);
                Route::patch('/{id}', [OrderShipmentController::class, 'update']);
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
        
    // ============================================
    // INVENTORY — ADMIN / MANAGER
    // ============================================
    Route::middleware('role:admin,super_admin,manager')
        ->prefix('admin/inventory')->middleware('module:extras')
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
                Route::post('/sync-products',  [InventoryController::class, 'itemsSyncProducts']);
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
        Route::prefix('work')->group(function () {
            Route::get('/overview', [WorkController::class, 'teamOverview']);
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

        // ✅ SUPER ADMIN DELETE ORDER
        Route::prefix('orders')->group(function () {
            Route::delete('/{id}/force', [OrderController::class, 'forceDelete']);             // ✅ permanent delete single
            Route::post('/force-delete-multiple', [OrderController::class, 'forceDeleteMultiple']); 
        });


        Route::prefix('quotes')->group(function () {
            Route::delete('/{id}/force', [QuoteController::class, 'forceDelete']);
            Route::post('/force-delete-multiple', [QuoteController::class, 'forceDeleteMultiple']);
        });

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