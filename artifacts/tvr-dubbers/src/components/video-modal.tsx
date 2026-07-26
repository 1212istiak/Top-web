import { useState, useEffect } from "react";
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

export function VideoModal({ 
  episodeId, 
  onClose,
  onNextEpisode
}: { 
  episodeId: number | null; 
  onClose: () => void;
  onNextEpisode?: (currentId: number) => void;
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

  if (!episodeId) return null;

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

  return (
    <Dialog open={!!episodeId} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-5xl w-[95vw] p-0 bg-card/90 backdrop-blur-xl border-card-border overflow-hidden flex flex-col max-h-[90vh]">
        <DialogTitle className="sr-only">
          {episode?.title || "Episode Player"}
        </DialogTitle>
        <DialogDescription className="sr-only">
          Watch episode and discuss
        </DialogDescription>
        
        {/* Header */}
        <div className="p-4 border-b border-border flex justify-between items-center bg-black/40">
          <div>
            <h2 className="text-xl font-display font-bold text-white flex items-center gap-3">
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
        <div className="flex flex-col md:flex-row flex-1 overflow-hidden">
          
          {/* Main Left Column: Video + Reactions */}
          <div className="flex-1 flex flex-col overflow-y-auto custom-scrollbar">
            
            {/* Player Wrapper */}
            <div className="w-full bg-black aspect-video relative flex-shrink-0">
              {(!primaryUrl && !backupUrl) ? (
                <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
                  Video not available
                </div>
              ) : (
                <SmartPlayer value={activeUrl} className="w-full h-full border-0" />
              )}
            </div>

            <div className="p-4 space-y-6 shrink-0">
              {/* Server Switcher */}
              <div className="flex items-center justify-between">
                <Tabs value={server} onValueChange={(v) => setServer(v as "primary" | "backup")} className="w-[300px]">
                  <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="primary" disabled={!primaryUrl}>Server 1</TabsTrigger>
                    <TabsTrigger value="backup" disabled={!backupUrl}>Server 2</TabsTrigger>
                  </TabsList>
                </Tabs>
                
                {onNextEpisode && (
                  <Button variant="secondary" onClick={() => onNextEpisode(episodeId)}>
                    Next Episode →
                  </Button>
                )}
              </div>

              {/* Reactions */}
              <div className="space-y-3 p-4 rounded-xl bg-black/20 border border-white/5 relative">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Reactions</h3>
                <div className="flex flex-wrap gap-3">
                  {(["👍", "❤️", "👎", "🔥", "😥", "😹", "💀"] as ReactionInputReactionType[]).map((emoji) => {
                    const count = reactions?.counts?.[emoji] || 0;
                    return (
                      <button
                        key={emoji}
                        onClick={() => handleReaction(emoji)}
                        className="relative group flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 transition-transform active:scale-95"
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
          <div className="w-full md:w-[350px] border-t md:border-t-0 md:border-l border-border bg-black/20 flex flex-col h-[50vh] md:h-auto">
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
                  <div key={comment.id} className="bg-white/5 rounded-lg p-3 text-sm">
                    <div className="flex items-baseline justify-between mb-1">
                      <span className="font-semibold text-cyan-300">{comment.nickname}</span>
                      <span className="text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(comment.createdAt), { addSuffix: true })}
                      </span>
                    </div>
                    <p className="text-white/80 leading-relaxed whitespace-pre-wrap break-words">{comment.body}</p>
                  </div>
                ))
              )}
            </div>

            <div className="p-4 border-t border-border/50 bg-black/40 shrink-0">
              <form onSubmit={handleCommentSubmit} className="space-y-3">
                <Input 
                  placeholder="Nickname (optional)" 
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
                  className="bg-white/5 border-white/10"
                  maxLength={30}
                />
                <textarea 
                  placeholder="Add a comment..."
                  value={commentBody}
                  onChange={(e) => setCommentBody(e.target.value)}
                  className="w-full h-20 bg-white/5 border border-white/10 rounded-md p-2 text-sm resize-none focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/50 transition-all custom-scrollbar"
                  maxLength={500}
                />
                <Button 
                  type="submit" 
                  disabled={!commentBody.trim() || createComment.isPending}
                  className="w-full bg-cyan-600 hover:bg-cyan-500 text-white"
                >
                  Post Comment
                </Button>
              </form>
            </div>
          </div>

        </div>
      </DialogContent>
    </Dialog>
  );
}
