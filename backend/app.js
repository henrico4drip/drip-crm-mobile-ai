const express = require('express');
const { listenForOperatorChanges, scanMessagesAndCreateTasks, activeBots, updateClientConversionMetrics, enviarMensagem } = require('./botManager');
const { setupDailyTasks } = require('./taskScheduler');
const cors = require('cors');
const { reprocessAllPendingTasks } = require('./reprocessTasks'); // Importa a função de reprocessamento

const app = express();
app.use(express.json());
app.use(cors());

// Armazenamento para QR codes e conexões SSE
const qrCodes = new Map(); // whatsappNumber -> { base64Qrimg, asciiQR, urlCode, timestamp }
const sseConnections = new Map(); // whatsappNumber -> [res1, res2, ...]

// Endpoint SSE para QR codes
app.get('/api/qr-code/:whatsappNumber', (req, res) => {
    const { whatsappNumber } = req.params;
    
    // Configurar SSE
    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Cache-Control'
    });
    
    // Adicionar conexão à lista
    if (!sseConnections.has(whatsappNumber)) {
        sseConnections.set(whatsappNumber, []);
    }
    sseConnections.get(whatsappNumber).push(res);
    
    // Enviar QR code existente se houver
    const existingQR = qrCodes.get(whatsappNumber);
    if (existingQR) {
        const data = JSON.stringify({
            whatsappNumber,
            ...existingQR
        });
        res.write(`data: ${data}\n\n`);
    }
    
    // Cleanup quando conexão fechar
    req.on('close', () => {
        const connections = sseConnections.get(whatsappNumber) || [];
        const index = connections.indexOf(res);
        if (index !== -1) {
            connections.splice(index, 1);
        }
        if (connections.length === 0) {
            sseConnections.delete(whatsappNumber);
        }
    });
    
    // Heartbeat
    const heartbeat = setInterval(() => {
        res.write(': heartbeat\n\n');
    }, 30000);
    
    req.on('close', () => {
        clearInterval(heartbeat);
    });
});

// Endpoint para verificar status do WhatsApp
app.get('/api/whatsapp-status/:whatsappNumber', (req, res) => {
    const { whatsappNumber } = req.params;
    const hasQR = qrCodes.has(whatsappNumber);
    const isConnected = activeBots.has(whatsappNumber);
    
    res.json({
        whatsappNumber,
        isConnected,
        hasQRCode: hasQR,
        qrData: hasQR ? qrCodes.get(whatsappNumber) : null
    });
});

// Endpoint para verificar status de todos os números
app.get('/api/whatsapp-status', (req, res) => {
    const allStatus = [];
    
    // Status dos bots ativos
    for (const [whatsappNumber] of activeBots.entries()) {
        allStatus.push({
            whatsappNumber,
            isConnected: true,
            hasQRCode: qrCodes.has(whatsappNumber),
            qrData: qrCodes.get(whatsappNumber) || null
        });
    }
    
    // Status dos QR codes sem bot ativo
    for (const [whatsappNumber, qrData] of qrCodes.entries()) {
        if (!activeBots.has(whatsappNumber)) {
            allStatus.push({
                whatsappNumber,
                isConnected: false,
                hasQRCode: true,
                qrData
            });
        }
    }
    
    res.json(allStatus);
});

// Endpoint para iniciar bot do WhatsApp
app.post('/api/start-whatsapp-bot', async (req, res) => {
    const { whatsappNumber } = req.body;
    
    if (!whatsappNumber) {
        return res.status(400).json({ error: 'Número do WhatsApp é obrigatório.' });
    }
    
    try {
        const { startVenomBot } = require('./botManager');
        await startVenomBot(whatsappNumber, sendQrCodeToFrontend);
        res.status(200).json({ message: 'Bot iniciado com sucesso.' });
    } catch (error) {
        console.error('❌ Erro ao iniciar bot:', error);
        res.status(500).json({ error: 'Erro interno ao iniciar o bot.' });
    }
});

