import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Smartphone, Wifi, WifiOff, RefreshCw, QrCode } from 'lucide-react';
import { useToast } from '../hooks/use-toast';

interface QRCodeData {
  type: string;
  whatsappNumber: string;
  base64Qrimg: string;
  urlCode: string;
  timestamp: string;
}

interface WhatsAppStatus {
  whatsappNumber: string;
  isConnected: boolean;
  hasQRCode: boolean;
  qrCode?: {
    base64Qrimg: string;
    asciiQR: string;
    urlCode: string;
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
            urlCode: statusData.qrCode.urlCode,
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

  const copyUrlToClipboard = () => {
    if (qrCode?.urlCode) {
      navigator.clipboard.writeText(qrCode.urlCode);
      toast({
        title: "URL Copiada",
        description: "URL de conexão copiada para a área de transferência",
      });
    }
  };

  if (isLoading) {
    return (
      <Card className="w-full">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Smartphone className="h-5 w-5" />
            WhatsApp - {whatsappNumber}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center p-8">
            <RefreshCw className="h-6 w-6 animate-spin" />
            <span className="ml-2">Carregando status...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Smartphone className="h-5 w-5" />
            WhatsApp - {whatsappNumber}
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={status?.isConnected ? "default" : "destructive"} className="flex items-center gap-1">
              {status?.isConnected ? (
                <><Wifi className="h-3 w-3" /> Conectado</>
              ) : (
                <><WifiOff className="h-3 w-3" /> Desconectado</>
              )}
            </Badge>
            <Button variant="outline" size="sm" onClick={handleRefresh}>
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {status?.isConnected ? (
          <div className="text-center p-8">
            <div className="flex items-center justify-center mb-4">
              <Wifi className="h-12 w-12 text-green-500" />
            </div>
            <h3 className="text-lg font-semibold text-green-600 mb-2">WhatsApp Conectado</h3>
            <p className="text-gray-600">O WhatsApp está conectado e funcionando normalmente.</p>
          </div>
        ) : qrCode ? (
          <div className="space-y-4">
            <div className="text-center">
              <h3 className="text-lg font-semibold mb-2 flex items-center justify-center gap-2">
                <QrCode className="h-5 w-5" />
                Escaneie o QR Code
              </h3>
              <p className="text-gray-600 mb-4">
                Use o WhatsApp no seu celular para escanear este código
              </p>
            </div>
            
            <div className="flex justify-center">
              <div className="bg-white p-4 rounded-lg border-2 border-gray-200">
                <img 
                  src={qrCode.base64Qrimg} 
                  alt="QR Code do WhatsApp" 
                  className="w-64 h-64 object-contain"
                />
              </div>
            </div>
            
            <div className="text-center space-y-2">
              <p className="text-sm text-gray-500">
                Gerado em: {new Date(qrCode.timestamp).toLocaleString('pt-BR')}
              </p>
              
              {qrCode.urlCode && (
                <div className="space-y-2">
                  <p className="text-sm font-medium">Ou use este link:</p>
                  <div className="flex items-center gap-2">
                    <input 
                      type="text" 
                      value={qrCode.urlCode} 
                      readOnly 
                      className="flex-1 px-3 py-2 text-sm border rounded-md bg-gray-50"
                    />
                    <Button variant="outline" size="sm" onClick={copyUrlToClipboard}>
                      Copiar
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="text-center p-8">
            <div className="flex items-center justify-center mb-4">
              <WifiOff className="h-12 w-12 text-gray-400" />
            </div>
            <h3 className="text-lg font-semibold text-gray-600 mb-2">Aguardando Conexão</h3>
            <p className="text-gray-500 mb-4">
              O WhatsApp está sendo inicializado. O QR Code aparecerá aqui quando estiver pronto.
            </p>
            <div className="space-y-2">
              <Button variant="outline" onClick={handleRefresh}>
                <RefreshCw className="h-4 w-4 mr-2" />
                Verificar Novamente
              </Button>
              <Button variant="default" onClick={handleStartBot} disabled={isLoading}>
                <Smartphone className="h-4 w-4 mr-2" />
                {isLoading ? 'Iniciando...' : 'Iniciar WhatsApp'}
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default WhatsAppQRCode;