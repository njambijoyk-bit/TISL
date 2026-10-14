<?php

namespace Tests\Feature;

use App\Models\Courses\Certificate;
use App\Models\Courses\Enrolment;
use App\Models\Courses\Offering;
use App\Models\User;
use App\Services\Books\BooksException;
use App\Services\Courses\CertificateCodes;
use App\Services\Courses\CertificateService;
use App\Services\Courses\CourseAccess;
use App\Services\Courses\CourseSettings;
use App\Services\Courses\Learning;
use Illuminate\Support\Carbon;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/** Courses step 8: certificates (issued on completion, by exception, to those who finished earlier; revoked, renewed, reminded; the public check; the PDF). "Now" is Monday 12 Oct 2026, 12:00. */
class CoursesCertificatesTest extends TestCase
{
    use Concerns\CreatesCoursesWorld;

    protected function setUp(): void
    {
        parent::setUp();
        $this->createCoursesWorld();
        config(['app.name' => 'TISL Kitchen']);
    }

    private function fails(callable $fn, string $msg): void
    {
        try {
            $fn();
            $this->fail("Expected: {$msg}");
        } catch (BooksException $e) {
            $this->assertStringContainsString($msg, $e->getMessage());
        }
    }

    private function svc(): CertificateService
    {
        return app(CertificateService::class);
    }

    private function enrolled(Offering $o, string $name = 'Amina Wanjiru', string $status = 'active'): Enrolment
    {
        $u = $this->person($name);
        app(CourseAccess::class)->grant($u->id, $o->id, 'staff', 'test');
        static $n = 0;
        $n++;

        return Enrolment::forceCreate(['number' => 'EN-'.$n, 'offering_id' => $o->id, 'student_user_id' => $u->id, 'status' => $status, 'channel' => 'online', 'total' => 0, 'paid_total' => 0]);
    }

    private function student(Enrolment $e): User
    {
        return User::findOrFail($e->student_user_id);
    }

    // ── issued ───────────────────────────────────────────────────────────

    public function test_completing_an_offering_that_gives_one_issues_a_numbered_certificate_once(): void
    {
        $o = $this->offering(['title' => 'Sourdough', 'certificate' => true, 'cert_valid_months' => 12]);
        $l = $this->lesson($o);
        $e = $this->enrolled($o);
        $u = $this->student($e);
        app(Learning::class)->mark($u, $l, 'done');
        $c = Certificate::sole();
        $this->assertSame(['CERT-2026-000001', 'Amina Wanjiru', 'Sourdough', 'issued', $e->id, null, '2027-10-12'], [$c->number, $c->holder_name, $c->course_title, $c->status, (int) $c->enrolment_id, $c->issued_by, $c->expires_at->toDateString()]);
        $this->assertMatchesRegularExpression('/^[0-9ABCDEFGHJKMNPQRSTVWXYZ]{10}$/', $c->ref);
        $this->assertContains('course_certificate', $this->sentTo($u->id));
        $this->assertNull($this->svc()->issueFor($e->fresh()));   // already has one
        $f = $this->enrolled($o, 'Bob', 'completed');
        $this->assertSame('CERT-2026-000002', $this->svc()->issueFor($f)->number);
        $this->at('2027-01-03 09:00');
        $g = $this->enrolled($o, 'Cy', 'completed');
        $this->assertSame('CERT-2027-000001', $this->svc()->issueFor($g)->number);   // a new year starts again
        $none = $this->offering(['certificate' => false]);
        $this->assertNull($this->svc()->issueFor($this->enrolled($none, 'Dee', 'completed')));
        $this->assertNull($this->svc()->issueFor($this->enrolled($o, 'Eve', 'active')));   // not completed
        $this->assertNull($this->svc()->issueFor($this->enrolled($this->offering(['certificate' => true]), 'Fay', 'completed'))->expires_at);   // no expiry set: never expires
    }

