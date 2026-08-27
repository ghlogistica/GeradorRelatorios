const express = require('express');
const mssql = require('mssql');
const crypto = require('crypto');

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'chavede32caracterespadrao1234567'; // 32 chars
const IV_LENGTH = 16;

function encrypt(text) {
    if (!text) return text;
    let iv = crypto.randomBytes(IV_LENGTH);
    let cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY), iv);
    let encrypted = cipher.update(text);
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    return iv.toString('hex') + ':' + encrypted.toString('hex');
}

function decrypt(text) {
    if (!text || !text.includes(':')) return text;
    try {
        let textParts = text.split(':');
        let iv = Buffer.from(textParts.shift(), 'hex');
        let encryptedText = Buffer.from(textParts.join(':'), 'hex');
        let decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY), iv);
        let decrypted = decipher.update(encryptedText);
        decrypted = Buffer.concat([decrypted, decipher.final()]);
        return decrypted.toString();
    } catch (e) {
        console.error('Error decrypting password:', e);
        return text;
    }
}
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
                        password: decrypt(configDb.senha),
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

        const prompt = `Você é um especialista em visão computacional e extração de layout.
O usuário enviou um documento (imagem ou PDF). Extraia a estrutura visual dele.

INSTRUÇÕES CRÍTICAS SOBRE COORDENADAS:
Você deve usar o sistema de coordenadas normalizadas padrão (0 a 1000), onde:
[0, 0] é o canto superior esquerdo.
[1000, 1000] é o canto inferior direito.

Sua resposta DEVE ser EXCLUSIVAMENTE um objeto JSON válido, contendo um array "elementos".
Schema de cada elemento:
{
  "id": número inteiro único aleatório,
  "tipo_elemento": "texto", "codigo_barras", "caixa" (tabelas/bordas/fundos coloridos), "linha" (divisórias), ou "imagem" (logomarcas),
  "x_normalizado": inteiro de 0 a 1000 (posição horizontal do início),
  "y_normalizado": inteiro de 0 a 1000 (posição vertical do topo/meio),
  "largura_normalizada": inteiro de 0 a 1000 (obrigatório para caixas, linhas e imagens; opcional para texto),
  "altura_normalizada": inteiro de 0 a 1000 (obrigatório para caixas, imagens e linhas verticais),
  "cor_fundo": "string hexadecimal (ex: #f2f2f2 para caixas cinzas, ou null se transparente)",
  "cor_borda": "string hexadecimal (ex: #000000 para bordas escuras, ou null)",
  "espessura_borda": inteiro (ex: 1 para borda fina, 2 para grossa, 0 sem borda),
  "fonte": "Arial",
  "tamanho_fonte_normalizado": inteiro (proporção do tamanho da fonte de 0 a 1000. Ex: 10 para normal),
  "fonte_dados": "Estatico",
  "coluna_banco": "",
  "valor_estatico": "Texto lido do documento",
  "is_opcional": false,
  "regra_condicional": ""
}

Regras:
1. Agrupe palavras da mesma frase em um único elemento. Não separe cada palavra.
2. Identifique tabelas e bordas criando elementos do tipo "caixa" ou "linha". Esforce-se para identificar a cor hexadecimal aproximada do fundo (ex: cabeçalhos cinzas) e a espessura da linha.
3. Identifique logomarcas ou brasões criando elementos do tipo "imagem". No "valor_estatico", coloque uma descrição curta (ex: "Logo GH").
4. Para campos preenchidos, coloque "valor_estatico" como "[Campo Dinâmico: valor que você leu]".
5. Retorne APENAS JSON puro. Sem formatação markdown (\`\`\`json).`;

        const response = await ai.models.generateContent({
            model: 'gemini-3.1-pro-preview',
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

        // Converte coordenadas normalizadas (0-1000) para pixels do Canvas (ex: A4 = 794x1123)
        const LARGURA_A4_PX = 794;
        const ALTURA_A4_PX = 1123;
        
        const elementosTratados = (data.elementos || []).map(el => {
            const pxX = Math.round(((el.x_normalizado || 0) / 1000) * LARGURA_A4_PX);
            const pxY = Math.round(((el.y_normalizado || 0) / 1000) * ALTURA_A4_PX);
            const pxLargura = el.largura_normalizada ? Math.round((el.largura_normalizada / 1000) * LARGURA_A4_PX) : null;
            const pxAltura = el.altura_normalizada ? Math.round((el.altura_normalizada / 1000) * ALTURA_A4_PX) : null;
            const tFonte = Math.max(10, Math.round(((el.tamanho_fonte_normalizado || 15) / 1000) * ALTURA_A4_PX));
            
            return {
                ...el,
                posicao_x: pxX,
                posicao_y: pxY,
                largura: pxLargura,
                altura: pxAltura,
                tamanho_fonte: tFonte > 30 ? 30 : tFonte,
                cor_fundo: el.cor_fundo || null,
                cor_borda: el.cor_borda || null,
                espessura_borda: el.espessura_borda !== undefined ? el.espessura_borda : null
            };
        });

        return res.status(200).json({
            success: true,
            elementos: elementosTratados
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

// --- ROTAS PARA CONEXÕES DE BANCO DE DADOS (ERPs) ---

// Listar conexões (GET) - Mascarando a senha
router.get('/conexoes_banco', async (req, res) => {
    try {
        const snapshot = await db.collection('conexoes_banco').get();
        const conexoes = snapshot.docs.map(doc => {
            const data = doc.data();
            return {
                id: doc.id,
                ...data,
                senha: data.senha ? '********' : '' // Máscara de segurança
            };
        });
        res.json(conexoes);
    } catch (error) {
        console.error('Erro ao buscar conexões:', error);
        res.status(500).json({ error: 'Erro interno' });
    }
});

// Criar/Atualizar conexão (POST) - Criptografando a senha
router.post('/conexoes_banco', async (req, res) => {
    try {
        const { id, nome_conexao, tipo_banco, host, porta, usuario, senha, database } = req.body;
        
        const payload = {
            nome_conexao,
            tipo_banco,
            host,
            porta: Number(porta),
            usuario,
            database
        };

        if (id) {
            // Se for atualização e a senha NÃO for '********', nós a atualizamos (criptografando).
            if (senha && senha !== '********') {
                payload.senha = encrypt(senha);
            }
            await db.collection('conexoes_banco').doc(id).update(payload);
            res.json({ success: true, id });
        } else {
            // Nova conexão
            payload.senha = encrypt(senha);
            const ref = await db.collection('conexoes_banco').add(payload);
            res.json({ success: true, id: ref.id });
        }
    } catch (error) {
        console.error('Erro ao salvar conexão:', error);
        res.status(500).json({ error: 'Erro interno' });
    }
});

// Deletar conexão (DELETE)
router.delete('/conexoes_banco/:id', async (req, res) => {
    try {
        await db.collection('conexoes_banco').doc(req.params.id).delete();
        res.json({ success: true });
    } catch (error) {
        console.error('Erro ao excluir conexão:', error);
        res.status(500).json({ error: 'Erro interno' });
    }
});

module.exports = router;
