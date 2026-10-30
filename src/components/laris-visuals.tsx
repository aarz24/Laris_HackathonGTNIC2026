"use client";

import { useId, useState, type ReactNode } from "react";
import { ArrowUpRight, Coffee, Sparkles } from "lucide-react";
import { currency } from "@/lib/laris-data";
import type { View } from "@/lib/laris-guide";

export function LarisMark({ small = false }: { small?: boolean }) {
  return <span className={`laris-mark ${small ? "small" : ""}`} aria-hidden="true"><svg viewBox="0 0 32 32" fill="none"><path d="M15 16C6 16 4 11 6 6c5-2 10 0 10 9M17 16c9 0 11 5 9 10-5 2-10 0-10-9M16 15C16 6 21 4 26 6c2 5 0 10-9 10M16 17c0 9-5 11-10 9-2-5 0-10 9-10" fill="currentColor"/></svg></span>;
}

export function CafeIllustration() {
  return <div className="cafe-art" aria-hidden="true"><svg viewBox="0 0 430 230" fill="none">
    <ellipse cx="233" cy="207" rx="153" ry="12" fill="var(--green-soft)" opacity=".5"/>
    <path d="M41 141c-8-36 38-64 79-51M343 35c27 0 41 18 35 41M347 161c26 2 30 22 21 32" stroke="var(--green-ink)" strokeWidth="1.5" strokeDasharray="5 5"/>
    <path d="m67 48 4 10 10 4-10 4-4 10-4-10-10-4 10-4 4-10ZM366 108l3 8 8 3-8 3-3 8-3-8-8-3 8-3 3-8Z" fill="var(--saffron)"/>
    <path d="m331 31 2 5 5 2-5 2-2 5-2-5-5-2 5-2 2-5Z" fill="var(--green)"/>
    <rect x="104" y="78" width="203" height="117" rx="8" fill="var(--background)" stroke="var(--green-dark)" strokeWidth="2"/>
    <path d="M112 195h189v9H112z" fill="var(--green-dark)"/><path d="M95 202h222v7H95z" fill="var(--green-dark)"/>
    <rect x="130" y="117" width="66" height="67" rx="3" fill="var(--green-light)" stroke="var(--green)" strokeWidth="2"/>
    <path d="M163 118v66m-33-34h66" stroke="var(--green)" strokeWidth="2"/>
    <path d="m140 131 10-9m-7 18 17-15m14 49 13-12" stroke="var(--background)" strokeWidth="3" strokeLinecap="round"/>
    <rect x="217" y="115" width="57" height="83" rx="3" fill="var(--green-dark)"/><rect x="224" y="122" width="43" height="49" rx="2" fill="var(--green-light)"/><circle cx="263" cy="179" r="2" fill="var(--saffron)"/>
    <rect x="151" y="47" width="110" height="31" rx="5" fill="var(--background)" stroke="var(--green-dark)" strokeWidth="2"/><text x="206" y="67" textAnchor="middle" fill="var(--green-dark)" fontSize="14" fontWeight="800" fontFamily="sans-serif" letterSpacing="2">KOPI SENJA</text>
    <path d="M103 79h205l11 26H92l11-26Z" fill="var(--green-dark)" stroke="var(--green-dark)" strokeWidth="2"/>
    <path d="M127 79h25l-3 26h-29l7-26Zm52 0h25v26h-28l3-26Zm52 0h25l5 26h-29l-1-26Zm52 0h25l11 26h-29l-7-26Z" fill="var(--saffron-light)"/>
    <path d="M92 105h28v6a14 14 0 0 1-28 0v-6Zm57 0h27v6a13.5 13.5 0 0 1-27 0v-6Zm55 0h28v6a14 14 0 0 1-28 0v-6Zm57 0h29v6a14.5 14.5 0 0 1-29 0v-6Z" fill="var(--green-dark)"/><path d="M120 105h29v6a14.5 14.5 0 0 1-29 0v-6Zm56 0h28v6a14 14 0 0 1-28 0v-6Zm56 0h29v6a14.5 14.5 0 0 1-29 0v-6Zm58 0h29v6a14.5 14.5 0 0 1-29 0v-6Z" fill="var(--green-soft)"/>
    <path d="M84 204v-45m0 24c-17 0-22-14-22-23 17 0 22 10 22 23Zm0-12c0-19 10-29 24-30 0 16-8 29-24 30Z" fill="var(--green)" stroke="var(--green-dark)" strokeWidth="1.5"/><path d="M69 187h29l-4 21H73l-4-21Z" fill="var(--saffron-dark)"/>
    <g className="art-float"><rect x="289" y="136" width="75" height="61" rx="10" fill="var(--surface)" stroke="var(--green-soft)"/><rect x="301" y="170" width="10" height="15" rx="2" fill="var(--green-soft)"/><rect x="317" y="158" width="10" height="27" rx="2" fill="var(--green)"/><rect x="333" y="147" width="10" height="38" rx="2" fill="var(--green-dark)"/><path d="m303 158 14-10 11 1 15-12m-8 0h8v8" stroke="var(--saffron)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></g>
    <g transform="rotate(-12 92 101)"><rect x="62" y="84" width="57" height="47" rx="9" fill="var(--surface)" stroke="var(--green-soft)"/><path d="M79 99h18v11a8 8 0 0 1-8 8h-2a8 8 0 0 1-8-8V99Z" fill="var(--saffron)"/><path d="M97 102h3a5 5 0 0 1 0 10h-3" stroke="var(--saffron)" strokeWidth="3"/><path d="M83 94c-4-5 4-4 0-9m7 9c-4-5 4-4 0-9" stroke="var(--green-ink)" strokeWidth="1.5" strokeLinecap="round"/></g>
    <circle cx="328" cy="67" r="21" fill="var(--saffron)" stroke="var(--saffron-dark)" strokeWidth="2"/><circle cx="328" cy="67" r="15" stroke="var(--saffron-dark)"/><path d="m321 67 5 5 9-11" stroke="var(--saffron-heading)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
  </svg></div>;
}

