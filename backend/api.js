const express = require('express');
const mssql = require('mssql');
const multer = require('multer');
const { db } = require('./firebase-config');
const zebraPrinterService = require('./ZebraPrinterService');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

/**
 * POST /api/gerar-documento (Antiga /imprimir-etiqueta)
 * Recebe o ID do template e os parâmetros preenchidos pelo usuário.
 */
router.post('/gerar-documento', async (req, res) => {
    const { template_id, parametros } = req.body;

    if (!template_id || !parametros) {
        return res.status(400).json({ error: 'template_id e parametros são obrigatórios.' });
    }

    try {
        // 0. Busca as configurações do Template (para devolver pro Front saber como renderizar)
        const templateDoc = await db.collection('templates').doc(template_id).get();
        if (!templateDoc.exists) {
            return res.status(404).json({ error: 'Template não encontrado.' });
        }
        const templateInfo = templateDoc.data();

        // 1. Busca todas as queries atreladas a este template no Firestore
        const queriesSnapshot = await db.collection('templates_queries')
            .where('template_id', '==', template_id)
            .get();

        const dataAgregada = {}; 

        // 2. Executar cada query contra o seu respectivo banco
        for (const doc of queriesSnapshot.docs) {
            const queryRow = doc.data();
            const { conexao_id, nome_alias_tabela, query_sql } = queryRow;

            // 2.1 Buscar dados da conexao no Firestore
            const conexaoDoc = await db.collection('conexoes_banco').doc(conexao_id).get();
            
            if (!conexaoDoc.exists) {
                console.error(`Conexão ${conexao_id} não encontrada!`);
                continue;
            }

            const configDb = conexaoDoc.data();

            try {
                if (configDb.tipo_banco === 'sqlserver') {
                    console.log(`[SQL Server] Conectando em ${configDb.host} para rodar ${nome_alias_tabela}`);
                    
                    const sqlConfig = {
                        user: configDb.usuario,
                        password: configDb.senha,
                        database: configDb.database,
                        server: configDb.host,
                        pool: { max: 10, min: 0, idleTimeoutMillis: 30000 },
                        options: { encrypt: false, trustServerCertificate: true }
                    };

                    const pool = await mssql.connect(sqlConfig);
                    const request = pool.request();

                    // Prepara a query SQL substituindo os padrões pelo padrão nativo do SQL Server (@variavel)
                    // e injeta os valores de forma segura prevenindo SQL Injection
                    let querySqlTratada = query_sql;
                    for (const [key, value] of Object.entries(parametros)) {
                        // Substitui :variavel por @variavel no texto da query
                        const regexParametro = new RegExp(`:${key}\\b`, 'g');
                        querySqlTratada = querySqlTratada.replace(regexParametro, `@${key}`);
                        
                        // Injeta a variável na requisição do MSSQL
                        request.input(key, value); 
                    }

                    const rs = await request.query(querySqlTratada);
                    dataAgregada[nome_alias_tabela] = rs.recordset;
                    
                    await pool.close();
                } else {
                     console.log(`Banco tipo ${configDb.tipo_banco} não suportado ainda.`);
                }
            } catch (dbErr) {
                console.error(`Erro ao rodar query ${nome_alias_tabela}:`, dbErr);
            }
        }

        // 3. Buscar os Elementos de Layout no Firestore
        const elementosSnapshot = await db.collection('elementos_layout')
            .where('template_id', '==', template_id)
            .get();
        
        const elementosLayoutRows = elementosSnapshot.docs.map(d => ({ id: d.id, ...d.data() }));

        // 4. Avaliar Condicionais
        const elementosFiltrados = elementosLayoutRows.filter(el => {
            if (!el.is_opcional || !el.regra_condicional) return true; 
            
            try {
                console.log(`[Condicional] Avaliando regra: ${el.regra_condicional}`);
                return true; 
            } catch(e) {
                return false; 
            }
        });

        // 5. Mapear Dados
        const elementosMapeados = elementosFiltrados.map(el => {
            if (el.fonte_dados === 'Estatico') {
                el.valor_resolvido = el.valor_estatico;
            } else {
                const dadosFonte = dataAgregada[el.fonte_dados] || [];
                const linhaDado = dadosFonte[0] || {};
                el.valor_resolvido = linhaDado[el.coluna_banco] || '';
            }
            return el;
        });

        // Retorna não só os dados, mas as configurações de layout do documento para o Frontend
        return res.status(200).json({
            success: true,
            documento: {
                tipo: templateInfo.tipo_documento || 'etiqueta',
                configuracoes: templateInfo.configuracoes_impressao || {}
            },
            data: dataAgregada,
            elementos_finais: elementosMapeados
        });

    } catch (error) {
        console.error('Erro ao executar query do template:', error);
        return res.status(500).json({ error: 'Erro interno ao processar o documento.' });
    }
});

// Alias mantido por compatibilidade temporária
router.post('/imprimir-etiqueta', (req, res) => res.redirect(307, '/api/gerar-documento'));

