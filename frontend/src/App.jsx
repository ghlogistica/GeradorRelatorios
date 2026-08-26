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
        <aside className="sidebar">
          <div className="sidebar-header">
            <img src="https://buckettiimagens.s3.us-east-2.amazonaws.com/Imagens-s3/logo+GH+branco.png" alt="GH Logo" className="brand-logo" />
            <h2 className="brand-name">GHRelatórios</h2>
          </div>
          
          <nav className="sidebar-nav">
            <Link to="/" className="nav-item">
              <span className="nav-icon">🖨️</span> Impressão Operacional
            </Link>
            <div className="nav-group-title">Administração</div>
            <Link to="/admin" className="nav-item">
              <span className="nav-icon">📊</span> Dashboard de Templates
            </Link>
            <Link to="/conexoes" className="nav-item">
              <span className="nav-icon">🔌</span> Conexões ERP
            </Link>
          </nav>
        </aside>
        
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
