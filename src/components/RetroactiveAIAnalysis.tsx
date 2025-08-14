// src/components/RetroactiveAIAnalysis.tsx
import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Bot, MessageCircle, BarChart3 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import axios from 'axios';

interface RetroactiveAIAnalysisProps {
  onAnalysisComplete: () => void;
}

const RetroactiveAIAnalysis: React.FC<RetroactiveAIAnalysisProps> = ({ onAnalysisComplete }) => {
  const [loading, setLoading] = useState(false);
  const [updatingMetrics, setUpdatingMetrics] = useState(false);
  const [reprocessingContextual, setReprocessingContextual] = useState(false);
  const { user } = useAuth();
  const { toast } = useToast();

  const analyzeOldConversations = async () => {
    if (!user) {
      toast({
        title: "Atenção",
        description: "Você precisa estar logado para iniciar a análise.",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);

    try {
      console.log('🔍 ANÁLISE RETROATIVA - Iniciando reprocessamento de todas as tarefas via API... (frontend)');
      
      const response = await axios.post('http://localhost:3000/api/reprocess-all-pending-tasks');

      toast({
        title: "Reprocessamento Iniciado! 🎉",
        description: response.data.message,
      });

      onAnalysisComplete();

    } catch (error: any) {
      console.error('❌ REPROCESSAMENTO DE TAREFAS - Erro na API:', error.response?.data?.error || error.message);
      toast({
        title: "Erro no reprocessamento",
        description: error.response?.data?.error || "Não foi possível iniciar o reprocessamento. Verifique o console e o backend.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const updateAllConversionMetrics = async () => {
    if (!user) {
      toast({
        title: "Atenção",
        description: "Você precisa estar logado para atualizar as métricas.",
        variant: "destructive",
      });
      return;
    }

    setUpdatingMetrics(true);

    try {
      console.log('📊 MÉTRICAS - Iniciando atualização de métricas de conversão de todos os clientes...');
      
      const response = await axios.post('http://localhost:3000/api/update-all-conversion-metrics');

      toast({
        title: "Métricas Atualizadas! 📊",
        description: response.data.message,
      });

      onAnalysisComplete();

    } catch (error: any) {
      console.error('❌ MÉTRICAS - Erro na API:', error.response?.data?.error || error.message);
      toast({
        title: "Erro na atualização de métricas",
        description: error.response?.data?.error || "Não foi possível atualizar as métricas. Verifique o console e o backend.",
        variant: "destructive",
      });
    } finally {
      setUpdatingMetrics(false);
    }
  };

  const reprocessContextualTasks = async () => {
    if (!user) {
      toast({
        title: "Atenção",
        description: "Você precisa estar logado para iniciar o reprocessamento contextualizado.",
        variant: "destructive",
      });
      return;
    }

    setReprocessingContextual(true);

    try {
      console.log('🔄 REPROCESSAMENTO CONTEXTUALIZADO - Iniciando reprocessamento contextualizado de todos os clientes...');
      
      const response = await axios.post('http://localhost:3000/api/reprocess-contextual-tasks');

      toast({
        title: "Reprocessamento Contextualizado Concluído! 🎯",
        description: response.data.message,
      });

      onAnalysisComplete();

    } catch (error: any) {
      console.error('❌ REPROCESSAMENTO CONTEXTUALIZADO - Erro na API:', error.response?.data?.error || error.message);
      toast({
        title: "Erro no reprocessamento contextualizado",
        description: error.response?.data?.error || "Não foi possível iniciar o reprocessamento contextualizado. Verifique o console e o backend.",
        variant: "destructive",
      });
    } finally {
      setReprocessingContextual(false);
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
        <div className="space-y-4">
          <p className="text-sm text-gray-600 mb-4">
            Analise e reprocesse conversas completas com contexto, atualize métricas de conversão e otimize o ranking dos clientes
          </p>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Button 
              onClick={analyzeOldConversations}
              disabled={loading}
              className="flex items-center justify-center space-x-2 h-12"
            >
              {loading ? (
                <>
                  <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full"></div>
                  <span>Analisando...</span>
                </>
              ) : (
                <>
                  <MessageCircle className="w-4 h-4" />
                  <span>Analisar Conversas</span>
                </>
              )}
            </Button>
            
            <Button 
              onClick={updateAllConversionMetrics}
              disabled={updatingMetrics}
              variant="outline"
              className="flex items-center justify-center space-x-2 h-12"
            >
              {updatingMetrics ? (
                <>
                  <div className="animate-spin w-4 h-4 border-2 border-gray-600 border-t-transparent rounded-full"></div>
                  <span>Atualizando...</span>
                </>
              ) : (
                <>
                  <BarChart3 className="w-4 h-4" />
                  <span>Atualizar Métricas</span>
                </>
              )}
            </Button>
            
            <Button 
              onClick={reprocessContextualTasks}
              disabled={reprocessingContextual}
              variant="secondary"
              className="flex items-center justify-center space-x-2 h-12"
            >
              {reprocessingContextual ? (
                <>
                  <div className="animate-spin w-4 h-4 border-2 border-gray-600 border-t-transparent rounded-full"></div>
                  <span>Reprocessando...</span>
                </>
              ) : (
                <>
                  <Bot className="w-4 h-4" />
                  <span>Reprocessar Contexto</span>
                </>
              )}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default RetroactiveAIAnalysis;
