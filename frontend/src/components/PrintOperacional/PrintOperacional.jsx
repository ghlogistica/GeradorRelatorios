import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { jsPDF } from 'jspdf';
import './PrintOperacional.css';

export default function PrintOperacional() {
  const { userProfile } = useAuth();
  const [templates, setTemplates] = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [categoriaSelecionada, setCategoriaSelecionada] = useState('');
  const [templateSelecionado, setTemplateSelecionado] = useState('');
  const [camposDinamicos, setCamposDinamicos] = useState([]);
  const [formData, setFormData] = useState({});
  const [loading, setLoading] = useState(false);
  
  const [resultadoPreview, setResultadoPreview] = useState(null);
  
  // States para o Modal de Input Manual
  const [pendingDocument, setPendingDocument] = useState(null);
  const [manualInputs, setManualInputs] = useState({});

  // 1. Carrega os templates e categorias disponíveis ao abrir a tela
  useEffect(() => {
    const fetchData = async () => {
      try {
        const [resTemplates, resCategorias] = await Promise.all([
          fetch('/api/templates'),
          fetch('/api/categorias')
        ]);
        if (resTemplates.ok) setTemplates(await resTemplates.json());
        if (resCategorias.ok) {
          const allCats = await resCategorias.json();
          // Filtra categorias baseado no perfil do usuário
          if (userProfile?.isAdmin || userProfile?.categorias_modelos === 'todas') {
            setCategorias(allCats);
          } else {
            const allowedIds = userProfile?.categorias_modelos || [];
            setCategorias(allCats.filter(c => allowedIds.includes(c.id)));
          }
        }
      } catch (error) {
        console.error('Erro ao buscar dados:', error);
      }
    };
    if (userProfile) {
      fetchData();
    }
  }, [userProfile]);

  // Filtra templates para exibir apenas os que pertencem às categorias permitidas
  const templatesPermitidos = templates.filter(t => {
    if (userProfile?.isAdmin || userProfile?.categorias_modelos === 'todas') return true;
    const allowedIds = userProfile?.categorias_modelos || [];
    return allowedIds.includes(t.categoria_id);
  });

  const templatesFiltrados = categoriaSelecionada 
    ? templatesPermitidos.filter(t => t.categoria_id === categoriaSelecionada)
    : templatesPermitidos;

  // 2. Ao selecionar um template, busca os campos_input vinculados a ele
  useEffect(() => {
    if (!templateSelecionado) {
      setCamposDinamicos([]);
      setFormData({});
      return;
    }

    const t = templates.find(x => x.id === templateSelecionado);
    const parametros = t?.parametros_esperados || [];
    setCamposDinamicos(parametros);
    
    // Reseta o formulário
    const initialData = {};
    parametros.forEach(c => initialData[c.nome_campo] = '');
    setFormData(initialData);
    setResultadoPreview(null);
    setPendingDocument(null);
  }, [templateSelecionado, templates]);

  // Handle mudança nos inputs gerados dinamicamente
  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };
  
  const handleManualInputChange = (id, value) => {
    setManualInputs(prev => ({ ...prev, [id]: value }));
  };

  // 3. Submeter formulário para a API Real
  const handleImprimir = async (e) => {
    e.preventDefault();
    setLoading(true);
    setResultadoPreview(null);
    setPendingDocument(null);

    try {
      const response = await fetch('/api/gerar-documento', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          template_id: templateSelecionado,
          parametros: formData
        })
      });
      
      const json = await response.json();
      
      if (!response.ok || !json.success) {
        alert('Erro ao gerar documento: ' + (json.error || 'Desconhecido'));
        setLoading(false);
        return;
      }

      // Verifica se existem campos precisando de input manual
      const precisaManual = json.elementos_finais.some(el => el.precisa_input_manual);
      
      if (precisaManual) {
        // Inicializa o state dos inputs manuais
        const initialManual = {};
        json.elementos_finais.forEach(el => {
          if (el.precisa_input_manual) {
            initialManual[el.id] = '';
          }
        });
        setManualInputs(initialManual);
        setPendingDocument(json);
      } else {
        // Direto para preview
        processarFinal(json);
      }

    } catch (error) {
      console.error(error);
      alert('Erro ao comunicar com o servidor.');
    } finally {
      setLoading(false);
    }
  };
  
  const confirmarInputManual = (e) => {
    e.preventDefault();
    if (!pendingDocument) return;
    
    // Injeta os dados manuais nos elementos
    const jsonCopia = { ...pendingDocument };
    jsonCopia.elementos_finais = jsonCopia.elementos_finais.map(el => {
      if (el.precisa_input_manual) {
        return {
          ...el,
          valor_resolvido: manualInputs[el.id] || '',
          precisa_input_manual: false
        };
      }
      return el;
    });
    
    setPendingDocument(null);
    processarFinal(jsonCopia);
  };

  const processarFinal = (json) => {
    // Monta um objeto chave-valor amigável para o Preview Baseado nos textos do Canvas
    const preview = {};
    json.elementos_finais.forEach((el, index) => {
      if (el.tipo_elemento === 'texto' || el.tipo_elemento === 'codigo_barras') {
        const label = el.fonte_dados === 'Estatico' ? `Elemento ${index+1} (Estático)` : `${el.fonte_dados}.${el.coluna_banco}`;
        preview[label] = el.valor_resolvido;
      }
    });
    
    setResultadoPreview(preview);
    dispararImpressaoZebra(json);
  };

  // 4. Função que cuida do envio para a impressora (ex: via rede, ou Web Print)
  const dispararImpressaoZebra = (dados) => {
    console.log('Gerando PDF...', dados);
    try {
      const config = dados.documento.configuracoes;
      const cmToPx = 37.8;
      const isRetrato = config.orientacao === 'retrato';
      
      // O jsPDF com unidade 'px' usará os exatos pixels do Canvas
      const widthPx = (isRetrato ? config.largura : config.altura) * cmToPx;
      const heightPx = (isRetrato ? config.altura : config.largura) * cmToPx;

      const doc = new jsPDF({
        orientation: isRetrato ? 'p' : 'l',
        unit: 'px',
        format: [widthPx, heightPx],
        compress: true
      });

      // Imagem de Fundo (se houver)
      if (config.imagem_fundo) {
        doc.addImage(config.imagem_fundo, 'JPEG', 0, 0, widthPx, heightPx);
      }
      // Ordenar por z_index para garantir que os elementos de fundo fiquem atrás e os da frente por cima
      const elementosOrdenados = [...dados.elementos_finais].sort((a, b) => {
        const zA = a.z_index !== undefined ? a.z_index : 10;
        const zB = b.z_index !== undefined ? b.z_index : 10;
        return zA - zB;
      });

      elementosOrdenados.forEach(el => {
        const x = el.posicao_x;
        const y = el.posicao_y;

        if (el.tipo_elemento === 'texto') {
          // Mapeamento seguro de fontes do navegador para o jsPDF
          let fontePdf = 'helvetica'; // Fallback para Arial/Calibri
          if (el.fonte === 'Times New Roman' || el.fonte === 'Times') fontePdf = 'times';
          if (el.fonte === 'Courier New' || el.fonte === 'Courier') fontePdf = 'courier';
          
          const fontSizePx = el.tamanho_fonte || 14;
          doc.setFontSize(fontSizePx);
          
          // O Y no HTML é o topo da div. A div tem 2px de padding.
          // Além disso, o navegador aplica um 'line-height' (altura de linha) que cria um espaço
          // em branco (half-leading) acima da letra, empurrando-a visualmente para baixo.
          const padding = 2;
          const halfLeading = fontSizePx * 0.15; // Aprox 15% do tamanho da fonte é espaço em branco no topo
          
          doc.setTextColor(0, 0, 0); 
          
          let prefixWidth = 0;
          let drawX = x + padding;
          const drawY = y + padding + halfLeading;

          // Processa o Prefixo primeiro (com formatação independente)
          if (el.texto_prefixo) {
            doc.setFont(fontePdf, el.prefixo_negrito ? 'bold' : 'normal');
            doc.text(el.texto_prefixo, drawX, drawY, { baseline: 'top' });
            prefixWidth = doc.getTextWidth(el.texto_prefixo);
            drawX += prefixWidth;
          }
          
          // Volta a fonte para a formatação do valor dinâmico
          doc.setFont(fontePdf, el.negrito ? 'bold' : 'normal');
          
          let textToPrint = String(el.valor_resolvido || '');
          
          if (el.quebra_linha && el.largura) {
            // Divide o texto em múltiplas linhas respeitando a largura restante (largura total - prefixo)
            const maxTextWidth = Math.max(10, el.largura - (padding * 2) - prefixWidth);
            let textLines = doc.splitTextToSize(textToPrint, maxTextWidth);
            
            // Limita a quantidade de linhas baseada na altura máxima
            if (el.altura) {
              const lineHeight = doc.getLineHeight(); 
              const maxLines = Math.floor((el.altura - (padding * 2)) / lineHeight);
              if (maxLines > 0 && textLines.length > maxLines) {
                textLines = textLines.slice(0, maxLines);
              }
            }
            
            doc.text(textLines, drawX, drawY, { baseline: 'top' });
          } else {
            // Comportamento normal: uma única linha
            doc.text(textToPrint, drawX, drawY, { baseline: 'top' });
          }
        }
        else if (el.tipo_elemento === 'caixa') {
          doc.setDrawColor(el.cor_borda || '#000000');
          doc.setLineWidth(el.espessura_borda || 1);
          if (el.cor_fundo && el.cor_fundo !== 'transparent') {
            doc.setFillColor(el.cor_fundo);
            doc.rect(x, y, el.largura || 100, el.altura || 50, 'FD');
          } else {
            doc.rect(x, y, el.largura || 100, el.altura || 50, 'D');
          }
        }
        else if (el.tipo_elemento === 'linha') {
          doc.setFillColor(el.cor_borda || '#000000');
          // No HTML, a linha é uma div com width e height (background). Usamos rect preenchido para ficar idêntico.
          doc.rect(x, y, el.largura || 100, el.altura || 2, 'F');
        }
        else if (el.tipo_elemento === 'imagem') {
          if (el.url_imagem) {
            try {
              // Tenta extrair o formato da string base64 se possível (ex: data:image/png;base64,...)
              let format = 'JPEG';
              if (el.url_imagem.startsWith('data:image/png')) format = 'PNG';
              else if (el.url_imagem.startsWith('data:image/webp')) format = 'WEBP';
              
              doc.addImage(el.url_imagem, format, x, y, el.largura || 100, el.altura || 100);
            } catch (err) {
              console.error('Erro ao adicionar imagem ao PDF:', err);
            }
          }
        }
        else if (el.tipo_elemento === 'codigo_barras') {
          doc.setFont('Courier', 'bold');
          doc.setFontSize(12);
          doc.text(`[ BARCODE: ${el.valor_resolvido || ''} ]`, x, y + 12);
        }
        else if (el.tipo_elemento === 'qrcode') {
          doc.setFont('Courier', 'bold');
          doc.setFontSize(12);
          doc.text(`[ QR: ${el.valor_resolvido || ''} ]`, x, y + 12);
        }
      });

      // Abre o PDF nativo em uma nova aba/janela
      doc.output('dataurlnewwindow');
    } catch (error) {
      console.error('Erro ao gerar PDF em tela:', error);
      alert('Houve um erro ao gerar o PDF. Verifique o console.');
    }
  };

  return (
    <div className="operacional-container">
      <header className="operacional-header">
        <h1>Centro de Impressão</h1>
        <p>Selecione o modelo e bipe/digite os dados para imprimir.</p>
      </header>

      <div className="operacional-card">
        <form onSubmit={handleImprimir}>
          
          <div className="form-group-large" style={{ marginBottom: '20px' }}>
            <label>Filtrar por Categoria</label>
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginTop: '10px' }}>
              <button 
                type="button"
                className={`btn-secondary ${categoriaSelecionada === '' ? 'active-filter' : ''}`}
                style={{ backgroundColor: categoriaSelecionada === '' ? '#0f172a' : '', color: categoriaSelecionada === '' ? '#fff' : '' }}
                onClick={() => { setCategoriaSelecionada(''); setTemplateSelecionado(''); }}
              >
                Todas
              </button>
              {categorias.map(cat => (
                <button 
                  key={cat.id} 
                  type="button"
                  className={`btn-secondary ${categoriaSelecionada === cat.id ? 'active-filter' : ''}`}
                  style={{ backgroundColor: categoriaSelecionada === cat.id ? '#0f172a' : '', color: categoriaSelecionada === cat.id ? '#fff' : '' }}
                  onClick={() => { setCategoriaSelecionada(cat.id); setTemplateSelecionado(''); }}
                >
                  {cat.nome}
                </button>
              ))}
            </div>
          </div>

          <div className="form-group-large">
            <label>Modelo de Documento</label>
            <select 
              className="large-input"
              value={templateSelecionado} 
              onChange={(e) => setTemplateSelecionado(e.target.value)}
              required
            >
              <option value="">-- SELECIONE --</option>
              {templatesFiltrados.map(t => (
                <option key={t.id} value={t.id}>{t.nome}</option>
              ))}
            </select>
          </div>

          {/* 2. Formulário Dinâmico baseado no Banco de Dados */}
          <div className="dynamic-inputs-area">
            {camposDinamicos.map(campo => (
              <div className="form-group-large" key={campo.id}>
                <label>{campo.label_exibicao || campo.nome_campo || 'Campo Dinâmico'}</label>
                <input 
                  type={campo.tipo_dado === 'numero' ? 'number' : 'text'}
                  className="large-input"
                  name={campo.nome_campo}
                  value={formData[campo.nome_campo] || ''}
                  onChange={handleInputChange}
                  placeholder={`Digite ou bipe o ${campo.label_exibicao ? campo.label_exibicao.toLowerCase() : (campo.nome_campo || 'valor')}`}
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
              {loading ? 'Processando...' : 'GERAR DOCUMENTO / IMPRIMIR'}
            </button>
          )}
        </form>
      </div>
      
      {/* 3. Modal de Preenchimento Manual */}
      {pendingDocument && (
        <div className="modal-overlay" style={{
            position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', 
            backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', 
            justifyContent: 'center', zIndex: 1000
        }}>
          <div className="modal-content" style={{
              backgroundColor: '#fff', padding: '30px', borderRadius: '8px', 
              width: '90%', maxWidth: '500px', boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
              maxHeight: '90vh', overflowY: 'auto'
          }}>
            <h2 style={{marginTop: 0, color: '#0f172a'}}>Dados Faltantes</h2>
            <p style={{marginBottom: '20px', color: '#64748b'}}>O sistema não encontrou as informações abaixo. Por favor, preencha manualmente para prosseguir com a impressão.</p>
            
            <form onSubmit={confirmarInputManual}>
              {pendingDocument.elementos_finais
                .filter(el => el.precisa_input_manual)
                .sort((a, b) => {
                  // Ordenação visual de leitura: De cima para baixo, e da esquerda para direita
                  // Tolera até 15px de diferença no eixo Y para considerar que estão na mesma linha
                  if (Math.abs((a.posicao_y || 0) - (b.posicao_y || 0)) > 15) {
                    return (a.posicao_y || 0) - (b.posicao_y || 0);
                  }
                  return (a.posicao_x || 0) - (b.posicao_x || 0);
                })
                .map(el => (
                <div className="form-group" key={el.id} style={{ marginBottom: '15px' }}>
                  <label style={{display: 'block', marginBottom: '5px', fontWeight: 'bold'}}>{el.label_manual || 'Preenchimento Manual'}</label>
                  <input 
                    type="text" 
                    style={{width: '100%', padding: '10px', border: '1px solid #ccc', borderRadius: '4px'}}
                    value={manualInputs[el.id] || ''}
                    onChange={(e) => handleManualInputChange(el.id, e.target.value)}
                    required={!el.is_opcional}
                  />
                </div>
              ))}
              
              <div className="modal-actions" style={{ display: 'flex', gap: '10px', marginTop: '20px', justifyContent: 'flex-end' }}>
                <button type="button" className="btn-secondary" onClick={() => setPendingDocument(null)}>
                  Cancelar
                </button>
                <button type="submit" className="btn-primary" style={{backgroundColor: '#0d6efd', color: '#fff', border: 'none', padding: '10px 20px', borderRadius: '4px', cursor: 'pointer'}}>
                  Confirmar e Imprimir
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 4. Preview dos Dados Retornados */}
      {resultadoPreview && (
        <div className="preview-card" style={{marginTop: '30px', backgroundColor: '#fff', borderRadius: '8px', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.1)'}}>
          <div className="preview-header" style={{backgroundColor: '#f8fafc', padding: '15px 20px', borderBottom: '1px solid #e2e8f0'}}>
            <h3 style={{margin: 0, color: '#334155'}}>Textos a Serem Impressos (Preview)</h3>
          </div>
          <div className="preview-body" style={{padding: '20px'}}>
            {Object.entries(resultadoPreview).map(([key, val]) => (
              <div className="preview-row" key={key} style={{display: 'flex', padding: '10px 0', borderBottom: '1px solid #f1f5f9'}}>
                <strong style={{width: '40%', color: '#475569'}}>{key}:</strong>
                <span style={{color: '#0f172a'}}>{val}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
