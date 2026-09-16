import { useRef, useState, useEffect } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Mic, Square, Send, Loader2, Volume2, VolumeX, ImagePlus, X, Zap, Brain } from "lucide-react";

// ---------------------------------------------------------------------------
// Types & Constants
// ---------------------------------------------------------------------------
type GeminiModel = "gemini-3.6-flash" | "gemini-3.7-flash" | "gemini-3.8-flash";

const MODELS: { id: GeminiModel; label: string; badge: string }[] = [
  { id: "gemini-3.6-flash", label: "3.6 Flash", badge: "Stable" },
  { id: "gemini-3.7-flash", label: "3.7 Flash", badge: "Fast" },
  { id: "gemini-3.8-flash", label: "3.8 Flash", badge: "Smartest" },
];

const LS_MODEL = "jerin_model";
const LS_THINKING = "jerin_thinking";

// ---------------------------------------------------------------------------
// Shared: call the backend Rocky endpoint
// ---------------------------------------------------------------------------
const API_BASE = import.meta.env.VITE_API_URL || "";

interface RockyResponse {
  text: string;
  functionCall?: { name: string; args: any };
}

async function askRockyFull(
  mode: string,
  message: string,
  model: GeminiModel,
  thinking: boolean,
  image?: { base64: string; mimeType: string },
  videoUrl?: string
): Promise<RockyResponse> {
  const token = localStorage.getItem("tvr_admin_token");
  const res = await fetch(`${API_BASE}/api/rocky/generate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({
      mode,
      message,
      model,
      thinking,
      ...(image ? { image: image.base64, imageMimeType: image.mimeType } : {}),
      ...(videoUrl ? { videoUrl } : {}),
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error || "Jerin failed to respond");
  return { text: data.text as string, functionCall: data.functionCall };
}

// Text-only convenience wrapper for panels that don't need function calls
async function askRocky(
  mode: string,
  message: string,
  model: GeminiModel,
  thinking: boolean,
  image?: { base64: string; mimeType: string },
  videoUrl?: string
): Promise<string> {
  const res = await askRockyFull(mode, message, model, thinking, image, videoUrl);
  return res.text;
}

function fileToBase64(file: File): Promise<{ base64: string; mimeType: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve({ base64: result.split(",")[1] || "", mimeType: file.type || "image/jpeg" });
    };
    reader.onerror = () => reject(new Error("Failed to read image"));
    reader.readAsDataURL(file);
  });
}

// ---------------------------------------------------------------------------
// Speech helpers
// ---------------------------------------------------------------------------
function cleanForSpeech(text: string): string {
  return text
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/\*(.*?)\*/g, "$1")
    .replace(/#{1,6}\s?/g, "")
    .replace(/`{1,3}(.*?)`{1,3}/g, "$1")
    .replace(/^[-•]\s?/gm, "")
    .trim();
}

function pickVoice(): SpeechSynthesisVoice | undefined {
  const voices = window.speechSynthesis.getVoices();
  return voices.find((v) => v.lang.toLowerCase().startsWith("bn")) || undefined;
}

function speak(text: string, muted: boolean) {
  if (muted || !("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const utter = new SpeechSynthesisUtterance(cleanForSpeech(text));
  utter.rate = 1.0;
  const voice = pickVoice();
  if (voice) utter.voice = voice;
  window.speechSynthesis.speak(utter);
}

function getSpeechRecognition(): any {
  const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
  return SR ? new SR() : null;
}

// ---------------------------------------------------------------------------
// JERIN SETTINGS BAR — model selector + thinking toggle
// ---------------------------------------------------------------------------
function JerinSettings({
  model, setModel, thinking, setThinking,
}: {
  model: GeminiModel;
  setModel: (m: GeminiModel) => void;
  thinking: boolean;
  setThinking: (t: boolean) => void;
}) {
  return (
    <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-3 p-3 rounded-lg bg-black/30 border border-cyan-900/40">
      {/* Model pills */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-xs text-muted-foreground mr-1">Model:</span>
        {MODELS.map((m) => (
          <button
            key={m.id}
            onClick={() => { setModel(m.id); localStorage.setItem(LS_MODEL, m.id); }}
            className={`px-2.5 py-1 rounded-full text-xs font-medium transition-all whitespace-nowrap ${
              model === m.id
                ? "bg-cyan-500 text-black shadow-[0_0_8px_rgba(6,182,212,0.6)]"
                : "bg-white/5 text-muted-foreground hover:bg-white/10"
            }`}
          >
            {m.label}
            {m.id === "gemini-3.8-flash" && (
              <span className="ml-1 opacity-70">✨</span>
            )}
          </button>
        ))}
      </div>

      {/* Divider */}
      <div className="h-5 w-px bg-border hidden sm:block" />

      {/* Thinking toggle */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-xs text-muted-foreground mr-1">Mode:</span>
        <button
          onClick={() => { setThinking(false); localStorage.setItem(LS_THINKING, "false"); }}
          className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium transition-all ${
            !thinking
              ? "bg-yellow-500 text-black shadow-[0_0_8px_rgba(234,179,8,0.5)]"
              : "bg-white/5 text-muted-foreground hover:bg-white/10"
          }`}
        >
          <Zap className="h-3 w-3" /> Quick
        </button>
        <button
          onClick={() => { setThinking(true); localStorage.setItem(LS_THINKING, "true"); }}
          className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium transition-all ${
            thinking
              ? "bg-purple-500 text-white shadow-[0_0_8px_rgba(168,85,247,0.5)]"
              : "bg-white/5 text-muted-foreground hover:bg-white/10"
          }`}
        >
          <Brain className="h-3 w-3" /> Deep
        </button>
      </div>

      {/* Active model badge */}
      <div className="sm:ml-auto text-xs text-muted-foreground">
        {MODELS.find(m => m.id === model)?.badge} · {thinking ? "Deep thinking" : "Quick mode"}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// MAIN ROCKY TAB
// ---------------------------------------------------------------------------
export function RockyTab() {
  const [model, setModel] = useState<GeminiModel>(
    () => (localStorage.getItem(LS_MODEL) as GeminiModel) || "gemini-3.8-flash"
  );
  const [thinking, setThinking] = useState<boolean>(
    () => localStorage.getItem(LS_THINKING) !== "false"
  );

  return (
    <div className="space-y-4 animate-in fade-in">
      <div>
        <h2 className="text-2xl font-display font-bold text-cyan-400">Jerin</h2>
        <p className="text-sm text-muted-foreground mt-1">Your TVR Dubbers copilot — voice chat, scene ideas, titles, and growth insights.</p>
      </div>

      <JerinSettings model={model} setModel={setModel} thinking={thinking} setThinking={setThinking} />

      <Tabs defaultValue="voice" className="w-full">
        <TabsList className="bg-black/20 border border-border flex-wrap h-auto gap-1 overflow-x-auto">
          <TabsTrigger value="voice">Voice Chat</TabsTrigger>
          <TabsTrigger value="scene">Scene Suggester</TabsTrigger>
          <TabsTrigger value="titles">Title Generator</TabsTrigger>
          <TabsTrigger value="growth">Growth Insights</TabsTrigger>
          <TabsTrigger value="publish">🚀 Publish</TabsTrigger>
        </TabsList>

        <div className="mt-4">
          <TabsContent value="voice"><VoiceChatPanel model={model} thinking={thinking} /></TabsContent>
          <TabsContent value="scene"><PromptPanel mode="scene" model={model} thinking={thinking} placeholder="What's trending, requested, or being talked about lately? (e.g. fan comments asking for a scene, recent BTTH season buzz...)" buttonLabel="Suggest a scene" /></TabsContent>
          <TabsContent value="titles"><PromptPanel mode="titles" model={model} thinking={thinking} placeholder="Describe the episode/scene you just dubbed (characters, moment, tone)..." buttonLabel="Generate titles & descriptions" /></TabsContent>
          <TabsContent value="growth"><GrowthPanel model={model} thinking={thinking} /></TabsContent>
          <TabsContent value="publish"><PublishPanel model={model} thinking={thinking} /></TabsContent>
        </div>
      </Tabs>
    </div>
  );
}

// ---------------------------------------------------------------------------
// VOICE CHAT PANEL
// ---------------------------------------------------------------------------
interface ChatMessage {
  role: "user" | "rocky" | "action";
  text: string;
  pendingAction?: { name: string; args: any };
  actionStatus?: "pending" | "confirmed" | "cancelled" | "failed";
  actionResult?: string;
  imageResult?: string; // data URL for a generated thumbnail
}

function ACTION_LABELS(name: string, args: any): string {
  if (name === "create_episode") {
    return `Create episode #${args.episodeNumber}: "${args.title}"${args.genre ? ` (${args.genre})` : ""}`;
  }
  if (name === "analyze_video") {
    return `Watch video: ${args.videoUrl}`;
  }
  if (name === "generate_thumbnail") {
    return `Write thumbnail design spec for: "${args.episodeContext}"`;
  }
  if (name === "schedule_social_post") {
    return `Schedule post on ${args.platformIds?.length || 0} platform(s): "${args.content}"`;
  }
  return name;
}

