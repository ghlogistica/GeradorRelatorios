import React, { useState, useEffect } from 'react';
import './ConexoesAdmin.css';

export default function ConexoesAdmin() {
  const [conexoes, setConexoes] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [formData, setFormData] = useState({
    nome_conexao: '', tipo_banco: 'postgres', host: '', porta: '', usuario: '', senha: '', database: ''
  });

  // Mock initial load (will be replaced by actual API fetch)
  useEffect(() => {
    // fetch('/api/conexoes').then(r => r.json()).then(setConexoes);
    setConexoes([
      { id: 1, nome_conexao: 'ERP SQL Server', tipo_banco: 'sqlserver', host: '192.168.1.100', porta: 1433, database: 'erp_prod' }
    ]);
  }, []);

  const handleChange = (e) => setFormData({ ...formData, [e.target.name]: e.target.value });

  const handleSave = async () => {
    // await fetch('/api/conexoes', { method: 'POST', body: JSON.stringify(formData), headers: {'Content-Type':'application/json'} });
    setConexoes([...conexoes, { id: Date.now(), ...formData }]);
    setShowModal(false);
    setFormData({ nome_conexao: '', tipo_banco: 'postgres', host: '', porta: '', usuario: '', senha: '', database: '' });
  };

  return (
    <div className="admin-container">
      <div className="admin-header">
        <h1>Conexões de Banco de Dados (ERPs)</h1>
        <button className="btn-primary" onClick={() => setShowModal(true)}>+ Nova Conexão</button>
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
                <button className="btn-icon edit">✏️</button>
                <button className="btn-icon delete">🗑️</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {showModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h2>Cadastrar Conexão</h2>
            
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
                <input type="password" name="senha" value={formData.senha} onChange={handleChange} />
              </div>
            </div>

            <div className="form-group">
              <label>Nome do Banco (Database)</label>
              <input type="text" name="database" value={formData.database} onChange={handleChange} />
            </div>

            <div className="modal-actions">
              <button className="btn-secondary" onClick={() => setShowModal(false)}>Cancelar</button>
              <button className="btn-primary" onClick={handleSave}>Salvar Conexão</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
