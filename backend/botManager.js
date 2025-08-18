const venom = require('venom-bot');
const { db } = require('./firebaseService');
const { analyzeMessagesWithAI } = require('./aiService');

// Configurações
const MAX_RETRIES = 3;
const RETRY_DELAY = 5000;
const RUN_RETROACTIVE_SCAN_ON_STARTUP = true;

// Armazenar instâncias dos bots
const botInstances = new Map();

// Função para encontrar operador por número de telefone
async function findOperatorByPhone(whatsappNumber) {
    console.log(`🔍 Buscando operador para o número: ${whatsappNumber}`);
    
    try {
        const usersSnapshot = await db.collection('users').get();
        
        for (const doc of usersSnapshot.docs) {
            const userData = doc.data();
            console.log(`👤 Verificando usuário ${doc.id}:`, {
                whatsapp_comercial: userData.whatsapp_comercial,
                phone: userData.phone
            });
            
            // Verificar se o whatsapp_comercial corresponde
            if (userData.whatsapp_comercial === whatsappNumber) {
                console.log(`✅ Operador encontrado: ${doc.id} (whatsapp_comercial: ${userData.whatsapp_comercial})`);
                return {
                    uid: doc.id,
                    ...userData
                };
            }
            
            // Verificar se o phone corresponde (fallback)
            if (userData.phone === whatsappNumber) {
                console.log(`✅ Operador encontrado via phone: ${doc.id} (phone: ${userData.phone})`);
                return {
                    uid: doc.id,
                    ...userData
                };
            }
        }
        
        console.log(`❌ Nenhum operador encontrado para o número: ${whatsappNumber}`);
        return null;
    } catch (error) {
        console.error('❌ Erro ao buscar operador:', error);
        return null;
    }
}

// Função para criar ou obter cliente
async function getOrCreateClient(phoneNumber, operatorUserId, contactName = null) {
    try {
        // Buscar cliente existente
        const clientsRef = db.collection('clients');
        const existingClientQuery = await clientsRef
            .where('phone', '==', phoneNumber)
            .where('operatorUserId', '==', operatorUserId)
            .get();

        if (!existingClientQuery.empty) {
            const existingClient = existingClientQuery.docs[0];
            console.log(`⏭️ Cliente já existe: ${contactName || 'Cliente'} (${phoneNumber})`);
            return {
                id: existingClient.id,
                ...existingClient.data(),
                created: false
            };
        }

        // Criar novo cliente
        const newClientData = {
            phone: phoneNumber,
            name: contactName || `Cliente (${phoneNumber})`,
            operatorUserId: operatorUserId,
            createdAt: new Date(),
            lastInteraction: new Date(),
            status: 'active',
            tags: [],
            notes: '',
            priority: 'medium'
        };

        const newClientRef = await clientsRef.add(newClientData);
        console.log(`✅ Novo cliente criado: ${contactName || 'Cliente'} (${phoneNumber})`);
        
        return {
            id: newClientRef.id,
            ...newClientData,
            created: true
        };
    } catch (error) {
        console.error('❌ Erro ao criar/obter cliente:', error);
        throw error;
    }
}

// Função para processar mensagem recebida de forma consolidada
async function processIncomingMessageConsolidated(message, whatsappNumber) {
    try {
        console.log(`📨 Processando mensagem de ${message.from} para ${whatsappNumber}`);
        
        // Encontrar operador
        const operator = await findOperatorByPhone(whatsappNumber);
        if (!operator) {
            console.log(`❌ Operador não encontrado para ${whatsappNumber}`);
            return;
        }

        // Extrair número do telefone (remover @c.us)
        const phoneNumber = message.from.replace('@c.us', '');
        
        // Obter ou criar cliente
        const client = await getOrCreateClient(phoneNumber, operator.uid, message.notifyName);
        
        // Criar tarefa se a mensagem não for do operador
        if (!message.fromMe) {
            const taskData = {
                clientId: client.id,
                operatorUserId: operator.uid,
                type: 'message_received',
                priority: 'high',
                status: 'pending',
                title: `Nova mensagem de ${client.name}`,
                description: message.body || '[Mídia]',
                createdAt: new Date(),
                dueDate: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 horas
                metadata: {
                    messageId: message.id,
                    messageType: message.type,
                    timestamp: message.timestamp
                }
            };

            await db.collection('tasks').add(taskData);
            console.log(`✅ Tarefa criada para mensagem de ${client.name}`);
        }

        // Atualizar última interação do cliente
        await db.collection('clients').doc(client.id).update({
            lastInteraction: new Date(),
            lastMessage: message.body || '[Mídia]'
        });

    } catch (error) {
        console.error('❌ Erro ao processar mensagem:', error);
    }
}

