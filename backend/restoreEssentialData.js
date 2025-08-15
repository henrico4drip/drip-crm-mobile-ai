// Script para restaurar dados essenciais do sistema após limpeza acidental
const { db, admin } = require('./firebaseService');

async function restoreEssentialData() {
    console.log('🔄 Restaurando dados essenciais do sistema...');
    
    try {
        // 1. Criar usuário padrão
        console.log('\n👤 1. Criando usuário padrão...');
        const usuarioPadrao = {
            usuario_id: 'default-user-id',
            email: 'admin@sistema.com',
            whatsapp_comercial: '',
            ativo: true,
            criado_em: admin.firestore.FieldValue.serverTimestamp()
        };
        
        await db.collection('usuarios').doc('default-user-id').set(usuarioPadrao);
        console.log('✅ Usuário padrão criado com sucesso.');
        
        // 2. Verificar se há outras configurações necessárias
        console.log('\n🔍 2. Verificando estrutura do sistema...');
        
        // Verificar se as coleções principais existem
        const collections = ['usuarios', 'clientes'];
        for (const collectionName of collections) {
            const collectionRef = db.collection(collectionName);
            const snapshot = await collectionRef.limit(1).get();
            console.log(`  📁 Coleção '${collectionName}': ${snapshot.empty ? 'Vazia' : 'Contém dados'}`);
        }
        
        console.log('\n🎉 RESTAURAÇÃO CONCLUÍDA!');
        console.log('✨ Dados essenciais restaurados com sucesso.');
        console.log('📝 Agora você pode:');
        console.log('   - Fazer login no sistema com qualquer email/senha');
        console.log('   - Configurar seu WhatsApp comercial');
        console.log('   - O sistema criará automaticamente novos clientes conforme necessário');
        
    } catch (error) {
        console.error('❌ Erro durante a restauração:', error);
    } finally {
        process.exit(0);
    }
}

// Executa a restauração
restoreEssentialData();