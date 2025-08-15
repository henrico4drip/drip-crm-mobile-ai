// Script para apagar TODOS os dados do Firebase
const { db, admin } = require('./firebaseService');

async function deleteCollection(collectionRef, batchSize = 100) {
    let query = collectionRef.limit(batchSize);
    return new Promise((resolve, reject) => {
        deleteQueryBatch(query, resolve, reject);
    });
}

function deleteQueryBatch(query, resolve, reject) {
    query.get()
        .then((snapshot) => {
            // Quando não há mais documentos, terminamos.
            if (snapshot.size === 0) {
                return 0;
            }

            // Deleta documentos em lotes
            const batch = db.batch();
            snapshot.docs.forEach((doc) => {
                batch.delete(doc.ref);
            });

            return batch.commit().then(() => snapshot.size);
        })
        .then((numDeleted) => {
            if (numDeleted === 0) {
                resolve();
                return;
            }
            // Continua deletando até que não haja mais documentos
            process.nextTick(() => deleteQueryBatch(query, resolve, reject));
        })
        .catch(reject);
}

async function clearAllFirebaseData() {
    console.log('🚨 ATENÇÃO: Este script irá apagar TODOS os dados do Firebase!');
    console.log('⏳ Aguardando 5 segundos antes de iniciar...');
    
    // Aguardar 5 segundos para dar tempo de cancelar se necessário
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    console.log('\n🔥 Iniciando limpeza completa do Firebase...');

    try {
        // 1. Apagar todas as tarefas de todos os clientes
        console.log('\n📋 1. Apagando todas as tarefas...');
        const clientesSnapshot = await db.collection('clientes').get();
        console.log(`Encontrados ${clientesSnapshot.size} clientes com tarefas para apagar.`);
        
        for (const clienteDoc of clientesSnapshot.docs) {
            const clienteId = clienteDoc.id;
            console.log(`  🗑️ Apagando tarefas do cliente: ${clienteId}`);
            const tarefasRef = db.collection('clientes').doc(clienteId).collection('tarefas');
            await deleteCollection(tarefasRef);
            console.log(`  ✅ Tarefas do cliente ${clienteId} apagadas.`);
        }
        
        // 2. Apagar todos os clientes
        console.log('\n👤 2. Apagando todos os clientes...');
        const clientesRef = db.collection('clientes');
        await deleteCollection(clientesRef);
        console.log('✅ Todos os clientes apagados.');
        
        // 3. Apagar todos os usuários
        console.log('\n👥 3. Apagando todos os usuários...');
        const usuariosRef = db.collection('usuarios');
        await deleteCollection(usuariosRef);
        console.log('✅ Todos os usuários apagados.');
        
        // 4. Apagar coleção de nomes (se existir)
        console.log('\n📝 4. Apagando coleção de nomes...');
        const nomesRef = db.collection('nomes');
        await deleteCollection(nomesRef);
        console.log('✅ Coleção de nomes apagada.');
        
        // 5. Verificar outras coleções e apagar se necessário
        console.log('\n🔍 5. Verificando outras coleções...');
        const collections = await db.listCollections();
        for (const collection of collections) {
            const collectionName = collection.id;
            if (!['clientes', 'usuarios', 'nomes'].includes(collectionName)) {
                console.log(`  🗑️ Apagando coleção adicional: ${collectionName}`);
                await deleteCollection(collection);
                console.log(`  ✅ Coleção ${collectionName} apagada.`);
            }
        }
        
        console.log('\n🎉 LIMPEZA COMPLETA CONCLUÍDA!');
        console.log('✨ Todos os dados foram apagados do Firebase.');
        console.log('🔄 Agora você pode regenerar os dados corretamente.');
        
    } catch (error) {
        console.error('❌ Erro durante a limpeza:', error);
    } finally {
        process.exit(0);
    }
}

// Executa a limpeza completa
clearAllFirebaseData();