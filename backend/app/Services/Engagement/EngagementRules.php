<?php

namespace App\Services\Engagement;

use App\Models\EngagementSetting;
use App\Models\User;
use App\Services\Books\BooksException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Reads and saves the engine's settings: the rule for each target and action, the proof-of-purchase switches, the report settings and the blocked words.
 * A rule with no saved row follows the preset that was last applied, so a fresh install works before anything is saved.
 */
class EngagementRules
{
    private const SWITCHES = ['enabled', 'paid_required', 'delivered_required', 'service_completed_counts', 'service_late_fee_counts', 'service_noshow_counts', 'service_free_cancel_counts', 'notify_author'];

    public function settings(): EngagementSetting
    {
        return EngagementSetting::current();
    }

    /** @return array<string,array<string,array>> */
    public function rules(): array
    {
        $out = EngagementPresets::rules($this->preset());
        if (Schema::hasTable('engagement_rules')) {
            foreach (DB::table('engagement_rules')->get() as $row) {
                if (EngagementTargets::has($row->target_type, $row->action)) {
                    $out[$row->target_type][$row->action] = $this->clean($row->target_type, $row->action, json_decode($row->settings, true) ?: []);
                }
            }
        }

        return $out;
    }

    public function rule(string $type, string $action): array
    {
        return $this->rules()[$type][$action] ?? EngagementPresets::BASE;
    }

    private function preset(): string
    {
        $p = $this->settings()->preset;

        return isset(EngagementPresets::ALL[$p]) ? $p : 'verified_buyers';
    }

    /** Only the fields this action has, checked and cut to size; the rest take the base value. */
    public function clean(string $type, string $action, array $in): array
    {
        $fields = EngagementTargets::ACTIONS[$action]['fields'];
        $r = EngagementPresets::BASE;
        $r['enabled'] = (bool) ($in['enabled'] ?? false);
        if (in_array('who', $fields, true) && isset($in['who'])) {
            $r['who'] = array_key_exists($in['who'], EngagementTargets::WHO) ? $in['who'] : 'signed_in';
        }
        if (in_array('must_have_bought', $fields, true) && (EngagementTargets::find($type)['commerce'] ?? false)) {
            $r['must_have_bought'] = (bool) ($in['must_have_bought'] ?? false);
        }
        if (in_array('hold', $fields, true) && isset($in['hold'])) {
            $r['hold'] = array_key_exists($in['hold'], EngagementTargets::HOLD) ? $in['hold'] : 'never';
        }
        foreach (['one_per_person', 'photos'] as $k) {
            if (in_array($k, $fields, true) && isset($in[$k])) {
                $r[$k] = (bool) $in[$k];
            }
        }
        foreach (['edit_minutes' => 10080, 'min_words' => 500, 'daily_limit' => 500] as $k => $max) {
            if (in_array($k, $fields, true) && isset($in[$k])) {
                $r[$k] = max(0, min($max, (int) $in[$k]));
            }
        }
        // someone who must have bought it has to be signed in as a customer
        if ($r['must_have_bought'] && in_array($r['who'], ['everyone', 'signed_in'], true)) {
            $r['who'] = 'customers';
        }

        return $r;
    }

    private function words(mixed $raw): array
    {
        $list = is_array($raw) ? $raw : preg_split('/[,\n]+/', (string) $raw);
        $out = [];
        foreach ($list as $w) {
            $w = mb_strtolower(trim((string) $w));
            if ($w !== '' && mb_strlen($w) <= 40 && ! in_array($w, $out, true)) {
                $out[] = $w;
            }
        }

        return array_slice($out, 0, 200);
    }

    public function reasons(): array
    {
        if (! Schema::hasTable('engagement_report_reasons')) {
            return ['Spam or advertising', 'Rude or abusive', 'Not appropriate', 'Wrong or misleading', "Someone else's work", 'Other'];
        }

        return DB::table('engagement_report_reasons')->where('active', true)->orderBy('position')->orderBy('id')->pluck('label')->all();
    }

