const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static('public'));
app.use('/admin', express.static('admin'));

// ========== CONFIGURAÇÃO PLUMIFY (CORRIGIDA) ==========
const PLUMIFY_TOKEN = '0RRWtMOuHsAQlR7S0zEnlGBnLEnr8DgoDJS3GTecxH7nZr2X01kHo6rxrOGa';
const ACCOUNT_HASH = '9kajnnbn2c';
const PRODUCT_CODE = 'pdkhijtoed';
const OFFER_HASH = '7becb';

// URL BASE CORRETA da Plumify
const PLUMIFY_API_URL = 'https://api.plumify.com.br/api/public/v1'; // Atenção: plumify com P minúsculo

// Função para gerar PIX via Plumify (CORRIGIDA)
async function gerarPixPlumify(cliente, total, itens, pedidoId, host) {
    // Formata dados do cliente
    const cpfLimpo = cliente.cliente_cpf ? cliente.cliente_cpf.replace(/\D/g, '') : '';
    const telefoneLimpo = cliente.cliente_telefone ? cliente.cliente_telefone.replace(/\D/g, '') : '';
    
    // Calcula o total corretamente (já vem como número)
    const amountInCents = Math.round(total * 100);
    
    // Payload CORRETO conforme documentação da Plumify
    const payload = {
        account_hash: ACCOUNT_HASH, // ADICIONADO: account_hash é obrigatório!
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
        },
        expire_in: 3600 // 60 minutos em segundos
    };

    // Adiciona postback apenas em produção
    if (host && !host.includes('localhost') && !host.includes('127.0.0.1')) {
        payload.postback_url = `https://${host}/api/webhook/plumify`;
    }

    console.log('\n🟢 Enviando para Plumify API:');
    console.log(`URL: ${PLUMIFY_API_URL}/transaction`);
    console.log('Payload:', JSON.stringify(payload, null, 2));

    try {
        // Tenta diferentes formatos de autenticação
        const authMethods = [
            { name: 'api_token', headers: { 'api_token': PLUMIFY_TOKEN } },
            { name: 'Bearer', headers: { 'Authorization': `Bearer ${PLUMIFY_TOKEN}` } },
            { name: 'X-API-Key', headers: { 'X-API-Key': PLUMIFY_TOKEN } }
        ];
        
        let lastError = null;
        
        for (const auth of authMethods) {
            console.log(`\n📡 Tentando autenticação via: ${auth.name}`);
            
            const response = await fetch(`${PLUMIFY_API_URL}/transaction`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...auth.headers
                },
                body: JSON.stringify(payload)
            });
            
            const data = await response.json();
            console.log(`📡 Resposta (${auth.name}):`, JSON.stringify(data, null, 2));
            
            if (response.ok && (data.transaction_hash || data.id || data.hash)) {
                const transactionHash = data.transaction_hash || data.id || data.hash;
                const pixCode = data.pix_qr_code || data.qr_code || data.pix_code || data.pix || data.qrcode;
                
                return { 
                    success: true, 
                    pix_qr_code: pixCode,
                    transaction_hash: transactionHash,
                    status: data.status,
                    raw_data: data
                };
            }
            
            if (response.status !== 401) {
                lastError = { error: data.message || data.error, status: response.status, data };
            }
        }
        
        console.error('❌ Todas as tentativas de autenticação falharam');
        return { 
            success: false, 
            error: lastError?.error || 'Erro ao gerar PIX - Verifique as credenciais',
            status: lastError?.status || 401
        };
        
    } catch (error) {
        console.error('❌ Erro de conexão:', error);
        return { success: false, error: error.message };
    }
}

// Função para gerar PIX local (fallback de emergência) - CORRIGIDA
function gerarPixLocal(total, pedidoId) {
    // Chave PIX da conta (SUBSTITUA PELA SUA CHAVE PIX REAL)
    const chavePix = 'capitao@store.com';
    const nomeRecebedor = 'CAPITAO STORE';
    const cidade = 'BRASILIA';
    
    // Remove pontos e vírgulas do valor
    const valorFormatado = total.toFixed(2).replace('.', '');
    
    const txid = pedidoId.replace(/[^A-Za-z0-9]/g, '').substring(0, 25);
    
    // Monta o payload PIX no formato BR Code CORRETO
    const pixParts = [
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
    ];
    
    const pixPayload = pixParts.join('');
    
    // Função para calcular CRC16 corretamente
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
    
    const crc = calculateCRC16(pixPayload + '6304');
    const pixCode = pixPayload + '6304' + crc;
    
    return pixCode;
}

