<?php

namespace App\Services\Security\StepUp;

use App\Models\CompanyProfile;
use App\Models\Security\AuthPendingAction;
use App\Models\User;
use App\Services\Security\Passkeys\Challenges;
use App\Services\Security\Passkeys\CredentialStore;
use App\Services\Security\Passkeys\PasskeyException;
use App\Services\Security\Passkeys\Passkeys;
use App\Services\Security\SecurityLog;
use App\Services\Security\SecuritySettings;
use App\Services\Security\Sessions;
use Illuminate\Http\Request;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;
use Laravel\Sanctum\PersonalAccessToken;

/**
 * "Ask for more proof only when it matters." For each sensitive action in the Catalogue:
 *
 *  1. the route says which rule it is (`assurance:payment_keys`), after its own permission check: authorization always comes first;
 *  2. if the owner has the rule switched on and the person has not just proved themselves for this, the server writes down WHAT is being asked (the facts, from its own record: who, where, what, every value),
 *     and answers "one more step", handing back that record's number;
 *  3. the person answers the question with their passkey (or, where the rule allows, their password), after reading the facts and, for the serious ones, saying why. A passkey answer is bound to that very record:
 *     the question the device signs belongs to it alone, so a recorded approval can not authorize anything else, and can not be used twice;
 *  4. the action is tried again carrying the record's number; the server checks it is the same action, from the same sign-in, answered, unused and not out of date, and only then lets it through.
 *
 * Off (the default) nothing is asked. Test: nothing is asked but each time one WOULD have been is written to the log, so the owner sees what switching it on would mean.
 */
final class StepUp
{
    /** How long a question stays open to be answered. */
    public const PENDING_MINUTES = 5;

    public function __construct(private SecuritySettings $settings, private Sessions $sessions, private CredentialStore $store, private Passkeys $passkeys, private Challenges $challenges)
    {
    }

    private static ?bool $ready = null;

    public static function forget(): void
    {
        self::$ready = null;
    }

    /** Has database script 128 been run (and are sessions strength-aware)? Until then nothing is ever asked. */
    public static function ready(): bool
    {
        return self::$ready ??= Schema::hasTable('auth_pending_actions') && Sessions::strongTracked();
    }

    /** off | log | enforce for one rule. The emergency switch in the server's settings puts every rule to sleep. */
    public function mode(string $rule): string
    {
        if (config('security.policy.kill_switch') || ! self::ready() || ! Catalogue::has($rule)) {
            return 'off';
        }
        $mode = (string) $this->settings->get("stepup.{$rule}.mode", 'off');

        return in_array($mode, ['log', 'enforce'], true) ? $mode : 'off';
    }

    // ------------------------------------------------------------ the question

    /** Everything that matters about a request, in a fixed order, as one fingerprint: change one value and it is a different action. */
    public function paramsHash(Request $request, User $user, string $rule): string
    {
        $ignore = Catalogue::rule($rule)['ignore'];
        $input = $this->plain($request->except($ignore));

        return hash('sha256', json_encode([(int) $user->getKey(), $rule, strtoupper($request->method()), $request->route()?->uri() ?? $request->path(), $request->route()?->parameters() ?? [], $input]));
    }

    /** @param array<mixed> $data @return array<mixed> */
    private function plain(array $data): array
    {
        $out = [];
        foreach ($data as $k => $v) {
            if ($v instanceof UploadedFile) {
                $out[$k] = '[file '.$v->getClientOriginalName().' '.$v->getSize().']';
            } else {
                $out[$k] = is_array($v) ? $this->plain($v) : $v;
            }
        }
        ksort($out);

        return $out;
    }

