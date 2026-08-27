import React, { useState, useEffect } from 'react';

export default function PerfisAdmin() {
  const [perfis, setPerfis] = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [loading, setLoading] = useState(true);
  
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState(null);

  const telasDisponiveis = [
    { id: 'print', nome: 'Impressão Operacional' },
    { id: 'admin', nome: 'Dashboard de Templates' },
    { id: 'editor', nome: 'Novo Modelo' },
    { id: 'conexoes', nome: 'Conexões ERP' },
    { id: 'categorias', nome: 'Categorias' },
    { id: 'perfis', nome: 'Perfis de Acesso' },
    { id: 'usuarios', nome: 'Usuários e Convites' }
  ];

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [resPerfis, resCats] = await Promise.all([
        fetch('/api/perfis'),
        fetch('/api/categorias')
      ]);
      if (resPerfis.ok) setPerfis(await resPerfis.json());
      if (resCats.ok) setCategorias(await resCats.json());
    } catch (err) {
      console.error(err);
      alert('Erro ao carregar dados.');
    }
    setLoading(false);
  };

  const handleNovo = () => {
    setFormData({
      id: null,
      nome: '',
      isAdmin: false,
      telas_acesso: [],
      categorias_modelos: []
    });
    setIsEditing(true);
  };

  const handleEditar = (perfil) => {
    setFormData({ ...perfil });
    setIsEditing(true);
  };

  const handleDeletar = async (id) => {
    if (!window.confirm('Tem certeza que deseja deletar este perfil?')) return;
    try {
      const res = await fetch(`/api/perfis/${id}`, { method: 'DELETE' });
      if (res.ok) {
        fetchData();
      }
    } catch (err) {
      console.error(err);
      alert('Erro ao deletar perfil.');
    }
  };

  const handleToggleTela = (telaId) => {
    setFormData(prev => {
      const telas = [...(prev.telas_acesso || [])];
      if (telas.includes(telaId)) {
        return { ...prev, telas_acesso: telas.filter(t => t !== telaId) };
      } else {
        telas.push(telaId);
        return { ...prev, telas_acesso: telas };
      }
    });
  };

  const handleToggleCategoria = (catId) => {
    setFormData(prev => {
      // Se for "todas"
      if (catId === 'todas') {
        if (prev.categorias_modelos === 'todas') return { ...prev, categorias_modelos: [] };
        return { ...prev, categorias_modelos: 'todas' };
      }

      // Se era todas e agora clicou numa especifica, limpa o 'todas'
      let cats = prev.categorias_modelos === 'todas' ? [] : [...(prev.categorias_modelos || [])];
      
      if (cats.includes(catId)) {
        cats = cats.filter(c => c !== catId);
      } else {
        cats.push(catId);
      }
      return { ...prev, categorias_modelos: cats };
    });
  };

  const handleSalvar = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/perfis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });
      if (res.ok) {
        setIsEditing(false);
        fetchData();
      } else {
        alert('Erro ao salvar.');
      }
    } catch (err) {
      console.error(err);
      alert('Erro ao salvar perfil.');
    }
  };

  if (loading) return <div style={{padding: '20px'}}>Carregando...</div>;

  return (
    <div style={{ padding: '20px', maxWidth: '1000px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h2>Perfis de Acesso</h2>
        {!isEditing && (
          <button onClick={handleNovo} style={{ padding: '10px 20px', backgroundColor: '#0d6efd', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
            + Novo Perfil
          </button>
        )}
      </div>

      {isEditing ? (
        <div style={{ backgroundColor: 'white', padding: '20px', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>
          <h3>{formData.id ? 'Editar Perfil' : 'Novo Perfil'}</h3>
          <form onSubmit={handleSalvar}>
            <div style={{ marginBottom: '15px' }}>
              <label style={{ display: 'block', marginBottom: '5px' }}>Nome do Perfil</label>
              <input 
                type="text" 
                value={formData.nome} 
                onChange={e => setFormData({...formData, nome: e.target.value})} 
                required 
                style={{ width: '100%', padding: '8px', border: '1px solid #ccc', borderRadius: '4px' }}
              />
            </div>

            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                <input 
                  type="checkbox" 
                  checked={formData.isAdmin} 
                  onChange={e => setFormData({...formData, isAdmin: e.target.checked})} 
                />
                <strong>Perfil Administrador (Acesso Irrestrito)</strong>
              </label>
            </div>

            {!formData.isAdmin && (
              <div style={{ display: 'flex', gap: '40px' }}>
                <div style={{ flex: 1 }}>
                  <h4 style={{ marginBottom: '10px' }}>Telas Liberadas</h4>
                  {telasDisponiveis.map(tela => (
                    <label key={tela.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', cursor: 'pointer' }}>
                      <input 
                        type="checkbox" 
                        checked={(formData.telas_acesso || []).includes(tela.id)}
                        onChange={() => handleToggleTela(tela.id)}
                      />
                      {tela.nome}
                    </label>
                  ))}
                </div>
                
                <div style={{ flex: 1 }}>
                  <h4 style={{ marginBottom: '10px' }}>Categorias de Relatórios Liberadas</h4>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', cursor: 'pointer' }}>
                    <input 
                      type="checkbox" 
                      checked={formData.categorias_modelos === 'todas'}
                      onChange={() => handleToggleCategoria('todas')}
                    />
                    <strong>Todas as Categorias</strong>
                  </label>
                  <hr style={{ margin: '10px 0' }} />
                  {categorias.map(cat => (
                    <label key={cat.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', cursor: 'pointer' }}>
                      <input 
                        type="checkbox" 
                        disabled={formData.categorias_modelos === 'todas'}
                        checked={formData.categorias_modelos !== 'todas' && (formData.categorias_modelos || []).includes(cat.id)}
                        onChange={() => handleToggleCategoria(cat.id)}
                      />
                      {cat.nome}
                    </label>
                  ))}
                </div>
              </div>
            )}

            <div style={{ marginTop: '30px', display: 'flex', gap: '10px' }}>
              <button type="submit" style={{ padding: '10px 20px', backgroundColor: '#0f172a', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Salvar Perfil</button>
              <button type="button" onClick={() => setIsEditing(false)} style={{ padding: '10px 20px', backgroundColor: '#e2e8f0', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Cancelar</button>
            </div>
          </form>
        </div>
      ) : (
        <div style={{ backgroundColor: 'white', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                <th style={{ padding: '15px' }}>Nome</th>
                <th style={{ padding: '15px' }}>Tipo</th>
                <th style={{ padding: '15px', textAlign: 'right' }}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {perfis.map(p => (
                <tr key={p.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '15px', fontWeight: '500' }}>{p.nome}</td>
                  <td style={{ padding: '15px' }}>
                    {p.isAdmin ? (
                      <span style={{ backgroundColor: '#fee2e2', color: '#991b1b', padding: '4px 8px', borderRadius: '12px', fontSize: '12px', fontWeight: 'bold' }}>Admin</span>
                    ) : (
                      <span style={{ backgroundColor: '#e0e7ff', color: '#3730a3', padding: '4px 8px', borderRadius: '12px', fontSize: '12px' }}>Limitado</span>
                    )}
                  </td>
                  <td style={{ padding: '15px', textAlign: 'right' }}>
                    <button onClick={() => handleEditar(p)} style={{ background: 'none', border: 'none', color: '#0d6efd', cursor: 'pointer', marginRight: '10px' }}>Editar</button>
                    <button onClick={() => handleDeletar(p.id)} style={{ background: 'none', border: 'none', color: '#dc3545', cursor: 'pointer' }}>Excluir</button>
                  </td>
                </tr>
              ))}
              {perfis.length === 0 && (
                <tr>
                  <td colSpan="3" style={{ padding: '20px', textAlign: 'center', color: '#64748b' }}>Nenhum perfil cadastrado.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