// Endpoint para análise retroativa
app.post('/api/analyze-retroactive', async (req, res) => {
    const { whatsappNumber } = req.body;
    
    if (!whatsappNumber) {
        return res.status(400).json({ error: 'Número do WhatsApp é obrigatório.' });
    }
    
    try {
        console.log(`API: Recebida requisição para análise retroativa do número ${whatsappNumber}`);
        const client = activeBots.get(whatsappNumber);
        
        if (!client) {
            return res.status(404).json({ error: 'Bot para este número não está ativo.' });
        }
        
        await scanMessagesAndCreateTasks(client, whatsappNumber, false);
        
        res.status(200).json({ message: 'Análise retroativa iniciada com sucesso. Verifique o console do backend para o progresso.' });
    } catch (error) {
        console.error('❌ Erro na API de análise retroativa:', error);
        res.status(500).json({ error: 'Erro interno ao iniciar a análise retroativa.' });
    }
});

// Endpoint para forçar reprocessamento contextualizado de todos os clientes
app.post('/api/reprocess-contextual-tasks', async (req, res) => {
    try {
        console.log('🔄 Iniciando reprocessamento contextualizado de todos os clientes...');
        
        let processed = 0;
        let errors = 0;
        
        // Itera sobre todos os bots ativos
        for (const [whatsappNumber, client] of activeBots.entries()) {
            try {
                console.log(`📱 Reprocessando contextualizadamente para ${whatsappNumber}...`);
                await scanMessagesAndCreateTasks(client, whatsappNumber, false);
                processed++;
                console.log(`✅ Reprocessamento contextualizado concluído para ${whatsappNumber}`);
            } catch (error) {
                console.error(`❌ Erro ao reprocessar contextualizadamente ${whatsappNumber}:`, error);
                errors++;
            }
        }
        
        res.status(200).json({ 
            message: `Reprocessamento contextualizado concluído. ${processed} números processados, ${errors} erros.`,
            processed,
            errors
        });
    } catch (error) {
        console.error('❌ Erro geral no reprocessamento contextualizado:', error);
        res.status(500).json({ error: 'Erro interno no reprocessamento contextualizado.' });
    }
});

// Endpoint para consolidar todas as tarefas existentes em tarefas de resumo
app.post('/api/consolidate-all-tasks', async (req, res) => {
    try {
        console.log('🔄 Iniciando consolidação de todas as tarefas...');
        
        // Obter todos os bots ativos
        const botKeys = Array.from(activeBots.keys());
        if (botKeys.length === 0) {
            return res.status(400).json({
                success: false,
                error: 'Nenhum bot ativo encontrado'
            });
        }
        
        let totalClientsProcessed = 0;
        let totalTasksConsolidated = 0;
        
        // Processar cada bot
        for (const whatsappNumber of botKeys) {
            const client = activeBots.get(whatsappNumber);
            if (!client) continue;
            
            console.log(`🤖 Consolidando tarefas para bot: ${whatsappNumber}`);
            
            // Encontrar operador
            const { findOperatorByPhone } = require('./botManager');
            const operatorUser = await findOperatorByPhone(whatsappNumber);
            if (!operatorUser) {
                console.warn(`Operador para ${whatsappNumber} não encontrado.`);
                continue;
            }
            
            // Buscar todos os clientes do operador
            const { db } = require('./firebaseService');
            const clientesSnapshot = await db.collection('clientes')
                .where('usuario_id', '==', operatorUser.usuario_id)
                .get();
            
            console.log(`📋 Encontrados ${clientesSnapshot.size} clientes para ${whatsappNumber}`);
            
            for (const clienteDoc of clientesSnapshot.docs) {
                const clienteId = clienteDoc.id;
                const clienteData = clienteDoc.data();
                
                // Extrair telefone do ID do documento (formato: numero@c.us) ou usar o nome se for numérico
                const telefoneFromId = clienteId ? clienteId.replace('@c.us', '') : null;
                const telefoneFromNome = clienteData.nome && /^\d+$/.test(clienteData.nome) ? clienteData.nome : null;
                const telefone = clienteData.telefone || telefoneFromId || telefoneFromNome;
                
                if (!telefone) {
                    console.log(`   ⚠️ Não foi possível determinar o telefone para o cliente ${clienteData.nome} (ID: ${clienteId}). Pulando...`);
                    continue;
                }
                
                const clientPhoneNumber = telefone + '@c.us';
                
                try {
                    console.log(`\n--- Consolidando tarefas do cliente: ${clienteData.nome} (${telefone}) ---`);
                    
                    // Obter mensagens do WhatsApp
                    const messagesResult = await client.getAllMessagesInChat(clientPhoneNumber, true, false);
                    const messages = Array.isArray(messagesResult) ? messagesResult : [];
                    
                    if (messages.length === 0) {
                        console.log(`   Nenhuma mensagem encontrada para ${clienteData.nome}`);
                        continue;
                    }
                    
                    messages.sort((a, b) => a.timestamp - b.timestamp);
                    
                    // Encontrar mensagens não respondidas
                    let lastOperatorMessageTimestamp = 0;
                    const unrespondedMessages = [];
                    
                    for (const message of messages) {
                        if (message.isGroupMsg) continue;
                        
                        if (message.fromMe) {
                            lastOperatorMessageTimestamp = message.timestamp;
                        } else {
                            const messageTimestampMs = message.timestamp * 1000;
                            if (messageTimestampMs > lastOperatorMessageTimestamp * 1000) {
                                unrespondedMessages.push(message);
                            }
                        }
                    }
                    
                    if (unrespondedMessages.length > 0) {
                        // Consolidar tarefas para este cliente
                        const { consolidateClientTasks } = require('./botManager');
                        await consolidateClientTasks(clienteId, unrespondedMessages, messages, false);
                        totalTasksConsolidated += unrespondedMessages.length;
                        console.log(`   ✅ ${unrespondedMessages.length} mensagens consolidadas`);
                    } else {
                        console.log(`   ℹ️ Nenhuma mensagem não respondida encontrada`);
                    }
                    
                    totalClientsProcessed++;
                    
                } catch (error) {
                    console.error(`❌ Erro ao consolidar tarefas do cliente ${clienteData.nome}:`, error);
                }
            }
        }
        
        console.log('✅ Consolidação de tarefas concluída!');
        console.log(`📊 Resumo: ${totalClientsProcessed} clientes processados, ${totalTasksConsolidated} mensagens consolidadas`);
        
        res.json({
            success: true,
            message: 'Consolidação de tarefas concluída com sucesso',
            stats: {
                clientsProcessed: totalClientsProcessed,
                tasksConsolidated: totalTasksConsolidated,
                botsProcessed: botKeys.length
            }
        });
        
    } catch (error) {
        console.error('❌ Erro ao consolidar tarefas:', error);
        res.status(500).json({
            success: false,
            error: 'Erro interno ao consolidar tarefas'
        });
    }
});