    /**
     * What the screen will show, from the server's own reading of the request: who is acting, for which company, what is being done and every value being sent (secrets are only named).
     *
     * @return array<int, array{label: string, value: string}>
     */
    public function facts(Request $request, User $user, string $rule): array
    {
        if (! self::$factsLoaded) {
            self::$factsLoaded = true;
            Facts::register();
        }
        $r = Catalogue::rule($rule);
        $facts = [
            ['label' => 'Who', 'value' => trim($user->name.' ('.$user->email.')')],
            ['label' => 'Company', 'value' => (string) CompanyProfile::name()],
            ['label' => 'What', 'value' => $r['label']],
        ];
        $described = false;
        if (isset(self::$describers[$rule])) {
            try {
                $own = [];
                foreach ((array) (self::$describers[$rule])($request, $user) as $fact) {
                    $own[] = $fact;
                }
                $facts = array_merge($facts, $own);
                $described = true;
            } catch (\Throwable $e) {
                report($e);   // a screen that can not say it nicely still says it plainly: the plain list below
            }
        }
        if (! $described) {
            foreach ($this->plain($request->except($r['ignore'])) as $key => $value) {
                $secret = (bool) preg_match('/pass|secret|token|key|pin|cvv/i', (string) $key);
                $text = is_scalar($value) || $value === null ? (string) json_encode($value) : json_encode($value, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
                $facts[] = ['label' => Str::headline((string) $key), 'value' => $secret ? '••••••••' : Str::limit(trim($text, '"'), 160)];
            }
        }
        foreach (self::$extraFacts[$rule] ?? [] as $builder) {
            foreach ((array) $builder($request, $user) as $fact) {
                $facts[] = $fact;
            }
        }

        return $facts;
    }

    /** @var array<string, array<int, callable>> what a rule's screen shows beyond the plain facts (the amount, the account, the person affected), registered by the feature that owns the action */
    private static array $extraFacts = [];

    /** @var array<string, callable> a rule's own way of saying what is being asked, in place of the plain list of values (the person's name, the account, the amount) */
    private static array $describers = [];

    public static function describeAs(string $rule, callable $builder): void
    {
        self::$describers[$rule] = $builder;
    }

    /** The built-in wording (see Facts): used unless something else has already said how this rule is described. */
    public static function describeDefault(string $rule, callable $builder): void
    {
        self::$describers[$rule] ??= $builder;
    }

    private static bool $factsLoaded = false;

    public static function addFacts(string $rule, callable $builder): void
    {
        self::$extraFacts[$rule][] = $builder;
    }

    public static function forgetFacts(): void
    {
        self::$extraFacts = [];
        self::$describers = [];
        self::$factsLoaded = false;
    }

    /** Write the question down. An identical one still open is reused, so pressing the button twice does not pile them up. */
    public function ask(Request $request, User $user, PersonalAccessToken $token, string $rule): AuthPendingAction
    {
        $hash = $this->paramsHash($request, $user, $rule);
        $open = AuthPendingAction::where('user_id', $user->id)->where('token_id', $token->id)->where('rule', $rule)->where('params_hash', $hash)
            ->whereNull('approved_at')->whereNull('cancelled_at')->where('expires_at', '>', now())->first();
        if ($open) {
            return $open;
        }
        $r = Catalogue::rule($rule);
        $this->sweep();
        $pending = AuthPendingAction::create(['id' => Str::random(40), 'user_id' => $user->id, 'token_id' => $token->id, 'rule' => $rule, 'params_hash' => $hash, 'facts' => $this->facts($request, $user, $rule),
            'strength_needed' => $r['strength'], 'reason_required' => $r['reason'], 'needs_second_person' => $r['two'], 'expires_at' => now()->addMinutes(self::PENDING_MINUTES)]);
        SecurityLog::record('stepup_asked', $user, $request, ['rule' => $rule, 'pending' => $pending->id]);

        return $pending;
    }

    /** What the website is told: the question, in the words the screen needs. @return array<string, mixed> */
    public function describe(AuthPendingAction $p, User $user): array
    {
        $r = Catalogue::rule($p->rule);
        $hasPasskey = $this->store->usableFor($user)->isNotEmpty();

        return ['pending' => $p->id, 'rule' => $p->rule, 'label' => $r['label'], 'class' => $r['class'], 'strength' => $p->strength_needed, 'reason_required' => $p->reason_required, 'needs_second_person' => $p->needs_second_person,
            'facts' => $p->facts, 'expires_at' => $p->expires_at->toIso8601String(), 'has_passkey' => $hasPasskey, 'can_use_password' => $this->passwordAllowed($user, $p->strength_needed), 'approved' => $p->approved_at !== null];
    }

    private function passwordAllowed(User $user, int $strength): bool
    {
        if ($strength <= 1) {
            return true;
        }

        return (bool) config('security.stepup.password_fallback', true) && $this->store->usableFor($user)->isEmpty();   // no passkey to ask for: the password, until the person has one
    }

    // ------------------------------------------------------------ the answer

    /** The context the device's question is tied to: this record and this exact action, nothing else. */
    public function contextFor(AuthPendingAction $p): string
    {
        return hash('sha256', "step-up|{$p->id}|{$p->params_hash}|{$p->user_id}");
    }

    private function mine(User $user, ?PersonalAccessToken $token, string $id): AuthPendingAction
    {
        $p = AuthPendingAction::where('id', $id)->where('user_id', $user->id)->when($token, fn ($q) => $q->where('token_id', $token->id))->first();
        if (! $p) {
            throw new StepUpException('That question was not found. Please try the action again.', 'unknown', 404);
        }

        return $p;
    }

    /** @return array{id: string, options: array<string, mixed>} the question the device signs: it belongs to this record alone */
    public function options(User $user, PersonalAccessToken $token, string $id, ?Request $request = null): array
    {
        $p = $this->mine($user, $token, $id);
        if (! $p->open()) {
            throw new StepUpException('That question has run out or was already answered. Please try the action again.', 'closed', 410);
        }
        try {
            return $this->passkeys->proofOptions($user, $request, Challenges::STEP_UP, $this->contextFor($p));
        } catch (PasskeyException $e) {
            throw new StepUpException($e->getMessage(), $e->reason, $e->httpStatus, $e);
        }
    }

    /**
     * The person answers. With a passkey (`challenge_id` + `credential`) or, where the rule allows it, their password. Critical actions also need a reason.
     *
     * @param array<string, mixed> $proof
     */
    public function approve(User $user, PersonalAccessToken $token, string $id, array $proof, ?string $reason, ?Request $request = null): AuthPendingAction
    {
        $p = $this->mine($user, $token, $id);
        if (! $p->open()) {
            throw new StepUpException('That question has run out or was already answered. Please try the action again.', 'closed', 410);
        }
        $rule = Catalogue::rule($p->rule);
        $reason = trim((string) $reason);
        if ($p->reason_required && mb_strlen($reason) < 3) {
            throw new StepUpException('Say why, in a few words. It is written in the log.', 'reason_needed');
        }
        $credentialId = null;
        if (isset($proof['credential'])) {
            $credentialId = $this->approveWithPasskey($user, $token, $p, $rule, (string) ($proof['challenge_id'] ?? ''), (array) $proof['credential'], $request);
            $with = 'passkey';
        } else {
            if (! $this->passwordAllowed($user, $p->strength_needed)) {
                throw new StepUpException('This needs your passkey.', 'passkey_needed', 403);
            }
            if (! Hash::check((string) ($proof['current_password'] ?? ''), (string) $user->password)) {
                SecurityLog::record('stepup_failed', $user, $request, ['rule' => $p->rule, 'why' => 'wrong_password'], SecurityLog::WARNING);
                throw new StepUpException('That password is not right.', 'wrong_password');
            }
            $with = 'password';
        }

        $p->forceFill(['approved_at' => now(), 'approved_with' => $with, 'approved_credential_id' => $credentialId, 'reason' => $reason !== '' ? mb_substr($reason, 0, 300) : null,
            'covers_until' => $rule['window'] ? now()->addMinutes($rule['fresh']) : null,
            'expires_at' => now()->addMinutes(self::PENDING_MINUTES)])->save();   // the retry has a few minutes from now
        SecurityLog::record('stepup_approved', $user, $request, ['rule' => $p->rule, 'pending' => $p->id, 'with' => $with, 'reason' => $p->reason, 'second_person_needed' => $p->needs_second_person], SecurityLog::NOTICE);

        return $p->refresh();
    }

    /** @param array<string, mixed> $rule @param array<string, mixed> $credential */
    private function approveWithPasskey(User $user, PersonalAccessToken $token, AuthPendingAction $p, array $rule, string $challengeId, array $credential, ?Request $request): int
    {
        try {
            $row = $this->challenges->take($challengeId, Challenges::STEP_UP, $user->id);
            if (! hash_equals((string) $row->context_hash, $this->contextFor($p))) {
                throw new PasskeyException('That passkey answer was meant for something else. Please try again.', 'wrong_context');   // a recorded answer to another question is no use here
            }
            $credential = $this->passkeys->answerFor($user, $row, $credential, $request)['credential'];
        } catch (PasskeyException $e) {
            SecurityLog::record('stepup_failed', $user, $request, ['rule' => $p->rule, 'why' => $e->reason], SecurityLog::WARNING);
            throw new StepUpException($e->getMessage(), $e->reason, $e->httpStatus, $e);
        }
        // a passkey added a moment ago may belong to whoever just got into the account: for the serious things it must have been there a while
        $hours = (int) config('security.stepup.new_passkey_hours', 24);
        if ($rule['class'] === 'critical' && $hours > 0 && $credential->created_at && $credential->created_at->gt(now()->subHours($hours))) {
            SecurityLog::record('stepup_failed', $user, $request, ['rule' => $p->rule, 'why' => 'passkey_too_new', 'credential' => $credential->id], SecurityLog::WARNING);
            throw new StepUpException("This passkey was added less than {$hours} hours ago. For something this serious, use a passkey that has been on your account longer, or wait.", 'passkey_too_new', 403);
        }
        $this->sessions->markStrong($token, $credential->id);   // the session is now strong and fresh, as after any proof

        return $credential->id;
    }

    public function cancel(User $user, PersonalAccessToken $token, string $id): void
    {
        $p = $this->mine($user, $token, $id);
        if ($p->approved_at === null && $p->cancelled_at === null) {
            $p->forceFill(['cancelled_at' => now()])->save();
            SecurityLog::record('stepup_cancelled', $user, null, ['rule' => $p->rule, 'pending' => $p->id]);
        }
    }

    // ------------------------------------------------------------ the retry

    /**
     * Has the person already answered for this? The retried request carries the record's number (`X-Step-Up`): it must be this person's, from this sign-in, for this rule, answered, and (for a single action)
     * for exactly this request and not used. A rule that allows a run is also covered, without a number, while an earlier answer for it is still in its window. Single approvals are used up here.
     */
    public function covered(Request $request, User $user, ?PersonalAccessToken $token, string $rule): bool
    {
        if (! $token) {
            return false;
        }
        $r = Catalogue::rule($rule);
        $id = (string) $request->header('X-Step-Up', '');
        if ($id !== '') {
            $p = AuthPendingAction::where('id', $id)->where('user_id', $user->id)->where('token_id', $token->id)->where('rule', $rule)->whereNotNull('approved_at')->whereNull('cancelled_at')->first();
            if ($p) {
                if ($r['window']) {
                    if ($p->covers_until && $p->covers_until->isFuture()) {
                        return true;
                    }
                } elseif ($p->used_at === null && $p->expires_at->isFuture() && hash_equals($p->params_hash, $this->paramsHash($request, $user, $rule))) {
                    // used up in the same instant it is checked, so two copies of the request arriving together can not both pass
                    return AuthPendingAction::where('id', $p->id)->whereNull('used_at')->update(['used_at' => now()]) === 1;
                }
            }
        }
        if ($r['window']) {
            return AuthPendingAction::where('user_id', $user->id)->where('token_id', $token->id)->where('rule', $rule)->whereNotNull('approved_at')->whereNull('cancelled_at')->where('covers_until', '>', now())->exists();
        }

        return false;
    }

    /** "Test" mode: say, once in a while per sign-in, that this would have been asked. */
    public function noteWouldAsk(Request $request, User $user, ?PersonalAccessToken $token, string $rule): void
    {
        if (Cache::add('stepup-would:'.$rule.':'.($token?->id ?? 0), 1, now()->addMinutes(10))) {
            SecurityLog::record('stepup_would_ask', $user, $request, ['rule' => $rule]);
        }
    }

    private function sweep(): void
    {
        if (random_int(1, 20) === 1) {
            AuthPendingAction::where('expires_at', '<', now()->subDay())->delete();
        }
    }
}
