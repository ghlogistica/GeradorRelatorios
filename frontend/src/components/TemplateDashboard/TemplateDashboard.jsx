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
        if (res.ok && Array.isArray(data)) {
          setTemplates(data);
        } else {
          console.error('Erro na API:', data.error || 'Resposta inválida');
          setTemplates([]); // Garante que é um array para não quebrar o .map
        }
      } catch (error) {
        console.error('Erro ao buscar templates:', error);
        setTemplates([]);
      }
    };
    fetchTemplates();
  }, []);

  const handleEdit = (id) => {
    navigate(`/editor/${id}`);
  };

  const handleClone = async (id) => {
    try {
      // 1. Buscar o template original
      const res = await fetch(`/api/templates/${id}`);
      if (!res.ok) {
        alert('Erro ao buscar o modelo para clonar.');
        return;
      }
      const template = await res.json();

      // 2. Montar o payload para salvar como novo (sem ID)
      const payload = {
        nomeTemplate: template.nome + ' - Cópia',
        tipo_documento: template.tipo_documento,
        configuracoes_impressao: template.configuracoes_impressao,
        parametros_esperados: template.parametros_esperados,
        categoria_id: template.categoria_id,
        queries: template.queries,
        elementosCanvas: template.elementosCanvas
      };

      // 3. Salvar como novo template
      const cloneRes = await fetch('/api/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (cloneRes.ok) {
        // Atualiza a lista
        const fetchRes = await fetch('/api/templates');
        const data = await fetchRes.json();
        setTemplates(data);
      } else {
        alert('Erro ao criar a cópia do modelo.');
      }
    } catch (e) {
      console.error(e);
      alert('Erro de comunicação ao clonar modelo.');
    }
  };

  const confirmDelete = (template) => {
    setTemplateToDelete(template);
    setShowConfirm(true);
  };

  const executeDelete = async () => {
    try {
      const res = await fetch(`/api/templates/${templateToDelete.id}`, { method: 'DELETE' });
      if (res.ok) {
        setTemplates(templates.filter(t => t.id !== templateToDelete.id));
      } else {
        alert('Erro ao excluir o modelo no servidor.');
      }
    } catch (e) {
      alert('Erro de comunicação.');
    }
    setShowConfirm(false);
    setTemplateToDelete(null);
  };

  return (
    <div className="admin-container">
      <div className="admin-header">
        <h1>Modelos de Relatórios (Dashboards)</h1>
        <button className="btn-primary" onClick={() => navigate('/editor')}>+ Novo Modelo</button>
      </div>

      <table className="admin-table">
        <thead>
          <tr>
            <th>Nome do Modelo</th>
            <th>Data de Criação</th>
            <th>Ações</th>
          </tr>
        </thead>
        <tbody>
          {templates.map(tpl => (
            <tr key={tpl.id}>
              <td>{tpl.nome}</td>
              <td>{new Date(tpl.data_criacao).toLocaleDateString()}</td>
              <td>
                <button className="btn-icon edit" onClick={() => handleEdit(tpl.id)} title="Editar">✏️</button>
                <button className="btn-icon clone" onClick={() => handleClone(tpl.id)} title="Clonar">📄</button>
                <button className="btn-icon delete" onClick={() => confirmDelete(tpl)} title="Excluir">🗑️</button>
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
