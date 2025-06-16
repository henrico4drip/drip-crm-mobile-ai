
import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { User, Clock, MessageCircle } from 'lucide-react';
import { Cliente } from '@/types';
import ClientTasksDropdown from './ClientTasksDropdown';

interface ClientCardProps {
  cliente: Cliente;
  pendingTasksCount: number;
  onClick: () => void;
}

const ClientCard: React.FC<ClientCardProps> = ({ cliente, pendingTasksCount, onClick }) => {
  const formatTime = (timestamp: any) => {
    if (!timestamp) return '';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleString('pt-BR', { 
      day: '2-digit', 
      month: '2-digit', 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  };

  const handleCardClick = (e: React.MouseEvent) => {
    // Não executar onClick se clicou em elementos interativos
    const target = e.target as HTMLElement;
    if (target.closest('button') || target.closest('[data-interactive]')) {
      return;
    }
    onClick();
  };

  const hasUnreadTasks = pendingTasksCount > 0;

  return (
    <Card 
      className={`cursor-pointer hover:shadow-lg transition-all duration-200 border-l-4 ${
        hasUnreadTasks ? 'border-l-yellow-500 bg-yellow-50/30' : 'border-l-blue-500'
      } hover:border-l-green-500`}
      onClick={handleCardClick}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center space-x-3">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
              hasUnreadTasks 
                ? 'bg-gradient-to-r from-yellow-400 to-orange-400' 
                : 'bg-gradient-to-r from-blue-400 to-green-400'
            }`}>
              <User className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900">{cliente.nome}</h3>
              <p className="text-sm text-gray-600">{cliente.telefone}</p>
            </div>
          </div>
          
          <div className="flex items-center space-x-2">
            {hasUnreadTasks && (
              <Badge className="bg-yellow-100 text-yellow-800 border-yellow-200">
                <MessageCircle className="w-3 h-3 mr-1" />
                {pendingTasksCount} nova{pendingTasksCount > 1 ? 's' : ''}
              </Badge>
            )}
          </div>
        </div>
        
        <div className="space-y-2">
          <p className="text-sm text-gray-700 line-clamp-2">
            {cliente.ultima_mensagem}
          </p>
          <div className="flex items-center justify-between">
            <div className="flex items-center text-xs text-gray-500">
              <Clock className="w-3 h-3 mr-1" />
              {formatTime(cliente.timestamp_ultima_mensagem)}
            </div>
            <div data-interactive>
              <ClientTasksDropdown clienteId={cliente.cliente_id} />
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default ClientCard;
