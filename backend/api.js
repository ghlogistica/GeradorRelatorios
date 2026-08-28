const express = require('express');
const mssql = require('mssql');
const crypto = require('crypto');
const nodemailer = require('nodemailer');

const RAW_ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'chavede32caracterespadrao1234567'; // 32 chars
let ENCRYPTION_KEY_BUFFER;
if (Buffer.from(RAW_ENCRYPTION_KEY).length === 32) {
    ENCRYPTION_KEY_BUFFER = Buffer.from(RAW_ENCRYPTION_KEY);
} else {
    ENCRYPTION_KEY_BUFFER = crypto.createHash('sha256').update(String(RAW_ENCRYPTION_KEY)).digest();
}
const IV_LENGTH = 16;

function encrypt(text) {
    if (!text) return text;
    let iv = crypto.randomBytes(IV_LENGTH);
    let cipher = crypto.createCipheriv('aes-256-cbc', ENCRYPTION_KEY_BUFFER, iv);
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
        let decipher = crypto.createDecipheriv('aes-256-cbc', ENCRYPTION_KEY_BUFFER, iv);
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
            if (!conexao_id) {
                console.warn(`[AVISO] Query '${nome_alias_tabela}' não possui conexao_id atrelado. Ignorando.`);
                continue;
            }

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
                } else if (configDb.tipo_banco === 'api_rest') {
                    console.log(`[API REST] Conectando em ${configDb.host} para buscar ${nome_alias_tabela}`);
                    
                    let endpointTratado = query_sql;
                    for (const [key, value] of Object.entries(parametros)) {
                        const regexParametro = new RegExp(`:${key}\\b`, 'g');
                        endpointTratado = endpointTratado.replace(regexParametro, encodeURIComponent(value));
                    }
                    
                    const baseUrl = configDb.host.replace(/\/$/, '');
                    const path = endpointTratado.startsWith('/') ? endpointTratado : `/${endpointTratado}`;
                    const urlFinal = `${baseUrl}${path}`;
                    
                    console.log(`[API REST] GET ${urlFinal}`);
                    
                    const headers = { 'Content-Type': 'application/json' };
                    
                    if (configDb.usuario && configDb.senha) {
                        headers['Authorization'] = 'Basic ' + Buffer.from(`${configDb.usuario}:${decrypt(configDb.senha)}`).toString('base64');
                    } else if (configDb.senha && !configDb.usuario) {
                        headers['Authorization'] = `Bearer ${decrypt(configDb.senha)}`;
                    }
                    
                    const response = await fetch(urlFinal, { method: 'GET', headers });
                    if (!response.ok) {
                        throw new Error(`Erro na API REST (${response.status} ${response.statusText})`);
                    }
                    
                    let jsonResult = await response.json();
                    
                    // Padroniza o retorno para um array (para funcionar igual ao recordset do SQL)
                    if (!Array.isArray(jsonResult)) {
                        // Se o json vier dentro de uma chave "data" ou "results", tenta pegar
                        if (jsonResult.data && Array.isArray(jsonResult.data)) {
                            jsonResult = jsonResult.data;
                        } else if (jsonResult.results && Array.isArray(jsonResult.results)) {
                            jsonResult = jsonResult.results;
                        } else {
                            jsonResult = [jsonResult];
                        }
                    }
                    
                    dataAgregada[nome_alias_tabela] = jsonResult;
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
                
                if ((el.valor_resolvido === '' || el.valor_resolvido === null || el.valor_resolvido === undefined) && el.solicitar_manual_se_vazio) {
                    el.precisa_input_manual = true;
                }
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
        return res.status(500).json({ error: 'Erro interno ao processar o documento: ' + error.message, stack: error.stack });
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
 * Recebe o payload do frontend para salvar ou atualizar o modelo no Firestore.
 */
router.post('/templates', async (req, res) => {
    try {
        const payload = req.body;
        console.log(`[API] Solicitando salvamento do template: ${payload.nomeTemplate}`);
        
        // Estrutura expandida suportando A4 e parâmetros dinâmicos
        const templateData = {
            nome: payload.nomeTemplate,
            data_atualizacao: new Date().toISOString(),
            tipo_documento: payload.tipo_documento || 'etiqueta',
            configuracoes_impressao: payload.configuracoes_impressao || {},
            parametros_esperados: payload.parametros_esperados || [],
            categoria_id: payload.categoria_id || null
        };
        
        let templateId = payload.id;

        if (templateId) {
            await db.collection('templates').doc(templateId).update(templateData);
            
            // Delete old queries and elements
            const oldQueries = await db.collection('templates_queries').where('template_id', '==', templateId).get();
            const batch = db.batch();
            oldQueries.docs.forEach(doc => batch.delete(doc.ref));
            
            const oldElements = await db.collection('elementos_layout').where('template_id', '==', templateId).get();
            oldElements.docs.forEach(doc => batch.delete(doc.ref));
            
            await batch.commit();
        } else {
            templateData.data_criacao = new Date().toISOString();
            const docRef = await db.collection('templates').add(templateData);
            templateId = docRef.id;
        }

        // Save queries
        if (payload.queries && Array.isArray(payload.queries)) {
            const batchQueries = db.batch();
            for (const q of payload.queries) {
                const queryRef = db.collection('templates_queries').doc();
                batchQueries.set(queryRef, {
                    ...q,
                    template_id: templateId
                });
            }
            await batchQueries.commit();
        }

        // Save elements
        if (payload.elementosCanvas && Array.isArray(payload.elementosCanvas)) {
            const batchElements = db.batch();
            for (const el of payload.elementosCanvas) {
                const elRef = db.collection('elementos_layout').doc();
                batchElements.set(elRef, {
                    ...el,
                    template_id: templateId
                });
            }
            await batchElements.commit();
        }
        
        console.log('[API] Modelo salvo com sucesso no Firestore!');
        return res.status(200).json({ success: true, message: 'Modelo salvo com sucesso.', templateId });
    } catch (error) {
        console.error('Erro ao salvar template:', error);
        return res.status(500).json({ error: 'Erro interno ao salvar template no Firebase.' });
    }
});

/**
 * GET /api/templates/:id
 * Retorna um template específico com suas queries e elementos
 */
router.get('/templates/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const templateDoc = await db.collection('templates').doc(id).get();
        
        if (!templateDoc.exists) {
            return res.status(404).json({ error: 'Template não encontrado.' });
        }
        
        const template = { id: templateDoc.id, ...templateDoc.data() };
        
        const queriesSnapshot = await db.collection('templates_queries').where('template_id', '==', id).get();
        template.queries = queriesSnapshot.docs.map(doc => doc.data());
        
        const elementosSnapshot = await db.collection('elementos_layout').where('template_id', '==', id).get();
        template.elementosCanvas = elementosSnapshot.docs.map(doc => doc.data());
        
        return res.status(200).json(template);
    } catch (error) {
        console.error('Erro ao buscar template:', error);
        return res.status(500).json({ error: 'Erro interno ao buscar template.' });
    }
});

