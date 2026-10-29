import React from 'react';
import {AbsoluteFill, useCurrentFrame} from 'remotion';

const clamp = (n: number) => Math.max(0, Math.min(1, n));
const ease = (n: number) => { const p = clamp(n); return p * p * (3 - 2 * p); };
const mix = (a: number, b: number, p: number) => a + (b - a) * p;
const jiggle = (t: number, at: number, size = 1) => t < at ? 0 : Math.sin((t - at) * 23) * Math.exp(-(t - at) * 7) * size;
const slots = [255, 540, 825];

/** The same shell owns the yolk throughout; trajectories never teleport the answer. */
export function shellPose(id: number, t: number) {
  let x = slots[id]!;
  let y = 1070;
  let turn = 0;
  for (const [start, duration, from, to, a, b] of [
    [2.7, 1.2, 0, 1, 0, 1],
    [4.35, 1.45, 0, 2, 1, 2],
    [7.6, 1.15, 1, 2, 0, 1],
  ]) {
    if (t < start!) break;
    if (id !== a && id !== b) continue;
    const p = ease((t - start!) / duration!);
    const forward = id === a;
    x = mix(slots[forward ? from! : to!]!, slots[forward ? to! : from!]!, p);
    y = 1070 + Math.sin(p * Math.PI) * (forward ? -175 : 175);
    turn = Math.sin(p * Math.PI * 2) * (forward ? 11 : -11);
  }
  // Empty shell tries to leave; it returns before the final exchange.
  if (id === 0 && t >= 6 && t < 7.5) {
    const p = clamp((t - 6) / 1.5);
    x += Math.sin(p * Math.PI) * 95;
    y -= Math.sin(p * Math.PI) * 320;
    turn += Math.sin(p * Math.PI) * 25;
  }
  const cover = ease((t - 1.4) / .65);
  const revealAt = id === 1 ? 11.1 : id === 0 ? 10.1 : 10.55;
  const lift = ease((t - revealAt) / .55);
  const reset = ease((t - (id === 1 ? 13.25 : 13.8)) / .65);
  const finalLift = mix(lift, 0, reset);
  y -= (1 - cover) * 220 + finalLift * 290;
  turn += jiggle(t, 2.05, 8) + jiggle(t, revealAt + .3, 9);
  return {x, y, turn, lift: finalLift};
}

const flecks = Array.from({length: 38}, (_, i) => ({
  x: Math.sin(i * 8.71) * (75 + (i % 4) * 6),
  y: -190 + ((i * 47) % 230),
  r: 1.6 + (i % 3) * .7,
}));

function EggShell({id, x, y, turn, surprised}: {id: number; x: number; y: number; turn: number; surprised: boolean}) {
  return <g transform={`translate(${x} ${y}) rotate(${turn})`}>
    <defs><clipPath id={`egg-clip-${id}`}><path d="M-122 55 C-126 -42 -76 -221 0 -230 C83 -220 128 -36 122 55 L101 38 81 62 53 42 24 69 -3 49 -27 65 -51 43 -77 63 -101 42Z"/></clipPath></defs>
    <path d="M-122 55 C-126 -42 -76 -221 0 -230 C83 -220 128 -36 122 55 L101 38 81 62 53 42 24 69 -3 49 -27 65 -51 43 -77 63 -101 42Z" fill="url(#shell)" stroke="#f6d2a6" strokeWidth="3"/>
    <path d="M-122 55 L-101 42 -77 63 -51 43 -27 65 -3 49 24 69 53 42 81 62 101 38 122 55 L118 71 99 57 80 82 51 61 25 87 -3 68 -26 82 -52 60 -76 80 -101 59 -118 72Z" fill="#b17b51"/>
    <path d="M-94 -35 Q-76 -174 -16 -202" fill="none" stroke="#fff9e7" strokeOpacity=".7" strokeWidth="15" strokeLinecap="round"/>
    <g clipPath={`url(#egg-clip-${id})`}>{flecks.map((p, i) => <ellipse key={i} cx={p.x} cy={p.y} rx={p.r} ry={p.r * .6} fill="#a57b59" opacity=".35" transform={`rotate(${i * 23} ${p.x} ${p.y})`}/>)}</g>
    {surprised ? <g fill="#493323"><ellipse cx="-18" cy="-15" rx="6" ry="12"/><ellipse cx="30" cy="-15" rx="6" ry="12"/><ellipse cx="8" cy="12" rx="8" ry="10"/></g> : <><path d="M-29 -15 Q-18 -20 -9 -15 M19 -15 Q30 -20 40 -15" fill="none" stroke="#493323" strokeWidth="6" strokeLinecap="round"/><path d={id === 0 ? 'M1 7 Q14 22 28 7' : 'M1 10 Q11 17 21 10'} fill="none" stroke="#493323" strokeWidth="4" strokeLinecap="round"/></>}
  </g>;
}