// Função para buscar mensagens de um chat específico
async function getMessagesFromChat(client, chatId, limit = 50) {
    try {
        console.log(`   🔄 Tentando loadAndGetAllMessagesInChat...`);
        
        // Tentar primeiro método: loadAndGetAllMessagesInChat
        try {
            const messages = await client.loadAndGetAllMessagesInChat(chatId, true, false);
            console.log(`   ✅ loadAndGetAllMessagesInChat retornou ${messages ? messages.length : 0} mensagens`);
            
            console.log(`   🔍 Debug - Tipo do resultado: ${typeof messages}`);
            console.log(`   🔍 Debug - É array: ${Array.isArray(messages)}`);
            console.log(`   🔍 Debug - Chaves do objeto: ${messages ? Object.keys(messages).join(', ') : 'null'}`);
            
            return messages || [];
        } catch (loadError) {
            console.log(`   ⚠️ loadAndGetAllMessagesInChat falhou: ${loadError.message}`);
            
            // Fallback: getAllMessagesInChat
            console.log(`   🔄 Tentando getAllMessagesInChat como fallback...`);
            const fallbackMessages = await client.getAllMessagesInChat(chatId, true, false);
            console.log(`   ✅ getAllMessagesInChat retornou ${fallbackMessages ? fallbackMessages.length : 0} mensagens`);
            
            return fallbackMessages || [];
        }
    } catch (error) {
        console.error(`   ❌ Erro ao buscar mensagens do chat ${chatId}:`, error.message);
        return [];
    }
}

// Função para filtrar mensagens do inbox (não grupos)
function filterInboxMessages(messages) {
    if (!Array.isArray(messages)) {
        console.log(`   ⚠️ Mensagens não é um array: ${typeof messages}`);
        return [];
    }
    
    const inboxMessages = messages.filter(msg => {
        // Filtrar apenas mensagens de conversas individuais (não grupos)
        const isGroup = msg.isGroupMsg || msg.from?.includes('@g.us') || msg.to?.includes('@g.us');
        return !isGroup;
    });
    
    console.log(`   Mensagens do inbox filtradas: ${inboxMessages.length} de ${messages.length} total`);
    return inboxMessages;
}

