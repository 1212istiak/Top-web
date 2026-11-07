import { useState, useEffect, useRef } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { 
  useGetEpisode, 
  useGetReactions, 
  useAddReaction, 
  useListComments, 
  useCreateComment, 
  useIncrementEpisodeView,
  ReactionInputReactionType,
  getListCommentsQueryKey,
  getGetReactionsQueryKey,
  getGetEpisodeQueryKey
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { SmartPlayer } from "@/components/smart-player";

export type EpisodeNeighbors = { prev: number | null; next: number | null };
type PanelAnim = "none" | "in-left" | "in-right" | "out-left" | "out-right";
type Panel = { key: number; id: number; anim: PanelAnim };

const PANEL_ANIM_CLASS: Record<PanelAnim, string> = {
  none: "",
  "in-left": "pv-in-left",
  "in-right": "pv-in-right",
  "out-left": "pv-out-left pointer-events-none",
  "out-right": "pv-out-right pointer-events-none",
};

const navBtn =
  "bg-white/60 backdrop-blur-3xl hover:bg-white/80 shadow-[0_12px_24px_-8px_rgba(15,23,42,0.38),0_3px_7px_rgba(15,23,42,0.12)] dark:bg-secondary dark:backdrop-blur-none dark:hover:bg-secondary/80 dark:shadow-none disabled:opacity-100 disabled:text-foreground/20 disabled:shadow-none";
// Unavailable server tab: text fades to almost the background colour
const unavailable = "disabled:opacity-100 disabled:text-foreground/20";

// Each episode lives in its own full pop-up "panel". When the viewer goes to the
// previous/next episode, the old panel slides off one side while the new panel
// slides in from the other, so it reads as one pop-up replacing the other.
export function VideoModal({
  episodeId,
  onClose,
  onNavigate,
  getNeighbors,
}: {
  episodeId: number | null;
  onClose: () => void;
  onNavigate: (id: number) => void;
  getNeighbors: (id: number) => EpisodeNeighbors;
}) {
  const [panels, setPanels] = useState<Panel[]>([]);
  const keyRef = useRef(0);
  const dirRef = useRef<"next" | "prev" | null>(null);
  const busy = panels.some((p) => p.anim !== "none");

  useEffect(() => {
    if (!episodeId) {
      setPanels([]);
      return;
    }
    const dir = dirRef.current;
    dirRef.current = null;
    setPanels((prev) => {
      const live = prev.filter((p) => !p.anim.startsWith("out"));
      const last = live[live.length - 1];
      if (last && last.id === episodeId) return prev;
      keyRef.current += 1;
      const key = keyRef.current;
      if (!last || !dir) return [{ key, id: episodeId, anim: "none" }];
      const outs: Panel[] = live.map((p) => ({ ...p, anim: dir === "next" ? "out-left" : "out-right" }));
      return [...outs, { key, id: episodeId, anim: dir === "next" ? "in-right" : "in-left" }];
    });
  }, [episodeId]);

  // Safety net (e.g. reduced motion): settle animations even if no animationend fires
  useEffect(() => {
    if (!busy) return;
    const t = setTimeout(() => {
      setPanels((prev) => prev.filter((p) => !p.anim.startsWith("out")).map((p) => ({ ...p, anim: "none" as PanelAnim })));
    }, 900);
    return () => clearTimeout(t);
  }, [busy, panels.length]);

  const onGo = (id: number | null, dir: "next" | "prev") => {
    if (id == null || busy) return;
    dirRef.current = dir;
    onNavigate(id);
  };

  const settle = (key: number) =>
    setPanels((prev) =>
      prev
        .filter((p) => !(p.key === key && p.anim.startsWith("out")))
        .map((p) => (p.key === key ? { ...p, anim: "none" as PanelAnim } : p)),
    );

  return (
    <Dialog open={!!episodeId} onOpenChange={(open) => !open && onClose()}>
      {/* Transparent full-screen stage; the visible pop-ups are the panels */}
      <DialogContent
        hideClose
        className="max-w-none w-screen h-[100dvh] max-h-none p-0 gap-0 border-0 bg-transparent shadow-none overflow-hidden pointer-events-none grid place-items-center sm:rounded-none"
      >
        <DialogTitle className="sr-only">Episode Player</DialogTitle>
        <DialogDescription className="sr-only">Watch episode and discuss</DialogDescription>
        {panels.map((p) => (
          <PlayerPanel
            key={p.key}
            episodeId={p.id}
            anim={p.anim}
            frozen={p.anim.startsWith("out")}
            getNeighbors={getNeighbors}
            onGo={onGo}
            onAnimDone={() => settle(p.key)}
          />
        ))}
      </DialogContent>
    </Dialog>
  );
}

function PlayerPanel({
  episodeId,
  anim,
  frozen,
  getNeighbors,
  onGo,
  onAnimDone,
}: {
  episodeId: number;
  anim: PanelAnim;
  frozen: boolean;
  getNeighbors: (id: number) => EpisodeNeighbors;
  onGo: (id: number | null, dir: "next" | "prev") => void;
  onAnimDone: () => void;
}) {
  const queryClient = useQueryClient();
  const [server, setServer] = useState<"primary" | "backup">("primary");
  const [visitorId] = useState(() => {
    let vid = localStorage.getItem("tvr_visitor_id");
    if (!vid) {
      vid = Math.random().toString(36).substring(2, 15);
      localStorage.setItem("tvr_visitor_id", vid);
    }
    return vid;
  });

  const { data: episode } = useGetEpisode(episodeId || 0, { 
    query: { queryKey: getGetEpisodeQueryKey(episodeId || 0), enabled: !!episodeId } 
  });
  
  const incrementView = useIncrementEpisodeView();
  
  useEffect(() => {
    if (episodeId && episode) {
      // Mark as last watched
      localStorage.setItem("tvr_last_watched", episodeId.toString());
      // Increment view
      incrementView.mutate({ id: episodeId });
    }
  }, [episodeId, episode, incrementView.mutate]);

  const { data: reactions } = useGetReactions(episodeId || 0, {
    query: { queryKey: getGetReactionsQueryKey(episodeId || 0), enabled: !!episodeId }
  });
  const addReaction = useAddReaction();
  
  const { data: comments } = useListComments(episodeId || 0, {
    query: { 
      queryKey: getListCommentsQueryKey(episodeId || 0),
      enabled: !!episodeId,
      refetchInterval: 12000 // Poll every 12 seconds
    }
  });
  const createComment = useCreateComment();

  const [nickname, setNickname] = useState("");
  const [commentBody, setCommentBody] = useState("");
  const [floatingEmojis, setFloatingEmojis] = useState<{id: number, emoji: string}[]>([]);

  const handleReaction = (emoji: ReactionInputReactionType) => {
    // Add floating animation
    const id = Date.now();
    setFloatingEmojis(prev => [...prev, { id, emoji }]);
    setTimeout(() => {
      setFloatingEmojis(prev => prev.filter(f => f.id !== id));
    }, 1000);

    addReaction.mutate({ 
      id: episodeId, 
      data: { reactionType: emoji, visitorId } 
    }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetReactionsQueryKey(episodeId) });
      }
    });
  };

  const handleCommentSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!commentBody.trim()) return;
    
    createComment.mutate({
      id: episodeId,
      data: {
        nickname: nickname.trim() || "Anonymous",
        body: commentBody.trim()
      }
    }, {
      onSuccess: () => {
        setCommentBody("");
        queryClient.invalidateQueries({ queryKey: getListCommentsQueryKey(episodeId) });
      }
    });
  };

  const primaryUrl = episode?.primaryServerUrl || null;
  const backupUrl = episode?.backupServerUrl || null;
  const activeUrl = server === "primary" && primaryUrl ? primaryUrl : (backupUrl || primaryUrl);

  const nav = getNeighbors(episodeId);
  // Which server is actually playing (mirrors how activeUrl is chosen)
  const activeServer: "primary" | "backup" = activeUrl ? (activeUrl === primaryUrl ? "primary" : "backup") : "primary";

  return (
    <div
      className={cn(
        "pointer-events-auto col-start-1 row-start-1 relative w-[95vw] max-w-5xl max-h-[90dvh] flex flex-col overflow-hidden rounded-lg border shadow-lg",
        "bg-white/30 backdrop-blur-[40px] backdrop-saturate-150 border-white/60 dark:bg-card/90 dark:backdrop-blur-xl dark:backdrop-saturate-100 dark:border-card-border",
        PANEL_ANIM_CLASS[anim],
      )}
      onAnimationEnd={(e) => {
        if (e.target === e.currentTarget && anim !== "none") onAnimDone();
      }}
    >
        <DialogPrimitive.Close
          className="right-3 top-3 z-30 flex h-9 w-9 items-center justify-center rounded-full liquid-pill liquid-dark liquid-solid-dark text-white hover:text-red-300"
          style={{ position: "absolute" }}
        >
          <X className="h-4 w-4" />
          <span className="sr-only">Close</span>
        </DialogPrimitive.Close>

        {/* Header */}
        <div className="p-4 pr-16 border-b border-white/50 dark:border-border flex justify-between items-center bg-white/40 backdrop-blur-3xl dark:bg-black/90 dark:backdrop-blur-none">
          <div>
            <h2 className="text-xl font-display font-extrabold text-black dark:text-white flex items-center gap-3">
              <span className="bg-primary/20 text-primary px-2 py-0.5 rounded text-sm">
                EP {episode?.episodeNumber}
              </span>
              {episode?.title}
            </h2>
            {episode?.season && (
              <p className="text-muted-foreground text-sm mt-1">Season {episode.season}</p>
            )}
          </div>
        </div>

        {/* Player and Content Area */}
        <div className="flex flex-col md:flex-row flex-1 min-h-0 overflow-y-auto md:overflow-hidden custom-scrollbar">
          
          {/* Main Left Column: Video + Reactions */}
          <div className="flex-none md:flex-1 flex flex-col md:overflow-y-auto custom-scrollbar">
            
            {/* Player Wrapper */}
            <div className="w-full bg-black aspect-video relative flex-shrink-0">
              {(!primaryUrl && !backupUrl) ? (
                <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
                  Video not available
                </div>
              ) : (
                frozen ? null : <SmartPlayer value={activeUrl} className="w-full h-full border-0" />
              )}
            </div>

            <div className="p-4 space-y-6 shrink-0">
              {/* Server Switcher */}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <Tabs value={activeServer} onValueChange={(v) => setServer(v as "primary" | "backup")} className="w-[300px] max-w-full">
                  <TabsList className="grid w-full grid-cols-2 bg-white/50 backdrop-blur-3xl shadow-[0_12px_24px_-8px_rgba(15,23,42,0.38),0_3px_7px_rgba(15,23,42,0.12)] dark:bg-muted dark:backdrop-blur-none dark:shadow-none">
                    <TabsTrigger value="primary" disabled={!primaryUrl} className={cn(activeServer === "primary" && "liquid-pill liquid-raised liquid-static rounded-md", unavailable)}>Server 1</TabsTrigger>
                    <TabsTrigger value="backup" disabled={!backupUrl} className={cn(activeServer === "backup" && "liquid-pill liquid-raised liquid-static rounded-md", unavailable)}>Server 2</TabsTrigger>
                  </TabsList>
                </Tabs>
                
                <div className="flex items-center gap-2 ml-auto">
                  <Button
                    variant="secondary"
                    className={navBtn}
                    disabled={!nav.prev}
                    onClick={() => onGo(nav.prev, "prev")}
                  >
                    <ChevronLeft className="mr-1 h-4 w-4" />
                    Previous Episode
                  </Button>
                  <Button
                    variant="secondary"
                    className={navBtn}
                    disabled={!nav.next}
                    onClick={() => onGo(nav.next, "next")}
                  >
                    Next Episode
                    <ChevronRight className="ml-1 h-4 w-4" />
                  </Button>
                </div>
              </div>

              {/* Reactions */}
              <div className="space-y-3 p-4 rounded-2xl liquid-tile liquid-wide liquid-raised liquid-static">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Reactions</h3>
                <div className="flex flex-wrap gap-3">
                  {(["👍", "❤️", "👎", "🔥", "😥", "😹", "💀"] as ReactionInputReactionType[]).map((emoji) => {
                    const count = reactions?.counts?.[emoji] || 0;
                    return (
                      <button
                        key={emoji}
                        onClick={() => handleReaction(emoji)}
                        className="group flex items-center gap-1.5 px-3 py-1.5 rounded-full liquid-pill liquid-raised"
                      >
                        <span className="text-xl group-hover:scale-110 transition-transform block">{emoji}</span>
                        <span className="text-sm font-mono">{count}</span>
                      </button>
                    );
                  })}
                </div>
                
                {/* Floating emojis layer */}
                {floatingEmojis.map(f => (
                  <div 
                    key={f.id} 
                    className="absolute text-3xl pointer-events-none animate-out slide-out-to-top-12 fade-out duration-1000 z-50"
                    style={{ left: '50%', top: '0%' }}
                  >
                    {f.emoji}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Right Column: Comments */}
          <div className="w-full md:w-[350px] border-t md:border-t-0 md:border-l border-border liquid-pane flex flex-col shrink-0 h-[60dvh] min-h-[22rem] md:min-h-0 md:shrink md:h-auto">
            <div className="p-4 border-b border-border/50 shrink-0">
              <h3 className="font-display font-semibold flex items-center gap-2">
                Comments 
                <span className="text-xs bg-white/10 px-2 py-0.5 rounded-full">{comments?.length || 0}</span>
              </h3>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
              {comments?.length === 0 ? (
                <div className="h-full flex items-center justify-center text-sm text-muted-foreground text-center">
                  Be the first to comment!
                </div>
              ) : (
                comments?.map((comment) => (
                  <div key={comment.id} className="bg-white/65 backdrop-blur-3xl border border-white/80 shadow-[0_12px_24px_-8px_rgba(15,23,42,0.38),0_3px_7px_rgba(15,23,42,0.12)] dark:bg-white/5 dark:backdrop-blur-none dark:border-white/5 dark:shadow-none rounded-xl p-3 text-sm">
                    <div className="flex items-baseline justify-between mb-1">
                      <span className="font-semibold text-cyan-700 dark:text-cyan-300">{comment.nickname}</span>
                      <span className="text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(comment.createdAt), { addSuffix: true })}
                      </span>
                    </div>
                    <p className="text-foreground/80 leading-relaxed whitespace-pre-wrap break-words">{comment.body}</p>
                  </div>
                ))
              )}
            </div>

            <div className="p-4 border-t border-border/50 shrink-0">
              <form onSubmit={handleCommentSubmit} className="space-y-3">
                <Input 
                  placeholder="Nickname (optional)" 
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
                  className="bg-white/65 backdrop-blur-3xl border-white/80 shadow-[0_12px_24px_-8px_rgba(15,23,42,0.38),0_3px_7px_rgba(15,23,42,0.12)] dark:bg-white/5 dark:backdrop-blur-none dark:border-white/10 dark:shadow-none"
                  maxLength={30}
                />
                <textarea 
                  placeholder="Add a comment..."
                  value={commentBody}
                  onChange={(e) => setCommentBody(e.target.value)}
                  className="w-full h-20 bg-white/65 backdrop-blur-3xl border border-white/80 shadow-[0_12px_24px_-8px_rgba(15,23,42,0.38),0_3px_7px_rgba(15,23,42,0.12)] dark:bg-white/5 dark:backdrop-blur-none dark:border-white/10 dark:shadow-none rounded-md p-2 text-sm resize-none focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/50 transition-all custom-scrollbar"
                  maxLength={500}
                />
                <Button 
                  type="submit" 
                  disabled={!commentBody.trim() || createComment.isPending}
                  className="w-full rounded-full liquid-pill liquid-pill-active liquid-cyan-solid liquid-raised liquid-light-dark text-white disabled:opacity-80"
                >
                  Post Comment
                </Button>
              </form>
            </div>
          </div>

        </div>
    </div>
  );
}