/**
 * DELETE /api/templates/:id
 * Exclui um template e todos os seus elementos e queries associados.
 */
router.delete('/templates/:id', async (req, res) => {
    try {
        const { id } = req.params;
        
        await db.collection('templates').doc(id).delete();
        
        const batch = db.batch();
        
        const queries = await db.collection('templates_queries').where('template_id', '==', id).get();
        queries.docs.forEach(doc => batch.delete(doc.ref));
        
        const elementos = await db.collection('elementos_layout').where('template_id', '==', id).get();
        elementos.docs.forEach(doc => batch.delete(doc.ref));
        
        await batch.commit();
        
        return res.status(200).json({ success: true, message: 'Template excluído com sucesso.' });
    } catch (error) {
        console.error('Erro ao excluir template:', error);
        return res.status(500).json({ error: 'Erro interno ao excluir template no Firebase.' });
    }
});

// --- ROTAS PARA CATEGORIAS ---

// Listar Categorias (GET)
router.get('/categorias', async (req, res) => {
    try {
        const snapshot = await db.collection('categorias').get();
        const categorias = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));
        res.status(200).json(categorias);
    } catch (error) {
        console.error('Erro ao buscar categorias:', error);
        res.status(500).json({ error: 'Erro interno ao buscar categorias.' });
    }
});

// Criar/Atualizar Categoria (POST)
router.post('/categorias', async (req, res) => {
    try {
        const { id, nome, descricao } = req.body;
        const payload = { nome, descricao, data_atualizacao: new Date().toISOString() };

        if (id) {
            await db.collection('categorias').doc(id).update(payload);
            res.json({ success: true, id });
        } else {
            payload.data_criacao = new Date().toISOString();
            const ref = await db.collection('categorias').add(payload);
            res.json({ success: true, id: ref.id });
        }
    } catch (error) {
        console.error('Erro ao salvar categoria:', error);
        res.status(500).json({ error: 'Erro interno ao salvar categoria.' });
    }
});

