// botManager.js
const venom = require('venom-bot');
const admin = require('firebase-admin');
const axios = require('axios');
const cron = require('node-cron');
const { db } = require('./firebaseService');
const { gerarRespostaIA } = require('./aiService');

const activeBots = new Map();
const RUN_RETROACTIVE_SCAN_ON_STARTUP = true;

async function findOperatorByPhone(phoneNumber) {
    try {
        console.log('🔍 Buscando operador para o número:', phoneNumber);
        const usuariosRef = db.collection('usuarios');
        const query = usuariosRef.where('whatsapp_comercial', '==', phoneNumber);
        const snapshot = await query.get();

        if (!snapshot.empty) {
            const userDoc = snapshot.docs[0];
            return { ...userDoc.data(), usuario_id: userDoc.data().usuario_id || userDoc.id };
        }

        const variations = [`55${phoneNumber}`, phoneNumber.replace(/^55/, ''), `+55${phoneNumber}`, phoneNumber.replace(/^\+55/, '')];
        for (const variation of variations) {
            const queryVariation = usuariosRef.where('whatsapp_comercial', '==', variation);
            const snapshotVariation = await queryVariation.get();
            if (!snapshotVariation.empty) {
                const userDoc = snapshotVariation.docs[0];
                return { ...userDoc.data(), usuario_id: userDoc.data().usuario_id || userDoc.id };
            }
        }
        return null;
    } catch (error) {
        console.error('❌ Erro ao buscar operador:', error);
        return null;
    }
}

async function getOrCreateClient(telefone, nome, operatorUserId) {
    try {
        telefone = telefone.trim().replace(/[^0-9]/g, '');
        const clientesRef = db.collection('clientes');
        const query = clientesRef.where('usuario_id', '==', operatorUserId).where('telefone', '==', telefone);
        const snapshot = await query.get();

        if (!snapshot.empty) {
            const doc = snapshot.docs[0];
            return { cliente_id: doc.id, ...doc.data() };
        }

        const novoCliente = {
            telefone,
            nome: nome || `Cliente ${telefone}`,
            usuario_id: operatorUserId,
            timestamp_ultima_mensagem: admin.firestore.FieldValue.serverTimestamp(),
            criado_em: admin.firestore.FieldValue.serverTimestamp(),
            // Novos campos para ranking
            total_tarefas_resumo_geradas: 0,
            total_tarefas_resumo_convertidas: 0,
            taxa_conversao: 0
        };
        const docRef = await clientesRef.add(novoCliente);
        console.log(`✅ Cliente ${docRef.id} criado com sucesso.`);
        return { cliente_id: docRef.id, ...novoCliente };
    } catch (error) {
        console.error('❌ Erro ao obter/criar cliente:', error);
        throw error;
    }
}

// Função auxiliar para recalcular a taxa de conversão do cliente
async function updateClientConversionMetrics(clienteId) {
    const clienteRef = db.collection('clientes').doc(clienteId);
    try {
        console.log(`🔍 Iniciando atualização de métricas para cliente ${clienteId}...`);
        
        const tarefasSnapshot = await clienteRef.collection('tarefas')
            .where('status', 'in', ['pendente_sumario', 'enviada', 'concluída']) // Contamos as geradas/ativas
            .get();

        console.log(`📋 Total de tarefas encontradas: ${tarefasSnapshot.size}`);

        let generated = 0;
        let converted = 0;
        const statusCounts = {};

        tarefasSnapshot.forEach(doc => {
            const status = doc.data().status;
            statusCounts[status] = (statusCounts[status] || 0) + 1;
            
            if (status === 'pendente_sumario' || status === 'enviada' || status === 'concluída') {
                generated++;
            }
            if (status === 'enviada' || status === 'concluída') {
                converted++;
            }
        });

        console.log(`📊 Contagem por status:`, statusCounts);
        
        const taxaConversao = generated > 0 ? (converted / generated) * 100 : 0;

        await clienteRef.update({
            total_tarefas_resumo_geradas: generated,
            total_tarefas_resumo_convertidas: converted,
            taxa_conversao: taxaConversao
        });
        
        console.log(`✅ Métricas atualizadas para cliente ${clienteId}:`);
        console.log(`   - Tarefas Geradas: ${generated}`);
        console.log(`   - Tarefas Convertidas: ${converted}`);
        console.log(`   - Taxa de Conversão: ${taxaConversao.toFixed(2)}%`);
        
    } catch (error) {
        console.error(`❌ Erro ao atualizar métricas de conversão para cliente ${clienteId}:`, error);
        throw error;
    }
}


