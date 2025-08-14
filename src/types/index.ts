// src/types/index.ts

// Definição dos tipos de status de tarefa
export type TarefaStatus = 'pendente' | 'pendente_retroativa' | 'enviada' | 'concluída' | 'consolidada' | 'pendente_sumario';

export interface Cliente {
  cliente_id: string;
  telefone: string;
  nome: string;
  usuario_id: string;
  timestamp_ultima_mensagem: any; // Firebase Timestamp
  criado_em: any; // Firebase Timestamp
  ultima_mensagem?: string;
  // Novos campos para ranking de conversão
  total_tarefas_resumo_geradas: number;
  total_tarefas_resumo_convertidas: number;
  taxa_conversao: number;
}

export interface Tarefa {
  id: string;
  mensagem_recebida: string;
  mensagem_sugerida: string;
  status: TarefaStatus; // Usando o novo tipo de status
  data_criacao: any; // Firebase Timestamp
  timestamp_mensagem_original: any; // Firebase Timestamp
  tags: string[];
  follow_up: boolean;
  metadata: {
    message_id?: string;
    message_ids?: string[]; // Array de IDs para tarefas contextualizadas
    from: string;
    type: string;
    notify_name?: string;
    is_retroactive: boolean;
    total_messages?: number; // Total de mensagens agrupadas
    context_messages?: number; // Número de mensagens de contexto
  };
  data_conclusao?: any; // Firebase Timestamp
  data_envio?: any; // Firebase Timestamp
  ai_error?: string;
  ai_generated?: boolean; // Indica se foi gerada por IA
  cliente_telefone?: string; // Telefone do cliente
  reprocessado_ia?: boolean;
  data_reprocessamento?: any; // Firebase Timestamp
  // Campos para tarefas de resumo (consolidada)
  consolidated_from_tasks?: string[]; // IDs das tarefas consolidadas
  latest_original_message_id?: string; // ID da última mensagem original que gerou o resumo
}
