
import React, { useEffect, useState } from 'react';
import { collection, query, orderBy, onSnapshot, addDoc, updateDoc, doc, serverTimestamp, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Cliente, Tarefa } from '@/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, MessageSquare, Send, CheckCircle, Clock } from 'lucide-react';
import { openWhatsAppWithMessage } from '@/services/whatsapp';
import { generateSuggestedMessage } from '@/services/openrouter';
import { useToast } from '@/hooks/use-toast';

interface ClientDetailsProps {
  cliente: Cliente;
  onBack: () => void;
}

const ClientDetails: React.FC<ClientDetailsProps> = ({ cliente, onBack }) => {
  const [tarefas, setTarefas] = useState<Tarefa[]>([]);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    const q = query(
      collection(db, 'clientes', cliente.cliente_id, 'tarefas'),
      orderBy('data_criacao', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const tarefasData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Tarefa[];
      setTarefas(tarefasData);
    });

    return unsubscribe;
  }, [cliente.cliente_id]);

  const handleSendMessage = async (tarefa: Tarefa) => {
    try {
      openWhatsAppWithMessage(cliente.telefone, tarefa.mensagem_sugerida);
      
      if (tarefa.id) {
        await updateDoc(doc(db, 'clientes', cliente.cliente_id, 'tarefas', tarefa.id), {
          status: 'enviada'
        });
      }
      
      toast({
        title: "WhatsApp aberto!",
        description: "A mensagem foi enviada para o WhatsApp.",
      });
    } catch (error) {
      console.error('Erro ao enviar mensagem:', error);
      toast({
        title: "Erro",
        description: "Erro ao abrir o WhatsApp.",
        variant: "destructive",
      });
    }
  };

  const handleCompleteTask = async (tarefa: Tarefa) => {
    try {
      if (tarefa.id) {
        await updateDoc(doc(db, 'clientes', cliente.cliente_id, 'tarefas', tarefa.id), {
          status: 'concluída'
        });
      }
      
      toast({
        title: "Tarefa concluída!",
        description: "A tarefa foi marcada como concluída.",
      });
    } catch (error) {
      console.error('Erro ao concluir tarefa:', error);
      toast({
        title: "Erro",
        description: "Erro ao concluir a tarefa.",
        variant: "destructive",
      });
    }
  };

  const handleGenerateTask = async () => {
    setLoading(true);
    try {
      const mensagemSugerida = await generateSuggestedMessage(cliente.ultima_mensagem);
      
      await addDoc(collection(db, 'clientes', cliente.cliente_id, 'tarefas'), {
        mensagem_recebida: cliente.ultima_mensagem,
        mensagem_sugerida: mensagemSugerida,
        status: 'pendente',
        data_criacao: serverTimestamp(),
        tags: ['ia-gerada'],
        follow_up: false
      });

      toast({
        title: "Nova tarefa criada!",
        description: "Uma resposta foi gerada pela IA.",
      });
    } catch (error) {
      console.error('Erro ao gerar tarefa:', error);
      toast({
        title: "Erro",
        description: "Erro ao gerar nova tarefa.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
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
    return date.toLocaleString('pt-BR');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-blue-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <div className="flex items-center space-x-4">
            <Button variant="ghost" size="sm" onClick={onBack}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Voltar
            </Button>
            <div>
              <h1 className="text-xl font-bold text-gray-900">{cliente.nome}</h1>
              <p className="text-sm text-gray-600">{cliente.telefone}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        {/* Última Mensagem */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <MessageSquare className="w-5 h-5" />
              <span>Última Mensagem Recebida</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="bg-gray-50 p-4 rounded-lg mb-4">
              <p className="text-gray-900">{cliente.ultima_mensagem}</p>
              <div className="flex items-center text-xs text-gray-500 mt-2">
                <Clock className="w-3 h-3 mr-1" />
                {formatTime(cliente.timestamp_ultima_mensagem)}
              </div>
            </div>
            <Button 
              onClick={handleGenerateTask}
              disabled={loading}
              className="bg-gradient-to-r from-blue-500 to-green-500 hover:from-blue-600 hover:to-green-600"
            >
              {loading ? 'Gerando...' : 'Gerar Nova Resposta com IA'}
            </Button>
          </CardContent>
        </Card>

        {/* Tarefas */}
        <Card>
          <CardHeader>
            <CardTitle>Tarefas e Mensagens Sugeridas</CardTitle>
          </CardHeader>
          <CardContent>
            {tarefas.length === 0 ? (
              <div className="text-center py-8">
                <MessageSquare className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-500">Nenhuma tarefa encontrada</p>
                <p className="text-sm text-gray-400">Gere uma nova resposta com IA</p>
              </div>
            ) : (
              <div className="space-y-4">
                {tarefas.map((tarefa) => (
                  <div key={tarefa.id} className="border rounded-lg p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <Badge className={getStatusColor(tarefa.status)}>
                        {tarefa.status}
                      </Badge>
                      <span className="text-xs text-gray-500">
                        {formatTime(tarefa.data_criacao)}
                      </span>
                    </div>
                    
                    <div className="space-y-3">
                      <div>
                        <p className="text-sm font-medium text-gray-700 mb-1">Mensagem recebida:</p>
                        <p className="text-sm text-gray-600 bg-gray-50 p-2 rounded">
                          {tarefa.mensagem_recebida}
                        </p>
                      </div>
                      
                      <div>
                        <p className="text-sm font-medium text-gray-700 mb-1">Resposta sugerida:</p>
                        <p className="text-sm text-gray-900 bg-blue-50 p-3 rounded border-l-4 border-blue-500">
                          {tarefa.mensagem_sugerida}
                        </p>
                      </div>
                    </div>
                    
                    <div className="flex space-x-2 pt-2">
                      <Button
                        size="sm"
                        onClick={() => handleSendMessage(tarefa)}
                        disabled={tarefa.status === 'concluída'}
                        className="bg-green-500 hover:bg-green-600"
                      >
                        <Send className="w-4 h-4 mr-2" />
                        Enviar no WhatsApp
                      </Button>
                      
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleCompleteTask(tarefa)}
                        disabled={tarefa.status === 'concluída'}
                        className="hover:bg-green-50 hover:border-green-200"
                      >
                        <CheckCircle className="w-4 h-4 mr-2" />
                        Marcar como Concluída
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default ClientDetails;
