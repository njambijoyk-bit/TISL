# HR hub: people, from hire to leaving (plan)

Status: plan, waiting for the owner. The four choices at the end are my recommendations; say if any should change, or say "go". Each stage then gets its own spec, the way Projects did.

## What exists today

| Part | Where it lives | What is already there | What is missing |
|---|---|---|---|
| Employee record | Core screens, but its routes need the **Extras** licence | A full record: job, department, branch, manager, type, hire and leaving dates, work email and phone, emergency contact, bank, ID, tax and social security numbers, salary grade and base salary, leave days, skills, certifications | Its routes sit behind Extras, so HR can't manage records without that licence. Bank, ID numbers and salary are stored as plain text and shown to anyone with `hr.view`. There is no history of changes and nowhere to keep documents. |
| Attendance | Core | Sign in and out, markers, verification, disputes, overtime minutes worked out against working hours | Leave days are not recorded as leave |
| Leave | A button on the employee record and a log | Leave days can be added and taken off, with a log | No leave types, requests, approval, accrual or calendar. Payroll does not read leave. |
| Payroll | Core, but its menu sits in the **Extras** group | Runs, approval, paying through Books, payslips, gratuity, CSV. Overtime from verified attendance times a multiplier. | Only chefs' overtime (through Menus) is approved before it is paid. There is one overtime rate, with none for rest days or holidays. |
| Hiring | **Careers**, its own licensed module | Job postings, applications through to "Offer extended", AI screening, applicant documents | Hiring someone means typing them in again. Their documents stay in Careers. |
| People tools | **Projects** Stage 8 | Team view, goals, reviews, one-to-ones, checklists, casebook, all on the HR manager line | They live inside Projects, so a company without Projects has none of them. |

## The rules the hub keeps

1. **The HR hub is core.** It works with no other module licensed. Careers adds hiring to it and Projects adds work to it. Neither is needed, and losing one breaks nothing.
2. **Careers stays its own module.** Its screening AI purpose shows only when Careers is licensed (switched on or off doesn't matter). The hub never needs it: employees can always be created by hand.
3. **Money stays in Books.** Payroll works out the figures and Books posts them, as today.
4. **Each linked part shows only with its licence and the viewer's own permission.** Projects work shows on a profile when Projects is licensed (on or off), and only the parts the viewer may open. Casebook reports keep their identity protections, so a reporter is never revealed on a profile.
5. **Every serious action needs nothing out of the box**, as in Projects; the company decides what each one needs.
6. **Sensitive fields and documents follow catalogue permissions and configuration**, never role names.

## Stages

| Stage | Name | Size | What it does |
|---|---|---|---|
| 1 | Foundation | Medium | Employee records, the Payroll menu and My payslips move to core, out of Extras. A **People** menu. The employee record becomes a page with tabs. Sensitive fields (bank, ID and tax numbers, salary) need their own permission and are encrypted at rest. Every change to a record is kept: who, when, from what to what. HR configuration page: employment types, departments link, number format. |
| 2 | Documents | Medium | Each employee has a document store, kept in the Vault. Document types are configured: contract, ID copy, certificate, CV, offer letter, and so on. For each type: whether it is required, whether it expires and when to warn, and which catalogue permission sees it. HR uploads by hand. An employee can be asked to upload one through My HR. Expiry warnings. Every view and download is logged. |
| 3 | Hiring into HR | Medium | Only when Careers is licensed. **Hire** on an accepted application creates the employee in one step: staff login, role, work email, job, department, manager and start date. Their skills, experience and links carry over, and their CV and application documents are copied into their employee documents. The application keeps a link to the employee. Onboarding starts (stage 7's checklist) with a probation end date. |
| 4 | Leave | Large | Leave types (annual, sick, maternity, paternity, compassionate, unpaid, study; the company's own) with entitlement, accrual, carry-over and whether they need a document. Balances. Requests, with approval by the manager line, or HR, or both. A team leave calendar, with clashes shown. Approved leave marks the attendance days as leave. Payroll reads unpaid leave. The current leave log becomes history. |
| 5 | Overtime and pay | Medium | Overtime approval for everyone, extending what Menus does for chefs: a manager approves the overtime attendance worked out, before payroll pays it. Rates by kind of day: working day, rest day, public holiday. A cap per week or month. Payroll pays approved overtime only (when approval is on). Payslips show overtime by kind. |
| 6 | The employee profile | Medium | One page with everything linked to the person, each part only with its licence and the viewer's permission. **Always:** job, record, documents, attendance, leave, payslips, assets issued to them. **With Projects:** the work they are on, tasks, time, and casebook reports by or about them, identity rules kept. **With Extras:** deliveries they drove, till shifts. **With Careers:** the application they were hired from. |
| 7 | Growth | Medium | Goals, reviews, one-to-ones and checklists (onboarding and others) move from Projects Stage 8 into the hub, so a company without Projects has them. The casebook stays in Projects but shows on the profile. Projects keeps showing these where it does today, now read from the hub. Existing data is kept. |
| 8 | Leaving and My HR | Medium | **Leaving:** an exit checklist, final pay with gratuity (the existing calculation), handing back assets, and access removed on the last day. Documents and history are kept as configured. **My HR** for every employee: their record (the parts they may see), payslips, leave balance and requests, documents asked of them, goals and checklists. |

Stages 1 and 2 come first because everything else stands on them. Stage 3 can come any time after 2. Stages 4 and 5 can be built in either order.

## Four choices (my recommendation first; say if any should change)

1. **Projects' people tools move into the hub** (stage 7). Goals, reviews, one-to-ones and checklists belong to HR, not to a piece of work, and a company without Projects should have them. Projects keeps showing them and the casebook stays in Projects. (The other way: leave them in Projects, so only companies with Projects get them.)
2. **Sensitive fields need their own permission and are encrypted at rest.** Bank details, ID and tax numbers and salary are shown only with a new `hr.sensitive` permission, and are stored encrypted. (The other way: the permission only, stored as today.)
3. **Hire creates the staff login.** Hiring makes the employee and their staff account with the role chosen. The applicant's Careers account stays, read-only, for the history. (The other way: HR links the employee to a staff account made separately.)
4. **Overtime approval is a setting, off out of the box.** Payroll keeps paying verified overtime as today until the company switches approval on, for everyone or for some departments. (The other way: on out of the box.)
