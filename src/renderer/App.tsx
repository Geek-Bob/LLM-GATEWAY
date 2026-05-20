import { useState } from 'react'
import { Layout, PageKey } from './components/Layout'
import { Dashboard } from './pages/Dashboard'
import { ProvidersPage } from './pages/Providers'
import { ApiKeysPage } from './pages/ApiKeys'
import { LogsPage } from './pages/Logs'
import { ChatPage } from './pages/Chat'

function App() {
  const [activePage, setActivePage] = useState<PageKey>('dashboard')

  const renderPage = () => {
    switch (activePage) {
      case 'dashboard':
        return <Dashboard />
      case 'providers':
        return <ProvidersPage />
      case 'api-keys':
        return <ApiKeysPage />
      case 'logs':
        return <LogsPage />
      case 'chat':
        return <ChatPage />
      default:
        return null
    }
  }

  return (
    <Layout activePage={activePage} onNavigate={setActivePage}>
      {renderPage()}
    </Layout>
  )
}

export default App
