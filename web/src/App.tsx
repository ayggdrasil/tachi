import { Suspense, lazy } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { Toasts } from './components/common/Toasts';
import './App.css';

const Landing = lazy(() => import('./pages/Landing'));
const SeniorApp = lazy(() => import('./pages/senior/SeniorApp'));
const FamilyApp = lazy(() => import('./pages/family/FamilyApp'));
const DirectorConsole = lazy(() => import('./pages/demo/DirectorConsole'));

export default function App() {
  const { pathname } = useLocation();
  return (
    <>
      <Suspense fallback={<div className="route-loading" role="status">불러오는 중…</div>}>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/join" element={<Landing />} />
          <Route path="/senior" element={<SeniorApp />} />
          <Route path="/family" element={<FamilyApp />} />
          <Route path="/demo" element={<DirectorConsole />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
      {pathname !== '/senior' && <Toasts />}
    </>
  );
}
