import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SmartPlayer } from "@/components/smart-player";

export function TrailerModal({
  open,
  onClose,
  title,
  genre,
  primaryServerUrl,
  backupServerUrl,
}: {
  open: boolean;
  onClose: () => void;
  title?: string | null;
  genre?: string | null;
  primaryServerUrl?: string | null;
  backupServerUrl?: string | null;
}) {
  const [server, setServer] = useState<"primary" | "backup">("primary");

  // Reset the server tab back to primary each time the modal is reopened
  useEffect(() => {
    if (open) setServer("primary");
  }, [open]);

  const activeUrl = server === "primary" && primaryServerUrl ? primaryServerUrl : (backupServerUrl || primaryServerUrl);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-5xl w-[95vw] p-0 bg-card/90 backdrop-blur-xl border-card-border overflow-hidden flex flex-col max-h-[90vh]">
        <DialogTitle className="sr-only">{title || "Trailer"}</DialogTitle>
        <DialogDescription className="sr-only">Watch the trailer</DialogDescription>

        <div className="p-4 border-b border-border flex justify-between items-center bg-black/90">
          <div>
            <h2 className="text-xl font-display font-bold text-white">{title || "Trailer"}</h2>
            {genre && <p className="text-muted-foreground text-sm mt-1">{genre}</p>}
          </div>
        </div>

        <div className="w-full bg-black aspect-video relative flex-shrink-0">
          {(!primaryServerUrl && !backupServerUrl) ? (
            <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
              Trailer not available
            </div>
          ) : (
            <SmartPlayer value={activeUrl} className="w-full h-full border-0" />
          )}
        </div>

        {(primaryServerUrl && backupServerUrl) && (
          <div className="p-4">
            <Tabs value={server} onValueChange={(v) => setServer(v as "primary" | "backup")} className="w-[300px]">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="primary">Server 1</TabsTrigger>
                <TabsTrigger value="backup">Server 2</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
