import { readFileSync, writeFileSync } from "node:fs";

const path = new URL("../src/app/globals.css", import.meta.url);
let css = readFileSync(path, "utf8");

const leftoverHex = [
  ["#FDF0E0", "var(--saffron-wash)"],
  ["#A5EACC", "var(--green-soft)"],
  ["#F0DFB0", "var(--saffron-muted)"],
];
for (const [from, to] of leftoverHex) css = css.split(from).join(to);
css = css.replace("box-shadow:0 0 0 14px #E6F5EE", "box-shadow:0 0 0 14px var(--green-light)");

const marker = "/* laris-polish */";
const polish = `${marker}
@media screen{
html{background:
  radial-gradient(1200px 520px at 12% -8%,color-mix(in srgb,var(--green-light) 70%,transparent),transparent 58%),
  radial-gradient(900px 480px at 92% 0%,color-mix(in srgb,var(--saffron-light) 80%,transparent),transparent 52%),
  var(--background)}
body{background:transparent}
body:before{content:"";position:fixed;inset:0;pointer-events:none;z-index:-1;opacity:.28;background-image:radial-gradient(var(--border) .65px,transparent .75px);background-size:20px 20px}
.app-shell{position:relative;z-index:1}
.sidebar{background:color-mix(in srgb,var(--surface) 92%,var(--background));backdrop-filter:blur(16px)}
.workspace{position:relative}
.workspace:before{content:"";position:absolute;inset:0 auto auto 0;width:min(72vw,920px);height:280px;pointer-events:none;background:radial-gradient(closest-side,color-mix(in srgb,var(--green-light) 55%,transparent),transparent 72%)}
.topbar{position:sticky;top:0;z-index:25;background:color-mix(in srgb,var(--surface) 82%,transparent);backdrop-filter:blur(18px) saturate(1.2);box-shadow:0 1px 0 var(--border)}
.global-search{padding:8px 12px;border:1px solid var(--border);border-radius:999px;background:var(--surface-muted)}
.global-search:hover{border-color:var(--green-soft);background:var(--surface);box-shadow:0 0 0 4px var(--shadow-green)}
.global-search kbd{background:var(--surface);margin-left:auto}
.panel,.kpi-card,.product-card,.recipe-card,.team-card,.cart-panel,.insight-card,.capital-card,.purchase-banner,.storefront-cover,.stat-block,.notice{box-shadow:var(--shadow-card)}
.kpi-card{position:relative}
.kpi-card:before{content:"";position:absolute;left:16px;right:16px;top:0;height:3px;border-radius:0 0 4px 4px;background:var(--green)}
.kpi-card.kpi-orange:before,.kpi-card.kpi-blue:before{background:linear-gradient(90deg,var(--saffron),var(--saffron-dark))}
.kpi-card.kpi-purple:before{background:linear-gradient(90deg,var(--green),var(--green-dark))}
.kpi-card:hover,.product-card:hover,.recipe-card:hover,.team-card:hover,.insight-card:hover,.growth-card:hover,.capital-card:hover{border-color:var(--green-soft);box-shadow:var(--shadow-lift);transform:translateY(-2px)}
.welcome-banner{box-shadow:0 10px 36px color-mix(in srgb,var(--green) 10%,transparent)}
.button.primary{letter-spacing:-.01em}
.button.primary:hover:not(:disabled){transform:translateY(-1px)}
.nav-item.active{background:linear-gradient(90deg,var(--green-light),color-mix(in srgb,var(--green-light) 40%,transparent))}
.status-dot{box-shadow:0 0 0 3px color-mix(in srgb,var(--green) 18%,transparent);animation:pulse-dot 2.4s ease-in-out infinite}
.greeting-sun{display:inline-block;animation:float-y 3.6s ease-in-out infinite}
.art-float{animation:float-y 4.5s ease-in-out infinite}
.floating-assistant{box-shadow:0 8px 28px var(--shadow-green),0 0 0 6px color-mix(in srgb,var(--green) 12%,transparent)}
.product-tag{backdrop-filter:blur(8px)}
.category-tabs button:hover{border-color:var(--green-soft);color:var(--green-dark);background:var(--green-light)}
.target-progress span,.contribution>div>span,.readiness-line>div>span{background:linear-gradient(90deg,var(--green),var(--green-dark))}
.modal{border-color:color-mix(in srgb,var(--green-soft) 50%,var(--border))}
.profile-button{box-shadow:0 0 0 1px var(--saffron-border)}
.brand>span:last-child{background:linear-gradient(180deg,var(--green-dark),var(--green));-webkit-background-clip:text;background-clip:text;color:transparent}
.brand-period{-webkit-text-fill-color:var(--saffron);color:var(--saffron)}
tr{transition:background .15s ease}
tbody tr:hover td{background:color-mix(in srgb,var(--green-light) 45%,var(--surface))}
::-webkit-scrollbar{width:10px;height:10px}
::-webkit-scrollbar-thumb{background:color-mix(in srgb,var(--muted) 35%,var(--border));border:2px solid var(--background);border-radius:99px}
::-webkit-scrollbar-track{background:transparent}
@keyframes float-y{0%,100%{transform:translateY(0)}50%{transform:translateY(-7px)}}
}
@media (prefers-reduced-motion:reduce){.art-float,.greeting-sun,.status-dot{animation:none}}
`;

if (!css.includes(marker)) css += `\n${polish}`;
else css = css.slice(0, css.indexOf(marker)) + polish;

writeFileSync(path, css);
console.log("beautified globals.css", css.length);