// Endpoint para reprocessar TODAS as tarefas pendentes
app.post('/api/reprocess-all-pending-tasks', async (req, res) => {
    console.log('API: Recebida requisição para reprocessar TODAS as tarefas pendentes.');
    try {
        await reprocessAllPendingTasks();
        res.status(200).json({ message: 'Reprocessamento de tarefas pendentes iniciado com sucesso. Verifique o console do backend para o progresso.' });
    } catch (error) {
        console.error('❌ Erro na API de reprocessamento de tarefas:', error);
        res.status(500).json({ error: 'Erro interno ao iniciar o reprocessamento de tarefas.' });
    }
});

// Endpoint para atualizar as métricas de conversão de um cliente
app.post('/api/update-conversion-metrics', async (req, res) => {
    const { clienteId } = req.body;
    if (!clienteId) {
        return res.status(400).json({ error: 'ID do cliente é obrigatório.' });
    }
    try {
        await updateClientConversionMetrics(clienteId);
        res.status(200).json({ message: 'Métricas de conversão atualizadas com sucesso.' });
    } catch (error) {
        console.error('❌ Erro na API de atualização de métricas:', error);
        res.status(500).json({ error: 'Erro interno ao atualizar métricas de conversão.' });
    }
});

// Endpoint para atualizar métricas de conversão de TODOS os clientes
app.post('/api/update-all-conversion-metrics', async (req, res) => {
    console.log('API: Recebida requisição para atualizar métricas de conversão de TODOS os clientes.');
    try {
        const { db } = require('./firebaseService');
        
        // Buscar todos os clientes
        const clientesSnapshot = await db.collection('clientes').get();
        console.log(`Encontrados ${clientesSnapshot.size} clientes para atualizar métricas.`);
        
        let processedCount = 0;
        let errorCount = 0;
        
        for (const clienteDoc of clientesSnapshot.docs) {
            try {
                await updateClientConversionMetrics(clienteDoc.id);
                processedCount++;
                console.log(`✅ Métricas atualizadas para cliente: ${clienteDoc.id}`);
            } catch (error) {
                errorCount++;
                console.error(`❌ Erro ao atualizar métricas do cliente ${clienteDoc.id}:`, error);
            }
        }
        
        res.status(200).json({ 
            message: `Atualização de métricas concluída. ${processedCount} clientes processados, ${errorCount} erros.`,
            processed: processedCount,
            errors: errorCount
        });
    } catch (error) {
        console.error('❌ Erro na API de atualização de métricas de todos os clientes:', error);
        res.status(500).json({ error: 'Erro interno ao atualizar métricas de conversão.' });
    }
});

