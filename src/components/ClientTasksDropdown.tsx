
import React, { useState, useEffect } from 'react';
import { collection, query, orderBy, onSnapshot, doc, updateDoc, getDoc, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Tarefa } from '@/types';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { ChevronDown, Clock, CheckCircle, MessageCircle, Check, Send, Bot } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { openWhatsAppWithMessage } from '@/services/whatsapp';

interface ClientTasksDropdownProps {
  clienteId: string;
}

const ClientTasksDropdown: React.FC<ClientTasksDropdownProps> = ({ clienteId }) => {
  const [tarefas, setTarefas] = useState<Tarefa[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (!isOpen) return;

    console.log('📋 ClientTasksDropdown - Carregando tarefas para cliente:', clienteId);
    setLoading(true);
    
    // Buscar todas as tarefas da subcoleção deste cliente
    const q = query(
      collection(db, 'clientes', clienteId, 'tarefas'),
      orderBy('data_criacao', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      console.log('📝 Tarefas encontradas na subcoleção:', snapshot.size);
      
      const tarefasData = snapshot.docs.map(doc => {
        const data = doc.data();
        console.log('📋 Tarefa carregada:', {
          id: doc.id,
          status: data.status,
          mensagem_preview: data.mensagem_recebida?.substring(0, 30) + '...',
          data_criacao: data.data_criacao?.toDate?.()?.toLocaleString(),
          cliente_nome: data.cliente_nome,
          ai_generated: data.ai_generated
        });
        
        return {
          id: doc.id,
          ...data
        };
      }) as Tarefa[];
      
      setTarefas(tarefasData);
      setLoading(false);
    }, (error) => {
      console.error('❌ Erro ao carregar tarefas da subcoleção:', error);
      setLoading(false);
    });

    return unsubscribe;
  }, [clienteId, isOpen]);

  const pendingTasks = tarefas.filter(t => t.status === 'pendente');
  
  const markAsCompleted = async (tarefaId: string) => {
    try {
      console.log('✅ Marcando tarefa como concluída:', tarefaId);
      
      await updateDoc(doc(db, 'clientes', clienteId, 'tarefas', tarefaId), {
        status: 'concluída',
        data_conclusao: new Date()
      });
      
      toast({
        title: "Tarefa concluída! ✅",
        description: "A tarefa foi marcada como concluída com sucesso.",
      });
    } catch (error) {
      console.error('❌ Erro ao marcar tarefa como concluída:', error);
      toast({
        title: "Erro",
        description: "Não foi possível marcar a tarefa como concluída.",
        variant: "destructive",
      });
    }
  };

  const sendMessage = async (tarefa: Tarefa) => {
    try {
      if (!tarefa.mensagem_sugerida) {
        toast({
          title: "Erro",
          description: "Nenhuma mensagem sugerida disponível.",
          variant: "destructive",
        });
        return;
      }

      console.log('📱 Enviando mensagem via WhatsApp para cliente:', clienteId);
      
      // Pegar telefone do cliente (pode estar na tarefa ou buscar do documento do cliente)
      const clientPhone = tarefa.cliente_telefone || await getClientPhone(clienteId);
      
      if (!clientPhone) {
        toast({
          title: "Erro",
          description: "Telefone do cliente não encontrado.",
          variant: "destructive",
        });
        return;
      }
      
      openWhatsAppWithMessage(clientPhone, tarefa.mensagem_sugerida);
      
      // Marcar como enviada
      if (tarefa.id) {
        await updateDoc(doc(db, 'clientes', clienteId, 'tarefas', tarefa.id), {
          status: 'enviada',
          data_envio: new Date()
        });
      }
      
      toast({
        title: "WhatsApp aberto! 📱",
        description: "A mensagem sugerida foi enviada para o WhatsApp.",
      });
    } catch (error) {
      console.error('❌ Erro ao enviar mensagem:', error);
      toast({
        title: "Erro",
        description: "Não foi possível enviar a mensagem.",
        variant: "destructive",
      });
    }
  };

  const getClientPhone = async (clienteId: string): Promise<string> => {
    try {
      const clientDoc = await getDoc(doc(db, 'clientes', clienteId));
      return clientDoc.data()?.telefone || '';
    } catch (error) {
      console.error('Erro ao buscar telefone do cliente:', error);
      return '';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pendente': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'enviada': return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'concluída': return 'bg-green-100 text-green-800 border-green-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const formatTime = (timestamp: any) => {
    if (!timestamp) return '';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleString('pt-BR', { 
      day: '2-digit', 
      month: '2-digit', 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  };

  return (
    <div className="relative">
      <Button
        variant="outline"
        size="sm"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center space-x-2 text-xs"
      >
        <MessageCircle className="w-3 h-3" />
        <span>Ver Tarefas</span>
        {pendingTasks.length > 0 && (
          <Badge className="bg-yellow-500 text-white text-xs px-1 py-0">
            {pendingTasks.length}
          </Badge>
        )}
        <ChevronDown className={`w-3 h-3 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </Button>

      {isOpen && (
        <Card className="absolute top-full left-0 mt-2 w-[480px] z-50 shadow-xl border bg-white">
          <CardContent className="p-4">
            <h4 className="font-medium text-sm mb-3 flex items-center">
              <MessageCircle className="w-4 h-4 mr-2" />
              Mensagens e Sugestões IA
            </h4>
            
            {loading ? (
              <div className="text-center py-4">
                <div className="animate-spin w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full mx-auto"></div>
                <p className="text-xs text-gray-500 mt-2">Carregando tarefas...</p>
              </div>
            ) : tarefas.length === 0 ? (
              <div className="text-center py-4">
                <Clock className="w-6 h-6 text-gray-400 mx-auto mb-2" />
                <p className="text-xs text-gray-500">Nenhuma tarefa encontrada</p>
              </div>
            ) : (
              <div className="space-y-4 max-h-96 overflow-y-auto">
                {tarefas.map((tarefa) => (
                  <div key={tarefa.id} className="border rounded-lg p-3 space-y-3 bg-gray-50">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <Badge className={getStatusColor(tarefa.status)}>
                          {tarefa.status === 'pendente' && <Clock className="w-3 h-3 mr-1" />}
                          {tarefa.status === 'enviada' && <Send className="w-3 h-3 mr-1" />}
                          {tarefa.status === 'concluída' && <CheckCircle className="w-3 h-3 mr-1" />}
                          {tarefa.status}
                        </Badge>
                        {tarefa.ai_generated && (
                          <Badge className="bg-purple-100 text-purple-800 border-purple-200">
                            <Bot className="w-3 h-3 mr-1" />
                            IA
                          </Badge>
                        )}
                      </div>
                      <span className="text-xs text-gray-500">
                        {formatTime(tarefa.data_criacao)}
                      </span>
                    </div>
                    
                    {/* Cliente Info (se disponível) */}
                    {tarefa.cliente_nome && (
                      <div className="text-xs text-gray-600">
                        👤 {tarefa.cliente_nome} • 📱 {tarefa.cliente_telefone}
                      </div>
                    )}
                    
                    {/* Mensagem Recebida */}
                    <div>
                      <p className="text-xs font-medium text-gray-700 mb-1">📩 Mensagem recebida:</p>
                      <p className="text-xs text-gray-900 bg-white p-2 rounded border-l-4 border-blue-500">
                        {tarefa.mensagem_recebida}
                      </p>
                    </div>
                    
                    {/* Mensagem Sugerida */}
                    {tarefa.mensagem_sugerida && (
                      <div>
                        <p className="text-xs font-medium text-gray-700 mb-1 flex items-center">
                          <Bot className="w-3 h-3 mr-1" />
                          🤖 Resposta sugerida pela IA:
                        </p>
                        <p className="text-xs text-gray-900 bg-green-50 p-2 rounded border-l-4 border-green-500">
                          {tarefa.mensagem_sugerida}
                        </p>
                      </div>
                    )}
                    
                    {/* Botões de Ação */}
                    {tarefa.status === 'pendente' && (
                      <div className="flex justify-between pt-2 space-x-2">
                        {tarefa.mensagem_sugerida && (
                          <Button
                            size="sm"
                            onClick={() => sendMessage(tarefa)}
                            className="text-xs h-7 px-3 bg-green-600 hover:bg-green-700"
                          >
                            <Send className="w-3 h-3 mr-1" />
                            Enviar no WhatsApp
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => markAsCompleted(tarefa.id)}
                          className="text-xs h-7 px-3"
                        >
                          <Check className="w-3 h-3 mr-1" />
                          Marcar como concluída
                        </Button>
                      </div>
                    )}

                    {tarefa.status === 'enviada' && (
                      <div className="flex justify-end pt-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => markAsCompleted(tarefa.id)}
                          className="text-xs h-7 px-3"
                        >
                          <Check className="w-3 h-3 mr-1" />
                          Marcar como concluída
                        </Button>
                      </div>
                    )}

                    {/* Indicador de erro da IA */}
                    {tarefa.ai_error && (
                      <div className="text-xs text-red-600 bg-red-50 p-2 rounded">
                        ⚠️ Erro na IA: {tarefa.ai_error}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default ClientTasksDropdown;
