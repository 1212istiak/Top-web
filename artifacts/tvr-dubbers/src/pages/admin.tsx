import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { 
  useListEpisodes, useCreateEpisode, useUpdateEpisode, useDeleteEpisode,
  useGetTrailer, useUpdateTrailer,
  useGetSettings, useUpdateSettings,
  useListVoiceArtists, useCreateVoiceArtist, useDeleteVoiceArtist,
  useListAllComments, useDeleteComment,
  useChangeAdminPassword
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { 
  getGetTrailerQueryKey, getGetSettingsQueryKey, getListVoiceArtistsQueryKey, 
  getListEpisodesQueryKey, getListAllCommentsQueryKey 
} from "@workspace/api-client-react";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { Trash2, Edit, Plus, LogOut, ChevronLeft } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export function AdminPage() {
  const { isAuthenticated, setToken } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!isAuthenticated) {
      setLocation("/");
    }
  }, [isAuthenticated, setLocation]);

  if (!isAuthenticated) return null;

  return (
    <div className="min-h-screen bg-background w-full">
      {/* Admin Header */}
      <header className="border-b border-border bg-card sticky top-0 z-40">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => setLocation("/")}>
              <ChevronLeft className="h-5 w-5" />
            </Button>
            <h1 className="text-xl font-display font-bold text-cyan-400 tracking-widest uppercase">
              Command Center
            </h1>
          </div>
          <Button variant="destructive" size="sm" onClick={() => { setToken(null); setLocation("/"); }}>
            <LogOut className="h-4 w-4 mr-2" /> Logout
          </Button>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <Tabs defaultValue="episodes" className="flex flex-col md:flex-row gap-8">
          
          <TabsList className="flex flex-col w-full md:w-64 h-auto bg-card border border-border p-2 space-y-1">
            <TabsTrigger value="episodes" className="w-full justify-start data-[state=active]:bg-cyan-900/30 data-[state=active]:text-cyan-400">Episodes</TabsTrigger>
            <TabsTrigger value="trailer" className="w-full justify-start data-[state=active]:bg-cyan-900/30 data-[state=active]:text-cyan-400">Trailer</TabsTrigger>
            <TabsTrigger value="settings" className="w-full justify-start data-[state=active]:bg-cyan-900/30 data-[state=active]:text-cyan-400">Site Settings</TabsTrigger>
            <TabsTrigger value="social" className="w-full justify-start data-[state=active]:bg-cyan-900/30 data-[state=active]:text-cyan-400">Social Links</TabsTrigger>
            <TabsTrigger value="voice" className="w-full justify-start data-[state=active]:bg-cyan-900/30 data-[state=active]:text-cyan-400">Voice Artists</TabsTrigger>
            <TabsTrigger value="comments" className="w-full justify-start data-[state=active]:bg-cyan-900/30 data-[state=active]:text-cyan-400">Comments</TabsTrigger>
            <TabsTrigger value="password" className="w-full justify-start data-[state=active]:bg-cyan-900/30 data-[state=active]:text-cyan-400">Password</TabsTrigger>
          </TabsList>

          <div className="flex-1 glass-card p-6 md:p-8 rounded-xl border border-border">
            <TabsContent value="episodes"><EpisodesTab /></TabsContent>
            <TabsContent value="trailer"><TrailerTab /></TabsContent>
            <TabsContent value="settings"><SettingsTab /></TabsContent>
            <TabsContent value="social"><SocialTab /></TabsContent>
            <TabsContent value="voice"><VoiceArtistsTab /></TabsContent>
            <TabsContent value="comments"><CommentsTab /></TabsContent>
            <TabsContent value="password"><PasswordTab /></TabsContent>
          </div>

        </Tabs>
      </main>
    </div>
  );
}

