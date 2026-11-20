<?php

namespace App\Services\Projects;

use App\Models\User;
use App\Services\Security\StepUp\StepUp;
use Illuminate\Http\Request;
use Laravel\Sanctum\PersonalAccessToken;

/**
 * Serious actions (docs/PROJECTS_STAGE2_SPEC.md, build 2.4): the fifth question. A table in Configuration says, for each action on the list
 * below, what it needs before it happens: nothing, the person confirming who they are (Core's step-up: passkey or password again), a
 * supervisor's approval (ProjectApprovals), or both. Only the list of actions that CAN be chosen is in code; what each needs is data.
 *
 * It is asked after the person is known to be allowed to do the thing, so nobody is asked to prove anything for something they may not do.
 */
class ProjectSerious
{
    /** the Core step-up rule Projects asks under (StepUp\Catalogue). Whether it is asked is decided here, per action, not by that rule's own switch. */
    public const RULE = 'projects_serious';

    public const NEEDS = ['none' => 'Nothing', 'identity' => 'Confirm identity', 'supervisor' => 'A supervisor approves', 'both' => 'Identity and a supervisor'];

    /** action => what it is called on the Configuration page. Later stages add theirs (paying out held money, writing off time...). */
    public const ACTIONS = [
        'project.purge' => 'Delete a project for good',
        'project.open_up' => 'Make a confidential project open',
        'project.unfreeze' => 'Unfreeze a project',
        'project.transfer' => 'Hand a project to another lead',
        'project.reopen' => 'Reopen a closed or cancelled project',
        'project.delete' => 'Put a project in the trash',
        'member.remove' => 'Remove someone from a project',
        'role.change' => 'Change what a project role can do',
        'held.pay_out' => 'Pay out of held client money',
        'held.guard_off' => 'Switch off the guard on a client money account',
        'bill.post' => 'Post a bill from a billing plan',
        'retention.release' => 'Release retention to the client',
        'change.approve' => 'Approve a change to the work',
        'time.reopen' => 'Reopen approved time',
        'time.writeoff' => 'Write off time or costs',
        'work.handover' => 'Hand over someone\'s work',
        'case.reveal' => 'Reveal a hidden name in the casebook',
        'guest.link' => 'Give a guest link',
    ];

    /** A sensible set to start from, applied in one click. Out of the box every action needs nothing. */
    public const SUGGESTED = [
        'project.purge' => ['needs' => 'both', 'on_project' => false, 'reason' => true],
        'project.open_up' => ['needs' => 'supervisor', 'on_project' => false, 'reason' => true],
        'project.unfreeze' => ['needs' => 'supervisor', 'on_project' => true, 'reason' => true],
        'project.transfer' => ['needs' => 'identity', 'on_project' => false, 'reason' => false],
        'role.change' => ['needs' => 'supervisor', 'on_project' => false, 'reason' => true],
        'held.pay_out' => ['needs' => 'both', 'on_project' => false, 'reason' => true],
        'held.guard_off' => ['needs' => 'supervisor', 'on_project' => false, 'reason' => true],
        'bill.post' => ['needs' => 'identity', 'on_project' => false, 'reason' => false],
        'retention.release' => ['needs' => 'supervisor', 'on_project' => true, 'reason' => true],
        'change.approve' => ['needs' => 'identity', 'on_project' => false, 'reason' => false],
        'time.reopen' => ['needs' => 'supervisor', 'on_project' => true, 'reason' => true],
        'time.writeoff' => ['needs' => 'supervisor', 'on_project' => true, 'reason' => true],
        'work.handover' => ['needs' => 'supervisor', 'on_project' => false, 'reason' => true],
        'case.reveal' => ['needs' => 'supervisor', 'on_project' => false, 'reason' => true],
        'guest.link' => ['needs' => 'identity', 'on_project' => false, 'reason' => false],
    ];

    private const NONE = ['needs' => 'none', 'on_project' => false, 'reason' => false];

    /** @return array<string, array{needs: string, on_project: bool, reason: bool}> */
    public static function defaults(): array
    {
        return array_fill_keys(array_keys(self::ACTIONS), self::NONE);
    }

    /** @return array<string, array{needs: string, on_project: bool, reason: bool}> */
    public static function suggested(): array
    {
        return array_merge(self::defaults(), self::SUGGESTED);
    }