function smoothPath(points: [number, number][]) {
  return points.map((point, i, all) => {
    if (i === 0) return `M ${point[0]} ${point[1]}`;
    const prev = all[i - 1], before = all[i - 2] || prev, after = all[i + 1] || point;
    return `C ${prev[0] + (point[0] - before[0]) / 6} ${prev[1] + (point[1] - before[1]) / 6}, ${point[0] - (after[0] - prev[0]) / 6} ${point[1] - (after[1] - prev[1]) / 6}, ${point[0]} ${point[1]}`;
  }).join(" ");
}

export function RevenueChart({ values, previous, labels }: { values: number[]; previous: number[]; labels: string[] }) {
  const gradient = useId();
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.ceil(Math.max(...values, ...previous, 1) / 1000000) * 1000000;
  const points = values.map((value, i): [number, number] => [54 + (i * 596) / Math.max(values.length - 1, 1), 174 - (value / max) * 143]);
  const lastPoints = previous.map((value, i): [number, number] => [54 + (i * 596) / Math.max(previous.length - 1, 1), 174 - (value / max) * 143]);
  const path = smoothPath(points);
  return <div className="revenue-chart"><svg viewBox="0 0 690 218" role="img" aria-label={`Grafik penjualan: ${labels.map((label, i) => `${label} ${currency(values[i])}`).join(", ")}`}>
    <defs><linearGradient id={gradient} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--green)" stopOpacity=".21"/><stop offset="100%" stopColor="var(--green)" stopOpacity="0"/></linearGradient></defs>
    {[0, 1, 2, 3].map(i => <g key={i}><line x1="54" x2="655" y1={31 + i * 47.66} y2={31 + i * 47.66} stroke="var(--border)" strokeDasharray="3 4"/><text x="0" y={35 + i * 47.66} fill="var(--muted)" fontSize="10.5">{i === 3 ? "Rp0" : `${((max * (3 - i)) / 3 / 1000000).toFixed(1).replace(".", ",")} jt`}</text></g>)}
    <path d={`${path} L650 175 L54 175 Z`} fill={`url(#${gradient})`}/><path d={smoothPath(lastPoints)} stroke="var(--green-soft)" strokeWidth="2" strokeDasharray="5 5" fill="none"/>
    <path d={path} stroke="var(--green)" strokeWidth="2.8" fill="none" strokeLinecap="round"/>
    {points.map(([x,y], i) => <g key={i} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}><rect x={x - 25} y="10" width="50" height="177" fill="transparent"/><circle cx={x} cy={y} r={hover === i ? 5 : 3} fill="var(--surface)" stroke="var(--green)" strokeWidth="2"/><text x={x} y="205" textAnchor="middle" fill="var(--muted)" fontSize="10.5">{labels[i]}</text>{hover === i && <g><rect x={Math.min(Math.max(x - 59, 42), 550)} y={Math.max(y - 38, 0)} width="112" height="27" rx="6" fill="var(--green-dark)"/><text x={Math.min(Math.max(x - 59, 42), 550) + 56} y={Math.max(y - 38, 0) + 18} fill="var(--surface)" fontSize="11" textAnchor="middle">{currency(values[i])}</text></g>}</g>)}
  </svg></div>;
}

