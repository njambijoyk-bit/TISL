import { Outlet } from 'react-router-dom';
import CareersHeader from './CareersHeader';
import CareersFooter from './CareersFooter';

export default function CareersLayout() {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
            <CareersHeader />
            <main style={{ flex: 1 }}>
                <Outlet />
            </main>
            <CareersFooter />
        </div>
    );
}