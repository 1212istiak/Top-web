import { useState } from "react";
import { useGetSettings, useListVoiceArtists } from "@workspace/api-client-react";
import { FaFacebook, FaYoutube, FaTelegram, FaWhatsapp, FaInstagram, FaPlay, FaVideo } from "react-icons/fa";
import { SiRumble, SiDailymotion } from "react-icons/si";
import { useToast } from "@/hooks/use-toast";
import { Switch } from "@/components/ui/switch";

type Lang = "en" | "bn";

const ABOUT_TEXT: Record<Lang, { heading: string; body: string }> = {
  en: {
    heading: "Battle Through the Heavens in Bangla Dub",
    body:
      "TVR Dubbers (The Voice of Rockstar'z) is a fan-made Bangla dubbing group bringing the Chinese donghua Battle Through the Heavens (BTTH), also known as Doupo Cangqiong, to Bengali-speaking audiences. Follow Xiao Yan's struggle and rise, voiced, directed and edited with care by a team that believes in quality. Watch BTTH in Bangla dub, made by the fans, for the fans.",
  },
  bn: {
    heading: "ব্যাটল থ্রু দ্য হেভেনস বাংলা ডাব",
    body:
      "টিভিআর ডাবার্স (দ্য ভয়েস অফ রকস্টার'জ) ভক্তদের তৈরি একটি বাংলা ডাবিং গ্রুপ, যারা বাংলাভাষী দর্শকদের জন্য চাইনিজ ডনহুয়া ব্যাটল থ্রু দ্য হেভেনস (BTTH), যা ডৌপো ক্যাংকিয়ং নামেও পরিচিত, বাংলা ডাবে নিয়ে এসেছে। জিয়াও ইয়ানের লড়াই আর উত্থানের গল্প দেখুন এমন একটি দলের কণ্ঠে ও যত্নে, যারা বিশ্বাস করে মানের কোনো বিকল্প নেই। BTTH বাংলা ডাব দেখুন, ভক্তদের জন্য, ভক্তদের হাতে তৈরি।",
  },
};

// Both languages are always in the page HTML (one hidden), so search engines can read both.
function AboutBox() {
  const [lang, setLang] = useState<Lang>(() => {
    try {
      return localStorage.getItem("tvr_lang") === "bn" ? "bn" : "en";
    } catch {
      return "en";
    }
  });

  const handleChange = (isBengali: boolean) => {
    const next: Lang = isBengali ? "bn" : "en";
    setLang(next);
    try {
      localStorage.setItem("tvr_lang", next);
    } catch {
      /* storage unavailable, ignore */
    }
  };

  return (
    <section className="liquid-tile liquid-static rounded-2xl p-6 mb-12 relative">
      <div className="absolute top-4 right-4">
        <Switch
          checked={lang === "bn"}
          onCheckedChange={handleChange}
          aria-label="Switch language between English and Bengali"
          className="h-6 w-11 data-[state=checked]:bg-cyan-600"
          thumbClassName="flex h-5 w-5 items-center justify-center data-[state=checked]:translate-x-5"
          thumbIcon={
            <span className="text-[10px] font-bold leading-none text-foreground">
              {lang === "bn" ? "B" : "E"}
            </span>
          }
        />
      </div>

      <div lang="en" hidden={lang !== "en"} className="pr-16 space-y-3">
        <h2 className="text-lg font-display font-bold text-foreground">{ABOUT_TEXT.en.heading}</h2>
        <p className="text-sm text-muted-foreground leading-relaxed">{ABOUT_TEXT.en.body}</p>
      </div>

      <div
        lang="bn"
        hidden={lang !== "bn"}
        className="pr-16 space-y-3"
        style={{ fontFamily: "'Noto Sans Bengali', 'Inter', sans-serif" }}
      >
        <h2 className="text-lg font-bold text-foreground">{ABOUT_TEXT.bn.heading}</h2>
        <p className="text-sm text-muted-foreground leading-loose">{ABOUT_TEXT.bn.body}</p>
      </div>
    </section>
  );
}

// Accepts either a full WhatsApp link or a bare phone number typed into the
// admin panel (e.g. "01950241724") and always returns a proper wa.me link.
// Bare numbers starting with "0" are treated as local Bangladeshi numbers
// and get the +880 country code prefixed.
function normalizeWhatsappLink(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;

  let digits = trimmed.replace(/[^\d]/g, "");
  if (digits.startsWith("0")) {
    digits = "880" + digits.slice(1);
  }
  return digits ? `https://wa.me/${digits}` : null;
}

