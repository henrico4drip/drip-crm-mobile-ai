// Script para listar usuários do Firebase
const { db } = require('./firebaseService');

async function listUsers() {
    try {
        console.log('🔍 Listando usuários do Firebase...');
        
        const usuariosSnapshot = await db.collection('usuarios').get();
        
        if (usuariosSnapshot.empty) {
            console.log('❌ Nenhum usuário encontrado no Firestore');
            return;
        }
        
        console.log(`👥 Encontrados ${usuariosSnapshot.size} usuários:`);
        
        usuariosSnapshot.forEach((doc, index) => {
            const data = doc.data();
            console.log(`\n--- Usuário ${index + 1} ---`);
            console.log('ID:', doc.id);
            console.log('Email:', data.email || 'undefined');
            console.log('Nome:', data.nome || 'undefined');
            console.log('Telefone:', data.telefone || 'undefined');
            console.log('Campos disponíveis:', Object.keys(data));
        });
        
    } catch (error) {
        console.error('❌ Erro ao listar usuários:', error);
    }
}

listUsers().then(() => {
    console.log('✅ Listagem concluída');
    process.exit(0);
}).catch(error => {
    console.error('❌ Erro:', error);
    process.exit(1);
});