// Função para analisar mensagens e criar resumo contextual
async function analyzeAndCreateContextualSummary(messages, clientName, whatsappNumber) {
    try {
        if (!messages || messages.length === 0) {
            console.log(`   ⚠️ Nenhuma mensagem para analisar para ${clientName}`);
            return null;
        }

        // Separar mensagens por remetente
        const clientMessages = messages.filter(msg => !msg.fromMe);
        const operatorMessages = messages.filter(msg => msg.fromMe);

        console.log(`   📊 Análise detalhada das mensagens para ${clientName}:`);
        console.log(`      - Total de mensagens brutas: ${messages.length}`);
        console.log(`      - Mensagens do inbox (filtradas): ${messages.length}`);
        
        if (messages.length > 0) {
            const firstMsg = messages[0];
            const lastMsg = messages[messages.length - 1];
            const firstDate = new Date(firstMsg.timestamp * 1000).toLocaleString('pt-BR');
            const lastDate = new Date(lastMsg.timestamp * 1000).toLocaleString('pt-BR');
            console.log(`      - Período: ${firstDate} até ${lastDate}`);
        }
        
        console.log(`      - Mensagens do cliente: ${clientMessages.length}`);
        console.log(`      - Mensagens do operador: ${operatorMessages.length}`);

        // Preparar mensagens para análise
        const messagesToAnalyze = messages.slice(-20).map(msg => ({
            from: msg.fromMe ? 'Operador' : clientName,
            body: msg.body || '[Mídia]',
            timestamp: new Date(msg.timestamp * 1000).toLocaleString('pt-BR')
        }));

        console.log(`   📝 Processando todas as mensagens para criar resumo contextual...`);
        
        // Análise com IA
        console.log(`   📊 Análise de mensagens:`);
        console.log(`      - Mensagens do cliente: ${clientMessages.length}`);
        console.log(`      - Mensagens do operador: ${operatorMessages.length}`);
        
        // Mostrar algumas mensagens do cliente para debug
        if (clientMessages.length > 0) {
            console.log(`      Cliente 1: "${clientMessages[0].body?.substring(0, 100) || '[Mídia]'}${clientMessages[0].body?.length > 100 ? '...' : ''}"`;
        }
        
        const analysisResult = await analyzeMessagesWithAI(messagesToAnalyze, {
            clientName,
            whatsappNumber,
            totalMessages: messages.length,
            clientMessages: clientMessages.length,
            operatorMessages: operatorMessages.length
        });

        if (analysisResult && analysisResult.summary) {
            console.log(`   ✅ Resumo contextual criado para ${clientName} (${analysisResult.summary.length} caracteres)`);
            return analysisResult;
        } else {
            console.log(`   ⚠️ Análise de IA não retornou resumo válido para ${clientName}`);
            return null;
        }
    } catch (error) {
        console.error(`   ❌ Erro ao analisar mensagens para ${clientName}:`, error);
        return null;
    }
}

// Função para varrer mensagens e criar tarefas
async function scanMessagesAndCreateTasks(whatsappNumber) {
    try {
        console.log(`🔄 Iniciando varredura de mensagens para ${whatsappNumber}...`);
        
        const botInstance = botInstances.get(whatsappNumber);
        if (!botInstance) {
            console.log(`❌ Bot não encontrado para ${whatsappNumber}`);
            return;
        }

        // Encontrar operador
        const operator = await findOperatorByPhone(whatsappNumber);
        if (!operator) {
            console.log(`❌ Operador não encontrado para ${whatsappNumber}`);
            return;
        }

        // Buscar clientes existentes
        const clientsSnapshot = await db.collection('clients')
            .where('operatorUserId', '==', operator.uid)
            .get();

        const clientes = clientsSnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));

        console.log(`Encontrados ${clientes.length} clientes para ${whatsappNumber}. Processando histórico contextualizado...`);

        // Processar cada cliente
        for (const cliente of clientes) {
            try {
                console.log(`\n--- Processando histórico CONTEXTUALIZADO do cliente: ${cliente.name} (${cliente.phone}) para ${whatsappNumber} ---`);
                
                const chatId = `${cliente.phone}@c.us`;
                console.log(`   Buscando mensagens para ${chatId}...`);
                
                // Buscar mensagens do chat
                const messages = await getMessagesFromChat(botInstance, chatId);
                console.log(`   Total de mensagens encontradas: ${messages ? messages.length : 0}`);
                
                if (!messages || messages.length === 0) {
                    console.log(`   ⚠️ Nenhuma mensagem encontrada para o cliente ${cliente.name} (${chatId}).`);
                    console.log(`   Isso pode indicar que o chat não existe ou não há histórico de mensagens.`);
                    continue;
                }

                // Filtrar mensagens do inbox
                const inboxMessages = filterInboxMessages(messages);
                
                if (inboxMessages.length === 0) {
                    console.log(`   ⚠️ Nenhuma mensagem do inbox encontrada para ${cliente.name}`);
                    continue;
                }

                // Debug da primeira mensagem
                if (inboxMessages.length > 0) {
                    const firstMsg = inboxMessages[0];
                    console.log(`   🔍 Debug - Primeira mensagem:`);
                    console.log(`      - ID: ${firstMsg.id}`);
                    console.log(`      - From: ${firstMsg.from}`);
                    console.log(`      - Body: ${firstMsg.body?.substring(0, 100) || '[Mídia]'}${firstMsg.body?.length > 100 ? '...' : ''}`);
                    console.log(`      - Timestamp: ${firstMsg.timestamp}`);
                    console.log(`      - FromMe: ${firstMsg.fromMe}`);
                    console.log(`      - IsGroupMsg: ${firstMsg.isGroupMsg}`);
                }

                // Analisar mensagens e criar resumo contextual
                const analysisResult = await analyzeAndCreateContextualSummary(
                    inboxMessages, 
                    cliente.name, 
                    whatsappNumber
                );

                if (analysisResult) {
                    // Atualizar cliente com resumo contextual
                    await db.collection('clients').doc(cliente.id).update({
                        contextualSummary: analysisResult.summary,
                        lastAnalysis: new Date(),
                        messageCount: inboxMessages.length,
                        analysisMetadata: {
                            totalMessages: inboxMessages.length,
                            clientMessages: inboxMessages.filter(msg => !msg.fromMe).length,
                            operatorMessages: inboxMessages.filter(msg => msg.fromMe).length,
                            lastMessageDate: inboxMessages.length > 0 ? new Date(inboxMessages[inboxMessages.length - 1].timestamp * 1000) : null
                        }
                    });

                    console.log(`   ✅ Cliente ${cliente.name} atualizado com resumo contextual`);

                    // Criar tarefa se necessário (baseado na análise)
                    if (analysisResult.needsAttention) {
                        const taskData = {
                            clientId: cliente.id,
                            operatorUserId: operator.uid,
                            type: 'contextual_analysis',
                            priority: analysisResult.priority || 'medium',
                            status: 'pending',
                            title: `Análise contextual: ${cliente.name}`,
                            description: analysisResult.actionRequired || 'Cliente requer atenção baseado na análise contextual',
                            createdAt: new Date(),
                            dueDate: new Date(Date.now() + 24 * 60 * 60 * 1000),
                            metadata: {
                                analysisType: 'contextual_scan',
                                messageCount: inboxMessages.length,
                                summary: analysisResult.summary
                            }
                        };

                        await db.collection('tasks').add(taskData);
                        console.log(`   📋 Tarefa criada para ${cliente.name} baseada na análise contextual`);
                    }
                } else {
                    console.log(`   ⚠️ Não foi possível criar resumo contextual para ${cliente.name}`);
                }

            } catch (clientError) {
                console.error(`   ❌ Erro ao processar cliente ${cliente.name}:`, clientError);
            }
        }

        console.log(`✅ Varredura contextualizada concluída para ${whatsappNumber}`);
        
    } catch (error) {
        console.error(`❌ Erro na varredura de mensagens para ${whatsappNumber}:`, error);
    }
}

