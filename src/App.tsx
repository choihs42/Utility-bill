import { HashRouter, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { TreePage } from './pages/TreePage';
import { PointsPage } from './pages/PointsPage';
import { AssetsPage } from './pages/AssetsPage';
import { CodesPage } from './pages/CodesPage';
import { ValidatePage } from './pages/ValidatePage';

export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<TreePage />} />
          <Route path="points" element={<PointsPage />} />
          <Route path="assets" element={<AssetsPage />} />
          <Route path="codes" element={<CodesPage />} />
          <Route path="validate" element={<ValidatePage />} />
        </Route>
      </Routes>
    </HashRouter>
  );
}
