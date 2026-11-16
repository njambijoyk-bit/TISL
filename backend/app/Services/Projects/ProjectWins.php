<?php

namespace App\Services\Projects;

use App\Models\User;
use Illuminate\Support\Facades\DB;

/**
 * Winning (docs/PROJECTS_STAGE3_SPEC.md, build 3.2). A lead that is won becomes a customer: the one record TISL already uses as the account
 * and the Books ledger. Its contacts, history, next actions and opportunities move to the client. An opportunity that is won can start the
 * project there and then, already tied to the client. All of it happens or none of it.
 */
class ProjectWins
{
    public function __construct(private ProjectLeads $leads, private ProjectPipeline $pipeline, private ClientMaker $maker) {}

    /** Make a lead a client. Needs `projects.clients.manage`: it creates a customer. @return int the customer's id */
    public function makeClient(object $lead, User $by): int
    {
        if ($lead->customer_id) {
            return (int) $lead->customer_id;
        }
        if (! $by->hasPermission('projects.clients.manage')) {
            ProjectLog::refused(null, $by, 'lead.won', 'Does not hold projects.clients.manage', 'lead', (int) $lead->id);
            throw new ProjectException('Making a lead a client creates a customer, and you may not do that. Ask someone who manages clients.', 403);
        }
        if ($lead->status === 'lost') {
            throw new ProjectException('That lead was lost. Bring it back first.');
        }

        return DB::transaction(function () use ($lead, $by) {
            // a company with a named person: the company is the customer and the person its contact. A lead that is a person: their own name.
            $person = $lead->contact_name ?: $lead->name;
            $parts = preg_split('/\s+/', trim($person), 2);
            $id = $this->maker->make(array_filter(['first_name' => $parts[0] ?? $person, 'last_name' => $parts[1] ?? '', 'company_name' => $lead->contact_name ? $lead->name : null,
                'email' => $lead->email, 'phone' => $lead->phone, 'notes' => $lead->notes], fn ($v) => $v !== null));
            DB::table('customers')->where('id', $id)->update(['projects_lead_id' => $lead->id, 'projects_client_since' => now()->format('Y-m-d'), 'projects_account_manager_id' => $lead->owner_id]);
            DB::table('project_leads')->where('id', $lead->id)->update(['status' => 'won', 'customer_id' => $id, 'won_at' => now(), 'lost_reason_id' => null, 'lost_note' => null, 'updated_at' => now()]);
            // everything known about the lead is now known about the client
            DB::table('project_opportunities')->where('lead_id', $lead->id)->update(['customer_id' => $id]);
            DB::table('project_contacts')->where('owner_type', 'lead')->where('owner_id', $lead->id)->update(['owner_type' => 'customer', 'owner_id' => $id]);
            DB::table('project_interactions')->where('subject_type', 'lead')->where('subject_id', $lead->id)->update(['subject_type' => 'customer', 'subject_id' => $id]);
            DB::table('project_follow_ups')->where('subject_type', 'lead')->where('subject_id', $lead->id)->update(['subject_type' => 'customer', 'subject_id' => $id]);
            ProjectLog::record(null, $by, 'lead.won', 'lead', (int) $lead->id, null, ['name' => $lead->name, 'customer_id' => $id]);

            return $id;
        });
    }

    /**
     * Win an opportunity: the lead becomes a client if it is not one, the opportunity moves to Won, and the project is started if asked.
     *
     * @param array<string, mixed> $d start_project (bool), title, type_id
     * @return array{customer_id: int, project_id: ?int}
     */
    public function win(object $opp, array $d, User $by): array
    {
        $stage = DB::table('project_pipeline_stages')->where('id', $opp->stage_id)->first();
        if ($stage && $stage->kind === 'won') {
            throw new ProjectException('This is already won.');
        }
        $start = ! empty($d['start_project']);
        if ($start && ! $by->hasPermission('projects.create')) {
            throw new ProjectException('You may not start work. Win it without starting, and someone who can will start it.', 403);
        }

        return DB::transaction(function () use ($opp, $d, $by, $start) {
            $customerId = $opp->customer_id ? (int) $opp->customer_id : $this->makeClient($this->leads->find((int) $opp->lead_id, $by), $by);
            $won = DB::table('project_pipeline_stages')->where('kind', 'won')->value('id');
            DB::table('project_opportunities')->where('id', $opp->id)->update(['stage_id' => $won, 'customer_id' => $customerId, 'lost_reason_id' => null, 'closed_at' => now(), 'updated_at' => now()]);
            ProjectLog::record(null, $by, 'opportunity.won', 'opportunity', (int) $opp->id, null, ['title' => $opp->title]);
            $projectId = $start ? $this->startProject(DB::table('project_opportunities')->where('id', $opp->id)->first(), $d, $by) : null;

            return ['customer_id' => $customerId, 'project_id' => $projectId];
        });
    }

    /** Start the project of an opportunity that was won. @param array<string, mixed> $d title, type_id @return int */
    public function startProject(object $opp, array $d, User $by): int
    {
        if ($opp->project_id) {
            throw new ProjectException('The work for this has already been started.');
        }
        if (DB::table('project_pipeline_stages')->where('id', $opp->stage_id)->value('kind') !== 'won' || ! $opp->customer_id) {
            throw new ProjectException('Win it first.');
        }
        $typeId = (int) ($d['type_id'] ?? $opp->type_id ?? 0);
        if (! $typeId) {
            throw new ProjectException('Choose the kind of work to start.');
        }

        return DB::transaction(function () use ($opp, $d, $by, $typeId) {
            $project = app(ProjectService::class)->create(['type_id' => $typeId, 'title' => trim((string) ($d['title'] ?? '')) ?: $opp->title, 'customer_id' => (int) $opp->customer_id,
                'industry_key' => DB::table('project_types')->where('id', $typeId)->value('industry_key'), 'description' => $opp->notes], $by);
            DB::table('project_opportunities')->where('id', $opp->id)->update(['project_id' => $project->id, 'updated_at' => now()]);
            if ($opp->quotation_voucher_id) {   // the quotation that carried its value goes with it, so the project shows the agreed figure from the books
                try {
                    app(ProjectLinks::class)->add($project, 'books.voucher', (int) $opp->quotation_voucher_id, 'The quotation it was won on', $by);
                } catch (ProjectException) {
                    // someone who may not link vouchers still starts the work; the quotation stays on the opportunity
                }
            }
            ProjectLog::record((int) $project->id, $by, 'project.from_opportunity', 'opportunity', (int) $opp->id, null, ['opportunity' => $opp->title]);

            return (int) $project->id;
        });
    }
}
