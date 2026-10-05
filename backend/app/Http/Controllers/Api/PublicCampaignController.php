<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Campaign;
use App\Services\Campaigns\CampaignAudience;
use App\Services\Campaigns\CampaignStats;
use App\Services\Campaigns\CampaignStatus;
use App\Services\Campaigns\CatalogueAdapter;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** Campaigns as the public sees them: the list (live, coming, archive), one campaign's page by its address, and the one featured on the homepage. */
class PublicCampaignController extends Controller
{
    public function __construct(private CatalogueAdapter $catalogue, private CampaignStats $stats) {}

    /** Status for this visitor: before the start, early access lets chosen people in as if it were live. */
    private function effective(Campaign $c, $user): array
    {
        $status = CampaignStatus::of($c);
        $early = false;
        if (in_array($status, ['scheduled', 'teaser'], true) && $c->early_access_at && now()->gte($c->early_access_at) && CampaignAudience::allows($user, $c->early_access_audience) && $c->early_access_audience) {
            $status = 'live';
            $early = true;
        }

        return [$status, $early];
    }

    /** A date in the site's own time with its offset, which a browser reads correctly. */
    private function iso($d): ?string
    {
        return $d ? \Carbon\Carbon::instance($d)->setTimezone(config('app.timezone'))->format('Y-m-d\TH:i:sP') : null;
    }

    private function card(Campaign $c, string $status): array
    {
        return ['slug' => $c->slug, 'title' => $c->title, 'subtitle' => $c->subtitle, 'cover_media' => $c->cover_media, 'accent_color' => $c->accent_color, 'starts_at' => $this->iso($c->starts_at), 'ends_at' => $this->iso($c->ends_at), 'status' => $status];
    }

    private function visible($user)
    {
        return Campaign::where('is_published', true)->whereNull('archived_at')->where('is_paused', false)->get()->filter(fn ($c) => CampaignAudience::allows($user, $c->audience_rule));
    }

    /** GET /campaigns: live (live and teaser), coming (scheduled), archive (ended). */
    public function index(Request $request): JsonResponse
    {
        $user = $request->user('sanctum');
        $out = ['live' => [], 'coming' => [], 'archive' => []];
        foreach ($this->visible($user)->sortByDesc('starts_at') as $c) {
            [$status] = $this->effective($c, $user);
            $card = $this->card($c, $status);
            match ($status) { 'live', 'teaser' => $out['live'][] = $card, 'scheduled' => $out['coming'][] = $card, 'ended' => $out['archive'][] = $card, default => null };
        }

        return response()->json($out);
    }

    /** GET /campaigns/featured: the campaign marked for the homepage that is live (or teasing) now, newest first; null when there is none. */
    public function featured(Request $request): JsonResponse
    {
        $user = $request->user('sanctum');
        foreach ($this->visible($user)->where('feature_on_home', true)->sortByDesc('starts_at') as $c) {
            [$status] = $this->effective($c, $user);
            if (in_array($status, ['live', 'teaser'], true)) {
                return response()->json(['data' => $this->card($c, $status)]);
            }
        }

        return response()->json(['data' => null]);
    }

    /** Which sections this visitor sees now. Before the start only the cover and countdown (and anything staff timed to appear) are shown. */
    private function sectionsFor(Campaign $c, string $status, $user): array
    {
        $now = now();
        $out = [];
        foreach ($c->sections as $s) {
            if (! CampaignAudience::allows($user, $s->audience_rule)) {
                continue;
            }
            if (($s->show_from && $now->lt($s->show_from)) || ($s->show_until && $now->gte($s->show_until))) {
                continue;
            }
            if (in_array($status, ['scheduled', 'teaser'], true)) {
                $ok = $s->show_from || in_array($s->type, ['hero', 'countdown'], true) || ($status === 'teaser' && $s->type !== 'products');
                if (! $ok) {
                    continue;
                }
            }
            $out[] = $s;
        }

        return $out;
    }

    /** POST /campaigns/{slug}/event: a visitor viewed the page or clicked something (counted quietly; staff are not counted). */
    public function event(Request $request, string $slug): JsonResponse
    {
        $d = $request->validate(['event' => ['required', 'string', 'max:20'], 'section_id' => ['nullable', 'integer']]);
        $user = $request->user('sanctum');
        $c = Campaign::where('slug', $slug)->where('is_published', true)->whereNull('archived_at')->where('is_paused', false)->first();
        if ($c && CampaignAudience::allows($user, $c->audience_rule)) {
            $this->stats->record($c, $d['event'], $d['section_id'] ?? null, $user, $request);
        }

        return response()->json(['ok' => true]);
    }

    /** GET /campaigns/{slug} */
    public function show(Request $request, string $slug): JsonResponse
    {
        $user = $request->user('sanctum');
        $c = Campaign::with(['sections', 'items'])->where('slug', $slug)->where('is_published', true)->whereNull('archived_at')->where('is_paused', false)->first();
        abort_unless($c && CampaignAudience::allows($user, $c->audience_rule), 404, 'Campaign not found.');
        [$status, $early] = $this->effective($c, $user);
        $sections = $this->sectionsFor($c, $status, $user);

        $items = $c->items->groupBy('section_id');
        $shown = [];
        $want = [];
        foreach ($sections as $s) {
            $list = $s->type === 'products' ? $items->get($s->id, collect()) : collect();
            foreach ($list as $i) {
                $want[] = ['item_type' => $i->item_type, 'item_id' => $i->item_id];
            }
            $shown[] = ['id' => $s->id, 'type' => $s->type, 'settings' => $s->settings, 'show_from' => $this->iso($s->show_from), 'show_until' => $this->iso($s->show_until),
                'items' => $list->map(fn ($i) => ['item_type' => $i->item_type, 'item_id' => $i->item_id, 'available_from' => $this->iso($i->available_from), 'label_override' => $i->label_override])->values()];
        }
        $resolved = $this->catalogue->describe($want);

        return response()->json(['campaign' => $this->card($c, $status) + ['early_access' => $early, 'goal' => $c->goal], 'sections' => $shown, 'resolved' => $resolved]);
    }
}
