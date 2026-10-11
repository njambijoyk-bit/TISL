import { Route, Routes } from 'react-router-dom';
import TablePage from '/src/menus/pages/public/TablePage.jsx';

/** The page behind a table's QR code on its own: it reads the code from the address (here "harness.html"; the check answers for any code). */
export default function TableProbe() {
  return <Routes><Route path="/e2e/:qr" element={<TablePage />} /></Routes>;
}
