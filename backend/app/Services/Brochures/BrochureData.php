<?php

namespace App\Services\Brochures;

use App\Models\Service;
use App\Models\ServiceRequirement;
use App\Services\Books\ServiceFeeService;
use App\Services\BookingTermsService;
use Illuminate\Support\Facades\Schema;

/**
 * Everything a service brochure shows, as plain data, with the service's brochure choices already applied (what to leave out is left out here, so a hidden price
 * or policy never reaches the browser). The website draws it onto the chosen template and saves the pages as a PDF.
 */
class BrochureData
{
    private const CONDITIONS = ['always' => '', 'onsite' => 'when the work is on site', 'urgent' => 'for urgent requests', 'after_hours' => 'outside normal hours', 'group' => 'for groups'];

    public function __construct(private BookingTermsService $terms, private ServiceFeeService $fees) {}

    /** @param array<string,mixed> $set the service's effective brochure settings */
    public function build(Service $s, array $set): array
    {
        $s->loadMissing(['category', 'currency:id,code,symbol']);
        $abs = fn (?string $u) => $u ? (str_starts_with($u, 'http') ? $u : asset($u)) : null;
        $list = fn ($v) => collect(is_array($v) ? $v : [])->map(fn ($x) => trim((string) $x))->filter()->values()->all();

        $main = ($set['main_image'] && $s->main_image) ? $s->main_image_url : null;
        $others = collect($s->images_url ?? [])->filter()->take((int) $set['other_images'])->values()->all();

        // the figures the website formats into the shopper's currency: left out when the price is hidden
        $priceMode = $set['price'];
        $service = $s->makeHidden(['admin_notes', 'created_by', 'updated_by', 'brochure_meta', 'meta_title', 'meta_description', 'meta_keywords', 'related_services'])->toArray();
        if ($priceMode !== 'show') {
            foreach (['base_price', 'hourly_rate', 'daily_rate', 'minimum_charge', 'display_price', 'display_price_incl', 'display_tax'] as $k) {
                $service[$k] = null;
            }
        }

        return [
            'service' => $service,
            'settings' => $set,
            'category' => $s->category?->name,
            'url' => url('/services/' . $s->id),
            'price_mode' => $priceMode,
            'negotiable' => (bool) $s->price_is_negotiable,
            'image_main' => $main,
            'image_others' => $others,
            'features' => $set['features'] ? $list($s->features) : [],
            'deliverables' => $set['deliverables'] ? $list($s->deliverables) : [],
            'requirements' => $set['requirements'] ? $list($s->requirements) : [],
            'questions' => $set['requirements'] ? $this->questions($s) : [],
            'packages' => $set['tiers'] ? $this->packages($s, $priceMode === 'show') : [],
            'charges' => $set['charges'] ? $this->charges($s) : [],
            'policy' => $set['policy'] ? $this->policy() : null,
            'rating' => $set['rating'] && (float) $s->rating > 0 ? ['value' => (float) $s->rating, 'count' => (int) $s->review_count] : null,
            'video' => $s->video,
        ];
    }

    /**
     * The packages (the service's options): each with its OWN price and tax and the branches that offer it, so the brochure no longer shows only the service's general price.
     * The prices are left out when the brochure hides the price.
     */
    private function packages(Service $s, bool $showPrice): array
    {
        try {
            $lines = app(\App\Services\Catalogue\PriceLines::class)->forService($s);
            $book = app(\App\Services\Booking\BookingService::class);
        } catch (\Throwable) {
            return [];
        }
        if (! $s->variants()->active()->exists()) {
            return [];   // a service with no packages is described by its general price alone
        }

        return array_map(function ($l) use ($s, $book, $showPrice) {
            try {
                $branches = array_column($book->branchesFor($s, $l['variant_id'] ?? null), 'name');
            } catch (\Throwable) {
                $branches = [];
            }

            return ['name' => $l['variant'] ?: $s->name, 'unit' => $l['unit'], 'price' => $showPrice ? $l['price'] : null, 'strike' => $showPrice ? $l['original_price'] : null,
                'tax_name' => $showPrice ? $l['tax_name'] : null, 'tax_amount' => $showPrice ? $l['tax_amount'] : null, 'branches' => $branches];
        }, $lines);
    }

    /** What a customer is asked when they request the service. */
    private function questions(Service $s): array
    {
        if (! Schema::hasTable('service_requirements')) {
            return [];
        }

        return ServiceRequirement::where('service_id', $s->id)->orderBy('position')->get()
            ->map(fn ($r) => ['label' => $r->label, 'type' => $r->field_type, 'required' => (bool) $r->is_required, 'help' => $r->help_text, 'choices' => $r->choices])->all();
    }

    /** The fees this service carries (a deposit, a call-out, a late cancellation fee...), with when each applies. */
    private function charges(Service $s): array
    {
        try {
            $rows = $this->fees->forService($s);
        } catch (\Throwable) {
            return [];
        }

        return collect($rows)->filter(fn ($r) => ! empty($r['is_enabled']) && ($r['amount'] ?? null) !== null)
            ->map(fn ($r) => [
                'name' => $r['ledger']['name'], 'amount' => (float) $r['amount'], 'basis' => $r['basis'], 'unit' => $r['unit'] ?? '', 'refundable' => (bool) $r['refundable'],
                'when' => self::CONDITIONS[$r['condition']] ?? '', 'condition_value' => $r['condition_value'],
            ])->values()->all();
    }

    /** The booking policy as plain text, with its placeholders filled in. */
    private function policy(): ?array
    {
        try {
            $p = $this->terms->render($this->terms->ensure());
        } catch (\Throwable) {
            return null;
        }
        if (! $p->is_active) {
            return null;
        }
        $text = preg_replace(['/^#{1,6}\s*/m', '/\*\*(.*?)\*\*/s', '/\*(.*?)\*/s', '/`/'], ['', '$1', '$1', ''], (string) $p->content);
        $text = trim(preg_replace("/\n{3,}/", "\n\n", $text));

        return ['title' => (string) $p->title, 'text' => $text];
    }
}