// Função para criar tarefa contextualizada com histórico completo
async function createContextualizedTask(clienteId, unrespondedMessages, chatHistory, isRetroactive = false) {
    try {
        if (!clienteId || !unrespondedMessages.length) {
            console.error('❌ createContextualizedTask: clienteId ou mensagens não respondidas inválidas.');
            return;
        }

        // Pega as últimas 30 mensagens para contexto mais amplo
        const contextHistory = chatHistory
            .sort((a, b) => a.timestamp - b.timestamp)
            .slice(-30); // Últimas 30 mensagens para contexto mais rico

        // Cria um resumo contextual da conversa completa
        const conversationSummary = contextHistory
            .map(msg => {
                const sender = msg.fromMe ? 'Operador' : 'Cliente';
                const timestamp = new Date(msg.timestamp * 1000).toLocaleString('pt-BR');
                return `[${timestamp}] ${sender}: ${msg.body || '[Mensagem sem texto]'}`;
            })
            .join('\n');

        // Agrupa todas as mensagens não respondidas
        const allUnrespondedText = unrespondedMessages
            .map(msg => msg.body || '')
            .filter(text => text.trim())
            .join('\n\n');

        // Contexto completo para a IA incluindo histórico da conversa
        const fullContext = `HISTÓRICO DA CONVERSA:\n${conversationSummary}\n\nMENSAGENS NÃO RESPONDIDAS:\n${allUnrespondedText}`;

        // Gera resposta da IA com contexto completo da conversa
        const iaResult = await gerarRespostaIA(fullContext, contextHistory);
        const iaResposta = typeof iaResult === 'object' ? iaResult.resposta : iaResult;
        const prioridade = typeof iaResult === 'object' ? iaResult.prioridade : 5;

        // Pega a mensagem mais recente para metadados
        const latestMessage = unrespondedMessages[unrespondedMessages.length - 1];

        // Validar e limpar dados antes de salvar
        const cleanMetadata = {
            message_ids: unrespondedMessages.map(msg => msg.id || '').filter(id => id),
            from: String(latestMessage.from || ''),
            type: 'contextual_conversation_summary',
            notify_name: String(latestMessage.notifyName || ''),
            is_retroactive: Boolean(isRetroactive),
            total_messages: Number(unrespondedMessages.length) || 0,
            context_messages: Number(contextHistory.length) || 0,
            conversation_summary: String(conversationSummary || ''),
            unresponded_messages: String(allUnrespondedText || '')
        };

        // Validar timestamp antes de criar Date
        const validTimestamp = latestMessage.timestamp && !isNaN(latestMessage.timestamp) ? 
            latestMessage.timestamp : Date.now() / 1000;

        const tarefa = {
            mensagem_recebida: String(fullContext || ''), // Contexto completo da conversa
            mensagem_sugerida: String(iaResposta || ''),
            status: isRetroactive ? 'pendente_retroativa' : 'pendente_sumario',
            data_criacao: admin.firestore.FieldValue.serverTimestamp(),
            timestamp_mensagem_original: new Date(validTimestamp * 1000),
            tags: ['venom-bot', 'contextualizada', 'conversa-completa'],
            follow_up: false,
            prioridade: Number(prioridade) || 5,
            metadata: cleanMetadata
        };

        if (isRetroactive) {
            tarefa.tags.push('retroativa');
        } else {
            tarefa.tags.push('nova');
        }

        console.log(`🚀 Criando tarefa contextualizada para cliente ${clienteId}:`);
        console.log(`   - Mensagens não respondidas: ${unrespondedMessages.length}`);
        console.log(`   - Mensagens de contexto: ${contextHistory.length}`);
        console.log(`   - Status: ${tarefa.status}`);
        console.log(`   - É retroativa: ${isRetroactive}`);
        
        const tarefaRef = await db.collection('clientes').doc(clienteId).collection('tarefas').add(tarefa);
        console.log(`✅ Tarefa contextualizada criada com sucesso: ${tarefaRef.id} para cliente: ${clienteId}`);

        // Atualiza timestamp da última mensagem
        const clienteDocRef = db.collection('clientes').doc(clienteId);
        const clienteDoc = await clienteDocRef.get();
        const currentLastTimestamp = clienteDoc.data()?.timestamp_ultima_mensagem?.toDate()?.getTime() || 0;
        const messageTimestampMs = latestMessage.timestamp * 1000;

        if (messageTimestampMs > currentLastTimestamp) {
            await clienteDocRef.update({
                ultima_mensagem: latestMessage.body || '',
                timestamp_ultima_mensagem: admin.firestore.FieldValue.serverTimestamp()
            });
            console.log(`⏱️ Timestamp da última mensagem atualizado para cliente ${clienteId}.`);
        }
        
        // Atualiza métricas de conversão após criar a tarefa
        console.log(`📊 Atualizando métricas de conversão após criar tarefa...`);
        await updateClientConversionMetrics(clienteId);
        
        return tarefaRef.id;
    } catch (error) {
        console.error(`❌ Erro CRÍTICO ao criar tarefa contextualizada para cliente ${clienteId}:`, error.message, error.code || '', error.details || '');
        console.error('Detalhes do erro:', JSON.stringify(error, null, 2));
        throw error;
    }
}

// Função legacy mantida para compatibilidade
async function saveMensagemAsTarefa(clienteId, message, isRetroactive = false) {
    try {
        if (!clienteId) {
            console.error('❌ saveMensagemAsTarefa: clienteId é nulo ou indefinido. Não é possível salvar a tarefa.');
            return;
        }
        
        // Nesta versão, a IA é chamada apenas com o corpo da mensagem individual.
        // O histórico é passado apenas no reprocessTasks.js
        const iaResult = await gerarRespostaIA(message.body || '');
        const iaResposta = typeof iaResult === 'object' ? iaResult.resposta : iaResult;
        const prioridade = typeof iaResult === 'object' ? iaResult.prioridade : 5; 

        // Validar e limpar dados antes de salvar
        const cleanMetadata = {
            message_id: String(message.id || ''),
            from: String(message.from || ''),
            type: String(message.type || ''),
            notify_name: String(message.notifyName || ''),
            is_retroactive: Boolean(isRetroactive)
        };

        // Validar timestamp antes de criar Date
        const validTimestamp = message.timestamp && !isNaN(message.timestamp) ? 
            message.timestamp : Date.now() / 1000;

        const tarefa = {
            mensagem_recebida: String(message.body || ''),
            mensagem_sugerida: String(iaResposta || ''),
            status: isRetroactive ? 'pendente_retroativa' : 'pendente',
            data_criacao: admin.firestore.FieldValue.serverTimestamp(),
            timestamp_mensagem_original: new Date(validTimestamp * 1000),
            prioridade: Number(prioridade) || 5,
            tags: ['venom-bot', 'recebida'],
            follow_up: false,
            metadata: cleanMetadata
        };

        if (isRetroactive) {
            tarefa.tags.push('retroativa');
        } else {
            tarefa.tags.push('nova');
        }

        const tarefaRef = await db.collection('clientes').doc(clienteId).collection('tarefas').add(tarefa);
        console.log('📝 Tarefa criada com sucesso:', tarefaRef.id, 'para cliente:', clienteId);

        const clienteDocRef = db.collection('clientes').doc(clienteId);
        const clienteDoc = await clienteDocRef.get();
        const currentLastTimestamp = clienteDoc.data()?.timestamp_ultima_mensagem?.toDate()?.getTime() || 0;
        const messageTimestampMs = message.timestamp * 1000;

        if (messageTimestampMs > currentLastTimestamp) {
            await clienteDocRef.update({
                ultima_mensagem: message.body || '',
                timestamp_ultima_mensagem: admin.firestore.FieldValue.serverTimestamp()
            });
            console.log(`⏱️ Timestamp da última mensagem atualizado para cliente ${clienteId}.`);
        }
        return tarefaRef.id;
    } catch (error) {
        console.error(`❌ Erro CRÍTICO ao salvar tarefa para cliente ${clienteId}:`, error.message, error.code || '', error.details || '');
        console.error('Detalhes do erro:', JSON.stringify(error, null, 2));
        throw error;
    }
}

async function enviarMensagem(client, telefone, mensagem) {
    try {
        const chatId = `${telefone}@c.us`;
        await client.sendText(chatId, mensagem);
        console.log('✅ Mensagem enviada para:', telefone);
    } catch (error) {
        console.error('❌ Erro ao enviar mensagem:', error);
        throw error;
    }
}

