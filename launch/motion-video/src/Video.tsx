import React from "react";
import { AbsoluteFill, Audio, interpolate, Sequence, staticFile } from "remotion";
import { Danger, Hook, Metadata, Turn, Upload } from "./scenesProblem";
import { Compare, CTA, FEATURES, Features, Grid, Hero, Reveal } from "./scenesSolution";
import { FEATURE_STARTS, S } from "./theme";
import vo from "./vo.json";

// Music gain per frame: 1 = full, ~0.35 = ducked under the voice-over (built by scripts/make_vo.py)
const DUCK: number[] = vo.duck;
const duckAt = (f: number) => DUCK[Math.min(DUCK.length - 1, Math.max(0, Math.round(f)))] ?? 1;

// Sound-effect cue sheet: [frame, file, volume]
const fx = (at: number, name: string, vol = 0.7): [number, string, number] => [at, name, vol];
const CUES: [number, string, number][] = [
  fx(0, "drone", 0.55),
  fx(26, "scan", 0.6),
  // metadata cards (each lands on its voice-over word)
  fx(S.meta - 12, "whoosh", 0.6),
  ...[42, 75, 94, 120, 136].flatMap((d) => [fx(S.meta + d, "pop", 0.55), fx(S.meta + d + 4, "blip", 0.25)]),
  // the "free" website
  fx(S.upload - 12, "whoosh", 0.6),
  fx(S.upload + 76, "click", 0.9),
  fx(S.upload + 80, "upload", 0.4),
  fx(S.upload + 128, "whoosh_long", 0.7),
  fx(S.upload + 160, "pop", 0.5),
  // what really happens
  fx(S.danger, "glitch", 0.5),
  fx(S.danger + 8, "whoosh", 0.45),
  ...[42, 70, 88, 104].flatMap((d) => [fx(S.danger + d, "thud", 0.7), fx(S.danger + d, "error", 0.25)]),
  fx(S.danger + 140, "swoosh_up", 0.4),
  fx(S.danger + 181, "glitch", 0.7),
  fx(S.danger + 181, "impact", 0.5),
  // reveal (impact + reverse swell are baked into the music)
  fx(S.reveal + 10, "shimmer", 0.6),
  fx(S.reveal + 50, "typing", 0.5),
  ...[86, 111, 141].map((d) => fx(S.reveal + d, "pop", 0.45)),
  // hero
  fx(S.hero - 12, "whoosh_long", 0.6),
  ...[58, 112, 132].map((d) => fx(S.hero + d, "pop", 0.5)),
  // feature journey
  ...FEATURES.flatMap((ft, i) => {
    const t = S.features + FEATURE_STARTS[i];
    const cues = [fx(t - 12, "whoosh", 0.5), fx(t + ft.badgeAt, "pop", 0.45), fx(t + ft.badgeAt + 2, "tick", 0.4)];
    if (ft.id === "clean" || ft.id === "compress" || ft.id === "bg") cues.push(fx(t + ft.badgeAt + 6, "ding", 0.4));
    return cues;
  }),
  // grid
  fx(S.grid - 12, "whoosh_long", 0.6),
  fx(S.grid + 20, "shimmer", 0.45),
  fx(S.grid + 58, "pop", 0.5),
  // comparison
  fx(S.compare - 12, "whoosh", 0.55),
  ...[20, 35, 50].map((d) => fx(S.compare + d, "negative", 0.4)),
  ...[80, 95, 110].map((d) => fx(S.compare + d, "pop", 0.5)),
  fx(S.compare + 112, "ding", 0.45),
  // CTA (impact baked into music)
  fx(S.cta + 4, "shimmer", 0.5),
  fx(S.cta + 38, "swoosh_up", 0.4),
  fx(S.cta + 120, "click", 0.9),
  fx(S.cta + 122, "ding", 0.6),
];

const scenes: [number, number, React.FC][] = [
  [S.hook, S.meta, Hook],
  [S.meta, S.upload, Metadata],
  [S.upload, S.danger, Upload],
  [S.danger, S.turn, Danger],
  [S.turn, S.reveal, Turn],
  [S.reveal, S.hero, Reveal],
  [S.hero, S.features, Hero],
  [S.features, S.grid, Features],
  [S.grid, S.compare, Grid],
  [S.compare, S.cta, Compare],
  [S.cta, S.end, CTA],
];

const MUSIC_VOL = 0.8;
const VO_VOL = 1.0;

export const Launch: React.FC = () => (
  <AbsoluteFill style={{ background: "#000" }}>
    {scenes.map(([from, to, Comp]) => (
      <Sequence key={from} from={from} durationInFrames={to - from}>
        <Comp />
      </Sequence>
    ))}
    <Audio
      src={staticFile("audio/music.wav")}
      volume={(f) => MUSIC_VOL * duckAt(f) * interpolate(f, [S.end - 30, S.end], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })}
    />
    {vo.takes.map((t) => (
      <Sequence key={t.file} from={t.from} layout="none">
        <Audio src={staticFile(t.file)} volume={VO_VOL} />
      </Sequence>
    ))}
    {CUES.map(([at, name, vol], i) => (
      <Sequence key={i} from={Math.max(0, at)} layout="none">
        {/* effects sit a little lower while the narrator is talking */}
        <Audio src={staticFile(`audio/sfx/${name}.wav`)} volume={(f) => vol * (0.55 + 0.45 * duckAt(at + f))} />
      </Sequence>
    ))}
  </AbsoluteFill>
);
