import { useGetSettings, useListVoiceArtists } from "@workspace/api-client-react";
import { FaFacebook, FaYoutube, FaTelegram, FaWhatsapp, FaInstagram, FaPlay, FaVideo } from "react-icons/fa";
import { SiRumble, SiDailymotion } from "react-icons/si";
import { useToast } from "@/hooks/use-toast";

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
    <footer className="w-full border-t border-white/5 bg-black/40 backdrop-blur-md mt-20 pt-16 pb-8">
      <div className="container mx-auto px-4">
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-12 mb-16">
          
          {/* Column 1: Brand */}
          <div className="space-y-4">
            <h2 className="text-2xl font-display font-bold text-white uppercase tracking-wider">
              {settings?.websiteTitle || "TVR Dubbers"}
            </h2>
            <p className="text-muted-foreground text-sm leading-relaxed max-w-sm">
              {settings?.motto || "We Believe in Quality"}<br/><br/>
              A passion-driven streaming hub dedicated to bringing the best Chinese animation (Donghua) to the Bengali-speaking audience.
            </p>
            <div className="inline-block mt-4 px-4 py-2 bg-white/5 rounded-lg border border-white/10">
              <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Team Leader</p>
              <p className="font-semibold text-cyan-400">Rocky</p>
            </div>
          </div>

          {/* Column 2: Voice Artists */}
          <div className="space-y-4">
            <h3 className="text-sm font-display font-bold text-white uppercase tracking-widest border-b border-white/10 pb-2 inline-block">
              Voice Artists
            </h3>
            <div className="bg-white/5 border border-white/10 rounded-xl p-4">
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
            <h3 className="text-sm font-display font-bold text-white uppercase tracking-widest border-b border-white/10 pb-2 inline-block">
              Connect With Us
            </h3>
            <div className="flex flex-wrap gap-3">
              <SocialLink href={settings?.facebook} icon={<FaFacebook />} label="Facebook" onClick={handleLinkClick} />
              <SocialLink href={settings?.youtube} icon={<FaYoutube />} label="YouTube" onClick={handleLinkClick} />
              <SocialLink href={settings?.telegram} icon={<FaTelegram />} label="Telegram" onClick={handleLinkClick} />
              <SocialLink href={settings?.instagram} icon={<FaInstagram />} label="Instagram" onClick={handleLinkClick} />
              <SocialLink href={settings?.whatsapp} icon={<FaWhatsapp />} label="WhatsApp" onClick={handleLinkClick} />
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

        <div className="border-t border-white/10 pt-8 flex flex-col md:flex-row items-center justify-between gap-4 text-xs text-muted-foreground">
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
      className="w-10 h-10 rounded-full bg-white/5 hover:bg-cyan-900/40 border border-white/10 hover:border-cyan-500/50 flex items-center justify-center text-lg text-white/80 hover:text-cyan-400 transition-all hover:scale-110"
      title={label}
      aria-label={label}
    >
      {icon}
    </a>
  );
}
