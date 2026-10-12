import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import AdminLayout from '../../../_shared/components/layout/AdminLayout';
import HubHeader, { NoAccess } from '../../../core/components/admin/ui/HubHeader';
import coursesAPI from '../../../_shared/api/courses';
import useAuthStore from '../../../_shared/store/authStore';
import { hasAnyPermission } from '../../../_shared/lib/roles';
import { errMsg } from '../../../_shared/store/helpers/apiState';
import { card, colors } from '../../../_shared/theme/tokens';
import CoursesNav from '../../components/CoursesNav';
import Pill from '../../components/Pill';

const when = (d) => new Date(d).toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

/** Teaching: what needs doing across the offerings one teaches (a manager sees all of them), with a way into each. */
export default function CoursesTeaching() {
  const user = useAuthStore((s) => s.user);
  const [d, setD] = useState(null);
  useEffect(() => { coursesAPI.teaching().then(setD).catch((e) => { toast.error(errMsg(e, 'Could not load')); setD({ offerings: [], totals: {} }); }); }, []);
  if (!hasAnyPermission(user, ['courses.view', 'courses.manage', 'courses.teach'])) return <AdminLayout><div style={{ padding: 32 }}><NoAccess what="Teaching" /></div></AdminLayout>;
  const t = d?.totals ?? {};

  return (
    <AdminLayout>
      <div style={{ padding: '32px 24px', maxWidth: 1000, margin: '0 auto' }} data-testid="courses-teaching">
        <CoursesNav />
        <HubHeader title="Teaching" description="Quizzes to mark, registers to take, excuses to answer and who is waiting, across the offerings you teach." />
        {!d && <p>Loading…</p>}
        {d && (
          <>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '0 0 12px' }}>
              <Pill tone="neutral">{t.students ?? 0} students</Pill>
              <Pill tone={t.quizzes_to_mark ? 'warn' : 'neutral'}>{t.quizzes_to_mark ?? 0} quizzes to mark</Pill>
              <Pill tone={t.registers_to_take ? 'warn' : 'neutral'}>{t.registers_to_take ?? 0} registers to take</Pill>
              <Pill tone={t.excuses_waiting ? 'warn' : 'neutral'}>{t.excuses_waiting ?? 0} excuses to answer</Pill>
            </div>
            {d.offerings.length === 0 && <section style={{ ...card, padding: 16 }}>You do not teach any offering yet.</section>}
            <div style={{ display: 'grid', gap: 10 }}>
              {d.offerings.map((o) => (
                <section key={o.id} data-offering={o.title} style={{ ...card, padding: 14, display: 'grid', gap: 6 }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <Link to={`/admin/courses/${o.id}`} style={{ flex: 1, minWidth: 200, fontWeight: 800, fontSize: '1.05rem', color: 'inherit' }}>{o.title}</Link>
                    {o.status === 'draft' && <Pill tone="neutral">Draft</Pill>}
                    <span style={{ fontSize: '0.84rem' }}>{o.students} student{o.students === 1 ? '' : 's'} · {o.completed} completed</span>
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {o.quizzes_to_mark > 0 && <Pill tone="warn">{o.quizzes_to_mark} quiz{o.quizzes_to_mark === 1 ? '' : 'zes'} to mark</Pill>}
                    {o.registers_to_take > 0 && <Pill tone="warn">{o.registers_to_take} register{o.registers_to_take === 1 ? '' : 's'} to take</Pill>}
                    {o.excuses_waiting > 0 && <Pill tone="warn">{o.excuses_waiting} excuse{o.excuses_waiting === 1 ? '' : 's'} to answer</Pill>}
                    {o.behind_on_attendance > 0 && <Pill tone="danger">{o.behind_on_attendance} behind on attendance</Pill>}
                    {o.waiting_list > 0 && <Pill tone="neutral">{o.waiting_list} waiting for a place</Pill>}
                  </div>
                  {o.next_class && <span style={{ color: colors.textMuted, fontSize: '0.84rem' }}>Next class: {o.next_class.title} · {when(o.next_class.starts_at)}</span>}
                </section>
              ))}
            </div>
          </>
        )}
      </div>
    </AdminLayout>
  );
}