// Função para inicializar bot
async function initializeBot(whatsappNumber, retryCount = 0) {
    try {
        console.log(`🤖 Iniciando Venom-Bot para ${whatsappNumber}... (Tentativa ${retryCount + 1}/${MAX_RETRIES})`);
        
        const sessionName = `crm-alra-${whatsappNumber}`;
        
        const client = await venom.create(
            sessionName,
            (base64Qr, asciiQR, attempts, urlCode) => {
                console.log(`📱 QR Code para ${whatsappNumber} (tentativa ${attempts}):`);
                console.log(asciiQR);
            },
            (statusSession, session) => {
                console.log(`📊 Status da sessão ${session}: ${statusSession}`);
            },
            {
                headless: true,
                devtools: false,
                useChrome: true,
                debug: false,
                logQR: false,
                browserArgs: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-accelerated-2d-canvas',
                    '--no-first-run',
                    '--no-zygote',
                    '--disable-gpu'
                ],
                autoClose: 60000,
                createPathFileToken: true
            }
        );

        // Armazenar instância do bot
        botInstances.set(whatsappNumber, client);
        
        console.log(`✅ Venom-Bot para ${whatsappNumber} conectado com sucesso!`);
        
        // Configurar listener para mensagens recebidas
        client.onMessage((message) => {
            processIncomingMessageConsolidated(message, whatsappNumber);
        });

        // Configurar listener para mudanças de estado
        client.onStateChange((state) => {
            console.log(`🔄 Estado do bot ${whatsappNumber}: ${state}`);
        });

        // Executar varredura inicial se configurado
        if (RUN_RETROACTIVE_SCAN_ON_STARTUP) {
            console.log(`🔄 Iniciando varredura inicial de mensagens para ${whatsappNumber}...`);
            setTimeout(() => {
                scanMessagesAndCreateTasks(whatsappNumber);
                console.log(`✅ Varredura inicial de mensagens concluída para ${whatsappNumber}.`);
            }, 5000); // Aguardar 5 segundos para garantir que o bot esteja totalmente inicializado
        }

        return client;
        
    } catch (error) {
        console.error(`❌ Erro ao inicializar bot para ${whatsappNumber}:`, error);
        
        if (retryCount < MAX_RETRIES - 1) {
            console.log(`🔄 Tentando novamente em ${RETRY_DELAY/1000} segundos...`);
            await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
            return initializeBot(whatsappNumber, retryCount + 1);
        } else {
            console.error(`❌ Falha ao inicializar bot após ${MAX_RETRIES} tentativas`);
            throw error;
        }
    }
}

