"use client";

import { useId, useState } from "react";
import { ArrowUpRight, Coffee, Sparkles } from "lucide-react";
import { currency } from "@/lib/laris-data";

export function LarisMark({ small = false }: { small?: boolean }) {
  return <span className={`laris-mark ${small ? "small" : ""}`} aria-hidden="true"><svg viewBox="0 0 32 32" fill="none"><path d="M15 16C6 16 4 11 6 6c5-2 10 0 10 9M17 16c9 0 11 5 9 10-5 2-10 0-10-9M16 15C16 6 21 4 26 6c2 5 0 10-9 10M16 17c0 9-5 11-10 9-2-5 0-10 9-10" fill="currentColor"/></svg></span>;
}

export function CafeIllustration() {
  return <div className="cafe-art" aria-hidden="true"><svg viewBox="0 0 430 230" fill="none">
    <ellipse cx="233" cy="207" rx="153" ry="12" fill="#C7DFCD" opacity=".5"/>
    <path d="M41 141c-8-36 38-64 79-51M343 35c27 0 41 18 35 41M347 161c26 2 30 22 21 32" stroke="#96B79C" strokeWidth="1.5" strokeDasharray="5 5"/>
    <path d="m67 48 4 10 10 4-10 4-4 10-4-10-10-4 10-4 4-10ZM366 108l3 8 8 3-8 3-3 8-3-8-8-3 8-3 3-8Z" fill="#EDA939"/>
    <path d="m331 31 2 5 5 2-5 2-2 5-2-5-5-2 5-2 2-5Z" fill="#5B9575"/>
    <rect x="104" y="78" width="203" height="117" rx="8" fill="#F7F4E9" stroke="#2C6048" strokeWidth="2"/>
    <path d="M112 195h189v9H112z" fill="#477B59"/><path d="M95 202h222v7H95z" fill="#2C6048"/>
    <rect x="130" y="117" width="66" height="67" rx="3" fill="#D9E6D2" stroke="#437958" strokeWidth="2"/>
    <path d="M163 118v66m-33-34h66" stroke="#437958" strokeWidth="2"/>
    <path d="m140 131 10-9m-7 18 17-15m14 49 13-12" stroke="#F7F4E9" strokeWidth="3" strokeLinecap="round"/>
    <rect x="217" y="115" width="57" height="83" rx="3" fill="#477B59"/><rect x="224" y="122" width="43" height="49" rx="2" fill="#D9E6D2"/><circle cx="263" cy="179" r="2" fill="#EEC269"/>
    <rect x="151" y="47" width="110" height="31" rx="5" fill="#F7F4E9" stroke="#2C6048" strokeWidth="2"/><text x="206" y="67" textAnchor="middle" fill="#2C6048" fontSize="14" fontWeight="800" fontFamily="sans-serif" letterSpacing="2">KOPI SENJA</text>
    <path d="M103 79h205l11 26H92l11-26Z" fill="#447D59" stroke="#2C6048" strokeWidth="2"/>
    <path d="M127 79h25l-3 26h-29l7-26Zm52 0h25v26h-28l3-26Zm52 0h25l5 26h-29l-1-26Zm52 0h25l11 26h-29l-7-26Z" fill="#F1EFD9"/>
    <path d="M92 105h28v6a14 14 0 0 1-28 0v-6Zm57 0h27v6a13.5 13.5 0 0 1-27 0v-6Zm55 0h28v6a14 14 0 0 1-28 0v-6Zm57 0h29v6a14.5 14.5 0 0 1-29 0v-6Z" fill="#2C6048"/><path d="M120 105h29v6a14.5 14.5 0 0 1-29 0v-6Zm56 0h28v6a14 14 0 0 1-28 0v-6Zm56 0h29v6a14.5 14.5 0 0 1-29 0v-6Zm58 0h29v6a14.5 14.5 0 0 1-29 0v-6Z" fill="#E5E8CC"/>
    <path d="M84 204v-45m0 24c-17 0-22-14-22-23 17 0 22 10 22 23Zm0-12c0-19 10-29 24-30 0 16-8 29-24 30Z" fill="#629268" stroke="#477B59" strokeWidth="1.5"/><path d="M69 187h29l-4 21H73l-4-21Z" fill="#D9AA73"/>
    <g className="art-float"><rect x="289" y="136" width="75" height="61" rx="10" fill="#FFFDF6" stroke="#A9C7AA"/><rect x="301" y="170" width="10" height="15" rx="2" fill="#C8DBC5"/><rect x="317" y="158" width="10" height="27" rx="2" fill="#8BB493"/><rect x="333" y="147" width="10" height="38" rx="2" fill="#376D4C"/><path d="m303 158 14-10 11 1 15-12m-8 0h8v8" stroke="#D8A343" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></g>
    <g transform="rotate(-12 92 101)"><rect x="62" y="84" width="57" height="47" rx="9" fill="#FFFDF6" stroke="#A9C7AA"/><path d="M79 99h18v11a8 8 0 0 1-8 8h-2a8 8 0 0 1-8-8V99Z" fill="#DBAA66"/><path d="M97 102h3a5 5 0 0 1 0 10h-3" stroke="#DBAA66" strokeWidth="3"/><path d="M83 94c-4-5 4-4 0-9m7 9c-4-5 4-4 0-9" stroke="#A9BBA3" strokeWidth="1.5" strokeLinecap="round"/></g>
    <circle cx="328" cy="67" r="21" fill="#EDC86C" stroke="#D7AD49" strokeWidth="2"/><circle cx="328" cy="67" r="15" stroke="#D7AD49"/><path d="m321 67 5 5 9-11" stroke="#917132" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
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
    <defs><linearGradient id={gradient} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#58AA81" stopOpacity=".21"/><stop offset="100%" stopColor="#58AA81" stopOpacity="0"/></linearGradient></defs>
    {[0, 1, 2, 3].map(i => <g key={i}><line x1="54" x2="655" y1={31 + i * 47.66} y2={31 + i * 47.66} stroke="#E9EDEA" strokeDasharray="3 4"/><text x="0" y={35 + i * 47.66} fill="#89928C" fontSize="10.5">{i === 3 ? "Rp0" : `${((max * (3 - i)) / 3 / 1000000).toFixed(1).replace(".", ",")} jt`}</text></g>)}
    <path d={`${path} L650 175 L54 175 Z`} fill={`url(#${gradient})`}/><path d={smoothPath(lastPoints)} stroke="#CDD9D1" strokeWidth="2" strokeDasharray="5 5" fill="none"/>
    <path d={path} stroke="#3C8963" strokeWidth="2.8" fill="none" strokeLinecap="round"/>
    {points.map(([x,y], i) => <g key={i} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}><rect x={x - 25} y="10" width="50" height="177" fill="transparent"/><circle cx={x} cy={y} r={hover === i ? 5 : 3} fill="#fff" stroke="#3C8963" strokeWidth="2"/><text x={x} y="205" textAnchor="middle" fill="#89928C" fontSize="10.5">{labels[i]}</text>{hover === i && <g><rect x={Math.min(Math.max(x - 59, 42), 550)} y={Math.max(y - 38, 0)} width="112" height="27" rx="6" fill="#244D3A"/><text x={Math.min(Math.max(x - 59, 42), 550) + 56} y={Math.max(y - 38, 0) + 18} fill="white" fontSize="11" textAnchor="middle">{currency(values[i])}</text></g>}</g>)}
  </svg></div>;
}

