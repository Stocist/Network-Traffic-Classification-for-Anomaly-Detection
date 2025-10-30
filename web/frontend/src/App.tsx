import { Navigate, Route, Routes } from "react-router-dom"
import { Layout } from "./components/Layout"
import { DashboardPage } from "./pages/Dashboard"
import { InferencePage } from "./pages/Inference"
import { TimeSeriesPage } from "./pages/TimeSeries"
import { ContactPage } from "./pages/Contact"

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/inference" element={<InferencePage />} />
        <Route path="/time-series" element={<TimeSeriesPage />} />
        <Route path="/contact" element={<ContactPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}
