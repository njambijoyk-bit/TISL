<?php

namespace App\Services\Courses;

use App\Models\CompanyProfile;
use App\Models\Courses\Certificate;
use App\Models\Courses\Enrolment;
use App\Models\Courses\Offering;
use App\Models\User;
use App\Services\Books\BooksException;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Certificates. One is issued when an enrolment on an offering that gives a certificate is completed (lessons done, attendance met, fees paid: that rule lives in Learning).
 * Staff may issue one by exception (with a reason), revoke a wrong one, and renew one that expires. Anyone can check a certificate with its signed code (QR) on the public verify page,
 * which shows only the name, the course and whether it is valid.
 */
class CertificateService
{
    private const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

    public function __construct(private CourseAccess $access, private CourseNotices $notices)
    {
    }

    public static function installed(): bool
    {
        return Schema::hasTable('course_certificates');
    }

    /** valid | expired | revoked */
    public function state(Certificate $c, ?Carbon $now = null): string
    {
        if ($c->status === 'revoked') {
            return 'revoked';
        }

        return $c->expires_at && $c->expires_at->lte($now ?? now()) ? 'expired' : 'valid';
    }

    private function newRef(): string
    {
        do {
            $ref = '';
            foreach (str_split(random_bytes(10)) as $b) {
                $ref .= self::ALPHABET[ord($b) % 32];
            }
        } while (Certificate::where('ref', $ref)->exists());

        return $ref;
    }

    /** CERT-2026-000123: the count restarts each year. Called inside the transaction that inserts the row. */
    private function nextNumber(Carbon $at): string
    {
        $prefix = 'CERT-'.$at->format('Y').'-';
        $last = DB::table('course_certificates')->where('number', 'like', $prefix.'%')->lockForUpdate()->orderByDesc('number')->value('number');

        return $prefix.str_pad((string) (($last ? (int) substr($last, strlen($prefix)) : 0) + 1), 6, '0', STR_PAD_LEFT);
    }

    private function months(Offering $o): ?int
    {
        return Schema::hasColumn('course_offerings', 'cert_valid_months') && $o->cert_valid_months ? (int) $o->cert_valid_months : null;
    }

    private function make(Offering $o, User $u, ?Enrolment $e, ?int $by, ?string $note, ?int $renewedFrom = null): Certificate
    {
        $now = now();

        return DB::transaction(function () use ($o, $u, $e, $by, $note, $renewedFrom, $now) {
            $months = $this->months($o);

            return Certificate::create(['number' => $this->nextNumber($now), 'ref' => $this->newRef(), 'offering_id' => $o->id, 'enrolment_id' => $e?->id, 'user_id' => $u->id,
                'holder_name' => mb_substr(trim((string) $u->name) ?: 'Student', 0, 160), 'course_title' => mb_substr($o->title, 0, 200), 'issued_at' => $now, 'expires_at' => $months ? $now->copy()->addMonthsNoOverflow($months) : null,
                'status' => 'issued', 'renewed_from_id' => $renewedFrom, 'issued_by' => $by, 'note' => $note ? mb_substr($note, 0, 300) : null]);
        });
    }

    /** The certificate that is current for this student on this offering (not revoked, the latest). */
    public function current(int $userId, int $offeringId): ?Certificate
    {
        return Certificate::where('user_id', $userId)->where('offering_id', $offeringId)->where('status', 'issued')->orderByDesc('id')->first();
    }

    /** Called when an enrolment is completed. Does nothing when the offering gives no certificate or the student already has one. Never raises. */
    public function issueFor(Enrolment $e): ?Certificate
    {
        try {
            if (! self::installed()) {
                return null;
            }
            $o = Offering::find($e->offering_id);
            $u = User::find($e->student_user_id);
            if (! $o || ! $u || ! $o->certificate || $e->status !== 'completed' || $this->current($u->id, $o->id)) {
                return null;
            }
            $c = $this->make($o, $u, $e, null, null);
            $this->notices->certificateIssued($c, $o);

            return $c;
        } catch (\Throwable $ex) {
            report($ex);

            return null;
        }
    }

    /** Staff give a certificate by exception (the rule was not met, or the offering started giving certificates after the student finished). A reason is required unless the enrolment is completed. */
    public function issue(Offering $o, Enrolment $e, ?int $by, ?string $reason = null): Certificate
    {
        if (! $o->certificate) {
            throw new BooksException('This offering does not give a certificate. Turn it on in the offering first.');
        }
        if ((int) $e->offering_id !== (int) $o->id) {
            throw new BooksException('That enrolment belongs to another offering.');
        }
        if (! in_array($e->status, ['active', 'completed'], true)) {
            throw new BooksException('Only a student who is enrolled can be given a certificate.');
        }
        $reason = trim((string) $reason);
        if ($e->status !== 'completed' && $reason === '') {
            throw new BooksException('This student has not completed the offering: give the reason for the certificate.');
        }
        $u = User::findOrFail($e->student_user_id);
        if ($this->current($u->id, $o->id)) {
            throw new BooksException('This student already has a certificate for this offering.');
        }
        $c = $this->make($o, $u, $e, $by, $reason ?: null);
        $this->notices->certificateIssued($c, $o);

        return $c;
    }

