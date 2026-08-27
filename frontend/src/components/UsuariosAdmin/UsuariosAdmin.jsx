import React, { useState, useEffect } from 'react';

export default function UsuariosAdmin() {
  const [usuarios, setUsuarios] = useState([]);
  const [perfis, setPerfis] = useState([]);
  const [loading, setLoading] = useState(true);
  
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [resUsers, resPerfis] = await Promise.all([
        fetch('/api/usuarios'),
        fetch('/api/perfis')
      ]);
      if (resUsers.ok) setUsuarios(await resUsers.json());
      if (resPerfis.ok) setPerfis(await resPerfis.json());
    } catch (err) {
      console.error(err);
      alert('Erro ao carregar dados.');
    }
    setLoading(false);
  };

  const handleNovo = () => {
    setFormData({
      id: null,
      email: '',
      perfil_id: ''
    });
    setIsEditing(true);
  };

  const handleEditar = (user) => {
    setFormData({ ...user });
    setIsEditing(true);
  };

  const handleDeletar = async (id) => {
    if (!window.confirm('Tem certeza que deseja revogar o acesso deste usuário?')) return;
    try {
      const res = await fetch(`/api/usuarios/${id}`, { method: 'DELETE' });
      if (res.ok) {
        fetchData();
      }
    } catch (err) {
      console.error(err);
      alert('Erro ao deletar usuário.');
    }
  };

  const handleSalvar = async (e) => {
    e.preventDefault();
    try {
      if (formData.id) {
        // Editar
        const res = await fetch(`/api/usuarios/${formData.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ perfil_id: formData.perfil_id })
        });
        if (res.ok) {
          setIsEditing(false);
          fetchData();
        } else {
          alert('Erro ao atualizar usuário.');
        }
      } else {
        // Convidar (Novo)
        const res = await fetch('/api/usuarios/convidar', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: formData.email, perfil_id: formData.perfil_id })
        });
        
        const data = await res.json();
        
        if (res.ok) {
          alert('Convite enviado para ' + formData.email);
          setIsEditing(false);
          fetchData();
        } else {
          alert(data.error || 'Erro ao enviar convite.');
        }
      }
    } catch (err) {
      console.error(err);
      alert('Erro ao salvar.');
    }
  };

  const getPerfilNome = (id) => {
    const p = perfis.find(x => x.id === id);
    return p ? p.nome : 'Desconhecido';
  };

  if (loading) return <div style={{padding: '20px'}}>Carregando...</div>;

  return (
    <div style={{ padding: '20px', maxWidth: '1000px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h2>Gerenciar Usuários e Convites</h2>
        {!isEditing && (
          <button onClick={handleNovo} style={{ padding: '10px 20px', backgroundColor: '#0d6efd', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
            + Convidar Usuário
          </button>
        )}
      </div>

      {isEditing ? (
        <div style={{ backgroundColor: 'white', padding: '20px', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>
          <h3>{formData.id ? 'Alterar Perfil' : 'Convidar Novo Usuário'}</h3>
          <form onSubmit={handleSalvar}>
            <div style={{ marginBottom: '15px' }}>
              <label style={{ display: 'block', marginBottom: '5px' }}>E-mail do Usuário</label>
              <input 
                type="email" 
                value={formData.email} 
                onChange={e => setFormData({...formData, email: e.target.value})} 
                required 
                disabled={!!formData.id} // Não pode mudar o e-mail depois de convidado
                style={{ width: '100%', padding: '8px', border: '1px solid #ccc', borderRadius: '4px', backgroundColor: formData.id ? '#f1f5f9' : 'white' }}
              />
              {!formData.id && <small style={{color: '#64748b'}}>O usuário receberá um link de acesso no e-mail informado.</small>}
            </div>

            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', marginBottom: '5px' }}>Perfil de Acesso</label>
              <select 
                value={formData.perfil_id} 
                onChange={e => setFormData({...formData, perfil_id: e.target.value})} 
                required 
                style={{ width: '100%', padding: '8px', border: '1px solid #ccc', borderRadius: '4px' }}
              >
                <option value="">-- Selecione o perfil --</option>
                {perfis.map(p => (
                  <option key={p.id} value={p.id}>{p.nome} {p.isAdmin ? '(Admin)' : ''}</option>
                ))}
              </select>
            </div>

            <div style={{ marginTop: '30px', display: 'flex', gap: '10px' }}>
              <button type="submit" style={{ padding: '10px 20px', backgroundColor: '#0f172a', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
                {formData.id ? 'Salvar Alteração' : 'Enviar Convite'}
              </button>
              <button type="button" onClick={() => setIsEditing(false)} style={{ padding: '10px 20px', backgroundColor: '#e2e8f0', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Cancelar</button>
            </div>
          </form>
        </div>
      ) : (
        <div style={{ backgroundColor: 'white', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                <th style={{ padding: '15px' }}>E-mail</th>
                <th style={{ padding: '15px' }}>Perfil Atribuído</th>
                <th style={{ padding: '15px' }}>Status</th>
                <th style={{ padding: '15px', textAlign: 'right' }}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {usuarios.map(u => (
                <tr key={u.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '15px', fontWeight: '500' }}>{u.email}</td>
                  <td style={{ padding: '15px' }}>{getPerfilNome(u.perfil_id)}</td>
                  <td style={{ padding: '15px' }}>
                    {u.status === 'ativo' ? (
                      <span style={{ backgroundColor: '#dcfce7', color: '#166534', padding: '4px 8px', borderRadius: '12px', fontSize: '12px', fontWeight: 'bold' }}>Ativo</span>
                    ) : (
                      <span style={{ backgroundColor: '#fef3c7', color: '#92400e', padding: '4px 8px', borderRadius: '12px', fontSize: '12px' }}>Pendente (Aguardando Primeiro Login)</span>
                    )}
                  </td>
                  <td style={{ padding: '15px', textAlign: 'right' }}>
                    <button onClick={() => handleEditar(u)} style={{ background: 'none', border: 'none', color: '#0d6efd', cursor: 'pointer', marginRight: '10px' }}>Trocar Perfil</button>
                    <button onClick={() => handleDeletar(u.id)} style={{ background: 'none', border: 'none', color: '#dc3545', cursor: 'pointer' }}>Revogar Acesso</button>
                  </td>
                </tr>
              ))}
              {usuarios.length === 0 && (
                <tr>
                  <td colSpan="4" style={{ padding: '20px', textAlign: 'center', color: '#64748b' }}>Nenhum usuário cadastrado.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
