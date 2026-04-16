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

// Basic Auth: secret_key + ":x" codificado em base64
const basicAuth = 'Basic ' + Buffer.from(`${DROPIPAY_SECRET_KEY}:x`).toString('base64');

// ========== FUNÇÃO CRIAR TRANSAÇÃO (UNIFICADA) ==========
async function criarTransacaoDropiPay(cliente, total, itens, pedidoId, host, paymentMethod, cartao = null) {
    const cpfLimpo = cliente.cliente_cpf ? cliente.cliente_cpf.replace(/\D/g, '') : '';
    const telefoneLimpo = cliente.cliente_telefone ? cliente.cliente_telefone.replace(/\D/g, '') : '';
    const amountInCents = Math.round(total * 100);
    
    // Payload base conforme documentação
    const payload = {
        amount: amountInCents,
        payment_method: paymentMethod, // 'pix', 'boleto', 'credit_card'
        customer: {
            name: cliente.cliente_nome,
            email: cliente.cliente_email,
            document: cpfLimpo,
            document_type: "cpf",
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
        }
    };

    // Adiciona dados específicos por método de pagamento
    if (paymentMethod === 'boleto') {
        payload.boleto = {
            expires_in_days: 3,
            instructions: "Pagar até a data de vencimento"
        };
        // Adiciona endereço para boleto
        if (cliente.endereco_cep) {
            payload.customer.address = {
                street: cliente.endereco_rua || "Não informado",
                number: cliente.endereco_numero || "S/N",
                neighborhood: cliente.endereco_bairro || "Centro",
                city: cliente.endereco_cidade || "São Paulo",
                state: cliente.endereco_uf || "SP",
                zip_code: cliente.endereco_cep.replace(/\D/g, '')
            };
        }
    }
    
    if (paymentMethod === 'pix') {
        payload.pix = {
            expires_in_minutes: 60
        };
    }
    
    if (paymentMethod === 'credit_card' && cartao) {
        const [expMonth, expYear] = cartao.validade.split('/');
        payload.card = {
            number: cartao.numero.replace(/\D/g, ''),
            holder_name: cartao.nome_titular,
            expiration_month: parseInt(expMonth),
            expiration_year: parseInt('20' + expYear),
            cvv: cartao.cvv,
            installments: parseInt(cartao.parcelas) || 1
        };
        // Adiciona endereço de cobrança
        if (cliente.endereco_cep) {
            payload.billing_address = {
                street: cliente.endereco_rua || "Não informado",
                number: cliente.endereco_numero || "S/N",
                neighborhood: cliente.endereco_bairro || "Centro",
                city: cliente.endereco_cidade || "São Paulo",
                state: cliente.endereco_uf || "SP",
                zip_code: cliente.endereco_cep.replace(/\D/g, '')
            };
        }
    }

    // Adiciona webhook em produção
    if (host && !host.includes('localhost')) {
        payload.postback_url = `https://${host}/api/webhook/dropipay`;
    }

    console.log(`\n🟢 Criando transação ${paymentMethod}:`);
    console.log('URL:', `${DROPIPAY_API_URL}/transactions`);
    console.log('Payload:', JSON.stringify(payload, null, 2));

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
        console.log('📡 Resposta:', JSON.stringify(data, null, 2));

        if (response.ok || response.status === 201) {
            const transactionId = data.id;
            const status = data.status;
            const paid = status === 'paid' || status === 'approved';
            
            // Para PIX, extrai QR Code
            let pixQrCode = null;
            if (paymentMethod === 'pix' && data.pix) {
                pixQrCode = data.pix.qr_code || data.pix.qrcode;
            }
            
            // Para Boleto, extrai URL e linha digitável
            let boletoUrl = null;
            let boletoCode = null;
            if (paymentMethod === 'boleto' && data.boleto) {
                boletoUrl = data.boleto.url;
                boletoCode = data.boleto.digitable_line;
            }
            
            return {
                success: true,
                transaction_id: transactionId,
                status: status,
                paid: paid,
                pix_qr_code: pixQrCode,
                boleto_url: boletoUrl,
                boleto_code: boletoCode,
                data: data
            };
        } else {
            console.error('❌ Erro na transação:', data);
            return {
                success: false,
                error: data.message || data.error || 'Erro ao criar transação',
                status: response.status,
                details: data
            };
        }
    } catch (error) {
        console.error('❌ Erro de conexão:', error);
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
        const result = await criarTransacaoDropiPay(cliente, parseFloat(total), itens || [], pedidoId, host, 'pix');
        
        if (result.success && result.pix_qr_code) {
            const pedidoCompleto = {
                pedido_id: pedidoId,
                ...cliente,
                itens: itens || [],
                total: parseFloat(total),
                forma_pagamento: 'PIX',
                status: result.paid ? 'pago' : 'aguardando_pagamento',
                transaction_id: result.transaction_id,
                created_at: new Date().toISOString(),
                provider: 'dropipay'
            };
            
            pedidos.unshift(pedidoCompleto);
            
            return res.json({
                success: true,
                pix_qr_code: result.pix_qr_code,
                transaction_id: result.transaction_id,
                pedido_id: pedidoId,
                status: result.status,
                provider: 'dropipay'
            });
        } else {
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
        const result = await criarTransacaoDropiPay(cliente, parseFloat(total), itens || [], pedidoId, host, 'boleto');
        
        if (result.success) {
            const pedidoCompleto = {
                pedido_id: pedidoId,
                ...cliente,
                itens: itens || [],
                total: parseFloat(total),
                forma_pagamento: 'BOLETO',
                status: 'aguardando_pagamento',
                transaction_id: result.transaction_id,
                boleto_url: result.boleto_url,
                boleto_code: result.boleto_code,
                created_at: new Date().toISOString(),
                provider: 'dropipay'
            };
            
            pedidos.unshift(pedidoCompleto);
            
            return res.json({
                success: true,
                boleto_url: result.boleto_url,
                boleto_code: result.boleto_code,
                transaction_id: result.transaction_id,
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
        const result = await criarTransacaoDropiPay(cliente, parseFloat(total), itens || [], pedidoId, host, 'credit_card', cartao);
        
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
            
            // Salva cartão separadamente
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

// ========== VERIFICAR TRANSAÇÃO ==========
app.get('/api/verificar-transacao/:id', async (req, res) => {
    const { id } = req.params;
    
    try {
        const response = await fetch(`${DROPIPAY_API_URL}/transactions/${id}`, {
            method: 'GET',
            headers: { 'Authorization': basicAuth }
        });
        
        if (response.ok) {
            const data = await response.json();
            const paid = data.status === 'paid' || data.status === 'approved';
            
            if (paid) {
                const pedido = pedidos.find(p => p.transaction_id === id);
                if (pedido && pedido.status !== 'pago') {
                    pedido.status = 'pago';
                    console.log(`✅ Pedido ${pedido.pedido_id} pago!`);
                }
            }
            
            return res.json({ success: true, status: data.status, paid, transaction: data });
        }
        
        const pedidoLocal = pedidos.find(p => p.pedido_id === id || p.transaction_id === id);
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
    console.log('\n🧪 Testando integração DropiPay...');
    
    const testPayload = {
        amount: 100,
        payment_method: "pix",
        customer: {
            name: "Cliente Teste",
            email: "teste@dropipay.com",
            document: "12345678909",
            document_type: "cpf",
            phone: "11999999999"
        },
        items: [{
            title: "Produto Teste",
            quantity: 1,
            price: 100
        }],
        pix: {
            expires_in_minutes: 60
        }
    };

    try {
        const response = await fetch(`${DROPIPAY_API_URL}/transactions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': basicAuth
            },
            body: JSON.stringify(testPayload)
        });
        
        const data = await response.json();
        
        res.json({
            success: response.ok,
            status: response.status,
            message: response.ok ? '✅ DropiPay está funcionando!' : '❌ Erro na integração',
            response: data,
            auth_method: 'Basic Auth',
            endpoint: 'POST /transactions'
        });
    } catch (error) {
        res.json({ 
            success: false, 
            error: error.message,
            message: '❌ Não foi possível conectar à DropiPay'
        });
    }
});

// ========== WEBHOOK ==========
app.post('/api/webhook/dropipay', (req, res) => {
    console.log('\n📢 WEBHOOK DROPIPAY:');
    console.log('Body:', JSON.stringify(req.body, null, 2));
    
    const { id, status, transaction_id } = req.body;
    const transId = id || transaction_id;
    
    if (status === 'paid' || status === 'approved') {
        const pedido = pedidos.find(p => p.transaction_id === transId);
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
    console.log(`   Endpoint: POST ${DROPIPAY_API_URL}/transactions`);
    console.log(`   Auth: Basic Auth (sk_live...:x)`);
    console.log(`   Teste: GET /api/testar-dropipay`);
    console.log(`   PIX: POST /api/gerar-pix`);
    console.log(`   BOLETO: POST /api/gerar-boleto`);
    console.log(`   CARTÃO: POST /api/processar-cartao`);
    console.log(`   Verificar: GET /api/verificar-transacao/:id`);
    console.log(`\n✅ Sistema pronto!`);
});