function Yolk({x, y, scale, turn = 0, happy = false}: {x: number; y: number; scale: number; turn?: number; happy?: boolean}) {
  return <g transform={`translate(${x} ${y}) rotate(${turn}) scale(${scale})`}>
    <ellipse rx="91" ry="72" fill="url(#yolk)" stroke="#ed9b0b" strokeWidth="2"/>
    <ellipse cx="-28" cy="-34" rx="27" ry="12" transform="rotate(-23 -28 -34)" fill="#fff5b7" opacity=".85"/>
    {happy ? <path d="M-37 6 Q-26 -8 -15 6 M15 6 Q26 -8 37 6" fill="none" stroke="#67380c" strokeWidth="7" strokeLinecap="round"/> : <g fill="#67380c"><ellipse cx="-26" cy="4" rx="5" ry="9"/><ellipse cx="26" cy="4" rx="5" ry="9"/></g>}
    <path d="M-10 21 Q0 33 11 21" fill="none" stroke="#67380c" strokeWidth="5" strokeLinecap="round"/>
  </g>;
}

export const YolkGame: React.FC = () => {
  const t = useCurrentFrame() / 30;
  const poses = [0, 1, 2].map(id => ({id, ...shellPose(id, t)}));
  const target = poses[1]!;
  const arrival = ease(t / 1.15);
  const escape = ease((t - 12.4) / 1.5);
  const hop = t >= 11.5 && t < 12.4 ? Math.max(0, Math.sin((t - 11.5) * Math.PI / .9)) * 130 : Math.sin(escape * Math.PI) * 95;
  const yolkX = t < 1.2 ? mix(110, 540, arrival) : mix(target.x, 1330, escape);
  const yolkY = t < 1.2 ? 1100 - Math.sin(arrival * Math.PI) * 210 : 1100 - hop;
  const title = t < 6 ? ['FOLLOW', 'THE YOLK.'] : t < 7.5 ? ['NICE', 'TRY.'] : t < 9 ? ['FOLLOW', 'THE YOLK.'] : t < 11.3 ? ['WHICH', 'SHELL?'] : t < 13.3 ? ['THERE', 'YOU ARE.'] : ['OH.', ''];
  const titleScale = 1 + jiggle(t, t < 6 ? 0 : t < 7.5 ? 6 : t < 9 ? 7.6 : t < 11.3 ? 9 : 11.3, .04);
  return <AbsoluteFill style={{background: '#142fa8'}}>
    <svg viewBox="0 0 1080 1920" width="1080" height="1920" role="img" aria-label="An original animated eggshell game. Follow the yolk from the middle shell to the left, right, then middle again.">
      <defs>
        <radialGradient id="wall"><stop stopColor="#3557df"/><stop offset="1" stopColor="#0f2179"/></radialGradient>
        <linearGradient id="shell" x1="0" x2="1" y1="0" y2=".3"><stop stopColor="#b48a67"/><stop offset=".22" stopColor="#f8e6cd"/><stop offset=".55" stopColor="#fff5dd"/><stop offset="1" stopColor="#bd916c"/></linearGradient>
        <radialGradient id="yolk" cx=".35" cy=".25"><stop stopColor="#ffe253"/><stop offset=".55" stopColor="#ffc027"/><stop offset="1" stopColor="#f29a08"/></radialGradient>
        <linearGradient id="plate" x1="0" y1="0" x2="0" y2="1"><stop stopColor="#f8ac81"/><stop offset="1" stopColor="#ca5f45"/></linearGradient>
        <pattern id="tile" width="180" height="180" patternUnits="userSpaceOnUse"><path d="M0 180V0H180" fill="none" stroke="#91a4ff" strokeWidth="1" opacity=".16"/></pattern>
        <filter id="blur"><feGaussianBlur stdDeviation="15"/></filter>
      </defs>
      <rect width="1080" height="1920" fill="url(#wall)"/>
      <rect y="650" width="1080" height="1270" fill="url(#tile)"/>
      <ellipse cx="540" cy="1270" rx="620" ry="330" fill="#090c49" opacity=".45" filter="url(#blur)"/>
      <ellipse cx="540" cy="1190" rx="567" ry="302" fill="#91392c"/>
      <ellipse cx="540" cy="1165" rx="567" ry="302" fill="url(#plate)"/>
      <ellipse cx="540" cy="1150" rx="520" ry="261" fill="none" stroke="#ffc39a" strokeWidth="3"/>
      <ellipse cx="540" cy="1160" rx="452" ry="216" fill="#df805d" stroke="#b8543d" strokeWidth="3"/>
      <text x="540" y="255" textAnchor="middle" fill="#bdcaff" fontFamily="Inter" fontWeight="600" fontSize="30" letterSpacing="6">KITCHEN GAMES / 01</text>
      <g transform={`translate(540 390) scale(${titleScale})`} fill="#fff3d9" fontFamily="Inter" fontWeight="600" fontSize="111" letterSpacing="-7" textAnchor="middle">
        <text y="0">{title[0]}</text><text y="118">{title[1]}</text>
      </g>
      {poses.map(p => <ellipse key={p.id} cx={p.x} cy="1125" rx={120 - p.lift * 30} ry="26" fill="#602a24" opacity={.22 - p.lift * .12} filter="url(#blur)"/>)}
      <ellipse cx={yolkX} cy="1125" rx={85 - hop * .1} ry="22" fill="#8b3b22" opacity=".35" filter="url(#blur)"/>
      <g opacity={t < 2 ? 1 - ease((t - 1.65) / .35) : ease((t - 11.1) / .35)}><Yolk x={yolkX} y={yolkY} scale={1 + jiggle(t, 1.15, .12)} turn={t < 1.2 ? (1 - arrival) * -45 : jiggle(t, 11.5, 17) + escape * 560} happy={t > 11.3}/></g>
      {poses.sort((a, b) => a.y - b.y).map(p => <EggShell key={p.id} {...p} surprised={(p.id === 0 && t > 6.85 && t < 7.5) || (p.id === 1 && t > 13.25)}/>)}
      {t > 6.45 && t < 7.3 ? <g transform={`translate(${mix(-510, -50, Math.sin(clamp((t - 6.45) / .85) * Math.PI))} 750) rotate(-8)`}><rect x="0" y="0" width="740" height="19" rx="9" fill="#f6bf77"/><rect x="0" y="42" width="740" height="19" rx="9" fill="#be7c42"/></g> : null}
      {t > 6.84 && t < 7.03 ? <g stroke="#fff3d9" strokeWidth="6" strokeLinecap="round" opacity={1 - (t - 6.84) / .19}><path d="M680 590L710 572 M695 620L732 620 M684 650L714 671"/></g> : null}
      {t > 13.3 ? <g transform={`translate(${mix(-600, 365, ease((t - 13.3) / .7)) - ease((t - 14.4) / .5) * 350} 1150) rotate(-8)`}><rect x="0" y="0" width="740" height="19" rx="9" fill="#f6bf77"/><rect x="0" y={42 - ease((t - 13.95) / .2) * 25} width="740" height="19" rx="9" fill="#be7c42"/></g> : null}
      {t > 9 && t < 11.5 ? slots.map((x, i) => <text key={i} x={x} y="1338" textAnchor="middle" fontFamily="Inter" fontWeight="600" fontSize="42" fill="#51251e">{i + 1}</text>) : null}
      <g transform="translate(540 1510)" textAnchor="middle" fill="#c7d2ff" fontFamily="Inter" fontSize="29"><text>RecipeFix</text><text y="43" fontSize="26" opacity=".85">A little kitchen mischief.</text></g>
    </svg>
  </AbsoluteFill>;
};