function VoiceChatPanel({ model, thinking }: { model: GeminiModel; thinking: boolean }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [muted, setMuted] = useState(false);
  const recognitionRef = useRef<any>(null);
  const { toast } = useToast();

  const send = async (text: string) => {
    if (!text.trim() || isLoading) return;
    setMessages((m) => [...m, { role: "user", text }]);
    setInput("");
    setIsLoading(true);
    try {
      const reply = await askRockyFull("chat", text, model, thinking);
      setMessages((m) => [
        ...m,
        {
          role: "rocky",
          text: reply.text,
          pendingAction: reply.functionCall,
          actionStatus: reply.functionCall ? "pending" : undefined,
        },
      ]);
      speak(reply.text, muted);
    } catch (err: any) {
      toast({ title: "Jerin error", description: err.message, variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  const runAction = async (index: number) => {
    const msg = messages[index];
    if (!msg.pendingAction) return;
    setMessages((m) => m.map((x, i) => (i === index ? { ...x, actionStatus: "confirmed" } : x)));
    try {
      const token = localStorage.getItem("tvr_admin_token");
      const res = await fetch(`${API_BASE}/api/rocky/execute-action`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ action: msg.pendingAction.name, args: msg.pendingAction.args }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Action failed");

      if (msg.pendingAction.name === "create_episode") {
        setMessages((m) => m.map((x, i) => (i === index ? { ...x, actionResult: `✅ Episode #${data.episodeId} is live.` } : x)));
      } else if (msg.pendingAction.name === "analyze_video") {
        setMessages((m) => m.map((x, i) => (i === index ? { ...x, actionResult: `✅ ${data.text}` } : x)));
      } else if (msg.pendingAction.name === "generate_thumbnail") {
        setMessages((m) => m.map((x, i) => (i === index ? { ...x, actionResult: `✅ ${data.text}` } : x)));
      } else if (msg.pendingAction.name === "schedule_social_post") {
        setMessages((m) => m.map((x, i) => (i === index ? { ...x, actionResult: `✅ Scheduled (${data.scheduledTime}).` } : x)));
      } else {
        setMessages((m) => m.map((x, i) => (i === index ? { ...x, actionResult: "✅ Done." } : x)));
      }
    } catch (err: any) {
      setMessages((m) => m.map((x, i) => (i === index ? { ...x, actionStatus: "failed", actionResult: `❌ ${err.message}` } : x)));
    }
  };

  const cancelAction = (index: number) => {
    setMessages((m) => m.map((x, i) => (i === index ? { ...x, actionStatus: "cancelled" } : x)));
  };

  const toggleListening = () => {
    if (isListening) { recognitionRef.current?.stop(); setIsListening(false); return; }
    const recognition = getSpeechRecognition();
    if (!recognition) {
      toast({ title: "Not supported", description: "Voice input isn't supported in this browser. Try Chrome.", variant: "destructive" });
      return;
    }
    recognition.lang = "en-US";
    recognition.interimResults = false;
    recognition.onresult = (e: any) => send(e.results[0][0].transcript);
    recognition.onend = () => setIsListening(false);
    recognition.onerror = () => setIsListening(false);
    recognitionRef.current = recognition;
    recognition.start();
    setIsListening(true);
  };

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="flex justify-end">
        <Button type="button" variant="ghost" size="sm"
          onClick={() => { const next = !muted; setMuted(next); if (next) window.speechSynthesis?.cancel(); }}
          className="text-muted-foreground hover:text-cyan-400"
        >
          {muted ? <VolumeX className="h-4 w-4 mr-1" /> : <Volume2 className="h-4 w-4 mr-1" />}
          {muted ? "Voice off" : "Voice on"}
        </Button>
      </div>

      <div className="border border-border rounded-lg bg-black/20 p-4 h-80 sm:h-96 overflow-y-auto space-y-4">
        {messages.length === 0 && (
          <p className="text-sm text-muted-foreground">Tap the mic or type below to talk to Jerin. Ask it to publish an episode and it'll show you a confirm card before doing anything real.</p>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`flex flex-col ${m.role === "user" ? "items-end" : "items-start"}`}>
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1 px-1">
              {m.role === "user" ? "You" : "Jerin"}
            </span>
            <div className={`max-w-[85%] rounded-lg px-3 py-2.5 text-sm leading-relaxed whitespace-pre-wrap break-words ${m.role === "user" ? "bg-cyan-900/40 text-cyan-100" : "bg-white/5 text-foreground"}`}>
              {m.text}
              {m.role === "rocky" && (
                <div className="mt-1.5 pt-1.5 border-t border-white/5">
                  <button onClick={() => speak(m.text, false)} className="text-cyan-400 hover:text-cyan-300 flex items-center gap-1 text-xs">
                    <Volume2 className="h-3.5 w-3.5" /> Replay
                  </button>
                </div>
              )}

              {m.pendingAction && (
                <div className="mt-2 p-2.5 rounded-md border border-cyan-700/50 bg-cyan-950/30">
                  <p className="text-xs font-semibold text-cyan-300 mb-1.5">⚡ {ACTION_LABELS(m.pendingAction.name, m.pendingAction.args)}</p>
                  {m.actionStatus === "pending" && (
                    <div className="flex gap-2">
                      <Button size="sm" className="h-7 text-xs bg-cyan-600 hover:bg-cyan-500" onClick={() => runAction(i)}>Confirm</Button>
                      <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => cancelAction(i)}>Cancel</Button>
                    </div>
                  )}
                  {m.actionStatus === "confirmed" && !m.actionResult && (
                    <p className="text-xs text-muted-foreground flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" /> Running...</p>
                  )}
                  {m.actionStatus === "cancelled" && <p className="text-xs text-muted-foreground">Cancelled.</p>}
                  {m.actionResult && <p className="text-xs whitespace-pre-wrap leading-relaxed">{m.actionResult}</p>}
                  {m.imageResult && (
                    <div className="mt-2">
                      <img src={m.imageResult} alt="Generated thumbnail" className="rounded-md border border-border max-w-full" />
                      <a href={m.imageResult} download="thumbnail.png" className="text-xs text-cyan-400 underline mt-1 inline-block">Download</a>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}
        {isLoading && <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin text-cyan-400" />{thinking ? "Deep thinking..." : "Thinking..."}</div>}
      </div>

      <div className="flex gap-2 items-end">
        <Button type="button" size="icon" onClick={toggleListening}
          className={isListening ? "bg-red-600 hover:bg-red-500" : "bg-cyan-600 hover:bg-cyan-500"}>
          {isListening ? <Square className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
        </Button>
        <Textarea value={input} onChange={(e) => setInput(e.target.value)}
          placeholder="Type a message..." className="flex-1 min-h-[44px] max-h-32"
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input); } }}
        />
        <Button type="button" size="icon" onClick={() => send(input)} disabled={isLoading}>
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );

}

// ---------------------------------------------------------------------------
// GENERIC PROMPT PANEL
// ---------------------------------------------------------------------------
function PromptPanel({ mode, model, thinking, placeholder, buttonLabel }: {
  mode: string; model: GeminiModel; thinking: boolean; placeholder: string; buttonLabel: string;
}) {
  const [input, setInput] = useState("");
  const [output, setOutput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const run = async () => {
    if (!input.trim() || isLoading) return;
    setIsLoading(true); setOutput("");
    try {
      const reply = await askRocky(mode, input, model, thinking);
      setOutput(reply);
    } catch (err: any) {
      toast({ title: "Jerin error", description: err.message, variant: "destructive" });
    } finally { setIsLoading(false); }
  };

  return (
    <div className="space-y-4 max-w-2xl">
      <Textarea value={input} onChange={(e) => setInput(e.target.value)} placeholder={placeholder} className="min-h-[100px]" />
      <Button onClick={run} disabled={isLoading} className="bg-cyan-600 hover:bg-cyan-500 text-white">
        {isLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
        {isLoading ? (thinking ? "Deep thinking..." : "Thinking...") : buttonLabel}
      </Button>
      {output && <div className="border border-border rounded-lg bg-black/20 p-4 text-sm whitespace-pre-wrap">{output}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// GROWTH INSIGHTS PANEL
// ---------------------------------------------------------------------------
function GrowthPanel({ model, thinking }: { model: GeminiModel; thinking: boolean }) {
  const [input, setInput] = useState("");
  const [output, setOutput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageData, setImageData] = useState<{ base64: string; mimeType: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const handleFile = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast({ title: "Not an image", description: "Please choose a screenshot image.", variant: "destructive" });
      return;
    }
    try {
      const data = await fileToBase64(file);
      setImageData(data);
      setImagePreview(URL.createObjectURL(file));
    } catch { toast({ title: "Couldn't read image", variant: "destructive" }); }
  };

  const clearImage = () => {
    setImageData(null); setImagePreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const run = async () => {
    if (!input.trim() && !imageData) return;
    setIsLoading(true); setOutput("");
    try {
      const reply = await askRocky("growth", input, model, thinking, imageData || undefined);
      setOutput(reply);
    } catch (err: any) {
      toast({ title: "Jerin error", description: err.message, variant: "destructive" });
    } finally { setIsLoading(false); }
  };

  return (
    <div className="space-y-4 max-w-2xl">
      <Textarea value={input} onChange={(e) => setInput(e.target.value)}
        placeholder="Paste comments/messages here, or attach a screenshot below (or both)..." className="min-h-[100px]" />
      <input ref={fileInputRef} type="file" accept="image/*" className="hidden"
        onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />
      {imagePreview ? (
        <div className="relative inline-block">
          <img src={imagePreview} alt="Screenshot preview" className="max-h-40 rounded-lg border border-border" />
          <button onClick={clearImage} className="absolute -top-2 -right-2 bg-red-600 rounded-full p-1">
            <X className="h-3 w-3 text-white" />
          </button>
        </div>
      ) : (
        <Button type="button" variant="outline" onClick={() => fileInputRef.current?.click()}>
          <ImagePlus className="h-4 w-4 mr-2" /> Attach screenshot
        </Button>
      )}
      <div>
        <Button onClick={run} disabled={isLoading} className="bg-cyan-600 hover:bg-cyan-500 text-white">
          {isLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
          {isLoading ? (thinking ? "Deep thinking..." : "Analyzing...") : "Analyze"}
        </Button>
      </div>
      {output && <div className="border border-border rounded-lg bg-black/20 p-4 text-sm whitespace-pre-wrap">{output}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// PUBLISH PANEL — analyze a video by URL, then publish to site + Publora
// (video uploads go browser -> Publora directly, never through our backend)
// ---------------------------------------------------------------------------
interface PlatformConnection {
  platformId: string;
  username?: string;
  displayName?: string; // only present for X/Bluesky/Mastodon per Publora docs
  profileImageUrl?: string;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// PUT with upload progress via XHR (fetch doesn't expose upload progress)
function uploadWithProgress(url: string, file: File, onProgress: (pct: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url, true);
    xhr.setRequestHeader("Content-Type", file.type || "video/mp4");
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`Upload failed (${xhr.status})`));
    };
    xhr.onerror = () => reject(new Error("Upload failed — network error"));
    xhr.send(file);
  });
}

function PublishPanel({ model, thinking }: { model: GeminiModel; thinking: boolean }) {
  const { toast } = useToast();

  // Video source for Gemini's own analysis (public URL — YouTube or any watchable link)
  const [analyzeVideoUrl, setAnalyzeVideoUrl] = useState("");
  const [analysisOutput, setAnalysisOutput] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  // Episode fields (site)
  const [publishToSite, setPublishToSite] = useState(true);
  const [title, setTitle] = useState("");
  const [episodeNumber, setEpisodeNumber] = useState("");
  const [season, setSeason] = useState("1");
  const [genre, setGenre] = useState("");
  const [thumbnailUrl, setThumbnailUrl] = useState("");
  const [embedUrl, setEmbedUrl] = useState(""); // Dailymotion/Rumble/YouTube embed for the site player
  const [backupUrl, setBackupUrl] = useState("");
  const [isSpecial, setIsSpecial] = useState(false);

  // Social (Publora) — actual video FILE, uploaded directly browser -> Publora
  const [publishToSocial, setPublishToSocial] = useState(false);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [socialCaption, setSocialCaption] = useState("");
  const [youtubeVisibility, setYoutubeVisibility] = useState<"public" | "unlisted" | "private">("unlisted");
  const [connections, setConnections] = useState<PlatformConnection[] | null>(null);
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>([]);
  const [scheduledTime, setScheduledTime] = useState("");
  const [loadingConnections, setLoadingConnections] = useState(false);

  const [isPublishing, setIsPublishing] = useState(false);
  const [publishStage, setPublishStage] = useState("");
  const [uploadPct, setUploadPct] = useState(0);
  const [publishResult, setPublishResult] = useState<any>(null);

  const loadConnections = async () => {
    setLoadingConnections(true);
    try {
      const token = localStorage.getItem("tvr_admin_token");
      const res = await fetch(`${API_BASE}/api/rocky/publora/connections`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Couldn't load Publora connections");
      setConnections(data.connections || []);
    } catch (err: any) {
      toast({ title: "Publora error", description: err.message, variant: "destructive" });
    } finally {
      setLoadingConnections(false);
    }
  };

  const analyzeVideo = async () => {
    if (!analyzeVideoUrl.trim() || isAnalyzing) return;
    setIsAnalyzing(true);
    setAnalysisOutput("");
    try {
      const reply = await askRocky(
        "titles",
        "Watch this video and suggest: 1) an optimized title, 2) a genre/category, 3) descriptions for YouTube, Facebook and Telegram, 4) a short curiosity-driven trailer/sneak-peek hook. Use clear labeled sections.",
        model,
        thinking,
        undefined,
        analyzeVideoUrl
      );
      setAnalysisOutput(reply);
    } catch (err: any) {
      toast({ title: "Jerin error", description: err.message, variant: "destructive" });
    } finally {
      setIsAnalyzing(false);
    }
  };

  const togglePlatform = (id: string) => {
    setSelectedPlatforms((prev) => (prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]));
  };

  const authHeaders = (): Record<string, string> => {
    const token = localStorage.getItem("tvr_admin_token");
    return { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) };
  };

  const publish = async () => {
    if (!publishToSite && !publishToSocial) {
      toast({ title: "Nothing to publish", description: "Enable at least one of website or social publishing.", variant: "destructive" });
      return;
    }
    if (publishToSite && (!title.trim() || !episodeNumber || !embedUrl.trim())) {
      toast({ title: "Missing website fields", description: "Title, episode number, and embed URL are required to publish to your site.", variant: "destructive" });
      return;
    }
    if (publishToSocial && (!videoFile || selectedPlatforms.length === 0)) {
      toast({ title: "Missing social fields", description: "A video file and at least one platform are required to publish to social.", variant: "destructive" });
      return;
    }

    setIsPublishing(true);
    setUploadPct(0);
    setPublishResult(null);
    const result: any = { site: null, social: null };

    try {
      // Step 1: create episode on the site (only if enabled)
      if (publishToSite) {
        setPublishStage("Creating episode on your site...");
        const siteRes = await fetch(`${API_BASE}/api/rocky/publish`, {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({
            title,
            episodeNumber: Number(episodeNumber),
            season: Number(season) || 1,
            genre: genre || undefined,
            thumbnailUrl: thumbnailUrl || undefined,
            primaryServerUrl: embedUrl,
            backupServerUrl: backupUrl || undefined,
            isSpecial,
          }),
        });
        const siteData = await siteRes.json();
        if (!siteRes.ok) {
          result.site = { success: false, error: siteData?.error || "Couldn't create the episode on your site." };
        } else {
          result.site = { success: true, episodeId: siteData.episodeId };
        }
      }

      // Step 2: Publora, if enabled — runs independently of the site step above
      if (publishToSocial && videoFile) {
        setPublishStage("Creating Publora draft...");
        const draftRes = await fetch(`${API_BASE}/api/rocky/publora/create-draft`, {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({ content: socialCaption || title || "New episode", platformIds: selectedPlatforms, youtubeVisibility }),
        });
        const draftData = await draftRes.json();
        if (!draftRes.ok) throw new Error(draftData?.error || "Publora draft creation failed.");
        const { postGroupId } = draftData;

        setPublishStage("Requesting upload URL...");
        const uploadUrlRes = await fetch(`${API_BASE}/api/rocky/publora/get-upload-url`, {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({ postGroupId, fileName: videoFile.name, contentType: videoFile.type || "video/mp4" }),
        });
        const uploadUrlData = await uploadUrlRes.json();
        if (!uploadUrlRes.ok) throw new Error(uploadUrlData?.error || "Couldn't get a Publora upload URL.");

        setPublishStage(`Uploading video (${formatBytes(videoFile.size)}) directly to Publora...`);
        await uploadWithProgress(uploadUrlData.uploadUrl, videoFile, setUploadPct);

        setPublishStage("Scheduling post...");
        const finalizeRes = await fetch(`${API_BASE}/api/rocky/publora/finalize`, {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({
            postGroupId,
            scheduledTime: scheduledTime ? new Date(scheduledTime).toISOString() : undefined,
          }),
        });
        const finalizeData = await finalizeRes.json();
        if (!finalizeRes.ok) throw new Error(finalizeData?.error || "Publora scheduling failed.");
        result.social = { success: true, scheduledTime: finalizeData.scheduledTime };
      }

      setPublishResult(result);
      const parts = [];
      if (result.site?.success) parts.push("live on your site");
      if (result.social?.success) parts.push("scheduled on social");
      toast({
        title: parts.length ? "Published!" : "Publish had issues",
        description: parts.length ? parts.join(" and ") + "." : "Check the results below.",
        variant: parts.length ? undefined : "destructive",
      });
    } catch (err: any) {
      result.social = publishToSocial ? { success: false, error: err.message } : null;
      setPublishResult(result);
      toast({ title: "Publish error", description: err.message, variant: "destructive" });
    } finally {
      setIsPublishing(false);
      setPublishStage("");
    }
  };

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Step 1: Analyze */}
      <div className="space-y-3 p-4 rounded-lg border border-border bg-black/10">
        <h3 className="text-sm font-semibold text-cyan-400">1. Analyze the video (optional)</h3>
        <p className="text-xs text-muted-foreground">Paste a public YouTube link (or any watchable video URL) and Jerin will actually watch it — visuals and audio — to suggest a title, genre, descriptions, and a trailer hook.</p>
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            value={analyzeVideoUrl}
            onChange={(e) => setAnalyzeVideoUrl(e.target.value)}
            placeholder="https://youtube.com/watch?v=..."
            className="flex-1 rounded-md border border-border bg-black/20 px-3 py-2 text-sm"
          />
          <Button type="button" onClick={analyzeVideo} disabled={isAnalyzing} className="bg-cyan-600 hover:bg-cyan-500 text-white whitespace-nowrap">
            {isAnalyzing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
            {isAnalyzing ? (thinking ? "Watching (deep)..." : "Watching...") : "Analyze video"}
          </Button>
        </div>
        {analysisOutput && (
          <div className="border border-border rounded-lg bg-black/20 p-4 text-sm whitespace-pre-wrap">{analysisOutput}</div>
        )}
      </div>

      {/* Step 2: Episode details */}
      <div className="space-y-3 p-4 rounded-lg border border-border bg-black/10">
        <label className="flex items-center gap-2 text-sm font-semibold text-cyan-400">
          <input type="checkbox" checked={publishToSite} onChange={(e) => setPublishToSite(e.target.checked)} />
          2. Publish to your website
        </label>
        {publishToSite && (
          <div className="space-y-3 pl-1">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title *" className="rounded-md border border-border bg-black/20 px-3 py-2 text-sm" />
              <input value={genre} onChange={(e) => setGenre(e.target.value)} placeholder="Genre" className="rounded-md border border-border bg-black/20 px-3 py-2 text-sm" />
              <input value={episodeNumber} onChange={(e) => setEpisodeNumber(e.target.value)} type="number" placeholder="Episode number *" className="rounded-md border border-border bg-black/20 px-3 py-2 text-sm" />
              <input value={season} onChange={(e) => setSeason(e.target.value)} type="number" placeholder="Season" className="rounded-md border border-border bg-black/20 px-3 py-2 text-sm" />
            </div>
            <input value={embedUrl} onChange={(e) => setEmbedUrl(e.target.value)} placeholder="Embed URL (Dailymotion/Rumble/YouTube) *" className="w-full rounded-md border border-border bg-black/20 px-3 py-2 text-sm" />
            <input value={backupUrl} onChange={(e) => setBackupUrl(e.target.value)} placeholder="Backup embed URL (optional)" className="w-full rounded-md border border-border bg-black/20 px-3 py-2 text-sm" />
            <input value={thumbnailUrl} onChange={(e) => setThumbnailUrl(e.target.value)} placeholder="Thumbnail URL (optional, e.g. Cloudinary)" className="w-full rounded-md border border-border bg-black/20 px-3 py-2 text-sm" />
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <input type="checkbox" checked={isSpecial} onChange={(e) => setIsSpecial(e.target.checked)} />
              Special episode
            </label>
          </div>
        )}
      </div>

      {/* Step 3: Social publishing */}
      <div className="space-y-3 p-4 rounded-lg border border-border bg-black/10">
        <label className="flex items-center gap-2 text-sm font-semibold text-cyan-400">
          <input type="checkbox" checked={publishToSocial} onChange={(e) => { setPublishToSocial(e.target.checked); if (e.target.checked && !connections) loadConnections(); }} />
          3. Also publish to social (via Publora)
        </label>

        {publishToSocial && (
          <div className="space-y-3 pl-1">
            <div>
              <input
                ref={fileInputRef}
                type="file"
                accept="video/*"
                className="hidden"
                onChange={(e) => setVideoFile(e.target.files?.[0] || null)}
              />
              {videoFile ? (
                <div className="flex items-center justify-between rounded-md border border-border bg-black/20 px-3 py-2 text-sm">
                  <span className="truncate">{videoFile.name} · {formatBytes(videoFile.size)}</span>
                  <button onClick={() => { setVideoFile(null); if (fileInputRef.current) fileInputRef.current.value = ""; }} className="text-red-400 ml-2 shrink-0">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <Button type="button" variant="outline" className="w-full" onClick={() => fileInputRef.current?.click()}>
                  <ImagePlus className="h-4 w-4 mr-2" /> Select video file *
                </Button>
              )}
              <p className="text-[11px] text-muted-foreground mt-1">Uploads directly from your browser to Publora — never passes through this server, so large files are fine.</p>
            </div>

            <Textarea value={socialCaption} onChange={(e) => setSocialCaption(e.target.value)} placeholder="Social caption (defaults to title if left blank)" className="min-h-[70px]" />

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs text-muted-foreground">Connected platforms</span>
                <Button type="button" size="sm" variant="ghost" onClick={loadConnections} disabled={loadingConnections} className="text-xs h-6">
                  {loadingConnections ? <Loader2 className="h-3 w-3 animate-spin" /> : "Refresh"}
                </Button>
              </div>
              {connections === null ? (
                <p className="text-xs text-muted-foreground">Loading connections...</p>
              ) : connections.length === 0 ? (
                <p className="text-xs text-muted-foreground">No connected accounts found — connect them at app.publora.com</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {connections.map((c) => (
                    <button
                      key={c.platformId}
                      type="button"
                      onClick={() => togglePlatform(c.platformId)}
                      className={`px-2.5 py-1 rounded-full text-xs font-medium transition-all ${
                        selectedPlatforms.includes(c.platformId)
                          ? "bg-cyan-500 text-black"
                          : "bg-white/5 text-muted-foreground hover:bg-white/10"
                      }`}
                    >
                      {c.displayName || c.username || c.platformId.split("-")[0]}
                      <span className="opacity-50 ml-1">({c.platformId.split("-")[0]})</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {selectedPlatforms.some((p) => p.startsWith("youtube")) && (
              <div>
                <span className="text-xs text-muted-foreground block mb-1">YouTube visibility</span>
                <div className="flex gap-1.5">
                  {(["public", "unlisted", "private"] as const).map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setYoutubeVisibility(v)}
                      className={`px-2.5 py-1 rounded-full text-xs font-medium capitalize transition-all ${
                        youtubeVisibility === v
                          ? "bg-cyan-500 text-black"
                          : "bg-white/5 text-muted-foreground hover:bg-white/10"
                      }`}
                    >
                      {v}
                    </button>
                  ))}
                </div>
                <p className="text-[11px] text-muted-foreground mt-1">Publora defaults new YouTube uploads to public if not set — Jerin defaults to unlisted here instead, so nothing goes public by accident.</p>
              </div>
            )}

            <div>
              <span className="text-xs text-muted-foreground block mb-1">Schedule time (leave blank to post ASAP)</span>
              <input
                type="datetime-local"
                value={scheduledTime}
                onChange={(e) => setScheduledTime(e.target.value)}
                className="rounded-md border border-border bg-black/20 px-3 py-2 text-sm"
              />
            </div>
          </div>
        )}
      </div>

      {/* Publish button + progress */}
      <div className="space-y-2">
        <Button onClick={publish} disabled={isPublishing} className="w-full bg-cyan-600 hover:bg-cyan-500 text-white text-base py-6">
          {isPublishing ? <Loader2 className="h-5 w-5 mr-2 animate-spin" /> : "🚀"}
          {isPublishing ? "Publishing..." : "Publish Episode"}
        </Button>
        {isPublishing && (
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground text-center">{publishStage}</p>
            {uploadPct > 0 && (
              <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
                <div className="h-full bg-cyan-500 transition-all" style={{ width: `${uploadPct}%` }} />
              </div>
            )}
          </div>
        )}
      </div>

      {publishResult && (
        <div className="border border-border rounded-lg bg-black/20 p-4 text-sm space-y-1">
          {publishResult.site && (
            <p className={publishResult.site.success ? "text-green-400" : "text-red-400"}>
              Site: {publishResult.site.success ? `✅ Episode #${publishResult.site.episodeId} created` : `❌ ${publishResult.site.error}`}
            </p>
          )}
          {publishResult.social && (
            <p className={publishResult.social.success ? "text-green-400" : "text-red-400"}>
              Social: {publishResult.social.success ? `✅ Scheduled (${publishResult.social.scheduledTime})` : `❌ ${publishResult.social.error}`}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