// Endpoint para configurar WhatsApp comercial de um usuário
app.post('/api/set-whatsapp-comercial', async (req, res) => {
    const { userId, whatsappNumber } = req.body;
    
    if (!userId || !whatsappNumber) {
        return res.status(400).json({ error: 'userId e whatsappNumber são obrigatórios.' });
    }
    
    try {
        console.log(`🔧 Configurando WhatsApp comercial ${whatsappNumber} para usuário ${userId}...`);
        
        const { db } = require('./firebaseService');
        
        // Verificar se o usuário existe
        const userDoc = await db.collection('usuarios').doc(userId).get();
        if (!userDoc.exists) {
            return res.status(404).json({ error: 'Usuário não encontrado.' });
        }
        
        // Atualizar o whatsapp_comercial
        await db.collection('usuarios').doc(userId).update({
            whatsapp_comercial: whatsappNumber
        });
        
        console.log(`✅ WhatsApp comercial configurado com sucesso para ${userDoc.data().email}: ${whatsappNumber}`);
        
        res.status(200).json({ 
            message: 'WhatsApp comercial configurado com sucesso.',
            userId,
            whatsappNumber,
            userEmail: userDoc.data().email
        });
    } catch (error) {
        console.error('❌ Erro ao configurar WhatsApp comercial:', error);
        res.status(500).json({ error: 'Erro interno ao configurar WhatsApp comercial.' });
    }
});

// Endpoint de debug para verificar dados no Firestore
// Endpoint de teste para verificar leitura de mensagens de um contato específico
app.get('/api/test-messages/:contactId', async (req, res) => {
    try {
        const { contactId } = req.params;
        console.log(`[TEST] Testando leitura de mensagens para contato: ${contactId}`);
        
        // Verificar se há bot ativo
        const botKeys = Array.from(activeBots.keys());
        if (botKeys.length === 0) {
            return res.json({
                success: false,
                error: 'Nenhum bot ativo encontrado',
                activeBots: botKeys
            });
        }
        
        const whatsappNumber = botKeys[0];
        const client = activeBots.get(whatsappNumber);
        
        if (!client) {
            return res.json({
                success: false,
                error: 'Cliente WhatsApp não encontrado',
                whatsappNumber
            });
        }
        
        console.log(`[TEST] Usando bot: ${whatsappNumber}`);
        
        // Tentar obter mensagens do contato
        const messagesResult = await client.getAllMessagesInChat(contactId);
        console.log(`[TEST] Resultado getAllMessagesInChat:`, typeof messagesResult, Array.isArray(messagesResult));
        
        let messages = [];
        if (Array.isArray(messagesResult)) {
            messages = messagesResult;
        } else if (messagesResult && typeof messagesResult === 'object') {
            // Se for um objeto, tentar extrair array de mensagens
            messages = messagesResult.messages || messagesResult.data || [];
        }
        
        console.log(`[TEST] Total de mensagens encontradas: ${messages.length}`);
        
        // Pegar apenas as últimas 5 mensagens para teste
        const recentMessages = messages.slice(-5).map(msg => ({
            id: msg.id,
            body: msg.body || msg.content || '',
            timestamp: msg.timestamp,
            fromMe: msg.fromMe,
            type: msg.type
        }));
        
        res.json({
            success: true,
            contactId,
            whatsappNumber,
            totalMessages: messages.length,
            recentMessages,
            rawResultType: typeof messagesResult,
            isArray: Array.isArray(messagesResult)
        });
        
    } catch (error) {
        console.error('[TEST] Erro ao testar mensagens:', error);
        res.status(500).json({
            success: false,
            error: error.message,
            stack: error.stack
        });
    }
});

