import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from './ui/dialog';
import { Smartphone, Wifi, WifiOff, RefreshCw, QrCode, LogOut } from 'lucide-react';
import { useToast } from '../hooks/use-toast';

interface QRCodeData {
  type: string;
  whatsappNumber: string;
  base64Qrimg: string;
  timestamp: string;
}

interface WhatsAppStatus {
  whatsappNumber: string;
  isConnected: boolean;
  hasQRCode: boolean;
  qrCode?: {
    base64Qrimg: string;
    asciiQR: string;
    timestamp: string;
  };
}

interface WhatsAppQRCodeProps {
  whatsappNumber: string;
}

const WhatsAppQRCode: React.FC<WhatsAppQRCodeProps> = ({ whatsappNumber }) => {
  const [qrCode, setQrCode] = useState<QRCodeData | null>(null);
  const [status, setStatus] = useState<WhatsAppStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showQRModal, setShowQRModal] = useState(false);
  const { toast } = useToast();

  // Função para buscar status inicial
  const fetchStatus = async () => {
    try {
      const response = await fetch(`http://localhost:3000/api/whatsapp-status/${whatsappNumber}`);
      if (response.ok) {
        const statusData = await response.json();
        setStatus(statusData);
        
        if (statusData.qrCode) {
          setQrCode({
            type: 'qr-code',
            whatsappNumber: statusData.whatsappNumber,
            base64Qrimg: statusData.qrCode.base64Qrimg,
            timestamp: statusData.qrCode.timestamp
          });
        }
      }
    } catch (error) {
      console.error('Erro ao buscar status do WhatsApp:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Conectar ao SSE para receber QR codes em tempo real
  useEffect(() => {
    fetchStatus();

    const eventSource = new EventSource(`http://localhost:3000/api/qr-code/${whatsappNumber}`);
    
    eventSource.onmessage = (event) => {
      try {
        const data: QRCodeData = JSON.parse(event.data);
        if (data.type === 'qr-code') {
          setQrCode(data);
          setStatus(prev => prev ? { ...prev, hasQRCode: true, isConnected: false } : null);
          toast({
            title: "QR Code Atualizado",
            description: `Novo QR Code gerado para ${whatsappNumber}`,
          });
        }
      } catch (error) {
        console.error('Erro ao processar evento SSE:', error);
      }
    };

    eventSource.onerror = (error) => {
      console.error('Erro na conexão SSE:', error);
    };

    return () => {
      eventSource.close();
    };
  }, [whatsappNumber, toast]);

  // Atualizar status periodicamente
  useEffect(() => {
    const interval = setInterval(fetchStatus, 10000); // A cada 10 segundos
    return () => clearInterval(interval);
  }, [whatsappNumber]);

  const handleRefresh = () => {
    setIsLoading(true);
    fetchStatus();
  };

  const handleStartBot = async () => {
    try {
      setIsLoading(true);
      const response = await fetch('http://localhost:3000/api/start-whatsapp-bot', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ whatsappNumber }),
      });
      
      if (response.ok) {
        toast({
          title: "Bot Iniciado",
          description: `Bot do WhatsApp iniciado para ${whatsappNumber}. Aguarde o QR Code...`,
        });
        // Aguardar um pouco e então verificar o status
        setTimeout(fetchStatus, 2000);
      } else {
        const error = await response.json();
        toast({
          title: "Erro",
          description: error.error || "Erro ao iniciar bot",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error('Erro ao iniciar bot:', error);
      toast({
        title: "Erro",
        description: "Erro de conexão ao iniciar bot",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleStopBot = async () => {
    try {
      setIsLoading(true);
      const response = await fetch('http://localhost:3000/api/stop-whatsapp-bot', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ whatsappNumber }),
      });
      
      if (response.ok) {
        toast({
          title: "WhatsApp Desconectado",
          description: `WhatsApp ${whatsappNumber} foi desconectado com sucesso.`,
        });
        // Limpar estados locais
        setQrCode(null);
        setStatus(prev => prev ? { ...prev, isConnected: false, hasQRCode: false } : null);
        // Verificar status após desconectar
        setTimeout(fetchStatus, 1000);
      } else {
        const error = await response.json();
        toast({
          title: "Erro",
          description: error.error || "Erro ao desconectar WhatsApp",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error('Erro ao desconectar bot:', error);
      toast({
        title: "Erro",
        description: "Erro de conexão ao desconectar WhatsApp",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };



  return (
    <div className="flex items-center gap-2">
      {/* Status Badge */}
      <Badge variant={status?.isConnected ? "default" : "destructive"} className="flex items-center gap-1">
        {status?.isConnected ? (
          <><Wifi className="h-3 w-3" /> Conectado</>
        ) : (
          <><WifiOff className="h-3 w-3" /> Desconectado</>
        )}
      </Badge>

      {/* Botão principal baseado no status */}
      {status?.isConnected ? (
        <Button 
          variant="destructive" 
          size="sm"
          onClick={handleStopBot} 
          disabled={isLoading}
          className="flex items-center gap-2"
        >
          <LogOut className="h-4 w-4" />
          {isLoading ? 'Desconectando...' : 'Desconectar'}
        </Button>
      ) : (
        <>
          {qrCode ? (
            <Dialog open={showQRModal} onOpenChange={setShowQRModal}>
              <DialogTrigger asChild>
                <Button variant="default" size="sm" className="flex items-center gap-2">
                  <QrCode className="h-4 w-4" />
                  Ver QR Code
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <QrCode className="h-5 w-5" />
                    Conectar WhatsApp
                  </DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <p className="text-center text-gray-600">
                    Escaneie este código com o WhatsApp do seu celular
                  </p>
                  
                  <div className="flex justify-center">
                    <div className="bg-white p-4 rounded-lg border-2 border-gray-200">
                      <img 
                        src={qrCode.base64Qrimg} 
                        alt="QR Code do WhatsApp" 
                        className="w-48 h-48 object-contain"
                      />
                    </div>
                  </div>
                  
                  <div className="text-center space-y-2">
                    <p className="text-xs text-gray-500">
                      Gerado em: {new Date(qrCode.timestamp).toLocaleString('pt-BR')}
                    </p>
                    
                    <p className="text-sm text-gray-500">
                      Abra o WhatsApp no seu celular → Menu → Dispositivos conectados → Conectar um dispositivo
                    </p>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          ) : (
            <Button 
              variant="default" 
              size="sm"
              onClick={handleStartBot} 
              disabled={isLoading}
              className="flex items-center gap-2"
            >
              <Smartphone className="h-4 w-4" />
              {isLoading ? 'Conectando...' : 'Conectar'}
            </Button>
          )}
        </>
      )}

      {/* Botão de refresh */}
      <Button variant="outline" size="sm" onClick={handleRefresh} disabled={isLoading}>
        <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
      </Button>
    </div>
  );
};

export default WhatsAppQRCode;