export function Sparkline({ variant = 0, color = "var(--green)" }: { variant?: number; color?: string }) {
  const fillId = useId();
  const paths = ["M0 32 9 28 16 31 24 20 32 25 40 15 48 19 56 7 64 13 73 4", "M0 31 9 26 17 29 25 18 33 20 41 12 49 17 57 8 65 11 73 4", "M0 28 9 31 17 21 25 23 33 13 41 17 49 12 57 17 65 6 73 8", "M0 32 9 25 17 29 25 16 33 22 41 15 49 18 57 7 65 13 73 4"];
  const d = paths[variant % 4];
  return <svg className="sparkline" viewBox="0 0 76 40" aria-hidden="true"><defs><linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity=".28"/><stop offset="100%" stopColor={color} stopOpacity="0"/></linearGradient></defs><path d={`${d} L73 40 L0 40 Z`} fill={`url(#${fillId})`}/><path d={d} stroke={color} strokeWidth="2.1" fill="none" strokeLinejoin="round" strokeLinecap="round"/></svg>;
}

export function ScoreRing({ score = 78, small = false }: { score?: number; small?: boolean }) {
  return <div className={`score-ring ${small ? "compact" : ""}`}><svg viewBox="0 0 120 120" aria-label={`Skor kesiapan modal ${score} dari 100`}><circle cx="60" cy="60" r="50" fill="none" stroke="var(--green-soft)" strokeWidth="9"/><circle cx="60" cy="60" r="50" fill="none" stroke="var(--green)" strokeWidth="9" strokeDasharray={`${score * 3.14} 314`} strokeLinecap="round" transform="rotate(-90 60 60)"/></svg><div><strong>{score}</strong><span>dari 100</span></div></div>;
}

export function EmptyState({ title, description }: { title: string; description: string }) {
  return <div className="empty-state"><span><Coffee size={30}/></span><h3>{title}</h3><p>{description}</p></div>;
}

