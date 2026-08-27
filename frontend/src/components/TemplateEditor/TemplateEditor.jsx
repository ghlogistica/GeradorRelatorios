import React, { useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
import './TemplateEditor.css';

export default function TemplateEditor() {
  // 1. Configuração Geral
  const [nomeTemplate, setNomeTemplate] = useState('');
  const [tipoDocumento, setTipoDocumento] = useState('etiqueta');
  const [queries, setQueries] = useState([{ id: Date.now(), conexao_id: '1', nome_alias_tabela: 'QueryPrincipal', query_sql: '' }]);
  const [configFisica, setConfigFisica] = useState({
    largura: 10,
    altura: 10,
    orientacao: 'paisagem',
    margem: 0,
    imagem_fundo: null
  });

  // 2. Inputs do Usuário
  const [camposFiltro, setCamposFiltro] = useState([]);

  // 3. Canvas Drag-and-Drop
  const [elementosCanvas, setElementosCanvas] = useState([]);
  const [elementoSelecionado, setElementoSelecionado] = useState(null);
  
  // Dragging states
  const [draggingId, setDraggingId] = useState(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  
  // Resizing states
  const [resizingId, setResizingId] = useState(null);
  const [resizeStartMouse, setResizeStartMouse] = useState({ x: 0, y: 0 });
  const [resizeStartSize, setResizeStartSize] = useState({ w: 0, h: 0 });

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
      largura: tipo === 'linha' ? 200 : (tipo === 'caixa' || tipo === 'imagem' ? 100 : null),
      altura: tipo === 'linha' ? 2 : (tipo === 'caixa' || tipo === 'imagem' ? 50 : null),
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

  const handleElementMouseDown = (e, id) => {
    e.stopPropagation();
    setElementoSelecionado(id);
    setDraggingId(id);
    const rect = e.currentTarget.getBoundingClientRect();
    setDragOffset({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    });
  };

  const handleCanvasMouseMove = (e) => {
    if (draggingId && !resizingId) {
      const canvasRect = e.currentTarget.getBoundingClientRect();
      const newX = e.clientX - canvasRect.left - dragOffset.x;
      const newY = e.clientY - canvasRect.top - dragOffset.y;
      setElementosCanvas(elementosCanvas.map(el => 
        el.id === draggingId ? { ...el, posicao_x: newX, posicao_y: newY } : el
      ));
    } else if (resizingId) {
      const dx = e.clientX - resizeStartMouse.x;
      const dy = e.clientY - resizeStartMouse.y;
      setElementosCanvas(elementosCanvas.map(el => 
        el.id === resizingId ? { 
          ...el, 
          largura: Math.max(10, resizeStartSize.w + dx), 
          altura: Math.max(10, resizeStartSize.h + dy) 
        } : el
      ));
    }
  };

  const handleCanvasMouseUp = () => {
    setDraggingId(null);
    setResizingId(null);
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
      // Cria imagem de fundo para o Canvas
      if (file.type === 'application/pdf') {
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        const page = await pdf.getPage(1);
        const viewport = page.getViewport({ scale: 2.0 });
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        await page.render({ canvasContext: context, viewport: viewport }).promise;
        const base64 = canvas.toDataURL('image/jpeg', 0.8);
        setConfigFisica(prev => ({ ...prev, imagem_fundo: base64 }));
      } else if (file.type.startsWith('image/')) {
        const base64 = await new Promise(resolve => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.readAsDataURL(file);
        });
        setConfigFisica(prev => ({ ...prev, imagem_fundo: base64 }));
      }

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
            {configFisica.imagem_fundo && (
              <div className="form-group">
                <button className="btn-secondary" style={{width: '100%'}} onClick={() => setConfigFisica({...configFisica, imagem_fundo: null})}>
                  🗑️ Remover Imagem de Fundo (PDF)
                </button>
              </div>
            )}

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
              <div className="tool-item draggable" draggable onDragStart={(e) => handleDragStartTool(e, 'texto')}>T Texto</div>
              <div className="tool-item draggable" draggable onDragStart={(e) => handleDragStartTool(e, 'caixa')}>⬜ Caixa/Borda</div>
              <div className="tool-item draggable" draggable onDragStart={(e) => handleDragStartTool(e, 'linha')}>➖ Linha</div>
              <div className="tool-item draggable" draggable onDragStart={(e) => handleDragStartTool(e, 'imagem')}>🖼️ Imagem</div>
              <div className="tool-item draggable" draggable onDragStart={(e) => handleDragStartTool(e, 'codigo_barras')}>|||| Barcode</div>
              <div className="tool-item draggable" draggable onDragStart={(e) => handleDragStartTool(e, 'qrcode')}>[] QR Code</div>
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
              onMouseMove={handleCanvasMouseMove}
              onMouseUp={handleCanvasMouseUp}
              onMouseLeave={handleCanvasMouseUp}
              style={{
                width: `${(configFisica.orientacao === 'retrato' ? configFisica.largura : configFisica.altura) * 37.8}px`,
                height: `${(configFisica.orientacao === 'retrato' ? configFisica.altura : configFisica.largura) * 37.8}px`,
                backgroundImage: configFisica.imagem_fundo ? `url(${configFisica.imagem_fundo})` : 'none',
                backgroundSize: '100% 100%',
                backgroundRepeat: 'no-repeat',
                position: 'relative'
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
                  onClick={(e) => {
                    e.stopPropagation();
                    setElementoSelecionado(el.id);
                  }}
                  onMouseDown={(e) => handleElementMouseDown(e, el.id)}
                  style={{ 
                    left: `${el.posicao_x}px`, 
                    top: `${el.posicao_y}px`,
                    width: el.largura ? `${el.largura}px` : 'auto',
                    height: el.altura ? `${el.altura}px` : 'auto',
                    fontFamily: el.fonte,
                    fontSize: `${el.tamanho_fonte}px`,
                    backgroundColor: el.tipo_elemento === 'texto' ? (el.cor_fundo || 'rgba(255, 255, 255, 0.95)') : 'transparent',
                    padding: el.tipo_elemento === 'texto' ? '2px' : '0px',
                    outline: elementoSelecionado === el.id ? '1px dashed #0d6efd' : 'none',
                    cursor: draggingId === el.id ? 'grabbing' : 'grab',
                    userSelect: 'none',
                    zIndex: elementoSelecionado === el.id ? 100 : 10
                  }}
                >
                  {el.tipo_elemento === 'codigo_barras' && '||||||||||||||||'}
                  {el.tipo_elemento === 'qrcode' && '[ QR ]'}
                  {el.tipo_elemento === 'texto' && (el.fonte_dados === 'Estatico' ? el.valor_estatico : `[${el.fonte_dados}.${el.coluna_banco}]`)}
                  {el.tipo_elemento === 'caixa' && <div style={{width:'100%', height:'100%', border: `${el.espessura_borda || 1}px solid ${el.cor_borda || '#000'}`, backgroundColor: el.cor_fundo || 'transparent'}}></div>}
                  {el.tipo_elemento === 'linha' && <div style={{width:'100%', height:'100%', backgroundColor: el.cor_borda || '#000'}}></div>}
                  {el.tipo_elemento === 'imagem' && (el.url_imagem ? <img src={el.url_imagem} style={{width:'100%', height:'100%', objectFit:'contain'}} alt="Elemento"/> : <div style={{width:'100%', height:'100%', display:'flex', alignItems:'center', justifyContent:'center', backgroundColor:'#eee', border:'1px dashed #ccc'}}>[ IMAGEM ]</div>)}

                  {/* Resize Handle */}
                  {elementoSelecionado === el.id && (
                    <div 
                      className="resize-handle"
                      onMouseDown={(e) => {
                        e.stopPropagation();
                        setResizingId(el.id);
                        setElementoSelecionado(el.id);
                        setResizeStartMouse({ x: e.clientX, y: e.clientY });
                        // Se nao tem largura definida ainda (auto), seta um padrao inicial
                        setResizeStartSize({ w: el.largura || 100, h: el.altura || 30 });
                      }}
                      style={{
                        position: 'absolute',
                        right: '-5px',
                        bottom: '-5px',
                        width: '10px',
                        height: '10px',
                        backgroundColor: '#09339e',
                        cursor: 'se-resize',
                        borderRadius: '50%'
                      }}
                    ></div>
                  )}
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

              <div style={{ display: 'flex', gap: '8px' }}>
                <div className="form-group" style={{ flex: 1 }}>
                  <label>Largura</label>
                  <input type="number" value={elementoAtivo.largura || ''} onChange={(e) => atualizarElementoCanvas('largura', parseInt(e.target.value) || null)} />
                </div>
                <div className="form-group" style={{ flex: 1 }}>
                  <label>Altura</label>
                  <input type="number" value={elementoAtivo.altura || ''} onChange={(e) => atualizarElementoCanvas('altura', parseInt(e.target.value) || null)} />
                </div>
              </div>

              {(elementoAtivo.tipo_elemento === 'caixa' || elementoAtivo.tipo_elemento === 'linha' || elementoAtivo.tipo_elemento === 'texto') && (
                <div style={{ display: 'flex', gap: '8px' }}>
                  <div className="form-group" style={{ flex: 1 }}>
                    <label>Fundo</label>
                    <input type="color" style={{padding:0, height:'30px', width:'100%'}} value={elementoAtivo.cor_fundo || '#ffffff'} onChange={(e) => atualizarElementoCanvas('cor_fundo', e.target.value)} />
                  </div>
                  <div className="form-group" style={{ flex: 1 }}>
                    <label>Cor Borda</label>
                    <input type="color" style={{padding:0, height:'30px', width:'100%'}} value={elementoAtivo.cor_borda || '#000000'} onChange={(e) => atualizarElementoCanvas('cor_borda', e.target.value)} />
                  </div>
                  {elementoAtivo.tipo_elemento === 'caixa' && (
                    <div className="form-group" style={{ flex: 1 }}>
                      <label>Espessura</label>
                      <input type="number" value={elementoAtivo.espessura_borda || 1} onChange={(e) => atualizarElementoCanvas('espessura_borda', parseInt(e.target.value) || 0)} />
                    </div>
                  )}
                </div>
              )}

              {elementoAtivo.tipo_elemento === 'imagem' && (
                <div className="form-group">
                  <label>Upload da Imagem</label>
                  <input type="file" accept="image/*" onChange={async (e) => {
                     const file = e.target.files[0];
                     if(file) {
                        const base64 = await new Promise(resolve => {
                          const reader = new FileReader();
                          reader.onload = () => resolve(reader.result);
                          reader.readAsDataURL(file);
                        });
                        atualizarElementoCanvas('url_imagem', base64);
                     }
                  }} />
                </div>
              )}

              <hr style={{ margin: '10px 0', border: 'none', borderTop: '1px solid #eee' }} />

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
