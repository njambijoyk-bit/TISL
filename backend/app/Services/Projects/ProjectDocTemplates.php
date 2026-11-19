<?php

namespace App\Services\Projects;

use App\Models\CompanyProfile;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Documents from templates (docs/PROJECTS_STAGE9_SPEC.md, build 9.2). A template is text with fill-in fields in double braces ({{project.number}},
 * {{client.name}}, {{today}}...). Making a document fills it from the work as the person making it sees the work (a sensitive field they may not
 * see stays empty), shows it, and keeps it on the work's files as a PDF, with its own versions like any other file.
 */
class ProjectDocTemplates
{
    public function __construct(private ProjectAccess $access) {}

    /** @return array<int, array<string, mixed>> */
    public function list(bool $all = false, ?string $industry = null): array
    {
        $this->needReady();

        return DB::table('project_doc_templates')->when(! $all, fn ($q) => $q->where('is_active', 1))->when($industry, fn ($q) => $q->where(fn ($w) => $w->whereNull('industry_key')->orWhere('industry_key', $industry)))
            ->orderBy('name')->get()->map(fn ($t) => ['id' => (int) $t->id, 'name' => $t->name, 'industry_key' => $t->industry_key, 'body' => $t->body, 'is_active' => (bool) $t->is_active])->all();
    }

    /** @param array<string, mixed> $d name, industry_key, body, is_active */
    public function save(?int $id, array $d, User $by): void
    {
        $this->needReady();
        $name = trim((string) ($d['name'] ?? ''));
        $body = trim((string) ($d['body'] ?? ''));
        if ($name === '' || $body === '') {
            throw new ProjectException('Give the template a name and write it.');
        }
        $unknown = array_diff($this->fieldsUsed($body), array_keys($this->catalogue()));
        $unknown = array_filter($unknown, fn ($k) => ! str_starts_with($k, 'field.'));
        if ($unknown) {
            throw new ProjectException('These fields are not known: ' . implode(', ', array_map(fn ($k) => '{{' . $k . '}}', $unknown)) . '. Choose from the list.');
        }
        $row = ['name' => mb_substr($name, 0, 120), 'industry_key' => ($d['industry_key'] ?? null) ?: null, 'body' => mb_substr($body, 0, 200000), 'is_active' => array_key_exists('is_active', $d) ? (int) (bool) $d['is_active'] : 1, 'updated_at' => now()];
        if ($id) {
            DB::table('project_doc_templates')->where('id', $id)->update($row) || DB::table('project_doc_templates')->where('id', $id)->exists() || throw new ProjectException('Not found.', 404);
        } else {
            $id = DB::table('project_doc_templates')->insertGetId($row + ['created_by' => $by->id, 'created_at' => now()]);
        }
        ProjectLog::record(null, $by, 'template.saved', 'template', $id, null, ['name' => $name]);
    }

    /** The fields a template may use, with what each is. @return array<string, string> */
    public function catalogue(): array
    {
        return [
            'project.number' => 'Its number', 'project.title' => 'Its name', 'project.type' => 'Its kind', 'project.stage' => 'Its stage', 'project.start_date' => 'When it starts', 'project.due_date' => 'When it is expected to end',
            'project.place' => 'The place', 'project.reference' => 'The reference', 'project.authority' => 'The authority', 'project.description' => 'Its description',
            'client.name' => 'The client', 'client.email' => 'The client\'s email', 'client.phone' => 'The client\'s phone', 'contact.name' => 'The client\'s main contact', 'contact.email' => 'The main contact\'s email',
            'lead.name' => 'The lead', 'lead.email' => 'The lead\'s email', 'team' => 'The people on it', 'me.name' => 'Whoever makes the document',
            'company.name' => 'The company', 'company.email' => 'The company\'s email', 'company.phone' => 'The company\'s phone', 'today' => 'Today\'s date',
            'field.KEY' => 'Any extra field on the work, by its key',
        ];
    }

    /** Fill a template from the work. @return array{html: string, missing: string[], name: string} */
    public function preview(object $project, int $templateId, User $by): array
    {
        $this->access->authorize($by, 'files', $project);
        $t = DB::table('project_doc_templates')->where('id', $templateId)->where('is_active', 1)->first() ?? throw new ProjectException('Choose a template.');
        $values = $this->values($project, $by);
        $missing = [];
        $text = preg_replace_callback('/\{\{\s*([a-z0-9_.]+)\s*\}\}/i', function ($m) use ($values, &$missing) {
            $v = $values[strtolower($m[1])] ?? null;
            if ($v === null || $v === '') {
                $missing[] = $m[1];

                return '';
            }

            return htmlspecialchars((string) $v, ENT_QUOTES, 'UTF-8');
        }, $this->escapeOutsideFields($t->body));

        return ['html' => $this->page($text), 'missing' => array_values(array_unique($missing)), 'name' => "{$t->name} {$project->number}"];
    }