    public function test_staff_issue_one_by_exception_with_a_reason_when_the_student_has_not_finished(): void
    {
        $o = $this->offering(['certificate' => true]);
        $e = $this->enrolled($o);
        $this->fails(fn () => $this->svc()->issue($o, $e, 7, '  '), 'give the reason');
        $c = $this->svc()->issue($o, $e, 7, ' Finished the exam elsewhere ');
        $this->assertSame([7, 'Finished the exam elsewhere'], [(int) $c->issued_by, $c->note]);
        $this->assertTrue($this->svc()->row($c)['manual']);
        $this->fails(fn () => $this->svc()->issue($o, $e, 7, 'Again'), 'already has a certificate');
        $done = $this->enrolled($o, 'Bob', 'completed');
        $this->assertNull($this->svc()->issue($o, $done, 7)->note);   // completed: no reason needed
        $this->fails(fn () => $this->svc()->issue($this->offering(['certificate' => true]), $this->enrolled($o, 'Cy'), 7, 'x'), 'another offering');
        $this->fails(fn () => $this->svc()->issue($o, $this->enrolled($o, 'Dee', 'cancelled'), 7, 'x'), 'Only a student who is enrolled');
        $this->fails(fn () => $this->svc()->issue($this->offering(), $this->enrolled($this->offering(), 'Eve'), 7, 'x'), 'does not give a certificate');
    }

    public function test_certificates_go_to_those_who_finished_earlier_but_never_back_to_one_that_was_revoked(): void
    {
        $o = $this->offering(['certificate' => false]);
        $a = $this->enrolled($o, 'Ann', 'completed');
        $b = $this->enrolled($o, 'Bob', 'completed');
        $this->enrolled($o, 'Cy', 'active');
        $this->fails(fn () => $this->svc()->issueMissing($o), 'does not give a certificate');
        $o->update(['certificate' => true]);
        $first = $this->svc()->issueFor($a);
        $this->svc()->revoke($first, 'Copied the work', 7);
        $this->assertSame(1, $this->svc()->issueMissing($o));   // Bob only
        $this->assertSame(0, $this->svc()->issueMissing($o));
        $this->assertNull($this->svc()->current($this->student($a)->id, $o->id));
        $this->assertSame(['Ann', 'Cy'], array_column($this->svc()->candidates($o), 'student'));   // staff may still decide one by one
        unset($b);
    }

    // ── revoked, renewed, reminded ───────────────────────────────────────

    public function test_a_certificate_is_revoked_with_a_reason_and_the_student_is_told(): void
    {
        $o = $this->offering(['certificate' => true]);
        $e = $this->enrolled($o, 'Ann', 'completed');
        $c = $this->svc()->issueFor($e);
        $this->fails(fn () => $this->svc()->revoke($c, '  ', 7), 'Give the reason');
        $c = $this->svc()->revoke($c, ' Mistake ', 7);
        $this->assertSame(['revoked', 'Mistake', 7, 'revoked'], [$c->status, $c->revoked_reason, (int) $c->revoked_by, $this->svc()->state($c)]);
        $this->assertContains('course_certificate_revoked', $this->sentTo($e->student_user_id));
        $this->fails(fn () => $this->svc()->revoke($c, 'Again', 7), 'already revoked');
        $this->fails(fn () => $this->svc()->renew($c, 7), 'revoked certificate cannot be renewed');
    }

    public function test_a_certificate_is_renewed_in_its_last_sixty_days_or_after_once(): void
    {
        $o = $this->offering(['certificate' => true, 'cert_valid_months' => 6]);
        $c = $this->svc()->issueFor($this->enrolled($o, 'Ann', 'completed'));   // until 12 Apr 2027
        $this->fails(fn () => $this->svc()->renew($c, 7), 'last 60 days');
        $this->at('2027-02-11 11:59');
        $this->fails(fn () => $this->svc()->renew($c, 7), 'last 60 days');
        $this->at('2027-02-11 12:00');
        $new = $this->svc()->renew($c, 7);
        $this->assertSame([$c->id, 'Renewal of '.$c->number, '2027-08-11'], [(int) $new->renewed_from_id, $new->note, $new->expires_at->toDateString()]);
        $this->assertSame($new->id, $this->svc()->current($c->user_id, $o->id)->id);
        $this->assertTrue($this->svc()->row($c->fresh())['renewed']);
        $this->fails(fn () => $this->svc()->renew($c->fresh(), 7), 'renewed already');
        $forever = $this->svc()->issueFor($this->enrolled($this->offering(['certificate' => true]), 'Bob', 'completed'));
        $this->fails(fn () => $this->svc()->renew($forever, 7), 'do not expire');
    }

