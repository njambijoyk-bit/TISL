import Sidebar from './Sidebar';

export default function AdminLayout({ children }) {
  return (
    <div className="flex min-h-screen bg-gray-50 dark:bg-gray-900">
      <Sidebar />

      <main className="flex-1 overflow-x-hidden admin-main-content">
        <div className="container mx-auto px-4 lg:px-8 py-8">
          {children}
        </div>
      </main>

      <style>{`
        @media (max-width: 768px) {
          .admin-main-content {
            padding-top: 60px;
          }
          .admin-main-content .container {
            padding-left: 0.875rem;
            padding-right: 0.875rem;
          }
        }
      `}</style>
    </div>
  );
}