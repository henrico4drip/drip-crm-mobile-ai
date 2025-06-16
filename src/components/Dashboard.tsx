
import React, { useEffect, useState } from 'react';
import { collection, query, where, orderBy, onSnapshot, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { Cliente, Tarefa } from '@/types';
import ClientCard from './ClientCard';
import ClientDetails from './ClientDetails';
import RetroactiveAIAnalysis from './RetroactiveAIAnalysis';
import { Button } from '@/components/ui/button';
import { LogOut, AlertCircle, RefreshCw } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';

const Dashboard: React.FC = () => {
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [selectedCliente, setSelectedCliente] = useState<Cliente | null>(null);
  const [clientTaskCounts, setClientTaskCounts] = useState<{[key: string]: number}>({});
  const [indexError, setIndexError] = useState(false);
  const [loading, setLoading] = useState(true);
  const { user, userData, logout } = useAuth();

  useEffect(() => {
    if (!user) return;

    console.log('🔍 DASHBOARD - Iniciando busca de clientes');
    console.log('- User UID:', user.uid);
    console.log('- User Email:', user.email);
    
    setLoading(true);
    setIndexError(false);

    const loadClientsAndTasks = async () => {
      try {
        console.log('📋 STEP 1 - Buscando clientes...');
        
        // Buscar clientes do usuário
        const clientesQuery = query(
          collection(db, 'clientes'),
          where('usuario_id', '==', user.uid)
        );
        
        const clientesSnapshot = await getDocs(clientesQuery);
        console.log('✅ Clientes encontrados:', clientesSnapshot.size);
        
        if (clientesSnapshot.empty) {
          console.log('❌ Nenhum cliente encontrado para o usuário:', user.uid);
          setClientes([]);
          setClientTaskCounts({});
          setLoading(false);
          return;
        }

        // Processar clientes
        const clientesData: Cliente[] = [];
        const taskCounts: {[key: string]: number} = {};

        for (const clienteDoc of clientesSnapshot.docs) {
          const clienteData = clienteDoc.data();
          const cliente: Cliente = {
            cliente_id: clienteDoc.id,
            ...clienteData
          } as Cliente;
          
          console.log(`📋 Cliente encontrado: ${cliente.nome} (ID: ${clienteDoc.id})`);
          clientesData.push(cliente);

          // Buscar tarefas pendentes para este cliente
          console.log(`🔍 STEP 2 - Buscando tarefas para cliente: ${cliente.nome}`);
          
          try {
            const tarefasQuery = query(
              collection(db, 'clientes', clienteDoc.id, 'tarefas'),
              where('status', '==', 'pendente'),
              orderBy('data_criacao', 'desc')
            );
            
            const tarefasSnapshot = await getDocs(tarefasQuery);
            const pendingCount = tarefasSnapshot.size;
            
            console.log(`📊 Cliente ${cliente.nome} - Tarefas pendentes: ${pendingCount}`);
            
            // Log detalhado das tarefas
            tarefasSnapshot.docs.forEach((tarefaDoc, index) => {
              const tarefaData = tarefaDoc.data();
              console.log(`📋 Tarefa ${index + 1}:`, {
                id: tarefaDoc.id,
                status: tarefaData.status,
                mensagem_preview: tarefaData.mensagem_recebida?.substring(0, 30) + '...',
                data_criacao: tarefaData.data_criacao?.toDate?.()?.toLocaleString(),
                cliente_nome: tarefaData.cliente_nome,
                cliente_telefone: tarefaData.cliente_telefone
              });
            });
            
            taskCounts[clienteDoc.id] = pendingCount;
            
          } catch (tarefaError) {
            console.error(`❌ Erro ao buscar tarefas do cliente ${cliente.nome}:`, tarefaError);
            taskCounts[clienteDoc.id] = 0;
          }
        }

        // Ordenar clientes por última mensagem
        try {
          clientesData.sort((a, b) => {
            const timeA = a.timestamp_ultima_mensagem?.toDate?.() || new Date(0);
            const timeB = b.timestamp_ultima_mensagem?.toDate?.() || new Date(0);
            return timeB.getTime() - timeA.getTime();
          });
          console.log('✅ Clientes ordenados por última mensagem');
        } catch (error) {
          console.log('⚠️ Erro ao ordenar clientes, mantendo ordem original:', error);
        }

        console.log('📊 RESUMO FINAL:');
        console.log('- Total de clientes:', clientesData.length);
        console.log('- Contagem de tarefas por cliente:', taskCounts);
        console.log('- Total de tarefas pendentes:', Object.values(taskCounts).reduce((a, b) => a + b, 0));
        
        setClientes(clientesData);
        setClientTaskCounts(taskCounts);
        setLoading(false);
        
      } catch (error) {
        console.error('❌ Erro geral ao carregar dados:', error);
        
        if (error.code === 'failed-precondition' && error.message.includes('index')) {
          console.log('⚠️ Erro de índice detectado');
          setIndexError(true);
        }
        
        setLoading(false);
      }
    };

    loadClientsAndTasks();
  }, [user]);

  const handleLogout = async () => {
    try {
      await logout();
    } catch (error) {
      console.error('Erro ao fazer logout:', error);
    }
  };

  const retryWithIndex = () => {
    console.log('🔄 Tentando novamente...');
    setIndexError(false);
    setLoading(true);
    window.location.reload();
  };

  if (selectedCliente) {
    return (
      <ClientDetails 
        cliente={selectedCliente} 
        onBack={() => setSelectedCliente(null)} 
      />
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-blue-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-6xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                CRM WhatsApp com IA 🤖
              </h1>
              <p className="text-gray-600">
                Gerencie seus clientes e mensagens com sugestões automáticas
              </p>
            </div>
            <div className="flex items-center space-x-4">
              <div className="text-right">
                <p className="text-sm text-gray-600">Olá, {userData?.email || user?.email}</p>
                <p className="text-xs text-gray-500">
                  {clientes.length} clientes • {Object.values(clientTaskCounts).reduce((a, b) => a + b, 0)} tarefas pendentes
                </p>
              </div>
              <Button
                variant="outline"
                onClick={handleLogout}
                className="flex items-center space-x-2"
              >
                <LogOut className="w-4 h-4" />
                <span>Sair</span>
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        
        {/* Alert para problema de índice */}
        {indexError && (
          <Alert className="border-yellow-200 bg-yellow-50">
            <AlertCircle className="h-4 w-4 text-yellow-600" />
            <AlertDescription className="text-yellow-800">
              <div className="space-y-2">
                <p className="font-medium">📋 Índice necessário</p>
                <p className="text-sm">
                  O Firebase precisa de um índice para ordenação. Funcionando sem ordenação por enquanto.
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={retryWithIndex}
                  className="text-xs"
                >
                  <RefreshCw className="w-3 h-3 mr-1" />
                  Tentar novamente
                </Button>
              </div>
            </AlertDescription>
          </Alert>
        )}

        {/* Debug Info */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h3 className="font-medium text-blue-800 mb-2">🔍 Status do Sistema</h3>
          <div className="text-sm text-blue-700 space-y-1">
            <p><strong>👤 Usuário:</strong> {user?.email} (UID: {user?.uid})</p>
            <p><strong>📊 Clientes:</strong> {clientes.length}</p>
            <p><strong>📋 Tarefas Pendentes:</strong> {Object.values(clientTaskCounts).reduce((a, b) => a + b, 0)}</p>
            <p><strong>🔄 Status:</strong> {loading ? 'Carregando...' : 'Pronto'}</p>
          </div>
          <div className="mt-3 p-3 bg-blue-100 rounded text-xs text-blue-800">
            <p><strong>💡 Para debug:</strong> Abra o Console (F12) e procure por logs que começam com "🔍 DASHBOARD"</p>
          </div>
        </div>

        {/* Análise Retroativa */}
        <RetroactiveAIAnalysis />

        {/* Lista de Clientes */}
        <div>
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            Seus Clientes
          </h2>
          
          {loading ? (
            <div className="text-center py-12">
              <div className="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full mx-auto mb-4"></div>
              <p className="text-gray-600">Carregando clientes e tarefas...</p>
            </div>
          ) : clientes.length === 0 ? (
            <div className="text-center py-12">
              <div className="text-gray-400 text-6xl mb-4">📱</div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                Nenhum cliente encontrado
              </h3>
              <p className="text-gray-600 mb-4">
                Aguardando mensagens do WhatsApp...
              </p>
              <div className="bg-gray-50 p-4 rounded-lg text-left max-w-md mx-auto">
                <p className="text-sm text-gray-700 mb-2"><strong>Verificações:</strong></p>
                <ul className="text-xs text-gray-600 space-y-1">
                  <li>• O Venom está rodando?</li>
                  <li>• O usuario_id está sendo salvo como: "{user?.uid}"?</li>
                  <li>• Verifique o console para logs detalhados</li>
                </ul>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {clientes.map((cliente) => (
                <ClientCard
                  key={cliente.cliente_id}
                  cliente={cliente}
                  pendingTasksCount={clientTaskCounts[cliente.cliente_id] || 0}
                  onClick={() => setSelectedCliente(cliente)}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
