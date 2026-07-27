import { useEffect, useState, useRef } from "react";
import { 
  useGetSettings, 
  useGetTrailer, 
  useListEpisodes 
} from "@workspace/api-client-react";
import { Navbar } from "@/components/navbar";
import { Footer } from "@/components/footer";
import { VideoModal } from "@/components/video-modal";
import { TrailerModal } from "@/components/trailer-modal";
import { Button } from "@/components/ui/button";
import { Play, Calendar, FolderOpen, X } from "lucide-react";
import { format, differenceInSeconds } from "date-fns";
import { SparkleBackground } from "@/components/sparkle-background";
import { CursorEffects } from "@/components/cursor-effects";

// Reusable IntersectionObserver Image
function LazyImage({ src, alt, className }: { src: string, alt: string, className?: string }) {
  const [isLoaded, setIsLoaded] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setIsLoaded(true);
          observer.disconnect();
        }
      },
      { rootMargin: "200px" }
    );

    if (imgRef.current) observer.observe(imgRef.current);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={imgRef} className={`relative overflow-hidden bg-black/40 ${className || ""}`}>
      {isLoaded && src ? (
        <img 
          src={src} 
          alt={alt} 
          className="w-full h-full object-cover transition-opacity duration-700 animate-in fade-in"
          loading="lazy"
        />
      ) : (
        <div className="absolute inset-0 bg-white/5 animate-pulse" />
      )}
    </div>
  );
}

