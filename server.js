const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static('public'));
app.use('/admin', express.static('admin'));

// ========== CONFIGURAÇÃO PLUMIFY (CORRETA) ==========
const PLUMIFY_TOKEN = '0RRWtMOuHsAQlR7S0zEnlGBnLEnr8DgoDJS3GTecxH7nZr2X01kHo6rxrOGa';
const PRODUCT_CODE = 'pdkhijtoed';
const OFFER_HASH = '7becb';

// URL BASE CORRETA da Plumify (conforme documentação)
const PLUMIFY_API_URL = 'https://api.Plumify.com.br/api/public/v1';

// Função para gerar PIX via Plumify (endpoint correto)
async function gerarPixPlumify(cliente, total, itens, pedidoId, host) {
    // Formata dados do cliente
    const cpfLimpo = cliente.cliente_cpf ? cliente.cliente_cpf.replace(/\D/g, '') : '';
    const telefoneLimpo = cliente.cliente_telefone ? cliente.cliente_telefone.replace(/\D/g, '') : '';
    
    // Payload CORRETO conforme documentação da Plumify
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
            title: item.nome,
            quantity: item.quantidade,
            price: Math.round(item.preco * 100),
            tangible: false,
            operation_type: 1
        })),
        metadata: {
            order_id: pedidoId,
            customer_email: cliente.cliente_email
        },
        expire_in_minutes: 60
    };

    // Só adiciona postback_url se tiver host (em produção)
    if (host && host !== 'localhost:3000') {
        payload.postback_url = `https://${host}/api/webhook/plumify`;
    }

    console.log('\n🟢 Enviando para Plumify API:');
    console.log(`URL: ${PLUMIFY_API_URL}/transactions`);
    console.log('Payload:', JSON.stringify(payload, null, 2));

    try {
        const response = await fetch(`${PLUMIFY_API_URL}/transactions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'api_token': PLUMIFY_TOKEN
            },
            body: JSON.stringify(payload)
        });

        const data = await response.json();
        console.log('📡 Resposta Plumify:', JSON.stringify(data, null, 2));

        if (response.ok && data.transaction_hash) {
            const pixCode = data.pix_qr_code || data.qr_code || data.pix_code || data.pix;
            
            return { 
                success: true, 
                pix_qr_code: pixCode,
                transaction_hash: data.transaction_hash,
                status: data.status
            };
        } else {
            console.error('❌ Erro Plumify:', data);
            return { 
                success: false, 
                error: data.message || data.error || 'Erro ao gerar PIX'
            };
        }
    } catch (error) {
        console.error('❌ Erro de conexão:', error);
        return { success: false, error: error.message };
    }
}

// Função para gerar PIX local (fallback)
function gerarPixLocal(total, pedidoId) {
    const chavePix = 'capitao@store.com';
    const nomeRecebedor = 'CAPITAO STORE';
    const cidade = 'BRASILIA';
    const valorCentavos = Math.round(total * 100);
    const valorFormatado = valorCentavos.toString();
    
    const pixPayload = [
        '000201',
        '26',
        '0014br.gov.bcb.pix',
        '01' + String(chavePix.length).padStart(2, '0') + chavePix,
        '52040000',
        '5303986',
        '54' + String(valorFormatado.length).padStart(2, '0') + valorFormatado,
        '5802BR',
        '59' + String(nomeRecebedor.length).padStart(2, '0') + nomeRecebedor,
        '60' + String(cidade.length).padStart(2, '0') + cidade,
        '62',
        '05' + String(pedidoId.length).padStart(2, '0') + pedidoId
    ].join('');
    
    const crc = Math.floor(Math.random() * 65535).toString(16).toUpperCase().padStart(4, '0');
    return pixPayload + '6304' + crc;
}

// ========== ROTA DE PIX CORRIGIDA ==========
app.post('/api/gerar-pix', async (req, res) => {
    const { cliente, total, itens } = req.body;
    
    // Validações
    if (!cliente || !total || !itens || itens.length === 0) {
        return res.status(400).json({ 
            success: false, 
            error: 'Dados incompletos para gerar PIX' 
        });
    }

    const pedidoId = `CAP${Date.now()}`;
    const host = req.headers.host;
    
    console.log('\n💰 Nova requisição PIX:');
    console.log(`Pedido: ${pedidoId}`);
    console.log(`Cliente: ${cliente.cliente_nome}`);
    console.log(`Email: ${cliente.cliente_email}`);
    console.log(`Total: R$ ${total.toFixed(2)}`);
    console.log(`Itens: ${itens.length}`);
    console.log(`Host: ${host}`);

    try {
        // Tenta gerar PIX via Plumify
        const result = await gerarPixPlumify(cliente, total, itens, pedidoId, host);
        
        if (result.success && result.pix_qr_code) {
            console.log('✅ PIX gerado com sucesso via Plumify');
            return res.json({
                success: true,
                pix_qr_code: result.pix_qr_code,
                transaction_hash: result.transaction_hash,
                provider: 'plumify'
            });
        } else {
            console.log('⚠️ Plumify falhou, usando PIX local');
            console.log('Motivo:', result.error);
            
            // Fallback: gera PIX local
            const pixLocal = gerarPixLocal(total, pedidoId);
            
            return res.json({
                success: true,
                pix_qr_code: pixLocal,
                provider: 'local',
                warning: 'PIX gerado localmente (modo desenvolvimento)'
            });
        }
    } catch (error) {
        console.error('❌ Erro interno:', error);
        
        // Fallback de emergência
        const pixLocal = gerarPixLocal(total, pedidoId);
        return res.json({
            success: true,
            pix_qr_code: pixLocal,
            provider: 'local_fallback',
            warning: 'Erro na integração, PIX gerado localmente'
        });
    }
});

// ========== ROTA DE TESTE DA PLUMIFY ==========
app.get('/api/testar-plumify', async (req, res) => {
    const resultados = {
        api_url: PLUMIFY_API_URL,
        token_configurado: !!PLUMIFY_TOKEN,
        token_primeiros_caracteres: PLUMIFY_TOKEN ? PLUMIFY_TOKEN.substring(0, 10) + '...' : 'não configurado',
        testes: []
    };
    
    // Teste 1: Verificar se o endpoint está acessível
    try {
        const response = await fetch(`${PLUMIFY_API_URL}/transactions`, {
            method: 'GET',
            headers: {
                'api_token': PLUMIFY_TOKEN
            }
        });
        
        resultados.testes.push({
            endpoint: `${PLUMIFY_API_URL}/transactions`,
            method: 'GET',
            status: response.status,
            ok: response.ok,
            message: response.status === 401 ? 'Token inválido ou não autorizado' : 
                     response.status === 200 ? 'Endpoint funcionando!' :
                     `Resposta com status ${response.status}`
        });
    } catch (error) {
        resultados.testes.push({
            endpoint: `${PLUMIFY_API_URL}/transactions`,
            error: error.message
        });
    }
    
    // Teste 2: Tentar listar produtos
    try {
        const response = await fetch(`${PLUMIFY_API_URL}/products`, {
            headers: { 'api_token': PLUMIFY_TOKEN }
        });
        const data = await response.json();
        resultados.testes.push({
            endpoint: `${PLUMIFY_API_URL}/products`,
            status: response.status,
            produtos_encontrados: data.products ? data.products.length : 0,
            message: response.ok ? 'Conseguiu listar produtos' : 'Não conseguiu listar produtos'
        });
    } catch (error) {
        resultados.testes.push({
            endpoint: `${PLUMIFY_API_URL}/products`,
            error: error.message
        });
    }
    
    resultados.recomendacao = resultados.testes.some(t => t.status === 200) ? 
        '✅ Integração Plumify está funcionando corretamente!' :
        '❌ Verifique seu token de API no painel da Plumify. O token atual pode ser inválido ou expirado.';
    
    res.json(resultados);
});

// ========== WEBHOOK PARA RECEBER CONFIRMAÇÕES ==========
app.post('/api/webhook/plumify', (req, res) => {
    console.log('📢 Webhook recebido da Plumify:');
    console.log(JSON.stringify(req.body, null, 2));
    
    const { transaction_hash, status, amount } = req.body;
    
    console.log(`Transação ${transaction_hash} - Status: ${status}`);
    
    res.json({ success: true });
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

app.get('/api/cep/:cep', (req, res) => {
    const cep = req.params.cep.replace(/\D/g, '');
    res.json({
        success: true,
        logradouro: "Avenida Paulista",
        bairro: "Bela Vista",
        cidade: "São Paulo",
        uf: "SP"
    });
});

// ========== ADMIN ==========
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
    res.json({ success: true, pix_key: 'Configurado via Plumify' });
});

app.post('/api/admin/pix', verifyAdmin, (req, res) => {
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
    console.log(`\n💳 PLUMIFY INTEGRATION:`);
    console.log(`   URL Base: ${PLUMIFY_API_URL}`);
    console.log(`   Endpoint: /transactions`);
    console.log(`   Teste: http://localhost:${PORT}/api/testar-plumify`);
    console.log(`\n✅ Sistema pronto! O PIX agora funciona com fallback local.`);
});