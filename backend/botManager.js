// botManager.js
const venom = require('venom-bot');
const admin = require('firebase-admin'); // Certifique-se de que o Firebase Admin já foi inicializado em outro lugar ou aqui
const axios = require('axios'); // Para a função gerarRespostaIA
const cron = require('node-cron'); // Para agendamento
const { db } = require('./firebaseService'); // Assumindo que você tem um firebaseService.js
const { gerarRespostaIA } = require('./aiService'); // Assumindo um aiService.js

// Map para armazenar as instâncias ativas do Venom-Bot
// Key: whatsapp_number, Value: client (venom-bot instance)
const activeBots = new Map();

// Flag para controlar a execução da varredura retroativa na inicialização
// Defina como 'false' APÓS a primeira execução bem-sucedida de cada bot
const RUN_RETROACTIVE_SCAN_ON_STARTUP = true;

// --- Funções Auxiliares (adaptadas do seu código original) ---

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
            criado_em: admin.firestore.FieldValue.serverTimestamp()
        };
        const docRef = await clientesRef.add(novoCliente);
        return { cliente_id: docRef.id, ...novoCliente };
    } catch (error) {
        console.error('❌ Erro ao obter/criar cliente:', error);
        throw error;
    }
}

async function saveMensagemAsTarefa(clienteId, message, isRetroactive = false) {
    try {
        const iaResposta = await gerarRespostaIA(message.body || '');
        const tarefa = {
            mensagem_recebida: message.body || '',
            mensagem_sugerida: iaResposta,
            status: isRetroactive ? 'pendente_retroativa' : 'pendente',
            data_criacao: admin.firestore.FieldValue.serverTimestamp(),
            timestamp_mensagem_original: new Date(message.timestamp * 1000),
            tags: ['venom-bot', 'recebida'],
            follow_up: false,
            metadata: {
                message_id: message.id,
                from: message.from,
                type: message.type,
                notify_name: message.notifyName,
                is_retroactive: isRetroactive
            }
        };

        if (isRetroactive) {
            tarefa.tags.push('retroativa');
        } else {
            tarefa.tags.push('nova');
        }

        const tarefaRef = await db.collection('clientes').doc(clienteId).collection('tarefas').add(tarefa);

        const clienteDocRef = db.collection('clientes').doc(clienteId);
        const clienteDoc = await clienteDocRef.get();
        const currentLastTimestamp = clienteDoc.data()?.timestamp_ultima_mensagem?.toDate()?.getTime() || 0;
        const messageTimestampMs = message.timestamp * 1000;

        if (messageTimestampMs > currentLastTimestamp) {
            await clienteDocRef.update({
                ultima_mensagem: message.body || '',
                timestamp_ultima_mensagem: admin.firestore.FieldValue.serverTimestamp()
            });
        }
        console.log('📝 Tarefa criada com sucesso:', tarefaRef.id);
        return tarefaRef.id;
    } catch (error) {
        console.error('❌ Erro ao salvar tarefa:', error);
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

// Adaptação da sua função de varredura retroativa
async function scanMessagesAndCreateTasks(client, whatsappNumber, isInitialScan = false) {
    console.log(`🔍 Iniciando varredura de mensagens para ${whatsappNumber} (Inicial: ${isInitialScan})...`);

    let clientes = [];
    try {
        // Obter apenas clientes associados a este operador
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

    console.log(`Encontrados ${clientes.length} clientes para ${whatsappNumber}. Processando histórico...`);

    for (const cliente of clientes) {
        const clientPhoneNumber = cliente.telefone + '@c.us';
        console.log(`\n--- Processando histórico do cliente: ${cliente.nome} (${cliente.telefone}) para ${whatsappNumber} ---`);

        try {
            // No futuro, para varreduras diárias, esta busca pode ser otimizada para pegar apenas novas mensagens
            const messages = await client.getAllMessagesInChat(clientPhoneNumber, true, false);

            if (!messages || messages.length === 0) {
                console.log(`   Nenhuma mensagem encontrada para o cliente ${cliente.nome}.`);
                continue;
            }

            messages.sort((a, b) => a.timestamp - b.timestamp);

            let lastOperatorMessageTimestamp = 0;
            // Se for uma varredura inicial (ao conectar o QR), consideramos todas as mensagens.
            // Se não for inicial (varredura agendada), precisamos de um ponto de corte.
            // Por enquanto, vamos manter a lógica atual de "não respondida".
            // TODO: Implementar lógica de "apenas novas mensagens desde a última varredura" para as tarefas agendadas.

            for (let i = 0; i < messages.length; i++) {
                const message = messages[i];

                if (message.isGroupMsg) continue;

                if (message.fromMe) {
                    lastOperatorMessageTimestamp = message.timestamp;
                } else {
                    const messageTimestampMs = message.timestamp * 1000;

                    if (messageTimestampMs > lastOperatorMessageTimestamp * 1000) {
                        const existingTasksSnapshot = await db.collection('clientes')
                            .doc(cliente.cliente_id)
                            .collection('tarefas')
                            .where('metadata.message_id', '==', message.id)
                            .get();

                        if (existingTasksSnapshot.empty) {
                            console.log(`   -> Mensagem não respondida identificada: "${message.body ? message.body.substring(0, 50) + '...' : '[Mensagem sem corpo]'}" (ID: ${message.id})`);
                            await saveMensagemAsTarefa(cliente.cliente_id, message, isInitialScan); // Use isInitialScan para status
                        } else {
                            console.log(`   -> Tarefa já existe para mensagem: "${message.body ? message.body.substring(0, 50) + '...' : '[Mensagem sem corpo]'}" (ID: ${message.id})`);
                        }
                    }
                }
            }
        } catch (error) {
            console.error(`❌ Erro crítico ao processar histórico do cliente ${cliente.nome} (${cliente.telefone}) para ${whatsappNumber}:`, error);
        }
    }
    console.log(`✅ Varredura de mensagens para ${whatsappNumber} concluída.`);
}

// --- Funções de Gerenciamento do Bot ---

/**
 * Inicia uma instância do Venom-Bot para um número de WhatsApp específico.
 * @param {string} whatsappNumber O número de telefone do WhatsApp (ex: 555195980420).
 * @param {Function} qrCallback Callback para enviar o QR Code ao frontend.
 * @returns {Promise<any>} A instância do cliente Venom-Bot.
 */
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
            headless: false, // Mantenha 'false' para ver o navegador durante o dev
            devtools: false,
            useChrome: true,
            debug: false,
            logQR: false, // Desabilite aqui para controlar o envio do QR via callback
            browserWS: '',
            updatesLog: true,
            autoClose: 60000,
            createPathFileToken: true,
            whatsappNumber: whatsappNumber, // Propriedade personalizada
            // Callback para o QR Code
            catchQR: (base64Qrimg, asciiQR, attempts, urlCode) => {
                console.log(`QR Code gerado para ${whatsappNumber}. Tentativas: ${attempts}`);
                if (qrCallback) {
                    qrCallback(whatsappNumber, base64Qrimg, asciiQR, urlCode);
                }
            }
        });

        console.log(`✅ Venom-Bot para ${whatsappNumber} conectado com sucesso!`);
        activeBots.set(whatsappNumber, client);

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

        // --- Varredura inicial de mensagens assim que o bot conecta ---
        if (RUN_RETROACTIVE_SCAN_ON_STARTUP) {
            console.log(`🔄 Iniciando varredura inicial de mensagens para ${whatsappNumber}...`);
            await scanMessagesAndCreateTasks(client, whatsappNumber, true); // Passa 'true' para isInitialScan
            console.log(`✅ Varredura inicial de mensagens concluída para ${whatsappNumber}.`);
            // Se quiser desativar a varredura retroativa APÓS a primeira execução,
            // você precisaria de um mecanismo para persistir esse estado (ex: no Firestore para o usuário).
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
                await saveMensagemAsTarefa(clienteData.cliente_id, message, false); // Não é retroativa, é em tempo real
            } catch (error) {
                console.error(`❌ Erro ao processar mensagem em tempo real para ${whatsappNumber}:`, error);
            }
        });

        client.onStateChange((state) => {
            console.log(`📱 Estado do WhatsApp para ${whatsappNumber}:`, state);
            if (state === 'CLOSED' || state === 'DISCONNECTED') {
                console.log(`❗ Instância do bot para ${whatsappNumber} foi ${state}.`);
                activeBots.delete(whatsappNumber); // Remove a instância desconectada
                // Idealmente, notifique o frontend que a sessão caiu e precisa de re-autenticação
                // Ou implemente uma lógica de re-conexão robusta aqui, com limites de tentativas
                console.log(`Recomendado: Notificar frontend para re-autenticação do número ${whatsappNumber}.`);
            } else if (state === 'QRCODE') {
                 console.log(`QR Code re-gerado para ${whatsappNumber}. Por favor, escaneie novamente.`);
                 // O catchQR já deveria lidar com isso, mas um log extra ajuda.
            }
        });

        return client;

    } catch (error) {
        console.error(`❌ Erro ao iniciar Venom-Bot para ${whatsappNumber}:`, error);
        // Em caso de erro, remova o bot do mapa para que possa ser tentado novamente
        activeBots.delete(whatsappNumber);
        return null;
    }
}

