import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Trash2, UploadCloud, Image as ImageIcon, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { convertToWebP } from "@/utils/imageOptimizer";

interface Photo {
  id: string;
  photo_url: string;
  stage: string;
  created_at: string;
}

interface OsPhotoGalleryProps {
  orderId: string;
  readonly?: boolean;
}

export function OsPhotoGallery({ orderId, readonly = false }: OsPhotoGalleryProps) {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [selectedStage, setSelectedStage] = useState("entrada");

  const fetchPhotos = async () => {
    try {
      const { data, error } = await supabase
        .from("service_order_photos" as any)
        .select("*")
        .eq("service_order_id", orderId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setPhotos((data as unknown as Photo[]) || []);
    } catch (error) {
      console.error("Error fetching photos:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (orderId) {
      fetchPhotos();
    }
  }, [orderId]);

  const handleUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    try {
      if (!event.target.files || event.target.files.length === 0) return;
      
      setUploading(true);
      const file = event.target.files[0];
      const optimizedFile = await convertToWebP(file);
      const fileExt = optimizedFile.name.split('.').pop();
      const fileName = `${orderId}-${Math.random()}.${fileExt}`;
      const filePath = `os-photos/${fileName}`;

      // Upload image
      const { error: uploadError } = await supabase.storage
        .from('comprovantes')
        .upload(filePath, optimizedFile);

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: publicUrlData } = supabase.storage
        .from('comprovantes')
        .getPublicUrl(filePath);

      // Insert record
      const { error: dbError } = await supabase
        .from('service_order_photos' as any)
        .insert({
          service_order_id: orderId,
          photo_url: publicUrlData.publicUrl,
          stage: selectedStage
        });

      if (dbError) throw dbError;

      toast.success("Foto enviada com sucesso!");
      fetchPhotos();
    } catch (error: any) {
      toast.error(error.message || "Erro ao fazer upload da foto");
    } finally {
      setUploading(false);
      if (event.target) event.target.value = '';
    }
  };

  const handleDelete = async (photoId: string, photoUrl: string) => {
    try {
      // Remover do Storage (opcional, dependendo da necessidade de retenção de dados)
      const pathParts = photoUrl.split('/');
      const fileName = pathParts[pathParts.length - 1];
      await supabase.storage.from('comprovantes').remove([`os-photos/${fileName}`]);

      // Remover do banco de dados
      const { error } = await supabase
        .from('service_order_photos' as any)
        .delete()
        .eq('id', photoId);

      if (error) throw error;
      
      toast.success("Foto removida!");
      setPhotos(photos.filter(p => p.id !== photoId));
    } catch (error: any) {
      toast.error(error.message || "Erro ao remover foto");
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center p-4 text-muted-foreground"><Loader2 className="animate-spin h-5 w-5" /></div>;
  }

  const stageLabels: Record<string, string> = {
    entrada: "Entrada",
    reparo: "Restauro / Reparo",
    saida: "Saída"
  };

  const stageBadgeColors: Record<string, string> = {
    entrada: "bg-blue-500/15 text-blue-500",
    reparo: "bg-orange-500/15 text-orange-500",
    saida: "bg-green-500/15 text-green-500"
  };

  return (
    <div className="space-y-4 rounded-lg bg-card border border-border p-4">
      <div className="flex items-center justify-between">
        <p className="font-semibold text-muted-foreground uppercase text-[10px] tracking-wide flex items-center gap-1.5">
          <ImageIcon className="h-3.5 w-3.5" /> Galeria de Fotos ({photos.length})
        </p>

        {!readonly && (
          <div className="flex items-center gap-2">
            <Select value={selectedStage} onValueChange={setSelectedStage}>
              <SelectTrigger className="h-8 text-xs w-[120px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="entrada" className="text-xs">Entrada</SelectItem>
                <SelectItem value="reparo" className="text-xs">Reparo</SelectItem>
                <SelectItem value="saida" className="text-xs">Saída</SelectItem>
              </SelectContent>
            </Select>

            <Label htmlFor={`photo-upload-${orderId}`} className="cursor-pointer">
              <div className={`flex items-center gap-1.5 h-8 px-3 rounded text-xs font-semibold
                              ${uploading ? 'bg-muted text-muted-foreground' : 'bg-primary text-primary-foreground hover:bg-primary/90'}`}>
                {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UploadCloud className="h-3.5 w-3.5" />}
                {uploading ? "Enviando..." : "Upload"}
              </div>
              <input 
                id={`photo-upload-${orderId}`} 
                type="file" 
                accept="image/*" 
                capture="environment" 
                className="hidden" 
                disabled={uploading} 
                onChange={handleUpload} 
              />
            </Label>
          </div>
        )}
      </div>

      {photos.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-6 text-muted-foreground border border-dashed rounded bg-muted/20">
          <ImageIcon className="h-6 w-6 mb-2 opacity-30" />
          <p className="text-xs font-medium">Nenhuma foto salva para esta OS</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {photos.map(photo => (
            <Card key={photo.id} className="group relative overflow-hidden border-border/50 shadow-sm hover:shadow-md transition-all">
              <div className="aspect-square bg-muted">
                <img 
                  src={photo.photo_url} 
                  alt={`Condição de ${stageLabels[photo.stage]}`} 
                  className="w-full h-full object-cover" 
                  onClick={() => window.open(photo.photo_url, "_blank")}
                />
              </div>
              
              <div className="absolute top-2 left-2 pointer-events-none">
                <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider ${stageBadgeColors[photo.stage] || "bg-muted text-muted-foreground"}`}>
                  {stageLabels[photo.stage] || photo.stage}
                </span>
              </div>

              {!readonly && (
                <div className="absolute top-2 right-2 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                  <Button 
                    type="button"
                    className="h-7 w-7 sm:h-6 sm:w-6 p-0 bg-destructive text-destructive-foreground hover:bg-destructive/90 rounded-full shadow-lg active:scale-90"
                    onClick={(e) => { e.stopPropagation(); handleDelete(photo.id, photo.photo_url); }}
                    title="Excluir foto"
                  >
                    <Trash2 className="h-3.5 w-3.5 sm:h-3 sm:w-3" />
                  </Button>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
