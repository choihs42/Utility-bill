import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { CodesPage } from './pages/CodesPage';
import { TagsSection } from './pages/TagsSection';
import { TreePage } from './pages/TreePage';
import { MapPage } from './pages/MapPage';
import { CheckPage } from './pages/CheckPage';

export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Navigate to="/codes" replace />} />
          <Route path="codes" element={<CodesPage />} />
          <Route path="tags" element={<TagsSection />} />
          <Route path="tree" element={<TreePage />} />
          <Route path="map" element={<MapPage />} />
          <Route path="check" element={<CheckPage />} />
        </Route>
      </Routes>
    </HashRouter>
  );
}