// Endpoint para enviar mensagem para um contato
app.post('/api/send-message/:contactId', async (req, res) => {
    try {
        const { contactId } = req.params;
        const { message } = req.body;
        
        if (!message) {
            return res.status(400).json({ success: false, error: 'Mensagem é obrigatória' });
        }
        
        console.log(`[SEND] Enviando mensagem para contato: ${contactId}`);
        
        // Verificar se há bot ativo
        const activeBotsArray = Array.from(activeBots.keys());
        if (activeBotsArray.length === 0) {
            return res.status(400).json({ 
                success: false, 
                error: 'Nenhum bot ativo encontrado',
                activeBots: activeBotsArray 
            });
        }
        
        // Usar o primeiro bot ativo (ou você pode implementar lógica para escolher o bot correto)
        const whatsappNumber = activeBotsArray[0];
        const client = activeBots.get(whatsappNumber);
        
        if (!client) {
            return res.status(400).json({ 
                success: false, 
                error: 'Cliente do bot não encontrado',
                whatsappNumber 
            });
        }
        
        // Extrair apenas o número do telefone do contactId (remover @c.us se presente)
        const phoneNumber = contactId.replace('@c.us', '');
        
        // Enviar mensagem
        await enviarMensagem(client, phoneNumber, message);
        
        res.json({ 
            success: true, 
            contactId,
            whatsappNumber,
            message: 'Mensagem enviada com sucesso'
        });
        
    } catch (error) {
        console.error('Erro ao enviar mensagem:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Erro interno do servidor',
            details: error.message 
        });
    }
});

// Endpoint para testar contexto das mensagens de um cliente específico
app.get('/api/test-context/:contactId', async (req, res) => {
    try {
        const { contactId } = req.params;
        const phoneNumber = contactId.replace('@c.us', '');
        
        console.log(`🔍 Testando contexto para cliente: ${contactId}`);
        
        // Encontrar qual bot está ativo para este número
        let activeBot = null;
        let whatsappNumber = null;
        
        for (const [number, client] of activeBots.entries()) {
            // Verificar se este bot tem acesso ao cliente
            try {
                const operatorUser = await require('./botManager').findOperatorByPhone ? 
                    await require('./botManager').findOperatorByPhone(number) : null;
                
                if (operatorUser) {
                    const { db } = require('./firebaseService');
                    const clienteSnapshot = await db.collection('clientes')
                        .where('usuario_id', '==', operatorUser.usuario_id)
                        .where('telefone', '==', phoneNumber)
                        .get();
                    
                    if (!clienteSnapshot.empty) {
                        activeBot = client;
                        whatsappNumber = number;
                        break;
                    }
                }
            } catch (error) {
                console.log(`Erro ao verificar bot ${number}:`, error.message);
            }
        }
        
        if (!activeBot) {
            return res.status(404).json({ 
                error: 'Nenhum bot ativo encontrado para este cliente',
                contactId,
                phoneNumber
            });
        }
        
        console.log(`✅ Bot encontrado: ${whatsappNumber}`);
        
        // Buscar todas as mensagens do chat
        const messagesResult = await activeBot.getAllMessagesInChat(contactId, true, false);
        const messages = Array.isArray(messagesResult) ? messagesResult : [];
        
        if (!messages || messages.length === 0) {
            return res.json({
                success: true,
                contactId,
                whatsappNumber,
                totalMessages: 0,
                context: 'Nenhuma mensagem encontrada para este cliente',
                messages: []
            });
        }
        
        // Ordenar mensagens por timestamp
        messages.sort((a, b) => a.timestamp - b.timestamp);
        
        // Pegar as últimas 30 mensagens para contexto (como na função original)
        const contextHistory = messages.slice(-30);
        
        // Criar resumo contextual da conversa
        const conversationSummary = contextHistory
            .map(msg => {
                const sender = msg.fromMe ? 'Operador' : 'Cliente';
                const timestamp = new Date(msg.timestamp * 1000).toLocaleString('pt-BR');
                const body = msg.body || '[Mensagem sem texto]';
                return `[${timestamp}] ${sender}: ${body}`;
            })
            .join('\n');
        
        // Identificar mensagens não respondidas
        const unrespondedMessages = [];
        let lastOperatorMessageTimestamp = 0;
        
        for (const message of messages) {
            if (message.isGroupMsg) continue;
            
            if (message.fromMe) {
                lastOperatorMessageTimestamp = message.timestamp;
            } else {
                // Mensagem do cliente
                if (message.timestamp > lastOperatorMessageTimestamp) {
                    unrespondedMessages.push({
                        id: message.id,
                        body: message.body,
                        timestamp: message.timestamp,
                        date: new Date(message.timestamp * 1000).toLocaleString('pt-BR')
                    });
                }
            }
        }
        
        res.json({
            success: true,
            contactId,
            whatsappNumber,
            totalMessages: messages.length,
            contextMessages: contextHistory.length,
            unrespondedMessages: unrespondedMessages.length,
            conversationSummary,
            unrespondedDetails: unrespondedMessages,
            lastMessages: contextHistory.slice(-10).map(msg => ({
                sender: msg.fromMe ? 'Operador' : 'Cliente',
                body: msg.body || '[Mensagem sem texto]',
                timestamp: new Date(msg.timestamp * 1000).toLocaleString('pt-BR')
            }))
        });
        
    } catch (error) {
        console.error('❌ Erro ao testar contexto:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Erro interno do servidor',
            details: error.message 
        });
    }
});