    /** Give certificates to everyone who completed before the offering gave them. @return int how many were issued */
    public function issueMissing(Offering $o, ?int $by = null): int
    {
        if (! $o->certificate) {
            throw new BooksException('This offering does not give a certificate. Turn it on in the offering first.');
        }
        $n = 0;
        foreach (Enrolment::where('offering_id', $o->id)->where('status', 'completed')->get() as $e) {
            if (! $this->current((int) $e->student_user_id, $o->id) && $this->issueFor($e)) {
                $n++;
            }
        }

        return $n;
    }

    public function revoke(Certificate $c, string $reason, ?int $by): Certificate
    {
        $reason = trim($reason);
        if ($reason === '') {
            throw new BooksException('Give the reason for taking this certificate back.');
        }
        if ($c->status === 'revoked') {
            throw new BooksException('This certificate is already revoked.');
        }
        $c->update(['status' => 'revoked', 'revoked_at' => now(), 'revoked_reason' => mb_substr($reason, 0, 300), 'revoked_by' => $by]);
        if ($o = Offering::find($c->offering_id)) {
            $this->notices->certificateRevoked($c, $o);
        }

        return $c->fresh();
    }

    /** A new certificate in place of one that is about to expire or has expired. The old one stays on record. */
    public function renew(Certificate $c, ?int $by): Certificate
    {
        if ($c->status === 'revoked') {
            throw new BooksException('A revoked certificate cannot be renewed.');
        }
        $o = Offering::findOrFail($c->offering_id);
        if (! $this->months($o)) {
            throw new BooksException('This offering\'s certificates do not expire, so there is nothing to renew.');
        }
        if (Certificate::where('renewed_from_id', $c->id)->exists()) {
            throw new BooksException('This certificate has been renewed already.');
        }
        if ($c->expires_at && $c->expires_at->gt(now()->addDays(60))) {
            throw new BooksException('A certificate can be renewed in the last 60 days before it expires, or after.');
        }
        $u = User::findOrFail($c->user_id);
        $new = $this->make($o, $u, $c->enrolment_id ? Enrolment::find($c->enrolment_id) : null, $by, 'Renewal of '.$c->number, $c->id);
        $this->notices->certificateIssued($new, $o);

        return $new;
    }

    /** Tell students whose certificate expires within 30 days (once). @return int how many were told */
    public function remindExpiring(?Carbon $now = null): int
    {
        if (! self::installed()) {
            return 0;
        }
        $now = $now ?? now();
        $n = 0;
        $rows = Certificate::where('status', 'issued')->whereNotNull('expires_at')->where('expires_at', '>', $now)->where('expires_at', '<=', $now->copy()->addDays(30))->whereNull('reminded_at')->get();
        foreach ($rows as $c) {
            if (Certificate::where('renewed_from_id', $c->id)->exists()) {
                continue;
            }
            if ($o = Offering::find($c->offering_id)) {
                $this->notices->certificateExpiring($c, $o);
                $c->update(['reminded_at' => $now]);
                $n++;
            }
        }

        return $n;
    }

    /** @return array<string, mixed> */
    public function row(Certificate $c): array
    {
        $state = $this->state($c);

        return ['id' => $c->id, 'number' => $c->number, 'offering_id' => $c->offering_id, 'holder_name' => $c->holder_name, 'course_title' => $c->course_title, 'issued_at' => $c->issued_at->toIso8601String(), 'expires_at' => $c->expires_at?->toIso8601String(),
            'state' => $state, 'revoked_reason' => $c->revoked_reason, 'renewed' => Certificate::where('renewed_from_id', $c->id)->exists(), 'manual' => $c->issued_by !== null, 'note' => $c->note];
    }

    /** @return array<int, array<string, mixed>> the certificates of one student */
    public function mine(User $u): array
    {
        if (! self::installed()) {
            return [];
        }
        $slugs = Offering::whereIn('id', Certificate::where('user_id', $u->id)->pluck('offering_id'))->pluck('slug', 'id');

        return Certificate::where('user_id', $u->id)->orderByDesc('id')->get()->map(fn (Certificate $c) => $this->row($c) + ['slug' => $slugs[$c->offering_id] ?? null])->values()->all();
    }

    /** @return array<int, array<string, mixed>> the certificates of one offering, for staff */
    public function forOffering(Offering $o): array
    {
        if (! self::installed()) {
            return [];
        }

        return Certificate::where('offering_id', $o->id)->orderByDesc('id')->limit(500)->get()->map(fn (Certificate $c) => $this->row($c))->values()->all();
    }

