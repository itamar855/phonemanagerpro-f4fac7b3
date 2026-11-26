import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Camera, User, Globe, Search, ShieldCheck, Smartphone, Info } from "lucide-react";

const TesteMeta = () => {
  const [userId, setUserId] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);

  const handleTestCapture = async () => {
    if (!userId) {
      toast.error("Insira um User ID para testar.");
      return;
    }

    setLoading(true);
    setResult(null);

    try {
      const { data: config, error: configError } = await supabase
        .from('instagram_config')
        .select('page_access_token, store_id')
        .eq('is_active', true)
        .limit(1)
        .single();

      if (configError || !config?.page_access_token) {
        toast.error("Configuração do Instagram não encontrada ou inativa.");
        setLoading(false);
        return;
      }

      const { data, error: functionError } = await supabase.functions.invoke('instagram-webhook', {
        body: { 
          type: 'sync-profile', 
          userId: userId,
          // Buscamos qualquer store_id ativo se não houver um específico
          storeId: config?.store_id || null 
        }
      });

      if (functionError) throw functionError;
      
      const profile = data.profile;

      if (profile?.error) {
        setResult({ error: profile.error });
        toast.error("Erro na API da Meta: " + profile.error);
      } else if (!profile) {
        toast.error("Nenhum dado retornado da API.");
      } else {
        setResult(profile);
        toast.success("Dados capturados com sucesso!");
      }
    } catch (err) {
      console.error(err);
      toast.error("Erro ao realizar o teste: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <div>
        <h1 className="font-display text-2xl md:text-3xl font-bold tracking-tight text-foreground">Validador de API Meta</h1>
        <p className="text-muted-foreground text-sm mt-1">Teste a captura de nome e foto de perfil do Instagram usando um ID de usuário.</p>
      </div>

      <Card className="border-border/50 shadow-sm overflow-hidden">
        <div className="h-1 bg-gradient-to-r from-blue-500 to-indigo-600" />
        <CardHeader>
          <CardTitle className="font-display text-lg flex items-center gap-2">
            <Globe className="h-5 w-5 text-blue-500" />
            Simular Captura de Perfil
          </CardTitle>
          <CardDescription>
            Insira o ID que aparece no webhook (sender.id) para validar os dados retornados pela Meta Graph API.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="userId" className="text-sm font-semibold">User ID (Instagram)</Label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input 
                  id="userId"
                  value={userId} 
                  onChange={(e) => setUserId(e.target.value)} 
                  placeholder="Ex: 728394056123" 
                  className="pl-9 h-11"
                />
              </div>
              <Button 
                onClick={handleTestCapture} 
                disabled={loading}
                className="h-11 bg-blue-600 hover:bg-blue-700"
              >
                {loading ? "Consultando..." : "Testar Captura"}
              </Button>
            </div>
          </div>

          {result && (
            <div className="mt-6 animate-in fade-in slide-in-from-top-2 duration-300">
              <Label className="text-xs font-bold uppercase text-muted-foreground mb-3 block">Resultado da Consulta</Label>
              
              {result.error ? (
                <div className="p-4 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
                  <div className="flex items-center gap-2 font-bold mb-1">
                    <ShieldCheck className="h-4 w-4" /> Erro detectado
                  </div>
                  {result.error}
                </div>
              ) : (
                <div className="p-6 rounded-xl border border-border bg-card shadow-sm flex flex-col items-center text-center gap-4">
                  {result.profile_pic ? (
                    <div className="relative">
                      <img 
                        src={result.profile_pic} 
                        alt={result.name} 
                        className="h-24 w-24 rounded-full border-4 border-white shadow-md object-cover"
                      />
                      <div className="absolute -bottom-1 -right-1 bg-pink-500 rounded-full p-1.5 border-2 border-white">
                        <Camera className="h-3 w-3 text-white" />
                      </div>
                    </div>
                  ) : (
                    <div className="h-24 w-24 rounded-full bg-muted flex items-center justify-center border-4 border-white shadow-sm">
                      <User className="h-10 w-10 text-muted-foreground" />
                    </div>
                  )}
                  
                  <div>
                    <h3 className="text-xl font-bold text-foreground">{result.name || "Nome não disponível"}</h3>
                    <p className="text-xs text-muted-foreground font-mono mt-1">ID: {result.id}</p>
                  </div>

                  <div className="w-full pt-4 border-t border-border mt-2">
                    <p className="text-[10px] text-muted-foreground text-left mb-2 uppercase font-bold tracking-wider">Dados brutos (JSON)</p>
                    <pre className="text-[10px] bg-muted/50 p-3 rounded-md text-left overflow-x-auto font-mono">
                      {JSON.stringify(result, null, 2)}
                    </pre>
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default TesteMeta;