async function scanMessagesAndCreateTasks(client, whatsappNumber, isInitialScan = false) {
    console.log(`🔍 Iniciando varredura de mensagens CONTEXTUALIZADA para ${whatsappNumber} (Inicial: ${isInitialScan})...`);

    let clientes = [];
    try {
        const operatorUser = await findOperatorByPhone(whatsappNumber);
        if (!operatorUser) {
            console.warn(`Operador para ${whatsappNumber} não encontrado. Ignorando varredura.`);
            return;
        }
        const clientesSnapshot = await db.collection('clientes').where('usuario_id', '==', operatorUser.usuario_id).get();
        clientes = clientesSnapshot.docs.map(doc => ({ cliente_id: doc.id, ...doc.data() }));
    } catch (error) {
        console.error(`❌ Erro ao buscar clientes para varredura de ${whatsappNumber}:`, error);
        return;
    }

    if (clientes.length === 0) {
        console.log(`Nenhum cliente encontrado para ${whatsappNumber} para realizar a varredura.`);
        return;
    }

    console.log(`Encontrados ${clientes.length} clientes para ${whatsappNumber}. Processando histórico contextualizado...`);

    for (const cliente of clientes) {
        // Extrair telefone do ID do documento (formato: numero@c.us) ou usar o nome se for numérico
        const telefoneFromId = cliente.cliente_id ? cliente.cliente_id.replace('@c.us', '') : null;
        const telefoneFromNome = cliente.nome && /^\d+$/.test(cliente.nome) ? cliente.nome : null;
        const telefone = cliente.telefone || telefoneFromId || telefoneFromNome;
        
        if (!telefone) {
            console.log(`   ⚠️ Não foi possível determinar o telefone para o cliente ${cliente.nome} (ID: ${cliente.cliente_id}). Pulando...`);
            continue;
        }
        
        const clientPhoneNumber = telefone + '@c.us';
        console.log(`\n--- Processando histórico CONTEXTUALIZADO do cliente: ${cliente.nome} (${telefone}) para ${whatsappNumber} ---`);

        try {
            // Buscar todas as mensagens do chat diretamente (includeMe=true, includeNotifications=true)
            console.log(`   Buscando mensagens para ${clientPhoneNumber}...`);
            
            // Tentar diferentes métodos para obter mensagens
            let messagesResult;
            try {
                // Primeiro, tentar o método mais completo
                console.log(`   🔄 Tentando loadAndGetAllMessagesInChat...`);
                messagesResult = await client.loadAndGetAllMessagesInChat(clientPhoneNumber, true, true);
                console.log(`   ✅ loadAndGetAllMessagesInChat retornou ${Array.isArray(messagesResult) ? messagesResult.length : 'não-array'} mensagens`);
            } catch (error) {
                console.log(`   ⚠️ loadAndGetAllMessagesInChat falhou: ${error.message}`);
                console.log(`   🔄 Tentando getAllMessagesInChat como fallback...`);
                try {
                    messagesResult = await client.getAllMessagesInChat(clientPhoneNumber, true, true);
                    console.log(`   ✅ getAllMessagesInChat retornou ${Array.isArray(messagesResult) ? messagesResult.length : 'não-array'} mensagens`);
                } catch (fallbackError) {
                    console.log(`   ❌ getAllMessagesInChat também falhou: ${fallbackError.message}`);
                    messagesResult = [];
                }
            }
            
            // Debug: verificar o tipo e estrutura do resultado
            console.log(`   🔍 Debug - Tipo do resultado: ${typeof messagesResult}`);
            console.log(`   🔍 Debug - É array: ${Array.isArray(messagesResult)}`);
            if (messagesResult && typeof messagesResult === 'object') {
                console.log(`   🔍 Debug - Chaves do objeto: ${Object.keys(messagesResult)}`);
            }
            
            // Garantir que messages seja um array
            const messages = Array.isArray(messagesResult) ? messagesResult : [];
            console.log(`   Total de mensagens encontradas: ${messages.length}`);
            
            // Debug adicional: mostrar algumas mensagens de exemplo
            if (messages.length > 0) {
                console.log(`   🔍 Debug - Primeira mensagem:`);
                console.log(`      - ID: ${messages[0].id}`);
                console.log(`      - From: ${messages[0].from}`);
                console.log(`      - Body: ${messages[0].body ? messages[0].body.substring(0, 50) + '...' : 'N/A'}`);
                console.log(`      - Timestamp: ${messages[0].timestamp}`);
                console.log(`      - FromMe: ${messages[0].fromMe}`);
                console.log(`      - IsGroupMsg: ${messages[0].isGroupMsg}`);
                
                if (messages.length > 1) {
                    console.log(`   🔍 Debug - Última mensagem:`);
                    const lastMsg = messages[messages.length - 1];
                    console.log(`      - ID: ${lastMsg.id}`);
                    console.log(`      - From: ${lastMsg.from}`);
                    console.log(`      - Body: ${lastMsg.body ? lastMsg.body.substring(0, 50) + '...' : 'N/A'}`);
                    console.log(`      - Timestamp: ${lastMsg.timestamp}`);
                    console.log(`      - FromMe: ${lastMsg.fromMe}`);
                }
            }

            if (!messages || messages.length === 0) {
                console.log(`   ⚠️ Nenhuma mensagem encontrada para o cliente ${cliente.nome} (${clientPhoneNumber}).`);
                console.log(`   Isso pode indicar que o chat não existe ou não há histórico de mensagens.`);
                continue;
            }

            // Filtrar apenas mensagens de conversas diretas (inbox) - excluir grupos e status
            const inboxMessages = messages.filter(msg => {
                return !msg.isGroupMsg && // Não é mensagem de grupo
                       !msg.from.includes('@g.us') && // Não é de grupo
                       !msg.from.includes('status@broadcast') && // Não é status
                       msg.type !== 'notification'; // Não é notificação
            });
            
            console.log(`   Mensagens do inbox filtradas: ${inboxMessages.length} de ${messages.length} total`);
            
            if (inboxMessages.length === 0) {
                console.log(`   ⚠️ Nenhuma mensagem do inbox encontrada para ${cliente.nome}.`);
                continue;
            }
            
            inboxMessages.sort((a, b) => a.timestamp - b.timestamp);
            
            // Log detalhado das mensagens encontradas
            console.log(`   📊 Análise detalhada das mensagens para ${cliente.nome}:`);
            console.log(`      - Total de mensagens brutas: ${messages.length}`);
            console.log(`      - Mensagens do inbox (filtradas): ${inboxMessages.length}`);
            console.log(`      - Período: ${new Date(inboxMessages[0]?.timestamp * 1000).toLocaleString('pt-BR')} até ${new Date(inboxMessages[inboxMessages.length - 1]?.timestamp * 1000).toLocaleString('pt-BR')}`);
            
            // Contar mensagens por tipo
            const messagesByType = {
                fromClient: inboxMessages.filter(msg => !msg.fromMe).length,
                fromOperator: inboxMessages.filter(msg => msg.fromMe).length
            };
            console.log(`      - Mensagens do cliente: ${messagesByType.fromClient}`);
            console.log(`      - Mensagens do operador: ${messagesByType.fromOperator}`);

            // Nova lógica: processar TODAS as mensagens para criar um resumo contextual único
            console.log(`   📝 Processando todas as mensagens para criar resumo contextual...`);
            
            // Separar mensagens por tipo para análise
            const clientMessages = inboxMessages.filter(msg => !msg.fromMe);
            const operatorMessages = inboxMessages.filter(msg => msg.fromMe);
            
            console.log(`   📊 Análise de mensagens:`);
            console.log(`      - Mensagens do cliente: ${clientMessages.length}`);
            console.log(`      - Mensagens do operador: ${operatorMessages.length}`);
            
            // Log detalhado das mensagens do cliente
            clientMessages.forEach((msg, index) => {
                const body = msg.body || '[Mensagem sem texto - pode ser mídia, áudio, etc.]';
                console.log(`      Cliente ${index + 1}: "${body.substring(0, 100)}${body.length > 100 ? '...' : ''}" (Tipo: ${msg.type || 'text'})`);
            });
            
            // Criar uma única tarefa de resumo contextual com TODAS as mensagens
            if (inboxMessages.length > 0) {
                await createContextualConversationSummary(cliente.cliente_id, inboxMessages, isInitialScan);
                console.log(`   ✅ Resumo contextual criado para ${cliente.nome} com ${inboxMessages.length} mensagens`);
            }

        } catch (error) {
            console.error(`❌ Erro crítico ao processar histórico do cliente ${cliente.nome} (${cliente.telefone}) para ${whatsappNumber}:`, error);
        }
    }
    console.log(`✅ Varredura de mensagens CONTEXTUALIZADA para ${whatsappNumber} concluída.`);
}

