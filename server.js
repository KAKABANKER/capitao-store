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

// ========== FUNÇÃO GERAR PIX DROPIPAY ==========
async function gerarPixDropiPay(cliente, total, itens, pedidoId, host) {
    const cpfLimpo = cliente.cliente_cpf ? cliente.cliente_cpf.replace(/\D/g, '') : '';
    const telefoneLimpo = cliente.cliente_telefone ? cliente.cliente_telefone.replace(/\D/g, '') : '';
    const amountInCents = Math.round(total * 100);
    
    // Payload conforme documentação da DropiPay
    const payload = {
        amount: amountInCents,
        currency: "BRL",
        payment_method: "pix",
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
        },
        expires_in: 3600 // 60 minutos
    };

    if (host && !host.includes('localhost')) {
        payload.webhook_url = `https://${host}/api/webhook/dropipay`;
    }

    console.log('\n🟢 Enviando para DropiPay API:');
    console.log(`URL: ${DROPIPAY_API_URL}/pix/charge`);
    console.log('Payload:', JSON.stringify(payload, null, 2));

    try {
        const response = await fetch(`${DROPIPAY_API_URL}/pix/charge`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${DROPIPAY_SECRET_KEY}`,
                'X-API-Key': DROPIPAY_SECRET_KEY
            },
            body: JSON.stringify(payload)
        });

        const data = await response.json();
        console.log('📡 Resposta DropiPay:', JSON.stringify(data, null, 2));

        if (response.ok || response.status === 201) {
            const pixCode = data.qr_code || data.pix_qr_code || data.qrcode || data.qr_code_base64;
            const transactionHash = data.id || data.transaction_id || data.hash;
            
            return {
                success: true,
                pix_qr_code: pixCode,
                transaction_hash: transactionHash,
                status: data.status,
                expires_at: data.expires_at,
                data: data
            };
        } else {
            console.error('❌ Erro DropiPay:', data);
            return {
                success: false,
                error: data.message || data.error || 'Erro ao gerar PIX',
                status: response.status,
                details: data
            };
        }
    } catch (error) {
        console.error('❌ Erro de conexão:', error);
        return { success: false, error: error.message };
    }
}

// ========== FUNÇÃO GERAR PIX LOCAL (FALLBACK) ==========
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
    
    return {
        qr_code: pixPayload + '6304' + calculateCRC16(pixPayload + '6304'),
        transaction_hash: pedidoId,
        status: 'local_pending'
    };
}

// ========== ROTA PRINCIPAL PIX ==========
app.post('/api/gerar-pix', async (req, res) => {
    const { cliente, total, itens } = req.body;
    
    if (!cliente || !cliente.cliente_nome || !cliente.cliente_email || !total || total <= 0 || !itens || itens.length === 0) {
        return res.status(400).json({ success: false, error: 'Dados incompletos' });
    }

    const pedidoId = `CAP${Date.now()}`;
    const host = req.headers.host;
    
    console.log(`\n💰 NOVO PIX - Pedido: ${pedidoId} | Total: R$ ${total} | Cliente: ${cliente.cliente_nome}`);

    try {
        // Tenta gerar PIX via DropiPay
        const result = await gerarPixDropiPay(cliente, parseFloat(total), itens, pedidoId, host);
        
        if (result.success && result.pix_qr_code) {
            // Salva o pedido
            const pedidoCompleto = {
                pedido_id: pedidoId,
                cliente_nome: cliente.cliente_nome,
                cliente_email: cliente.cliente_email,
                cliente_cpf: cliente.cliente_cpf,
                cliente_telefone: cliente.cliente_telefone,
                endereco_cep: cliente.endereco_cep,
                endereco_rua: cliente.endereco_rua,
                endereco_numero: cliente.endereco_numero,
                endereco_bairro: cliente.endereco_bairro,
                endereco_cidade: cliente.endereco_cidade,
                endereco_uf: cliente.endereco_uf,
                itens: itens,
                total: parseFloat(total),
                forma_pagamento: 'PIX',
                status: 'aguardando_pagamento',
                transaction_hash: result.transaction_hash,
                created_at: new Date().toISOString(),
                provider: 'dropipay',
                expires_at: result.expires_at
            };
            
            if (!global.pedidosPendentes) global.pedidosPendentes = [];
            global.pedidosPendentes.push(pedidoCompleto);
            pedidos.unshift(pedidoCompleto);
            
            return res.json({
                success: true,
                pix_qr_code: result.pix_qr_code,
                transaction_hash: result.transaction_hash,
                pedido_id: pedidoId,
                provider: 'dropipay',
                expires_at: result.expires_at
            });
        } else {
            // Fallback para PIX local
            console.log('⚠️ DropiPay falhou, usando fallback local');
            const localPix = gerarPixLocal(parseFloat(total), pedidoId);
            
            const pedidoCompleto = {
                pedido_id: pedidoId,
                cliente_nome: cliente.cliente_nome,
                cliente_email: cliente.cliente_email,
                cliente_cpf: cliente.cliente_cpf,
                cliente_telefone: cliente.cliente_telefone,
                endereco_cep: cliente.endereco_cep,
                endereco_rua: cliente.endereco_rua,
                endereco_numero: cliente.endereco_numero,
                endereco_bairro: cliente.endereco_bairro,
                endereco_cidade: cliente.endereco_cidade,
                endereco_uf: cliente.endereco_uf,
                itens: itens,
                total: parseFloat(total),
                forma_pagamento: 'PIX',
                status: 'aguardando_pagamento_local',
                transaction_hash: localPix.transaction_hash,
                created_at: new Date().toISOString(),
                provider: 'local'
            };
            
            pedidos.unshift(pedidoCompleto);
            
            return res.json({
                success: true,
                pix_qr_code: localPix.qr_code,
                transaction_hash: localPix.transaction_hash,
                pedido_id: pedidoId,
                provider: 'local',
                warning: 'PIX local - Pagamento manual'
            });
        }
    } catch (error) {
        console.error('❌ Erro interno:', error);
        const localPix = gerarPixLocal(parseFloat(total), pedidoId);
        
        return res.json({
            success: true,
            pix_qr_code: localPix.qr_code,
            transaction_hash: localPix.transaction_hash,
            pedido_id: pedidoId,
            provider: 'local_fallback',
            warning: 'Erro na integração - PIX local'
        });
    }
});

// ========== ROTA PARA VERIFICAR STATUS DO PIX ==========
app.get('/api/verificar-pix/:transaction_hash', async (req, res) => {
    const { transaction_hash } = req.params;
    
    console.log(`\n🔍 Verificando PIX: ${transaction_hash}`);
    
    try {
        // Verifica na DropiPay
        const response = await fetch(`${DROPIPAY_API_URL}/transactions/${transaction_hash}`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${DROPIPAY_SECRET_KEY}`,
                'X-API-Key': DROPIPAY_SECRET_KEY
            }
        });
        
        if (response.ok) {
            const data = await response.json();
            const status = data.status;
            const paid = status === 'paid' || status === 'approved' || status === 'completed';
            
            if (paid) {
                const pedido = pedidos.find(p => p.transaction_hash === transaction_hash);
                if (pedido && pedido.status !== 'pago') {
                    pedido.status = 'pago';
                    pedido.pago_em = new Date().toISOString();
                    console.log(`✅ Pedido ${pedido.pedido_id} pago!`);
                }
            }
            
            return res.json({
                success: true,
                status: status,
                paid: paid,
                transaction: data
            });
        }
        
        // Verifica pedido local
        const pedidoLocal = pedidos.find(p => p.transaction_hash === transaction_hash);
        if (pedidoLocal && pedidoLocal.provider === 'local') {
            return res.json({
                success: true,
                status: pedidoLocal.status,
                paid: pedidoLocal.status === 'pago'
            });
        }
        
        return res.json({
            success: false,
            status: 'not_found',
            paid: false
        });
    } catch (error) {
        console.error('❌ Erro na verificação:', error);
        return res.json({
            success: false,
            error: error.message,
            paid: false
        });
    }
});