    private function saveReasons(array $labels): void
    {
        $labels = array_values(array_unique(array_filter(array_map(fn ($l) => mb_substr(trim((string) $l), 0, 60), $labels))));
        if (count($labels) < 1) {
            throw new BooksException('Keep at least one reason people can pick when they report something.');
        }
        DB::table('engagement_report_reasons')->delete();
        foreach (array_slice($labels, 0, 20) as $i => $l) {
            DB::table('engagement_report_reasons')->insert(['label' => $l, 'position' => $i + 1, 'active' => true]);
        }
    }

    /** The preset whose rules match what is saved now, else "custom". */
    private function matching(): string
    {
        $now = $this->rules();
        foreach (array_keys(EngagementPresets::ALL) as $p) {
            if (EngagementPresets::rules($p) == $now) {
                return $p;
            }
        }

        return 'custom';
    }

    private function log(string $action, ?User $by, string $note, array $meta = []): void
    {
        if (Schema::hasTable('engagement_log')) {
            DB::table('engagement_log')->insert(['target_type' => 'settings', 'target_id' => 0, 'action' => $action, 'actor_user_id' => $by?->id, 'note' => mb_substr($note, 0, 500), 'meta' => $meta ? json_encode($meta) : null, 'created_at' => now()]);
        }
    }

    private function requireTables(): void
    {
        if (! EngagementSetting::ready() || ! Schema::hasTable('engagement_rules')) {
            throw new BooksException('The Engagement Engine tables are not set up yet. Ask an admin to run script 86.');
        }
    }

    /** @param array $in { settings: {...}, rules: {type: {action: {...}}}, reasons: [..] } */
    public function save(array $in, User $by): void
    {
        $this->requireTables();
        DB::transaction(function () use ($in, $by) {
            $s = $this->settings();
            $c = [];
            foreach (self::SWITCHES as $k) {
                if (isset($in['settings']) && array_key_exists($k, $in['settings'])) {
                    $c[$k] = (bool) $in['settings'][$k];
                }
            }
            $st = $in['settings'] ?? [];
            if (isset($st['auto_hide_reports'])) {
                $c['auto_hide_reports'] = max(0, min(100, (int) $st['auto_hide_reports']));
            }
            if (isset($st['notify_approvers'])) {
                $c['notify_approvers'] = in_array($st['notify_approvers'], ['daily', 'each', 'none'], true) ? $st['notify_approvers'] : 'daily';
            }
            if (array_key_exists('blocked_words', $st)) {
                $c['blocked_words'] = $this->words($st['blocked_words']);
            }
            foreach (($in['rules'] ?? []) as $type => $actions) {
                foreach ((array) $actions as $action => $rule) {
                    if (EngagementTargets::has($type, $action)) {
                        DB::table('engagement_rules')->updateOrInsert(['target_type' => $type, 'action' => $action], ['settings' => json_encode($this->clean($type, $action, (array) $rule)), 'updated_at' => now()]);
                    }
                }
            }
            if (isset($in['reasons'])) {
                $this->saveReasons((array) $in['reasons']);
            }
            $s->forceFill($c + ['preset' => $this->matching(), 'updated_by' => $by->id, 'updated_at' => now()])->save();
            $this->log('settings', $by, 'Engagement settings changed');
        });
        app(EngagementNotices::class)->sync();   // a changed task setting takes effect now
    }

    public function applyPreset(string $key, User $by): void
    {
        if (! isset(EngagementPresets::ALL[$key])) {
            throw new BooksException('Choose one of the presets.');
        }
        $this->requireTables();
        DB::transaction(function () use ($key, $by) {
            foreach (EngagementPresets::rules($key) as $type => $actions) {
                foreach ($actions as $action => $rule) {
                    DB::table('engagement_rules')->updateOrInsert(['target_type' => $type, 'action' => $action], ['settings' => json_encode($rule), 'updated_at' => now()]);
                }
            }
            $this->settings()->forceFill(['preset' => $key, 'updated_by' => $by->id, 'updated_at' => now()])->save();
            $this->log('preset', $by, 'Applied the "' . EngagementPresets::ALL[$key]['label'] . '" preset', ['preset' => $key]);
        });
    }
}
