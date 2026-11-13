import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { DataPage } from './pages/DataPage';
import { TreePage } from './pages/TreePage';
import { MapPage } from './pages/MapPage';
import { CheckPage } from './pages/CheckPage';

export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Navigate to="/data" replace />} />
          <Route path="data" element={<DataPage />} />
          <Route path="tree" element={<TreePage />} />
          <Route path="map" element={<MapPage />} />
          <Route path="check" element={<CheckPage />} />
        </Route>
      </Routes>
    </HashRouter>
  );
}
