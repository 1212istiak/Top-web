import { useLocation } from "wouter";
import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useAdminLogin } from "@workspace/api-client-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Lock, ShieldAlert } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export function AdminLogin() {
  const { isAuthenticated, setToken } = useAuth();
  const [, setLocation] = useLocation();
  const loginMutation = useAdminLogin();
  const [password, setPassword] = useState("");
  const { toast } = useToast();

  useEffect(() => {
    if (isAuthenticated) {
      setLocation("/admin");
    }
  }, [isAuthenticated, setLocation]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    loginMutation.mutate(
      { data: { password } },
      {
        onSuccess: (data) => {
          setToken(data.token);
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

  if (isAuthenticated) return null;

  return (
    <div className="min-h-screen w-full bg-[#020408] flex items-center justify-center p-4 relative overflow-hidden">
      {/* Background glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-cyan-900/20 rounded-full blur-[120px] pointer-events-none" />
      
      <div className="w-full max-w-md bg-black/40 backdrop-blur-xl border border-white/10 rounded-3xl p-8 shadow-2xl relative z-10 animate-in zoom-in-95 duration-500">
        <div className="flex flex-col items-center text-center mb-8">
          <div className="w-16 h-16 bg-cyan-950/50 rounded-full flex items-center justify-center border border-cyan-500/30 mb-4">
            <Lock className="w-8 h-8 text-cyan-400" />
          </div>
          <h1 className="text-3xl font-display font-bold text-white tracking-wider">Restricted Area</h1>
          <p className="text-muted-foreground mt-2">Admin authorization required.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <Input
              type="password"
              placeholder="Enter admin password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="h-14 bg-white/5 border-white/10 text-center text-xl tracking-widest focus:border-cyan-500/50"
              autoFocus
            />
          </div>
          <Button 
            type="submit" 
            className="w-full h-14 bg-cyan-600 hover:bg-cyan-500 text-lg font-bold uppercase tracking-widest"
            disabled={!password || loginMutation.isPending}
          >
            {loginMutation.isPending ? "Verifying..." : "Authenticate"}
          </Button>
        </form>

        <div className="mt-8 pt-6 border-t border-white/10 text-center flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <ShieldAlert className="w-4 h-4" />
          Unauthorized access is strictly prohibited.
        </div>
      </div>
    </div>
  );
}
