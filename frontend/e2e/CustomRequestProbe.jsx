import { Route, Routes } from 'react-router-dom';
import CustomRequestPage from '/src/menus/pages/public/CustomRequestPage.jsx';

/** The cake / catering request page on its own: it reads the request's code from the address, so it needs a route around it (the code here is "harness.html"; the check answers for any code). */
export default function CustomRequestProbe() {
  return <Routes><Route path="/e2e/:token" element={<CustomRequestPage />} /><Route path="/menu/request/:token" element={<CustomRequestPage />} /></Routes>;
}
