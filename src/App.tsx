import { HashRouter, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { HomePage } from './pages/HomePage';
import { CodesPage } from './pages/CodesPage';
import { ParamsPage } from './pages/ParamsPage';
import { TreeDesignPage } from './pages/TreeDesignPage';
import { MapPage } from './pages/MapPage';
import { CheckPage } from './pages/CheckPage';

export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<HomePage />} />
          <Route path="codes" element={<CodesPage />} />
          <Route path="params" element={<ParamsPage />} />
          <Route path="tree" element={<TreeDesignPage />} />
          <Route path="map" element={<MapPage />} />
          <Route path="check" element={<CheckPage />} />
        </Route>
      </Routes>
    </HashRouter>
  );
}