// Nova função para criar resumo contextual de TODAS as mensagens
async function createContextualConversationSummary(clienteId, allMessages, isInitialScan) {
    try {
        console.log(`   🔄 Criando resumo contextual para cliente ${clienteId} com ${allMessages.length} mensagens...`);
        
        // 1. Marcar todas as tarefas existentes como 'consolidada'
        const clienteRef = db.collection('clientes').doc(clienteId);
        const existingTasksSnapshot = await clienteRef.collection('tarefas')
            .where('status', 'in', ['pendente', 'pendente_retroativa', 'pendente_sumario'])
            .get();
        
        const batch = db.batch();
        existingTasksSnapshot.forEach(doc => {
            batch.update(doc.ref, { 
                status: 'consolidada',
                data_consolidacao: admin.firestore.FieldValue.serverTimestamp()
            });
        });
        
        if (!existingTasksSnapshot.empty) {
            await batch.commit();
            console.log(`   📝 ${existingTasksSnapshot.size} tarefas existentes marcadas como consolidadas`);
        }
        
        // 2. Criar nova tarefa de resumo contextual
        await createFullContextSummaryTask(clienteId, allMessages, isInitialScan);
        
    } catch (error) {
        console.error(`❌ Erro ao criar resumo contextual para cliente ${clienteId}:`, error);
    }
}

// Função para consolidar tarefas existentes e criar apenas uma tarefa de resumo por cliente
async function consolidateClientTasks(clienteId, unrespondedMessages, allMessages, isInitialScan) {
    try {
        if (unrespondedMessages.length === 0) return;

        console.log(`   🔄 Consolidando tarefas para cliente ${clienteId}...`);
        
        // 1. Marcar todas as tarefas existentes como 'consolidada'
        const clienteRef = db.collection('clientes').doc(clienteId);
        const existingTasksSnapshot = await clienteRef.collection('tarefas')
            .where('status', 'in', ['pendente', 'pendente_retroativa', 'pendente_sumario'])
            .get();
        
        const batch = db.batch();
        existingTasksSnapshot.forEach(doc => {
            batch.update(doc.ref, { 
                status: 'consolidada',
                data_consolidacao: admin.firestore.FieldValue.serverTimestamp()
            });
        });
        
        if (!existingTasksSnapshot.empty) {
            await batch.commit();
            console.log(`   ✅ ${existingTasksSnapshot.size} tarefas antigas marcadas como consolidadas`);
        }
        
        // 2. Verificar se já existe uma tarefa de resumo ativa
        const summaryTaskSnapshot = await clienteRef.collection('tarefas')
            .where('status', '==', 'pendente_sumario')
            .limit(1)
            .get();
        
        if (!summaryTaskSnapshot.empty) {
            console.log(`   ℹ️ Cliente ${clienteId} já possui tarefa de resumo ativa. Atualizando...`);
            // Atualizar a tarefa existente com novo contexto
            const existingTaskRef = summaryTaskSnapshot.docs[0].ref;
            await updateExistingSummaryTask(existingTaskRef, unrespondedMessages, allMessages);
        } else {
            // 3. Criar nova tarefa de resumo consolidada
            await createConsolidatedSummaryTask(clienteId, unrespondedMessages, allMessages, isInitialScan);
        }
        
    } catch (error) {
        console.error(`❌ Erro ao consolidar tarefas para cliente ${clienteId}:`, error);
        throw error;
    }
}

// Função para atualizar tarefa de resumo existente
async function updateExistingSummaryTask(taskRef, unrespondedMessages, allMessages) {
    try {
        // Pega as últimas 30 mensagens para contexto
        const contextHistory = allMessages
            .sort((a, b) => a.timestamp - b.timestamp)
            .slice(-30);

        const conversationSummary = contextHistory
            .map(msg => {
                const sender = msg.fromMe ? 'Operador' : 'Cliente';
                const timestamp = new Date(msg.timestamp * 1000).toLocaleString('pt-BR');
                return `[${timestamp}] ${sender}: ${msg.body || '[Mensagem sem texto]'}`;
            })
            .join('\n');

        const allUnrespondedText = unrespondedMessages
            .map(msg => msg.body || '')
            .filter(text => text.trim())
            .join('\n\n');

        const fullContext = `HISTÓRICO DA CONVERSA:\n${conversationSummary}\n\nMENSAGENS NÃO RESPONDIDAS:\n${allUnrespondedText}`;
        const iaResult = await gerarRespostaIA(fullContext, contextHistory);
        const iaResposta = typeof iaResult === 'object' ? iaResult.resposta : iaResult;
        const prioridade = typeof iaResult === 'object' ? iaResult.prioridade : 5;
        const latestMessage = unrespondedMessages[unrespondedMessages.length - 1];

        // Validar timestamp antes de criar Date
        const validTimestamp = latestMessage.timestamp && !isNaN(latestMessage.timestamp) ? 
            latestMessage.timestamp : Date.now() / 1000;

        // Criar resumo executivo da conversa para o frontend
        const executiveSummary = generateExecutiveSummary(contextHistory, unrespondedMessages);
        
        // Validar e limpar dados antes de atualizar
        await taskRef.update({
            mensagem_recebida: String(fullContext || ''),
            mensagem_sugerida: String(iaResposta || ''),
            data_atualizacao: admin.firestore.FieldValue.serverTimestamp(),
            timestamp_mensagem_original: new Date(validTimestamp * 1000),
            'metadata.message_ids': unrespondedMessages.map(msg => msg.id || '').filter(id => id),
            'metadata.total_messages': Number(unrespondedMessages.length) || 0,
            'metadata.context_messages': Number(contextHistory.length) || 0,
            'metadata.conversation_summary': String(conversationSummary || ''),
            'metadata.unresponded_messages': String(allUnrespondedText || ''),
            'metadata.executive_summary': executiveSummary
        });
        
        console.log(`   ✅ Tarefa de resumo existente atualizada com ${unrespondedMessages.length} novas mensagens`);
    } catch (error) {
        console.error(`❌ Erro ao atualizar tarefa de resumo existente:`, error);
        throw error;
    }
}

