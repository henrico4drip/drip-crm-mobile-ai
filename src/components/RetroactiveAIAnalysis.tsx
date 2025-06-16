
import React, { useState } from 'react';
import { collection, query, where, getDocs, updateDoc, doc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Bot, Clock, MessageCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const RetroactiveAIAnalysis: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<any[]>([]);
  const { user } = useAuth();
  const { toast } = useToast();

  const analyzeOldConversations = async () => {
    if (!user) return;

    setLoading(true);
    setResults([]);

    try {
      console.log('🔍 ANÁLISE RETROATIVA - Iniciando...');
      console.log('👤 Usuário:', user.uid);
      
      // 1. Buscar todos os clientes do usuário (sem orderBy para evitar erro de índice)
      const clientesSnapshot = await getDocs(
        query(
          collection(db, 'clientes'),
          where('usuario_id', '==', user.uid)
        )
      );

      console.log('👥 ANÁLISE RETROATIVA - Clientes encontrados:', clientesSnapshot.size);

      if (clientesSnapshot.empty) {
        console.log('⚠️ ANÁLISE RETROATIVA - Nenhum cliente encontrado!');
        toast({
          title: "Nenhum cliente encontrado",
          description: "Não há clientes associados à sua conta para analisar.",
          variant: "destructive",
        });
        setLoading(false);
        return;
      }

      let totalTasksFound = 0;
      let tasksWithoutSuggestions = 0;
      const analysisResults: any[] = [];

      // 2. Para cada cliente, buscar tarefas sem sugestão
      for (const clienteDoc of clientesSnapshot.docs) {
        const clienteId = clienteDoc.id;
        const clienteData = clienteDoc.data();
        
        console.log('📋 ANÁLISE RETROATIVA - Analisando cliente:', clienteId, clienteData.nome);

        try {
          // Buscar TODAS as tarefas do cliente
          const tarefasSnapshot = await getDocs(
            collection(db, 'clientes', clienteId, 'tarefas')
          );

          console.log(`📝 ANÁLISE RETROATIVA - Tarefas encontradas para ${clienteData.nome}:`, tarefasSnapshot.size);

          totalTasksFound += tarefasSnapshot.size;

          for (const tarefaDoc of tarefasSnapshot.docs) {
            const tarefaData = tarefaDoc.data();
            
            // Log apenas dados serializáveis para evitar DataCloneError
            const tarefaInfo = {
              id: tarefaDoc.id,
              status: tarefaData.status,
              tem_mensagem_recebida: !!tarefaData.mensagem_recebida,
              tem_mensagem_sugerida: !!tarefaData.mensagem_sugerida,
              mensagem_preview: tarefaData.mensagem_recebida?.substring(0, 30) || 'N/A'
            };
            
            console.log(`📋 ANÁLISE RETROATIVA - Tarefa:`, tarefaInfo);
            
            // Verificar se não tem sugestão da IA ou se está vazia
            if (!tarefaData.mensagem_sugerida || tarefaData.mensagem_sugerida.trim() === '') {
              tasksWithoutSuggestions++;
              
              console.log('🤖 ANÁLISE RETROATIVA - Tarefa sem sugestão encontrada:', tarefaDoc.id);
              
              // Simular geração de sugestão da IA
              const suggestion = await generateAISuggestion(tarefaData.mensagem_recebida, clienteData.nome);
              
              if (suggestion) {
                try {
                  // Atualizar a tarefa com a nova sugestão
                  await updateDoc(doc(db, 'clientes', clienteId, 'tarefas', tarefaDoc.id), {
                    mensagem_sugerida: suggestion,
                    ai_generated: true,
                    data_ai_sugestao: new Date()
                  });

                  // Adicionar aos resultados com dados serializáveis
                  analysisResults.push({
                    clienteNome: clienteData.nome,
                    mensagemRecebida: tarefaData.mensagem_recebida,
                    mensagemSugerida: suggestion,
                    tarefaId: tarefaDoc.id
                  });

                  console.log('✅ ANÁLISE RETROATIVA - Sugestão salva para tarefa:', tarefaDoc.id);
                } catch (updateError) {
                  console.error('❌ Erro ao atualizar tarefa:', updateError);
                }
              }
            }
          }
        } catch (error) {
          console.error(`❌ ANÁLISE RETROATIVA - Erro ao analisar tarefas do cliente ${clienteId}:`, error);
        }
      }

      setResults(analysisResults);
      
      toast({
        title: "Análise concluída! 🎉",
        description: `Analisadas ${totalTasksFound} conversas. ${tasksWithoutSuggestions} receberam sugestões da IA.`,
      });

      console.log('✅ ANÁLISE RETROATIVA - Concluída:', {
        totalTasksFound,
        tasksWithoutSuggestions,
        suggestionsGenerated: analysisResults.length
      });

    } catch (error) {
      console.error('❌ ANÁLISE RETROATIVA - Erro:', error);
      toast({
        title: "Erro na análise",
        description: "Não foi possível analisar as conversas antigas. Verifique o console para mais detalhes.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const generateAISuggestion = async (mensagemRecebida: string, clienteNome: string): Promise<string> => {
    try {
      // Simular chamada para a IA (você pode integrar com o OpenRouter aqui)
      const suggestions = [
        `Olá ${clienteNome}! Obrigado pela sua mensagem. Como posso ajudá-lo hoje?`,
        `Oi ${clienteNome}! Vi sua mensagem sobre "${mensagemRecebida.substring(0, 30)}...". Vou verificar e te retorno em breve.`,
        `${clienteNome}, obrigado por entrar em contato! Estou analisando sua solicitação e retorno com uma resposta completa.`,
        `Olá ${clienteNome}! Recebi sua mensagem e vou te ajudar. Pode me dar mais detalhes sobre o que precisa?`
      ];
      
      // Simular delay da API
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      return suggestions[Math.floor(Math.random() * suggestions.length)];
    } catch (error) {
      console.error('❌ Erro ao gerar sugestão da IA:', error);
      return '';
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center space-x-2">
          <Bot className="w-5 h-5" />
          <span>Análise Retroativa com IA</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-600">
            Analise conversas antigas sem resposta e gere sugestões automáticas da IA
          </p>
          <Button 
            onClick={analyzeOldConversations}
            disabled={loading}
            className="flex items-center space-x-2"
          >
            {loading ? (
              <>
                <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full"></div>
                <span>Analisando...</span>
              </>
            ) : (
              <>
                <MessageCircle className="w-4 h-4" />
                <span>Analisar Conversas Antigas</span>
              </>
            )}
          </Button>
        </div>

        {results.length > 0 && (
          <div className="space-y-3">
            <h4 className="font-medium text-sm flex items-center">
              <Bot className="w-4 h-4 mr-2" />
              Sugestões Geradas ({results.length})
            </h4>
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {results.map((result, index) => (
                <div key={index} className="bg-gray-50 p-3 rounded-lg text-xs space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{result.clienteNome}</span>
                    <Badge className="bg-green-100 text-green-800">
                      <Bot className="w-3 h-3 mr-1" />
                      Nova sugestão
                    </Badge>
                  </div>
                  <div>
                    <p className="text-gray-600 mb-1">📩 Mensagem:</p>
                    <p className="text-gray-900">{result.mensagemRecebida}</p>
                  </div>
                  <div>
                    <p className="text-gray-600 mb-1">🤖 Sugestão da IA:</p>
                    <p className="text-green-700 bg-green-50 p-2 rounded">{result.mensagemSugerida}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default RetroactiveAIAnalysis;