// Deletar Categoria (DELETE)
router.delete('/categorias/:id', async (req, res) => {
    try {
        await db.collection('categorias').doc(req.params.id).delete();
        res.json({ success: true });
    } catch (error) {
        console.error('Erro ao excluir categoria:', error);
        res.status(500).json({ error: 'Erro interno ao excluir categoria.' });
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
        res.status(500).json({ error: 'Erro interno: ' + error.message, stack: error.stack });
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
            porta: porta ? Number(porta) : null,
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
        res.status(500).json({ error: 'Erro interno ao salvar: ' + error.message, stack: error.stack, type: error.name });
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

// --- ROTAS PARA PERFIS DE ACESSO ---

// Listar Perfis (GET)
router.get('/perfis', async (req, res) => {
    try {
        const snapshot = await db.collection('perfis').get();
        const perfis = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));
        res.status(200).json(perfis);
    } catch (error) {
        console.error('Erro ao buscar perfis:', error);
        res.status(500).json({ error: 'Erro interno ao buscar perfis.' });
    }
});

// Criar/Atualizar Perfil (POST)
router.post('/perfis', async (req, res) => {
    try {
        const { id, nome, telas_acesso, categorias_modelos, isAdmin } = req.body;
        const payload = { 
            nome, 
            telas_acesso: telas_acesso || [], 
            categorias_modelos: categorias_modelos || [],
            isAdmin: isAdmin || false,
            data_atualizacao: new Date().toISOString() 
        };

        if (id) {
            await db.collection('perfis').doc(id).update(payload);
            res.json({ success: true, id });
        } else {
            payload.data_criacao = new Date().toISOString();
            const ref = await db.collection('perfis').add(payload);
            res.json({ success: true, id: ref.id });
        }
    } catch (error) {
        console.error('Erro ao salvar perfil:', error);
        res.status(500).json({ error: 'Erro interno ao salvar perfil.' });
    }
});

// Deletar Perfil (DELETE)
router.delete('/perfis/:id', async (req, res) => {
    try {
        await db.collection('perfis').doc(req.params.id).delete();
        res.json({ success: true });
    } catch (error) {
        console.error('Erro ao excluir perfil:', error);
        res.status(500).json({ error: 'Erro interno ao excluir perfil.' });
    }
});


// --- ROTAS PARA USUÁRIOS E CONVITES ---

// Listar Usuários (GET)
router.get('/usuarios', async (req, res) => {
    try {
        const snapshot = await db.collection('usuarios').get();
        const usuarios = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));
        res.status(200).json(usuarios);
    } catch (error) {
        console.error('Erro ao buscar usuarios:', error);
        res.status(500).json({ error: 'Erro interno ao buscar usuarios.' });
    }
});

// Convidar Novo Usuário (POST)
router.post('/usuarios/convidar', async (req, res) => {
    try {
        const { email, perfil_id } = req.body;
        
        if (!email || !perfil_id) {
            return res.status(400).json({ error: 'Email e perfil_id são obrigatórios.' });
        }

        // Verifica se o usuário já existe
        const userExists = await db.collection('usuarios').where('email', '==', email).get();
        if (!userExists.empty) {
            return res.status(400).json({ error: 'Este e-mail já foi convidado/cadastrado.' });
        }

        const payload = { 
            email, 
            perfil_id,
            status: 'pendente',
            data_convite: new Date().toISOString() 
        };

        const ref = await db.collection('usuarios').add(payload);

        // Envio do e-mail de convite
        // Se as variáveis SMTP estiverem configuradas, envia o e-mail real.
        if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
            const transporter = nodemailer.createTransport({
                host: process.env.SMTP_HOST,
                port: process.env.SMTP_PORT || 587,
                secure: process.env.SMTP_SECURE === 'true',
                auth: {
                    user: process.env.SMTP_USER,
                    pass: process.env.SMTP_PASS
                }
            });

            const linkAcesso = process.env.FRONTEND_URL || 'https://geradorrelatorios-git-1086248605321.us-east1.run.app';
            
            await transporter.sendMail({
                from: `"GH Relatórios" <${process.env.SMTP_USER}>`,
                to: email,
                subject: "Convite para acessar o GH Relatórios",
                html: `
                    <h2>Você foi convidado!</h2>
                    <p>Você recebeu um convite para acessar o sistema GH Relatórios.</p>
                    <p>Clique no link abaixo para acessar e fazer o login com esta conta do Google:</p>
                    <a href="${linkAcesso}" style="display:inline-block; padding:10px 20px; background:#0d6efd; color:#fff; text-decoration:none; border-radius:5px;">Acessar Sistema</a>
                `
            });
            console.log(`Convite enviado para ${email}`);
        } else {
            console.log(`[AVISO] Variáveis SMTP não configuradas. O e-mail de convite para ${email} NÃO foi enviado de fato.`);
        }

        res.json({ success: true, id: ref.id, message: 'Usuário convidado com sucesso.' });
    } catch (error) {
        console.error('Erro ao convidar usuario:', error);
        res.status(500).json({ error: 'Erro interno ao convidar usuário.' });
    }
});

