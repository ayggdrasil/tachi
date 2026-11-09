import { Navigate, Route, Routes } from 'react-router-dom';
import Landing from './pages/Landing';
import SeniorApp from './pages/senior/SeniorApp';
import FamilyApp from './pages/family/FamilyApp';
import DirectorConsole from './pages/demo/DirectorConsole';
import { Toasts } from './components/common/Toasts';

export default function App() {
  return (
    <>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/join" element={<Landing />} />
        <Route path="/senior" element={<SeniorApp />} />
        <Route path="/family" element={<FamilyApp />} />
        <Route path="/demo" element={<DirectorConsole />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <Toasts />
    </>
  );
}