// Função para gerar resumo executivo da conversa
// Nova função para gerar resumo executivo de TODAS as mensagens
function generateFullContextExecutiveSummary(allMessages, clientMessages, operatorMessages) {
    try {
        if (!allMessages || allMessages.length === 0) {
            return {
                total_messages: 0,
                client_messages: 0,
                operator_messages: 0,
                conversation_period: 'N/A',
                last_interaction: 'N/A',
                recent_client_messages: [],
                message_types: {}
            };
        }
        
        // Ordenar mensagens por timestamp
        const sortedMessages = allMessages.sort((a, b) => a.timestamp - b.timestamp);
        
        // Calcular período da conversa
        const firstMessage = sortedMessages[0];
        const lastMessage = sortedMessages[sortedMessages.length - 1];
        const startDate = new Date(firstMessage.timestamp * 1000).toLocaleDateString('pt-BR');
        const endDate = new Date(lastMessage.timestamp * 1000).toLocaleDateString('pt-BR');
        const conversationPeriod = startDate === endDate ? startDate : `${startDate} - ${endDate}`;
        
        // Última interação
        const lastInteraction = new Date(lastMessage.timestamp * 1000).toLocaleString('pt-BR');
        
        // Últimas 5 mensagens do cliente
        const recentClientMessages = clientMessages
            .slice(-5)
            .map(msg => {
                const content = msg.body || `[${msg.type || 'Mensagem especial'}]`;
                return {
                    content: content.length > 100 ? content.substring(0, 100) + '...' : content,
                    timestamp: new Date(msg.timestamp * 1000).toLocaleString('pt-BR')
                };
            });
        
        // Contar tipos de mensagem
        const messageTypes = {};
        allMessages.forEach(msg => {
            const type = msg.type || 'text';
            messageTypes[type] = (messageTypes[type] || 0) + 1;
        });
        
        return {
            total_messages: allMessages.length,
            client_messages: clientMessages.length,
            operator_messages: operatorMessages.length,
            conversation_period: conversationPeriod,
            last_interaction: lastInteraction,
            recent_client_messages: recentClientMessages,
            message_types: messageTypes,
            last_sender: lastMessage.fromMe ? 'Operador' : 'Cliente'
        };
        
    } catch (error) {
        console.error('Erro ao gerar resumo executivo completo:', error);
        return {
            total_messages: allMessages?.length || 0,
            client_messages: clientMessages?.length || 0,
            operator_messages: operatorMessages?.length || 0,
            conversation_period: 'Erro ao calcular',
            last_interaction: 'Erro ao calcular',
            recent_client_messages: [],
            message_types: {},
            error: 'Erro ao processar resumo'
        };
    }
}

function generateExecutiveSummary(contextHistory, unrespondedMessages) {
    try {
        const totalMessages = contextHistory.length;
        const clientMessages = contextHistory.filter(msg => !msg.fromMe);
        const operatorMessages = contextHistory.filter(msg => msg.fromMe);
        
        // Últimas mensagens do cliente (não respondidas)
        const recentClientMessages = unrespondedMessages.slice(-3).map(msg => {
            const preview = msg.body ? msg.body.substring(0, 100) : '[Mensagem sem texto]';
            return `"${preview}${msg.body && msg.body.length > 100 ? '...' : ''}"`;
        });
        
        // Período da conversa
        const firstMessage = contextHistory[0];
        const lastMessage = contextHistory[contextHistory.length - 1];
        const conversationPeriod = firstMessage && lastMessage ? 
            `${new Date(firstMessage.timestamp * 1000).toLocaleDateString('pt-BR')} - ${new Date(lastMessage.timestamp * 1000).toLocaleDateString('pt-BR')}` : 
            'Período não disponível';
        
        return {
            total_messages: totalMessages,
            client_messages: clientMessages.length,
            operator_messages: operatorMessages.length,
            unanswered_count: unrespondedMessages.length,
            conversation_period: conversationPeriod,
            recent_client_messages: recentClientMessages,
            last_interaction: lastMessage ? new Date(lastMessage.timestamp * 1000).toLocaleString('pt-BR') : 'Não disponível'
        };
    } catch (error) {
        console.error('❌ Erro ao gerar resumo executivo:', error);
        return {
            total_messages: 0,
            client_messages: 0,
            operator_messages: 0,
            unanswered_count: unrespondedMessages.length,
            conversation_period: 'Erro ao calcular',
            recent_client_messages: [],
            last_interaction: 'Erro ao calcular'
        };
    }
}