    /** Make the document and keep it on the work's files as a PDF. @return int the file */
    public function make(object $project, int $templateId, ?int $folderId, User $by, ?string $name = null): int
    {
        $doc = $this->preview($project, $templateId, $by);
        if (! class_exists(\Dompdf\Dompdf::class)) {
            throw new ProjectException('Documents cannot be made into PDFs on this server.', 500);
        }
        $pdf = new \Dompdf\Dompdf(['isRemoteEnabled' => false]);
        $pdf->loadHtml($doc['html']);
        $pdf->setPaper('A4');
        $pdf->render();
        $file = app(ProjectFiles::class)->storeContent($project, (string) $pdf->output(), mb_substr(trim($name ?: $doc['name']), 0, 190) . '.pdf', 'application/pdf', $folderId, $by, 'template');
        ProjectLog::record((int) $project->id, $by, 'document.made', 'file', $file, null, ['template' => $templateId]);

        return $file;
    }

    // ------------------------------------------------------------------ inside

    /** @return array<string, ?string> */
    private function values(object $project, User $by): array
    {
        $p = app(ProjectService::class)->show($by, $project);
        $customer = $project->customer_id && Schema::hasTable('customers') ? DB::table('customers')->where('id', $project->customer_id)->first() : null;
        $contact = $project->customer_id && Schema::hasTable('project_contacts') ? DB::table('project_contacts')->where('owner_type', 'customer')->where('owner_id', $project->customer_id)->whereNull('deleted_at')->orderByDesc('is_main')->orderBy('id')->first() : null;
        $lead = DB::table('users')->where('id', $project->lead_user_id)->first(['name', 'email']);
        $team = DB::table('project_members as m')->join('users as u', 'u.id', '=', 'm.user_id')->where('m.project_id', $project->id)->where('m.status', 'active')->orderBy('u.name')->pluck('u.name')->all();
        $date = fn ($d) => $d ? \Carbon\Carbon::parse($d)->format('j F Y') : null;
        $out = [
            'project.number' => $project->number, 'project.title' => $project->title, 'project.type' => $p['type']['name'] ?? null, 'project.stage' => $p['stage']['name'] ?? null,
            'project.start_date' => $date($project->start_date), 'project.due_date' => $date($project->due_date), 'project.place' => $project->place ?? null, 'project.reference' => $project->reference ?? null,
            'project.authority' => $project->authority ?? null, 'project.description' => $project->description ?? null,
            'client.name' => $customer ? (trim((string) ($customer->company_name ?? '')) ?: trim(($customer->first_name ?? '') . ' ' . ($customer->last_name ?? ''))) : null,
            'client.email' => $customer->email ?? null, 'client.phone' => $customer->phone ?? null, 'contact.name' => $contact->name ?? null, 'contact.email' => $contact->email ?? null,
            'lead.name' => $lead->name ?? null, 'lead.email' => $lead->email ?? null, 'team' => implode(', ', $team), 'me.name' => $by->name,
            'company.name' => CompanyProfile::name(), 'company.email' => CompanyProfile::defaultEmail(), 'company.phone' => CompanyProfile::defaultPhone(), 'today' => now()->format('j F Y'),
        ];
        foreach ($p['fields'] ?? [] as $f) {
            $v = $f['display'] ?? $f['value'] ?? null;
            $out['field.' . strtolower((string) $f['key'])] = is_array($v) ? implode(', ', $v) : (is_bool($v) ? ($v ? 'Yes' : 'No') : ($v === null ? null : (string) $v));
        }

        return $out;
    }

    /** The template's own text is shown as written: everything outside the fields is escaped, line breaks kept. */
    private function escapeOutsideFields(string $body): string
    {
        $parts = preg_split('/(\{\{\s*[a-z0-9_.]+\s*\}\})/i', $body, -1, PREG_SPLIT_DELIM_CAPTURE);

        return implode('', array_map(fn ($part) => preg_match('/^\{\{/', $part) ? $part : nl2br(htmlspecialchars($part, ENT_QUOTES, 'UTF-8'), false), $parts));
    }

    private function page(string $inner): string
    {
        $company = htmlspecialchars(CompanyProfile::name(), ENT_QUOTES, 'UTF-8');

        return '<!doctype html><html><head><meta charset="utf-8"><style>body{font-family:DejaVu Sans,sans-serif;font-size:11pt;line-height:1.5;margin:28px 34px} .co{font-size:9pt;margin-bottom:18px}</style></head>'
            . "<body><div class=\"co\">{$company}</div>{$inner}</body></html>";
    }

    /** @return string[] */
    private function fieldsUsed(string $body): array
    {
        preg_match_all('/\{\{\s*([a-z0-9_.]+)\s*\}\}/i', $body, $m);

        return array_values(array_unique(array_map('strtolower', $m[1])));
    }

    private function needReady(): void
    {
        if (! ProjectsSetup::documents()) {
            throw new ProjectException('Templates need database script 266.', 409);
        }
    }
}
