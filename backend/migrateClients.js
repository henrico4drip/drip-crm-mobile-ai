// Script para migrar clientes órfãos para usuários válidos
const { db } = require('./firebaseService');

async function migrateOrphanClients() {
    try {
        console.log('🔄 Iniciando migração de clientes órfãos...');
        
        // Buscar usuários válidos
        const usuariosSnapshot = await db.collection('usuarios').get();
        const usuariosValidos = usuariosSnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));
        
        console.log('👥 Usuários válidos encontrados:', usuariosValidos.length);
        usuariosValidos.forEach(user => {
            console.log(`  - ${user.email} (${user.id})`);
        });
        
        if (usuariosValidos.length === 0) {
            console.log('❌ Nenhum usuário válido encontrado!');
            return;
        }
        
        // Usar o primeiro usuário válido como padrão
        const usuarioPadrao = usuariosValidos[0];
        console.log(`🎯 Usuário padrão selecionado: ${usuarioPadrao.email} (${usuarioPadrao.id})`);
        
        // Buscar clientes órfãos
        const clientesSnapshot = await db.collection('clientes').get();
        const clientesOrfaos = [];
        
        for (const clienteDoc of clientesSnapshot.docs) {
            const clienteData = clienteDoc.data();
            const usuarioExiste = usuariosValidos.some(user => user.id === clienteData.usuario_id);
            
            if (!usuarioExiste) {
                clientesOrfaos.push({
                    id: clienteDoc.id,
                    ...clienteData
                });
            }
        }
        
        console.log(`🔍 Clientes órfãos encontrados: ${clientesOrfaos.length}`);
        
        if (clientesOrfaos.length === 0) {
            console.log('✅ Nenhum cliente órfão encontrado!');
            return;
        }
        
        // Migrar clientes órfãos
        let batch = db.batch();
        let contador = 0;
        let batchCount = 0;
        
        for (const cliente of clientesOrfaos) {
            const clienteRef = db.collection('clientes').doc(cliente.id);
            batch.update(clienteRef, {
                usuario_id: usuarioPadrao.id
            });
            contador++;
            
            // Executar batch a cada 500 operações (limite do Firestore)
            if (contador % 500 === 0) {
                await batch.commit();
                batchCount++;
                console.log(`📦 Batch ${batchCount} executado (${contador} clientes migrados)`);
                batch = db.batch(); // Criar novo batch
            }
        }
        
        // Executar batch final se houver operações pendentes
        if (contador % 500 !== 0) {
            await batch.commit();
            batchCount++;
            console.log(`📦 Batch final ${batchCount} executado`);
        }
        
        console.log(`✅ Migração concluída! ${contador} clientes migrados para ${usuarioPadrao.email}`);
        
    } catch (error) {
        console.error('❌ Erro na migração:', error);
    }
}

// Executar se chamado diretamente
if (require.main === module) {
    migrateOrphanClients().then(() => {
        console.log('🏁 Script finalizado');
        process.exit(0);
    }).catch(error => {
        console.error('💥 Erro fatal:', error);
        process.exit(1);
    });
}

module.exports = { migrateOrphanClients };