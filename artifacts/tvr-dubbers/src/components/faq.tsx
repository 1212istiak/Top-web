import { ChevronDown } from "lucide-react";

// IMPORTANT: keep this list in sync with the FAQPage JSON-LD block in
// index.html. Search engines expect the structured data to match the text
// that visitors can actually read on the page.
export const FAQ_ITEMS: { q: string; a: string }[] = [
  {
    q: "What is TVR Dubbers?",
    a: "TVR Dubbers, also called The Voice of Rockstar'z, is a fan-made Bangla dubbing group. We voice, direct, and edit the Battle Through the Heavens donghua in Bangla for Bengali-speaking viewers.",
  },
  {
    q: "Where can I watch Battle Through the Heavens in Bangla dub?",
    a: "Right here. Open the All Episodes list on this page and tap an episode to play it. We also post on our Dailymotion and Rumble channels, which are linked in the footer.",
  },
  {
    q: "What is Battle Through the Heavens (BTTH)?",
    a: "Battle Through the Heavens, also known as Doupo Cangqiong, is a Chinese donghua based on the web novel by Tian Can Tu Dou. It follows Xiao Yan on the Dou Qi Continent as he faces scorn and works his way up to great power.",
  },
  {
    q: "Is this an official dub?",
    a: "No. TVR Dubbers is an independent fan group and is not affiliated with the creators or rights holders of the series. We dub it out of love for the show.",
  },
  {
    q: "How do I know when the next episode is out?",
    a: "The Next Episode Drops In timer on the home page counts down to the next release. You can also follow our Telegram channel, Facebook, YouTube, or Instagram, which are linked in the footer.",
  },
  {
    q: "Who voices the characters?",
    a: "The voice artists are listed in the footer of this page. Rocky leads the team and works as voice artist, voice director, and audio and video editor.",
  },
  {
    q: "An episode will not play. What can I do?",
    a: "Reload the page and try again. If it still fails, try another browser or watch the same episode on our Dailymotion or Rumble channel. If nothing works, message us on Telegram with the episode number.",
  },
  {
    q: "Which episodes are available in Bangla dub?",
    a: "The All Episodes list on this page always shows what is available right now. New episodes appear there as soon as they are published.",
  },
];

export function Faq() {
  return (
    <section id="faq" aria-labelledby="faq-heading" className="mt-24">
      <h2
        id="faq-heading"
        className="text-2xl md:text-3xl font-display font-bold text-foreground border-l-4 border-cyan-500 pl-4 mb-8"
      >
        Frequently asked questions
      </h2>

      <div className="space-y-3 max-w-3xl">
        {FAQ_ITEMS.map((item) => (
          <details
            key={item.q}
            className="group liquid-tile liquid-static rounded-2xl px-5 py-4 focus-within:ring-2 focus-within:ring-cyan-400/50"
          >
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold text-foreground outline-none [&::-webkit-details-marker]:hidden">
              <span>{item.q}</span>
              <ChevronDown
                aria-hidden="true"
                className="h-5 w-5 shrink-0 text-cyan-400 transition-transform duration-300 group-open:rotate-180"
              />
            </summary>
            <p className="mt-3 text-sm md:text-base text-muted-foreground leading-relaxed">{item.a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}