// ========== ROTA DE TESTE DROPIPAY ==========
app.get('/api/testar-dropipay', async (req, res) => {
    const resultados = {
        configuracao: {
            secret_key: DROPIPAY_SECRET_KEY ? `${DROPIPAY_SECRET_KEY.substring(0, 10)}...` : 'não configurada',
            public_key: DROPIPAY_PUBLIC_KEY ? `${DROPIPAY_PUBLIC_KEY.substring(0, 10)}...` : 'não configurada',
            api_url: DROPIPAY_API_URL
        },
        testes: []
    };
    
    // Teste 1: Verificar se a API está acessível
    try {
        const response = await fetch(`${DROPIPAY_API_URL}/health`, {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${DROPIPAY_SECRET_KEY}` }
        });
        
        resultados.testes.push({
            nome: 'API Health',
            status: response.status,
            ok: response.ok,
            mensagem: response.ok ? '✅ API acessível' : '⚠️ API respondeu com erro'
        });
    } catch (error) {
        resultados.testes.push({
            nome: 'API Health',
            error: error.message,
            mensagem: '❌ Não foi possível acessar a API'
        });
    }
    
    // Teste 2: Criar transação de teste (R$ 1,00)
    try {
        const testPayload = {
            amount: 100,
            currency: "BRL",
            payment_method: "pix",
            customer: {
                name: "Teste API",
                email: "teste@api.com",
                document: "12345678909",
                document_type: "cpf",
                phone: "11999999999"
            },
            items: [{
                title: "Teste Integração",
                quantity: 1,
                price: 100
            }]
        };
        
        const response = await fetch(`${DROPIPAY_API_URL}/pix/charge`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${DROPIPAY_SECRET_KEY}`,
                'X-API-Key': DROPIPAY_SECRET_KEY
            },
            body: JSON.stringify(testPayload)
        });
        
        const data = await response.json();
        
        resultados.testes.push({
            nome: 'Criar Transação',
            status: response.status,
            ok: response.ok,
            transaction_id: data.id || data.transaction_id,
            mensagem: response.ok ? '✅ Transação criada com sucesso!' : '❌ Falha ao criar transação'
        });
    } catch (error) {
        resultados.testes.push({
            nome: 'Criar Transação',
            error: error.message
        });
    }
    
    res.json(resultados);
});

