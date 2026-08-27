import React, { useState } from 'react'
import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import Login from './components/Login/Login'

import TemplateEditor from './components/TemplateEditor/TemplateEditor'
import PrintOperacional from './components/PrintOperacional/PrintOperacional'
import TemplateDashboard from './components/TemplateDashboard/TemplateDashboard'
import ConexoesAdmin from './components/ConexoesAdmin/ConexoesAdmin'
import CategoriasAdmin from './components/CategoriasAdmin/CategoriasAdmin'
import PerfisAdmin from './components/PerfisAdmin/PerfisAdmin'
import UsuariosAdmin from './components/UsuariosAdmin/UsuariosAdmin'

function AppContent() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const { currentUser, userProfile, logout } = useAuth();

  if (!currentUser) {
    return <Login />;
  }

  // Se o usuário não tiver perfil, ele não deveria estar aqui (tratado no AuthContext)
  const telas = userProfile?.telas_acesso || [];
  const isAdmin = userProfile?.isAdmin;

  const hasAccess = (tela) => isAdmin || telas.includes(tela);

  return (
    <Router>
      <div className="app-container">
        <aside className={`sidebar ${isSidebarOpen ? '' : 'collapsed'}`}>
          <div className="sidebar-header" style={{ position: 'relative', cursor: 'pointer' }} onClick={() => setIsSidebarOpen(!isSidebarOpen)}>
            <img src="https://buckettiimagens.s3.us-east-2.amazonaws.com/Imagens-s3/logo+GH+branco.png" alt="GH Logo" className="brand-logo" />
            {isSidebarOpen && <h2 className="brand-name">GHRelatórios</h2>}
          </div>
          
          <nav className="sidebar-nav">
            {hasAccess('print') && (
              <Link to="/" className="nav-item" title="Impressão Operacional">
                <span className="nav-icon">🖨️</span> {isSidebarOpen && <span className="nav-text">Impressão Operacional</span>}
              </Link>
            )}
            
            {(hasAccess('admin') || hasAccess('editor') || hasAccess('conexoes') || hasAccess('categorias') || hasAccess('perfis') || hasAccess('usuarios')) && (
              isSidebarOpen ? <div className="nav-group-title">Administração</div> : <div className="nav-group-title" style={{textAlign:'center'}}>---</div>
            )}
            
            {hasAccess('admin') && (
              <Link to="/admin" className="nav-item" title="Dashboard de Templates">
                <span className="nav-icon">📊</span> {isSidebarOpen && <span className="nav-text">Dashboard de Templates</span>}
              </Link>
            )}
            {hasAccess('editor') && (
              <Link to="/editor" className="nav-item" title="Novo Modelo">
                <span className="nav-icon">✨</span> {isSidebarOpen && <span className="nav-text">Novo Modelo</span>}
              </Link>
            )}
            {hasAccess('conexoes') && (
              <Link to="/conexoes" className="nav-item" title="Conexões ERP">
                <span className="nav-icon">🔌</span> {isSidebarOpen && <span className="nav-text">Conexões ERP</span>}
              </Link>
            )}
            {hasAccess('categorias') && (
              <Link to="/categorias" className="nav-item" title="Categorias">
                <span className="nav-icon">📂</span> {isSidebarOpen && <span className="nav-text">Categorias</span>}
              </Link>
            )}
            {hasAccess('perfis') && (
              <Link to="/perfis" className="nav-item" title="Perfis de Acesso">
                <span className="nav-icon">🛡️</span> {isSidebarOpen && <span className="nav-text">Perfis de Acesso</span>}
              </Link>
            )}
            {hasAccess('usuarios') && (
              <Link to="/usuarios" className="nav-item" title="Usuários">
                <span className="nav-icon">👥</span> {isSidebarOpen && <span className="nav-text">Usuários</span>}
              </Link>
            )}
            
            <div style={{ marginTop: 'auto', paddingTop: '20px' }}>
               <button onClick={logout} className="nav-item" style={{ background: 'none', border: 'none', width: '100%', textAlign: 'left', cursor: 'pointer', color: '#ff4d4f' }}>
                 <span className="nav-icon">🚪</span> {isSidebarOpen && <span className="nav-text">Sair</span>}
               </button>
            </div>
          </nav>
        </aside>
        
        <main className="main-content" onClick={() => isSidebarOpen && setIsSidebarOpen(false)}>
          <Routes>
            {hasAccess('print') && <Route path="/" element={<PrintOperacional />} />}
            {hasAccess('admin') && <Route path="/admin" element={<TemplateDashboard />} />}
            {hasAccess('editor') && <Route path="/editor" element={<TemplateEditor />} />}
            {hasAccess('editor') && <Route path="/editor/:id" element={<TemplateEditor />} />}
            {hasAccess('conexoes') && <Route path="/conexoes" element={<ConexoesAdmin />} />}
            {hasAccess('categorias') && <Route path="/categorias" element={<CategoriasAdmin />} />}
            {hasAccess('perfis') && <Route path="/perfis" element={<PerfisAdmin />} />}
            {hasAccess('usuarios') && <Route path="/usuarios" element={<UsuariosAdmin />} />}
            <Route path="*" element={<div style={{padding: '40px'}}><h2>Bem-vindo! Selecione uma opção no menu lateral.</h2></div>} />
          </Routes>
        </main>
      </div>
    </Router>
  )
}

function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

export default App
