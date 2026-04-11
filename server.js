const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

// Diz para o Express servir os arquivos das pastas 'public' e 'admin'
app.use(express.json());
app.use(express.static('public'));
app.use('/admin', express.static('admin'));

// Rota para a página inicial (seu index.html)
app.get('/', (req, res) => {
    res.sendFile(__dirname + '/public/index.html');
});

// Rota para a página do admin
app.get('/admin', (req, res) => {
    res.sendFile(__dirname + '/admin/index.html');
});

// Rota da API que o seu index.html vai chamar para mostrar os produtos
app.get('/api/produtos', (req, res) => {
    // Enquanto o banco de dados não está conectado, a gente entrega esses produtos de mentirinha (mock)
    const produtosMock = [
        { id: 1, nome: "Camiseta Bolsonaro 2026", preco: 89.90, imagem: "https://placehold.co/600x800/f0ede5/8b6b3d?text=CAMISETA+2026" },
        { id: 2, nome: "Boné Exército e Fé", preco: 59.90, imagem: "https://placehold.co/600x800/e6dfd1/8b6b3d?text=BONÉ+PRETO" },
        { id: 3, nome: "Caneca Ordem e Progresso", preco: 39.90, imagem: "https://placehold.co/600x800/fff4e6/8b6b3d?text=CANECA" }
    ];
    res.json({ success: true, produtos: produtosMock });
});

// Inicia o servidor
app.listen(PORT, () => {
    console.log(`🚀 Servidor do Capitão rodando na porta ${PORT}`);
});
const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static('public'));
app.use('/admin', express.static('admin'));

// ========== ROTAS PÚBLICAS ==========

// Produtos
app.get('/api/produtos', (req, res) => {
    res.json({
        produtos: [
            { id: 1, nome: "Camiseta Bolsonaro 2026", preco: 89.90, preco_antigo: 129.90, imagem: "https://placehold.co/600x800/f0ede5/8b6b3d?text=CAMISETA+2026" },
            { id: 2, nome: "Boné Exército e Fé", preco: 59.90, preco_antigo: 89.90, imagem: "https://placehold.co/600x800/e6dfd1/8b6b3d?text=BONÉ+PRETO" },
            { id: 3, nome: "Caneca Ordem e Progresso", preco: 39.90, preco_antigo: 59.90, imagem: "https://placehold.co/600x800/fff4e6/8b6b3d?text=CANECA" }
        ]
    });
});

// Buscar CEP
app.get('/api/cep/:cep', async (req, res) => {
    const cep = req.params.cep.replace(/\D/g, '');
    if (cep.length !== 8) {
        return res.json({ error: 'CEP inválido' });
    }
    try {
        const response = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
        const data = await response.json();
        if (data.erro) {
            return res.json({ error: 'CEP não encontrado' });
        }
        res.json({
            success: true,
            logradouro: data.logradouro,
            bairro: data.bairro,
            cidade: data.localidade,
            uf: data.uf
        });
    } catch (error) {
        res.json({ error: 'Erro ao buscar CEP' });
    }
});

// Salvar pedido (simulação)
app.post('/api/pedido', (req, res) => {
    const pedidoId = 'CAP' + Date.now();
    console.log('Pedido recebido:', req.body);
    res.json({ success: true, pedido_id: pedidoId });
});

// ========== ROTAS ADMIN ==========

// Login
app.post('/api/admin/login', (req, res) => {
    const { username, password } = req.body;
    
    if (username === 'admin' && password === 'capitao2025') {
        res.json({ success: true, token: 'admin_auth_' + Date.now() });
    } else {
        res.status(401).json({ success: false, error: 'Credenciais inválidas' });
    }
});

// Listar pedidos (admin)
app.get('/api/admin/pedidos', (req, res) => {
    const token = req.headers.authorization;
    if (!token || !token.startsWith('Bearer admin_auth_')) {
        return res.status(401).json({ success: false });
    }
    
    // Retornar pedidos mockados para teste
    res.json({
        success: true,
        pedidos: [
            { id: 1, pedido_id: 'CAP1734567890', cliente_nome: 'João Silva', cliente_cpf: '123.456.789-00', endereco_rua: 'Rua A', endereco_numero: '123', total: 149.80, created_at: new Date().toISOString() },
            { id: 2, pedido_id: 'CAP1734567891', cliente_nome: 'Maria Santos', cliente_cpf: '987.654.321-00', endereco_rua: 'Rua B', endereco_numero: '456', total: 89.90, created_at: new Date().toISOString() }
        ]
    });
});

// Estatísticas (admin)
app.get('/api/admin/stats', (req, res) => {
    const token = req.headers.authorization;
    if (!token || !token.startsWith('Bearer admin_auth_')) {
        return res.status(401).json({ success: false });
    }
    
    res.json({
        success: true,
        stats: {
            pedidos: 15,
            vendas: 1250.00,
            clientes: 8
        }
    });
});

// Logs (admin)
app.get('/api/admin/logs', (req, res) => {
    const token = req.headers.authorization;
    if (!token || !token.startsWith('Bearer admin_auth_')) {
        return res.status(401).json({ success: false });
    }
    
    res.json({
        success: true,
        logs: [
            { ip: '189.45.23.1', tentativa: 'Login: admin', data: new Date().toISOString() },
            { ip: '189.45.23.2', tentativa: 'Tentativa inválida', data: new Date().toISOString() }
        ]
    });
});

// ========== INICIAR SERVIDOR ==========
app.listen(PORT, () => {
    console.log(`🚀 Servidor rodando na porta ${PORT}`);
    console.log(`🔐 Admin: http://localhost:${PORT}/admin`);
    console.log(`👤 Login: admin | Senha: capitao2025`);
});