// ========== WEBHOOK PARA RECEBER CONFIRMAÇÕES ==========
app.post('/api/webhook/dropipay', (req, res) => {
    console.log('\n📢 WEBHOOK DROPIPAY:');
    console.log('Headers:', JSON.stringify(req.headers, null, 2));
    console.log('Body:', JSON.stringify(req.body, null, 2));
    
    const { transaction_id, status, amount } = req.body;
    
    if (status === 'paid' || status === 'approved' || status === 'completed') {
        const pedido = pedidos.find(p => p.transaction_hash === transaction_id);
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
    res.json({ success: true, provider: 'DropiPay', pix_key: DROPIPAY_PUBLIC_KEY });
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
    console.log(`   URL: ${DROPIPAY_API_URL}`);
    console.log(`   Secret Key: ${DROPIPAY_SECRET_KEY.substring(0, 10)}...`);
    console.log(`   Public Key: ${DROPIPAY_PUBLIC_KEY.substring(0, 10)}...`);
    console.log(`   Teste: http://localhost:${PORT}/api/testar-dropipay`);
    console.log(`\n✅ Sistema pronto com DropiPay!`);
});const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static('public'));
app.use('/admin', express.static('admin'));

// ========== CONFIGURAÇÃO DROPIPAY ==========
const DROPIPAY_SECRET_KEY = 'sk_live_v2gPmrt0gu9lcqIvD5rV8FoJIqPwuDEexpCd5s1kSO';
const DROPIPAY_PUBLIC_KEY = 'pk_live_v2BEfRjbmvi1DlDG1QOl9Zu6kDCOWvV4Rr';
const DROPIPAY_API_URL = 'https://api.dropipay.com.br/v1';

