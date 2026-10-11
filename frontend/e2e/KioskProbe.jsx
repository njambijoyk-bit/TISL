import { Route, Routes } from 'react-router-dom';
import KioskPage from '/src/menus/pages/public/KioskPage.jsx';

/** The kiosk screen on its own: it reads its secret from the address (here "harness.html"; the check answers for any secret). */
export default function KioskProbe() {
  return <Routes><Route path="/e2e/:token" element={<KioskPage />} /></Routes>;
}
