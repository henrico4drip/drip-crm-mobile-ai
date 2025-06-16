
import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Phone, Save, X, AlertCircle } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';

const UserPhoneSettings: React.FC = () => {
  const { userData, updateUserPhone } = useAuth();
  const { toast } = useToast();
  const [isOpen, setIsOpen] = useState(false);
  const [telefone, setTelefone] = useState(userData?.whatsapp_comercial || '');
  const [loading, setLoading] = useState(false);

  const handleSave = async () => {
    if (!telefone.trim()) {
      toast({
        title: "Erro",
        description: "Por favor, insira um número de telefone",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      console.log('💾 Salvando telefone:', telefone);
      await updateUserPhone(telefone);
      toast({
        title: "Telefone salvo com sucesso! 📱",
        description: `Número ${telefone} configurado. Agora você pode receber mensagens via WhatsApp.`,
      });
      setIsOpen(false);
    } catch (error: any) {
      console.error('❌ Erro ao salvar telefone:', error);
      toast({
        title: "Erro ao salvar",
        description: error.message || "Não foi possível atualizar o telefone. Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const hasPhone = userData?.whatsapp_comercial && userData.whatsapp_comercial.length > 0;

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button 
          variant={hasPhone ? "outline" : "default"}
          size="sm"
          className={!hasPhone ? "bg-yellow-500 hover:bg-yellow-600 text-white animate-pulse" : ""}
        >
          <Phone className="w-4 h-4 mr-2" />
          {hasPhone ? 'Editar WhatsApp' : 'Configurar WhatsApp'}
        </Button>
      </DialogTrigger>
      
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center">
            <Phone className="w-5 h-5 mr-2" />
            Configurar WhatsApp Comercial
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4 pt-4">
          <div>
            <label className="text-sm font-medium text-gray-700">
              Número do WhatsApp (somente números)
            </label>
            <Input
              type="tel"
              placeholder="Ex: 11999999999 ou 5511999999999"
              value={telefone}
              onChange={(e) => setTelefone(e.target.value)}
              className="mt-1"
              maxLength={13}
            />
            <div className="bg-blue-50 p-3 rounded-lg mt-2">
              <div className="flex items-start space-x-2">
                <AlertCircle className="w-4 h-4 text-blue-600 mt-0.5" />
                <div className="text-xs text-blue-800">
                  <p><strong>Formato aceito:</strong></p>
                  <p>• Com DDD: 11999999999 (10-11 dígitos)</p>
                  <p>• Com código do país: 5511999999999</p>
                  <p>• Este número receberá as mensagens via Venom-Bot</p>
                </div>
              </div>
            </div>
          </div>
          
          {userData?.whatsapp_comercial && (
            <div className="bg-green-50 p-3 rounded-lg">
              <p className="text-sm text-green-800">
                <strong>Número atual:</strong> {userData.whatsapp_comercial}
              </p>
            </div>
          )}
          
          <div className="flex justify-end space-x-3 pt-4">
            <Button
              variant="outline"
              onClick={() => setIsOpen(false)}
              disabled={loading}
            >
              <X className="w-4 h-4 mr-2" />
              Cancelar
            </Button>
            <Button
              onClick={handleSave}
              disabled={loading}
            >
              <Save className="w-4 h-4 mr-2" />
              {loading ? 'Salvando...' : 'Salvar'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default UserPhoneSettings;
