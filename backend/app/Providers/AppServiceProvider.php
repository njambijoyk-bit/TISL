<?php

namespace App\Providers;

use Illuminate\Support\ServiceProvider;
use Illuminate\Database\Eloquent\Relations\Relation;
use Illuminate\Auth\Notifications\ResetPassword;
use Illuminate\Auth\Notifications\VerifyEmail;
use Illuminate\Support\Facades\URL;

use App\Services\PromoCodeService;
use App\Services\DarajaService;
use App\Services\LoyaltyService;
use App\Services\HamperEligibilityService;
use App\Services\AlgorithmService;
use App\Services\CatalogueRankingService;
use App\Services\CustomerCreditService;
use App\Services\AuctionActivityService;
use App\Services\SearchAnalyticsService;
use App\Services\AiAnalyticsService;
use App\Services\BugReportService;
use App\Services\Chat\MimiHarmScannerService;
use App\Services\Chat\MimiBlockService;
use App\Services\Chat\MimiSessionService;
use App\Services\Chat\MimiQueryLogService;
use App\Services\Vault\VaultService;
use App\Services\Vault\VaultPolicyService;
use App\Services\Vault\VaultArchiverService;
use App\Services\Inventory\InventoryTransactionService;
use App\Services\Inventory\InventoryOperationsService;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        // Scoped: remembers a person's roles and scope for the length of one request.
        $this->app->scoped(\App\Services\Access\Authorizer::class);
        $this->app->scoped(\App\Services\Access\BranchFilter::class);

        // Scoped, not singleton: holds the per-request display currency.
        $this->app->scoped(\App\Services\CurrencyConversionService::class);

        // Scoped: holds the per-request branch in context (multi-location).
        $this->app->scoped(\App\Services\Location\LocationContext::class);


        $this->app->singleton(\App\Services\Codes\CodeResolvers::class);   // modules register what their signed codes mean
        $this->app->afterResolving(\App\Services\Codes\CodeResolvers::class, fn ($r) => \App\Services\Events\TicketCodes::register($r));   // an event ticket's QR means something
        $this->app->singleton(PromoCodeService::class);
        $this->app->singleton(DarajaService::class);
        $this->app->singleton(LoyaltyService::class);
        $this->app->singleton(HamperEligibilityService::class);
        $this->app->singleton(AlgorithmService::class);
        $this->app->singleton(\App\Services\Stock\StockPolicy::class);   // stock & expiry rules, read once per request
        $this->app->singleton(CatalogueRankingService::class);
        $this->app->singleton(CustomerCreditService::class);
        $this->app->singleton(AuctionActivityService::class);
        $this->app->singleton(SearchAnalyticsService::class);
        $this->app->singleton(AiAnalyticsService::class);
        $this->app->singleton(BugReportService::class);
        $this->app->singleton(MimiHarmScannerService::class);
        $this->app->singleton(MimiBlockService::class);
        $this->app->singleton(MimiSessionService::class);
        $this->app->singleton(MimiQueryLogService::class);
        $this->app->singleton(VaultService ::class);
        $this->app->singleton(VaultPolicyService::class);
        $this->app->singleton(VaultArchiverService::class);
        $this->app->singleton(InventoryTransactionService::class);
        $this->app->singleton(InventoryOperationsService::class, function ($app) {
            return new InventoryOperationsService(
                $app->make(InventoryTransactionService::class)
            );
        });

        // Licensing: one manager per request (memoises the handshake result).
        $this->app->scoped(\App\Services\Licensing\LicenseManager::class);
        $this->app->singleton(\App\Services\Licensing\LicenseActivationService::class);

        // The calculator's insight packs: Core's here, each module adds its own with registry->register() in its provider.
        $this->app->singleton(\App\Services\Insight\InsightRegistry::class, function ($app) {
            $r = new \App\Services\Insight\InsightRegistry($app->make(\App\Services\Licensing\LicenseManager::class));
            foreach ([\App\Services\Insight\Packs\UnitPricePack::class, \App\Services\Insight\Packs\VoucherUnitsPack::class, \App\Services\Insight\Packs\LoyaltyJournalPack::class,
                \App\Services\Insight\Packs\LoyaltySettingsPack::class, \App\Services\Insight\Packs\LoyaltyRulePack::class,
                \App\Services\Insight\Packs\PromoPack::class, \App\Services\Insight\Packs\CustomerDiscountPack::class,
                \App\Services\Insight\Packs\HamperPack::class, \App\Services\Insight\Packs\AuctionPack::class,
                \App\Services\Insight\Packs\ServiceIncomePack::class, \App\Services\Insight\Packs\QuoteIncomePack::class,
                \App\Services\Insight\Packs\ReportPack::class, \App\Services\Insight\Packs\BranchPack::class, \App\Services\Insight\Packs\AttendancePack::class] as $pack) {
                $r->register(new $pack());
            }

            return $r;
        });
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        \App\Services\Security\RateLimits::register();   // throttle:sign-in and the other named doors
        \Laravel\Sanctum\Sanctum::authenticateAccessTokensUsing(fn ($token, bool $valid) => \App\Services\Security\SessionGate::allows($token, $valid));   // a suspended account's open sessions stop working at once
        // Mail goes out from the company's default email address (Books → Settings → Company), under the company's name.
        if (! $this->app->runningInConsole() || ! $this->app->runningUnitTests()) {
            try {
                $from = \App\Models\CompanyProfile::defaultEmail();
                if ($from) {
                    config(['mail.from.address' => $from, 'mail.from.name' => \App\Models\CompanyProfile::name()]);
                }
            } catch (\Throwable) {
                // no company row / cache yet (fresh install, migrations): keep the .env sender
            }
        }

        // Email settings saved on the Notifications screen win over .env; a queue worker re-reads them before every job so a change needs no restart.
        if (! $this->app->runningUnitTests()) {
            try {
                if (\App\Services\Notify\NotifySettings::ready()) {
                    $this->app->make(\App\Services\Notify\MailConfigurator::class)->apply();
                    \Illuminate\Support\Facades\Queue::before(fn () => $this->app->make(\App\Services\Notify\MailConfigurator::class)->apply());
                }
            } catch (\Throwable) {
                // script 108 not run yet: the .env mail settings stay
            }
        }

        // M-Pesa keys saved on the Payment keys screen win over .env (blank fields and nothing saved leave .env in force); a worker re-reads them before every job.
        if (! $this->app->runningUnitTests()) {
            try {
                if (\App\Services\Payments\PaymentSettings::ready()) {
                    $this->app->make(\App\Services\Payments\DarajaConfigurator::class)->apply();
                    \Illuminate\Support\Facades\Queue::before(fn () => $this->app->make(\App\Services\Payments\DarajaConfigurator::class)->apply());
                }
            } catch (\Throwable) {
                // script 116 not run yet: the .env keys stay
            }
        }

        // Seed new variants across branches + keep the product stock total auto-calculated.
        \App\Models\ProductVariant::observe(\App\Observers\ProductVariantObserver::class);
        \App\Models\User::observe(\App\Observers\UserAccessObserver::class);
        \App\Models\Location::observe(\App\Observers\LocationCostCentreObserver::class);
        \App\Models\Books\Voucher::observe(\App\Observers\VoucherDimensionsObserver::class);
        \App\Models\Books\VoucherEntry::observe(\App\Observers\VoucherDimensionsObserver::class);

        ResetPassword::createUrlUsing(function ($user, string $token) {
            return env('FRONTEND_URL', 'http://localhost:5173')
                . '/reset-password?token=' . $token
                . '&email=' . urlencode($user->email);
        });

        // Email verification URL — points to frontend, not a Laravel route
        VerifyEmail::createUrlUsing(function ($notifiable) {
            $frontendUrl = env('FRONTEND_URL', 'http://localhost:5173');

            $verifyUrl = URL::temporarySignedRoute(
                'api.verify.email',
                now()->addMinutes(60),
                [
                    'id'   => $notifiable->getKey(),
                    'hash' => sha1($notifiable->getEmailForVerification()),
                ]
            );

            // Extract query string from backend signed URL and pass to frontend
            $parsed = parse_url($verifyUrl);
            parse_str($parsed['query'] ?? '', $params);

            return $frontendUrl . '/verify-email?' . http_build_query([
                'id'         => $notifiable->getKey(),
                'hash'       => sha1($notifiable->getEmailForVerification()),
                'expires'    => $params['expires'] ?? '',
                'signature'  => $params['signature'] ?? '',
            ]);
        });

        // Short names stored in *_type columns. Must match the aliases the
        // 01_morph_types_to_aliases.sql script wrote — rows saved as e.g.
        // "product" can't be loaded without this.
        Relation::morphMap([
            'employee'                   => \App\Models\Employee::class,
            'customer'                   => \App\Models\Customer::class,
            'currency'                   => \App\Models\Currency::class,
            'product'                    => \App\Models\Product::class,
            'product_variant'            => \App\Models\ProductVariant::class,
            'product_variant_unit'       => \App\Models\ProductVariantUnit::class,
            'service'                    => \App\Models\Service::class,
            'tax_type'                   => \App\Models\TaxType::class,
            'tax_rate'                   => \App\Models\TaxRate::class,
            'tax_rule'                   => \App\Models\TaxRule::class,
            'tax_applicability'          => \App\Models\TaxApplicability::class,
            'tax_legitimacy_certificate' => \App\Models\TaxLegitimacyCertificate::class,
            'withholding_classification' => \App\Models\WithholdingClassification::class,
            'withholding_certificate'    => \App\Models\WithholdingCertificate::class,
            'withholding_credit'         => \App\Models\WithholdingCredit::class,
            'location'                   => \App\Models\Location::class,
        ]);
    }
}