// Endpoint para listar clientes disponíveis para teste
app.get('/api/list-clients', async (req, res) => {
    try {
        const clientsList = [];
        
        // Verificar todos os bots ativos
        for (const [whatsappNumber, client] of activeBots.entries()) {
            try {
                const operatorUser = await require('./botManager').findOperatorByPhone(whatsappNumber);
                
                if (operatorUser) {
                    const { db } = require('./firebaseService');
                    const clientesSnapshot = await db.collection('clientes')
                        .where('usuario_id', '==', operatorUser.usuario_id)
                        .limit(10)
                        .get();
                    
                    clientesSnapshot.forEach(doc => {
                        const cliente = doc.data();
                        const telefone = cliente.telefone || doc.id.replace('@c.us', '');
                        clientsList.push({
                            id: doc.id,
                            nome: cliente.nome || telefone,
                            telefone: telefone,
                            contactId: `${telefone}@c.us`,
                            whatsappNumber: whatsappNumber
                        });
                    });
                }
            } catch (error) {
                console.log(`Erro ao listar clientes do bot ${whatsappNumber}:`, error.message);
            }
        }
        
        res.json({
            success: true,
            totalClients: clientsList.length,
            clients: clientsList
        });
        
    } catch (error) {
        console.error('❌ Erro ao listar clientes:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Erro interno do servidor',
            details: error.message 
        });
    }
});

// Endpoint de teste simples
app.get('/api/test-simple', (req, res) => {
    console.log('🔍 Endpoint de teste simples chamado');
    res.json({
        success: true,
        message: 'Endpoint funcionando',
        activeBots: activeBots.size,
        botKeys: Array.from(activeBots.keys())
    });
});

// Endpoint simplificado para testar contexto de qualquer número
app.get('/api/test-context-simple/:contactId', async (req, res) => {
    try {
        const { contactId } = req.params;
        const phoneNumber = contactId.replace('@c.us', '');
        
        console.log(`🔍 Testando contexto simples para: ${contactId}`);
        console.log(`📊 Bots ativos disponíveis: ${activeBots.size}`);
        console.log(`📊 Chaves dos bots ativos: ${Array.from(activeBots.keys()).join(', ')}`);
        
        // Usar o primeiro bot ativo disponível
        const firstBotClient = Array.from(activeBots.values())[0];
        
        if (!firstBotClient) {
            return res.status(404).json({ 
                error: 'Nenhum bot ativo encontrado',
                contactId,
                phoneNumber,
                debug: {
                    activeBots: activeBots.size,
                    botKeys: Array.from(activeBots.keys())
                }
            });
        }
        
        console.log(`✅ Usando bot ativo`);
        
        // Buscar todas as mensagens do chat
        const messagesResult = await firstBotClient.getAllMessagesInChat(contactId, true, false);
        const messages = Array.isArray(messagesResult) ? messagesResult : [];
        
        if (!messages || messages.length === 0) {
            return res.json({
                success: true,
                contactId,
                totalMessages: 0,
                context: 'Nenhuma mensagem encontrada para este cliente',
                messages: []
            });
        }
        
        // Ordenar mensagens por timestamp
        messages.sort((a, b) => a.timestamp - b.timestamp);
        
        // Pegar as últimas 30 mensagens para contexto
        const contextHistory = messages.slice(-30);
        
        // Criar resumo contextual da conversa
        const conversationSummary = contextHistory
            .map(msg => {
                const sender = msg.fromMe ? 'Operador' : 'Cliente';
                const timestamp = new Date(msg.timestamp * 1000).toLocaleString('pt-BR');
                const body = msg.body || '[Mensagem sem texto]';
                return `[${timestamp}] ${sender}: ${body}`;
            })
            .join('\n');
        
        // Identificar mensagens não respondidas
        const unrespondedMessages = [];
        let lastOperatorMessageTimestamp = 0;
        
        for (const message of messages) {
            if (message.isGroupMsg) continue;
            
            if (message.fromMe) {
                lastOperatorMessageTimestamp = message.timestamp;
            } else {
                // Mensagem do cliente
                if (message.timestamp > lastOperatorMessageTimestamp) {
                    unrespondedMessages.push({
                        id: message.id,
                        body: message.body,
                        timestamp: message.timestamp,
                        date: new Date(message.timestamp * 1000).toLocaleString('pt-BR')
                    });
                }
            }
        }
        
        res.json({
            success: true,
            contactId,
            totalMessages: messages.length,
            contextMessages: contextHistory.length,
            unrespondedMessages: unrespondedMessages.length,
            conversationSummary,
            unrespondedDetails: unrespondedMessages,
            lastMessages: contextHistory.slice(-10).map(msg => ({
                sender: msg.fromMe ? 'Operador' : 'Cliente',
                body: msg.body || '[Mensagem sem texto]',
                timestamp: new Date(msg.timestamp * 1000).toLocaleString('pt-BR')
            }))
        });
        
    } catch (error) {
        console.error('❌ Erro ao testar contexto simples:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Erro interno do servidor',
            details: error.message 
        });
    }
});