// Função para criar nova tarefa de resumo consolidada
// Nova função para criar tarefa de resumo com TODAS as mensagens
async function createFullContextSummaryTask(clienteId, allMessages, isInitialScan) {
    try {
        // Ordenar mensagens por timestamp
        const sortedMessages = allMessages.sort((a, b) => a.timestamp - b.timestamp);
        
        // Separar mensagens por tipo
        const clientMessages = sortedMessages.filter(msg => !msg.fromMe);
        const operatorMessages = sortedMessages.filter(msg => msg.fromMe);
        
        console.log(`   📋 Criando resumo completo:`);
        console.log(`      - Total de mensagens: ${sortedMessages.length}`);
        console.log(`      - Mensagens do cliente: ${clientMessages.length}`);
        console.log(`      - Mensagens do operador: ${operatorMessages.length}`);
        
        // Criar histórico completo da conversa
        const conversationHistory = sortedMessages
            .map(msg => {
                const sender = msg.fromMe ? 'Operador' : 'Cliente';
                const timestamp = new Date(msg.timestamp * 1000).toLocaleString('pt-BR');
                let content = msg.body || '';
                
                // Identificar tipos de mensagem especiais
                if (!content && msg.type) {
                    switch (msg.type) {
                        case 'image':
                            content = '[Imagem enviada]';
                            break;
                        case 'audio':
                        case 'ptt':
                            content = '[Áudio enviado]';
                            break;
                        case 'video':
                            content = '[Vídeo enviado]';
                            break;
                        case 'document':
                            content = '[Documento enviado]';
                            break;
                        case 'sticker':
                            content = '[Sticker enviado]';
                            break;
                        case 'location':
                            content = '[Localização enviada]';
                            break;
                        default:
                            content = `[Mensagem do tipo: ${msg.type}]`;
                    }
                }
                
                return `[${timestamp}] ${sender}: ${content || '[Mensagem sem conteúdo]'}`;
            })
            .join('\n');
        
        // Criar contexto para IA focando em todas as mensagens
        const fullContext = `HISTÓRICO COMPLETO DA CONVERSA:\n${conversationHistory}\n\nINSTRUÇÃO: Analise toda a conversa acima e forneça uma resposta contextualizada considerando todo o histórico de interações entre cliente e operador.`;
        
        console.log(`   🤖 Gerando resposta da IA com contexto completo...`);
        const iaResult = await gerarRespostaIA(fullContext, sortedMessages);
        const iaResposta = typeof iaResult === 'object' ? iaResult.resposta : iaResult;
        const prioridade = typeof iaResult === 'object' ? iaResult.prioridade : 5;
        
        // Usar a mensagem mais recente como referência
        const latestMessage = sortedMessages[sortedMessages.length - 1];
        
        // Criar resumo executivo da conversa completa
         const executiveSummary = generateFullContextExecutiveSummary(sortedMessages, clientMessages, operatorMessages);
         
         console.log(`   📊 Resumo executivo gerado:`, executiveSummary);
         
         // Validar e limpar dados antes de salvar
         const cleanMetadata = {
             message_ids: sortedMessages.map(msg => msg.id || '').filter(id => id),
             from: latestMessage.from || '',
             type: 'full_context_summary',
             executive_summary: executiveSummary,
             notify_name: latestMessage.notifyName || '',
             is_retroactive: Boolean(isInitialScan),
             total_messages: Number(sortedMessages.length) || 0,
             client_messages: Number(clientMessages.length) || 0,
             operator_messages: Number(operatorMessages.length) || 0,
             conversation_history: String(conversationHistory || '')
         };
         
         // Validar timestamp antes de criar Date
         const validTimestamp = latestMessage.timestamp && !isNaN(latestMessage.timestamp) ? 
             latestMessage.timestamp : Date.now() / 1000;
         
         const tarefa = {
             mensagem_recebida: String(fullContext || ''),
             mensagem_sugerida: String(iaResposta || ''),
             status: 'pendente_sumario',
             data_criacao: admin.firestore.FieldValue.serverTimestamp(),
             timestamp_mensagem_original: new Date(validTimestamp * 1000),
             tags: ['venom-bot', 'resumo-contextual-completo', 'todas-mensagens'],
             follow_up: false,
             metadata: cleanMetadata
         };
         
         const clienteRef = db.collection('clientes').doc(clienteId);
         const tarefaRef = await clienteRef.collection('tarefas').add(tarefa);
         
         console.log(`   ✅ Tarefa de resumo contextual completo criada: ${tarefaRef.id}`);
         
     } catch (error) {
         console.error(`❌ Erro ao criar tarefa de resumo contextual completo:`, error);
     }
 }
 
async function createConsolidatedSummaryTask(clienteId, unrespondedMessages, allMessages, isInitialScan) {
    try {
        // Pega as últimas 30 mensagens para contexto
        const contextHistory = allMessages
            .sort((a, b) => a.timestamp - b.timestamp)
            .slice(-30);

        const conversationSummary = contextHistory
            .map(msg => {
                const sender = msg.fromMe ? 'Operador' : 'Cliente';
                const timestamp = new Date(msg.timestamp * 1000).toLocaleString('pt-BR');
                return `[${timestamp}] ${sender}: ${msg.body || '[Mensagem sem texto]'}`;
            })
            .join('\n');

        const allUnrespondedText = unrespondedMessages
            .map(msg => msg.body || '')
            .filter(text => text.trim())
            .join('\n\n');

        const fullContext = `HISTÓRICO DA CONVERSA:\n${conversationSummary}\n\nMENSAGENS NÃO RESPONDIDAS:\n${allUnrespondedText}`;
        const iaResposta = await gerarRespostaIA(fullContext, contextHistory);
        const latestMessage = unrespondedMessages[unrespondedMessages.length - 1];

        // Criar resumo executivo da conversa para o frontend
        const executiveSummary = generateExecutiveSummary(contextHistory, unrespondedMessages);
        
        // Validar e limpar dados antes de salvar
        const cleanMetadata = {
            message_ids: unrespondedMessages.map(msg => msg.id || '').filter(id => id),
            from: latestMessage.from || '',
            type: 'consolidated_conversation_summary',
            executive_summary: executiveSummary,
            notify_name: latestMessage.notifyName || '',
            is_retroactive: Boolean(isInitialScan),
            total_messages: Number(unrespondedMessages.length) || 0,
            context_messages: Number(contextHistory.length) || 0,
            conversation_summary: String(conversationSummary || ''),
            unresponded_messages: String(allUnrespondedText || '')
        };

        // Validar timestamp antes de criar Date
        const validTimestamp = latestMessage.timestamp && !isNaN(latestMessage.timestamp) ? 
            latestMessage.timestamp : Date.now() / 1000;

        const tarefa = {
            mensagem_recebida: String(fullContext || ''),
            mensagem_sugerida: String(iaResposta || ''),
            status: 'pendente_sumario',
            data_criacao: admin.firestore.FieldValue.serverTimestamp(),
            timestamp_mensagem_original: new Date(validTimestamp * 1000),
            tags: ['venom-bot', 'resumo-consolidado', 'conversa-completa'],
            follow_up: false,
            prioridade: Number(prioridade) || 5,
            metadata: cleanMetadata
        };

        if (isInitialScan) {
            tarefa.tags.push('retroativa');
        } else {
            tarefa.tags.push('nova');
        }

        const tarefaRef = await db.collection('clientes').doc(clienteId).collection('tarefas').add(tarefa);
        console.log(`   ✅ Nova tarefa de resumo consolidada criada: ${tarefaRef.id}`);
        
        // Atualizar timestamp da última mensagem
        const clienteDocRef = db.collection('clientes').doc(clienteId);
        const clienteDoc = await clienteDocRef.get();
        const currentLastTimestamp = clienteDoc.data()?.timestamp_ultima_mensagem?.toDate()?.getTime() || 0;
        const messageTimestampMs = latestMessage.timestamp * 1000;

        if (messageTimestampMs > currentLastTimestamp) {
            await clienteDocRef.update({
                ultima_mensagem: latestMessage.body || '',
                timestamp_ultima_mensagem: admin.firestore.FieldValue.serverTimestamp()
            });
        }
        
        // Atualizar métricas de conversão
        await updateClientConversionMetrics(clienteId);
        
        return tarefaRef.id;
    } catch (error) {
        console.error(`❌ Erro ao criar tarefa de resumo consolidada:`, error);
        throw error;
    }
}

