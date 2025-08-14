// backend/deleteUserData.js
const admin = require('firebase-admin');

// Certifique-se de que 'firebase-service-account.json' está no mesmo diretório
const serviceAccount = require('./firebase-service-account.json');

// Inicializa o Firebase Admin SDK APENAS UMA VEZ
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: "https://whatsapp-sales-assistant-default-rtdb.firebaseio.com" // Verifique se esta URL está correta
  });
}

const db = admin.firestore();

// =====================================================================
// ATENÇÃO: SUBSTITUA PELO SEU USUARIO_ID REAL ANTES DE EXECUTAR!
// =====================================================================
const TARGET_USER_ID = 'eC4EPe8wYYSi6CSW83iAQL5Iji93'; // Ex: 'eC4EPe8wYYSi6CSW83iAQL5Iji93'
// =====================================================================

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

async function deleteUserData(userId) {
    if (!userId || userId === 'SEU_USUARIO_ID_AQUI') {
        console.error('❌ Erro: Por favor, defina o TARGET_USER_ID no script.');
        process.exit(1);
    }

    console.log(`\n--- Iniciando exclusão de dados para o usuário: ${userId} ---`);

    try {
        // 1. Excluir todas as tarefas de todos os clientes deste usuário
        console.log('🔍 Buscando clientes para deletar suas tarefas...');
        const clientesSnapshot = await db.collection('clientes').where('usuario_id', '==', userId).get();
        console.log(`Encontrados ${clientesSnapshot.size} clientes associados.`);

        for (const clienteDoc of clientesSnapshot.docs) {
            const clienteId = clienteDoc.id;
            console.log(`  Excluindo tarefas do cliente: ${clienteId}...`);
            const tarefasRef = db.collection('clientes').doc(clienteId).collection('tarefas');
            await deleteCollection(tarefasRef);
            console.log(`  ✅ Tarefas do cliente ${clienteId} excluídas.`);
        }

        // 2. Excluir todos os documentos de clientes deste usuário
        console.log('🔍 Excluindo documentos de clientes...');
        const clientesRef = db.collection('clientes');
        const clientesQuery = clientesRef.where('usuario_id', '==', userId);
        await deleteCollection(clientesQuery);
        console.log('✅ Clientes excluídos.');

        // 3. Excluir o documento do usuário na coleção 'usuarios'
        console.log('🔍 Excluindo documento do usuário...');
        const userDocRef = db.collection('usuarios').doc(userId);
        await userDocRef.delete();
        console.log(`✅ Documento do usuário ${userId} excluído.`);

        console.log('\n--- Exclusão de dados concluída com sucesso! ---');
    } catch (error) {
        console.error('❌ Erro durante a exclusão de dados:', error);
    } finally {
        // Garante que o processo Node.js será encerrado após a execução
        process.exit(0);
    }
}

// Executa a função principal
deleteUserData(TARGET_USER_ID);

