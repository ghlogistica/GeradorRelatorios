import React, { useState, useEffect } from 'react';
import './CategoriasAdmin.css';

export default function CategoriasAdmin() {
  const [categorias, setCategorias] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [formData, setFormData] = useState({ id: null, nome: '', descricao: '' });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchCategorias();
  }, []);

  const fetchCategorias = async () => {
    try {
      const res = await fetch('/api/categorias');
      const data = await res.json();
      setCategorias(data);
    } catch (error) {
      console.error('Erro ao buscar categorias:', error);
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch('/api/categorias', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });
      if (res.ok) {
        await fetchCategorias();
        setShowModal(false);
        setFormData({ id: null, nome: '', descricao: '' });
      }
    } catch (error) {
      console.error('Erro ao salvar:', error);
      alert('Erro ao salvar categoria.');
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (categoria) => {
    setFormData(categoria);
    setShowModal(true);
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Tem certeza que deseja excluir esta categoria?')) return;
    try {
      const res = await fetch(`/api/categorias/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setCategorias(categorias.filter(c => c.id !== id));
      }
    } catch (error) {
      console.error('Erro ao excluir:', error);
      alert('Erro ao excluir categoria.');
    }
  };

  return (
    <div className="admin-container">
      <div className="admin-header">
        <h1>Categorias de Modelos</h1>
        <button className="btn-primary" onClick={() => {
          setFormData({ id: null, nome: '', descricao: '' });
          setShowModal(true);
        }}>+ Nova Categoria</button>
      </div>

      <table className="admin-table">
        <thead>
          <tr>
            <th>Nome</th>
            <th>Descrição</th>
            <th>Data de Criação</th>
            <th>Ações</th>
          </tr>
        </thead>
        <tbody>
          {categorias.map(cat => (
            <tr key={cat.id}>
              <td>{cat.nome}</td>
              <td>{cat.descricao}</td>
              <td>{new Date(cat.data_criacao || cat.data_atualizacao).toLocaleDateString()}</td>
              <td>
                <button className="btn-icon edit" onClick={() => handleEdit(cat)}>✏️</button>
                <button className="btn-icon delete" onClick={() => handleDelete(cat.id)}>🗑️</button>
              </td>
            </tr>
          ))}
          {categorias.length === 0 && (
            <tr>
              <td colSpan="4" style={{ textAlign: 'center', color: '#666' }}>Nenhuma categoria cadastrada.</td>
            </tr>
          )}
        </tbody>
      </table>

      {showModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h2>{formData.id ? 'Editar Categoria' : 'Nova Categoria'}</h2>
            <form onSubmit={handleSave}>
              <div className="form-group">
                <label>Nome da Categoria</label>
                <input 
                  type="text" 
                  value={formData.nome} 
                  onChange={e => setFormData({...formData, nome: e.target.value})} 
                  placeholder="Ex: Documento Armazém"
                  required 
                />
              </div>
              <div className="form-group">
                <label>Descrição (Opcional)</label>
                <textarea 
                  value={formData.descricao} 
                  onChange={e => setFormData({...formData, descricao: e.target.value})} 
                  placeholder="Ex: Modelos usados para controle de estoque interno"
                  rows="3"
                ></textarea>
              </div>
              
              <div className="modal-actions">
                <button type="button" className="btn-secondary" onClick={() => setShowModal(false)} disabled={loading}>Cancelar</button>
                <button type="submit" className="btn-primary" disabled={loading}>
                  {loading ? 'Salvando...' : 'Salvar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