    /** @return array<int, array{enrolment_id: int, student: string, status: string}> students of the offering who are enrolled and have no current certificate */
    public function candidates(Offering $o): array
    {
        if (! self::installed()) {
            return [];
        }
        $has = Certificate::where('offering_id', $o->id)->where('status', 'issued')->pluck('user_id')->all();
        $rows = Enrolment::where('offering_id', $o->id)->whereIn('status', ['active', 'completed'])->whereNotIn('student_user_id', $has)->orderBy('id')->limit(500)->get();
        $names = User::whereIn('id', $rows->pluck('student_user_id'))->pluck('name', 'id');

        return $rows->map(fn (Enrolment $e) => ['enrolment_id' => $e->id, 'student' => $names[$e->student_user_id] ?? 'Student', 'status' => $e->status])->values()->all();
    }

    /** What the public verify page shows: no e-mail, no ids. Null when the code is not genuine. @return array<string, mixed>|null */
    public function verify(string $code): ?array
    {
        if (! self::installed() || ! ($c = CertificateCodes::find($code))) {
            return null;
        }

        return ['number' => $c->number, 'holder_name' => $c->holder_name, 'course_title' => $c->course_title, 'issued_at' => $c->issued_at->toDateString(), 'expires_at' => $c->expires_at?->toDateString(), 'state' => $this->state($c),
            'issuer' => CompanyProfile::current()->name ?: config('app.name')];
    }

    /** May this person download this certificate: its holder, or staff of the offering. */
    public function mayOpen(?User $u, Certificate $c): bool
    {
        if (! $u) {
            return false;
        }
        if ((int) $c->user_id === (int) $u->id) {
            return true;
        }
        $o = Offering::find($c->offering_id);

        return $o !== null && $this->access->staffMay($u, $o);
    }

    /** The certificate as a PDF (landscape A4) with the signed QR. A revoked or expired one says so across it. @return string the PDF bytes */
    public function pdf(Certificate $c): string
    {
        if (! class_exists(\Dompdf\Dompdf::class)) {
            throw new BooksException('PDF certificates are not available on this server.');
        }
        $pdf = new \Dompdf\Dompdf(['isRemoteEnabled' => false]);
        $pdf->loadHtml($this->html($c));
        $pdf->setPaper('A4', 'landscape');
        $pdf->render();

        return $pdf->output();
    }

    public function html(Certificate $c): string
    {
        $s = CourseSettings::all();
        $issuer = e((string) (CompanyProfile::current()->name ?: config('app.name')));
        $qr = 'data:image/png;base64,'.base64_encode(CertificateCodes::qrPng($c));
        $state = $this->state($c);
        $stamp = $state === 'valid' ? '' : '<div class="stamp">'.($state === 'revoked' ? 'REVOKED' : 'EXPIRED').'</div>';
        $sign = trim((string) ($s['cert_signatory'] ?? '')) !== '' ? '<p class="sign">'.e((string) $s['cert_signatory']).'<br><span>'.e((string) ($s['cert_signatory_title'] ?? '')).'</span></p>' : '';
        $expires = $c->expires_at ? '<p class="small">Valid until '.e($c->expires_at->format('j F Y')).'</p>' : '';

        return '<!doctype html><html><head><meta charset="utf-8"><style>@page{margin:28px}body{font-family:DejaVu Serif,Georgia,serif;color:#1f2937;text-align:center}'
            .'.frame{border:6px double #92400e;padding:34px 40px;height:470px;position:relative}h1{font-size:40px;letter-spacing:4px;margin:0;color:#92400e}.small{font-size:12px;color:#6b7280;margin:4px 0}'
            .'.name{font-size:36px;font-weight:bold;margin:14px 0 6px;border-bottom:1px solid #d1d5db;display:inline-block;padding:0 24px 4px}.course{font-size:24px;margin:8px 0}'
            .'.foot{position:absolute;left:40px;right:40px;bottom:26px}.foot td{vertical-align:bottom;font-size:12px}.sign{font-size:15px;margin:0}.sign span{font-size:11px;color:#6b7280}.qr{width:96px}'
            .'.stamp{position:absolute;top:150px;left:0;right:0;font-size:90px;font-weight:bold;color:#b91c1c;opacity:.35;transform:rotate(-12deg)}</style></head><body><div class="frame">'
            .'<p class="small">'.$issuer.'</p><h1>CERTIFICATE</h1><p class="small">of completion</p><p style="margin-top:22px">This is to certify that</p><div class="name">'.e($c->holder_name).'</div>'
            .'<p>has successfully completed</p><p class="course">'.e($c->course_title).'</p><p class="small">Issued on '.e($c->issued_at->format('j F Y')).'</p>'.$expires.$stamp
            .'<table class="foot" width="100%"><tr><td align="left" width="30%"><img class="qr" src="'.$qr.'"><br>Scan to verify</td><td align="center">'.$sign.'</td><td align="right" width="30%">Certificate no.<br><strong>'.e($c->number).'</strong></td></tr></table>'
            .'</div></body></html>';
    }
}