// ========== FUNÇÃO GERAR PIX DROPIPAY ==========
async function gerarPixDropiPay(cliente, total, itens, pedidoId, host) {
    const cpfLimpo = cliente.cliente_cpf ? cliente.cliente_cpf.replace(/\D/g, '') : '';
    const telefoneLimpo = cliente.cliente_telefone ? cliente.cliente_telefone.replace(/\D/g, '') : '';
    const amountInCents = Math.round(total * 100);
    
    // Payload conforme documentação da DropiPay
    const payload = {
        amount: amountInCents,
        currency: "BRL",
        payment_method: "pix",
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
        },
        expires_in: 3600 // 60 minutos
    };

    if (host && !host.includes('localhost')) {
        payload.webhook_url = `https://${host}/api/webhook/dropipay`;
    }

    console.log('\n🟢 Enviando para DropiPay API:');
    console.log(`URL: ${DROPIPAY_API_URL}/pix/charge`);
    console.log('Payload:', JSON.stringify(payload, null, 2));

    try {
        const response = await fetch(`${DROPIPAY_API_URL}/pix/charge`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${DROPIPAY_SECRET_KEY}`,
                'X-API-Key': DROPIPAY_SECRET_KEY
            },
            body: JSON.stringify(payload)
        });

        const data = await response.json();
        console.log('📡 Resposta DropiPay:', JSON.stringify(data, null, 2));

        if (response.ok || response.status === 201) {
            const pixCode = data.qr_code || data.pix_qr_code || data.qrcode || data.qr_code_base64;
            const transactionHash = data.id || data.transaction_id || data.hash;
            
            return {
                success: true,
                pix_qr_code: pixCode,
                transaction_hash: transactionHash,
                status: data.status,
                expires_at: data.expires_at,
                data: data
            };
        } else {
            console.error('❌ Erro DropiPay:', data);
            return {
                success: false,
                error: data.message || data.error || 'Erro ao gerar PIX',
                status: response.status,
                details: data
            };
        }
    } catch (error) {
        console.error('❌ Erro de conexão:', error);
        return { success: false, error: error.message };
    }
}

// ========== FUNÇÃO GERAR PIX LOCAL (FALLBACK) ==========
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
    
    return {
        qr_code: pixPayload + '6304' + calculateCRC16(pixPayload + '6304'),
        transaction_hash: pedidoId,
        status: 'local_pending'
    };
}

// ========== ROTA PRINCIPAL PIX ==========
app.post('/api/gerar-pix', async (req, res) => {
    const { cliente, total, itens } = req.body;
    
    if (!cliente || !cliente.cliente_nome || !cliente.cliente_email || !total || total <= 0 || !itens || itens.length === 0) {
        return res.status(400).json({ success: false, error: 'Dados incompletos' });
    }

    const pedidoId = `CAP${Date.now()}`;
    const host = req.headers.host;
    
    console.log(`\n💰 NOVO PIX - Pedido: ${pedidoId} | Total: R$ ${total} | Cliente: ${cliente.cliente_nome}`);

    try {
        // Tenta gerar PIX via DropiPay
        const result = await gerarPixDropiPay(cliente, parseFloat(total), itens, pedidoId, host);
        
        if (result.success && result.pix_qr_code) {
            // Salva o pedido
            const pedidoCompleto = {
                pedido_id: pedidoId,
                cliente_nome: cliente.cliente_nome,
                cliente_email: cliente.cliente_email,
                cliente_cpf: cliente.cliente_cpf,
                cliente_telefone: cliente.cliente_telefone,
                endereco_cep: cliente.endereco_cep,
                endereco_rua: cliente.endereco_rua,
                endereco_numero: cliente.endereco_numero,
                endereco_bairro: cliente.endereco_bairro,
                endereco_cidade: cliente.endereco_cidade,
                endereco_uf: cliente.endereco_uf,
                itens: itens,
                total: parseFloat(total),
                forma_pagamento: 'PIX',
                status: 'aguardando_pagamento',
                transaction_hash: result.transaction_hash,
                created_at: new Date().toISOString(),
                provider: 'dropipay',
                expires_at: result.expires_at
            };
            
            if (!global.pedidosPendentes) global.pedidosPendentes = [];
            global.pedidosPendentes.push(pedidoCompleto);
            pedidos.unshift(pedidoCompleto);
            
            return res.json({
                success: true,
                pix_qr_code: result.pix_qr_code,
                transaction_hash: result.transaction_hash,
                pedido_id: pedidoId,
                provider: 'dropipay',
                expires_at: result.expires_at
            });
        } else {
            // Fallback para PIX local
            console.log('⚠️ DropiPay falhou, usando fallback local');
            const localPix = gerarPixLocal(parseFloat(total), pedidoId);
            
            const pedidoCompleto = {
                pedido_id: pedidoId,
                cliente_nome: cliente.cliente_nome,
                cliente_email: cliente.cliente_email,
                cliente_cpf: cliente.cliente_cpf,
                cliente_telefone: cliente.cliente_telefone,
                endereco_cep: cliente.endereco_cep,
                endereco_rua: cliente.endereco_rua,
                endereco_numero: cliente.endereco_numero,
                endereco_bairro: cliente.endereco_bairro,
                endereco_cidade: cliente.endereco_cidade,
                endereco_uf: cliente.endereco_uf,
                itens: itens,
                total: parseFloat(total),
                forma_pagamento: 'PIX',
                status: 'aguardando_pagamento_local',
                transaction_hash: localPix.transaction_hash,
                created_at: new Date().toISOString(),
                provider: 'local'
            };
            
            pedidos.unshift(pedidoCompleto);
            
            return res.json({
                success: true,
                pix_qr_code: localPix.qr_code,
                transaction_hash: localPix.transaction_hash,
                pedido_id: pedidoId,
                provider: 'local',
                warning: 'PIX local - Pagamento manual'
            });
        }
    } catch (error) {
        console.error('❌ Erro interno:', error);
        const localPix = gerarPixLocal(parseFloat(total), pedidoId);
        
        return res.json({
            success: true,
            pix_qr_code: localPix.qr_code,
            transaction_hash: localPix.transaction_hash,
            pedido_id: pedidoId,
            provider: 'local_fallback',
            warning: 'Erro na integração - PIX local'
        });
    }
});

// ========== ROTA PARA VERIFICAR STATUS DO PIX ==========
app.get('/api/verificar-pix/:transaction_hash', async (req, res) => {
    const { transaction_hash } = req.params;
    
    console.log(`\n🔍 Verificando PIX: ${transaction_hash}`);
    
    try {
        // Verifica na DropiPay
        const response = await fetch(`${DROPIPAY_API_URL}/transactions/${transaction_hash}`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${DROPIPAY_SECRET_KEY}`,
                'X-API-Key': DROPIPAY_SECRET_KEY
            }
        });
        
        if (response.ok) {
            const data = await response.json();
            const status = data.status;
            const paid = status === 'paid' || status === 'approved' || status === 'completed';
            
            if (paid) {
                const pedido = pedidos.find(p => p.transaction_hash === transaction_hash);
                if (pedido && pedido.status !== 'pago') {
                    pedido.status = 'pago';
                    pedido.pago_em = new Date().toISOString();
                    console.log(`✅ Pedido ${pedido.pedido_id} pago!`);
                }
            }
            
            return res.json({
                success: true,
                status: status,
                paid: paid,
                transaction: data
            });
        }
        
        // Verifica pedido local
        const pedidoLocal = pedidos.find(p => p.transaction_hash === transaction_hash);
        if (pedidoLocal && pedidoLocal.provider === 'local') {
            return res.json({
                success: true,
                status: pedidoLocal.status,
                paid: pedidoLocal.status === 'pago'
            });
        }
        
        return res.json({
            success: false,
            status: 'not_found',
            paid: false
        });
    } catch (error) {
        console.error('❌ Erro na verificação:', error);
        return res.json({
            success: false,
            error: error.message,
            paid: false
        });
    }
});

