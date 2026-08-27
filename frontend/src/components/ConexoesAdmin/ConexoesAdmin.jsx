import React, { useState, useEffect } from 'react';
import './ConexoesAdmin.css';

export default function ConexoesAdmin() {
  const [conexoes, setConexoes] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState({
    id: null, nome_conexao: '', tipo_banco: 'postgres', host: '', porta: '', usuario: '', senha: '', database: ''
  });

  const fetchConexoes = async () => {
    try {
      const res = await fetch('/api/conexoes_banco');
      if (res.ok) {
        const data = await res.json();
        setConexoes(data);
      }
    } catch (e) {
      console.error("Erro ao buscar conexões", e);
    }
  };

  useEffect(() => {
    fetchConexoes();
  }, []);

  const handleChange = (e) => setFormData({ ...formData, [e.target.name]: e.target.value });

  const handleSave = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/conexoes_banco', { 
        method: 'POST', 
        body: JSON.stringify(formData), 
        headers: {'Content-Type':'application/json'} 
      });
      if (res.ok) {
        await fetchConexoes();
        setShowModal(false);
        resetForm();
      } else {
        alert('Erro ao salvar conexão');
      }
    } catch (e) {
      console.error(e);
      alert('Erro de rede ao salvar');
    }
    setIsLoading(false);
  };

  const handleEdit = (conn) => {
    setFormData({
      id: conn.id,
      nome_conexao: conn.nome_conexao,
      tipo_banco: conn.tipo_banco,
      host: conn.host,
      porta: conn.porta,
      usuario: conn.usuario,
      senha: conn.senha || '', // '********' virá da API se já tiver senha
      database: conn.database
    });
    setShowModal(true);
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Tem certeza que deseja excluir esta conexão? Modelos que a utilizam podem parar de funcionar.')) return;
    
    try {
      const res = await fetch(`/api/conexoes_banco/${id}`, { method: 'DELETE' });
      if (res.ok) {
        await fetchConexoes();
      }
    } catch (e) {
      console.error(e);
      alert('Erro ao deletar');
    }
  };

  const resetForm = () => {
    setFormData({ id: null, nome_conexao: '', tipo_banco: 'postgres', host: '', porta: '', usuario: '', senha: '', database: '' });
  };

  return (
    <div className="admin-container">
      <div className="admin-header">
        <h1>Conexões de Banco de Dados (ERPs)</h1>
        <button className="btn-primary" onClick={() => { resetForm(); setShowModal(true); }}>+ Nova Conexão</button>
      </div>

      <table className="admin-table">
        <thead>
          <tr>
            <th>Nome</th>
            <th>Tipo</th>
            <th>Host : Porta</th>
            <th>Database</th>
            <th>Ações</th>
          </tr>
        </thead>
        <tbody>
          {conexoes.map(conn => (
            <tr key={conn.id}>
              <td>{conn.nome_conexao}</td>
              <td>{conn.tipo_banco}</td>
              <td>{conn.host} : {conn.porta}</td>
              <td>{conn.database}</td>
              <td>
                <button className="btn-icon edit" onClick={() => handleEdit(conn)}>✏️</button>
                <button className="btn-icon delete" onClick={() => handleDelete(conn.id)}>🗑️</button>
              </td>
            </tr>
          ))}
          {conexoes.length === 0 && (
            <tr>
              <td colSpan="5" style={{textAlign: 'center', padding: '20px', color: '#666'}}>Nenhuma conexão cadastrada.</td>
            </tr>
          )}
        </tbody>
      </table>

      {showModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h2>{formData.id ? 'Editar Conexão' : 'Cadastrar Conexão'}</h2>
            
            <div className="form-group">
              <label>Nome da Conexão (Apelido)</label>
              <input type="text" name="nome_conexao" value={formData.nome_conexao} onChange={handleChange} placeholder="Ex: ERP Principal" />
            </div>

            <div className="form-group">
              <label>Tipo de Banco</label>
              <select name="tipo_banco" value={formData.tipo_banco} onChange={handleChange}>
                <option value="postgres">PostgreSQL</option>
                <option value="sqlserver">SQL Server</option>
                <option value="mysql">MySQL</option>
                <option value="oracle">Oracle</option>
              </select>
            </div>

            <div className="form-row">
              <div className="form-group half">
                <label>Host / IP</label>
                <input type="text" name="host" value={formData.host} onChange={handleChange} />
              </div>
              <div className="form-group half">
                <label>Porta</label>
                <input type="number" name="porta" value={formData.porta} onChange={handleChange} />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group half">
                <label>Usuário</label>
                <input type="text" name="usuario" value={formData.usuario} onChange={handleChange} />
              </div>
              <div className="form-group half">
                <label>Senha</label>
                <input type="password" name="senha" value={formData.senha} onChange={handleChange} placeholder={formData.id ? 'Deixe vazio ou igual para não alterar' : ''} />
              </div>
            </div>

            <div className="form-group">
              <label>Nome do Banco (Database)</label>
              <input type="text" name="database" value={formData.database} onChange={handleChange} />
            </div>

            <div className="modal-actions">
              <button className="btn-secondary" onClick={() => setShowModal(false)} disabled={isLoading}>Cancelar</button>
              <button className="btn-primary" onClick={handleSave} disabled={isLoading}>
                {isLoading ? 'Salvando...' : 'Salvar Conexão'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