    public function test_the_expiry_and_a_reminder_thirty_days_ahead_once(): void
    {
        $o = $this->offering(['certificate' => true, 'cert_valid_months' => 1]);
        $c = $this->svc()->issueFor($this->enrolled($o, 'Ann', 'completed'));   // until 12 Nov
        $other = $this->svc()->issueFor($this->enrolled($this->offering(['certificate' => true, 'cert_valid_months' => 3]), 'Bob', 'completed'));
        $this->assertSame('valid', $this->svc()->state($c));
        $this->assertSame('expired', $this->svc()->state($c, Carbon::parse('2026-11-12 12:00', 'Africa/Nairobi')));
        $this->assertSame('valid', $this->svc()->state($c, Carbon::parse('2026-11-12 11:59', 'Africa/Nairobi')));
        $this->assertSame(0, $this->svc()->remindExpiring());   // 31 days ahead
        $this->assertSame(1, $this->svc()->remindExpiring(Carbon::parse('2026-10-13 12:00', 'Africa/Nairobi')));   // 30 days ahead
        $this->assertSame(0, $this->svc()->remindExpiring(Carbon::parse('2026-10-14 12:00', 'Africa/Nairobi')));   // once
        $this->assertContains('course_certificate_expiring', $this->sentTo($c->user_id));
        $this->assertSame(0, $this->svc()->remindExpiring(Carbon::parse('2026-11-12 12:00', 'Africa/Nairobi')));   // expired: nothing to remind
        $this->assertSame(1, $this->svc()->remindExpiring(Carbon::parse('2026-12-13 12:00', 'Africa/Nairobi')));   // the other, 30 days before 12 Jan
        $d = $this->svc()->issueFor($this->enrolled($o, 'Cy', 'completed'));
        $this->at('2026-11-01 12:00');
        $this->svc()->renew($d, 7);
        $this->assertSame(1, $this->svc()->remindExpiring());   // the renewal (to 1 Dec) is reminded, not the one it replaced
        $this->assertNull($d->fresh()->reminded_at);
        unset($other);
    }

    // ── the public check, the PDF, the screens ───────────────────────────

    public function test_the_public_check_shows_only_the_name_the_course_and_the_state(): void
    {
        $o = $this->offering(['title' => 'Pastry', 'certificate' => true]);
        $c = $this->svc()->issueFor($this->enrolled($o, 'Ann Baker', 'completed'));
        $code = CertificateCodes::code($c);
        $this->assertStringStartsWith('crt.', $code);
        $r = $this->getJson('/api/learn/verify/'.$code)->assertOk()->json();
        $this->assertSame(['number', 'holder_name', 'course_title', 'issued_at', 'expires_at', 'state', 'issuer'], array_keys($r));
        $this->assertSame([$c->number, 'Ann Baker', 'Pastry', '2026-10-12', null, 'valid', 'TISL Kitchen'], array_values($r));
        [, $ref, $sig] = explode('.', $code);
        $this->getJson('/api/learn/verify/CRT.'.$ref.'.'.strtolower($sig))->assertOk();   // the kind and the signature may be typed in any case
        $this->getJson('/api/learn/verify/crt.'.$c->ref.'.AAAAAAAA')->assertNotFound();   // a code that is not signed by us
        $this->getJson('/api/learn/verify/mem.'.$c->ref.'.AAAAAAAA')->assertNotFound();
        $this->svc()->revoke($c, 'Mistake', 7);
        $this->assertSame('revoked', $this->getJson('/api/learn/verify/'.$code)->json('state'));
        $this->assertStringContainsString('/q/crt.', CertificateCodes::url($c));   // the QR holds the address the phone opens
    }

