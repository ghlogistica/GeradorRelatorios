-- =========================================================================
-- V2 SCHEMA: Multi-Banco (ERP), Queries Múltiplas e Lógica Condicional
-- =========================================================================

-- Tabela para armazenar as configurações dos Bancos de Dados Externos (ERP)
CREATE TABLE conexoes_banco (
    id SERIAL PRIMARY KEY,
    nome_conexao VARCHAR(255) NOT NULL,
    tipo_banco VARCHAR(50) NOT NULL, -- postgres, sqlserver, mysql, oracle
    host VARCHAR(255) NOT NULL,
    porta INTEGER NOT NULL,
    usuario VARCHAR(100) NOT NULL,
    senha VARCHAR(255) NOT NULL,
    database VARCHAR(255) NOT NULL,
    data_criacao TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Tabela principal do Template
CREATE TABLE templates_etiqueta (
    id SERIAL PRIMARY KEY,
    nome VARCHAR(255) NOT NULL,
    largura NUMERIC(5, 2) DEFAULT 10.0, -- em cm
    altura NUMERIC(5, 2) DEFAULT 15.0,  -- em cm
    orientacao VARCHAR(20) DEFAULT 'retrato',
    margem NUMERIC(5, 2) DEFAULT 0.5,   -- em cm
    data_criacao TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Tabela 1:N com Templates para permitir Múltiplos SQLs (de diferentes bancos) na mesma etiqueta
CREATE TABLE templates_queries (
    id SERIAL PRIMARY KEY,
    template_id INTEGER NOT NULL REFERENCES templates_etiqueta(id) ON DELETE CASCADE,
    conexao_id INTEGER NOT NULL REFERENCES conexoes_banco(id) ON DELETE RESTRICT,
    nome_alias_tabela VARCHAR(100) NOT NULL, -- Ex: 'QueryCliente', 'QueryProduto'
    query_sql TEXT NOT NULL
);

CREATE INDEX idx_templates_queries_template ON templates_queries(template_id);

-- Campos que o usuário digita na hora de imprimir
CREATE TABLE campos_input (
    id SERIAL PRIMARY KEY,
    template_id INTEGER NOT NULL REFERENCES templates_etiqueta(id) ON DELETE CASCADE,
    nome_campo VARCHAR(100) NOT NULL,
    label_exibicao VARCHAR(255) NOT NULL,
    tipo_dado VARCHAR(50) NOT NULL,
    CONSTRAINT chk_tipo_dado CHECK (tipo_dado IN ('texto', 'numero', 'data', 'booleano'))
);

CREATE INDEX idx_campos_input_template_id ON campos_input(template_id);

-- Elementos Desenhados na Etiqueta (com regras condicionais)
CREATE TABLE elementos_layout (
    id SERIAL PRIMARY KEY,
    template_id INTEGER NOT NULL REFERENCES templates_etiqueta(id) ON DELETE CASCADE,
    tipo_elemento VARCHAR(50) NOT NULL,
    posicao_x NUMERIC(10, 2) NOT NULL,
    posicao_y NUMERIC(10, 2) NOT NULL,
    fonte VARCHAR(100),
    tamanho_fonte INTEGER,
    
    -- Mapeamento de Dados
    fonte_dados VARCHAR(100) NOT NULL, -- Ex: 'Estatico' ou 'QueryCliente'
    coluna_banco VARCHAR(255),         -- Ex: 'nome_fantasia'
    valor_estatico TEXT,               -- Ex: 'PESO LIQUIDO:'
    
    -- Lógica Condicional de Impressão
    is_opcional BOOLEAN DEFAULT FALSE,
    regra_condicional TEXT,            -- Ex: 'QueryProduto.peso > 0'
    
    CONSTRAINT chk_tipo_elemento CHECK (tipo_elemento IN ('texto', 'codigo_barras', 'qrcode', 'imagem'))
);

CREATE INDEX idx_elementos_layout_template_id ON elementos_layout(template_id);
