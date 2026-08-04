import React from 'react'
import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom'
import TemplateEditor from './components/TemplateEditor/TemplateEditor'
import PrintOperacional from './components/PrintOperacional/PrintOperacional'
import TemplateDashboard from './components/TemplateDashboard/TemplateDashboard'
import ConexoesAdmin from './components/ConexoesAdmin/ConexoesAdmin'

function App() {
  return (
    <Router>
      <div className="app-container">
        <nav className="main-nav">
          <div className="nav-brand">Zebra Print System</div>
          <div className="nav-links">
            <Link to="/admin" className="nav-item">Dashboard (TI)</Link>
            <Link to="/conexoes" className="nav-item">Conexões ERP</Link>
            <Link to="/" className="nav-item">Impressão Operacional</Link>
          </div>
        </nav>
        
        <main className="main-content">
          <Routes>
            <Route path="/" element={<PrintOperacional />} />
            <Route path="/admin" element={<TemplateDashboard />} />
            <Route path="/editor" element={<TemplateEditor />} />
            <Route path="/editor/:id" element={<TemplateEditor />} />
            <Route path="/conexoes" element={<ConexoesAdmin />} />
          </Routes>
        </main>
      </div>
    </Router>
  )
}

export default App