    public function test_the_pdf_opens_for_its_holder_and_the_offerings_staff_only(): void
    {
        CourseSettings::save(['cert_signatory' => 'Jane <b>Chef</b>', 'cert_signatory_title' => 'Head of school'], null);
        $teacher = $this->staff('Teacher', ['courses.teach']);
        $o = $this->offering(['title' => 'Bread & <Butter>', 'certificate' => true, 'cert_valid_months' => 12, 'instructor_user_id' => $teacher->id]);
        $e = $this->enrolled($o, 'Ann', 'completed');
        $c = $this->svc()->issueFor($e);
        $html = $this->svc()->html($c);
        $this->assertStringContainsString('Bread &amp; &lt;Butter&gt;', $html);
        $this->assertStringContainsString('Jane &lt;b&gt;Chef&lt;/b&gt;', $html);
        $this->assertStringContainsString('Valid until 12 October 2027', $html);
        $this->assertStringContainsString('data:image/png;base64,', $html);
        $this->assertStringNotContainsString('REVOKED', $html);
        $this->assertStringContainsString('REVOKED', $this->svc()->html($this->svc()->revoke($c, 'x', 7)));
        $c2 = $this->svc()->issue($o, $e, 7, 'Again');
        $this->assertTrue($this->svc()->mayOpen($this->student($e), $c2));
        $this->assertTrue($this->svc()->mayOpen($teacher, $c2));
        $this->assertTrue($this->svc()->mayOpen($this->staff('Manager', ['courses.manage']), $c2));
        $this->assertFalse($this->svc()->mayOpen($this->staff('Other teacher', ['courses.teach']), $c2));
        $this->assertFalse($this->svc()->mayOpen(null, $c2));
        Sanctum::actingAs($this->person('Stranger'), ['*']);
        $this->get("/api/courses/certificates/{$c2->id}/pdf")->assertNotFound();
        Sanctum::actingAs($this->student($e), ['*']);
        $r = $this->get("/api/courses/certificates/{$c2->id}/pdf")->assertOk();
        $this->assertSame('application/pdf', $r->headers->get('Content-Type'));
        $this->assertStringStartsWith('%PDF', $r->getContent());
        $this->assertSame([$c2->number, $c->number], array_column($this->getJson('/api/courses/my/certificates')->assertOk()->json('certificates'), 'number'));
    }

    public function test_staff_work_on_the_certificates_of_their_own_offerings(): void
    {
        $teacher = $this->staff('Teacher', ['courses.teach']);
        $o = $this->offering(['certificate' => true, 'instructor_user_id' => $teacher->id]);
        $theirs = $this->offering(['certificate' => true]);
        $e = $this->enrolled($o, 'Ann', 'completed');
        $x = $this->enrolled($theirs, 'Bob', 'completed');
        Sanctum::actingAs($teacher, ['*']);
        $this->getJson("/api/admin/courses/offerings/{$theirs->id}/certificates")->assertForbidden();
        $this->postJson("/api/admin/courses/offerings/{$o->id}/certificates", ['enrolment_id' => $x->id])->assertNotFound();   // another offering's student
        $this->postJson("/api/admin/courses/offerings/{$o->id}/certificates/issue-missing")->assertOk()->assertJsonPath('issued', 1);
        $this->postJson("/api/admin/courses/offerings/{$o->id}/certificates/issue-missing")->assertOk()->assertJsonPath('message', 'Nobody was waiting for a certificate.');
        $list = $this->getJson("/api/admin/courses/offerings/{$o->id}/certificates")->assertOk()->json();
        $this->assertSame([1, true, []], [count($list['certificates']), $list['gives_certificate'], $list['candidates']]);
        $cid = $list['certificates'][0]['id'];
        $foreign = $this->svc()->issueFor($x);
        $this->postJson("/api/admin/courses/offerings/{$o->id}/certificates/{$foreign->id}/revoke", ['reason' => 'x'])->assertNotFound();
        $this->postJson("/api/admin/courses/offerings/{$o->id}/certificates/{$cid}/revoke", ['reason' => 'Wrong person'])->assertOk()->assertJsonPath('certificate.state', 'revoked');
        $this->postJson("/api/admin/courses/offerings/{$o->id}/certificates", ['enrolment_id' => $e->id, 'reason' => 'Checked again'])->assertOk();
        $this->postJson("/api/admin/courses/offerings/{$o->id}/certificates/{$cid}/renew")->assertStatus(422);
        $this->assertSame('issued', $foreign->fresh()->status);
    }
}