// ---------------------------------------------------------------------------
// EPISODES TAB
// ---------------------------------------------------------------------------
function EpisodesTab() {
  const { data: episodes } = useListEpisodes();
  const deleteEpisode = useDeleteEpisode();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingEpisode, setEditingEpisode] = useState<any>(null);

  const handleDelete = (id: number) => {
    if (confirm("Delete this episode? This cannot be undone.")) {
      deleteEpisode.mutate({ id }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListEpisodesQueryKey() });
          toast({ title: "Deleted successfully" });
        }
      });
    }
  };

  const openEdit = (ep: any) => {
    setEditingEpisode(ep);
    setIsFormOpen(true);
  };

  const openNew = () => {
    setEditingEpisode(null);
    setIsFormOpen(true);
  };

  return (
    <div className="space-y-6 animate-in fade-in">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-display font-bold">Manage Episodes</h2>
        <Button onClick={openNew} className="bg-cyan-600 hover:bg-cyan-500 text-white">
          <Plus className="mr-2 h-4 w-4" /> New Episode
        </Button>
      </div>

      <div className="border border-border rounded-lg overflow-hidden bg-black/20">
        <table className="w-full text-sm text-left">
          <thead className="text-xs uppercase bg-black/40 text-muted-foreground">
            <tr>
              <th className="px-4 py-3">EP</th>
              <th className="px-4 py-3">Title</th>
              <th className="px-4 py-3">Special</th>
              <th className="px-4 py-3">Views</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {episodes?.map(ep => (
              <tr key={ep.id} className="border-b border-border hover:bg-white/5">
                <td className="px-4 py-3 font-mono">{ep.episodeNumber}</td>
                <td className="px-4 py-3 font-medium">{ep.title}</td>
                <td className="px-4 py-3">{ep.isSpecial ? "Yes" : "No"}</td>
                <td className="px-4 py-3 text-muted-foreground">{ep.viewCount}</td>
                <td className="px-4 py-3 text-right space-x-2">
                  <Button variant="ghost" size="icon" onClick={() => openEdit(ep)}>
                    <Edit className="h-4 w-4 text-cyan-400" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => handleDelete(ep.id)}>
                    <Trash2 className="h-4 w-4 text-red-400" />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
        <DialogContent className="sm:max-w-[600px] bg-card border-border">
          <DialogHeader>
            <DialogTitle>{editingEpisode ? "Edit Episode" : "New Episode"}</DialogTitle>
          </DialogHeader>
          <EpisodeForm 
            episode={editingEpisode} 
            onSuccess={() => {
              setIsFormOpen(false);
              queryClient.invalidateQueries({ queryKey: getListEpisodesQueryKey() });
            }}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}

function EpisodeForm({ episode, onSuccess }: { episode?: any, onSuccess: () => void }) {
  const createEp = useCreateEpisode();
  const updateEp = useUpdateEpisode();
  const { toast } = useToast();

  const [formData, setFormData] = useState({
    title: episode?.title || "",
    episodeNumber: episode?.episodeNumber?.toString() || "",
    season: episode?.season?.toString() || "1",
    genre: episode?.genre || "",
    thumbnailUrl: episode?.thumbnailUrl || "",
    primaryServerUrl: episode?.primaryServerUrl || "",
    backupServerUrl: episode?.backupServerUrl || "",
    isSpecial: episode?.isSpecial || false,
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const data = {
      title: formData.title,
      episodeNumber: parseInt(formData.episodeNumber),
      season: parseInt(formData.season),
      genre: formData.genre,
      thumbnailUrl: formData.thumbnailUrl,
      primaryServerUrl: formData.primaryServerUrl,
      backupServerUrl: formData.backupServerUrl,
      isSpecial: formData.isSpecial,
    };

    if (episode) {
      updateEp.mutate({ id: episode.id, data }, {
        onSuccess: () => { toast({ title: "Saved successfully ✓" }); onSuccess(); }
      });
    } else {
      createEp.mutate({ data }, {
        onSuccess: () => { toast({ title: "Saved successfully ✓" }); onSuccess(); }
      });
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 py-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <label className="text-xs text-muted-foreground">Title</label>
          <Input required value={formData.title} onChange={e => setFormData({...formData, title: e.target.value})} />
        </div>
        <div className="space-y-2">
          <label className="text-xs text-muted-foreground">Genre</label>
          <Select value={formData.genre} onValueChange={v => setFormData({...formData, genre: v})}>
            <SelectTrigger>
              <SelectValue placeholder="Select Genre" />
            </SelectTrigger>
            <SelectContent>
              {["Action", "Romance", "Comedy", "Tragedy", "Mystery", "Thriller", "R-rated Action"].map(g => (
                <SelectItem key={g} value={g}>{g}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <label className="text-xs text-muted-foreground">Episode #</label>
          <Input type="number" required value={formData.episodeNumber} onChange={e => setFormData({...formData, episodeNumber: e.target.value})} />
        </div>
        <div className="space-y-2">
          <label className="text-xs text-muted-foreground">Season</label>
          <Input type="number" required value={formData.season} onChange={e => setFormData({...formData, season: e.target.value})} />
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-xs text-muted-foreground">Thumbnail URL</label>
        <Input value={formData.thumbnailUrl} onChange={e => setFormData({...formData, thumbnailUrl: e.target.value})} />
      </div>

      <div className="space-y-2">
        <label className="text-xs text-muted-foreground">Primary Server URL (Dailymotion)</label>
        <Input value={formData.primaryServerUrl} onChange={e => setFormData({...formData, primaryServerUrl: e.target.value})} />
      </div>

      <div className="space-y-2">
        <label className="text-xs text-muted-foreground">Backup Server URL (Rumble)</label>
        <Input value={formData.backupServerUrl} onChange={e => setFormData({...formData, backupServerUrl: e.target.value})} />
      </div>

      <div className="flex items-center space-x-2 pt-2">
        <Switch 
          checked={formData.isSpecial} 
          onCheckedChange={v => setFormData({...formData, isSpecial: v})} 
        />
        <label className="text-sm font-medium">Mark as Special Episode</label>
      </div>

      <Button type="submit" className="w-full mt-4" disabled={createEp.isPending || updateEp.isPending}>
        {createEp.isPending || updateEp.isPending ? "Saving..." : "Save Episode"}
      </Button>
    </form>
  );
}

// ---------------------------------------------------------------------------
// TRAILER TAB
// ---------------------------------------------------------------------------
function TrailerTab() {
  const { data: trailer } = useGetTrailer();
  const updateTrailer = useUpdateTrailer();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [formData, setFormData] = useState({
    title: "", genre: "", thumbnailUrl: "", primaryServerUrl: "", backupServerUrl: ""
  });

  useEffect(() => {
    if (trailer) {
      setFormData({
        title: trailer.title || "",
        genre: trailer.genre || "",
        thumbnailUrl: trailer.thumbnailUrl || "",
        primaryServerUrl: trailer.primaryServerUrl || "",
        backupServerUrl: trailer.backupServerUrl || ""
      });
    }
  }, [trailer]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateTrailer.mutate({ data: formData }, {
      onSuccess: () => {
        toast({ title: "Trailer updated successfully ✓" });
        queryClient.invalidateQueries({ queryKey: getGetTrailerQueryKey() });
      }
    });
  };

  return (
    <div className="space-y-6 animate-in fade-in">
      <h2 className="text-2xl font-display font-bold">Homepage Trailer</h2>
      <form onSubmit={handleSubmit} className="space-y-4 max-w-2xl">
        <div className="space-y-2">
          <label className="text-xs text-muted-foreground">Title</label>
          <Input value={formData.title} onChange={e => setFormData({...formData, title: e.target.value})} />
        </div>
        <div className="space-y-2">
          <label className="text-xs text-muted-foreground">Thumbnail URL</label>
          <Input value={formData.thumbnailUrl} onChange={e => setFormData({...formData, thumbnailUrl: e.target.value})} />
        </div>
        <div className="space-y-2">
          <label className="text-xs text-muted-foreground">Primary Server URL</label>
          <Input value={formData.primaryServerUrl} onChange={e => setFormData({...formData, primaryServerUrl: e.target.value})} />
        </div>
        <Button type="submit" disabled={updateTrailer.isPending}>Save Trailer</Button>
      </form>
    </div>
  );
}

// ---------------------------------------------------------------------------
// SETTINGS TAB
// ---------------------------------------------------------------------------
function SettingsTab() {
  const { data: settings } = useGetSettings();
  const updateSettings = useUpdateSettings();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [formData, setFormData] = useState<any>({});

  useEffect(() => {
    if (settings) setFormData(settings);
  }, [settings]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateSettings.mutate({ data: formData }, {
      onSuccess: () => {
        toast({ title: "Settings updated successfully ✓" });
        queryClient.invalidateQueries({ queryKey: getGetSettingsQueryKey() });
      }
    });
  };

  return (
    <div className="space-y-6 animate-in fade-in">
      <h2 className="text-2xl font-display font-bold">Site Settings</h2>
      <form onSubmit={handleSubmit} className="space-y-4 max-w-2xl">
        <div className="space-y-2">
          <label className="text-xs text-muted-foreground">Website Title</label>
          <Input value={formData.websiteTitle || ""} onChange={e => setFormData({...formData, websiteTitle: e.target.value})} />
        </div>
        <div className="space-y-2">
          <label className="text-xs text-muted-foreground">Motto</label>
          <Input value={formData.motto || ""} onChange={e => setFormData({...formData, motto: e.target.value})} />
        </div>
        <div className="space-y-2">
          <label className="text-xs text-muted-foreground">Special Folder Label</label>
          <Input value={formData.specialFolderLabel || ""} onChange={e => setFormData({...formData, specialFolderLabel: e.target.value})} />
        </div>
        <div className="space-y-2">
          <label className="text-xs text-muted-foreground">Special Thumbnail URL</label>
          <Input
            value={formData.specialFolderThumbnail || ""}
            onChange={e => setFormData({...formData, specialFolderThumbnail: e.target.value})}
            placeholder="Paste image URL for the Special Episode banner (16:9)"
          />
          {formData.specialFolderThumbnail && (
            <div className="mt-2 rounded-lg overflow-hidden border border-white/10" style={{ aspectRatio: "16/9", maxWidth: 320 }}>
              <img src={formData.specialFolderThumbnail} alt="Special thumbnail preview" className="w-full h-full object-cover" />
            </div>
          )}
        </div>
        <div className="space-y-2">
          <label className="text-xs text-muted-foreground">Countdown Target Date (ISO string or YYYY-MM-DD)</label>
          <Input type="datetime-local" value={formData.countdownTargetDate ? new Date(formData.countdownTargetDate).toISOString().slice(0,16) : ""} onChange={e => setFormData({...formData, countdownTargetDate: e.target.value ? new Date(e.target.value).toISOString() : ""})} />
        </div>
        <Button type="submit" disabled={updateSettings.isPending}>Save Settings</Button>
      </form>
    </div>
  );
}

// ---------------------------------------------------------------------------
// SOCIAL TAB
// ---------------------------------------------------------------------------
function SocialTab() {
  const { data: settings } = useGetSettings();
  const updateSettings = useUpdateSettings();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [formData, setFormData] = useState<any>({});

  useEffect(() => {
    if (settings) setFormData(settings);
  }, [settings]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateSettings.mutate({ data: formData }, {
      onSuccess: () => {
        toast({ title: "Social links updated successfully ✓" });
        queryClient.invalidateQueries({ queryKey: getGetSettingsQueryKey() });
      }
    });
  };

  const fields = ["facebook", "youtube", "telegram", "instagram", "dailymotion", "rumble", "whatsapp", "telegramChannel"];

  return (
    <div className="space-y-6 animate-in fade-in">
      <h2 className="text-2xl font-display font-bold">Social Links</h2>
      <form onSubmit={handleSubmit} className="space-y-4 max-w-2xl">
        {fields.map(field => (
          <div key={field} className="space-y-2">
            <label className="text-xs text-muted-foreground capitalize">{field}</label>
            <Input value={formData[field] || ""} onChange={e => setFormData({...formData, [field]: e.target.value})} placeholder="https://..." />
          </div>
        ))}
        <Button type="submit" disabled={updateSettings.isPending}>Save Social Links</Button>
      </form>
    </div>
  );
}

// ---------------------------------------------------------------------------
// VOICE ARTISTS TAB
// ---------------------------------------------------------------------------
function VoiceArtistsTab() {
  const { data: artists } = useListVoiceArtists();
  const createArtist = useCreateVoiceArtist();
  const deleteArtist = useDeleteVoiceArtist();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [name, setName] = useState("");

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    createArtist.mutate({ data: { name, displayOrder: (artists?.length || 0) + 1 } }, {
      onSuccess: () => {
        setName("");
        toast({ title: "Artist added" });
        queryClient.invalidateQueries({ queryKey: getListVoiceArtistsQueryKey() });
      }
    });
  };

  const handleDelete = (id: number) => {
    deleteArtist.mutate({ id }, {
      onSuccess: () => {
        toast({ title: "Artist removed" });
        queryClient.invalidateQueries({ queryKey: getListVoiceArtistsQueryKey() });
      }
    });
  };

  return (
    <div className="space-y-6 animate-in fade-in max-w-2xl">
      <h2 className="text-2xl font-display font-bold">Voice Artists</h2>
      
      <form onSubmit={handleAdd} className="flex gap-2">
        <Input required value={name} onChange={e => setName(e.target.value)} placeholder="New artist name" />
        <Button type="submit" disabled={createArtist.isPending}>Add</Button>
      </form>

      <ul className="space-y-2 mt-4">
        {artists?.map(a => (
          <li key={a.id} className="flex justify-between items-center p-3 bg-white/5 rounded-lg border border-border">
            <span>{a.name}</span>
            <Button variant="ghost" size="sm" onClick={() => handleDelete(a.id)} className="text-red-400 hover:text-red-300">
              <Trash2 className="h-4 w-4" />
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------------
// COMMENTS TAB
// ---------------------------------------------------------------------------
function CommentsTab() {
  const { data: comments } = useListAllComments();
  const deleteComment = useDeleteComment();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const handleDelete = (id: number) => {
    if (confirm("Delete this comment?")) {
      deleteComment.mutate({ id }, {
        onSuccess: () => {
          toast({ title: "Comment deleted" });
          queryClient.invalidateQueries({ queryKey: getListAllCommentsQueryKey() });
        }
      });
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in">
      <h2 className="text-2xl font-display font-bold">Comment Moderation</h2>
      
      <div className="border border-border rounded-lg overflow-hidden bg-black/20">
        <table className="w-full text-sm text-left">
          <thead className="text-xs uppercase bg-black/40 text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Episode ID</th>
              <th className="px-4 py-3">User</th>
              <th className="px-4 py-3">Comment</th>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {comments?.map(c => (
              <tr key={c.id} className="border-b border-border hover:bg-white/5">
                <td className="px-4 py-3 font-mono text-cyan-400">{c.episodeId}</td>
                <td className="px-4 py-3 font-semibold">{c.nickname}</td>
                <td className="px-4 py-3 max-w-xs truncate" title={c.body}>{c.body}</td>
                <td className="px-4 py-3 text-muted-foreground">{format(new Date(c.createdAt), 'MMM d, yyyy HH:mm')}</td>
                <td className="px-4 py-3 text-right">
                  <Button variant="ghost" size="icon" onClick={() => handleDelete(c.id)}>
                    <Trash2 className="h-4 w-4 text-red-400" />
                  </Button>
                </td>
              </tr>
            ))}
            {comments?.length === 0 && (
              <tr><td colSpan={5} className="text-center py-8 text-muted-foreground">No comments yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// PASSWORD TAB
// ---------------------------------------------------------------------------
function PasswordTab() {
  const changePassword = useChangeAdminPassword();
  const { toast } = useToast();
  
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      toast({ title: "Error", description: "New passwords do not match", variant: "destructive" });
      return;
    }
    
    changePassword.mutate({ data: { currentPassword, newPassword } }, {
      onSuccess: () => {
        toast({ title: "Password changed successfully ✓" });
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
      },
      onError: () => {
        toast({ title: "Error", description: "Failed to change password. Check your current password.", variant: "destructive" });
      }
    });
  };

  return (
    <div className="space-y-6 animate-in fade-in max-w-md">
      <h2 className="text-2xl font-display font-bold">Change Admin Password</h2>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <label className="text-xs text-muted-foreground">Current Password</label>
          <Input type="password" required value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} />
        </div>
        <div className="space-y-2">
          <label className="text-xs text-muted-foreground">New Password (min 6 chars)</label>
          <Input type="password" required minLength={6} value={newPassword} onChange={e => setNewPassword(e.target.value)} />
        </div>
        <div className="space-y-2">
          <label className="text-xs text-muted-foreground">Confirm New Password</label>
          <Input type="password" required minLength={6} value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} />
        </div>
        <Button type="submit" disabled={changePassword.isPending}>Update Password</Button>
      </form>
    </div>
  );
}
