export interface Usuario {
  usuario_id: string;
  email: string;
  nome?: string;
  whatsapp_comercial: string;
  ativo: boolean;
  data_cadastro?: any;
}

export interface Cliente {
  cliente_id: string;
  telefone: string;
  nome: string;
  usuario_id: string;
  ultima_mensagem: string;
  timestamp_ultima_mensagem: any;
}

export interface Tarefa {
  id?: string;
  mensagem_recebida: string;
  mensagem_sugerida?: string;
  status: 'pendente' | 'enviada' | 'concluída';
  data_criacao: any; // Firestore timestamp
  timestamp_mensagem_original?: any; // Firestore timestamp
  data_conclusao?: any; // Firestore timestamp
  data_envio?: any; // Firestore timestamp
  tags?: string[];
  follow_up?: boolean;
  ai_generated?: boolean;
  ai_generated_at?: any; // Firestore timestamp
  ai_error?: string;
  cliente_nome?: string; // Novo campo adicionado pelo Venom-Bot
  cliente_telefone?: string; // Novo campo adicionado pelo Venom-Bot
  metadata?: {
    message_id?: string;
    from?: string;
    type?: string;
    notify_name?: string;
  };
}