    /** Check and tidy the table as the Configuration page sends it. @param array<string, mixed> $rules */
    public static function tidy(array $rules): array
    {
        $out = [];
        foreach (self::ACTIONS as $action => $label) {
            $r = is_array($rules[$action] ?? null) ? $rules[$action] : self::NONE;
            $needs = (string) ($r['needs'] ?? 'none');
            if (! isset(self::NEEDS[$needs])) {
                throw new ProjectException("Choose what \"{$label}\" needs from the list.");
            }
            $supervised = in_array($needs, ['supervisor', 'both'], true);
            // a role is not about one project, so its supervisor cannot be asked to be on one
            $out[$action] = ['needs' => $needs, 'on_project' => $supervised && ! in_array($action, ['role.change', 'project.purge', 'held.guard_off'], true) && ! empty($r['on_project']), 'reason' => $needs !== 'none' && ! empty($r['reason'])];
        }

        return $out;
    }

    /** @return array{needs: string, on_project: bool, reason: bool} */
    public function rule(string $action): array
    {
        if (! ProjectsSetup::controlRoom()) {
            return self::NONE;
        }
        $r = app(ProjectSettings::class)->get('serious')[$action] ?? null;

        return is_array($r) ? array_merge(self::NONE, $r) : self::NONE;
    }

    public static function identityReady(): bool
    {
        return StepUp::ready();
    }

    /**
     * Stop here unless this action may go ahead now. Call it after the person is known to be allowed to do the thing.
     * `$payload` is exactly what is being done (it is what a supervisor approves); `$summary` is how a supervisor reads it.
     *
     * @param array<string, mixed> $payload
     * @return callable call it once the action has been carried out: it uses up the approval
     */
    public function gate(Request $request, string $action, ?object $project, array $payload, string $summary): callable
    {
        $rule = $this->rule($action);
        $done = fn () => null;
        if ($rule['needs'] === 'none') {
            return $done;
        }
        $user = $request->user();
        $info = ['action' => $action, 'label' => self::ACTIONS[$action], 'needs' => $rule['needs'], 'reason_required' => $rule['reason']];

        if (in_array($rule['needs'], ['supervisor', 'both'], true)) {
            $approvals = app(ProjectApprovals::class);
            $approval = $approvals->approvedFor($action, $project, $payload, $user);
            if (! $approval) {
                if ($approvals->waitingFor($action, $project, $payload, $user)) {
                    throw new ProjectException('This is waiting for a supervisor. Nothing has changed yet.', 409, ['serious' => ['state' => 'waiting'] + $info]);
                }
                if (! $request->headers->get('X-Projects-Ask')) {
                    throw new ProjectException('This needs a supervisor to approve it first.', 428, ['serious' => ['state' => 'ask'] + $info]);
                }
                $reason = trim(rawurldecode((string) $request->headers->get('X-Projects-Reason', ''))) ?: null;
                if ($rule['reason'] && $reason === null) {
                    throw new ProjectException('Say why this needs doing.', 428, ['serious' => ['state' => 'ask'] + $info]);
                }
                $approval = $approvals->ask('action', $action, $project, $project ? 'project' : null, $project ? (int) $project->id : null, $summary, $payload, $reason, $user, $rule['on_project']);
                $count = $approvals->approvers((object) \Illuminate\Support\Facades\DB::table('project_approvals')->where('id', $approval)->first())->count();
                throw new ProjectException($count ? 'Sent to ' . ($count === 1 ? '1 person' : "{$count} people") . ' who can approve it. Nothing has changed yet.' : 'Asked, but nobody can approve this right now. Nothing has changed. Tell whoever manages Projects.', 409,
                    ['serious' => ['state' => 'asked', 'approvers' => $count] + $info]);
            }
            $done = fn () => $approvals->markUsed((int) $approval->id);
        }

        if (in_array($rule['needs'], ['identity', 'both'], true) && ! config('security.policy.kill_switch')) {
            if (! self::identityReady()) {
                throw new ProjectException('This needs you to confirm who you are, and that is not set up on this system yet. Ask whoever manages security, or change what this action needs in Projects configuration.', 409);
            }
            $stepUp = app(StepUp::class);
            $token = $user->currentAccessToken();
            $token = $token instanceof PersonalAccessToken && $token->getKey() ? $token : null;
            if (! $stepUp->covered($request, $user, $token, self::RULE)) {
                if (! $token) {
                    throw new ProjectException('Please sign in again to do this.', 403);
                }
                throw new ProjectException('One more step: confirm it is really you.', 403, ['step_up' => $stepUp->describe($stepUp->ask($request, $user, $token, self::RULE), $user)]);
            }
        }

        return $done;
    }

    /** For the open project and the trash: what each action needs, so the screen can say so before it is tried. @return array<string, string> action => needs */
    public function needs(): array
    {
        return array_map(fn ($a) => $this->rule($a)['needs'], array_combine(array_keys(self::ACTIONS), array_keys(self::ACTIONS)));
    }
}
