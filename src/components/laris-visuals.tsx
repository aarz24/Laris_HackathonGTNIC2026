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
    <rect x="6" y="8" width="36" height="30" rx="4" fill="var(--surface)"/>
    <rect x="12" y="24" width="6" height="9" rx="1" fill="var(--green-soft)"/><rect x="21" y="19" width="6" height="14" rx="1" fill="var(--green)"/><rect x="30" y="14" width="6" height="19" rx="1" fill="var(--saffron)"/>
    <path d="M19 38v4m10-4v4m-14 0h18"/>
  </>,
  pos: <>
    <path d="M15 6h14v14H15z" fill="var(--surface)"/><path d="M18 10h8m-8 3.5h5" strokeWidth="1.5"/>
    <path d="M9 18h30l3 14H6z" fill="var(--green-soft)"/><rect x="29" y="21" width="7" height="4" rx="1" fill="var(--saffron)" strokeWidth="1.5"/>
    <circle cx="13" cy="23" r="1.4" fill="var(--green-dark)" stroke="none"/><circle cx="18" cy="23" r="1.4" fill="var(--green-dark)" stroke="none"/><circle cx="23" cy="23" r="1.4" fill="var(--green-dark)" stroke="none"/><circle cx="13" cy="27.5" r="1.4" fill="var(--green-dark)" stroke="none"/><circle cx="18" cy="27.5" r="1.4" fill="var(--green-dark)" stroke="none"/><circle cx="23" cy="27.5" r="1.4" fill="var(--green-dark)" stroke="none"/>
    <rect x="5" y="32" width="38" height="9" rx="2" fill="var(--surface)"/><path d="M18 36.5h12"/>
  </>,
  transactions: <>
    <rect x="15" y="6" width="22" height="30" rx="2" fill="var(--green-soft)" transform="rotate(8 26 21)"/>
    <path d="M10 8h22v30l-3.7-2.5-3.6 2.5-3.7-2.5-3.7 2.5-3.6-2.5-3.7 2.5z" fill="var(--surface)"/>
    <path d="M14 15h14M14 20h10M14 25h12" strokeWidth="1.5"/><path d="M14 30h14" stroke="var(--saffron)" strokeWidth="2.5"/>
  </>,
  products: <>
    <rect x="24" y="7" width="18" height="24" rx="2" fill="var(--surface)"/><path d="M28 13h10m-10 5h10m-10 5h6" strokeWidth="1.5"/>
    <path d="M14 16c-2-2 2-3 0-5m6 5c-2-2 2-3 0-5" stroke="var(--green-ink)" strokeWidth="1.5"/>
    <path d="M28 23h2a4 4 0 0 1 0 8h-2"/><path d="M8 20h20v10a8 8 0 0 1-8 8h-4a8 8 0 0 1-8-8z" fill="var(--saffron)"/><path d="M5 42h26"/>
  </>,
  inventory: <>
    <rect x="6" y="18" width="11" height="22" rx="3" fill="var(--surface)"/><rect x="8" y="27" width="7" height="11" rx="1.5" fill="var(--green)" stroke="none"/><rect x="7" y="14" width="9" height="4" rx="1" fill="var(--green-dark)"/>
    <rect x="19" y="22" width="11" height="18" rx="3" fill="var(--surface)"/><rect x="21" y="34" width="7" height="4" rx="1.5" fill="var(--saffron)" stroke="none"/><rect x="20" y="18" width="9" height="4" rx="1" fill="var(--green-dark)"/>
    <rect x="32" y="16" width="11" height="24" rx="3" fill="var(--surface)"/><rect x="34" y="22" width="7" height="16" rx="1.5" fill="var(--green-soft)" stroke="none"/><rect x="33" y="12" width="9" height="4" rx="1" fill="var(--green-dark)"/>
    <path d="M3 41h42" strokeWidth="2.5"/>
  </>,
  purchases: <>
    <rect x="25" y="22" width="19" height="18" rx="2" fill="var(--saffron)"/><path d="M34.5 22v7"/>
    <path d="M6 16h22l-2 24H8z" fill="var(--green-soft)"/><path d="M12 20v-6a5 5 0 0 1 10 0v6"/>
  </>,
  customers: <>
    <rect x="5" y="11" width="38" height="26" rx="4" fill="var(--surface)"/><path d="M10 17h12" strokeWidth="1.5"/>
    <circle cx="12" cy="27" r="3.2" fill="var(--green)"/><circle cx="20" cy="27" r="3.2" fill="var(--green)"/><circle cx="28" cy="27" r="3.2" fill="var(--green)"/>
    <circle cx="36" cy="27" r="3.2" fill="var(--saffron-light)" stroke="var(--saffron-dark)" strokeDasharray="2 1.6"/>
  </>,
  storefront: <>
    <rect x="8" y="20" width="32" height="20" fill="var(--surface)"/><rect x="12" y="25" width="10" height="8" rx="1" fill="var(--green-soft)"/><path d="M26 40V28h8v12" fill="var(--green-soft)"/>
    <path d="M6 12h36l2 8H4z" fill="var(--surface)" stroke="none"/><path d="M13.2 12h7.2l-.4 8h-8zm14.4 0h7.2l1.2 8h-8z" fill="var(--saffron)" stroke="none"/><path d="M6 12h36l2 8H4z"/>
    <path d="M3 40h42"/>
  </>,
  finance: <>
    <rect x="23" y="24" width="5" height="14" rx="1" fill="var(--green-soft)"/><rect x="31" y="18" width="5" height="20" rx="1" fill="var(--green)"/><rect x="39" y="11" width="5" height="27" rx="1" fill="var(--green-dark)"/>
    <path d="M5 33v4c0 1.7 3.1 3 7 3s7-1.3 7-3v-4" fill="var(--saffron)"/><ellipse cx="12" cy="33" rx="7" ry="3" fill="var(--saffron)"/>
    <path d="M5 26v4c0 1.7 3.1 3 7 3s7-1.3 7-3v-4" fill="var(--saffron)"/><ellipse cx="12" cy="26" rx="7" ry="3" fill="var(--saffron-light)"/>
  </>,
  team: <>
    <circle cx="30" cy="15" r="5" fill="var(--surface)"/><path d="M21 35a9 9 0 0 1 18 0z" fill="var(--green-soft)"/>
    <circle cx="18" cy="19" r="6" fill="var(--surface)"/><path d="M7 41a11 11 0 0 1 22 0z" fill="var(--green)"/>
    <circle cx="37" cy="34" r="6" fill="var(--saffron)"/><path d="m34.3 34 2 2 3.5-4"/>
  </>,
};

export function PageArt({ view }: { view: View }) {
  return <span className="page-art" aria-hidden="true"><svg viewBox="0 0 48 48" fill="none"><g stroke="var(--green-dark)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{pageArt[view]}</g></svg></span>;
}

export function AiBadge() { return <span className="ai-badge"><Sparkles size={11}/> LARIS AI</span>; }
export function Trend({ value }: { value: number }) { return <span className={`trend ${value < 0 ? "negative" : ""}`}><ArrowUpRight size={12} style={value < 0 ? { transform: "rotate(90deg)" } : undefined}/>{Math.abs(value).toFixed(1).replace(".", ",")}%</span>; }