async function startVenomBot(whatsappNumber, qrCallback) {
    const sessionName = `crm-alra-${whatsappNumber}`;

    if (activeBots.has(whatsappNumber)) {
        console.log(`⚠️ Bot para ${whatsappNumber} já está ativo. Não iniciando novamente.`);
        return activeBots.get(whatsappNumber);
    }

    console.log(`🤖 Iniciando Venom-Bot para sessão: ${sessionName} (Número: ${whatsappNumber})...`);

    try {
        const client = await venom.create({
            session: sessionName,
            multidevice: false,
            folderNameToken: 'tokens',
            mkdirFolderToken: '',
            headless: true, // Mudando para headless para melhor estabilidade
            devtools: false,
            useChrome: false,
            executablePath: '/Users/jovemhenrico/.cache/puppeteer/chrome/mac_arm-121.0.6167.85/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing', // Usa Chrome instalado pelo Puppeteer
            debug: false,
            logQR: true, // Habilitando para debug
            browserWS: '',
            updatesLog: true,
            autoClose: 120000, // Aumentando timeout
            createPathFileToken: true,
            whatsappNumber: whatsappNumber,
            browserArgs: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu',
                '--disable-web-security',
                '--disable-features=VizDisplayCompositor',
                '--disable-background-timer-throttling',
                '--disable-backgrounding-occluded-windows',
                '--disable-renderer-backgrounding',
                '--no-first-run',
                '--no-default-browser-check',
                '--disable-extensions'
            ],
            catchQR: (base64Qrimg, asciiQR, attempts, urlCode) => {
                console.log(`📱 QR Code gerado para ${whatsappNumber}. Tentativas: ${attempts}`);
                console.log(`🔍 QR Code base64 length: ${base64Qrimg ? base64Qrimg.length : 0}`);
                
                if (qrCallback && base64Qrimg && base64Qrimg.length > 0) {
                    // Chamar qrCallback com parâmetros separados como esperado por sendQrCodeToFrontend
                    qrCallback(whatsappNumber, base64Qrimg, asciiQR, urlCode);
                } else {
                    console.log(`⚠️ QR Code vazio ou callback não definido para ${whatsappNumber}`);
                }
            },
            statusFind: (statusSession, session) => {
                console.log(`📊 Status da sessão ${whatsappNumber}:`, statusSession);
                if (statusSession === 'isLogged' && qrCallback) {
                    console.log(`✅ ${whatsappNumber} logado com sucesso!`);
                    qrCallback({
                        type: 'logged-in',
                        whatsappNumber,
                        timestamp: new Date().toISOString()
                    });
                } else if ((statusSession === 'qrReadError' || statusSession === 'qrReadFail') && qrCallback) {
                    console.log(`❌ Erro no QR Code para ${whatsappNumber}: ${statusSession}`);
                    qrCallback({
                        type: 'qr-error',
                        whatsappNumber,
                        error: statusSession,
                        timestamp: new Date().toISOString()
                    });
                }
            }
        });

        console.log(`✅ Venom-Bot para ${whatsappNumber} conectado com sucesso!`);
        activeBots.set(whatsappNumber, client);
        console.log(`📊 activeBots: Bot ${whatsappNumber} ADICIONADO. Tamanho atual: ${activeBots.size}`);

        // Configurar automaticamente o whatsapp_comercial do usuário
        try {
            const operatorUser = await findOperatorByPhone(whatsappNumber);
            if (operatorUser && (!operatorUser.whatsapp_comercial || operatorUser.whatsapp_comercial.trim() === '')) {
                await db.collection('usuarios').doc(operatorUser.usuario_id).update({
                    whatsapp_comercial: whatsappNumber
                });
                console.log(`📱 WhatsApp comercial configurado automaticamente para ${operatorUser.email}: ${whatsappNumber}`);
            }
        } catch (error) {
            console.log(`⚠️ Erro ao configurar WhatsApp comercial automaticamente:`, error.message);
        }

        try {
            const host = await client.getHostDevice();
            if (host && host.user) {
                console.log(`🤖 Dispositivo para ${whatsappNumber}:`, host.user);
            } else {
                console.log(`⚠️ Não foi possível obter informações do dispositivo para ${whatsappNumber}`);
            }
        } catch (error) {
            console.log(`⚠️ Erro ao obter informações do dispositivo para ${whatsappNumber}:`, error.message);
        }

        if (RUN_RETROACTIVE_SCAN_ON_STARTUP) {
            console.log(`🔄 Iniciando varredura inicial de mensagens para ${whatsappNumber}...`);
            await scanMessagesAndCreateTasks(client, whatsappNumber, true);
            console.log(`✅ Varredura inicial de mensagens concluída para ${whatsappNumber}.`);
        }

        client.onMessage(async (message) => {
            try {
                if (message.isGroupMsg || message.from === message.to || message.fromMe) {
                    return;
                }
                const operatorPhone = message.to.replace('@c.us', '');
                const operatorUser = await findOperatorByPhone(operatorPhone);
                if (!operatorUser) {
                    return;
                }
                const clientPhone = message.from.replace('@c.us', '');
                const clienteData = await getOrCreateClient(clientPhone, message.notifyName || 'Cliente', operatorUser.usuario_id);
                await saveMensagemAsTarefa(clienteData.cliente_id, message, false); 
            } catch (error) {
                console.error(`❌ Erro ao processar mensagem em tempo real para ${whatsappNumber}:`, error);
            }
        });

        client.onStateChange(async (state) => {
            console.log(`📱 Estado do WhatsApp para ${whatsappNumber}:`, state);
            if (state === 'CLOSED' || state === 'DISCONNECTED') {
                console.log(`❗ Instância do bot para ${whatsappNumber} foi ${state}.`);
                activeBots.delete(whatsappNumber);
                console.log(`📊 activeBots: Bot ${whatsappNumber} REMOVIDO. Tamanho atual: ${activeBots.size}`);
                console.log(`Recomendado: Notificar frontend para re-autenticação do número ${whatsappNumber}.`);
                
                // Limpar dados dos clientes quando desconectado
                await cleanupClientDataForNumber(whatsappNumber);
            } else if (state === 'QRCODE') {
                 console.log(`QR Code re-gerado para ${whatsappNumber}. Por favor, escaneie novamente.`);
            }
        });

        return client;

    } catch (error) {
        console.error(`❌ Erro ao iniciar Venom-Bot para ${whatsappNumber}:`, error);
        activeBots.delete(whatsappNumber);
        console.log(`📊 activeBots: Bot ${whatsappNumber} REMOVIDO (erro na inicialização). Tamanho atual: ${activeBots.size}`);
        
        // Limpar dados dos clientes quando há erro na inicialização
        await cleanupClientDataForNumber(whatsappNumber);
        
        return null;
    }
}

