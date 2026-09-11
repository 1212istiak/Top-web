import { useRef, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Mic, Square, Send, Loader2, Volume2 } from "lucide-react";

// ---------------------------------------------------------------------------
// Shared: call the backend Rocky endpoint
// ---------------------------------------------------------------------------
const API_BASE = import.meta.env.VITE_API_URL || "";

async function askRocky(mode: string, message: string): Promise<string> {
  const token = localStorage.getItem("tvr_admin_token");
  const res = await fetch(`${API_BASE}/api/rocky/generate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ mode, message }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error || "Rocky failed to respond");
  return data.text as string;
}

// ---------------------------------------------------------------------------
// Browser speech APIs (free, built-in — no extra service needed)
// ---------------------------------------------------------------------------
function speak(text: string) {
  if (!("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const utter = new SpeechSynthesisUtterance(text);
  utter.rate = 1.0;
  window.speechSynthesis.speak(utter);
}

function getSpeechRecognition(): any {
  const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
  return SR ? new SR() : null;
}

// ---------------------------------------------------------------------------
// MAIN ROCKY TAB
// ---------------------------------------------------------------------------
export function RockyTab() {
  return (
    <div className="space-y-6 animate-in fade-in">
      <div>
        <h2 className="text-2xl font-display font-bold text-cyan-400">Rocky</h2>
        <p className="text-sm text-muted-foreground mt-1">Your TVR Dubbers copilot — voice chat, scene ideas, titles, and growth insights.</p>
      </div>

      <Tabs defaultValue="voice" className="w-full">
        <TabsList className="bg-black/20 border border-border">
          <TabsTrigger value="voice">Voice Chat</TabsTrigger>
          <TabsTrigger value="scene">Scene Suggester</TabsTrigger>
          <TabsTrigger value="titles">Title Generator</TabsTrigger>
          <TabsTrigger value="growth">Growth Insights</TabsTrigger>
        </TabsList>

        <div className="mt-4">
          <TabsContent value="voice"><VoiceChatPanel /></TabsContent>
          <TabsContent value="scene"><PromptPanel mode="scene" placeholder="What's trending, requested, or being talked about lately? (e.g. fan comments asking for a scene, recent BTTH season buzz...)" buttonLabel="Suggest a scene" /></TabsContent>
          <TabsContent value="titles"><PromptPanel mode="titles" placeholder="Describe the episode/scene you just dubbed (characters, moment, tone)..." buttonLabel="Generate titles & descriptions" /></TabsContent>
          <TabsContent value="growth"><PromptPanel mode="growth" placeholder="Paste comments or messages from YouTube/Facebook/Telegram here..." buttonLabel="Analyze" /></TabsContent>
        </div>
      </Tabs>
    </div>
  );
}

// ---------------------------------------------------------------------------
// VOICE CHAT PANEL
// ---------------------------------------------------------------------------
function VoiceChatPanel() {
  const [messages, setMessages] = useState<{ role: "user" | "rocky"; text: string }[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<any>(null);
  const { toast } = useToast();

  const send = async (text: string) => {
    if (!text.trim() || isLoading) return;
    setMessages((m) => [...m, { role: "user", text }]);
    setInput("");
    setIsLoading(true);
    try {
      const reply = await askRocky("chat", text);
      setMessages((m) => [...m, { role: "rocky", text: reply }]);
      speak(reply);
    } catch (err: any) {
      toast({ title: "Rocky error", description: err.message, variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  const toggleListening = () => {
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
      return;
    }
    const recognition = getSpeechRecognition();
    if (!recognition) {
      toast({ title: "Not supported", description: "Voice input isn't supported in this browser. Try Chrome.", variant: "destructive" });
      return;
    }
    recognition.lang = "en-US";
    recognition.interimResults = false;
    recognition.onresult = (e: any) => {
      const transcript = e.results[0][0].transcript;
      send(transcript);
    };
    recognition.onend = () => setIsListening(false);
    recognition.onerror = () => setIsListening(false);
    recognitionRef.current = recognition;
    recognition.start();
    setIsListening(true);
  };

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="border border-border rounded-lg bg-black/20 p-4 h-80 overflow-y-auto space-y-3">
        {messages.length === 0 && (
          <p className="text-sm text-muted-foreground">Tap the mic or type below to talk to Rocky.</p>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${m.role === "user" ? "bg-cyan-900/40 text-cyan-100" : "bg-white/5 text-foreground"}`}>
              {m.text}
              {m.role === "rocky" && (
                <button onClick={() => speak(m.text)} className="ml-2 inline-block align-middle text-cyan-400 hover:text-cyan-300">
                  <Volume2 className="h-3.5 w-3.5 inline" />
                </button>
              )}
            </div>
          </div>
        ))}
        {isLoading && <Loader2 className="h-4 w-4 animate-spin text-cyan-400" />}
      </div>

      <div className="flex gap-2 items-end">
        <Button
          type="button"
          size="icon"
          onClick={toggleListening}
          className={isListening ? "bg-red-600 hover:bg-red-500" : "bg-cyan-600 hover:bg-cyan-500"}
        >
          {isListening ? <Square className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
        </Button>
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type a message..."
          className="flex-1 min-h-[44px] max-h-32"
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send(input);
            }
          }}
        />
        <Button type="button" size="icon" onClick={() => send(input)} disabled={isLoading}>
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// GENERIC PROMPT PANEL (used for Scene Suggester / Title Generator / Growth Insights)
// ---------------------------------------------------------------------------
function PromptPanel({ mode, placeholder, buttonLabel }: { mode: string; placeholder: string; buttonLabel: string }) {
  const [input, setInput] = useState("");
  const [output, setOutput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const run = async () => {
    if (!input.trim() || isLoading) return;
    setIsLoading(true);
    setOutput("");
    try {
      const reply = await askRocky(mode, input);
      setOutput(reply);
    } catch (err: any) {
      toast({ title: "Rocky error", description: err.message, variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-4 max-w-2xl">
      <Textarea
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder={placeholder}
        className="min-h-[100px]"
      />
      <Button onClick={run} disabled={isLoading} className="bg-cyan-600 hover:bg-cyan-500 text-white">
        {isLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
        {buttonLabel}
      </Button>
      {output && (
        <div className="border border-border rounded-lg bg-black/20 p-4 text-sm whitespace-pre-wrap">
          {output}
        </div>
      )}
    </div>
  );
}
