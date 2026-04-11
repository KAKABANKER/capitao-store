const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static('public'));
app.use('/admin', express.static('admin'));

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
    console.log('Pedido:', req.body);
    res.json({ success: true, pedido_id: pedidoId });
});

// ========== LOGIN ADMIN ==========
app.post('/api/admin/login', (req, res) => {
    const { username, password } = req.body;
    if (username === 'admin' && password === 'capitao2025') {
        res.json({ success: true, token: 'admin_auth_' + Date.now() });
    } else {
        res.status(401).json({ success: false, error: 'Credenciais inválidas' });
    }
});

// ========== LISTAR PEDIDOS (ADMIN) ==========
app.get('/api/admin/pedidos', (req, res) => {
    const token = req.headers.authorization;
    if (!token || !token.startsWith('Bearer admin_auth_')) {
        return res.status(401).json({ success: false });
    }
    res.json({
        success: true,
        pedidos: [
            { id: 1, pedido_id: 'CAP1734567890', cliente_nome: 'João Silva', cliente_cpf: '123.456.789-00', endereco_rua: 'Rua A', endereco_numero: '123', total: 149.80, created_at: new Date().toISOString() }
        ]
    });
});

// ========== ESTATÍSTICAS ==========
app.get('/api/admin/stats', (req, res) => {
    const token = req.headers.authorization;
    if (!token || !token.startsWith('Bearer admin_auth_')) {
        return res.status(401).json({ success: false });
    }
    res.json({ success: true, stats: { pedidos: 5, vendas: 500.00, clientes: 3 } });
});

// ========== LOGS ==========
app.get('/api/admin/logs', (req, res) => {
    const token = req.headers.authorization;
    if (!token || !token.startsWith('Bearer admin_auth_')) {
        return res.status(401).json({ success: false });
    }
    res.json({ success: true, logs: [] });
});

app.listen(PORT, () => {
    console.log(`🚀 Servidor rodando na porta ${PORT}`);
});