async function cleanupClientDataForNumber(whatsappNumber) {
    try {
        console.log(`🧹 Iniciando limpeza de dados para o número ${whatsappNumber}...`);
        
        // Encontrar o operador pelo número
        const operatorUser = await findOperatorByPhone(whatsappNumber);
        if (!operatorUser) {
            console.log(`⚠️ Operador para ${whatsappNumber} não encontrado. Nenhuma limpeza necessária.`);
            return;
        }
        
        console.log(`🔍 Limpando dados do operador: ${operatorUser.email} (${operatorUser.usuario_id})`);
        
        // Buscar todos os clientes deste operador
        const clientesSnapshot = await db.collection('clientes')
            .where('usuario_id', '==', operatorUser.usuario_id)
            .get();
        
        console.log(`📋 Encontrados ${clientesSnapshot.size} clientes para limpar`);
        
        // Deletar tarefas e clientes em lotes
        const batch = db.batch();
        let operationsCount = 0;
        
        for (const clienteDoc of clientesSnapshot.docs) {
            const clienteId = clienteDoc.id;
            console.log(`  🗑️ Removendo cliente: ${clienteDoc.data().nome} (${clienteId})`);
            
            // Buscar e deletar todas as tarefas do cliente
            const tarefasSnapshot = await db.collection('clientes')
                .doc(clienteId)
                .collection('tarefas')
                .get();
            
            // Deletar tarefas
            for (const tarefaDoc of tarefasSnapshot.docs) {
                batch.delete(tarefaDoc.ref);
                operationsCount++;
                
                // Executar batch se atingir o limite
                if (operationsCount >= 450) { // Deixar margem do limite de 500
                    await batch.commit();
                    console.log(`  📦 Batch executado (${operationsCount} operações)`);
                    operationsCount = 0;
                }
            }
            
            // Deletar o documento do cliente
            batch.delete(clienteDoc.ref);
            operationsCount++;
            
            if (operationsCount >= 450) {
                await batch.commit();
                console.log(`  📦 Batch executado (${operationsCount} operações)`);
                operationsCount = 0;
            }
        }
        
        // Executar batch final se houver operações pendentes
        if (operationsCount > 0) {
            await batch.commit();
            console.log(`  📦 Batch final executado (${operationsCount} operações)`);
        }
        
        console.log(`✅ Limpeza concluída para ${whatsappNumber}. ${clientesSnapshot.size} clientes removidos.`);
        
    } catch (error) {
        console.error(`❌ Erro ao limpar dados para ${whatsappNumber}:`, error);
    }
}

async function stopVenomBot(whatsappNumber) {
    const client = activeBots.get(whatsappNumber);
    if (client) {
        try {
            console.log(`🛑 Iniciando desconexão completa para ${whatsappNumber}...`);
            
            // Tentar fazer logout do WhatsApp Web antes de fechar
            try {
                console.log(`🚪 Fazendo logout do WhatsApp Web para ${whatsappNumber}...`);
                await client.logout();
                console.log(`✅ Logout realizado com sucesso para ${whatsappNumber}`);
            } catch (logoutError) {
                console.log(`⚠️ Erro no logout para ${whatsappNumber}:`, logoutError.message);
                // Continuar mesmo se o logout falhar
            }
            
            // Aguardar um pouco antes de fechar a sessão
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            // Fechar a sessão
            await client.close();
            activeBots.delete(whatsappNumber);
            console.log(`📊 activeBots: Bot ${whatsappNumber} REMOVIDO (parada manual). Tamanho atual: ${activeBots.size}`);
            console.log(`🛑 Bot para ${whatsappNumber} parado com sucesso.`);
            
            // Limpar dados dos clientes quando o bot é parado
            await cleanupClientDataForNumber(whatsappNumber);
            
        } catch (error) {
            console.error(`❌ Erro ao parar bot para ${whatsappNumber}:`, error);
            activeBots.delete(whatsappNumber);
            console.log(`📊 activeBots: Bot ${whatsappNumber} REMOVIDO (erro na parada). Tamanho atual: ${activeBots.size}`);
            
            // Mesmo com erro, tentar limpar os dados
            try {
                await cleanupClientDataForNumber(whatsappNumber);
            } catch (cleanupError) {
                console.error(`❌ Erro na limpeza após falha na parada:`, cleanupError);
            }
        }
    } else {
        console.log(`⚠️ Bot para ${whatsappNumber} não encontrado no activeBots.`);
        // Mesmo sem bot ativo, limpar dados se existirem
        try {
            await cleanupClientDataForNumber(whatsappNumber);
        } catch (cleanupError) {
            console.error(`❌ Erro na limpeza sem bot ativo:`, cleanupError);
        }
    }
}

function listenForOperatorChanges(qrCallback) {
    console.log('👂 Escutando por mudanças na coleção de usuários no Firestore para gerenciar bots...');
    db.collection('usuarios').onSnapshot(async (snapshot) => {
        const currentNumbersInDb = new Set();
        snapshot.docs.forEach(doc => {
            const data = doc.data();
            if (data.whatsapp_comercial) {
                currentNumbersInDb.add(data.whatsapp_comercial);
            }
        });

        for (const [number, client] of activeBots.entries()) {
            if (!currentNumbersInDb.has(number)) {
                console.log(`🛑 Parando bot para número removido: ${number}`);
                await stopVenomBot(number);
            }
        }

        for (const number of currentNumbersInDb) {
            if (!activeBots.has(number)) {
                console.log(`Detected new or restarted number ${number} in Firestore. Starting bot.`);
                await startVenomBot(number, qrCallback);
            }
        }
        console.log('🔄 Sincronização de bots com Firestore concluída.');
    }, (error) => {
        console.error('❌ Erro ao escutar mudanças em usuários:', error);
    });
}

module.exports = {
    startVenomBot,
    stopVenomBot,
    listenForOperatorChanges,
    activeBots,
    scanMessagesAndCreateTasks,
    enviarMensagem,
    updateClientConversionMetrics, // Exportar a função para ser usada no app.js
    findOperatorByPhone // Exportar a função para ser usada no app.js
};