const { GoogleGenAI } = require('@google/genai');

/**
 * POST /api/parse-label-image
 * Recebe uma imagem ou PDF, envia para o Gemini 2.5 Pro para análise de layout
 * e retorna os elementos visuais mapeados para o Canvas.
 */
router.post('/parse-label-image', upload.single('imagem'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, error: 'Nenhum arquivo enviado.' });
        }

        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            return res.status(500).json({ success: false, error: 'Chave de API do Gemini não configurada no servidor (GEMINI_API_KEY).' });
        }

        const ai = new GoogleGenAI({ apiKey: apiKey });

        const mimeType = req.file.mimetype; // ex: application/pdf ou image/jpeg
        const fileBase64 = req.file.buffer.toString('base64');

        const prompt = `Você é um engenheiro de software especialista em extração de layout para sistemas geradores de relatórios e etiquetas.
O usuário fez o upload de um arquivo (imagem ou PDF).
Sua tarefa é analisar o visual do arquivo e mapear onde cada bloco de texto ou elemento visual (como código de barras) está localizado.

Importante: O "Canvas" do nosso sistema considera:
- A posição X e Y é dada em pixels (assuma que 1 cm no papel real = ~38 pixels na tela).
- Assuma que o documento tem aproximadamente 21x29.7cm (A4) ou é uma etiqueta menor. Baseie-se no tamanho relativo para calcular X e Y absolutos.

Sua resposta DEVE ser EXCLUSIVAMENTE um objeto JSON válido, contendo um array de objetos chamado "elementos", seguindo EXATAMENTE este schema para cada elemento:
{
  "id": número inteiro único aleatório,
  "tipo_elemento": "texto" (para texto) ou "codigo_barras" (se identificar código de barras),
  "posicao_x": inteiro (pixel estimado na tela),
  "posicao_y": inteiro (pixel estimado na tela),
  "fonte": "Arial",
  "tamanho_fonte": inteiro (tamanho estimado em pixels, ex: 14 para normal, 24 para título),
  "fonte_dados": "Estatico",
  "coluna_banco": "",
  "valor_estatico": "O texto que você leu",
  "is_opcional": false,
  "regra_condicional": ""
}

Tente diferenciar textos fixos (como cabeçalhos de tabela: "Placa Cavalo:") de dados preenchidos ("IXS9B03").
Se for um dado que varia por relatório (ex: o nome de uma pessoa, uma placa, uma data), você ainda o mapeará como "Estatico", mas no "valor_estatico" coloque "[Campo Dinâmico: Valor Lido]".
Tente mapear os principais blocos do documento.
Retorne APENAS o JSON, sem markdown ou formatação de código (\`\`\`).`;

        const response = await ai.models.generateContent({
            model: 'gemini-2.5-pro',
            contents: [
                prompt,
                {
                    inlineData: {
                        data: fileBase64,
                        mimeType: mimeType
                    }
                }
            ],
            config: {
                responseMimeType: 'application/json'
            }
        });

        const jsonString = response.text;
        const data = JSON.parse(jsonString);

        return res.status(200).json({
            success: true,
            elementos: data.elementos
        });
    } catch (error) {
        console.error('Erro na IA:', error);
        return res.status(500).json({ success: false, error: error.message || 'Erro ao processar documento com a IA.' });
    }
});

/**
 * GET /api/templates
 * Retorna todos os templates salvos no Firestore
 */
router.get('/templates', async (req, res) => {
    try {
        const snapshot = await db.collection('templates').get();
        const templates = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));
        return res.status(200).json(templates);
    } catch (error) {
        console.error('Erro ao buscar templates:', error);
        return res.status(500).json({ error: 'Erro interno ao buscar templates no Firebase.' });
    }
});

/**
 * POST /api/templates
 * Recebe o payload do frontend para salvar o modelo no Firestore.
 */
router.post('/templates', async (req, res) => {
    try {
        const payload = req.body;
        console.log(`[API] Solicitando salvamento do template: ${payload.nomeTemplate}`);
        
        // Estrutura expandida suportando A4 e parâmetros dinâmicos
        const novoTemplate = {
            nome: payload.nomeTemplate,
            data_criacao: new Date().toISOString(),
            tipo_documento: payload.tipo_documento || 'etiqueta',
            configuracoes_impressao: payload.configuracoes_impressao || {},
            parametros_esperados: payload.parametros_esperados || []
        };
        
        const docRef = await db.collection('templates').add(novoTemplate);
        const templateCriado = { id: docRef.id, ...novoTemplate };
        
        console.log('[API] Modelo salvo com sucesso no Firestore!');
        return res.status(200).json({ success: true, message: 'Modelo salvo com sucesso.', template: templateCriado });
    } catch (error) {
        console.error('Erro ao salvar template:', error);
        return res.status(500).json({ error: 'Erro interno ao salvar template no Firebase.' });
    }
});

module.exports = router;
