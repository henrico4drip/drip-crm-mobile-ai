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
  const { user } = useAuth();
  const { toast } = useToast();

  const runUnifiedAnalysis = async () => {
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
      console.log('🔍 ANÁLISE UNIFICADA - Iniciando análise completa via API... (frontend)');
      
      const response = await axios.post('http://localhost:3000/api/unified-analysis');

      toast({
        title: "Análise Completa Iniciada! 🎉",
        description: response.data.message || "Análise unificada em andamento. Verifique o console para acompanhar o progresso.",
      });

      onAnalysisComplete();

    } catch (error: any) {
      console.error('❌ ANÁLISE UNIFICADA - Erro na API:', error.response?.data?.error || error.message);
      toast({
        title: "Erro na análise",
        description: error.response?.data?.error || "Não foi possível iniciar a análise. Verifique o console e o backend.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
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
            Análise completa com IA: processa conversas do inbox, atualiza métricas de conversão e prioriza clientes com maior potencial
          </p>
          
          <div className="flex justify-center">
            <Button 
              onClick={runUnifiedAnalysis}
              disabled={loading}
              className="flex items-center justify-center space-x-2 h-14 px-8 text-lg font-medium"
              size="lg"
            >
              {loading ? (
                <>
                  <div className="animate-spin w-5 h-5 border-2 border-white border-t-transparent rounded-full"></div>
                  <span>Analisando...</span>
                </>
              ) : (
                <>
                  <Bot className="w-5 h-5" />
                  <span>Iniciar Análise Completa</span>
                </>
              )}
            </Button>
          </div>
          
          <div className="text-xs text-gray-500 text-center space-y-1">
            <p>• Analisa apenas conversas do inbox (exclui grupos e status)</p>
            <p>• Avalia prioridade e potencial de conversão com IA</p>
            <p>• Atualiza métricas e rankings automaticamente</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default RetroactiveAIAnalysis;
