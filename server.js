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

// Autenticação Basic Auth
const basicAuth = 'Basic ' + Buffer.from(`${DROPIPAY_SECRET_KEY}:x`).toString('base64');

// ========== FUNÇÃO GERAR PIX ==========
async function gerarPixDropiPay(cliente, total, itens, pedidoId, host) {
    const cpfLimpo = cliente.cliente_cpf ? cliente.cliente_cpf.replace(/\D/g, '') : '';
    const telefoneLimpo = cliente.cliente_telefone ? cliente.cliente_telefone.replace(/\D/g, '') : '';
    const amountInCents = Math.round(total * 100);
    
    const payload = {
        amount: amountInCents,
        currency: "BRL",
        paymentMethod: "pix", // CORRIGIDO: camelCase
        customer: {
            name: cliente.cliente_nome,
            email: cliente.cliente_email,
            document: cpfLimpo,
            documentType: "cpf", // CORRIGIDO: camelCase
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
        expiresIn: 3600 // CORRIGIDO: camelCase
    };

    if (host && !host.includes('localhost')) {
        payload.webhookUrl = `https://${host}/api/webhook/dropipay`; // CORRIGIDO: camelCase
    }

    console.log('\n🟢 Gerando PIX na DropiPay:');
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
            const pixCode = data.qrCode || data.qr_code || data.pixQrCode;
            const transactionHash = data.id || data.transactionId;
            
            return {
                success: true,
                pix_qr_code: pixCode,
                transaction_hash: transactionHash,
                status: data.status,
                data: data
            };
        } else {
            return { success: false, error: data.message, status: response.status };
        }
    } catch (error) {
        return { success: false, error: error.message };
    }
}

// ========== FUNÇÃO GERAR BOLETO ==========
async function gerarBoletoDropiPay(cliente, total, itens, pedidoId, host) {
    const cpfLimpo = cliente.cliente_cpf ? cliente.cliente_cpf.replace(/\D/g, '') : '';
    const telefoneLimpo = cliente.cliente_telefone ? cliente.cliente_telefone.replace(/\D/g, '') : '';
    const amountInCents = Math.round(total * 100);
    
    const payload = {
        amount: amountInCents,
        currency: "BRL",
        paymentMethod: "boleto",
        customer: {
            name: cliente.cliente_nome,
            email: cliente.cliente_email,
            document: cpfLimpo,
            documentType: "cpf",
            phone: telefoneLimpo || "11999999999",
            address: {
                street: cliente.endereco_rua || "",
                number: cliente.endereco_numero || "",
                neighborhood: cliente.endereco_bairro || "",
                city: cliente.endereco_cidade || "",
                state: cliente.endereco_uf || "",
                zipCode: cliente.endereco_cep ? cliente.endereco_cep.replace(/\D/g, '') : ""
            }
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
        expiresIn: 86400 // 3 dias para boleto
    };

    if (host && !host.includes('localhost')) {
        payload.webhookUrl = `https://${host}/api/webhook/dropipay`;
    }

    console.log('\n🟢 Gerando BOLETO na DropiPay:');
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
        console.log('📡 Resposta Boleto:', JSON.stringify(data, null, 2));

        if (response.ok || response.status === 201) {
            return {
                success: true,
                boleto_url: data.boletoUrl || data.boleto_url,
                boleto_pdf: data.boletoPdf,
                boleto_code: data.boletoCode || data.digitableLine,
                transaction_hash: data.id,
                status: data.status,
                data: data
            };
        } else {
            return { success: false, error: data.message, status: response.status };
        }
    } catch (error) {
        return { success: false, error: error.message };
    }
}

