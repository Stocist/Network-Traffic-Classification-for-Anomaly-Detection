import { Navigate, Route, Routes } from "react-router-dom"
import { Layout } from "./components/Layout"
import { InferenceResultsProvider } from "./context/InferenceResultsContext"
import { HomePage } from "./pages/Home"
import { DashboardPage } from "./pages/Dashboard"
import { AnomalyDetectionPage } from "./pages/AnomalyDetection"
import { TimeSeriesPage } from "./pages/TimeSeries"
import { ContactPage } from "./pages/Contact"
import JsonDashboardPage from "./pages/JsonDashboard"

export default function App() {
  return (
    <Routes>
      <Route
        element={
          // Provide downstream routes with access to the latest inference run and helper actions.
          <InferenceResultsProvider>
            <Layout />
          </InferenceResultsProvider>
        }
      >
        <Route path="/" element={<HomePage />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/inference" element={<AnomalyDetectionPage />} />
        <Route path="/time-series" element={<TimeSeriesPage />} />
        <Route path="/json" element={<JsonDashboardPage />} />
        <Route path="/contact" element={<ContactPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}