export function Footer() {
  const { data: settings } = useGetSettings();
  const { data: voiceArtists } = useListVoiceArtists();

  const handleLinkClick = (e: React.MouseEvent<HTMLAnchorElement>, url?: string | null) => {
    if (!url) {
      e.preventDefault();
      // Show toast
      alert("Coming Soon");
    }
  };

  return (
    <footer className="w-full border-t border-border bg-card/60 backdrop-blur-md mt-20 pt-16 pb-8">
      <div className="container mx-auto px-4">
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-12 mb-16">
          
          {/* Column 1: Brand */}
          <div className="space-y-4">
            <h2 className="text-2xl font-display font-bold text-foreground uppercase tracking-wider">
              {settings?.websiteTitle || "TVR Dubbers"}
            </h2>
            <p className="text-muted-foreground text-sm leading-relaxed max-w-sm">
              {settings?.motto || "We Believe in Quality"}<br/><br/>
              A passion-driven streaming hub dedicated to bringing the best Chinese animation (Donghua) to the Bengali-speaking audience.
            </p>
            <div className="inline-block mt-4 px-4 py-2 bg-foreground/5 rounded-lg border border-border">
              <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Team Leader</p>
              <p className="font-semibold text-cyan-400">Rocky</p>
            </div>
          </div>

          {/* Column 2: Voice Artists */}
          <div className="space-y-4">
            <h3 className="text-sm font-display font-bold text-foreground uppercase tracking-widest border-b border-border pb-2 inline-block">
              Voice Artists
            </h3>
            <div className="liquid-tile liquid-static rounded-2xl p-4">
              {voiceArtists && voiceArtists.length > 0 ? (
                <ul className="grid grid-cols-2 gap-2 text-sm text-muted-foreground">
                  {voiceArtists.map((artist) => (
                    <li key={artist.id} className="flex items-center gap-2">
                      <div className="w-1 h-1 rounded-full bg-cyan-500" />
                      {artist.name}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground italic">List coming soon...</p>
              )}
            </div>
          </div>

          {/* Column 3: Socials */}
          <div className="space-y-4">
            <h3 className="text-sm font-display font-bold text-foreground uppercase tracking-widest border-b border-border pb-2 inline-block">
              Connect With Us
            </h3>
            <div className="flex flex-wrap gap-3">
              <SocialLink href={settings?.facebook} icon={<FaFacebook />} label="Facebook" onClick={handleLinkClick} />
              <SocialLink href={settings?.youtube} icon={<FaYoutube />} label="YouTube" onClick={handleLinkClick} />
              <SocialLink href={settings?.telegram} icon={<FaTelegram />} label="Telegram" onClick={handleLinkClick} />
              <SocialLink href={settings?.instagram} icon={<FaInstagram />} label="Instagram" onClick={handleLinkClick} />
              <SocialLink href={normalizeWhatsappLink(settings?.whatsapp)} icon={<FaWhatsapp />} label="WhatsApp" onClick={handleLinkClick} />
              <SocialLink href={settings?.dailymotion} icon={<SiDailymotion />} label="Dailymotion" onClick={handleLinkClick} />
              <SocialLink href={settings?.rumble} icon={<SiRumble />} label="Rumble" onClick={handleLinkClick} />
            </div>
            
            <div className="mt-6 space-y-2">
              <a 
                href={settings?.telegram || "#"} 
                onClick={(e) => handleLinkClick(e, settings?.telegram)}
                className="block text-sm text-cyan-400 hover:text-cyan-300 transition-colors"
              >
                Contact us on Telegram
              </a>
              <a 
                href={settings?.telegramChannel || "#"} 
                onClick={(e) => handleLinkClick(e, settings?.telegramChannel)}
                className="block text-sm text-cyan-400 hover:text-cyan-300 transition-colors"
              >
                Official Telegram Channel
              </a>
            </div>
          </div>
        </div>

        <AboutBox />

        <div className="border-t border-border pt-8 flex flex-col md:flex-row items-center justify-between gap-4 text-xs text-muted-foreground">
          <p>For the Fans, by The Fans.</p>
          <p>All Rights Reserved © {new Date().getFullYear()} {settings?.websiteTitle || "TVR Dubbers"}</p>
        </div>
      </div>
    </footer>
  );
}

function SocialLink({ href, icon, label, onClick }: { href?: string | null, icon: React.ReactNode, label: string, onClick: (e: React.MouseEvent<HTMLAnchorElement>, url?: string | null) => void }) {
  return (
    <a
      href={href || "#"}
      onClick={(e) => onClick(e, href)}
      className="w-10 h-10 rounded-full liquid-pill flex items-center justify-center text-lg text-foreground/70 hover:text-cyan-500"
      title={label}
      aria-label={label}
    >
      {icon}
    </a>
  );
}
