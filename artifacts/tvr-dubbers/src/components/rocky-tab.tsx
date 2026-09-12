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

async function askRocky(
  mode: string,
  message: string,
  model: GeminiModel,
  thinking: boolean,
  image?: { base64: string; mimeType: string }
): Promise<string> {
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
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error || "Jerin failed to respond");
  return data.text as string;
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
    <div className="flex flex-wrap items-center gap-3 p-3 rounded-lg bg-black/30 border border-cyan-900/40">
      {/* Model pills */}
      <div className="flex items-center gap-1.5">
        <span className="text-xs text-muted-foreground mr-1">Model:</span>
        {MODELS.map((m) => (
          <button
            key={m.id}
            onClick={() => { setModel(m.id); localStorage.setItem(LS_MODEL, m.id); }}
            className={`px-2.5 py-1 rounded-full text-xs font-medium transition-all ${
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
      <div className="flex items-center gap-1.5">
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
      <div className="ml-auto text-xs text-muted-foreground hidden sm:block">
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
        <TabsList className="bg-black/20 border border-border">
          <TabsTrigger value="voice">Voice Chat</TabsTrigger>
          <TabsTrigger value="scene">Scene Suggester</TabsTrigger>
          <TabsTrigger value="titles">Title Generator</TabsTrigger>
          <TabsTrigger value="growth">Growth Insights</TabsTrigger>
        </TabsList>

        <div className="mt-4">
          <TabsContent value="voice"><VoiceChatPanel model={model} thinking={thinking} /></TabsContent>
          <TabsContent value="scene"><PromptPanel mode="scene" model={model} thinking={thinking} placeholder="What's trending, requested, or being talked about lately? (e.g. fan comments asking for a scene, recent BTTH season buzz...)" buttonLabel="Suggest a scene" /></TabsContent>
          <TabsContent value="titles"><PromptPanel mode="titles" model={model} thinking={thinking} placeholder="Describe the episode/scene you just dubbed (characters, moment, tone)..." buttonLabel="Generate titles & descriptions" /></TabsContent>
          <TabsContent value="growth"><GrowthPanel model={model} thinking={thinking} /></TabsContent>
        </div>
      </Tabs>
    </div>
  );
}

// ---------------------------------------------------------------------------
// VOICE CHAT PANEL
// ---------------------------------------------------------------------------
function VoiceChatPanel({ model, thinking }: { model: GeminiModel; thinking: boolean }) {
  const [messages, setMessages] = useState<{ role: "user" | "rocky"; text: string }[]>([]);
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
      const reply = await askRocky("chat", text, model, thinking);
      setMessages((m) => [...m, { role: "rocky", text: reply }]);
      speak(reply, muted);
    } catch (err: any) {
      toast({ title: "Jerin error", description: err.message, variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
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

      <div className="border border-border rounded-lg bg-black/20 p-4 h-80 overflow-y-auto space-y-3">
        {messages.length === 0 && (
          <p className="text-sm text-muted-foreground">Tap the mic or type below to talk to Jerin.</p>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${m.role === "user" ? "bg-cyan-900/40 text-cyan-100" : "bg-white/5 text-foreground"}`}>
              {m.text}
              {m.role === "rocky" && (
                <button onClick={() => speak(m.text, false)} className="ml-2 inline-block align-middle text-cyan-400 hover:text-cyan-300">
                  <Volume2 className="h-3.5 w-3.5 inline" />
                </button>
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
