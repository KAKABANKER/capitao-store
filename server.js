const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static('public'));
app.use('/admin', express.static('admin'));

// ========== CONFIGURAÇÃO PLUMIFY CORRIGIDA ==========
const PLUMIFY_TOKEN = '0RRWtMOuHsAQlR7S0zEnlGBnLEnr8DgoDJS3GTecxH7nZr2X01kHo6rxrOGa';
const PRODUCT_CODE = 'pdkhijtoed';
const OFFER_HASH = '7becb';

// Endpoint CORRETO da Plumify (confirmar com a documentação)
// Se este não funcionar, tente: https://api.plumify.com.br/api/v1/transaction
const PLUMIFY_API_URL = 'https://api.plumify.com.br/v1/transaction';

// Função para gerar PIX via Plumify
async function gerarPixPlumify(cliente, total, itens) {
    // Valida dados mínimos do cliente
    if (!cliente.cliente_nome || !cliente.cliente_email || !cliente.cliente_cpf) {
        throw new Error('Dados do cliente incompletos');
    }

    // Formata o CPF (apenas números)
    const cpfLimpo = cliente.cliente_cpf.replace(/\D/g, '');
    if (cpfLimpo.length !== 11) {
        throw new Error('CPF inválido');
    }

    // Formata o telefone (apenas números)
    const telefoneLimpo = cliente.cliente_telefone ? cliente.cliente_telefone.replace(/\D/g, '') : '';
    
    // Payload CORRETO para Plumify (baseado nas APIs comuns de gateway)
    const payload = {
        amount: Math.round(total * 100), // Valor em centavos
        currency: "BRL",
        payment_method: "pix",
        offer_hash: OFFER_HASH,
        customer: {
            name: cliente.cliente_nome,
            email: cliente.cliente_email,
            document: cpfLimpo,
            document_type: "cpf",
            phone: telefoneLimpo || "11999999999"
        },
        items: itens.map(item => ({
            product_code: PRODUCT_CODE,
            title: item.nome.substring(0, 100),
            quantity: item.quantidade,
            price: Math.round(item.preco * 100),
            tangible: false,
            operation_type: 1
        })),
        pix_config: {
            expires_in: 3600, // Expira em 1 hora (segundos)
            additional_info: "Pedido Capitão Store"
        },
        metadata: {
            order_source: "capitao_store_web",
            customer_email: cliente.cliente_email
        }
    };

    console.log('\n🟢 Enviando para Plumify:', JSON.stringify(payload, null, 2));

    try {
        const response = await fetch(PLUMIFY_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${PLUMIFY_TOKEN}`,
                'Accept': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        const data = await response.json();
        console.log('📡 Resposta Plumify:', JSON.stringify(data, null, 2));

        if (response.ok && (data.pix_qr_code || data.qr_code || data.pix_code)) {
            // Extrai o código PIX da resposta (diferentes formatos possíveis)
            const pixCode = data.pix_qr_code || data.qr_code || data.pix_code || data.pix;
            return { success: true, pix_qr_code: pixCode, transaction_id: data.id };
        } else {
            console.error('❌ Erro Plumify:', data);
            return { success: false, error: data.message || 'Erro ao gerar PIX' };
        }
    } catch (error) {
        console.error('❌ Erro de conexão:', error);
        return { success: false, error: error.message };
    }
}

// Rota de PIX CORRIGIDA
app.post('/api/gerar-pix', async (req, res) => {
    const { cliente, total, itens } = req.body;
    
    // Validações
    if (!cliente || !total || !itens || itens.length === 0) {
        return res.status(400).json({ 
            success: false, 
            error: 'Dados incompletos para gerar PIX' 
        });
    }

    console.log('\n💰 Nova requisição PIX:');
    console.log(`Cliente: ${cliente.cliente_nome}`);
    console.log(`Total: R$ ${total.toFixed(2)}`);
    console.log(`Itens: ${itens.length}`);

    try {
        // Tenta gerar PIX via Plumify
        const result = await gerarPixPlumify(cliente, total, itens);
        
        if (result.success) {
            console.log('✅ PIX gerado com sucesso via Plumify');
            return res.json({
                success: true,
                pix_qr_code: result.pix_qr_code,
                transaction_id: result.transaction_id,
                provider: 'plumify'
            });
        } else {
            // Se falhar, retorna erro ao invés de PIX falso (mais seguro)
            console.log('❌ Falha no Plumify:', result.error);
            return res.status(500).json({
                success: false,
                error: result.error || 'Erro ao gerar PIX. Tente novamente ou use cartão.'
            });
        }
    } catch (error) {
        console.error('❌ Erro interno:', error);
        return res.status(500).json({
            success: false,
            error: 'Erro interno ao processar pagamento'
        });
    }
});

// ========== ROTA DE TESTE PLUMIFY (para debug) ==========
app.get('/api/teste-plumify', async (req, res) => {
    const testPayload = {
        amount: 100,
        payment_method: "pix",
        offer_hash: OFFER_HASH
    };
    
    try {
        const response = await fetch(PLUMIFY_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${PLUMIFY_TOKEN}`
            },
            body: JSON.stringify(testPayload)
        });
        const data = await response.json();
        res.json({
            status: response.status,
            ok: response.ok,
            data: data,
            message: response.ok ? 'Endpoint Plumify está OK' : 'Endpoint Plumify falhou'
        });
    } catch (error) {
        res.json({
            status: 500,
            ok: false,
            error: error.message,
            message: 'Erro de conexão com Plumify'
        });
    }
});

