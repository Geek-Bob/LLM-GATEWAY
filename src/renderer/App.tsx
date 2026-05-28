import { HashRouter, Routes, Route } from 'react-router-dom'
import { Layout } from './components/Layout'
import { Dashboard } from './pages/Dashboard'
import { ProvidersPage } from './pages/Providers'
import { ApiKeysPage } from './pages/ApiKeys'
import { LogsPage } from './pages/Logs'
import { ChatPage } from './pages/Chat'
import { Sonner } from './components/ui/sonner'

function App() {
  return (
    <>
      <HashRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<Dashboard />} />
            <Route path="providers" element={<ProvidersPage />} />
            <Route path="api-keys" element={<ApiKeysPage />} />
            <Route path="logs" element={<LogsPage />} />
            <Route path="chat" element={<ChatPage />} />
          </Route>
        </Routes>
      </HashRouter>
      <Sonner />
    </>
  )
}

export default App
