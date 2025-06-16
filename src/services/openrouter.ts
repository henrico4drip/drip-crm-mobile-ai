const OPENROUTER_API_KEY = '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'; // Substitua pela sua chave da OpenRouter

export const generateSuggestedMessage = async (clientMessage: string): Promise<string> => {
  try {
    console.log('🤖 Gerando resposta com IA para:', clientMessage.substring(0, 50) + '...');
    
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'openai/gpt-3.5-turbo',
        messages: [
          {
            role: 'system',
            content: 'Você é um atendente profissional de loja no WhatsApp. Seja educado, direto e informal mas respeitoso. Use emojis quando apropriado.'
          },
          {
            role: 'user',
            content: `O cliente escreveu: "${clientMessage}"\nGere uma resposta educada e direta como um atendente de loja no WhatsApp. A resposta deve ser informal, mas respeitosa.`
          }
        ],
        temperature: 0.7,
        max_tokens: 200
      })
    });

    if (!response.ok) {
      throw new Error(`OpenRouter API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const suggestedMessage = data.choices[0]?.message?.content || 'Olá! Obrigado pela sua mensagem. Em que posso ajudá-lo? 😊';
    
    console.log('✅ Resposta gerada:', suggestedMessage);
    return suggestedMessage;
    
  } catch (error) {
    console.error('❌ Erro ao gerar mensagem:', error);
    return 'Olá! Obrigado pela sua mensagem. Em que posso ajudá-lo? 😊';
  }
};