const pageArt: Record<View, ReactNode> = {
  overview: <>
    <rect x="25" y="18" width="250" height="126" rx="12" fill="var(--green-light)" stroke="none"/>
    <path d="M25 62h250M25 104h250M102 18v44m87-44v44M63 62v42m87-42v42m87-42v42M102 104v40m87-40v40" stroke="var(--green-soft)" strokeWidth="1.5"/>
    <path d="M34 155h232v13H34z" fill="var(--surface-paper)" stroke="var(--green-soft)"/><path d="M109 156v11m82-11v11" stroke="var(--green-soft)"/>
    <rect x="18" y="143" width="264" height="12" rx="3" fill="var(--saffron-muted)" stroke="var(--saffron-ink)"/>
    <rect x="208" y="57" width="45" height="85" rx="8" fill="var(--surface-paper)"/>
    <path d="M212 102h37v30a6 6 0 0 1-6 6h-25a6 6 0 0 1-6-6z" fill="var(--saffron-muted)" stroke="none"/>
    <g fill="var(--saffron-dark)" stroke="none"><ellipse cx="219" cy="126" rx="4" ry="2.5" transform="rotate(-28 219 126)"/><ellipse cx="231" cy="133" rx="4" ry="2.5" transform="rotate(20 231 133)"/><ellipse cx="241" cy="125" rx="4" ry="2.5" transform="rotate(-36 241 125)"/><ellipse cx="234" cy="116" rx="4" ry="2.5" transform="rotate(24 234 116)"/></g>
    <rect x="205" y="48" width="51" height="11" rx="3" fill="var(--green)"/><path d="M212 52h37" stroke="var(--green-soft)" strokeWidth="1.5"/>
    <rect x="216" y="77" width="29" height="25" rx="3" fill="var(--saffron-light)" stroke="var(--saffron-border)"/><path d="M223 86h15m-15 6h10" stroke="var(--saffron-ink)" strokeWidth="1.5"/>
    <rect x="141" y="86" width="51" height="57" rx="4" fill="var(--green-soft)"/>
    <path d="M146 92h41v49l-5-3-5 3-5-3-5 3-5-3-5 3-5-3-6 3z" fill="var(--surface-paper)"/>
    <rect x="157" y="82" width="18" height="12" rx="3" fill="var(--green)"/><path d="M155 106h22m-22 8h16m-16 8h20" stroke="var(--green-ink)" strokeWidth="1.5"/><path d="M155 132h10" stroke="var(--saffron)" strokeWidth="3"/>
    <ellipse cx="89" cy="137" rx="37" ry="6" fill="var(--green-soft)" stroke="var(--green-ink)"/>
    <path d="M112 105h5a11 11 0 0 1 0 22h-8" fill="var(--saffron-light)" stroke="var(--saffron-ink)" strokeWidth="3"/>
    <path d="M65 99h48v21c0 10-10 16-24 16s-24-6-24-16z" fill="var(--surface-paper)"/>
    <ellipse cx="89" cy="99" rx="24" ry="6" fill="var(--saffron-light)"/><ellipse cx="89" cy="100" rx="18" ry="3" fill="var(--saffron-heading)" stroke="none"/>
    <path d="M78 114c5 4 17 4 22 0" stroke="var(--green)"/>
    <path d="M80 84c-8-9 7-14 0-23m17 23c-8-9 7-14 0-23" stroke="var(--green-ink)" strokeWidth="2"/>
  </>,
  pos: <>
    <rect x="25" y="18" width="250" height="126" rx="12" fill="var(--green-light)" stroke="none"/>
    <path d="M25 62h250M25 104h250M102 18v44m87-44v44M63 62v42m174-42v42" stroke="var(--green-soft)" strokeWidth="1.5"/>
    <path d="M34 155h232v13H34z" fill="var(--surface-paper)" stroke="var(--green-soft)"/><rect x="18" y="143" width="264" height="12" rx="3" fill="var(--saffron-muted)" stroke="var(--saffron-ink)"/>
    <path d="M105 110h23l5 25H99z" fill="var(--green-soft)"/><rect x="84" y="135" width="63" height="8" rx="3" fill="var(--green)"/>
    <rect x="55" y="43" width="119" height="77" rx="7" fill="var(--green)"/><rect x="63" y="51" width="103" height="58" rx="3" fill="var(--surface-paper)" stroke="var(--green-soft)"/>
    <rect x="70" y="59" width="39" height="41" rx="4" fill="var(--saffron-light)" stroke="var(--saffron-border)"/>
    <path d="M80 74h18v11a7 7 0 0 1-7 7h-4a7 7 0 0 1-7-7z" fill="var(--saffron-muted)"/><path d="M98 77h2a5 5 0 0 1 0 10h-2m-14-18c-3-3 3-4 0-7" stroke="var(--green-ink)" strokeWidth="1.5"/>
    <path d="M119 64h36m-36 9h25" stroke="var(--green-ink)" strokeWidth="1.5"/><rect x="118" y="85" width="37" height="12" rx="3" fill="var(--green-soft)" stroke="none"/>
    <circle cx="115" cy="115" r="2" fill="var(--saffron)" stroke="none"/>
    <rect x="192" y="102" width="61" height="41" rx="6" fill="var(--surface-paper)"/><rect x="199" y="109" width="47" height="7" rx="2" fill="var(--green)"/>
    <path d="M206 112V63l5 3 5-3 5 3 5-3 5 3 6-3v49z" fill="var(--surface-paper)"/><path d="M213 77h17m-17 9h12m-12 9h17" stroke="var(--green-ink)" strokeWidth="1.5"/>
    <path d="M201 132h27" stroke="var(--green-soft)"/><circle cx="241" cy="131" r="3" fill="var(--saffron)" stroke="none"/>
  </>,
  transactions: <>
    <rect x="25" y="18" width="250" height="126" rx="12" fill="var(--green-light)" stroke="none"/>
    <path d="M25 62h250M25 104h250M189 18v44m48 0v42" stroke="var(--green-soft)" strokeWidth="1.5"/>
    <path d="M34 155h232v13H34z" fill="var(--surface-paper)" stroke="var(--green-soft)"/><rect x="18" y="143" width="264" height="12" rx="3" fill="var(--saffron-muted)" stroke="var(--saffron-ink)"/>
    <rect x="50" y="119" width="199" height="24" rx="4" fill="var(--green-soft)"/>
    <path d="M106 28h66v104l-6-4-6 4-6-4-6 4-6-4-6 4-6-4-6 4-6-4-6 4-6-4z" fill="var(--saffron-light)"/>
    <path d="M118 42h42m-42 9h28m-28 13h42m-42 10h36" stroke="var(--saffron-ink)" strokeWidth="1.5"/>
    <path d="M65 46h76v93l-6-4-6 4-6-4-6 4-7-4-7 4-7-4-6 4-6-4-6 4-6-4-7 4z" fill="var(--surface-paper)"/>
    <rect x="77" y="59" width="26" height="7" rx="2" fill="var(--green)" stroke="none"/>
    <path d="M77 78h50m-50 10h32m-32 10h50m-50 10h27" stroke="var(--green-ink)" strokeWidth="1.5"/><path d="M77 121h20" stroke="var(--saffron)" strokeWidth="3"/>
    <path d="M55 137h189m-139 0h38" stroke="var(--green-ink)" strokeWidth="1.5"/>
    <path d="M184 52h7v62l-3.5 10-3.5-10z" fill="var(--green)"/><path d="M187.5 57v48" stroke="var(--green-soft)" strokeWidth="1.5"/>
    <path d="M209 106a17 17 0 0 1 34 0v37h-34z" fill="var(--surface-paper)"/><ellipse cx="226" cy="106" rx="17" ry="7" fill="var(--saffron-light)"/><ellipse cx="226" cy="106" rx="6" ry="2.5" fill="var(--saffron-muted)" stroke="var(--saffron-ink)"/>
    <path d="M209 111v32h-16v-13h16" fill="var(--surface-paper)"/><path d="M216 120v13" stroke="var(--green-soft)"/>
  </>,
  products: <>
    <rect x="25" y="18" width="250" height="126" rx="12" fill="var(--green-light)" stroke="none"/>
    <path d="M25 62h250M25 104h250M237 18v44" stroke="var(--green-soft)" strokeWidth="1.5"/>
    <path d="M34 155h232v13H34z" fill="var(--surface-paper)" stroke="var(--green-soft)"/><rect x="18" y="143" width="264" height="12" rx="3" fill="var(--saffron-muted)" stroke="var(--saffron-ink)"/>
    <path d="M46 58h151v81h-61l-14 4-14-4H46z" fill="var(--green)"/>
    <path d="M53 48c25-6 47-2 69 8v77c-22-10-44-14-69-8z" fill="var(--surface-paper)"/>
    <path d="M122 56c22-10 44-14 68-8v77c-24-6-46-2-68 8z" fill="var(--saffron-light)"/>
    <path d="M128 61v64" stroke="var(--saffron-border)" strokeWidth="1.5"/>
    <path d="M158 49v28l7-5 7 5V47" fill="var(--saffron)" stroke="var(--saffron-ink)"/>
    <path d="M69 75h25v12a9 9 0 0 1-9 9h-7a9 9 0 0 1-9-9z" fill="var(--green-soft)"/><path d="M94 78h3a6 6 0 0 1 0 12h-3m-20-21c-4-4 4-5 0-9" stroke="var(--green-ink)" strokeWidth="1.5"/>
    <path d="M67 107h35m-35 7h25M137 88h39m-39 9h30m-30 9h39m-39 9h24" stroke="var(--green-ink)" strokeWidth="1.5"/>
    <ellipse cx="229" cy="137" rx="29" ry="6" fill="var(--green-soft)" stroke="var(--green-ink)"/>
    <path d="M247 103h4a10 10 0 0 1 0 20h-4" fill="var(--saffron-light)" stroke="var(--saffron-ink)" strokeWidth="3"/>
    <path d="M210 98h38v22c0 10-8 15-19 15s-19-5-19-15z" fill="var(--surface-paper)"/><ellipse cx="229" cy="98" rx="19" ry="5" fill="var(--saffron-light)"/><ellipse cx="229" cy="99" rx="13" ry="2.5" fill="var(--saffron-heading)" stroke="none"/>
    <path d="M219 83c-6-7 6-10 0-17m16 17c-6-7 6-10 0-17" stroke="var(--green-ink)" strokeWidth="1.5"/>
  </>,
  inventory: <>
    <rect x="25" y="18" width="250" height="126" rx="12" fill="var(--green-light)" stroke="none"/>
    <path d="M25 62h250M25 104h250M102 18v44m87-44v44" stroke="var(--green-soft)" strokeWidth="1.5"/>
    <path d="M34 155h232v13H34z" fill="var(--surface-paper)" stroke="var(--green-soft)"/><rect x="18" y="143" width="264" height="12" rx="3" fill="var(--saffron-muted)" stroke="var(--saffron-ink)"/>
    <rect x="56" y="52" width="49" height="84" rx="8" fill="var(--surface-paper)"/><rect x="53" y="42" width="55" height="12" rx="3" fill="var(--green)"/><path d="M61 47h39" stroke="var(--green-soft)" strokeWidth="1.5"/>
    <path d="M60 95h41v30a7 7 0 0 1-7 7H67a7 7 0 0 1-7-7z" fill="var(--saffron-muted)" stroke="none"/>
    <g fill="var(--saffron-dark)" stroke="none"><ellipse cx="68" cy="121" rx="4" ry="2.5"/><ellipse cx="82" cy="126" rx="4" ry="2.5"/><ellipse cx="93" cy="117" rx="4" ry="2.5"/><ellipse cx="76" cy="113" rx="4" ry="2.5"/></g>
    <rect x="65" y="72" width="31" height="25" rx="3" fill="var(--saffron-light)" stroke="var(--saffron-border)"/><path d="M72 81h17m-17 7h11" stroke="var(--saffron-ink)" strokeWidth="1.5"/>
    <rect x="119" y="70" width="46" height="66" rx="7" fill="var(--surface-paper)"/><rect x="116" y="60" width="52" height="12" rx="3" fill="var(--green)"/><path d="M124 65h36" stroke="var(--green-soft)" strokeWidth="1.5"/>
    <path d="M123 99h38v28a5 5 0 0 1-5 5h-28a5 5 0 0 1-5-5z" fill="var(--green-soft)" stroke="none"/>
    <rect x="127" y="88" width="30" height="24" rx="3" fill="var(--surface-paper)" stroke="var(--green-soft)"/><path d="M134 96h16m-16 7h10" stroke="var(--green-ink)" strokeWidth="1.5"/>
    <path d="M186 59h47l10 18-6 62h-55l-6-62z" fill="var(--saffron-light)"/><path d="M186 59l6 16h35l6-16m-57 18h67" stroke="var(--saffron-ink)" strokeWidth="1.5"/>
    <rect x="190" y="88" width="39" height="33" rx="3" fill="var(--surface-paper)" stroke="var(--saffron-border)"/><path d="M209 95v19m0-11c-7 0-10-4-10-7 7 0 10 3 10 7Zm0 6c7 0 10-4 10-7-7 0-10 3-10 7Z" fill="var(--green-soft)" stroke="var(--green-ink)" strokeWidth="1.5"/>
    <rect x="42" y="129" width="211" height="14" rx="3" fill="var(--saffron-muted)" stroke="var(--saffron-ink)"/><path d="M52 134h191m-174-5v14m156-14v14" stroke="var(--saffron-ink)" strokeWidth="1.5"/>
  </>,
  purchases: <>
    <rect x="25" y="18" width="250" height="126" rx="12" fill="var(--green-light)" stroke="none"/>
    <path d="M25 62h250M25 104h250M102 18v44m87-44v44M63 62v42" stroke="var(--green-soft)" strokeWidth="1.5"/>
    <path d="M34 155h232v13H34z" fill="var(--surface-paper)" stroke="var(--green-soft)"/><rect x="18" y="143" width="264" height="12" rx="3" fill="var(--saffron-muted)" stroke="var(--saffron-ink)"/>
    <rect x="175" y="35" width="77" height="108" rx="5" fill="var(--green-soft)"/>
    <path d="M182 43h63v94l-5-3-5 3-5-3-5 3-6-3-5 3-6-3-5 3-5-3-5 3-6-3z" fill="var(--surface-paper)"/>
    <rect x="199" y="30" width="29" height="14" rx="4" fill="var(--green)"/><path d="M207 36h13" stroke="var(--green-soft)" strokeWidth="1.5"/>
    <path d="M192 59h43m-43 9h28m-28 14h43m-43 10h26m-26 10h20" stroke="var(--green-ink)" strokeWidth="1.5"/>
    <circle cx="229" cy="118" r="10" fill="var(--saffron-light)" stroke="var(--saffron-ink)"/><path d="m224 118 3 3 6-7" stroke="var(--saffron-ink)"/>
    <path d="m43 84 20-20h83l21 20v59H43z" fill="var(--saffron-light)"/>
    <path d="M43 84h124v59H43z" fill="var(--saffron-muted)"/><path d="M146 64v20m0 0v59" stroke="var(--saffron-ink)" strokeWidth="1.5"/>
    <path d="m99 64-5 20v22l9-4 9 4V84l5-20" fill="var(--surface-paper)" stroke="var(--saffron-ink)"/>
    <rect x="55" y="111" width="31" height="22" rx="2" fill="var(--surface-paper)" stroke="var(--saffron-border)"/><path d="M61 119h18m-18 7h12" stroke="var(--green-ink)" strokeWidth="1.5"/>
    <path d="M126 131v-14m-4 4 4-4 4 4m5 10v-14m-4 4 4-4 4 4" stroke="var(--saffron-ink)" strokeWidth="1.5"/>
  </>,
  customers: <>
    <rect x="25" y="18" width="250" height="126" rx="12" fill="var(--green-light)" stroke="none"/>
    <path d="M25 62h250M25 104h250M189 18v44m48 0v42" stroke="var(--green-soft)" strokeWidth="1.5"/>
    <path d="M34 155h232v13H34z" fill="var(--surface-paper)" stroke="var(--green-soft)"/><rect x="18" y="143" width="264" height="12" rx="3" fill="var(--saffron-muted)" stroke="var(--saffron-ink)"/>
    <path d="M94 111V93a31 31 0 0 1 62 0v18" fill="var(--green)"/><circle cx="125" cy="48" r="15" fill="var(--surface-paper)"/>
    <path d="M111 44c1-16 27-17 29 0l-8-3-8 4-13-1" fill="var(--green-dark)"/><path d="M120 54c3 3 7 3 10 0m-18 15 13 11 13-11" stroke="var(--green-ink)" strokeWidth="1.5"/>
    <path d="M47 132v-18a31 31 0 0 1 62 0v18" fill="var(--saffron-light)"/><circle cx="78" cy="69" r="14" fill="var(--surface-paper)"/>
    <path d="M64 67c0-17 26-19 28-1-7 1-12-3-14-7-2 5-7 8-14 8" fill="var(--saffron-muted)"/><path d="M74 75c2 2 6 2 8 0m-19 45v11m31-11v11" stroke="var(--saffron-ink)" strokeWidth="1.5"/>
    <path d="M146 129v-19a28 28 0 0 1 56 0v19" fill="var(--green-soft)"/><circle cx="174" cy="68" r="13" fill="var(--surface-paper)"/>
    <path d="M161 65c1-16 25-17 26 2l-10-5-7 4-9-1" fill="var(--green)"/><path d="M170 74c2 2 6 2 8 0" stroke="var(--green-ink)" strokeWidth="1.5"/>
    <path d="M40 131h111v12H40z" fill="var(--surface-paper)" stroke="var(--green-soft)"/>
    <ellipse cx="118" cy="136" rx="18" ry="4" fill="var(--green-soft)" stroke="var(--green-ink)"/><path d="M107 116h22v12a8 8 0 0 1-8 8h-6a8 8 0 0 1-8-8z" fill="var(--surface-paper)"/><path d="M129 119h3a5 5 0 0 1 0 10h-3" stroke="var(--green-ink)" strokeWidth="1.5"/>
    <rect x="155" y="93" width="101" height="50" rx="6" fill="var(--surface-paper)"/>
    <path d="M166 105h36m-36 7h23" stroke="var(--green-ink)" strokeWidth="1.5"/>
    <g fill="var(--green-soft)" stroke="var(--green-ink)"><circle cx="169" cy="129" r="5"/><circle cx="186" cy="129" r="5"/><circle cx="203" cy="129" r="5"/></g>
    <path d="M224 116h21v19h-21z" fill="var(--saffron-light)" stroke="var(--saffron-ink)"/><path d="M221 114h27v6h-27z" fill="var(--saffron-muted)" stroke="var(--saffron-ink)"/><path d="M234.5 114v21m0-21c-14 0-13-12-5-8l5 8c14 0 13-12 5-8z" stroke="var(--saffron-ink)" strokeWidth="1.5"/>
  </>,
  storefront: <>
    <rect x="8" y="20" width="32" height="20" fill="var(--surface)"/><rect x="12" y="25" width="10" height="8" rx="1" fill="var(--green-soft)"/><path d="M26 40V28h8v12" fill="var(--green-soft)"/>
    <path d="M6 12h36l2 8H4z" fill="var(--surface)" stroke="none"/><path d="M13.2 12h7.2l-.4 8h-8zm14.4 0h7.2l1.2 8h-8z" fill="var(--saffron)" stroke="none"/><path d="M6 12h36l2 8H4z"/>
    <path d="M3 40h42"/>
  </>,
  finance: <>
    <rect x="25" y="18" width="250" height="126" rx="12" fill="var(--green-light)" stroke="none"/>
    <path d="M25 62h250M25 104h250M102 18v44m87-44v44m48 0v42" stroke="var(--green-soft)" strokeWidth="1.5"/>
    <path d="M34 155h232v13H34z" fill="var(--surface-paper)" stroke="var(--green-soft)"/><rect x="18" y="143" width="264" height="12" rx="3" fill="var(--saffron-muted)" stroke="var(--saffron-ink)"/>
    <rect x="46" y="43" width="118" height="100" rx="5" fill="var(--green)"/><rect x="55" y="37" width="109" height="99" rx="4" fill="var(--surface-paper)"/>
    <path d="M65 38v97" stroke="var(--green-soft)" strokeWidth="1.5"/><path d="M51 52h9m-9 18h9m-9 18h9m-9 18h9m-9 18h9" stroke="var(--green-ink)" strokeWidth="3"/>
    <path d="M76 51h42m-42 8h28" stroke="var(--green-ink)" strokeWidth="1.5"/>
    <rect x="75" y="70" width="76" height="51" rx="2" fill="var(--saffron-light)" stroke="var(--saffron-border)"/>
    <path d="M75 83h76m-76 13h76m-76 13h76m-30-39v51" stroke="var(--saffron-border)" strokeWidth="1.5"/><path d="M83 77h21m25 0h14m-60 13h27m19 0h14m-60 13h17m29 0h14m-60 12h23m23 0h14" stroke="var(--green-ink)" strokeWidth="1.5"/>
    <path d="M172 44h7v78l-3.5 11-3.5-11z" fill="var(--saffron-muted)" stroke="var(--saffron-ink)"/><path d="M175.5 51v62" stroke="var(--surface-paper)" strokeWidth="1.5"/>
    <rect x="190" y="64" width="66" height="79" rx="7" fill="var(--green)"/><rect x="198" y="73" width="50" height="19" rx="3" fill="var(--surface-paper)" stroke="var(--green-soft)"/><path d="M226 84h14" stroke="var(--green-ink)" strokeWidth="1.5"/>
    <g fill="var(--surface-paper)" stroke="var(--green-soft)"><rect x="198" y="101" width="10" height="9" rx="2"/><rect x="217" y="101" width="10" height="9" rx="2"/><rect x="198" y="115" width="10" height="9" rx="2"/><rect x="217" y="115" width="10" height="9" rx="2"/><rect x="198" y="129" width="29" height="6" rx="2"/></g>
    <rect x="236" y="101" width="12" height="9" rx="2" fill="var(--saffron-light)" stroke="var(--saffron-border)"/><rect x="236" y="115" width="12" height="20" rx="2" fill="var(--saffron-muted)" stroke="var(--saffron-ink)"/><path d="M239 123h6m-6 4h6" stroke="var(--saffron-ink)" strokeWidth="1.5"/>
  </>,
  team: <>
    <rect x="25" y="18" width="250" height="126" rx="12" fill="var(--green-light)" stroke="none"/>
    <path d="M25 62h250M25 104h250M102 18v44m87-44v44" stroke="var(--green-soft)" strokeWidth="1.5"/>
    <path d="M34 155h232v13H34z" fill="var(--surface-paper)" stroke="var(--green-soft)"/><rect x="18" y="143" width="264" height="12" rx="3" fill="var(--saffron-muted)" stroke="var(--saffron-ink)"/>
    <rect x="48" y="31" width="204" height="12" rx="4" fill="var(--surface-paper)" stroke="var(--green-soft)"/>
    <circle cx="85" cy="37" r="3" fill="var(--saffron-muted)" stroke="var(--saffron-ink)"/><circle cx="153" cy="37" r="3" fill="var(--saffron-muted)" stroke="var(--saffron-ink)"/><circle cx="228" cy="37" r="3" fill="var(--saffron-muted)" stroke="var(--saffron-ink)"/>
    <path d="m83 40-12 27 14 8 14-8-12-27m64 0-10 15 12 8 12-8-10-15" stroke="var(--green-ink)" strokeWidth="3"/>
    <rect x="121" y="59" width="64" height="79" rx="5" fill="var(--green-soft)"/><rect x="128" y="67" width="50" height="64" rx="3" fill="var(--surface-paper)" stroke="var(--green-soft)"/>
    <rect x="145" y="55" width="16" height="10" rx="3" fill="var(--green)"/><circle cx="153" cy="86" r="8" fill="var(--saffron-light)"/>
    <path d="M139 108v-3a14 14 0 0 1 28 0v3z" fill="var(--green-soft)"/><path d="M138 117h30m-25 7h20" stroke="var(--green-ink)" strokeWidth="1.5"/>
    <rect x="53" y="72" width="64" height="71" rx="5" fill="var(--surface-paper)"/><rect x="77" y="68" width="16" height="10" rx="3" fill="var(--green)"/>
    <circle cx="85" cy="94" r="8" fill="var(--saffron-light)"/><path d="M71 116v-3a14 14 0 0 1 28 0v3z" fill="var(--saffron-muted)" stroke="var(--saffron-ink)"/><path d="M67 126h36m-30 8h24" stroke="var(--green-ink)" strokeWidth="1.5"/>
    <path d="M228 40v10" stroke="var(--green-ink)" strokeWidth="3"/><circle cx="228" cy="69" r="19" fill="none" stroke="var(--green-ink)" strokeWidth="3"/>
    <path d="M236 80a14 14 0 1 1-9 25l-9 9v8h-8v8h-14v-12l27-27a14 14 0 0 1 13-11z" fill="var(--saffron-muted)" stroke="var(--saffron-ink)"/><circle cx="239" cy="92" r="4" fill="var(--surface-paper)" stroke="var(--saffron-ink)"/>
    <path d="M236 85c6-4 10-9 11-15" stroke="var(--green-ink)" strokeWidth="3"/>
  </>,
};

export function PageArt({ view }: { view: View }) {
  return <span className={`page-art${view === "overview" ? " page-art--overview" : view === "pos" || view === "transactions" || view === "products" || view === "inventory" || view === "purchases" || view === "customers" || view === "finance" || view === "team" ? " page-art--operations" : ""}`} aria-hidden="true"><svg viewBox={view === "overview" || view === "pos" || view === "transactions" || view === "products" || view === "inventory" || view === "purchases" || view === "customers" || view === "finance" || view === "team" ? "0 0 300 184" : "0 0 48 48"} fill="none"><g stroke="var(--green-dark)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{pageArt[view]}</g></svg></span>;
}

export function AiBadge() { return <span className="ai-badge"><Sparkles size={11}/> LARIS AI</span>; }
export function Trend({ value }: { value: number }) { return <span className={`trend ${value < 0 ? "negative" : ""}`}><ArrowUpRight size={12} style={value < 0 ? { transform: "rotate(90deg)" } : undefined}/>{Math.abs(value).toFixed(1).replace(".", ",")}%</span>; }
