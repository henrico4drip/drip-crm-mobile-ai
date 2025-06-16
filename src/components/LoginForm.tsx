
import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Mail, Lock, LogIn, UserPlus, Phone } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';

const LoginForm = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [telefone, setTelefone] = useState('');
  const [loading, setLoading] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);
  const { login, register } = useAuth();
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (isRegistering) {
        await register(email, password, telefone);
        toast({
          title: "Conta criada com sucesso!",
          description: "Bem-vindo ao CRM ALRA",
        });
      } else {
        await login(email, password);
        toast({
          title: "Login realizado com sucesso!",
          description: "Bem-vindo ao CRM ALRA",
        });
      }
    } catch (error) {
      toast({
        title: isRegistering ? "Erro ao criar conta" : "Erro no login",
        description: isRegistering 
          ? "Não foi possível criar a conta. Tente novamente." 
          : "Verifique suas credenciais e tente novamente.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-green-50 p-4">
      <Card className="w-full max-w-md shadow-xl">
        <CardHeader className="text-center pb-8">
          <div className="mx-auto w-16 h-16 bg-gradient-to-r from-blue-500 to-green-500 rounded-full flex items-center justify-center mb-4">
            {isRegistering ? (
              <UserPlus className="w-8 h-8 text-white" />
            ) : (
              <LogIn className="w-8 h-8 text-white" />
            )}
          </div>
          <CardTitle className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-green-600 bg-clip-text text-transparent">
            CRM ALRA
          </CardTitle>
          <p className="text-muted-foreground">
            {isRegistering ? 'Criar nova conta' : 'Entre na sua conta'}
          </p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <div className="relative">
                <Mail className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" />
                <Input
                  type="email"
                  placeholder="Email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="pl-10"
                  required
                />
              </div>
            </div>
            
            {isRegistering && (
              <div className="space-y-2">
                <div className="relative">
                  <Phone className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" />
                  <Input
                    type="tel"
                    placeholder="WhatsApp (ex: 5585999999999)"
                    value={telefone}
                    onChange={(e) => setTelefone(e.target.value)}
                    className="pl-10"
                    required
                  />
                </div>
                <p className="text-xs text-gray-500">
                  Número do WhatsApp que receberá as mensagens dos clientes
                </p>
              </div>
            )}
            
            <div className="space-y-2">
              <div className="relative">
                <Lock className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" />
                <Input
                  type="password"
                  placeholder="Senha"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pl-10"
                  required
                />
              </div>
            </div>
            <Button 
              type="submit" 
              className="w-full bg-gradient-to-r from-blue-500 to-green-500 hover:from-blue-600 hover:to-green-600 transition-all duration-200"
              disabled={loading}
            >
              {loading 
                ? (isRegistering ? 'Criando conta...' : 'Entrando...') 
                : (isRegistering ? 'Criar Conta' : 'Entrar')
              }
            </Button>
            <div className="text-center pt-4">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setIsRegistering(!isRegistering)}
                className="text-sm text-muted-foreground hover:text-foreground"
              >
                {isRegistering 
                  ? 'Já tem uma conta? Fazer login' 
                  : 'Não tem conta? Criar conta'
                }
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default LoginForm;