// ========== FUNÇÃO GERAR CARTÃO ==========
async function gerarCartaoDropiPay(cliente, total, itens, cartao, pedidoId, host) {
    const cpfLimpo = cliente.cliente_cpf ? cliente.cliente_cpf.replace(/\D/g, '') : '';
    const telefoneLimpo = cliente.cliente_telefone ? cliente.cliente_telefone.replace(/\D/g, '') : '';
    const amountInCents = Math.round(total * 100);
    
    const payload = {
        amount: amountInCents,
        currency: "BRL",
        paymentMethod: "credit_card",
        customer: {
            name: cliente.cliente_nome,
            email: cliente.cliente_email,
            document: cpfLimpo,
            documentType: "cpf",
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
            expMonth: parseInt(cartao.validade.split('/')[0]),
            expYear: parseInt('20' + cartao.validade.split('/')[1]),
            cvv: cartao.cvv,
            installments: cartao.parcelas || 1
        },
        billingAddress: {
            street: cliente.endereco_rua || "",
            number: cliente.endereco_numero || "",
            neighborhood: cliente.endereco_bairro || "",
            city: cliente.endereco_cidade || "",
            state: cliente.endereco_uf || "",
            zipCode: cliente.endereco_cep ? cliente.endereco_cep.replace(/\D/g, '') : ""
        },
        metadata: {
            order_id: pedidoId,
            customer_email: cliente.cliente_email
        }
    };

    if (host && !host.includes('localhost')) {
        payload.webhookUrl = `https://${host}/api/webhook/dropipay`;
    }

    console.log('\n🟢 Processando CARTÃO na DropiPay:');
    console.log('Payload (dados sensíveis ocultos):', {
        ...payload,
        creditCard: { ...payload.creditCard, number: '****' + payload.creditCard.number.slice(-4) }
    });

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
                transaction_hash: data.id,
                status: data.status,
                message: data.message || 'Transação processada',
                data: data
            };
        } else {
            return { success: false, error: data.message, status: response.status };
        }
    } catch (error) {
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

// ========== ROTA PRINCIPAL PIX ==========
app.post('/api/gerar-pix', async (req, res) => {
    const { cliente, total, itens } = req.body;
    
    if (!cliente || !cliente.cliente_nome || !cliente.cliente_email || !total || total <= 0) {
        return res.status(400).json({ success: false, error: 'Dados incompletos' });
    }

    const pedidoId = `CAP${Date.now()}`;
    const host = req.headers.host;
    
    console.log(`\n💰 PIX - Pedido: ${pedidoId} | Total: R$ ${total}`);

    try {
        const result = await gerarPixDropiPay(cliente, parseFloat(total), itens || [], pedidoId, host);
        
        if (result.success && result.pix_qr_code) {
            const pedidoCompleto = {
                pedido_id: pedidoId,
                ...cliente,
                itens: itens || [],
                total: parseFloat(total),
                forma_pagamento: 'PIX',
                status: 'aguardando_pagamento',
                transaction_hash: result.transaction_hash,
                created_at: new Date().toISOString(),
                provider: 'dropipay'
            };
            
            pedidos.unshift(pedidoCompleto);
            
            return res.json({
                success: true,
                pix_qr_code: result.pix_qr_code,
                transaction_hash: result.transaction_hash,
                pedido_id: pedidoId,
                provider: 'dropipay'
            });
        } else {
            const pixLocal = gerarPixLocal(parseFloat(total), pedidoId);
            
            const pedidoCompleto = {
                pedido_id: pedidoId,
                ...cliente,
                itens: itens || [],
                total: parseFloat(total),
                forma_pagamento: 'PIX',
                status: 'aguardando_pagamento_local',
                transaction_hash: pedidoId,
                created_at: new Date().toISOString(),
                provider: 'local'
            };
            
            pedidos.unshift(pedidoCompleto);
            
            return res.json({
                success: true,
                pix_qr_code: pixLocal,
                transaction_hash: pedidoId,
                pedido_id: pedidoId,
                provider: 'local',
                warning: 'PIX local - Pagamento manual'
            });
        }
    } catch (error) {
        const pixLocal = gerarPixLocal(parseFloat(total), pedidoId);
        return res.json({
            success: true,
            pix_qr_code: pixLocal,
            transaction_hash: pedidoId,
            pedido_id: pedidoId,
            provider: 'local_fallback'
        });
    }
});

// ========== ROTA GERAR BOLETO ==========
app.post('/api/gerar-boleto', async (req, res) => {
    const { cliente, total, itens } = req.body;
    
    if (!cliente || !cliente.cliente_nome || !cliente.cliente_email || !total) {
        return res.status(400).json({ success: false, error: 'Dados incompletos' });
    }

    const pedidoId = `CAP${Date.now()}`;
    const host = req.headers.host;

    try {
        const result = await gerarBoletoDropiPay(cliente, parseFloat(total), itens || [], pedidoId, host);
        
        if (result.success) {
            const pedidoCompleto = {
                pedido_id: pedidoId,
                ...cliente,
                itens: itens || [],
                total: parseFloat(total),
                forma_pagamento: 'BOLETO',
                status: 'aguardando_pagamento',
                transaction_hash: result.transaction_hash,
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
                transaction_hash: result.transaction_hash,
                pedido_id: pedidoId
            });
        } else {
            return res.json({ success: false, error: result.error });
        }
    } catch (error) {
        return res.status(500).json({ success: false, error: error.message });
    }
});

