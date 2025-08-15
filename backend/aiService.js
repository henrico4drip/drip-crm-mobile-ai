// backend/aiService.js
const axios = require('axios');

// IMPORTANTE: Esta chave foi fornecida pelo usuário.
// Em um ambiente de produção, esta chave DEVE ser armazenada em variáveis de ambiente,
// e NUNCA diretamente no código-fonte.
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || 'sk-or-v1-your-api-key-here'; // Sua chave API

/**
 * Gera uma resposta de IA com base no contexto completo da conversa.
 * @param {string} fullContext O contexto completo incluindo histórico e mensagens não respondidas.
 * @param {Array<Object>} chatHistory Um array de objetos de mensagem (Venom-Bot format) - OPCIONAL para compatibilidade.
 * @returns {Promise<string>} A resposta sugerida pela IA.
 */
async function gerarRespostaIA(fullContext, chatHistory = []) {
  if (!fullContext || fullContext.trim() === '') {
    console.warn('⚠️ Contexto vazio para IA, retornando resposta padrão.');
    return 'Olá! Como posso ajudar?';
  }

  // Constrói o array de mensagens para a API da OpenRouter.
  // Começa com a instrução do sistema aprimorada.
  const messagesForAI = [
    {
      role: 'system',
      content: `Você é um vendedor simpático, objetivo e direto. Analise o contexto completo da conversa abaixo e sugira uma resposta comercial adequada.
      
IMPORTANTE: 
- Considere TODA a conversa (mensagens respondidas E não respondidas)
- Identifique o interesse do cliente baseado no histórico completo
- Responda de forma contextualizada e personalizada
- Seja comercial mas não insistente
- Se houver múltiplas mensagens não respondidas, aborde os pontos principais`
    }
  ];

  // Se o fullContext já contém o histórico formatado, use-o diretamente
  if (fullContext.includes('HISTÓRICO DA CONVERSA:')) {
    // Contexto já formatado pelo botManager
    messagesForAI.push({
      role: 'user',
      content: fullContext + '\n\nIMPORTANTE: Além da resposta, avalie a PRIORIDADE desta conversa de 1-10 (onde 10 = alta chance de conversão) baseado no interesse demonstrado, urgência das mensagens e potencial comercial. Inclua no final: [PRIORIDADE: X]'
    });
  } else {
    // Fallback para compatibilidade com chamadas antigas
    // Adiciona as mensagens do histórico, formatando-as para o papel 'user' ou 'assistant'.
    chatHistory.forEach(msg => {
      if (msg.body && msg.body.trim() !== '') {
        messagesForAI.push({
          role: msg.fromMe ? 'assistant' : 'user',
          content: msg.body
        });
      }
    });

    // Adiciona a mensagem atual do cliente como a última mensagem do usuário.
    messagesForAI.push({
      role: 'user',
      content: fullContext
    });
  }

  try {
    const resposta = await axios.post(
      'https://openrouter.ai/api/v1/chat/completions',
      {
        model: 'openai/gpt-3.5-turbo', // Modelo de IA a ser utilizado
        messages: messagesForAI, // Array de mensagens construído
        max_tokens: 250, // Aumentado para incluir análise de prioridade
        temperature: 0.6 // Reduzido para respostas mais consistentes e focadas
      },
      {
        headers: {
          Authorization: `Bearer ${OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    const respostaCompleta = resposta.data.choices[0].message.content.trim();
    
    // Extrair prioridade da resposta
    const prioridadeMatch = respostaCompleta.match(/\[PRIORIDADE:\s*(\d+)\]/);
    const prioridade = prioridadeMatch ? parseInt(prioridadeMatch[1]) : 5; // Default 5 se não encontrar
    
    // Remover a tag de prioridade da resposta final
    const respostaLimpa = respostaCompleta.replace(/\[PRIORIDADE:\s*\d+\]/, '').trim();
    
    return {
      resposta: respostaLimpa,
      prioridade: prioridade
    };
  } catch (error) {
    console.error('❌ Erro ao gerar resposta com IA:', error.response?.data?.message || error.message);
    return {
      resposta: 'Desculpe, não consegui gerar uma resposta automática. Posso ajudar de outra forma?',
      prioridade: 1
    };
  }
}

// Exporta a função para que possa ser utilizada por outros módulos do backend.
module.exports = { gerarRespostaIA };
