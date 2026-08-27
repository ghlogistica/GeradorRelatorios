import React, { useState } from 'react';
import './TemplateEditor.css';

export default function TemplateEditor() {
  // 1. Configuração Geral
  const [nomeTemplate, setNomeTemplate] = useState('');
  const [tipoDocumento, setTipoDocumento] = useState('etiqueta');
  const [queries, setQueries] = useState([{ id: Date.now(), conexao_id: '1', nome_alias_tabela: 'QueryPrincipal', query_sql: '' }]);
  const [configFisica, setConfigFisica] = useState({
    largura: 10,
    altura: 15,
    orientacao: 'retrato',
    margem: 0.5
  });

  // 2. Inputs do Usuário
  const [camposFiltro, setCamposFiltro] = useState([]);

  // 3. Canvas Drag-and-Drop
  const [elementosCanvas, setElementosCanvas] = useState([]);
  const [elementoSelecionado, setElementoSelecionado] = useState(null);

  // 4. IA Generation
  const [loadingIA, setLoadingIA] = useState(false);

  // --- Handlers para Inputs de Filtro ---
  const adicionarFiltro = () => {
    setCamposFiltro([
      ...camposFiltro,
      { id: Date.now(), nome_campo: '', label_exibicao: '' }
    ]);
  };

  const atualizarFiltro = (id, field, value) => {
    setCamposFiltro(camposFiltro.map(c => c.id === id ? { ...c, [field]: value } : c));
  };

  const removerFiltro = (id) => {
    setCamposFiltro(camposFiltro.filter(c => c.id !== id));
  };

  // --- Handlers para o Canvas Drag-and-Drop ---
  const handleDragStartTool = (e, tipo) => {
    e.dataTransfer.setData('tipoElemento', tipo);
  };

  const handleDropCanvas = (e) => {
    e.preventDefault();
    const tipo = e.dataTransfer.getData('tipoElemento');
    if (!tipo) return;

    // Conversão de CM para PX (Fator de tela: 1cm = ~37.8px)
    const cmToPx = 37.8;
    const margemPx = configFisica.margem * cmToPx;
    
    // Calcula largura e altura dinâmicas baseado na orientação
    const isRetrato = configFisica.orientacao === 'retrato';
    const canvasWidthPx = (isRetrato ? configFisica.largura : configFisica.altura) * cmToPx;
    const canvasHeightPx = (isRetrato ? configFisica.altura : configFisica.largura) * cmToPx;

    // Constrains (Limites das Margens)
    // Subtrai um offset aproximado para o próprio tamanho do elemento (ex: 50px) para não cortar na borda direita/inferior
    let boundedX = Math.max(margemPx, Math.min(x, canvasWidthPx - margemPx - 50));
    let boundedY = Math.max(margemPx, Math.min(y, canvasHeightPx - margemPx - 20));

    const novoElemento = {
      id: Date.now(),
      tipo_elemento: tipo,
      posicao_x: boundedX,
      posicao_y: boundedY,
      fonte: 'Arial',
      tamanho_fonte: 14,
      fonte_dados: 'Estatico',
      coluna_banco: '',
      valor_estatico: tipo === 'texto' ? 'Texto Novo' : '123456789',
      is_opcional: false,
      regra_condicional: ''
    };

    setElementosCanvas([...elementosCanvas, novoElemento]);
    setElementoSelecionado(novoElemento.id);
  };

  const handleDragOverCanvas = (e) => {
    e.preventDefault(); // Necessário para permitir o drop
  };

  // --- Handlers para o Painel Lateral (Propriedades) ---
  const atualizarElementoCanvas = (field, value) => {
    if (!elementoSelecionado) return;
    setElementosCanvas(elementosCanvas.map(el => 
      el.id === elementoSelecionado ? { ...el, [field]: value } : el
    ));
  };

  const handleUploadImagemIA = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setLoadingIA(true);
    try {
      const formData = new FormData();
      formData.append('imagem', file);

      // Chamada para o nosso Backend que se conectará à IA
      const res = await fetch('/api/parse-label-image', {
        method: 'POST',
        body: formData
      });

      const data = await res.json();
      if (data.success && data.elementos) {
        setElementosCanvas(data.elementos);
      } else {
        alert('Falha na IA: ' + (data.error || 'Erro desconhecido.'));
      }
    } catch (error) {
      console.error(error);
      alert('Erro de comunicação com o servidor.');
    } finally {
      setLoadingIA(false);
    }
  };

  const handleSalvarModelo = async () => {
    if (!nomeTemplate) {
      alert('Por favor, defina um nome para o Template (1. Configuração Geral).');
      return;
    }
    const payload = { 
      nomeTemplate, 
      tipo_documento: tipoDocumento,
      configuracoes_impressao: configFisica, 
      queries, 
      parametros_esperados: camposFiltro, 
      elementosCanvas 
    };
    try {
      const res = await fetch('/api/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (data.success) {
        alert('Modelo salvo com sucesso (Simulado)!');
      } else {
        alert('Erro ao salvar o modelo: ' + data.error);
      }
    } catch (error) {
      console.error(error);
      alert('Erro de comunicação com o servidor ao salvar.');
    }
  };

  const elementoAtivo = elementosCanvas.find(el => el.id === elementoSelecionado);

  return (
    <div className="editor-container">
      <header className="editor-header">
        <h1>{tipoDocumento === 'relatorio_a4' ? 'Criar Modelo de Relatório A4' : 'Criar Modelo de Etiqueta (Zebra)'}</h1>
        <button className="btn-primary" onClick={handleSalvarModelo}>Salvar Modelo</button>
      </header>

      <div className="editor-layout">
        {/* COLUNA ESQUERDA: Configurações e Tools */}
        <aside className="editor-sidebar-left">
          <section className="config-section">
            <h2>1. Configuração Geral</h2>
            <div className="form-group">
              <label>Nome do Template</label>
              <input 
                type="text" 
                placeholder={tipoDocumento === 'relatorio_a4' ? 'Ex: Ordem de Carregamento' : 'Ex: Etiqueta de Expedição'}
                value={nomeTemplate}
                onChange={(e) => setNomeTemplate(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label>Tipo de Documento</label>
              <select 
                value={tipoDocumento} 
                onChange={(e) => {
                  const tipo = e.target.value;
                  setTipoDocumento(tipo);
                  if (tipo === 'relatorio_a4') {
                    setConfigFisica({ ...configFisica, largura: 21, altura: 29.7 });
                  }
                }}
              >
                <option value="etiqueta">Etiqueta Zebra (Personalizada)</option>
                <option value="relatorio_a4">Relatório A4 (Impressora Comum)</option>
              </select>
            </div>

            <div className="layout-config-group">
              <div className="form-group-row">
                <div className="form-group">
                  <label>Largura (cm)</label>
                  <input type="number" step="0.1" disabled={tipoDocumento === 'relatorio_a4'} value={configFisica.largura} onChange={(e) => setConfigFisica({...configFisica, largura: parseFloat(e.target.value)})} />
                </div>
                <div className="form-group">
                  <label>Altura (cm)</label>
                  <input type="number" step="0.1" disabled={tipoDocumento === 'relatorio_a4'} value={configFisica.altura} onChange={(e) => setConfigFisica({...configFisica, altura: parseFloat(e.target.value)})} />
                </div>
              </div>
              <div className="form-group-row">
                <div className="form-group">
                  <label>Orientação</label>
                  <select value={configFisica.orientacao} onChange={(e) => setConfigFisica({...configFisica, orientacao: e.target.value})}>
                    <option value="retrato">Retrato</option>
                    <option value="paisagem">Paisagem</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Margem (cm)</label>
                  <input type="number" step="0.1" value={configFisica.margem} onChange={(e) => setConfigFisica({...configFisica, margem: parseFloat(e.target.value)})} />
                </div>
              </div>
            </div>

            <div className="form-group queries-group">
              <label>Queries (Multi-Bancos)</label>
              {queries.map((q, index) => (
                <div key={q.id} className="query-card">
                  <div className="query-card-header">
                    <span>Query {index + 1}</span>
                    <button className="btn-icon delete" onClick={() => setQueries(queries.filter(query => query.id !== q.id))}>🗑️</button>
                  </div>
                  <input 
                    type="text" 
                    placeholder="Nome/Alias (ex: DadosCliente)" 
                    value={q.nome_alias_tabela}
                    onChange={(e) => setQueries(queries.map(query => query.id === q.id ? { ...query, nome_alias_tabela: e.target.value } : query))}
                  />
                  <select
                    value={q.conexao_id}
                    onChange={(e) => setQueries(queries.map(query => query.id === q.id ? { ...query, conexao_id: e.target.value } : query))}
                  >
                    <option value="1">ERP SQL Server</option>
                    <option value="2">Postgres Local</option>
                  </select>
                  <textarea 
                    className="code-editor" 
                    placeholder="SELECT * FROM clientes WHERE id = :cliente_id"
                    value={q.query_sql}
                    onChange={(e) => setQueries(queries.map(query => query.id === q.id ? { ...query, query_sql: e.target.value } : query))}
                  ></textarea>
                </div>
              ))}
              <button 
                className="btn-secondary add-query-btn" 
                onClick={() => setQueries([...queries, { id: Date.now(), conexao_id: '1', nome_alias_tabela: '', query_sql: '' }])}
              >
                + Adicionar Query
              </button>
            </div>
          </section>

          <section className="inputs-section">
            <h2>2. Inputs do Usuário</h2>
            <button className="btn-secondary add-filter-btn" onClick={adicionarFiltro}>
              + Adicionar Filtro
            </button>
            <div className="filtros-list">
              {camposFiltro.map(filtro => (
                <div key={filtro.id} className="filtro-item">
                  <input 
                    type="text" 
                    placeholder="Variável (ex: numero_pedido)" 
                    value={filtro.nome_campo}
                    onChange={(e) => atualizarFiltro(filtro.id, 'nome_campo', e.target.value)}
                  />
                  <input 
                    type="text" 
                    placeholder="Label (ex: Digite o Pedido)" 
                    value={filtro.label_exibicao}
                    onChange={(e) => atualizarFiltro(filtro.id, 'label_exibicao', e.target.value)}
                  />
                  <button className="btn-danger" onClick={() => removerFiltro(filtro.id)}>X</button>
                </div>
              ))}
            </div>
          </section>

          <section className="tools-section">
            <h2>✨ Inteligência Artificial</h2>
            <div className="ia-upload-box">
              <label className="btn-ia-upload">
                🪄 Gerar Modelo com IA (PDF/Foto)
                <input 
                  type="file" 
                  accept="image/*,application/pdf" 
                  hidden 
                  onChange={handleUploadImagemIA} 
                />
              </label>
              <p className="ia-hint">Faça upload de um PDF ou foto e a IA desenhará o layout automaticamente para você.</p>
            </div>
          </section>

          <section className="tools-section">
            <h2>Ferramentas (Arraste)</h2>
            <div className="tools-grid">
              <div 
                className="tool-item draggable" 
                draggable 
                onDragStart={(e) => handleDragStartTool(e, 'texto')}
              >
                T Texto
              </div>
              <div 
                className="tool-item draggable" 
                draggable 
                onDragStart={(e) => handleDragStartTool(e, 'codigo_barras')}
              >
                |||| Barcode
              </div>
              <div 
                className="tool-item draggable" 
                draggable 
                onDragStart={(e) => handleDragStartTool(e, 'qrcode')}
              >
                [] QR Code
              </div>
            </div>
          </section>
        </aside>

        {/* CENTRO: Canvas da Etiqueta */}
        <main className="editor-main-canvas">
          <h2>3. Canvas {tipoDocumento === 'relatorio_a4' ? 'do Relatório' : 'da Etiqueta'} ({configFisica.largura}cm x {configFisica.altura}cm)</h2>
          <div className="canvas-wrapper" style={tipoDocumento === 'relatorio_a4' ? { backgroundColor: '#e2e8f0', padding: '20px' } : {}}>
            <div 
              className="etiqueta-canvas"
              onDrop={handleDropCanvas}
              onDragOver={handleDragOverCanvas}
              style={{
                width: `${(configFisica.orientacao === 'retrato' ? configFisica.largura : configFisica.altura) * 37.8}px`,
                height: `${(configFisica.orientacao === 'retrato' ? configFisica.altura : configFisica.largura) * 37.8}px`,
              }}
            >
              {/* Margin overlay visual */}
              <div 
                className="margin-overlay" 
                style={{
                  position: 'absolute',
                  top: `${configFisica.margem * 37.8}px`,
                  left: `${configFisica.margem * 37.8}px`,
                  right: `${configFisica.margem * 37.8}px`,
                  bottom: `${configFisica.margem * 37.8}px`,
                  border: '1px dashed #ff4757',
                  pointerEvents: 'none',
                  opacity: 0.5
                }}
              ></div>
              {loadingIA && (
                <div className="ia-loading-overlay">
                  <div className="spinner"></div>
                  <p>A IA está analisando {tipoDocumento === 'relatorio_a4' ? 'seu relatório' : 'sua etiqueta'}...</p>
                </div>
              )}
              {elementosCanvas.map(el => (
                <div 
                  key={el.id}
                  className={`canvas-element ${elementoSelecionado === el.id ? 'selected' : ''}`}
                  style={{ 
                    left: `${el.posicao_x}px`, 
                    top: `${el.posicao_y}px`,
                    fontFamily: el.fonte,
                    fontSize: `${el.tamanho_fonte}px`
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    setElementoSelecionado(el.id);
                  }}
                >
                  {el.tipo_elemento === 'codigo_barras' ? '||||||||||||||||' : 
                   el.tipo_elemento === 'qrcode' ? '[ QR ]' : 
                   (el.fonte_dados === 'Estatico' ? el.valor_estatico : `[${el.fonte_dados}.${el.coluna_banco}]`)}
                </div>
              ))}
            </div>
          </div>
        </main>

        {/* COLUNA DIREITA: Painel de Propriedades */}
        <aside className="editor-sidebar-right">
          <h2>Propriedades</h2>
          {!elementoAtivo ? (
            <p className="empty-state">Selecione um elemento no canvas para editar.</p>
          ) : (
            <div className="properties-panel">
              <div className="form-group">
                <label>Tipo de Elemento</label>
                <input type="text" disabled value={elementoAtivo.tipo_elemento} />
              </div>
              
              <div className="form-group">
                <label>Fonte</label>
                <select 
                  value={elementoAtivo.fonte} 
                  onChange={(e) => atualizarElementoCanvas('fonte', e.target.value)}
                >
                  <option value="Arial">Arial</option>
                  <option value="Calibri">Calibri</option>
                  <option value="Times New Roman">Times New Roman</option>
                  <option value="Courier New">Courier New (Zebra default)</option>
                </select>
              </div>

              <div className="form-group">
                <label>Tamanho da Fonte (px)</label>
                <input 
                  type="number" 
                  value={elementoAtivo.tamanho_fonte}
                  onChange={(e) => atualizarElementoCanvas('tamanho_fonte', parseInt(e.target.value))}
                />
              </div>

              <div className="form-group">
                <label>Fonte de Dados</label>
                <select 
                  value={elementoAtivo.fonte_dados} 
                  onChange={(e) => atualizarElementoCanvas('fonte_dados', e.target.value)}
                >
                  <option value="Estatico">Texto Fixo / Estático</option>
                  {queries.map((q, idx) => (
                    <option key={q.id} value={q.nome_alias_tabela || `Query${idx+1}`}>
                      {q.nome_alias_tabela || `Query ${idx+1}`}
                    </option>
                  ))}
                </select>
              </div>

              {elementoAtivo.fonte_dados === 'Estatico' ? (
                <div className="form-group">
                  <label>Texto a exibir</label>
                  <input 
                    type="text" 
                    value={elementoAtivo.valor_estatico}
                    onChange={(e) => atualizarElementoCanvas('valor_estatico', e.target.value)}
                  />
                </div>
              ) : (
                <div className="form-group">
                  <label>Nome da Coluna na Query</label>
                  <input 
                    type="text" 
                    value={elementoAtivo.coluna_banco}
                    onChange={(e) => atualizarElementoCanvas('coluna_banco', e.target.value)}
                    placeholder="ex: nome_cliente"
                  />
                </div>
              )}

              <hr style={{ margin: '20px 0', border: 'none', borderTop: '1px solid #eee' }} />

              <div className="form-group">
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <input 
                    type="checkbox" 
                    checked={elementoAtivo.is_opcional}
                    onChange={(e) => atualizarElementoCanvas('is_opcional', e.target.checked)}
                  />
                  Campo Condicional (Opcional)
                </label>
              </div>

              {elementoAtivo.is_opcional && (
                <div className="form-group">
                  <label>Regra de Impressão (Ex: Query.peso &gt; 10)</label>
                  <input 
                    type="text" 
                    value={elementoAtivo.regra_condicional}
                    onChange={(e) => atualizarElementoCanvas('regra_condicional', e.target.value)}
                    placeholder="Se verdadeiro, imprime o campo"
                  />
                </div>
              )}

              <button 
                className="btn-danger mt-4"
                onClick={() => {
                  setElementosCanvas(elementosCanvas.filter(el => el.id !== elementoAtivo.id));
                  setElementoSelecionado(null);
                }}
              >
                Remover Elemento
              </button>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