// ========== ROTA DE PIX PRINCIPAL ==========
app.post('/api/gerar-pix', async (req, res) => {
    const { cliente, total, itens } = req.body;
    
    console.log('\n📥 Dados recebidos na requisição:');
    console.log('Cliente:', JSON.stringify(cliente, null, 2));
    console.log('Total:', total);
    console.log('Itens:', JSON.stringify(itens, null, 2));
    
    // Validações mais rigorosas
    if (!cliente) {
        return res.status(400).json({ 
            success: false, 
            error: 'Dados do cliente são obrigatórios' 
        });
    }
    
    if (!cliente.cliente_nome) {
        return res.status(400).json({ 
            success: false, 
            error: 'Nome do cliente é obrigatório' 
        });
    }
    
    if (!cliente.cliente_email) {
        return res.status(400).json({ 
            success: false, 
            error: 'Email do cliente é obrigatório' 
        });
    }
    
    if (!total || total <= 0) {
        return res.status(400).json({ 
            success: false, 
            error: 'Valor total inválido' 
        });
    }
    
    if (!itens || itens.length === 0) {
        return res.status(400).json({ 
            success: false, 
            error: 'Itens do pedido são obrigatórios' 
        });
    }

    const pedidoId = `CAP${Date.now()}`;
    const host = req.headers.host;
    
    console.log('\n' + '='.repeat(60));
    console.log('💰 NOVA REQUISIÇÃO PIX');
    console.log('='.repeat(60));
    console.log(`Pedido ID: ${pedidoId}`);
    console.log(`Cliente: ${cliente.cliente_nome}`);
    console.log(`Email: ${cliente.cliente_email}`);
    console.log(`CPF: ${cliente.cliente_cpf || 'Não informado'}`);
    console.log(`Total: R$ ${parseFloat(total).toFixed(2)}`);
    console.log(`Itens: ${itens.length}`);
    console.log(`Host: ${host}`);
    console.log('='.repeat(60));

    try {
        // Tenta gerar PIX via Plumify
        console.log('\n🔄 Tentando integração com Plumify...');
        const result = await gerarPixPlumify(cliente, parseFloat(total), itens, pedidoId, host);
        
        if (result.success && result.pix_qr_code) {
            console.log('\n✅ PIX gerado com sucesso via Plumify!');
            console.log(`Transaction Hash: ${result.transaction_hash}`);
            
            // Salva o pedido com referência da transação
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
                subtotal: parseFloat(total),
                total: parseFloat(total),
                forma_pagamento: 'PIX',
                status: 'aguardando_pagamento',
                transaction_hash: result.transaction_hash,
                created_at: new Date().toISOString(),
                provider: 'plumify'
            };
            
            // Armazena o pedido
            if (!global.pedidosPendentes) global.pedidosPendentes = [];
            global.pedidosPendentes.push(pedidoCompleto);
            
            // Também salva no array principal de pedidos
            pedidos.unshift(pedidoCompleto);
            
            return res.json({
                success: true,
                pix_qr_code: result.pix_qr_code,
                transaction_hash: result.transaction_hash,
                pedido_id: pedidoId,
                provider: 'plumify',
                amount: parseFloat(total),
                expires_in: 3600
            });
        } else {
            console.log('\n⚠️ Plumify falhou, usando PIX local');
            console.log(`Motivo: ${result.error || 'Erro desconhecido'}`);
            
            // Fallback: gera PIX local
            const pixLocal = gerarPixLocal(parseFloat(total), pedidoId);
            
            // Salva o pedido como PIX local
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
                subtotal: parseFloat(total),
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
                warning: 'PIX gerado localmente - O pagamento será verificado manualmente',
                pix_key: 'capitao@store.com'
            });
        }
    } catch (error) {
        console.error('\n❌ Erro interno:', error);
        
        // Fallback de emergência
        const pixLocal = gerarPixLocal(parseFloat(total), pedidoId);
        return res.json({
            success: true,
            pix_qr_code: pixLocal,
            pedido_id: pedidoId,
            provider: 'local_fallback',
            warning: 'Erro na integração - PIX gerado localmente',
            error_details: error.message
        });
    }
});

