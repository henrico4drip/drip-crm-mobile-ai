// backend/aiService.js
const axios = require('axios');

async function gerarRespostaIA(mensagem) {
  if (!mensagem) {
    console.warn('⚠️ Mensagem vazia para IA, retornando resposta padrão.');
    return 'Olá! Como posso ajudar?';
  }
  try {
    const resposta = await axios.post(
      'https://openrouter.ai/api/v1/chat/completions',
      {
        model: 'openai/gpt-3.5-turbo',
        messages: [
          {
            role: 'system',
            content: 'Você é um vendedor simpático, objetivo e direto. Sugira uma resposta comercial para a seguinte mensagem de um cliente.'
          },
          {
            role: 'user',
            content: mensagem
          }
        ],
        max_tokens: 100,
        temperature: 0.7
      },
      {
        headers: {
          Authorization: 'Bearer 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', // Mantenha sua chave API aqui
          'Content-Type': 'application/json'
        }
      }
    );
    return resposta.data.choices[0].message.content.trim();
  } catch (error) {
    console.error('❌ Erro ao gerar resposta com IA:', error.response?.data?.message || error.message);
    return 'Desculpe, não consegui gerar uma resposta automática. Posso ajudar de outra forma?';
  }
}

module.exports = { gerarRespostaIA };
