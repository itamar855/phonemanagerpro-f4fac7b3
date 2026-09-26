import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Camera, Upload, CheckCircle } from "lucide-react";
import { convertToWebP } from "@/utils/imageOptimizer";

export default function Avaliacao() {
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  
  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    
    try {
      const formData = new FormData(e.currentTarget);
      const name = formData.get("name") as string;
      const phone = formData.get("phone") as string;
      const email = formData.get("email") as string;
      const model = formData.get("model") as string;
      const condition = formData.get("condition") as string;
      const value = formData.get("expected_value") as string;
      const notes = formData.get("notes") as string;
      
      const expectedValueNum = value ? parseFloat(value.replace(/[^0-9,.]/g, '').replace(',', '.')) : null;

      // Upload files
      const uploadedPhotos = [];
      for (const file of files) {
        const optimizedFile = await convertToWebP(file);
        const fileExt = optimizedFile.name.split('.').pop();
        const fileName = `${Math.random().toString(36).substring(2)}.${fileExt}`;
        const filePath = `${fileName}`;

        const { error: uploadError, data } = await supabase.storage
          .from('device_evaluations')
          .upload(filePath, optimizedFile);

        if (uploadError) {
          throw uploadError;
        }
        
        if (data) {
          const { data: { publicUrl } } = supabase.storage
            .from('device_evaluations')
            .getPublicUrl(filePath);
            
          uploadedPhotos.push(publicUrl);
        }
      }

      // Insert record
      const { error } = await supabase
        .from('device_evaluations' as any)
        .insert({
          client_name: name,
          client_phone: phone,
          client_email: email,
          device_model: model,
          device_condition: condition,
          expected_value: expectedValueNum,
          notes: notes,
          photos: uploadedPhotos,
          status: 'pending'
        });

      if (error) throw error;
      
      setSuccess(true);
      toast.success("Avaliação enviada com sucesso! Em breve entraremos em contato.");
    } catch (error: any) {
      console.error(error);
      toast.error(error.message || "Erro ao enviar a avaliação. Tente novamente.");
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center p-4">
        <Card className="w-full max-w-md text-center py-8 border-none shadow-xl">
          <CardContent className="flex flex-col items-center gap-4">
            <CheckCircle className="w-20 h-20 text-green-500 animate-in zoom-in" />
            <h2 className="text-3xl font-bold">Avaliação Enviada!</h2>
            <p className="text-muted-foreground mt-2">
              Recebemos os dados do seu aparelho. Nossa equipe fará a análise e entrará em contato em breve com uma proposta para usar como parte do pagamento.
            </p>
            <Button onClick={() => window.location.href = '/'} className="mt-6 w-full" size="lg">
              Voltar ao Início
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-12 p-4 flex flex-col justify-center">
      <div className="w-full max-w-2xl mx-auto mb-8 text-center">
        <h1 className="text-4xl font-extrabold tracking-tight bg-gradient-to-r from-primary to-blue-600 bg-clip-text text-transparent">
          Dê seu aparelho como entrada
        </h1>
        <p className="mt-3 text-lg text-muted-foreground">
          Quer trocar de celular? Preencha os dados abaixo e entraremos em contato com uma proposta de avaliação.
        </p>
      </div>
      
      <Card className="w-full max-w-2xl mx-auto shadow-xl border-t-4 border-t-primary">
        <CardContent className="p-8">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label htmlFor="name" className="text-sm font-semibold">Seu Nome Completo</Label>
                <Input id="name" name="name" required placeholder="Ex: João da Silva" className="bg-background/50 focus:bg-background transition-colors" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone" className="text-sm font-semibold">Telefone / WhatsApp</Label>
                <Input id="phone" name="phone" required placeholder="(00) 00000-0000" className="bg-background/50 focus:bg-background transition-colors" />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="email" className="text-sm font-semibold">E-mail (opcional)</Label>
              <Input id="email" name="email" type="email" placeholder="joao@email.com" className="bg-background/50 focus:bg-background transition-colors" />
            </div>

            <div className="space-y-2">
              <Label htmlFor="model" className="text-sm font-semibold">Qual é o seu Aparelho atual?</Label>
              <Input id="model" name="model" required placeholder="Ex: iPhone 13 Pro Max 256GB" className="bg-background/50 focus:bg-background transition-colors" />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label htmlFor="condition" className="text-sm font-semibold">Condição do Aparelho</Label>
                <Select name="condition" required defaultValue="marcas_leves">
                  <SelectTrigger className="bg-background/50 focus:bg-background transition-colors">
                    <SelectValue placeholder="Selecione a condição" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="como_novo">Como Novo (Sem marcas, perfeito)</SelectItem>
                    <SelectItem value="marcas_leves">Marcas Leves (Uso normal do dia a dia)</SelectItem>
                    <SelectItem value="marcas_fortes">Marcas Fortes / Tela Trincada</SelectItem>
                    <SelectItem value="com_defeito">Com Defeito (Placa, Áudio, etc)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="expected_value" className="text-sm font-semibold">Valor que deseja no aparelho (R$)</Label>
                <Input id="expected_value" name="expected_value" placeholder="Ex: 3.500,00" className="bg-background/50 focus:bg-background transition-colors" />
              </div>
            </div>

            <div className="space-y-3">
              <Label className="text-sm font-semibold">Fotos do Aparelho</Label>
              <div className="border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-xl p-8 text-center hover:bg-gray-100 dark:hover:bg-gray-800 transition-all duration-300">
                <input
                  type="file"
                  id="photos"
                  multiple
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files) {
                      setFiles(Array.from(e.target.files));
                    }
                  }}
                />
                <Label htmlFor="photos" className="cursor-pointer flex flex-col items-center gap-3">
                  <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center text-primary hover:scale-110 transition-transform">
                    <Camera className="w-8 h-8" />
                  </div>
                  <span className="font-medium text-base">
                    Clique aqui para adicionar fotos
                  </span>
                  <span className="text-xs text-muted-foreground w-64">
                    Envie fotos da frente (tela ligada), traseira e detalhes das laterais para uma melhor avaliação
                  </span>
                </Label>
              </div>
              {files.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-3">
                  {files.map((f, i) => (
                    <div key={i} className="text-xs bg-primary/10 text-primary px-3 py-1 rounded-full font-medium">
                      {f.name}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes" className="text-sm font-semibold">Observações adicionais (opcional)</Label>
              <Textarea 
                id="notes" 
                name="notes" 
                placeholder="Ex: Acompanha apenas a caixa, sem carregador. Saúde da bateria em 85%."
                rows={3}
                className="bg-background/50 focus:bg-background transition-colors"
              />
            </div>

            <Button type="submit" className="w-full h-12 text-lg shadow-md hover:shadow-lg transition-shadow" disabled={loading}>
              {loading ? (
                <span className="flex items-center gap-2">
                  <div className="w-5 h-5 border-2 border-primary-foreground/20 border-t-primary-foreground rounded-full animate-spin" />
                  Enviando Dados...
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  <Upload className="w-5 h-5" />
                  Enviar para Avaliação
                </span>
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
