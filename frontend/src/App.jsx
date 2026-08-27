import React, { useState } from 'react'
import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom'
import TemplateEditor from './components/TemplateEditor/TemplateEditor'
import PrintOperacional from './components/PrintOperacional/PrintOperacional'
import TemplateDashboard from './components/TemplateDashboard/TemplateDashboard'
import ConexoesAdmin from './components/ConexoesAdmin/ConexoesAdmin'
import CategoriasAdmin from './components/CategoriasAdmin/CategoriasAdmin'

function App() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  return (
    <Router>
      <div className="app-container">
        <aside className={`sidebar ${isSidebarOpen ? '' : 'collapsed'}`}>
          <div className="sidebar-header" style={{ position: 'relative', cursor: 'pointer' }} onClick={() => setIsSidebarOpen(!isSidebarOpen)}>
            <img src="https://buckettiimagens.s3.us-east-2.amazonaws.com/Imagens-s3/logo+GH+branco.png" alt="GH Logo" className="brand-logo" />
            {isSidebarOpen && <h2 className="brand-name">GHRelatórios</h2>}
          </div>
          
          <nav className="sidebar-nav">
            <Link to="/" className="nav-item" title="Impressão Operacional">
              <span className="nav-icon">🖨️</span> {isSidebarOpen && <span className="nav-text">Impressão Operacional</span>}
            </Link>
            {isSidebarOpen ? <div className="nav-group-title">Administração</div> : <div className="nav-group-title" style={{textAlign:'center'}}>---</div>}
            <Link to="/admin" className="nav-item" title="Dashboard de Templates">
              <span className="nav-icon">📊</span> {isSidebarOpen && <span className="nav-text">Dashboard de Templates</span>}
            </Link>
            <Link to="/editor" className="nav-item" title="Novo Modelo">
              <span className="nav-icon">✨</span> {isSidebarOpen && <span className="nav-text">Novo Modelo</span>}
            </Link>
            <Link to="/conexoes" className="nav-item" title="Conexões ERP">
              <span className="nav-icon">🔌</span> {isSidebarOpen && <span className="nav-text">Conexões ERP</span>}
            <Link to="/categorias" className="nav-item" title="Categorias">
              <span className="nav-icon">📂</span> {isSidebarOpen && <span className="nav-text">Categorias</span>}
            </Link>
          </nav>
        </aside>
        
        <main className="main-content" onClick={() => isSidebarOpen && setIsSidebarOpen(false)}>
          <Routes>
            <Route path="/" element={<PrintOperacional />} />
            <Route path="/admin" element={<TemplateDashboard />} />
            <Route path="/editor" element={<TemplateEditor />} />
            <Route path="/editor/:id" element={<TemplateEditor />} />
            <Route path="/conexoes" element={<ConexoesAdmin />} />
            <Route path="/categorias" element={<CategoriasAdmin />} />
          </Routes>
        </main>
      </div>
    </Router>
  )
}

export default App
