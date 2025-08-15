// Script para restaurar TODAS as coleções e dados necessários do Firebase
const { db, admin } = require('./firebaseService');

async function restoreCompleteData() {
    console.log('🔄 Restaurando TODAS as coleções e dados necessários do sistema...');
    
    try {
        // 1. Criar usuário padrão na coleção 'usuarios'
        console.log('\n👤 1. Criando usuário padrão na coleção "usuarios"...');
        const usuarioPadrao = {
            usuario_id: 'default-user-id',
            email: 'admin@sistema.com',
            whatsapp_comercial: '',
            ativo: true,
            criado_em: admin.firestore.FieldValue.serverTimestamp(),
            nome: 'Administrador',
            telefone: '',
            empresa: 'Sistema CRM'
        };
        
        await db.collection('usuarios').doc('default-user-id').set(usuarioPadrao);
        console.log('✅ Usuário padrão criado na coleção "usuarios".');
        
        // 2. Criar cliente de exemplo na coleção 'clientes'
        console.log('\n👥 2. Criando cliente de exemplo na coleção "clientes"...');
        const clienteExemplo = {
            cliente_id: 'cliente-exemplo-001',
            nome: 'Cliente Exemplo',
            telefone: '5511999999999',
            usuario_id: 'default-user-id',
            status: 'ativo',
            criado_em: admin.firestore.FieldValue.serverTimestamp(),
            ultima_interacao: admin.firestore.FieldValue.serverTimestamp(),
            tags: ['exemplo', 'teste'],
            metadata: {
                origem: 'sistema',
                canal: 'whatsapp'
            }
        };
        
        const clienteRef = await db.collection('clientes').add(clienteExemplo);
        const clienteId = clienteRef.id;
        console.log(`✅ Cliente exemplo criado na coleção "clientes" com ID: ${clienteId}`);
        
        // 3. Criar tarefa de exemplo na subcoleção 'tarefas' do cliente
        console.log('\n📋 3. Criando tarefa de exemplo na subcoleção "tarefas"...');
        const tarefaExemplo = {
            mensagem_recebida: 'Olá, gostaria de saber mais sobre seus produtos.',
            mensagem_sugerida: 'Olá! Fico feliz em ajudar você com informações sobre nossos produtos. Que tipo de produto você tem interesse?',
            status: 'pendente',
            data_criacao: admin.firestore.FieldValue.serverTimestamp(),
            timestamp_mensagem_original: admin.firestore.FieldValue.serverTimestamp(),
            tags: ['venom-bot', 'exemplo', 'nova'],
            follow_up: false,
            prioridade: 5,
            metadata: {
                cliente_telefone: '5511999999999',
                cliente_id: clienteId,
                operator_user_id: 'default-user-id',
                from: '5511999999999@c.us',
                type: 'chat',
                notify_name: 'Cliente Exemplo',
                is_retroactive: false,
                total_messages: 1,
                context_messages: 1,
                conversation_summary: 'Cliente interessado em produtos',
                unresponded_messages: 'Olá, gostaria de saber mais sobre seus produtos.'
            }
        };
        
        await db.collection('clientes').doc(clienteId).collection('tarefas').add(tarefaExemplo);
        console.log('✅ Tarefa exemplo criada na subcoleção "tarefas".');
        
        // 4. Criar coleção 'nomes' (usada pelo sistema)
        console.log('\n📝 4. Criando coleção "nomes"...');
        const nomeExemplo = {
            nome: 'Cliente Exemplo',
            telefone: '5511999999999',
            criado_em: admin.firestore.FieldValue.serverTimestamp(),
            usuario_id: 'default-user-id'
        };
        
        await db.collection('nomes').add(nomeExemplo);
        console.log('✅ Coleção "nomes" criada com exemplo.');
        
        // 5. Criar coleção 'qr_sessions' (para sessões QR do WhatsApp)
        console.log('\n📱 5. Criando coleção "qr_sessions"...');
        const qrSessionExemplo = {
            whatsapp_number: '',
            session_id: 'default-session',
            status: 'disconnected',
            qr_code: '',
            created_at: admin.firestore.FieldValue.serverTimestamp(),
            updated_at: admin.firestore.FieldValue.serverTimestamp(),
            user_id: 'default-user-id'
        };
        
        await db.collection('qr_sessions').doc('default-session').set(qrSessionExemplo);
        console.log('✅ Coleção "qr_sessions" criada.');
        
        // 6. Criar coleção 'whatsappBots' (para gerenciar bots)
        console.log('\n🤖 6. Criando coleção "whatsappBots"...');
        const botExemplo = {
            whatsapp_number: '',
            status: 'disconnected',
            user_id: 'default-user-id',
            created_at: admin.firestore.FieldValue.serverTimestamp(),
            updated_at: admin.firestore.FieldValue.serverTimestamp(),
            session_data: {},
            is_active: false
        };
        
        await db.collection('whatsappBots').doc('default-bot').set(botExemplo);
        console.log('✅ Coleção "whatsappBots" criada.');
        
        // 7. Criar coleção 'mensagens' (para histórico de mensagens)
        console.log('\n💬 7. Criando coleção "mensagens"...');
        const mensagemExemplo = {
            from: '5511999999999@c.us',
            to: 'default-user-id@c.us',
            body: 'Olá, gostaria de saber mais sobre seus produtos.',
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
            message_id: 'msg-exemplo-001',
            type: 'chat',
            cliente_id: clienteId,
            usuario_id: 'default-user-id',
            processed: true,
            created_at: admin.firestore.FieldValue.serverTimestamp()
        };
        
        await db.collection('mensagens').add(mensagemExemplo);
        console.log('✅ Coleção "mensagens" criada com exemplo.');
        
        // 8. Criar coleção 'scans' (para varreduras de mensagens)
        console.log('\n🔍 8. Criando coleção "scans"...');
        const scanExemplo = {
            user_id: 'default-user-id',
            whatsapp_number: '',
            scan_type: 'initial',
            status: 'completed',
            messages_processed: 0,
            tasks_created: 1,
            started_at: admin.firestore.FieldValue.serverTimestamp(),
            completed_at: admin.firestore.FieldValue.serverTimestamp(),
            error_message: null
        };
        
        await db.collection('scans').add(scanExemplo);
        console.log('✅ Coleção "scans" criada com exemplo.');
        
        // 9. Verificar todas as coleções criadas
        console.log('\n🔍 9. Verificando todas as coleções criadas...');
        const collections = ['usuarios', 'clientes', 'nomes', 'qr_sessions', 'whatsappBots', 'mensagens', 'scans'];
        
        for (const collectionName of collections) {
            const collectionRef = db.collection(collectionName);
            const snapshot = await collectionRef.limit(1).get();
            console.log(`  📁 Coleção '${collectionName}': ${snapshot.empty ? '❌ Vazia' : '✅ Contém dados'}`);
        }
        
        // 10. Verificar subcoleção de tarefas
        console.log('\n📋 10. Verificando subcoleção "tarefas"...');
        const tarefasSnapshot = await db.collection('clientes').doc(clienteId).collection('tarefas').limit(1).get();
        console.log(`  📁 Subcoleção 'tarefas': ${tarefasSnapshot.empty ? '❌ Vazia' : '✅ Contém dados'}`);
        
        console.log('\n🎉 RESTAURAÇÃO COMPLETA CONCLUÍDA!');
        console.log('✨ Todas as coleções e dados necessários foram restaurados:');
        console.log('   📁 usuarios - Usuários do sistema');
        console.log('   📁 clientes - Clientes e seus dados');
        console.log('   📁 clientes/{id}/tarefas - Tarefas/mensagens por cliente');
        console.log('   📁 nomes - Cache de nomes de clientes');
        console.log('   📁 qr_sessions - Sessões QR do WhatsApp');
        console.log('   📁 whatsappBots - Gerenciamento de bots');
        console.log('   📁 mensagens - Histórico de mensagens');
        console.log('   📁 scans - Registro de varreduras');
        console.log('\n📝 Agora você pode:');
        console.log('   - Fazer login no sistema');
        console.log('   - Configurar seu WhatsApp');
        console.log('   - Receber mensagens e criar tarefas');
        console.log('   - Ver o cliente exemplo no dashboard');
        
    } catch (error) {
        console.error('❌ Erro durante a restauração:', error);
    } finally {
        process.exit(0);
    }
}

// Executar a restauração
restoreCompleteData();