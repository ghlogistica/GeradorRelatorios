import React, { useState, useEffect } from 'react';
import './PrintOperacional.css';

export default function PrintOperacional() {
  const [templates, setTemplates] = useState([]);
  const [templateSelecionado, setTemplateSelecionado] = useState('');
  const [camposDinamicos, setCamposDinamicos] = useState([]);
  const [formData, setFormData] = useState({});
  const [loading, setLoading] = useState(false);
  
  const [resultadoPreview, setResultadoPreview] = useState(null);

  // 1. Carrega os templates disponíveis ao abrir a tela
  useEffect(() => {
    // Exemplo: fetch('/api/templates')
    // Simulando retorno do banco:
    setTemplates([
      { id: 1, nome: 'Etiqueta de Expedição' },
      { id: 2, nome: 'Etiqueta de Qualidade (Q.A)' }
    ]);
  }, []);

  // 2. Ao selecionar um template, busca os campos_input vinculados a ele
  useEffect(() => {
    if (!templateSelecionado) {
      setCamposDinamicos([]);
      setFormData({});
      return;
    }

    // Exemplo: fetch(`/api/templates/${templateSelecionado}/campos`)
    // Simulando o retorno da tabela 'campos_input'
    const camposMock = templateSelecionado === '1' 
      ? [
          { id: 101, nome_campo: 'numero_pedido', label_exibicao: 'Número do Pedido', tipo_dado: 'numero' },
          { id: 102, nome_campo: 'cod_operador', label_exibicao: 'Cód. Operador (Crachá)', tipo_dado: 'texto' }
        ]
      : [
          { id: 103, nome_campo: 'lote_producao', label_exibicao: 'Lote de Produção', tipo_dado: 'texto' }
        ];

    setCamposDinamicos(camposMock);
    
    // Reseta o formulário
    const initialData = {};
    camposMock.forEach(c => initialData[c.nome_campo] = '');
    setFormData(initialData);
    setResultadoPreview(null);
  }, [templateSelecionado]);

  // Handle mudança nos inputs gerados dinamicamente
  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  // 3. Submeter formulário para a API criada anteriormente
  const handleImprimir = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      /*
      // Chamada real para a API:
      const response = await fetch('/api/imprimir-etiqueta', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          template_id: parseInt(templateSelecionado),
          parametros: formData
        })
      });
      const json = await response.json();
      */

      // Simulando o delay e a resposta do banco de dados (ex: Nome do Cliente e Produto)
      await new Promise(resolve => setTimeout(resolve, 800));
      
      const mockResponse = {
        success: true,
        data: [
          { 
            cliente_nome: 'Indústrias Acme S.A.', 
            produto_desc: 'Caixa de Engrenagens 500w',
            peso: '12.5 kg',
            destino: 'Galpão 4'
          }
        ]
      };

      if (mockResponse.success && mockResponse.data.length > 0) {
        setResultadoPreview(mockResponse.data[0]);
        dispararImpressaoZebra(mockResponse.data[0]);
      } else {
        alert('Nenhum dado encontrado com esses filtros.');
      }

    } catch (error) {
      console.error(error);
      alert('Erro ao comunicar com o servidor.');
    } finally {
      setLoading(false);
    }
  };

  // 4. Função que cuida do envio para a impressora (ex: via rede, ou Web Print)
  const dispararImpressaoZebra = (dados) => {
    console.log('Enviando para impressora...', dados);
    // Aqui viria a lógica de integrar com QZ Tray, Browser Print (Zebra) ou raw socket TCP.
    // Para simplificar a experiência do usuário:
    setTimeout(() => {
      alert('✅ Etiqueta enviada para a impressora com sucesso!');
    }, 500);
  };

  return (
    <div className="operacional-container">
      <header className="operacional-header">
        <h1>Centro de Impressão</h1>
        <p>Selecione o modelo e bipe/digite os dados para imprimir.</p>
      </header>

      <div className="operacional-card">
        <form onSubmit={handleImprimir}>
          <div className="form-group-large">
            <label>Modelo de Etiqueta</label>
            <select 
              className="large-input"
              value={templateSelecionado} 
              onChange={(e) => setTemplateSelecionado(e.target.value)}
              required
            >
              <option value="">-- SELECIONE --</option>
              {templates.map(t => (
                <option key={t.id} value={t.id}>{t.nome}</option>
              ))}
            </select>
          </div>

          {/* 2. Formulário Dinâmico baseado no Banco de Dados */}
          <div className="dynamic-inputs-area">
            {camposDinamicos.map(campo => (
              <div className="form-group-large" key={campo.id}>
                <label>{campo.label_exibicao}</label>
                <input 
                  type={campo.tipo_dado === 'numero' ? 'number' : 'text'}
                  className="large-input"
                  name={campo.nome_campo}
                  value={formData[campo.nome_campo] || ''}
                  onChange={handleInputChange}
                  placeholder={`Digite ou bipe o ${campo.label_exibicao.toLowerCase()}`}
                  required
                />
              </div>
            ))}
          </div>

          {templateSelecionado && (
            <button 
              type="submit" 
              className={`btn-imprimir ${loading ? 'loading' : ''}`}
              disabled={loading}
            >
              {loading ? 'Processando...' : 'IMPRIMIR ETIQUETA'}
            </button>
          )}
        </form>
      </div>

      {/* 4. Preview dos Dados Retornados */}
      {resultadoPreview && (
        <div className="preview-card">
          <div className="preview-header">
            <h3>Última Impressão (Sucesso)</h3>
          </div>
          <div className="preview-body">
            {Object.entries(resultadoPreview).map(([key, val]) => (
              <div className="preview-row" key={key}>
                <strong>{key.replace('_', ' ').toUpperCase()}:</strong>
                <span>{val}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
