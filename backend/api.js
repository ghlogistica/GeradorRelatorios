const express = require('express');
const { Pool } = require('pg');
let mssql;
try { mssql = require('mssql'); } catch(e) { console.warn('mssql não instalado'); }
const multer = require('multer');
const zebraPrinterService = require('./ZebraPrinterService');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

// In-memory mock database for templates
let savedTemplates = [
    { id: 1, nome: 'Etiqueta Expedição 10x15', data_criacao: '2026-07-28T10:00:00Z' },
    { id: 2, nome: 'Etiqueta Gôndola', data_criacao: '2026-07-27T14:30:00Z' }
];

// Configuração da conexão com o banco de dados
const pool = new Pool({
    user: 'seu_usuario',
    host: 'localhost',
    database: 'sua_base',
    password: 'sua_senha',
    port: 5432,
});

/**
 * POST /api/imprimir-etiqueta
 * Recebe o ID do template e os parâmetros preenchidos pelo usuário.
 * Exemplo de Payload: 
 * {
 *   "template_id": 1,
 *   "parametros": {
 *     "numero_pedido": "12345",
 *     "cliente_id": "99"
 *   }
 * }
 */
router.post('/imprimir-etiqueta', async (req, res) => {
    const { template_id, parametros } = req.body;

    if (!template_id || !parametros) {
        return res.status(400).json({ error: 'template_id e parametros são obrigatórios.' });
    }

    try {
        // 1. Busca todas as queries atreladas a este template
        const queriesResult = await pool.query(
            'SELECT * FROM templates_queries WHERE template_id = $1', 
            [template_id]
        );

        if (queriesResult.rows.length === 0) {
            // Pode ser um template sem query (somente dados fixos)
        }

        const dataAgregada = {}; // Ex: { "QueryProduto": [{...}], "QueryCliente": [{...}] }

        // 2. Executar cada query contra o seu respectivo banco
        for (const queryRow of queriesResult.rows) {
            const { conexao_id, nome_alias_tabela, query_sql } = queryRow;

            // 2.1 Buscar dados da conexao
            const conexaoResult = await pool.query('SELECT * FROM conexoes_banco WHERE id = $1', [conexao_id]);
            const configDb = conexaoResult.rows[0];

            let querySqlTratada = query_sql;
            
            // Simulação de Mapeamento de Parâmetros
            for (const [key, value] of Object.entries(parametros)) {
                const regexParametro = new RegExp(`:${key}\\b`, 'g');
                querySqlTratada = querySqlTratada.replace(regexParametro, `'${value}'`); // Simplificado p/ multi-db
            }

            try {
                // Simula conexão baseada no tipo
                console.log(`[Multi-DB] Conectando no ${configDb?.tipo_banco} em ${configDb?.host} para rodar ${nome_alias_tabela}`);
                
                // Em um cenário real:
                // if (configDb.tipo_banco === 'sqlserver') {
                //    await mssql.connect(`mssql://${configDb.usuario}:${configDb.senha}@${configDb.host}/${configDb.database}`);
                //    const rs = await mssql.query(querySqlTratada);
                //    dataAgregada[nome_alias_tabela] = rs.recordset;
                // } else if (configDb.tipo_banco === 'postgres') ...

                // Mocking result for demo:
                dataAgregada[nome_alias_tabela] = [{ dummy: 'data' }];

            } catch (dbErr) {
                console.error(`Erro ao rodar query ${nome_alias_tabela}:`, dbErr);
            }
        }

        // 3. Buscar os Elementos de Layout
        const elementosLayout = await pool.query('SELECT * FROM elementos_layout WHERE template_id = $1', [template_id]);
        
        // 4. Avaliar Condicionais
        const elementosFiltrados = elementosLayout.rows.filter(el => {
            if (!el.is_opcional || !el.regra_condicional) return true; // Sempre imprime
            
            try {
                // Avaliação perigosa na vida real (eval), mas serve para a lógica dinâmica se 'dataAgregada' estiver em escopo
                // Exemplo seguro com vm.runInNewContext:
                // return vm.runInNewContext(el.regra_condicional, { ...dataAgregada });
                console.log(`[Condicional] Avaliando regra: ${el.regra_condicional}`);
                return true; // Mock true
            } catch(e) {
                return false; // Se a regra der erro, esconde
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

        // Retorna os resultados p/ o front ou manda p/ zebra
        return res.status(200).json({
            success: true,
            data: dataAgregada,
            elementos_finais: elementosMapeados
        });

    } catch (error) {
        console.error('Erro ao executar query do template:', error);
        return res.status(500).json({ error: 'Erro interno ao processar a etiqueta.' });
    }
});

/**
 * POST /api/parse-label-image
 * Recebe uma imagem de etiqueta, simula o processamento por IA e retorna os elementos do layout.
 */
router.post('/parse-label-image', upload.single('imagem'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'Nenhuma imagem enviada.' });
        }

        // Aqui entraria a chamada real para OpenAI / Gemini Vision passando req.file.buffer
        // Ex: const aiResponse = await callGeminiVision(req.file.buffer);
        
        console.log(`[IA] Analisando imagem de ${req.file.size} bytes...`);
        
        // Simula o tempo de processamento da IA
        await new Promise(resolve => setTimeout(resolve, 2500));

        // Layout Mockado (Simulando o JSON de retorno da IA com as coordenadas detectadas)
        const mockAiLayout = [
            { id: Date.now() + 1, tipo_elemento: 'texto', posicao_x: 120, posicao_y: 40, fonte: 'Arial', tamanho_fonte: 12, fonte_dados: 'Estatico', valor_estatico: 'DINACO IMPORTACAO COMERCIO LTDA/' },
            { id: Date.now() + 2, tipo_elemento: 'texto', posicao_x: 120, posicao_y: 60, fonte: 'Arial', tamanho_fonte: 12, fonte_dados: 'Estatico', valor_estatico: 'CNPJ 33.424.730/0003-30' },
            { id: Date.now() + 3, tipo_elemento: 'texto', posicao_x: 120, posicao_y: 75, fonte: 'Arial', tamanho_fonte: 12, fonte_dados: 'Estatico', valor_estatico: 'Osvaldo Reis, 3385 - SA 1.401 V' },
            { id: Date.now() + 4, tipo_elemento: 'texto', posicao_x: 120, posicao_y: 90, fonte: 'Arial', tamanho_fonte: 12, fonte_dados: 'Estatico', valor_estatico: 'PRAIA BRAVA - ITAJAI/SC' },
            { id: Date.now() + 5, tipo_elemento: 'texto', posicao_x: 120, posicao_y: 105, fonte: 'Arial', tamanho_fonte: 12, fonte_dados: 'Estatico', valor_estatico: 'CEP: 88306-773' },
            { id: Date.now() + 6, tipo_elemento: 'texto', posicao_x: 120, posicao_y: 120, fonte: 'Arial', tamanho_fonte: 12, fonte_dados: 'Estatico', valor_estatico: '08007722620' },

            { id: Date.now() + 7, tipo_elemento: 'texto', posicao_x: 40, posicao_y: 170, fonte: 'Arial', tamanho_fonte: 24, fonte_dados: 'Estatico', valor_estatico: 'PEMULEN TR 2' },
            { id: Date.now() + 8, tipo_elemento: 'texto', posicao_x: 40, posicao_y: 200, fonte: 'Arial', tamanho_fonte: 11, fonte_dados: 'Estatico', valor_estatico: 'Polímero acrílico modificado (~100%).' },
            { id: Date.now() + 9, tipo_elemento: 'texto', posicao_x: 40, posicao_y: 215, fonte: 'Arial', tamanho_fonte: 11, fonte_dados: 'Estatico', valor_estatico: 'Farmacêutico responsável' },
            { id: Date.now() + 10, tipo_elemento: 'texto', posicao_x: 40, posicao_y: 230, fonte: 'Arial', tamanho_fonte: 11, fonte_dados: 'Estatico', valor_estatico: 'ONU , , Sub classe ,' },
            { id: Date.now() + 11, tipo_elemento: 'texto', posicao_x: 40, posicao_y: 245, fonte: 'Arial', tamanho_fonte: 11, fonte_dados: 'Estatico', valor_estatico: 'País de Origem: BRASIL' },
            
            { id: Date.now() + 12, tipo_elemento: 'texto', posicao_x: 40, posicao_y: 265, fonte: 'Arial', tamanho_fonte: 12, fonte_dados: 'Estatico', valor_estatico: 'Lote:' },
            { id: Date.now() + 13, tipo_elemento: 'texto', posicao_x: 75, posicao_y: 265, fonte: 'Arial', tamanho_fonte: 12, fonte_dados: 'Query1', coluna_banco: 'numero_lote' },
            { id: Date.now() + 14, tipo_elemento: 'codigo_barras', posicao_x: 40, posicao_y: 280, fonte: 'Arial', tamanho_fonte: 30, fonte_dados: 'Query1', coluna_banco: 'numero_lote' },
            
            { id: Date.now() + 15, tipo_elemento: 'texto', posicao_x: 40, posicao_y: 330, fonte: 'Arial', tamanho_fonte: 11, fonte_dados: 'Estatico', valor_estatico: 'Fabricação:' },
            { id: Date.now() + 16, tipo_elemento: 'texto', posicao_x: 105, posicao_y: 330, fonte: 'Arial', tamanho_fonte: 11, fonte_dados: 'Query1', coluna_banco: 'data_fabricacao' },
            { id: Date.now() + 17, tipo_elemento: 'texto', posicao_x: 200, posicao_y: 325, fonte: 'Arial', tamanho_fonte: 11, fonte_dados: 'Estatico', valor_estatico: 'Validade:' },
            { id: Date.now() + 18, tipo_elemento: 'texto', posicao_x: 255, posicao_y: 325, fonte: 'Arial', tamanho_fonte: 11, fonte_dados: 'Query1', coluna_banco: 'data_validade' },

            { id: Date.now() + 19, tipo_elemento: 'texto', posicao_x: 40, posicao_y: 355, fonte: 'Arial', tamanho_fonte: 11, fonte_dados: 'Estatico', valor_estatico: 'Peso Líquido:' },
            { id: Date.now() + 20, tipo_elemento: 'texto', posicao_x: 115, posicao_y: 355, fonte: 'Arial', tamanho_fonte: 11, fonte_dados: 'Query1', coluna_banco: 'peso_liquido' },
            { id: Date.now() + 21, tipo_elemento: 'texto', posicao_x: 200, posicao_y: 355, fonte: 'Arial', tamanho_fonte: 11, fonte_dados: 'Estatico', valor_estatico: 'Peso Bruto:' },
            { id: Date.now() + 22, tipo_elemento: 'texto', posicao_x: 265, posicao_y: 355, fonte: 'Arial', tamanho_fonte: 11, fonte_dados: 'Query1', coluna_banco: 'peso_bruto' },

            { id: Date.now() + 23, tipo_elemento: 'texto', posicao_x: 350, posicao_y: 110, fonte: 'Arial', tamanho_fonte: 12, fonte_dados: 'Estatico', valor_estatico: 'FRASES DE ADVERTÊNCIAS: Atenção' },
            { id: Date.now() + 24, tipo_elemento: 'texto', posicao_x: 350, posicao_y: 130, fonte: 'Arial', tamanho_fonte: 12, fonte_dados: 'Estatico', valor_estatico: 'FRASES DE PERIGO' },
            { id: Date.now() + 25, tipo_elemento: 'texto', posicao_x: 350, posicao_y: 150, fonte: 'Arial', tamanho_fonte: 10, fonte_dados: 'Estatico', valor_estatico: 'H412 - Nocivo para os organismos aquáticos, com efeitos prolongados.' },

            { id: Date.now() + 26, tipo_elemento: 'texto', posicao_x: 350, posicao_y: 220, fonte: 'Arial', tamanho_fonte: 12, fonte_dados: 'Estatico', valor_estatico: 'FRASES DE PRECAUÇÃO' },
            { id: Date.now() + 27, tipo_elemento: 'texto', posicao_x: 350, posicao_y: 240, fonte: 'Arial', tamanho_fonte: 10, fonte_dados: 'Estatico', valor_estatico: 'P273 - Evite a liberação para o meio ambiente.' },
            { id: Date.now() + 28, tipo_elemento: 'texto', posicao_x: 350, posicao_y: 255, fonte: 'Arial', tamanho_fonte: 10, fonte_dados: 'Estatico', valor_estatico: 'P501 - Descartar o conteúdo/embalagem de acordo com as leis aplicáveis ao produto.' },

            { id: Date.now() + 29, tipo_elemento: 'texto', posicao_x: 700, posicao_y: 40, fonte: 'Arial', tamanho_fonte: 10, fonte_dados: 'Estatico', valor_estatico: 'Importado e Distribuido por:' },
            { id: Date.now() + 30, tipo_elemento: 'texto', posicao_x: 700, posicao_y: 55, fonte: 'Arial', tamanho_fonte: 10, fonte_dados: 'Estatico', valor_estatico: 'CNPJ 33.424.730/0003-30' },
            { id: Date.now() + 31, tipo_elemento: 'texto', posicao_x: 700, posicao_y: 70, fonte: 'Arial', tamanho_fonte: 10, fonte_dados: 'Estatico', valor_estatico: 'Av. Osvaldo Reis, 3385 - Sala 1401 V' },
            { id: Date.now() + 32, tipo_elemento: 'texto', posicao_x: 700, posicao_y: 85, fonte: 'Arial', tamanho_fonte: 10, fonte_dados: 'Estatico', valor_estatico: 'Praia Brava - Itajai/SC - CEP: 88.306-773' },
            
            { id: Date.now() + 33, tipo_elemento: 'texto', posicao_x: 700, posicao_y: 120, fonte: 'Arial', tamanho_fonte: 10, fonte_dados: 'Estatico', valor_estatico: 'Distribuido por:' },
            { id: Date.now() + 34, tipo_elemento: 'texto', posicao_x: 700, posicao_y: 135, fonte: 'Arial', tamanho_fonte: 10, fonte_dados: 'Estatico', valor_estatico: 'CNPJ 33.424.730/0006-83' },
            { id: Date.now() + 35, tipo_elemento: 'texto', posicao_x: 700, posicao_y: 150, fonte: 'Arial', tamanho_fonte: 10, fonte_dados: 'Estatico', valor_estatico: 'Av. Gupe, 10767 - Sala 1, Módulo 5' },
            { id: Date.now() + 36, tipo_elemento: 'texto', posicao_x: 700, posicao_y: 165, fonte: 'Arial', tamanho_fonte: 10, fonte_dados: 'Estatico', valor_estatico: 'Jardim Belval - Barueri/SP - CEP 06.442-120' },
            { id: Date.now() + 37, tipo_elemento: 'texto', posicao_x: 700, posicao_y: 180, fonte: 'Arial', tamanho_fonte: 10, fonte_dados: 'Estatico', valor_estatico: 'RT: Verônica Maciel Abdon de Oliveira' },
            
            { id: Date.now() + 38, tipo_elemento: 'texto', posicao_x: 700, posicao_y: 310, fonte: 'Arial', tamanho_fonte: 10, fonte_dados: 'Estatico', valor_estatico: 'A FDS pode ser obtida por meio de cdp@dinaco.com.br' },
            { id: Date.now() + 39, tipo_elemento: 'texto', posicao_x: 700, posicao_y: 325, fonte: 'Arial', tamanho_fonte: 10, fonte_dados: 'Estatico', valor_estatico: 'TELEFONE DE EMERGÊNCIA: (11) 99651-5696' },
            { id: Date.now() + 40, tipo_elemento: 'texto', posicao_x: 700, posicao_y: 345, fonte: 'Arial', tamanho_fonte: 12, fonte_dados: 'Estatico', valor_estatico: 'RG-SGL.42 - XX/12/2025' }
        ];

        return res.status(200).json({
            success: true,
            elementos: mockAiLayout
        });

    } catch (error) {
        console.error('Erro ao processar imagem:', error);
        return res.status(500).json({ error: 'Erro ao processar a imagem com a IA.' });
    }
});