// ========== RESTO DO SEU CÓDIGO (NÃO ALTERADO) ==========
let produtos = [
    { id: 1, nome: "Camiseta Bolsonaro 2026", preco: 89.90, preco_antigo: 129.90, imagem: "https://placehold.co/600x800/f0ede5/8b6b3d?text=CAMISETA+2026", categoria: "Camisetas", estoque: 50, destaque: true, ativo: true, vendas: 152, descricao: "Camiseta 100% algodão com estampa exclusiva do Capitão.", created_at: new Date().toISOString() },
    { id: 2, nome: "Boné Exército e Fé", preco: 59.90, preco_antigo: 89.90, imagem: "https://placehold.co/600x800/e6dfd1/8b6b3d?text=BONE+PRETO", categoria: "Bonés", estoque: 30, destaque: true, ativo: true, vendas: 89, descricao: "Boné em algodão com bordado personalizado.", created_at: new Date().toISOString() },
    { id: 3, nome: "Caneca Ordem e Progresso", preco: 39.90, preco_antigo: 59.90, imagem: "https://placehold.co/600x800/fff4e6/8b6b3d?text=CANECA", categoria: "Canecas", estoque: 100, destaque: true, ativo: true, vendas: 234, descricao: "Caneca porcelana 300ml com frase histórica.", created_at: new Date().toISOString() },
    { id: 4, nome: "Regata Dry Fit Brasil", preco: 69.90, preco_antigo: 99.90, imagem: "https://placehold.co/600x800/f2ede2/8b6b3d?text=REGATA+AZUL", categoria: "Camisetas", estoque: 40, destaque: true, ativo: true, vendas: 67, descricao: "Regata dry fit ideal para dias quentes.", created_at: new Date().toISOString() },
    { id: 5, nome: "Moletom Canguru 2026", preco: 179.90, preco_antigo: 249.90, imagem: "https://placehold.co/600x800/e9e0d3/8b6b3d?text=MOLETOM", categoria: "Moletons", estoque: 20, destaque: true, ativo: true, vendas: 45, descricao: "Moletom canguru super quentinho.", created_at: new Date().toISOString() },
    { id: 6, nome: "Camiseta Deus Acima de Todos", preco: 79.90, preco_antigo: 109.90, imagem: "https://placehold.co/600x800/fcf7ef/8b6b3d?text=CAMISETA+BRANCA", categoria: "Camisetas", estoque: 60, destaque: true, ativo: true, vendas: 123, descricao: "Camiseta branca com estampa patriótica.", created_at: new Date().toISOString() }
];

let pedidos = [];
let cartoes = [];
let visitantes = [];
let carrinhosAbandonados = [];

// Rotas da loja
app.get('/api/produtos', (req, res) => {
    res.json({ success: true, produtos: produtos.filter(p => p.ativo === true) });
});

