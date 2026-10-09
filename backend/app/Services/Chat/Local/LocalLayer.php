<?php

namespace App\Services\Chat\Local;

use App\Models\Books\VoucherSeries;
use App\Models\CompanyProfile;
use App\Models\User;
use App\Services\Chat\MimiHarmScannerService;
use Illuminate\Support\Facades\Cache;

/** Puts the local brain together from the real company profile, voucher series and settings (config/mimi.php), once per process. */
final class LocalLayer
{
    private ?LocalAnswerer $answerer = null;

    private ?Slots $slots = null;

    /** off | shadow | on */
    public function mode(): string
    {
        $m = strtolower((string) config('mimi.mode', 'shadow'));

        return in_array($m, ['off', 'shadow', 'on'], true) ? $m : 'shadow';
    }

    public function slots(): Slots
    {
        if (! $this->slots) {
            try {
                $prefixes = Cache::remember('mimi_series_prefixes', 600, fn () => VoucherSeries::query()->pluck('prefix')->filter()->unique()->values()->all());
            } catch (\Throwable) {
                $prefixes = [];     // a missing table must not stop Mimi
            }
            $this->slots = new Slots($prefixes);
        }

        return $this->slots;
    }

    public function redactor(): Redactor
    {
        return new Redactor;
    }

    public function answerer(): LocalAnswerer
    {
        if ($this->answerer) {
            return $this->answerer;
        }
        $profile = CompanyProfile::current();
        $kb = Knowledge::fromFile((string) config('mimi.knowledge'), [
            'company.name' => CompanyProfile::name(),
            'support.email' => $profile->email ?: (string) config('mimi.support_email_fallback'),
        ]);
        $scanner = new MimiHarmScannerService;

        return $this->answerer = new LocalAnswerer(
            $kb,
            new Matcher(require (string) config('mimi.synonyms'), $kb->all()),
            $this->slots(),
            ResolverRegistry::all(),
            fn (string $q) => $scanner->scan($q, [])['harm_category'],
            (array) config('mimi.thresholds'),
            (bool) config('mimi.allow_drafts', true),
        );
    }

    public function answer(CallerContext $c, string $message): LocalAnswer
    {
        return $this->answerer()->answer($c, $message);
    }

    /** What may happen when the local layer is not confident, for this kind of account. Staff are never above ai_public. */
    public function fallbackFor(CallerContext $c): string
    {
        $key = in_array($c->kind, ['guest', 'customer', 'staff'], true) ? $c->kind : 'other';
        $m = (string) config("mimi.fallback.{$key}", 'local_only');
        $m = in_array($m, ['local_only', 'ai_public', 'ai_scoped'], true) ? $m : 'local_only';

        return $m === 'ai_scoped' && $c->kind !== 'guest' && $c->kind !== 'customer' ? 'ai_public' : $m;
    }

    public function noAnswerText(): string
    {
        return $this->answerer()->noAnswerText();
    }
}
