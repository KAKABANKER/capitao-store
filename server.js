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