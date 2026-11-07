import { Play } from "lucide-react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";

export type PlaylistItem = {
  id: number;
  episodeNumber: number | string;
  title: string;
  genre?: string | null;
  thumbnailUrl?: string | null;
};

// Pop-up playlist of the special episodes: a title, then a translucent box
// with one row per episode (thumbnail on the left, text on the right).
export function SpecialPlaylist({
  open,
  onClose,
  episodes,
  onSelect,
}: {
  open: boolean;
  onClose: () => void;
  episodes: PlaylistItem[];
  onSelect: (id: number) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        className="max-w-2xl w-[95vw] p-0 gap-0 flex flex-col max-h-[90vh] overflow-hidden bg-white/30 backdrop-blur-[40px] backdrop-saturate-150 border-white/60 dark:bg-card/90 dark:backdrop-blur-xl dark:backdrop-saturate-100 dark:border-card-border"
      >
        <div className="px-6 pt-6 pb-4 pr-16 shrink-0">
          <DialogTitle className="text-2xl font-display font-extrabold text-black dark:text-white">
            Special Episodes playlist
          </DialogTitle>
          <DialogDescription className="sr-only">Pick a special episode to watch</DialogDescription>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4 sm:px-6 sm:pb-6 custom-scrollbar">
          <div className="liquid-tile liquid-static rounded-2xl p-2">
            {episodes.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">No special episodes yet.</p>
            ) : (
              episodes.map((ep, i) => (
                <button
                  key={ep.id}
                  type="button"
                  onClick={() => onSelect(ep.id)}
                  className={`group flex w-full items-center gap-4 rounded-xl p-2 text-left outline-none transition-colors hover:bg-white/40 focus-visible:bg-white/40 dark:hover:bg-white/10 dark:focus-visible:bg-white/10 ${
                    i < episodes.length - 1 ? "border-b border-white/40 dark:border-white/10" : ""
                  }`}
                >
                  <div className="relative aspect-video w-32 shrink-0 overflow-hidden rounded-lg bg-black/40 shadow-md sm:w-44">
                    {ep.thumbnailUrl && (
                      <img src={ep.thumbnailUrl} alt={ep.title} loading="lazy" className="h-full w-full object-cover" />
                    )}
                    <div className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 transition-opacity group-hover:opacity-100">
                      <Play className="h-6 w-6 fill-current text-white" />
                    </div>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold uppercase tracking-widest text-cyan-700 dark:text-cyan-400">EP {ep.episodeNumber}</p>
                    <p className="mt-1 line-clamp-2 font-semibold leading-snug text-foreground">{ep.title}</p>
                    {ep.genre && (
                      <span className="mt-2 inline-block rounded-full border border-white/50 bg-white/40 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-foreground/80 dark:border-white/10 dark:bg-white/10">
                        {ep.genre}
                      </span>
                    )}
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
