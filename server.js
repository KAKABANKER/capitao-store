async function finalizarPedido() {
    // ... validações dos campos ...
    
    const pedidoData = {
        cliente_nome: nome,
        cliente_email: email,
        cliente_telefone: telefone,
        cliente_cpf: cpf,
        endereco_cep: cep,
        endereco_rua: rua,
        endereco_numero: numero,
        endereco_complemento: complemento,
        endereco_bairro: bairro,
        endereco_cidade: cidade,
        endereco_uf: uf,
        itens: carrinho.map(i => ({ id: i.id, nome: i.nome, preco: i.preco, quantidade: i.quantidade })),
        subtotal: total,
        total: total,
        forma_pagamento: paymentMethod === 'pix' ? 'PIX' : 'Credit Card'
    };
    
    document.getElementById('loadingOverlay').style.display = 'flex';
    
    try {
        const res = await fetch('/api/pedido', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(pedidoData)
        });
        const result = await res.json();
        
        document.getElementById('loadingOverlay').style.display = 'none';
        
        if (result.success) {
            localStorage.removeItem('carrinho');
            
            // Se for PIX e veio QR Code da gateway
            if (result.payment && result.payment.pix_qr_code_base64) {
                // Exibir QR Code da Plumify
                document.getElementById('pedidoIdDisplay').innerText = `Pedido #${result.pedido_id}`;
                document.getElementById('pixCode').innerText = result.payment.pix_qr_code;
                document.getElementById('pixQrImage').innerHTML = `<img src="data:image/png;base64,${result.payment.pix_qr_code_base64}" style="width:200px;height:200px;">`;
                document.getElementById('successOverlay').style.display = 'flex';
            } else {
                document.getElementById('pedidoIdDisplay').innerText = `Pedido #${result.pedido_id}`;
                document.getElementById('successOverlay').style.display = 'flex';
            }
        } else {
            alert('Erro ao processar pedido');
        }
    } catch (error) {
        document.getElementById('loadingOverlay').style.display = 'none';
        alert('Erro de conexão');
    }
}