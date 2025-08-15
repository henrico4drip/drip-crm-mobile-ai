// src/components/ClientTasksDropdown.tsx
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
import axios from 'axios'; // Importar axios para a requisição API do backend

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
    
    // Buscar apenas tarefas de resumo pendentes
    const q = query(
      collection(db, 'clientes', clienteId, 'tarefas'),
      where('status', '==', 'pendente_sumario'), // Apenas tarefas de resumo
      orderBy('data_criacao', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      console.log('📝 Tarefas de resumo encontradas na subcoleção:', snapshot.size);
      
      const tarefasData = snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          ...data
        };
      }) as Tarefa[];
      
      setTarefas(tarefasData);
      setLoading(false);
    }, (error) => {
      console.error('❌ Erro ao carregar tarefas de resumo da subcoleção:', error);
      setLoading(false);
    });

    return unsubscribe;
  }, [clienteId, isOpen]);

  // Apenas as tarefas de resumo pendentes para a contagem no botão
  const pendingSummaryTasks = tarefas.filter(t => t.status === 'pendente_sumario');
  
  const markAsCompleted = async (tarefaId: string) => {
    try {
      await updateDoc(doc(db, 'clientes', clienteId, 'tarefas', tarefaId), {
        status: 'concluída',
        data_conclusao: new Date()
      });
      
      // Chamar o backend para atualizar as métricas de conversão
      try {
        await axios.post('http://localhost:3000/api/update-conversion-metrics', { clienteId });
      } catch (e) {
        console.warn('Não foi possível chamar update-conversion-metrics. Endpoint pode não estar ativo ou erro de rede.');
      }

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
      
      if (tarefa.id) {
        await updateDoc(doc(db, 'clientes', clienteId, 'tarefas', tarefa.id), {
          status: 'enviada',
          data_envio: new Date()
        });
        // Chamar o backend para atualizar as métricas de conversão
        try {
          await axios.post('http://localhost:3000/api/update-conversion-metrics', { clienteId });
        } catch (e) {
          console.warn('Não foi possível chamar update-conversion-metrics. Endpoint pode não estar ativo ou erro de rede.');
        }
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
      case 'pendente_sumario':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
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
        {pendingSummaryTasks.length > 0 && (
          <Badge className="bg-yellow-500 text-white text-xs px-1 py-0">
            {pendingSummaryTasks.length}
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
            ) : pendingSummaryTasks.length === 0 ? (
              <div className="text-center py-4">
                <Clock className="w-6 h-6 text-gray-400 mx-auto mb-2" />
                <p className="text-xs text-gray-500">Nenhuma tarefa de resumo pendente encontrada</p>
              </div>
            ) : (
              <div className="space-y-4 max-h-96 overflow-y-auto">
                {pendingSummaryTasks.map((tarefa) => (
                  <div key={tarefa.id} className="border rounded-lg p-3 space-y-3 bg-gray-50">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <Badge className={getStatusColor(tarefa.status)}>
                          {tarefa.status === 'pendente_sumario' && <Clock className="w-3 h-3 mr-1" />}
                          {tarefa.status === 'enviada' && <Send className="w-3 h-3 mr-1" />}
                          {tarefa.status === 'concluída' && <CheckCircle className="w-3 h-3 mr-1" />}
                          {tarefa.status === 'pendente_sumario' ? 'Resumo Pendente' : tarefa.status}
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
                    
                    {tarefa.mensagem_recebida && (
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <p className="text-xs font-medium text-gray-700">📩 Mensagens agrupadas (contexto):</p>
                          {tarefa.metadata && (
                            <div className="flex items-center space-x-2">
                              {tarefa.metadata.total_messages && (
                                <Badge className="bg-blue-100 text-blue-800 text-xs px-2 py-0">
                                  {tarefa.metadata.total_messages} msgs
                                </Badge>
                              )}
                              {tarefa.metadata.context_messages && (
                                <Badge className="bg-purple-100 text-purple-800 text-xs px-2 py-0">
                                  {tarefa.metadata.context_messages} contexto
                                </Badge>
                              )}
                              {(tarefa.metadata.type === 'contextual_summary' || tarefa.metadata.type === 'consolidated_conversation_summary' || tarefa.metadata.type === 'full_context_summary') && (
                                <Badge className="bg-green-100 text-green-800 text-xs px-2 py-0">
                                  🎯 Contextualizada
                                </Badge>
                              )}
                            </div>
                          )}
                        </div>
                        <p className="text-xs text-gray-900 bg-white p-2 rounded border-l-4 border-blue-500">
                          {tarefa.mensagem_recebida}
                        </p>
                        {tarefa.metadata?.message_ids && tarefa.metadata.message_ids.length > 1 && (
                          <p className="text-xs text-gray-500 mt-1">
                            💬 Esta tarefa agrupa {tarefa.metadata.message_ids.length} mensagens não respondidas em sequência
                          </p>
                        )}
                        
                        {/* Resumo Executivo da Conversa */}
                        {tarefa.metadata?.executive_summary && (
                          <div className="mt-3 p-3 bg-blue-50 rounded-lg border border-blue-200">
                            <h4 className="text-xs font-semibold text-blue-800 mb-2 flex items-center">
                              📊 Resumo da Conversa
                            </h4>
                            <div className="grid grid-cols-2 gap-2 text-xs">
                              <div className="bg-white p-2 rounded border">
                                <span className="font-medium text-gray-600">Total de mensagens:</span>
                                <span className="ml-1 text-gray-900">{tarefa.metadata.executive_summary.total_messages}</span>
                              </div>
                              {tarefa.metadata.executive_summary.unresponded_messages !== undefined && (
                                <div className="bg-white p-2 rounded border">
                                  <span className="font-medium text-gray-600">Não respondidas:</span>
                                  <span className="ml-1 text-red-600">{tarefa.metadata.executive_summary.unresponded_messages}</span>
                                </div>
                              )}
                              <div className="bg-white p-2 rounded border">
                                <span className="font-medium text-gray-600">Do cliente:</span>
                                <span className="ml-1 text-blue-600">{tarefa.metadata.executive_summary.client_messages}</span>
                              </div>
                              <div className="bg-white p-2 rounded border">
                                <span className="font-medium text-gray-600">Do operador:</span>
                                <span className="ml-1 text-green-600">{tarefa.metadata.executive_summary.operator_messages}</span>
                              </div>
                            </div>
                            
                            {tarefa.metadata.executive_summary.conversation_period && (
                              <div className="mt-2 p-2 bg-white rounded border">
                                <span className="font-medium text-gray-600 text-xs">Período:</span>
                                <span className="ml-1 text-gray-900 text-xs">{tarefa.metadata.executive_summary.conversation_period}</span>
                              </div>
                            )}
                            
                            {tarefa.metadata.executive_summary.last_interaction && (
                              <div className="mt-2 p-2 bg-white rounded border">
                                <span className="font-medium text-gray-600 text-xs">Última interação:</span>
                                <span className="ml-1 text-gray-900 text-xs">{tarefa.metadata.executive_summary.last_interaction}</span>
                              </div>
                            )}
                            
                            {tarefa.metadata.executive_summary.recent_client_messages && tarefa.metadata.executive_summary.recent_client_messages.length > 0 && (
                              <div className="mt-2">
                                <span className="font-medium text-gray-600 text-xs block mb-1">Últimas mensagens do cliente:</span>
                                <div className="space-y-1">
                                  {tarefa.metadata.executive_summary.recent_client_messages.map((msg, index) => {
                                    // Suporte aos dois formatos: string ou objeto
                                    const content = typeof msg === 'string' ? msg : msg.content;
                                    const timestamp = typeof msg === 'object' && msg.timestamp ? msg.timestamp : '';
                                    
                                    return (
                                      <div key={index} className="p-2 bg-white rounded border text-xs text-gray-700">
                                        <div className="italic">{content}</div>
                                        {timestamp && (
                                          <div className="text-xs text-gray-500 mt-1">{timestamp}</div>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            )}
                            
                            {tarefa.metadata.executive_summary.message_types && Object.keys(tarefa.metadata.executive_summary.message_types).length > 0 && (
                              <div className="mt-2">
                                <span className="font-medium text-gray-600 text-xs block mb-1">Tipos de mensagem:</span>
                                <div className="flex flex-wrap gap-1">
                                  {Object.entries(tarefa.metadata.executive_summary.message_types).map(([type, count]) => (
                                    <Badge key={type} className="bg-gray-100 text-gray-700 text-xs px-2 py-0">
                                      {type}: {count}
                                    </Badge>
                                  ))}
                                </div>
                              </div>
                            )}
                            
                            {tarefa.metadata.executive_summary.last_sender && (
                              <div className="mt-2 p-2 bg-white rounded border">
                                <span className="font-medium text-gray-600 text-xs">Último a enviar:</span>
                                <span className={`ml-1 text-xs font-medium ${
                                  tarefa.metadata.executive_summary.last_sender === 'Cliente' ? 'text-blue-600' : 'text-green-600'
                                }`}>
                                  {tarefa.metadata.executive_summary.last_sender}
                                </span>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                    
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
                    
                    {tarefa.status === 'pendente_sumario' && (
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