/**
 * GET /api/templates
 * Retorna todos os templates salvos (simulado em memória).
 */
router.get('/templates', async (req, res) => {
    return res.status(200).json(savedTemplates);
});

/**
 * POST /api/templates
 * Recebe o payload do frontend para salvar o modelo no banco de dados.
 */
router.post('/templates', async (req, res) => {
    try {
        const payload = req.body;
        console.log(`[API] Solicitando salvamento do template: ${payload.nomeTemplate}`);
        
        // Simula o salvamento no banco de dados
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Encontra o maior ID atual para incrementar
        const maxId = savedTemplates.reduce((max, t) => Math.max(max, t.id), 0);

        const novoTemplate = {
            id: maxId + 1,
            nome: payload.nomeTemplate,
            data_criacao: new Date().toISOString(),
            // A carga inteira ficaria salva no DB, mas para o dashboard precisamos apenas do resumo
        };
        savedTemplates.push(novoTemplate);
        
        console.log('[API] Modelo salvo com sucesso (mockado)!');
        return res.status(200).json({ success: true, message: 'Modelo salvo com sucesso.', template: novoTemplate });
    } catch (error) {
        console.error('Erro ao salvar template:', error);
        return res.status(500).json({ error: 'Erro interno ao salvar template.' });
    }
});

module.exports = router;
