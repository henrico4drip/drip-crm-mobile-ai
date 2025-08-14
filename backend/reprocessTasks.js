// backend/reprocessTasks.js
const { db, admin } = require('./firebaseService');
const { gerarRespostaIA } = require('./aiService');
const { activeBots } = require('./botManager'); // Importa activeBots para acessar instâncias do Venom-Bot

/**
 * Reprocessa todas as tarefas pendentes para gerar/atualizar respostas de IA de forma consolidada.
 * Cria uma única tarefa de resumo por cliente com base nas últimas mensagens.
 * Esta função deve ser chamada de dentro do processo principal do backend (app.js)
 * para ter acesso às instâncias ativas do Venom-Bot.
 */
async function reprocessAllPendingTasks() {
    console.log('🔄 Iniciando reprocessamento e consolidação de tarefas pendentes...');

    try {
        // 1. Buscar todos os clientes
        const clientesSnapshot = await db.collection('clientes').get();
        console.log(`Encontrados ${clientesSnapshot.size} clientes.`);

        for (const clienteDoc of clientesSnapshot.docs) {
            const clienteId = clienteDoc.id;
            const clienteData = clienteDoc.data();
            const clienteTelefone = clienteData.telefone;
            const operatorUserId = clienteData.usuario_id;

            console.log(`\n--- Verificando cliente: ${clienteId} (Telefone: ${clienteTelefone}) ---`);
            console.log(`  Operator User ID associado: ${operatorUserId}`);

            if (!clienteTelefone || clienteTelefone.trim() === '') {
                console.log(`  --- Pulando cliente ${clienteId}: Telefone do cliente não encontrado ou vazio no Firestore. ---`);
                continue;
            }

            let operatorWhatsappNumber = null;
            if (operatorUserId) {
                const operatorDoc = await db.collection('usuarios').doc(operatorUserId).get();
                if (operatorDoc.exists) {
                    operatorWhatsappNumber = operatorDoc.data().whatsapp_comercial;
                    console.log(`  WhatsApp Comercial do Operador (${operatorUserId}): ${operatorWhatsappNumber}`);
                } else {
                    console.log(`  ❌ Documento do operador ${operatorUserId} NÃO encontrado na coleção 'usuarios'.`);
                }
            } else {
                console.log(`  ⚠️ Cliente ${clienteId} NÃO possui 'usuario_id' definido.`);
            }

            if (!operatorWhatsappNumber) {
                console.log(`  --- Pulando cliente ${clienteId}: 'whatsapp_comercial' do operador não encontrado ou vazio. ---`);
                continue;
            }

            if (!activeBots.has(operatorWhatsappNumber)) {
                console.log(`  --- Pulando cliente ${clienteId}: Bot para o operador ${operatorWhatsappNumber} NÃO está ativo no 'activeBots'. ---`);
                continue;
            }

            const venomClient = activeBots.get(operatorWhatsappNumber);
            if (!venomClient) {
                console.log(`  --- Pulando cliente ${clienteId}: Instância do Venom-Bot para ${operatorWhatsappNumber} é nula/indefinida. ---`);
                continue;
            }

            console.log(`\n--- Processando tarefas para o cliente: ${clienteId} (${clienteTelefone}) via bot ${operatorWhatsappNumber} ---`);

            // 2. Buscar TODAS as tarefas PENDENTES (originais e retroativas) para este cliente
            const pendingTasksQuery = db.collection('clientes').doc(clienteId).collection('tarefas')
                .where('status', 'in', ['pendente', 'pendente_retroativa'])
                .orderBy('data_criacao', 'asc'); // Ordena para pegar a mensagem mais antiga primeiro, para contexto

            const pendingTasksSnapshot = await pendingTasksQuery.get();
            
            if (pendingTasksSnapshot.empty) {
                console.log(`  Nenhuma tarefa pendente para consolidar para o cliente ${clienteId}.`);
                continue;
            }

            console.log(`  Encontradas ${pendingTasksSnapshot.size} tarefas pendentes para consolidar.`);

            let latestUnrespondedMessage = null;
            let latestOriginalMessageTimestamp = 0;
            const consolidatedTaskIds = [];

            // Encontra a última mensagem não respondida e coleta IDs para consolidação
            pendingTasksSnapshot.docs.forEach(taskDoc => {
                const taskData = taskDoc.data();
                const taskTimestamp = taskData.timestamp_mensagem_original ? taskData.timestamp_mensagem_original.toDate().getTime() : 0;

                if (taskTimestamp > latestOriginalMessageTimestamp) {
                    latestOriginalMessageTimestamp = taskTimestamp;
                    latestUnrespondedMessage = taskData.mensagem_recebida;
                }
                consolidatedTaskIds.push(taskDoc.id);
            });

            if (!latestUnrespondedMessage || latestUnrespondedMessage.trim() === '') {
                console.log(`  ⚠️ Cliente ${clienteId}: Última mensagem não respondida vazia, pulando consolidação.`);
                continue;
            }

            console.log(`  Última mensagem não respondida: "${latestUnrespondedMessage.substring(0, 50)}..."`);

            try {
                // Obter as últimas 30 mensagens do chat para contexto mais amplo
                const chatMessages = await venomClient.getAllMessagesInChat(`${clienteTelefone}@c.us`, true, false, 50); // Pega mais para filtrar
                
                // Filtra as mensagens para pegar as 30 mais recentes ANTES ou IGUAL ao timestamp da última mensagem não respondida
                const relevantHistory = chatMessages
                    .filter(msg => msg.timestamp * 1000 <= latestOriginalMessageTimestamp)
                    .sort((a, b) => a.timestamp - b.timestamp)
                    .slice(-30); // Pega as últimas 30 mensagens para contexto mais rico

                // Cria um resumo contextual da conversa completa
                const conversationSummary = relevantHistory
                    .map(msg => {
                        const sender = msg.fromMe ? 'Operador' : 'Cliente';
                        const timestamp = new Date(msg.timestamp * 1000).toLocaleString('pt-BR');
                        return `[${timestamp}] ${sender}: ${msg.body || '[Mensagem sem texto]'}`;
                    })
                    .join('\n');

                // Contexto completo para a IA incluindo histórico da conversa
                const fullContext = `HISTÓRICO DA CONVERSA:\n${conversationSummary}\n\nMENSAGENS NÃO RESPONDIDAS:\n${latestUnrespondedMessage}`;

                // Chama a IA com o contexto completo da conversa
                const novaRespostaIA = await gerarRespostaIA(fullContext, relevantHistory);

                // 3. Criar ou Atualizar a Tarefa de Resumo Consolidada
                const summaryTaskQuery = db.collection('clientes').doc(clienteId).collection('tarefas')
                    .where('status', '==', 'pendente_sumario')
                    .limit(1);
                
                const existingSummaryTaskSnapshot = await summaryTaskQuery.get();

                const summaryTaskData = {
                    mensagem_recebida: fullContext, // Contexto completo da conversa
                    mensagem_sugerida: novaRespostaIA,
                    status: 'pendente_sumario',
                    data_criacao: admin.firestore.FieldValue.serverTimestamp(),
                    timestamp_mensagem_original: admin.firestore.Timestamp.fromMillis(latestOriginalMessageTimestamp),
                    tags: ['venom-bot', 'ia-resumo', 'consolidado'],
                    follow_up: false,
                    metadata: {
                        cliente_telefone: clienteTelefone,
                        cliente_id: clienteId,
                        operator_user_id: operatorUserId,
                        consolidated_from_tasks: consolidatedTaskIds, // Guarda quais tarefas foram consolidadas
                        latest_original_message_id: pendingTasksSnapshot.docs.find(doc => doc.data().timestamp_mensagem_original.toDate().getTime() === latestOriginalMessageTimestamp)?.id // ID da mensagem original mais recente
                    },
                    reprocessado_ia: true,
                    data_reprocessamento: admin.firestore.FieldValue.serverTimestamp()
                };

                if (!existingSummaryTaskSnapshot.empty) {
                    // Atualiza a tarefa de resumo existente
                    const summaryTaskId = existingSummaryTaskSnapshot.docs[0].id;
                    await db.collection('clientes').doc(clienteId).collection('tarefas').doc(summaryTaskId).update(summaryTaskData);
                    console.log(`  ✅ Tarefa de resumo ${summaryTaskId} ATUALIZADA com nova resposta da IA.`);
                } else {
                    // Cria uma nova tarefa de resumo
                    const newSummaryTaskRef = await db.collection('clientes').doc(clienteId).collection('tarefas').add(summaryTaskData);
                    console.log(`  ✅ Nova tarefa de resumo ${newSummaryTaskRef.id} CRIADA com nova resposta da IA.`);
                }

                // 4. Marcar as tarefas originais como 'consolidada'
                for (const taskId of consolidatedTaskIds) {
                    await db.collection('clientes').doc(clienteId).collection('tarefas').doc(taskId).update({
                        status: 'consolidada',
                        data_consolidacao: admin.firestore.FieldValue.serverTimestamp()
                    });
                    console.log(`  ➡️ Tarefa original ${taskId} marcada como 'consolidada'.`);
                }

            } catch (iaError) {
                console.error(`  ❌ Erro ao gerar IA/consolidar para cliente ${clienteId}:`, iaError.message);
                // Opcional: Registrar o erro na tarefa de resumo se a IA falhar
                // Ou notificar que a consolidação falhou para este cliente
            }
        }
        console.log('\n✅ Reprocessamento e consolidação de tarefas pendentes concluído.');
    } catch (error) {
        console.error('❌ Erro geral no reprocessamento de tarefas:', error);
    }
}

module.exports = { reprocessAllPendingTasks };
