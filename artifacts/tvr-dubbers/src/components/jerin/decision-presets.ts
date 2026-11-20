// Ready-made checklists for the Checker tab. Each question becomes one Gemini Decision question.
//   noul   = a yes/no question, answered as the probability of "yes"
//   choice = pick one of several options, answered with a probability for each
//   score  = a rating scale, answered as a number between the first and last level

export type QType = "noul" | "choice" | "score";

export interface PresetQuestion {
  key: string;
  /** Short name shown on the result card. */
  label: string;
  type: QType;
  instructions: string;
  /** choice: option key -> description. score: levels from lowest to highest. */
  criteria?: Record<string, string> | string[];
  /** noul: is "yes" the good answer or the bad one? Leave out when neither is better. */
  good?: "yes" | "no";
  /** score: false when a higher number is worse (e.g. clickbait). */
  higherIsBetter?: boolean;
  /** choice: nicer names for the option keys. */
  optionLabels?: Record<string, string>;
}

export interface Preset {
  id: "thumbnail" | "dub" | "title" | "custom";
  name: string;
  emoji: string;
  hint: string;
  /** <input accept> for the file picker; empty = no file needed. */
  accept: string;
  needsFile: boolean;
  needsText: boolean;
  textLabel: string;
  textPlaceholder: string;
  questions: PresetQuestion[];
}

const LEVELS_APPEAL = ["Poor: hard to read or unappealing", "Okay: usable but forgettable", "Good: clear and eye-catching", "Excellent: striking and professional"];

export const PRESETS: Preset[] = [
  {
    id: "thumbnail",
    name: "Thumbnail",
    emoji: "🖼️",
    hint: "Upload a thumbnail and see how it holds up before you post it.",
    accept: "image/*",
    needsFile: true,
    needsText: false,
    textLabel: "Anything the checker should know? (optional)",
    textPlaceholder: "e.g. Episode 12 thumbnail for YouTube",
    questions: [
      { key: "readable_text", label: "Readable text", type: "noul", good: "yes", instructions: "Is any text on this image large, high-contrast and easy to read on a phone screen?" },
      { key: "clear_subject", label: "Clear subject", type: "noul", good: "yes", instructions: "Does the image have one clear main subject or character that stands out?" },
      { key: "too_dark", label: "Too dark", type: "noul", good: "no", instructions: "Is the image too dark or low-contrast to see clearly?" },
      { key: "cluttered", label: "Cluttered", type: "noul", good: "no", instructions: "Is the image cluttered or too busy?" },
      { key: "low_quality", label: "Blurry / low quality", type: "noul", good: "no", instructions: "Is the image blurry, pixelated or low quality?" },
      { key: "has_logo", label: "Logo or watermark", type: "noul", instructions: "Does the image show a visible logo or watermark?" },
      { key: "appeal", label: "Overall appeal", type: "score", instructions: "Overall, how appealing is this as a video thumbnail?", criteria: LEVELS_APPEAL },
      {
        key: "shows",
        label: "Mostly shows",
        type: "choice",
        instructions: "What does the image mostly show?",
        criteria: {
          face_closeup: "A close-up of a face or character",
          action_scene: "An action or battle scene",
          group: "Several characters together",
          text_graphic: "Mostly text or a graphic",
          scenery: "Scenery or a landscape",
          other: "Something else",
        },
        optionLabels: { face_closeup: "Face close-up", action_scene: "Action scene", group: "Group of characters", text_graphic: "Text / graphic", scenery: "Scenery", other: "Something else" },
      },
    ],
  },
  {
    id: "dub",
    name: "Dub clip",
    emoji: "🎙️",
    hint: "Upload an audio or video clip of a dub (a short one works best) to check the sound.",
    accept: "audio/*,video/*",
    needsFile: true,
    needsText: false,
    textLabel: "Anything the checker should know? (optional)",
    textPlaceholder: "e.g. Scene where Xiao Yan faces Yao Lao, Bangla dub",
    questions: [
      { key: "clear_voice", label: "Clear voice", type: "noul", good: "yes", instructions: "Is the spoken voice clear and easy to understand?" },
      { key: "noise", label: "Background noise", type: "noul", good: "no", instructions: "Is there distracting background noise, hiss, hum or echo?" },
      { key: "distortion", label: "Distortion", type: "noul", good: "no", instructions: "Is the voice distorted, clipping or too loud at any point?" },
      { key: "music_over_voice", label: "Music drowns voice", type: "noul", good: "no", instructions: "Do the music or sound effects drown out the voice?" },
      { key: "expressive", label: "Expressiveness", type: "score", instructions: "How emotionally expressive is the voice acting?", criteria: ["Flat or monotone", "Some expression", "Expressive", "Very expressive and dramatic"] },
      {
        key: "language",
        label: "Spoken language",
        type: "choice",
        instructions: "What is the main spoken language?",
        criteria: { bangla: "Bangla (Bengali)", english: "English", hindi: "Hindi", chinese: "Chinese", other: "Another language", none: "No speech" },
        optionLabels: { bangla: "Bangla", english: "English", hindi: "Hindi", chinese: "Chinese", other: "Other", none: "No speech" },
      },
    ],
  },
  {
    id: "title",
    name: "Title & description",
    emoji: "📝",
    hint: "Paste a title and description to check them before you publish.",
    accept: "",
    needsFile: false,
    needsText: true,
    textLabel: "Title and description",
    textPlaceholder: "Title: Battle Through the Heavens Episode 12 | Bangla Dub\nDescription: ...",
    questions: [
      { key: "series_named", label: "Names the series", type: "noul", good: "yes", instructions: "Does the text name the series (Battle Through the Heavens or BTTH)?" },
      { key: "episode_number", label: "Episode number", type: "noul", good: "yes", instructions: "Does the text include an episode number or part number?" },
      { key: "bangla_dub_clear", label: "Says it's a Bangla dub", type: "noul", good: "yes", instructions: "Does the text make clear that this is a Bangla dub?" },
      { key: "spoilers", label: "Spoilers", type: "noul", good: "no", instructions: "Does the text reveal major plot spoilers?" },
      { key: "clickbait", label: "Clickbait level", type: "score", higherIsBetter: false, instructions: "How exaggerated or clickbait is the wording?", criteria: ["Plain and honest", "Slightly punchy", "Clickbait", "Misleading"] },
      { key: "search_friendly", label: "Search-friendly", type: "score", instructions: "How well would this text match what people search for when they look for 'Battle Through the Heavens Bangla Dub'?", criteria: ["Poor", "Fair", "Good", "Excellent"] },
    ],
  },
  {
    id: "custom",
    name: "Custom",
    emoji: "✏️",
    hint: "Write your own yes/no questions (one per line) about any text, image, audio or video.",
    accept: "image/*,audio/*,video/*,application/pdf",
    needsFile: false,
    needsText: false,
    textLabel: "Text to check (optional if you add a file)",
    textPlaceholder: "Paste text here, or add a file below…",
    questions: [],
  },
];
