// taskScheduler.js
const cron = require('node-cron');
const { activeBots, scanMessagesAndCreateTasks, enviarMensagem, findOperatorByPhone } = require('./botManager'); // Importa do botManager
const { db } = require('./firebaseService'); // Importa do firebaseService

// Função para agendar varreduras diárias e relatórios
async function setupDailyTasks() {
    console.log('🗓️ Configurando agendamento de tarefas diárias...');

    // --- Agenda de Varredura e Atualização às 9:00 AM ---
    cron.schedule('0 9 * * *', async () => { // Todos os dias, às 9:00 (H:M)
        console.log('⏰ Executando varredura e atualização de tarefas agendada (09:00)...');
        for (const [number, client] of activeBots.entries()) {
            console.log(`🔄 Varrendo novas mensagens para ${number} às 09:00...`);
            // É crucial que 'scanMessagesAndCreateTasks' seja otimizada para pegar apenas novas mensagens
            // Para a varredura agendada (isInitialScan = false).
            await scanMessagesAndCreateTasks(client, number, false);
        }
        console.log('✅ Varredura e atualização das 09:00 concluída.');
    }, {
        timezone: "America/Sao_Paulo" // Defina o fuso horário correto para o seu CRM
    });

    // --- Agenda de Varredura e Relatório às 17:00 PM ---
    cron.schedule('0 17 * * *', async () => { // Todos os dias, às 17:00 (H:M)
        console.log('⏰ Executando varredura e relatório de tarefas agendada (17:00)...');
        for (const [number, client] of activeBots.entries()) {
            console.log(`🔄 Varrendo novas mensagens e preparando relatório para ${number} às 17:00...`);
            await scanMessagesAndCreateTasks(client, number, false);

            // --- Lógica de Relatório e Sugestão para o Usuário ---
            const operatorUser = await findOperatorByPhone(number);
            if (!operatorUser) {
                console.warn(`Não foi possível encontrar operador para ${number} para enviar relatório.`);
                continue;
            }

            console.log(`📊 Preparando relatório para o operador: ${operatorUser.nome_completo} (${number})...`);

            const clientesDoOperadorSnapshot = await db.collection('clientes')
                .where('usuario_id', '==', operatorUser.usuario_id)
                .get();

            let totalTarefasDia = 0;
            let tarefasConcluidasDia = 0;
            let tarefasPendentesDia = [];

            for (const clienteDoc of clientesDoOperadorSnapshot.docs) {
                const tarefasSnapshot = await db.collection('clientes')
                    .doc(clienteDoc.id)
                    .collection('tarefas')
                    .where('data_criacao', '>', new Date(Date.now() - 24 * 60 * 60 * 1000)) // Últimas 24h
                    .get();

                tarefasSnapshot.docs.forEach(tarefaDoc => {
                    const tarefaData = tarefaDoc.data();
                    totalTarefasDia++;
                    if (tarefaData.status === 'concluida') {
                        tarefasConcluidasDia++;
                    } else if (tarefaData.status.includes('pendente')) {
                        tarefasPendentesDia.push({
                            clienteNome: clienteDoc.data().nome,
                            mensagem: tarefaData.mensagem_recebida.substring(0, 70) + '...',
                            data: tarefaData.timestamp_mensagem_original.toDate().toLocaleTimeString('pt-BR'),
                            ...tarefaData
                        });
                    }
                });
            }

            // Ordenar por data da mensagem original (mais antigas primeiro) para priorizar
            tarefasPendentesDia.sort((a, b) => a.timestamp_mensagem_original.toDate().getTime() - b.timestamp_mensagem_original.toDate().getTime());

            let relatorioMensagem = `Olá, ${operatorUser.nome_completo}! Seu resumo de tarefas do dia:\n\n`;
            relatorioMensagem += `📈 Total de mensagens processadas hoje: ${totalTarefasDia}\n`;
            relatorioMensagem += `✅ Tarefas concluídas: ${tarefasConcluidasDia}\n`;
            relatorioMensagem += `⏳ Tarefas pendentes: ${tarefasPendentesDia.length}\n\n`;

            if (tarefasPendentesDia.length > 0) {
                relatorioMensagem += '❗ Aqui estão as 3 tarefas mais antigas/urgentes que ficaram pendentes para você trabalhar:\n';
                tarefasPendentesDia.slice(0, 3).forEach((tarefa, index) => {
                    relatorioMensagem += `${index + 1}. Cliente ${tarefa.clienteNome} (${tarefa.data}): "${tarefa.mensagem}"\n`;
                });
                relatorioMensagem += '\n💡 Acesse seu CRM para ver todas as pendências e priorizar seu dia amanhã!';
            } else {
                relatorioMensagem += '🎉 Ótimas notícias! Todas as suas tarefas foram concluídas ou não há pendências recentes.\n';
                // Se não há pendentes, sugerir mensagens mais recentes para revisão
                const tarefasRecentesSnapshot = await db.collectionGroup('tarefas')
                    .where('status', '==', 'nova') // Ou outros status que indiquem mensagens para revisão
                    .where('metadata.from', '!=', 'null') // Para evitar mensagens do próprio bot
                    .where('data_criacao', '>', new Date(Date.now() - 48 * 60 * 60 * 1000)) // Últimas 48h
                    .orderBy('data_criacao', 'desc')
                    .limit(3)
                    .get();

                if (!tarefasRecentesSnapshot.empty) {
                    relatorioMensagem += 'Aqui estão 3 mensagens recentes que você pode querer revisar para acompanhamento:\n';
                    for (let i = 0; i < tarefasRecentesSnapshot.docs.length; i++) {
                        const tarefaDoc = tarefasRecentesSnapshot.docs[i];
                        const tarefaData = tarefaDoc.data();
                        // Precisamos do nome do cliente que está acima da subcoleção 'tarefas'
                        const clienteRef = tarefaDoc.ref.parent.parent;
                        if (clienteRef) {
                           const clienteDoc = await clienteRef.get();
                           if(clienteDoc.exists) {
                                relatorioMensagem += `${i + 1}. Cliente ${clienteDoc.data().nome}: "${tarefaData.mensagem_recebida.substring(0, 70)}..."\n`;
                           }
                        }
                    }
                } else {
                    relatorioMensagem += 'Tudo em dia! Que tal se planejar para amanhã?';
                }
            }

            // Enviar a mensagem de relatório para o WhatsApp comercial do operador
            if (client) { // Garante que o cliente do bot ainda está ativo
                await enviarMensagem(client, number, relatorioMensagem);
                console.log(`✅ Relatório de 17:00 enviado para o operador ${operatorUser.nome_completo}.`);
            } else {
                console.error(`Não foi possível enviar relatório para ${number}. Bot não ativo.`);
            }
        }
        console.log('✅ Varredura e relatório das 17:00 concluído.');
    }, {
        timezone: "America/Sao_Paulo"
    });

    console.log('🗓️ Agendamento de tarefas diárias ativado.');
}

module.exports = {
    setupDailyTasks
};
