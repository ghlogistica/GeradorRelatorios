import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import './TemplateDashboard.css';

export default function TemplateDashboard() {
  const navigate = useNavigate();
  const [templates, setTemplates] = useState([]);
  const [showConfirm, setShowConfirm] = useState(false);
  const [templateToDelete, setTemplateToDelete] = useState(null);

  // Carrega templates do backend
  useEffect(() => {
    const fetchTemplates = async () => {
      try {
        const res = await fetch('/api/templates');
        const data = await res.json();
        setTemplates(data);
      } catch (error) {
        console.error('Erro ao buscar templates:', error);
      }
    };
    fetchTemplates();
  }, []);

  const handleEdit = (id) => {
    navigate(`/editor/${id}`);
  };

  const confirmDelete = (template) => {
    setTemplateToDelete(template);
    setShowConfirm(true);
  };

  const executeDelete = async () => {
    // await fetch(`/api/templates/${templateToDelete.id}`, { method: 'DELETE' });
    setTemplates(templates.filter(t => t.id !== templateToDelete.id));
    setShowConfirm(false);
    setTemplateToDelete(null);
  };

  return (
    <div className="admin-container">
      <div className="admin-header">
        <h1>Modelos de Etiqueta (Dashboards)</h1>
        <button className="btn-primary" onClick={() => navigate('/editor')}>+ Novo Modelo</button>
      </div>

      <table className="admin-table">
        <thead>
          <tr>
            <th>ID</th>
            <th>Nome do Modelo</th>
            <th>Data de Criação</th>
            <th>Ações</th>
          </tr>
        </thead>
        <tbody>
          {templates.map(tpl => (
            <tr key={tpl.id}>
              <td>{tpl.id}</td>
              <td>{tpl.nome}</td>
              <td>{new Date(tpl.data_criacao).toLocaleDateString()}</td>
              <td>
                <button className="btn-icon edit" onClick={() => handleEdit(tpl.id)}>✏️</button>
                <button className="btn-icon delete" onClick={() => confirmDelete(tpl)}>🗑️</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {showConfirm && (
        <div className="modal-overlay">
          <div className="modal-content confirm-modal">
            <h2>Confirmar Exclusão</h2>
            <p>Você tem certeza que deseja excluir o modelo <strong>{templateToDelete?.nome}</strong>?</p>
            <p className="warning-text">Esta ação não pode ser desfeita e removerá todas as configurações de layout e queries associadas.</p>
            
            <div className="modal-actions">
              <button className="btn-secondary" onClick={() => setShowConfirm(false)}>Cancelar</button>
              <button className="btn-danger" onClick={executeDelete}>Sim, Excluir</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
