<?php

namespace App\Services\Brochures;

use App\Models\Service;
use App\Models\ServiceSetting;
use App\Models\User;
use App\Services\Books\BooksException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * What a service's brochure says and whether customers may download it. The shop-wide defaults live on the one service-settings row; a service keeps only the
 * choices it has made itself (services.brochure_meta). A choice a service has not made falls back to the default, and a service with no template uses the
 * default template. Until script 92 is run there is nowhere to save, and everything simply uses the built-in defaults.
 */
class BrochureSettings
{
    /** The layouts the website can draw (the layouts themselves are in the website code). */
    public const TEMPLATES = ['classic' => 'Classic', 'modern' => 'Modern', 'minimal' => 'Minimal', 'scrapbook' => 'Scrapbook'];
    public const PRICE = ['show', 'on_request', 'hide'];
    public const SWITCHES = ['download', 'main_image', 'charges', 'policy', 'features', 'deliverables', 'requirements', 'tiers', 'rating'];
    public const MAX_IMAGES = 6;

    public const DEFAULTS = [
        'download' => true, 'template' => 'classic', 'price' => 'show', 'main_image' => true, 'other_images' => 3, 'charges' => true, 'policy' => true,
        'features' => true, 'deliverables' => true, 'requirements' => true, 'tiers' => true, 'rating' => true,
    ];

    public function ready(): bool
    {
        return Schema::hasColumn('services', 'brochure_meta') && Schema::hasTable('service_settings') && Schema::hasColumn('service_settings', 'brochure_defaults');
    }

    /** Keep only known keys, with the right types. Anything unknown or invalid is dropped, so what is stored is always safe to read. */
    public function clean(array $in): array
    {
        $out = [];
        foreach (self::SWITCHES as $k) {
            if (array_key_exists($k, $in) && $in[$k] !== null) {
                $out[$k] = filter_var($in[$k], FILTER_VALIDATE_BOOLEAN);
            }
        }
        if (isset($in['template']) && array_key_exists((string) $in['template'], self::TEMPLATES)) {
            $out['template'] = (string) $in['template'];
        }
        if (isset($in['price']) && in_array($in['price'], self::PRICE, true)) {
            $out['price'] = $in['price'];
        }
        if (isset($in['other_images']) && $in['other_images'] !== '') {
            $out['other_images'] = max(0, min(self::MAX_IMAGES, (int) $in['other_images']));
        }

        return $out;
    }

    /** @return array<string,mixed> the shop-wide defaults: the built-in ones, changed by what staff saved */
    public function defaults(): array
    {
        $saved = [];
        if ($this->ready()) {
            $raw = DB::table('service_settings')->value('brochure_defaults');
            $saved = is_string($raw) ? (json_decode($raw, true) ?: []) : (array) $raw;
        }

        return $this->clean($saved) + self::DEFAULTS;
    }

    /** @return array<string,mixed> what this service has chosen for itself (not its defaults) */
    public function own(Service $s): array
    {
        $raw = $s->brochure_meta ?? null;
        $raw = is_string($raw) ? (json_decode($raw, true) ?: []) : (array) $raw;

        return $this->clean($raw);
    }

    /** @return array<string,mixed> everything the brochure needs to know: the service's own choices over the defaults */
    public function effective(Service $s, ?array $defaults = null): array
    {
        return $this->own($s) + ($defaults ?? $this->defaults());
    }

    public function saveDefaults(array $in, User $by): array
    {
        if (! $this->ready()) {
            throw new BooksException('Run script 92 first: the brochure settings have nowhere to be saved yet.');
        }
        $row = ServiceSetting::current();
        DB::table('service_settings')->where('id', $row->id)->update(['brochure_defaults' => json_encode($this->clean($in) + $this->defaults()), 'updated_by' => $by->id, 'updated_at' => now()]);

        return $this->defaults();
    }

    /**
     * Set some choices on many services at once, and take others back to the default.
     *
     * @param  int[]  $ids
     * @param  array<string,mixed>  $set  choices to apply
     * @param  string[]  $clear  keys to forget, so the service follows the default again
     */
    public function saveForServices(array $ids, array $set, array $clear = []): int
    {
        if (! $this->ready()) {
            throw new BooksException('Run script 92 first: the brochure settings have nowhere to be saved yet.');
        }
        $set = $this->clean($set);
        $n = 0;
        foreach (Service::whereIn('id', array_map('intval', $ids))->get() as $s) {
            $own = array_diff_key($this->own($s), array_flip($clear)) + [];
            $s->forceFill(['brochure_meta' => $set + $own ?: null])->save();
            $n++;
        }

        return $n;
    }
}
