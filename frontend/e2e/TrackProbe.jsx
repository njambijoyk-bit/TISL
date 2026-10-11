import { Route, Routes } from 'react-router-dom';
import OrderTrackPage from '/src/menus/pages/public/OrderTrackPage.jsx';

/** The order-following page on its own: it reads the order's code from the address, so it needs a route around it (the code here is "harness.html"; the check answers for any code). */
export default function TrackProbe() {
  return <Routes><Route path="/e2e/:token" element={<OrderTrackPage />} /></Routes>;
}