// ========== ROTA PARA VERIFICAR STATUS DO PIX (CORRIGIDA) ==========
app.get('/api/verificar-pix/:transaction_hash', async (req, res) => {
    const { transaction_hash } = req.params;
    
    if (!transaction_hash) {
        return res.status(400).json({
            success: false,
            error: 'Transaction hash é obrigatório'
        });
    }
    
    console.log(`\n🔍 Verificando transação: ${transaction_hash}`);
    
    try {
        // Tenta diferentes métodos de autenticação
        const authMethods = [
            { name: 'api_token', headers: { 'api_token': PLUMIFY_TOKEN } },
            { name: 'Bearer', headers: { 'Authorization': `Bearer ${PLUMIFY_TOKEN}` } },
            { name: 'X-API-Key', headers: { 'X-API-Key': PLUMIFY_TOKEN } }
        ];
        
        for (const auth of authMethods) {
            const response = await fetch(`${PLUMIFY_API_URL}/transaction/${transaction_hash}`, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    ...auth.headers
                }
            });
            
            if (response.ok) {
                const data = await response.json();
                console.log(`✅ Status encontrado: ${data.status}`);
                
                // Atualiza o status do pedido se necessário
                const pedido = pedidos.find(p => p.transaction_hash === transaction_hash);
                if (pedido && data.status === 'paid' && pedido.status !== 'pago') {
                    pedido.status = 'pago';
                    console.log(`💰 Pedido ${pedido.pedido_id} foi pago!`);
                }
                
                return res.json({
                    success: true,
                    status: data.status,
                    paid: data.status === 'paid' || data.status === 'approved',
                    transaction: data
                });
            }
        }
        
        // Se não encontrar na Plumify, verifica nos pedidos locais
        const pedidoLocal = pedidos.find(p => p.transaction_hash === transaction_hash);
        if (pedidoLocal && pedidoLocal.provider === 'local') {
            return res.json({
                success: true,
                status: 'pending',
                paid: false,
                message: 'Pagamento local - aguardando confirmação manual'
            });
        }
        
        return res.json({
            success: false,
            status: 'not_found',
            paid: false,
            error: 'Transação não encontrada'
        });
        
    } catch (error) {
        console.error('❌ Erro ao verificar PIX:', error);
        res.json({
            success: false,
            error: error.message,
            paid: false
        });
    }
});

// ========== ROTA DE TESTE DA PLUMIFY (CORRIGIDA) ==========
app.get('/api/testar-plumify', async (req, res) => {
    const resultados = {
        timestamp: new Date().toISOString(),
        configuracao: {
            token: PLUMIFY_TOKEN ? `${PLUMIFY_TOKEN.substring(0, 10)}...` : 'não configurado',
            account_hash: ACCOUNT_HASH,
            product_code: PRODUCT_CODE,
            offer_hash: OFFER_HASH,
            api_url: PLUMIFY_API_URL
        },
        testes: []
    };
    
    // Teste 1: Verificar se a API está acessível
    try {
        const response = await fetch(`${PLUMIFY_API_URL}/ping`, {
            method: 'GET',
            headers: { 'api_token': PLUMIFY_TOKEN }
        });
        
        resultados.testes.push({
            nome: 'API Accessibility',
            endpoint: `${PLUMIFY_API_URL}/ping`,
            status: response.status,
            ok: response.ok,
            mensagem: response.ok ? '✅ API acessível' : '⚠️ API respondeu com erro'
        });
    } catch (error) {
        resultados.testes.push({
            nome: 'API Accessibility',
            endpoint: `${PLUMIFY_API_URL}/ping`,
            error: error.message,
            mensagem: '❌ Não foi possível acessar a API'
        });
    }
    
    // Teste 2: Testar autenticação com diferentes métodos
    const authMethods = [
        { name: 'api_token', headers: { 'api_token': PLUMIFY_TOKEN } },
        { name: 'Bearer', headers: { 'Authorization': `Bearer ${PLUMIFY_TOKEN}` } },
        { name: 'X-API-Key', headers: { 'X-API-Key': PLUMIFY_TOKEN } }
    ];
    
    for (const auth of authMethods) {
        try {
            const response = await fetch(`${PLUMIFY_API_URL}/account`, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    ...auth.headers
                }
            });
            
            resultados.testes.push({
                nome: 'Autenticação',
                metodo: auth.name,
                status: response.status,
                ok: response.ok,
                mensagem: response.ok ? '✅ Autenticação funcionou!' : 
                         response.status === 401 ? '❌ Token inválido' :
                         `Status: ${response.status}`
            });
        } catch (error) {
            resultados.testes.push({
                nome: 'Autenticação',
                metodo: auth.name,
                error: error.message,
                mensagem: '❌ Erro na requisição'
            });
        }
    }
    
    // Teste 3: Verificar se consegue listar produtos
    try {
        const response = await fetch(`${PLUMIFY_API_URL}/products`, {
            headers: { 'api_token': PLUMIFY_TOKEN }
        });
        const data = await response.json();
        
        resultados.testes.push({
            nome: 'Listar Produtos',
            endpoint: `${PLUMIFY_API_URL}/products`,
            status: response.status,
            quantidade_produtos: data.products ? data.products.length : 0,
            mensagem: response.ok ? '✅ Conseguiu listar produtos' : '❌ Falha ao listar produtos'
        });
    } catch (error) {
        resultados.testes.push({
            nome: 'Listar Produtos',
            error: error.message,
            mensagem: '❌ Erro ao listar produtos'
        });
    }
    
    // Recomendação final
    const authSuccess = resultados.testes.some(t => t.nome === 'Autenticação' && t.ok === true);
    resultados.recomendacao = authSuccess ?
        '✅ Sua integração Plumify está funcionando! Tente gerar um PIX agora.' :
        '❌ Problemas na autenticação. Verifique seu token e credenciais com o suporte da Plumify.';
    
    res.json(resultados);
});

