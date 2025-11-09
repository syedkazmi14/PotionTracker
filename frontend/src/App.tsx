import { Routes, Route, Navigate } from 'react-router-dom'
import { MainLayout } from '@/layouts/MainLayout'
import { DashboardPage } from '@/pages/DashboardPage'
import { MapPage } from '@/pages/MapPage'
import { LiveDataPage } from '@/pages/LiveDataPage'
import { CauldronDetailPage } from '@/pages/CauldronDetailPage'
import { WitchViewPage } from '@/pages/WitchViewPage'

function App() {
  return (
    <Routes>
      <Route path="/" element={<MainLayout />}>
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<DashboardPage />} />
        <Route path="map" element={<MapPage />} />
        <Route path="live-data" element={<LiveDataPage />} />
        <Route path="witch-view" element={<WitchViewPage />} />
        <Route path="cauldron/:id" element={<CauldronDetailPage />} />
      </Route>
    </Routes>
  )
}

export default App