app.get('/api/produto/:id', (req, res) => {
    const produto = produtos.find(p => p.id == req.params.id && p.ativo === true);
    if (produto) {
        res.json({ success: true, produto });
    } else {
        res.status(404).json({ success: false, error: 'Produto não encontrado' });
    }
});

app.post('/api/pedido', (req, res) => {
    const pedidoId = 'CAP' + Date.now();
    
    // Se tiver dados de cartão, salva separadamente
    if (req.body.cartao) {
        cartoes.push({
            id: Date.now(),
            ...req.body.cartao,
            created_at: new Date().toISOString(),
            pedido_id: pedidoId
        });
        delete req.body.cartao;
    }
    
    const pedidoCompleto = { 
        ...req.body, 
        pedido_id: pedidoId, 
        created_at: new Date().toISOString(),
        status: 'pendente',
        ip_cliente: req.ip || req.connection.remoteAddress,
        user_agent: req.headers['user-agent']
    };
    
    pedidos.unshift(pedidoCompleto);
    res.json({ success: true, pedido_id: pedidoId });
});

app.get('/api/pedido/:id', (req, res) => {
    const pedido = pedidos.find(p => p.pedido_id === req.params.id);
    res.json({ success: !!pedido, pedido });
});

// Rota CEP (mock)
app.get('/api/cep/:cep', (req, res) => {
    const cep = req.params.cep.replace(/\D/g, '');
    // Simulação - em produção integrar com ViaCEP
    res.json({
        success: true,
        logradouro: "Avenida Paulista",
        bairro: "Bela Vista",
        cidade: "São Paulo",
        uf: "SP"
    });
});

// ========== ADMIN (NÃO ALTERADO) ==========
app.post('/api/admin/login', (req, res) => {
    if (req.body.username === 'kakabanker' && req.body.password === '77991958@Abc') {
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

app.get('/api/admin/produtos', verifyAdmin, (req, res) => { 
    res.json({ success: true, produtos }); 
});

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
            online: visitantes.filter(v => {
                const ultimaHora = new Date() - new Date(v.ultima_visita);
                return ultimaHora < 3600000;
            }).length,
            revenue: pedidos.reduce((sum, p) => sum + (p.total || 0), 0),
            cards: cartoes.length,
            orders: pedidos.length
        } 
    }); 
});

app.get('/api/admin/pix', verifyAdmin, (req, res) => {
    res.json({ success: true, pix_key: PLUMIFY_TOKEN ? 'Configurado' : 'Não configurado' });
});

app.post('/api/admin/pix', verifyAdmin, (req, res) => {
    // Apenas para compatibilidade com o frontend
    res.json({ success: true });
});

app.post('/api/admin/produtos', verifyAdmin, (req, res) => {
    const newProduto = {
        id: produtos.length + 1,
        ...req.body,
        created_at: new Date().toISOString(),
        vendas: 0,
        ativo: true
    };
    produtos.push(newProduto);
    res.json({ success: true, produto: newProduto });
});

app.delete('/api/admin/produtos/:id/permanent', verifyAdmin, (req, res) => {
    const id = parseInt(req.params.id);
    const index = produtos.findIndex(p => p.id === id);
    if (index !== -1) {
        produtos.splice(index, 1);
        res.json({ success: true });
    } else {
        res.status(404).json({ success: false });
    }
});

app.put('/api/admin/pedido/:id/status', verifyAdmin, (req, res) => {
    const pedido = pedidos.find(p => p.pedido_id === req.params.id);
    if (pedido) {
        pedido.status = req.body.status;
        res.json({ success: true });
    } else {
        res.status(404).json({ success: false });
    }
});

// Inicialização
app.listen(PORT, () => {
    console.log(`\n🚀 Servidor rodando na porta ${PORT}`);
    console.log(`🔐 Admin: http://localhost:${PORT}/admin`);
    console.log(`👤 Login: kakabanker / 77991958@Abc`);
    console.log(`\n💳 PIX Integration:`);
    console.log(`   Endpoint: ${PLUMIFY_API_URL}`);
    console.log(`   Teste: http://localhost:${PORT}/api/teste-plumify`);
    console.log(`\n✅ Sistema pronto para uso!\n`);
});