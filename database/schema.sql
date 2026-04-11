-- Criar tabela de produtos
CREATE TABLE IF NOT EXISTS produtos (
    id SERIAL PRIMARY KEY,
    nome VARCHAR(200) NOT NULL,
    preco DECIMAL(10,2) NOT NULL,
    preco_antigo DECIMAL(10,2),
    imagem TEXT,
    categoria VARCHAR(100),
    destaque BOOLEAN DEFAULT FALSE,
    estoque INT DEFAULT 0,
    ativo BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Criar tabela de pedidos
CREATE TABLE IF NOT EXISTS pedidos (
    id SERIAL PRIMARY KEY,
    pedido_id VARCHAR(50) UNIQUE NOT NULL,
    cliente_nome VARCHAR(200),
    cliente_email VARCHAR(200),
    cliente_telefone VARCHAR(30),
    cliente_cpf VARCHAR(20),
    endereco_cep VARCHAR(10),
    endereco_rua VARCHAR(200),
    endereco_numero VARCHAR(20),
    endereco_bairro VARCHAR(100),
    endereco_cidade VARCHAR(100),
    itens JSONB,
    subtotal DECIMAL(10,2),
    total DECIMAL(10,2),
    forma_pagamento VARCHAR(50),
    status VARCHAR(30) DEFAULT 'pendente',
    created_at TIMESTAMP DEFAULT NOW()
);

-- Criar tabela de visitantes (CRM)
CREATE TABLE IF NOT EXISTS visitantes (
    id SERIAL PRIMARY KEY,
    visitor_id VARCHAR(100) UNIQUE NOT NULL,
    ip VARCHAR(50),
    user_agent TEXT,
    primeira_visita TIMESTAMP DEFAULT NOW(),
    ultima_visita TIMESTAMP DEFAULT NOW(),
    page_views INT DEFAULT 1,
    origem VARCHAR(200),
    carrinho JSONB
);

-- Inserir produtos padrão
INSERT INTO produtos (nome, preco, preco_antigo, imagem, categoria, destaque, estoque) VALUES
('Camiseta Bolsonaro 2026', 89.90, 129.90, 'https://placehold.co/600x800/f0ede5/8b6b3d?text=CAMISETA+2026', 'Camisetas', TRUE, 50),
('Boné Exército e Fé', 59.90, 89.90, 'https://placehold.co/600x800/e6dfd1/8b6b3d?text=BONÉ+PRETO', 'Bonés', TRUE, 30),
('Regata Dry Fit Brasil', 69.90, 99.90, 'https://placehold.co/600x800/f2ede2/8b6b3d?text=REGATA+AZUL', 'Camisetas', TRUE, 40),
('Caneca "Ordem e Progresso"', 39.90, 59.90, 'https://placehold.co/600x800/fff4e6/8b6b3d?text=CANECA', 'Canecas', TRUE, 100),
('Moletom Canguru 2026', 179.90, 249.90, 'https://placehold.co/600x800/e9e0d3/8b6b3d?text=MOLETOM', 'Moletons', TRUE, 20),
('Camiseta "Deus Acima de Todos"', 79.90, 109.90, 'https://placehold.co/600x800/fcf7ef/8b6b3d?text=CAMISETA+BRANCA', 'Camisetas', TRUE, 60);

-- Inserir cupom de desconto padrão
CREATE TABLE IF NOT EXISTS cupons (
    id SERIAL PRIMARY KEY,
    codigo VARCHAR(50) UNIQUE NOT NULL,
    percentual INT NOT NULL,
    ativo BOOLEAN DEFAULT TRUE
);

INSERT INTO cupons (codigo, percentual) VALUES ('BRASIL10', 10);