// Atualizar Usuário (ex: mudar perfil) (PUT)
router.put('/usuarios/:id', async (req, res) => {
    try {
        const { perfil_id } = req.body;
        await db.collection('usuarios').doc(req.params.id).update({
            perfil_id,
            data_atualizacao: new Date().toISOString()
        });
        res.json({ success: true });
    } catch (error) {
        console.error('Erro ao atualizar usuario:', error);
        res.status(500).json({ error: 'Erro interno ao atualizar usuário.' });
    }
});

// Deletar Usuário (DELETE)
router.delete('/usuarios/:id', async (req, res) => {
    try {
        await db.collection('usuarios').doc(req.params.id).delete();
        res.json({ success: true });
    } catch (error) {
        console.error('Erro ao excluir usuario:', error);
        res.status(500).json({ error: 'Erro interno ao excluir usuario.' });
    }
});

// --- ROTA DE AUTENTICAÇÃO E PERFIL (ME) ---
// Retorna os dados do usuário e do perfil baseado no e-mail logado no Firebase
router.get('/me', async (req, res) => {
    try {
        const email = req.query.email;
        if (!email) {
            return res.status(400).json({ error: 'E-mail não fornecido.' });
        }

        const userSnap = await db.collection('usuarios').where('email', '==', email).get();
        if (userSnap.empty) {
            return res.status(403).json({ error: 'Usuário não cadastrado/convidado.', code: 'NOT_INVITED' });
        }

        const usuario = { id: userSnap.docs[0].id, ...userSnap.docs[0].data() };

        // Se estiver pendente, marcamos como ativo (fez o primeiro login)
        if (usuario.status === 'pendente') {
            await db.collection('usuarios').doc(usuario.id).update({ status: 'ativo' });
            usuario.status = 'ativo';
        }

        // Buscar o perfil do usuário
        let perfil = null;
        if (usuario.perfil_id) {
            const perfilDoc = await db.collection('perfis').doc(usuario.perfil_id).get();
            if (perfilDoc.exists) {
                perfil = { id: perfilDoc.id, ...perfilDoc.data() };
            }
        }

        if (!perfil) {
            return res.status(403).json({ error: 'Perfil não encontrado ou não atribuído.', code: 'NO_PROFILE' });
        }

        res.json({ usuario, perfil });
    } catch (error) {
        console.error('Erro no /api/me:', error);
        res.status(500).json({ error: 'Erro interno ao validar usuário.' });
    }
});

// --- ROTA DE SEEDING (Inicialização) ---
// Rota para criar o perfil Administrador e o usuário Ana Araujo
router.get('/setup-auth', async (req, res) => {
    try {
        // 1. Verifica se já existe um perfil Administrador
        let adminProfileId = null;
        const perfisSnap = await db.collection('perfis').where('isAdmin', '==', true).get();
        
        if (perfisSnap.empty) {
            // Cria o perfil
            const newAdmin = {
                nome: 'Administrador',
                isAdmin: true,
                telas_acesso: ['print', 'admin', 'editor', 'conexoes', 'categorias', 'perfis', 'usuarios'],
                categorias_modelos: 'todas',
                data_criacao: new Date().toISOString()
            };
            const docRef = await db.collection('perfis').add(newAdmin);
            adminProfileId = docRef.id;
            console.log('Perfil Administrador criado.');
        } else {
            adminProfileId = perfisSnap.docs[0].id;
            console.log('Perfil Administrador já existia.');
        }

        // 2. Verifica se a Ana já está cadastrada
        const emailAna = 'ana.araujo@ghlogistica.com.br';
        const anaSnap = await db.collection('usuarios').where('email', '==', emailAna).get();

        if (anaSnap.empty) {
            const anaUser = {
                email: emailAna,
                perfil_id: adminProfileId,
                status: 'ativo', // Já ativa para não precisar ser convidada novamente
                data_criacao: new Date().toISOString()
            };
            await db.collection('usuarios').add(anaUser);
            console.log('Usuário Ana criado.');
        } else {
            // Atualiza caso o perfil ID esteja diferente
            await db.collection('usuarios').doc(anaSnap.docs[0].id).update({
                perfil_id: adminProfileId
            });
            console.log('Usuário Ana já existia. Perfil atualizado.');
        }

        res.json({ success: true, message: 'Setup de Auth concluído!' });
    } catch (error) {
        console.error('Erro no setup-auth:', error);
        res.status(500).json({ error: 'Erro interno no setup de auth.' });
    }
});
