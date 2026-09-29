import { Navigate, useParams } from 'react-router-dom';

/** The old credit detail page is gone — a customer's credit lives on their own page. */
export default function CustomerCreditDetail() {
  const { id } = useParams();
  return <Navigate to={`/admin/customers/${id}?tab=credit`} replace />;
}