// Função para obter instância do bot
function getBotInstance(whatsappNumber) {
    return botInstances.get(whatsappNumber);
}

// Função para fechar bot
async function closeBot(whatsappNumber) {
    try {
        const client = botInstances.get(whatsappNumber);
        if (client) {
            await client.close();
            botInstances.delete(whatsappNumber);
            console.log(`✅ Bot ${whatsappNumber} fechado com sucesso`);
        }
    } catch (error) {
        console.error(`❌ Erro ao fechar bot ${whatsappNumber}:`, error);
    }
}

// Função para enviar mensagem
async function sendMessage(whatsappNumber, to, message) {
    try {
        const client = botInstances.get(whatsappNumber);
        if (!client) {
            throw new Error(`Bot não encontrado para ${whatsappNumber}`);
        }

        const chatId = to.includes('@') ? to : `${to}@c.us`;
        await client.sendText(chatId, message);
        
        console.log(`✅ Mensagem enviada de ${whatsappNumber} para ${to}`);
        return true;
    } catch (error) {
        console.error(`❌ Erro ao enviar mensagem:`, error);
        return false;
    }
}

// Função para obter contatos
async function getContacts(whatsappNumber) {
    try {
        const client = botInstances.get(whatsappNumber);
        if (!client) {
            throw new Error(`Bot não encontrado para ${whatsappNumber}`);
        }

        const contacts = await client.getAllContacts();
        return contacts;
    } catch (error) {
        console.error(`❌ Erro ao obter contatos:`, error);
        return [];
    }
}

// Função para obter chats
async function getChats(whatsappNumber) {
    try {
        const client = botInstances.get(whatsappNumber);
        if (!client) {
            throw new Error(`Bot não encontrado para ${whatsappNumber}`);
        }

        const chats = await client.getAllChats();
        return chats;
    } catch (error) {
        console.error(`❌ Erro ao obter chats:`, error);
        return [];
    }
}

module.exports = {
    initializeBot,
    getBotInstance,
    closeBot,
    sendMessage,
    getContacts,
    getChats,
    findOperatorByPhone,
    getOrCreateClient,
    processIncomingMessageConsolidated,
    scanMessagesAndCreateTasks
};