// Endpoint para adicionar/atualizar nomes de contatos
app.post('/api/add-contact-name', async (req, res) => {
    try {
        const { telefone, nome } = req.body;
        
        if (!telefone || !nome) {
            return res.status(400).json({ 
                error: 'Telefone e nome são obrigatórios',
                required: ['telefone', 'nome']
            });
        }
        
        const { db } = require('./firebaseService');
        
        // Adicionar/atualizar na coleção 'nomes'
        const contactId = `${telefone}@c.us`;
        await db.collection('nomes').doc(contactId).set({
            telefone: telefone,
            nome: nome,
            atualizado_em: new Date(),
            criado_em: new Date()
        }, { merge: true });
        
        console.log(`📝 Nome adicionado: ${nome} para ${telefone}`);
        
        res.json({
            success: true,
            message: 'Nome do contato adicionado/atualizado com sucesso',
            contactId,
            telefone,
            nome
        });
        
    } catch (error) {
        console.error('❌ Erro ao adicionar nome do contato:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Erro interno do servidor',
            details: error.message 
        });
    }
});

// Endpoint para buscar nome de um contato
app.get('/api/get-contact-name/:telefone', async (req, res) => {
    try {
        const { telefone } = req.params;
        const contactId = `${telefone}@c.us`;
        
        const { db } = require('./firebaseService');
        
        const nomeDoc = await db.collection('nomes').doc(contactId).get();
        
        if (!nomeDoc.exists) {
            return res.status(404).json({
                success: false,
                error: 'Nome não encontrado para este contato',
                contactId,
                telefone
            });
        }
        
        const nomeData = nomeDoc.data();
        
        res.json({
            success: true,
            contactId,
            telefone,
            nome: nomeData.nome,
            atualizado_em: nomeData.atualizado_em,
            criado_em: nomeData.criado_em
        });
        
    } catch (error) {
        console.error('❌ Erro ao buscar nome do contato:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Erro interno do servidor',
            details: error.message 
        });
    }
});

// Endpoint para listar todos os nomes de contatos
app.get('/api/list-contact-names', async (req, res) => {
    try {
        const { db } = require('./firebaseService');
        
        const nomesSnapshot = await db.collection('nomes').get();
        const nomes = [];
        
        nomesSnapshot.forEach(doc => {
            const data = doc.data();
            nomes.push({
                contactId: doc.id,
                telefone: data.telefone,
                nome: data.nome,
                atualizado_em: data.atualizado_em,
                criado_em: data.criado_em
            });
        });
        
        res.json({
            success: true,
            total: nomes.length,
            nomes: nomes
        });
        
    } catch (error) {
        console.error('❌ Erro ao listar nomes dos contatos:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Erro interno do servidor',
            details: error.message 
        });
    }
});

