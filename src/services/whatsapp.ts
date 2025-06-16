
export const openWhatsAppWithMessage = (phoneNumber: string, message: string) => {
  const formattedPhone = phoneNumber.replace(/\D/g, '');
  const encodedMessage = encodeURIComponent(message);
  const whatsappUrl = `https://wa.me/55${formattedPhone}?text=${encodedMessage}`;
  
  window.open(whatsappUrl, '_blank');
};

export const sendDailyReport = async (operatorPhone: string, pendingTasks: any[]) => {
  // Esta função seria implementada com Z-API ou WPPConnect
  // Por enquanto, apenas console.log para demonstração
  console.log('Enviando relatório diário para:', operatorPhone);
  console.log('Tarefas pendentes:', pendingTasks);
};