export function Home() {
  const { data: settings } = useGetSettings();
  const { data: trailer } = useGetTrailer();
  const { data: allEpisodes, isLoading: isEpisodesLoading } = useListEpisodes();
  const { data: specialEpisodes } = useListEpisodes({ special: "true" });

  const [activeEpisodeId, setActiveEpisodeId] = useState<number | null>(null);
  const [showSpecialModal, setShowSpecialModal] = useState(false);
  const [showTrailerModal, setShowTrailerModal] = useState(false);
  const [selectedGenre, setSelectedGenre] = useState<string>("All");

  const regularEpisodes = allEpisodes?.filter(ep => !ep.isSpecial) || [];
  
  const genres = ["All", ...Array.from(new Set(regularEpisodes.map(ep => ep.genre).filter(Boolean)))];
  
  const filteredEpisodes = selectedGenre === "All" 
    ? regularEpisodes 
    : regularEpisodes.filter(ep => ep.genre === selectedGenre);

  // Countdown logic
  const [countdown, setCountdown] = useState<{d: number, h: number, m: number, s: number} | null>(null);
  
  useEffect(() => {
    if (!settings?.countdownTargetDate) return;
    
    const target = new Date(settings.countdownTargetDate);
    
    const updateCountdown = () => {
      const diff = differenceInSeconds(target, new Date());
      if (diff <= 0) {
        setCountdown(null);
        return;
      }
      setCountdown({
        d: Math.floor(diff / (3600 * 24)),
        h: Math.floor((diff % (3600 * 24)) / 3600),
        m: Math.floor((diff % 3600) / 60),
        s: diff % 60
      });
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, [settings?.countdownTargetDate]);

  // Last watched
  const lastWatchedId = typeof localStorage !== 'undefined' ? localStorage.getItem("tvr_last_watched") : null;

  const handleNextEpisode = (currentId: number) => {
    if (!allEpisodes) return;
    const currentIndex = allEpisodes.findIndex(ep => ep.id === currentId);
    if (currentIndex !== -1 && currentIndex > 0) {
      // Assuming episodes are sorted newest first, so next episode is index - 1
      // Wait, usually list is newest first, so the "next" episode to watch is the older one? 
      // Actually, standard is index - 1 is newer, index + 1 is older. Next episode implies newer.
      setActiveEpisodeId(allEpisodes[currentIndex - 1].id);
    }
  };

  const latestEpisode = regularEpisodes[0];

  return (
    <div className="min-h-screen w-full relative selection:bg-cyan-500/30">
      <SparkleBackground />
      <CursorEffects />
      <Navbar />

      <main className="container mx-auto px-4 pb-24">
        
        {/* HERO SECTION */}
        <section className="py-20 md:py-32 flex flex-col items-center text-center space-y-8 animate-in fade-in slide-in-from-bottom-8 duration-1000">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-950/30 border border-cyan-500/30 text-cyan-300 text-sm font-medium tracking-wide">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-500"></span>
            </span>
            Now Streaming — in Bangla Dub
          </div>
          
          <h2 className="text-5xl md:text-7xl lg:text-8xl font-display font-black color-cycle-text uppercase tracking-tighter leading-tight max-w-5xl">
            Battle Through the Heavens
          </h2>
          
          <div className="flex flex-col sm:flex-row gap-4 pt-8">
            <Button 
              size="lg" 
              className="text-lg h-14 px-8 bg-cyan-600 hover:bg-cyan-500 text-white rounded-full font-bold shadow-[0_0_20px_rgba(8,145,178,0.4)] hover:shadow-[0_0_30px_rgba(8,145,178,0.6)] transition-all hover:scale-105"
              onClick={() => latestEpisode && setActiveEpisodeId(latestEpisode.id)}
              disabled={!latestEpisode}
            >
              <Play className="mr-2 h-5 w-5 fill-current" /> Watch Latest
            </Button>
            
            <Button 
              size="lg" 
              variant="outline"
              className="text-lg h-14 px-8 rounded-full font-bold border-white/20 hover:bg-white/10 glass-card transition-all hover:scale-105"
              onClick={() => setShowTrailerModal(true)}
              disabled={!trailer?.primaryServerUrl && !trailer?.backupServerUrl}
            >
              <Calendar className="mr-2 h-5 w-5" /> Upcoming Episode
            </Button>
          </div>
        </section>

        {/* COUNTDOWN TIMER */}
        <section className="mb-24 flex justify-center animate-in fade-in slide-in-from-bottom-8 duration-1000 delay-200 fill-mode-both">
          <div className="glass-card p-6 md:p-10 rounded-3xl border-t border-white/20 relative overflow-hidden group max-w-3xl w-full text-center">
            <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/10 to-purple-500/10 opacity-50"></div>
            
            <h3 className="text-sm font-display uppercase tracking-widest text-muted-foreground mb-6">Next Episode Drops In</h3>
            
            {countdown ? (
              <div className="flex justify-center gap-4 md:gap-8">
                {[
                  { label: "Days", value: countdown.d },
                  { label: "Hours", value: countdown.h },
                  { label: "Mins", value: countdown.m },
                  { label: "Secs", value: countdown.s }
                ].map((item, i) => (
                  <div key={i} className="flex flex-col items-center">
                    <span className="text-4xl md:text-6xl font-display font-bold text-foreground tabular-nums tracking-tighter">
                      {item.value.toString().padStart(2, '0')}
                    </span>
                    <span className="text-xs md:text-sm text-cyan-400 mt-2 uppercase tracking-widest font-medium">
                      {item.label}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-3xl font-display font-bold text-foreground uppercase tracking-wider color-cycle-text py-4">
                Coming Soon
              </div>
            )}
          </div>
        </section>

        {/* SPECIAL COLLECTION FOLDER */}
        {specialEpisodes && specialEpisodes.length > 0 && (
          <section className="mb-24 animate-in fade-in slide-in-from-bottom-8 duration-1000 delay-300 fill-mode-both">
            <div className="flex items-end justify-between mb-8">
              <div>
                <h3 className="text-2xl md:text-3xl font-display font-bold text-foreground flex items-center gap-3">
                  <FolderOpen className="text-cyan-400 h-8 w-8" />
                  {settings?.specialFolderLabel || "Special Collection"}
                </h3>
                <p className="text-muted-foreground mt-2 tracking-wide">Season 1 · 4K Remastered</p>
              </div>
              <Button variant="ghost" onClick={() => setShowSpecialModal(true)} className="hidden sm:flex hover:bg-white/10">
                View All
              </Button>
            </div>
            
            {/* 16:9 Special Banner Tile */}
            {settings?.specialFolderThumbnail && (
              <div className="mb-6 rounded-2xl overflow-hidden border border-cyan-500/30 shadow-[0_0_30px_rgba(8,145,178,0.15)] relative group cursor-pointer"
                style={{ aspectRatio: "16/9" }}
                onClick={() => specialEpisodes[0] && setActiveEpisodeId(specialEpisodes[0].id)}
              >
                <img
                  src={settings.specialFolderThumbnail}
                  alt={settings?.specialFolderLabel || "Special Episode"}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
                <div className="absolute bottom-0 left-0 p-5 w-full">
                  <p className="text-xs font-bold text-cyan-400 uppercase tracking-widest mb-1">Special Episode</p>
                  <p className="text-lg md:text-2xl font-display font-bold text-white line-clamp-1">
                    {settings?.specialFolderLabel || "Special Collection"}
                  </p>
                </div>
                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                  <div className="w-14 h-14 rounded-full bg-cyan-600/80 backdrop-blur flex items-center justify-center shadow-[0_0_20px_rgba(8,145,178,0.6)]">
                    <Play className="h-6 w-6 text-white fill-current ml-1" />
                  </div>
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
              {specialEpisodes.slice(0, 6).map((ep) => (
                <div 
                  key={ep.id}
                  className="group relative aspect-video rounded-xl overflow-hidden cursor-pointer border border-white/10 hover:border-cyan-500/50 transition-all hover:scale-[1.02] hover:-translate-y-1 hover:shadow-[0_10px_20px_rgba(0,0,0,0.5)]"
                  onClick={() => setActiveEpisodeId(ep.id)}
                >
                  <LazyImage src={ep.thumbnailUrl || ""} alt={ep.title} />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent opacity-80 group-hover:opacity-100 transition-opacity"></div>
                  <div className="absolute bottom-0 left-0 p-3 w-full">
                    <p className="text-xs font-bold text-cyan-400 mb-1">EP {ep.episodeNumber}</p>
                    <p className="text-sm font-medium text-white line-clamp-1 group-hover:text-cyan-100 transition-colors">{ep.title}</p>
                  </div>
                  <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <div className="w-10 h-10 rounded-full bg-cyan-600/80 backdrop-blur flex items-center justify-center">
                      <Play className="h-4 w-4 text-white fill-current ml-0.5" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ALL EPISODES GRID */}
        <section id="episodes" className="animate-in fade-in slide-in-from-bottom-8 duration-1000 delay-500 fill-mode-both">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
            <h3 className="text-2xl md:text-3xl font-display font-bold text-foreground border-l-4 border-cyan-500 pl-4">
              All Episodes
            </h3>
            
            <div className="flex flex-wrap gap-2">
              {genres.map(g => (
                <button
                  key={g || 'unknown'}
                  onClick={() => setSelectedGenre(g || "All")}
                  className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all ${
                    selectedGenre === g 
                      ? "bg-cyan-600 text-white shadow-[0_0_10px_rgba(8,145,178,0.5)]" 
                      : "bg-white/5 text-muted-foreground hover:bg-white/10 hover:text-foreground"
                  }`}
                >
                  {g}
                </button>
              ))}
            </div>
          </div>

          {isEpisodesLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {[1, 2, 3, 4, 5, 6, 7, 8].map(i => (
                <div key={i} className="aspect-video rounded-xl bg-white/5 animate-pulse border border-white/5"></div>
              ))}
            </div>
          ) : filteredEpisodes.length === 0 ? (
            <div className="py-20 text-center text-muted-foreground glass-card rounded-2xl">
              No episodes found.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {filteredEpisodes.map((ep) => {
                const isNew = differenceInSeconds(new Date(), new Date(ep.createdAt)) < 48 * 3600;
                const isLastWatched = lastWatchedId === ep.id.toString();

                return (
                  <div 
                    key={ep.id}
                    onClick={() => setActiveEpisodeId(ep.id)}
                    className="group glass-card rounded-xl overflow-hidden cursor-pointer transition-all hover:scale-[1.02] hover:-translate-y-1 color-cycle-border border-2 relative flex flex-col"
                  >
                    <div className="aspect-video relative overflow-hidden">
                      <LazyImage src={ep.thumbnailUrl || ""} alt={ep.title} />
                      
                      {/* Overlays */}
                      <div className="absolute inset-0 bg-black/20 group-hover:bg-transparent transition-colors"></div>
                      
                      {/* Badges */}
                      <div className="absolute top-3 left-3 flex flex-col gap-2">
                        {isNew && (
                          <span className="bg-red-600 text-white text-[10px] font-bold px-2 py-1 rounded shadow-lg uppercase tracking-wider animate-pulse">
                            NEW
                          </span>
                        )}
                        {ep.genre && (
                          <span className="bg-black/60 backdrop-blur text-white text-[10px] font-medium px-2 py-1 rounded border border-white/10 uppercase tracking-wider">
                            {ep.genre}
                          </span>
                        )}
                      </div>

                      {/* Hover Play Button */}
                      <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                        <div className="w-12 h-12 rounded-full bg-cyan-500/90 shadow-[0_0_20px_rgba(8,145,178,0.8)] flex items-center justify-center transform scale-50 group-hover:scale-100 transition-transform duration-300">
                          <Play className="h-5 w-5 text-white fill-current ml-1" />
                        </div>
                      </div>
                    </div>
                    
                    <div className="p-4 flex-1 flex flex-col">
                      <div className="flex justify-between items-start mb-2">
                        <span className="text-sm font-display font-bold text-cyan-400">EPISODE {ep.episodeNumber}</span>
                        {isLastWatched && (
                          <span className="text-[10px] bg-green-500/20 text-green-400 px-2 py-0.5 rounded uppercase tracking-widest font-semibold border border-green-500/20">
                            Resume
                          </span>
                        )}
                      </div>
                      <h4 className="font-semibold text-foreground text-lg leading-tight line-clamp-2 group-hover:text-cyan-300 transition-colors">
                        {ep.title}
                      </h4>
                      
                      <div className="mt-auto pt-4 flex items-center justify-between text-xs text-muted-foreground font-medium">
                        <span>{format(new Date(ep.createdAt), 'MMM d, yyyy')}</span>
                        <span>{ep.viewCount.toLocaleString()} views</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

      </main>

      <Footer />

      <VideoModal 
        episodeId={activeEpisodeId} 
        onClose={() => setActiveEpisodeId(null)} 
        onNextEpisode={handleNextEpisode}
      />

      <TrailerModal
        open={showTrailerModal}
        onClose={() => setShowTrailerModal(false)}
        title={trailer?.title}
        genre={trailer?.genre}
        primaryServerUrl={trailer?.primaryServerUrl}
        backupServerUrl={trailer?.backupServerUrl}
      />

      {/* FULLSCREEN SPECIAL FOLDER MODAL */}
      {showSpecialModal && (
        <div className="fixed inset-0 z-[100] bg-black/95 backdrop-blur-2xl animate-in fade-in duration-300 flex flex-col">
          <div className="p-6 border-b border-white/10 flex justify-between items-center bg-black/50 sticky top-0 z-10">
            <div>
              <h2 className="text-3xl font-display font-bold text-white flex items-center gap-3">
                <FolderOpen className="text-cyan-400" />
                {settings?.specialFolderLabel || "Special Collection"}
              </h2>
              <p className="text-cyan-400/80 mt-1">All Special Episodes</p>
            </div>
            <button 
              onClick={() => setShowSpecialModal(false)}
              className="p-3 bg-white/5 hover:bg-red-500/20 hover:text-red-400 rounded-full transition-colors"
            >
              <X className="h-6 w-6" />
            </button>
          </div>
          
          <div className="flex-1 overflow-y-auto p-6 md:p-12 custom-scrollbar">
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6 max-w-[1600px] mx-auto">
              {specialEpisodes?.map(ep => (
                <div 
                  key={ep.id}
                  className="group relative aspect-[3/4] rounded-xl overflow-hidden cursor-pointer border border-white/10 hover:border-cyan-500 transition-all hover:scale-105 shadow-2xl"
                  onClick={() => {
                    setActiveEpisodeId(ep.id);
                    setShowSpecialModal(false);
                  }}
                >
                  <LazyImage src={ep.thumbnailUrl || ""} alt={ep.title} className="h-full w-full object-cover" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent opacity-90"></div>
                  <div className="absolute bottom-0 left-0 p-4 w-full">
                    <p className="text-sm font-bold text-cyan-400 mb-1 tracking-widest uppercase">EP {ep.episodeNumber}</p>
                    <p className="text-base font-semibold text-white leading-tight group-hover:text-cyan-300 transition-colors">{ep.title}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