app.get('/api/debug-firestore', async (req, res) => {
    try {
        console.log('🔍 DEBUG - Verificando dados no Firestore...');
        
        const { db } = require('./firebaseService');
        
        // Verificar usuários
        const usuariosSnapshot = await db.collection('usuarios').get();
        console.log('👥 Total de usuários:', usuariosSnapshot.size);
        
        // Verificar se existe usuário com ID específico
        const usuarioEspecificoDoc = await db.collection('usuarios').doc('JiT5kY6xIYWLhiGwRMhP').get();
        const usuarioEspecifico = usuarioEspecificoDoc.exists ? {
            id: usuarioEspecificoDoc.id,
            ...usuarioEspecificoDoc.data()
        } : null;
        
        // Verificar clientes
        const clientesSnapshot = await db.collection('clientes').get();
        console.log('👤 Total de clientes:', clientesSnapshot.size);
        
        const clientesData = [];
        const tarefasCount = {};
        const usuarioIdsUnicos = [...new Set(clientesSnapshot.docs.map(doc => doc.data().usuario_id).filter(id => id))];
        
        for (const clienteDoc of clientesSnapshot.docs) {
            const clienteData = clienteDoc.data();
            clientesData.push({
                id: clienteDoc.id,
                usuario_id: clienteData.usuario_id,
                nome: clienteData.nome,
                telefone: clienteData.telefone,
                taxa_conversao: clienteData.taxa_conversao || 0
            });
            
            // Contar tarefas para cada cliente
            const tarefasSnapshot = await db.collection('clientes').doc(clienteDoc.id).collection('tarefas').get();
            tarefasCount[clienteDoc.id] = tarefasSnapshot.size;
        }
        
        // Verificar tarefas de alguns clientes
        const clientesComTarefas = [];
        const primeiros5Clientes = clientesData.slice(0, 5);
        
        for (const cliente of primeiros5Clientes) {
            const tarefasSnapshot = await db.collection('clientes').doc(cliente.id).collection('tarefas').get();
            const tarefas = tarefasSnapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            
            clientesComTarefas.push({
                cliente_id: cliente.id,
                nome: cliente.nome,
                total_tarefas: tarefas.length,
                tarefas: tarefas.slice(0, 3) // Apenas as primeiras 3 tarefas
            });
        }

        const debugInfo = {
            usuarios: {
                total: usuariosSnapshot.size,
                dados: usuariosSnapshot.docs.map(doc => ({
                    id: doc.id,
                    email: doc.data().email,
                    whatsapp_comercial: doc.data().whatsapp_comercial
                }))
            },
            usuario_especifico: usuarioEspecifico,
            clientes: {
                total: clientesSnapshot.size,
                dados: clientesData,
                usuario_ids_unicos: usuarioIdsUnicos
            },
            clientes_com_tarefas: clientesComTarefas,
            tarefas: tarefasCount,
            timestamp: new Date().toISOString()
        };
        
        console.log('📊 Debug info:', JSON.stringify(debugInfo, null, 2));
        res.json(debugInfo);
        
    } catch (error) {
        console.error('❌ Erro no debug do Firestore:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

// Função para enviar QR code para o frontend via SSE
function sendQrCodeToFrontend(whatsappNumber, base64Qrimg, asciiQR, urlCode) {
    console.log(`📱 QR Code gerado para ${whatsappNumber}`);
    console.log('QR Code ASCII:');
    console.log(asciiQR);
    console.log(`🔗 URL de conexão: ${urlCode}`);
    
    // Armazenar QR code
    qrCodes.set(whatsappNumber, {
        base64Qrimg,
        asciiQR,
        urlCode,
        timestamp: new Date().toISOString()
    });
    
    // Enviar para conexões SSE ativas
    const connections = sseConnections.get(whatsappNumber) || [];
    const data = JSON.stringify({
        whatsappNumber,
        base64Qrimg,
        asciiQR,
        urlCode,
        timestamp: new Date().toISOString()
    });
    
    connections.forEach(res => {
        try {
            res.write(`data: ${data}\n\n`);
        } catch (error) {
            console.error('Erro ao enviar QR via SSE:', error);
        }
    });
    
    console.log(`📡 QR Code enviado via SSE para ${connections.length} conexão(ões) ativa(s)`);
}

listenForOperatorChanges(sendQrCodeToFrontend);
setupDailyTasks();

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Backend rodando na porta ${PORT}`);
});
