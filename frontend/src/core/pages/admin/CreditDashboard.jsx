import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import AdminLayout from '../../../_shared/components/layout/AdminLayout';
import HubHeader, { NoAccess } from '../../components/admin/ui/HubHeader';
import SimpleTable from '../../components/admin/ui/SimpleTable';
import booksAPI from '../../../_shared/api/books';
import useAuthStore from '../../../_shared/store/authStore';
import { canReadFinance } from '../../../_shared/lib/roles';
import { errMsg } from '../../../_shared/store/helpers/apiState';
import { card, colors } from '../../../_shared/theme/tokens';
import { money } from '../../components/admin/books/booksFmt';

/** Who owes what on account — read straight from the customers' ledgers. */
export default function CreditDashboard() {
  const user = useAuthStore((s) => s.user);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => { if (canReadFinance(user)) booksAPI.creditOverview().then(setData).catch((e) => setError(errMsg(e, 'Could not load credit accounts'))); }, [user]);

  const cur = data?.base_currency?.code ?? '';
  const columns = [
    { key: 'name', label: 'Customer', render: (c) => <Link to={`/admin/customers/${c.id}`}>{c.name}</Link> },
    { key: 'limit', label: `Limit (${cur})`, align: 'right', render: (c) => (c.limit ? money(c.limit) : '—') },
    { key: 'owed', label: 'Owes', align: 'right', render: (c) => money(c.owed) },
    { key: 'avail', label: 'Available', align: 'right', render: (c) => (c.limit ? money(c.available) : '—') },
    { key: 'over', label: 'Overdue', align: 'right', render: (c) => (c.overdue ? <span style={{ color: colors.dangerText, fontWeight: 700 }}>{money(c.overdue)}</span> : '—') },
    { key: 'terms', label: 'Terms', render: (c) => `${c.terms_days} days` },
  ];

  return (
    <AdminLayout>
      <div style={{ padding: '32px 24px', maxWidth: 1100, margin: '0 auto' }}>
        {!canReadFinance(user) ? <NoAccess what="credit accounts" /> : (
          <>
            <HubHeader title="Credit accounts" description="Customers who buy on account. The balance is their ledger; terms and limits are set on the customer's Credit tab." />
            {error && <p role="alert" style={{ color: colors.dangerText }}>{error}</p>}
            {data && (
              <div style={{ ...card, padding: 16, display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 12, marginBottom: 16 }}>
                <div><span style={{ fontSize: '0.68rem', color: colors.textFaint }}>OWED ({cur})</span><div style={{ fontSize: '1.3rem', fontWeight: 800 }}>{money(data.totals.owed)}</div></div>
                <div><span style={{ fontSize: '0.68rem', color: colors.textFaint }}>OVERDUE ({cur})</span><div style={{ fontSize: '1.3rem', fontWeight: 800, color: colors.dangerText }}>{money(data.totals.overdue)}</div></div>
                <div><span style={{ fontSize: '0.68rem', color: colors.textFaint }}>CREDIT GRANTED ({cur})</span><div style={{ fontSize: '1.3rem', fontWeight: 800 }}>{money(data.totals.limit)}</div></div>
                <div style={{ alignSelf: 'end' }}><Link to="/admin/books?tab=reports&report=receivables">Receivables ageing →</Link></div>
              </div>
            )}
            <SimpleTable columns={columns} rows={data?.customers ?? []} loading={!data && !error} empty="No customer is on a credit account yet." />
          </>
        )}
      </div>
    </AdminLayout>
  );
}