// ========== ROTA DE TESTE DROPIPAY ==========
app.get('/api/testar-dropipay', async (req, res) => {
    const resultados = {
        configuracao: {
            secret_key: DROPIPAY_SECRET_KEY ? `${DROPIPAY_SECRET_KEY.substring(0, 10)}...` : 'não configurada',
            public_key: DROPIPAY_PUBLIC_KEY ? `${DROPIPAY_PUBLIC_KEY.substring(0, 10)}...` : 'não configurada',
            api_url: DROPIPAY_API_URL
        },
        testes: []
    };
    
    // Teste 1: Verificar se a API está acessível
    try {
        const response = await fetch(`${DROPIPAY_API_URL}/health`, {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${DROPIPAY_SECRET_KEY}` }
        });
        
        resultados.testes.push({
            nome: 'API Health',
            status: response.status,
            ok: response.ok,
            mensagem: response.ok ? '✅ API acessível' : '⚠️ API respondeu com erro'
        });
    } catch (error) {
        resultados.testes.push({
            nome: 'API Health',
            error: error.message,
            mensagem: '❌ Não foi possível acessar a API'
        });
    }
    
    // Teste 2: Criar transação de teste (R$ 1,00)
    try {
        const testPayload = {
            amount: 100,
            currency: "BRL",
            payment_method: "pix",
            customer: {
                name: "Teste API",
                email: "teste@api.com",
                document: "12345678909",
                document_type: "cpf",
                phone: "11999999999"
            },
            items: [{
                title: "Teste Integração",
                quantity: 1,
                price: 100
            }]
        };
        
        const response = await fetch(`${DROPIPAY_API_URL}/pix/charge`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${DROPIPAY_SECRET_KEY}`,
                'X-API-Key': DROPIPAY_SECRET_KEY
            },
            body: JSON.stringify(testPayload)
        });
        
        const data = await response.json();
        
        resultados.testes.push({
            nome: 'Criar Transação',
            status: response.status,
            ok: response.ok,
            transaction_id: data.id || data.transaction_id,
            mensagem: response.ok ? '✅ Transação criada com sucesso!' : '❌ Falha ao criar transação'
        });
    } catch (error) {
        resultados.testes.push({
            nome: 'Criar Transação',
            error: error.message
        });
    }
    
    res.json(resultados);
});

// ========== WEBHOOK PARA RECEBER CONFIRMAÇÕES ==========
app.post('/api/webhook/dropipay', (req, res) => {
    console.log('\n📢 WEBHOOK DROPIPAY:');
    console.log('Headers:', JSON.stringify(req.headers, null, 2));
    console.log('Body:', JSON.stringify(req.body, null, 2));
    
    const { transaction_id, status, amount } = req.body;
    
    if (status === 'paid' || status === 'approved' || status === 'completed') {
        const pedido = pedidos.find(p => p.transaction_hash === transaction_id);
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
    res.json({ success: true, provider: 'DropiPay', pix_key: DROPIPAY_PUBLIC_KEY });
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
    console.log(`   URL: ${DROPIPAY_API_URL}`);
    console.log(`   Secret Key: ${DROPIPAY_SECRET_KEY.substring(0, 10)}...`);
    console.log(`   Public Key: ${DROPIPAY_PUBLIC_KEY.substring(0, 10)}...`);
    console.log(`   Teste: http://localhost:${PORT}/api/testar-dropipay`);
    console.log(`\n✅ Sistema pronto com DropiPay!`);
});