export function Sparkline({ variant = 0, color = "#699A7C" }: { variant?: number; color?: string }) {
  const paths = ["M0 32 9 28 16 31 24 20 32 25 40 15 48 19 56 7 64 13 73 4", "M0 31 9 26 17 29 25 18 33 20 41 12 49 17 57 8 65 11 73 4", "M0 28 9 31 17 21 25 23 33 13 41 17 49 12 57 17 65 6 73 8", "M0 32 9 25 17 29 25 16 33 22 41 15 49 18 57 7 65 13 73 4"];
  return <svg className="sparkline" viewBox="0 0 76 40" aria-hidden="true"><path d={paths[variant % 4]} stroke={color} strokeWidth="2" fill="none" strokeLinejoin="round" strokeLinecap="round"/></svg>;
}

export function ScoreRing({ score = 78, small = false }: { score?: number; small?: boolean }) {
  return <div className={`score-ring ${small ? "compact" : ""}`}><svg viewBox="0 0 120 120" aria-label={`Skor kesiapan modal ${score} dari 100`}><circle cx="60" cy="60" r="50" fill="none" stroke="#ECF0E8" strokeWidth="9"/><circle cx="60" cy="60" r="50" fill="none" stroke="#75945C" strokeWidth="9" strokeDasharray={`${score * 3.14} 314`} strokeLinecap="round" transform="rotate(-90 60 60)"/></svg><div><strong>{score}</strong><span>dari 100</span></div></div>;
}

export function EmptyState({ title, description }: { title: string; description: string }) {
  return <div className="empty-state"><span><Coffee size={30}/></span><h3>{title}</h3><p>{description}</p></div>;
}

export function AiBadge() { return <span className="ai-badge"><Sparkles size={11}/> LARIS AI</span>; }
export function Trend({ value }: { value: number }) { return <span className={`trend ${value < 0 ? "negative" : ""}`}><ArrowUpRight size={12} style={value < 0 ? { transform: "rotate(90deg)" } : undefined}/>{Math.abs(value).toFixed(1).replace(".", ",")}%</span>; }
