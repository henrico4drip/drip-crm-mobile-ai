// Script para verificar a estrutura dos clientes no Firestore
const { db } = require('./firebaseService');

async function checkClients() {
    try {
        console.log('🔍 Verificando estrutura dos clientes no Firestore...');
        
        const clientesSnapshot = await db.collection('clientes').limit(5).get();
        
        if (clientesSnapshot.empty) {
            console.log('❌ Nenhum cliente encontrado no Firestore');
            return;
        }
        
        console.log(`📋 Encontrados ${clientesSnapshot.size} clientes (mostrando primeiros 5):`);
        
        clientesSnapshot.forEach((doc, index) => {
            const data = doc.data();
            console.log(`\n--- Cliente ${index + 1} (ID: ${doc.id}) ---`);
            console.log('Nome:', data.nome || 'undefined');
            console.log('Telefone:', data.telefone || 'undefined');
            console.log('Usuario ID:', data.usuario_id || 'undefined');
            console.log('Campos disponíveis:', Object.keys(data));
            console.log('Dados completos:', JSON.stringify(data, null, 2));
        });
        
    } catch (error) {
        console.error('❌ Erro ao verificar clientes:', error);
    }
}

checkClients().then(() => {
    console.log('✅ Verificação concluída');
    process.exit(0);
}).catch(error => {
    console.error('❌ Erro:', error);
    process.exit(1);
});