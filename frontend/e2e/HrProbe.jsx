import { Navigate, Route, Routes } from 'react-router-dom';
import EmployeeList from '/src/core/pages/admin/employees/EmployeeList.jsx';
import EmployeeDetail from '/src/core/pages/admin/employees/EmployeeDetail.jsx';
import EmployeeForm from '/src/core/pages/admin/employees/EmployeeForm.jsx';
import HrConfiguration from '/src/core/pages/admin/hr/HrConfiguration.jsx';

/** The HR screens with their own addresses (HR stage 1). Starts at ?at=/admin/employees/... */
export default function HrProbe() {
  const at = new URLSearchParams(window.location.search).get('at') || '/admin/employees';
  return (
    <Routes>
      <Route path="/e2e/*" element={<Navigate to={at} replace />} />
      <Route path="/admin/employees" element={<EmployeeList />} />
      <Route path="/admin/employees/create" element={<EmployeeForm />} />
      <Route path="/admin/employees/:id" element={<EmployeeDetail />} />
      <Route path="/admin/employees/:id/edit" element={<EmployeeForm />} />
      <Route path="/admin/hr/configuration" element={<HrConfiguration />} />
    </Routes>
  );
}