// ========== ROTA PROCESSAR CARTÃO ==========
app.post('/api/processar-cartao', async (req, res) => {
    const { cliente, total, itens, cartao } = req.body;
    
    if (!cliente || !cartao || !total) {
        return res.status(400).json({ success: false, error: 'Dados incompletos' });
    }

    const pedidoId = `CAP${Date.now()}`;
    const host = req.headers.host;

    try {
        const result = await gerarCartaoDropiPay(cliente, parseFloat(total), itens || [], cartao, pedidoId, host);
        
        if (result.success) {
            const pedidoCompleto = {
                pedido_id: pedidoId,
                ...cliente,
                itens: itens || [],
                total: parseFloat(total),
                forma_pagamento: 'CARTAO',
                status: result.status === 'paid' ? 'pago' : 'aguardando_pagamento',
                transaction_hash: result.transaction_hash,
                created_at: new Date().toISOString(),
                provider: 'dropipay'
            };
            
            pedidos.unshift(pedidoCompleto);
            
            return res.json({
                success: true,
                transaction_hash: result.transaction_hash,
                status: result.status,
                pedido_id: pedidoId,
                message: result.message
            });
        } else {
            return res.json({ success: false, error: result.error });
        }
    } catch (error) {
        return res.status(500).json({ success: false, error: error.message });
    }
});

// ========== VERIFICAR PAGAMENTO ==========
app.get('/api/verificar-pagamento/:transaction_hash', async (req, res) => {
    const { transaction_hash } = req.params;
    
    try {
        const response = await fetch(`${DROPIPAY_API_URL}/transactions/${transaction_hash}`, {
            method: 'GET',
            headers: { 'Authorization': basicAuth }
        });
        
        if (response.ok) {
            const data = await response.json();
            const paid = data.status === 'paid' || data.status === 'approved';
            
            if (paid) {
                const pedido = pedidos.find(p => p.transaction_hash === transaction_hash);
                if (pedido && pedido.status !== 'pago') {
                    pedido.status = 'pago';
                }
            }
            
            return res.json({ success: true, status: data.status, paid });
        }
        
        return res.json({ success: false, paid: false });
    } catch (error) {
        return res.json({ success: false, error: error.message });
    }
});

// ========== WEBHOOK ==========
app.post('/api/webhook/dropipay', (req, res) => {
    console.log('📢 Webhook:', req.body);
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
    console.log(`   ✅ PIX: /api/gerar-pix`);
    console.log(`   ✅ BOLETO: /api/gerar-boleto`);
    console.log(`   ✅ CARTÃO: /api/processar-cartao`);
    console.log(`   ✅ Verificar: /api/verificar-pagamento/:hash`);
    console.log(`\n📝 OBS: Seu coletor de dados permanece IDENTICO!`);
    console.log(`✅ Sistema pronto!`);
});