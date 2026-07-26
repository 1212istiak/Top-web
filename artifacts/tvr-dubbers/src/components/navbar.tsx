import { Link, useLocation } from "wouter";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Search, Lock } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useGetSettings, useListEpisodes, useAdminLogin, getListEpisodesQueryKey } from "@workspace/api-client-react";
import { useTheme } from "@/hooks/use-theme";
import { useToast } from "@/hooks/use-toast";

export function Navbar() {
  const [clickCount, setClickCount] = useState(0);
  const clickTimeoutRef = useRef<NodeJS.Timeout | undefined>(undefined);
  const [, setLocation] = useLocation();
  const { isAuthenticated, setToken } = useAuth();
  const { data: settings } = useGetSettings();
  const { theme, toggleTheme } = useTheme();
  const { toast } = useToast();

  const [searchQuery, setSearchQuery] = useState("");
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [password, setPassword] = useState("");

  const loginMutation = useAdminLogin();

  const { data: episodes } = useListEpisodes(undefined, {
    query: { queryKey: getListEpisodesQueryKey(undefined), enabled: isSearchFocused && searchQuery.length > 0 }
  });

  const searchResults = episodes?.filter(ep => 
    ep.title.toLowerCase().includes(searchQuery.toLowerCase())
  ).slice(0, 5);

  const handleTitleClick = () => {
    setClickCount(prev => prev + 1);
    
    if (clickTimeoutRef.current) {
      clearTimeout(clickTimeoutRef.current);
    }
    
    clickTimeoutRef.current = setTimeout(() => {
      setClickCount(0);
    }, 1000);
  };

  useEffect(() => {
    if (clickCount >= 5) {
      setClickCount(0);
      if (isAuthenticated) {
        setLocation("/admin");
      } else {
        setShowLoginModal(true);
      }
    }
  }, [clickCount, isAuthenticated, setLocation]);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    loginMutation.mutate(
      { data: { password } },
      {
        onSuccess: (data) => {
          setToken(data.token);
          setShowLoginModal(false);
          setPassword("");
          setLocation("/admin");
        },
        onError: () => {
          toast({
            title: "Access Denied",
            description: "Incorrect password.",
            variant: "destructive"
          });
          setPassword("");
        }
      }
    );
  };

  return (
    <>
      <nav className="sticky top-0 z-50 w-full border-b border-white/5 bg-background/80 backdrop-blur-xl">
        <div className="container mx-auto px-4 h-20 flex items-center justify-between">
          
          {/* Logo / Title Area */}
          <div 
            className="flex flex-col cursor-pointer select-none group" 
            onClick={handleTitleClick}
          >
            <h1 className="text-2xl md:text-3xl font-display font-bold color-cycle-text uppercase tracking-wider group-hover:scale-[1.02] transition-transform">
              {settings?.websiteTitle || "TVR Dubbers"}
            </h1>
            <p className="text-xs md:text-sm text-muted-foreground uppercase tracking-widest mt-0.5 opacity-80 font-semibold">
              {settings?.motto || "We Believe in Quality"}
            </p>
          </div>

          {/* Right Actions */}
          <div className="flex items-center gap-4 md:gap-6">
            
            {/* Search Bar */}
            <div className="relative hidden md:block w-64 group">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input 
                  type="text" 
                  placeholder="Search donghua..." 
                  className="pl-9 bg-white/5 border-white/10 focus-visible:border-cyan-500/50 rounded-full transition-all group-hover:bg-white/10"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onFocus={() => setIsSearchFocused(true)}
                  onBlur={() => setTimeout(() => setIsSearchFocused(false), 200)}
                />
              </div>
              
              {/* Search Results Dropdown */}
              {isSearchFocused && searchQuery.length > 0 && (
                <div className="absolute top-full mt-2 w-full bg-card border border-card-border rounded-xl shadow-2xl overflow-hidden glass-card">
                  {searchResults && searchResults.length > 0 ? (
                    <div className="flex flex-col">
                      {searchResults.map(ep => (
                        <div 
                          key={ep.id} 
                          className="flex items-center gap-3 p-3 hover:bg-white/5 cursor-pointer transition-colors"
                        >
                          <div className="w-12 h-8 bg-black/40 rounded overflow-hidden flex-shrink-0">
                            {ep.thumbnailUrl && <img src={ep.thumbnailUrl} alt="" className="w-full h-full object-cover" />}
                          </div>
                          <div className="flex-1 truncate">
                            <p className="text-sm font-medium truncate text-white">{ep.title}</p>
                            <p className="text-xs text-muted-foreground">EP {ep.episodeNumber}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="p-4 text-sm text-center text-muted-foreground">
                      Coming Soon
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Theme Toggle */}
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-muted-foreground hidden sm:inline-block">Light</span>
              <Switch 
                checked={theme === "dark"} 
                onCheckedChange={toggleTheme}
                className="data-[state=checked]:bg-cyan-600"
              />
              <span className="text-xs font-medium text-white hidden sm:inline-block">Dark</span>
            </div>

            {isAuthenticated && (
              <Button variant="outline" size="sm" onClick={() => setLocation("/admin")} className="hidden sm:flex border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/10 hover:text-cyan-300">
                Admin
              </Button>
            )}

          </div>
        </div>
      </nav>

      <Dialog open={showLoginModal} onOpenChange={setShowLoginModal}>
        <DialogContent className="sm:max-w-md bg-black/80 backdrop-blur-xl border-white/10">
          <DialogTitle className="text-2xl font-display text-center flex flex-col items-center gap-4">
            <div className="w-12 h-12 bg-cyan-950/50 rounded-full flex items-center justify-center border border-cyan-500/30">
              <Lock className="w-6 h-6 text-cyan-400" />
            </div>
            Admin Authorization
          </DialogTitle>
          <DialogDescription className="text-center text-muted-foreground">
            Please enter your password to access the admin panel.
          </DialogDescription>
          
          <form onSubmit={handleLogin} className="space-y-6 mt-4">
            <Input
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="h-12 bg-white/5 border-white/10 text-center text-xl tracking-[0.2em] focus:border-cyan-500/50"
              autoFocus
            />
            <Button 
              type="submit" 
              className="w-full h-12 bg-cyan-600 hover:bg-cyan-500 font-bold uppercase tracking-widest"
              disabled={!password || loginMutation.isPending}
            >
              {loginMutation.isPending ? "Verifying..." : "Authenticate"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