/**
 * Para uma instancia do Venom-Bot.
 * @param {string} whatsappNumber
 */
async function stopVenomBot(whatsappNumber) {
    const client = activeBots.get(whatsappNumber);
    if (client) {
        try {
            await client.close();
            activeBots.delete(whatsappNumber);
            console.log(`🛑 Bot para ${whatsappNumber} parado com sucesso.`);
        } catch (error) {
            console.error(`❌ Erro ao parar bot para ${whatsappNumber}:`, error);
        }
    }
}

/**
 * Monitora a coleção 'usuarios' no Firestore para iniciar/parar bots dinamicamente.
 * @param {Function} qrCallback Callback para enviar o QR Code ao frontend.
 */
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

        // 1. Parar bots que não estão mais no Firestore
        for (const [number, client] of activeBots.entries()) {
            if (!currentNumbersInDb.has(number)) {
                console.log(`Detected that ${number} is no longer in Firestore. Stopping bot.`);
                await stopVenomBot(number);
            }
        }

        // 2. Iniciar bots para novos números ou números que precisam ser reiniciados
        for (const number of currentNumbersInDb) {
            if (!activeBots.has(number)) {
                console.log(`Detected new or restarted number ${number} in Firestore. Starting bot.`);
                await startVenomBot(number, qrCallback);
            }
            // Se já estiver ativo, não faz nada. O onStateChange lida com desconexões.
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
    activeBots, // Exporte para que o scheduler possa acessar
    scanMessagesAndCreateTasks, // Exporte para que o scheduler possa usar
    enviarMensagem // Exporte para que outras partes do app possam enviar mensagens
};
