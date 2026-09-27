import { Navigate } from 'react-router-dom';
import { isModuleActive } from '../../navigation/modules';

/**
 * Guards a storefront/customer route behind an active module. If the module is
 * off (or unlicensed), the page redirects instead of rendering a shell whose
 * API calls the backend already 404s.
 *
 *   <Route path="/products" element={<ModuleRoute module="ecommerce"><Products/></ModuleRoute>} />
 *
 * `redirectTo` defaults to home. Pass the same module key used in navigation
 * (e.g. MODULES.ECOMMERCE, MODULES.HAMPERS).
 */
export default function ModuleRoute({ module, children, redirectTo = '/' }) {
  if (!isModuleActive(module)) {
    return <Navigate to={redirectTo} replace />;
  }
  return children;
}