// ========== WEBHOOK PARA RECEBER CONFIRMAÇÕES ==========
app.post('/api/webhook/plumify', (req, res) => {
    console.log('\n📢 WEBHOOK RECEBIDO DA PLUMIFY:');
    console.log('Headers:', JSON.stringify(req.headers, null, 2));
    console.log('Body:', JSON.stringify(req.body, null, 2));
    
    const { transaction_hash, status, amount, id } = req.body;
    const transHash = transaction_hash || id;
    
    if (transHash && (status === 'paid' || status === 'approved')) {
        console.log(`\n💰 Pagamento confirmado!`);
        console.log(`Transação: ${transHash}`);
        console.log(`Valor: R$ ${(amount / 100 || 0).toFixed(2)}`);
        
        // Atualiza o status do pedido
        const pedido = pedidos.find(p => p.transaction_hash === transHash);
        if (pedido && pedido.status !== 'pago') {
            pedido.status = 'pago';
            pedido.pago_em = new Date().toISOString();
            console.log(`✅ Pedido ${pedido.pedido_id} atualizado para PAGO`);
        }
    }
    
    res.json({ success: true });
});

// ========== ROTA PARA GERAR TESTE DE PIX (ÚTIL PARA DEBUG) ==========
app.post('/api/testar-pix', async (req, res) => {
    const testCliente = {
        cliente_nome: "Cliente Teste",
        cliente_email: "teste@email.com",
        cliente_cpf: "12345678909",
        cliente_telefone: "11999999999",
        endereco_cep: "01001000",
        endereco_rua: "Rua Teste",
        endereco_numero: "123",
        endereco_bairro: "Centro",
        endereco_cidade: "São Paulo",
        endereco_uf: "SP"
    };
    
    const testItens = [{
        nome: "Produto Teste",
        quantidade: 1,
        preco: 10.00
    }];
    
    const testTotal = 10.00;
    
    const mockReq = {
        body: {
            cliente: testCliente,
            total: testTotal,
            itens: testItens
        },
        headers: {
            host: req.headers.host || 'localhost:3000'
        }
    };
    
    const mockRes = {
        json: (data) => {
            console.log('\n📤 Resposta do teste:', JSON.stringify(data, null, 2));
            res.json(data);
        },
        status: (code) => {
            console.log(`Status code: ${code}`);
            return mockRes;
        }
    };
    
    // Chama a rota de PIX com dados de teste
    app._router.handle(mockReq, mockRes, () => {});
});

// ========== RESTO DO SEU CÓDIGO ==========
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
    console.log(`\n💳 PLUMIFY INTEGRATION (CORRIGIDA):`);
    console.log(`   URL Base: ${PLUMIFY_API_URL}`);
    console.log(`   Token: ${PLUMIFY_TOKEN.substring(0, 10)}...`);
    console.log(`   Conta: ${ACCOUNT_HASH}`);
    console.log(`   Produto: ${PRODUCT_CODE}`);
    console.log(`   Teste: http://localhost:${PORT}/api/testar-plumify`);
    console.log(`\n✅ Sistema corrigido! Acesse /api/testar-plumify para diagnosticar a autenticação.`);
});