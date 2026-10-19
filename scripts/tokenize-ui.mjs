import { readFileSync, writeFileSync } from "node:fs";

const path = new URL("../src/app/globals.css", import.meta.url);
let css = readFileSync(path, "utf8");

const tokenBlock = `:root{
  --background:#FBF8F3;
  --foreground:#1A2332;
  --green:#1F9D74;
  --green-dark:#178A64;
  --green-light:#E6F5EE;
  --border:#E8E2D6;
  --muted:#8A8578;
  --saffron:#F5A524;
  --saffron-light:#FEF7E8;
  --saffron-dark:#D48E1E;
  --red:#E5484D;
  --font-sans:var(--font-jakarta);
  --surface:#FFFFFF;
  --surface-muted:#FAF7F2;
  --surface-warm:#F5F2EB;
  --surface-paper:#FDFCF9;
  --text-secondary:#5C6B74;
  --text-nav:#6B7580;
  --placeholder:#B5AFA5;
  --green-soft:#C4E6D8;
  --green-wash:#D4F0E2;
  --green-ink:#4A7A62;
  --green-copy:#2D5E48;
  --saffron-border:#EDE3C8;
  --saffron-wash:#FFF0D4;
  --saffron-muted:#F5E6C0;
  --saffron-gold:#FEF0D4;
  --saffron-ink:#A07830;
  --saffron-copy:#9E8A5E;
  --saffron-heading:#7A5C14;
  --saffron-accent:#8B7430;
  --saffron-deep:#8B6020;
  --track:#F0EDE6;
  --red-light:#FFF0F0;
  --red-border:#FFD4D4;
  --red-dark:#DC3545;
  --overlay:color-mix(in srgb,var(--foreground) 25%,transparent);
  --overlay-soft:color-mix(in srgb,var(--foreground) 18%,transparent);
  --shadow-green:color-mix(in srgb,var(--green) 22%,transparent);
  --shadow-saffron:color-mix(in srgb,var(--saffron) 16%,transparent);
  --shadow-ink:color-mix(in srgb,var(--foreground) 8%,transparent);
}`;

const themeBlock = `@theme inline{
  --color-background:var(--background);
  --color-foreground:var(--foreground);
  --color-green:var(--green);
  --color-green-dark:var(--green-dark);
  --color-green-light:var(--green-light);
  --color-border:var(--border);
  --color-muted:var(--muted);
  --color-saffron:var(--saffron);
  --color-saffron-light:var(--saffron-light);
  --color-saffron-dark:var(--saffron-dark);
  --color-red:var(--red);
  --color-surface:var(--surface);
  --font-sans:var(--font-jakarta);
  --font-mono:monospace
}`;

css = css.replace(/:root\{[^}]+\}/, "/*__ROOT__*/");
css = css.replace(/@theme inline\{[^}]+\}/, themeBlock);

const extras = `.spin{animation:spin .9s linear infinite}.notice.green{background:var(--green-light);border-color:var(--green-soft);color:var(--green)}.notice.green strong{color:var(--green-dark)}.notice.green p{color:var(--green-ink)}@keyframes spin{to{transform:rotate(360deg)}}`;
css = css.replace("{box-sizing:border-box}", `{box-sizing:border-box}${extras}`);

const replacements = [
  ["#FFFFFFE0", "color-mix(in srgb,var(--surface) 88%,transparent)"],
  ["#FFFBF2E8", "color-mix(in srgb,var(--saffron-light) 91%,transparent)"],
  ["#1A233240", "var(--overlay)"],
  ["#1A233230", "var(--overlay-soft)"],
  ["#1A233220", "var(--shadow-ink)"],
  ["#1A233212", "var(--shadow-ink)"],
  ["#1A233210", "var(--shadow-ink)"],
  ["#1A233208", "var(--shadow-ink)"],
  ["#1F9D7440", "var(--shadow-green)"],
  ["#1F9D7430", "var(--shadow-green)"],
  ["#1F9D7420", "var(--shadow-green)"],
  ["#1F9D7418", "var(--shadow-green)"],
  ["#1F9D7415", "var(--shadow-green)"],
  ["#1F9D7412", "var(--shadow-green)"],
  ["#1F9D7410", "var(--shadow-green)"],
  ["#F5A52415", "var(--shadow-saffron)"],
  ["#F5A52412", "var(--shadow-saffron)"],
  ["#F5E8CE30", "color-mix(in srgb,var(--saffron-light) 70%,transparent)"],
  ["#F5E8CE18", "color-mix(in srgb,var(--saffron-light) 55%,transparent)"],
  ["#C4E6D830", "color-mix(in srgb,var(--green-soft) 55%,transparent)"],
  ["#C4E6D820", "color-mix(in srgb,var(--green-soft) 45%,transparent)"],
  ["#C4E6D810", "color-mix(in srgb,var(--green-soft) 30%,transparent)"],
  ["#B8DEC830", "color-mix(in srgb,var(--green-soft) 50%,transparent)"],
  ["#E6F5EE80", "color-mix(in srgb,var(--green-light) 50%,transparent)"],
  ["#FFF0F080", "color-mix(in srgb,var(--red-light) 50%,transparent)"],
  ["#FFF0F060", "color-mix(in srgb,var(--red-light) 38%,transparent)"],
  ["#00000005", "var(--shadow-ink)"],
  ["#FAF7F2", "var(--surface-muted)"],
  ["#F5F2EB", "var(--surface-warm)"],
  ["#FDFCF9", "var(--surface-paper)"],
  ["#F5F0E8", "var(--surface-warm)"],
  ["#FFF9EE", "var(--saffron-light)"],
  ["#FFFCF5", "var(--saffron-light)"],
  ["#FAF0DD", "var(--saffron-gold)"],
  ["#5C6B74", "var(--text-secondary)"],
  ["#6B7580", "var(--text-nav)"],
  ["#B5AFA5", "var(--placeholder)"],
  ["#C4E6D8", "var(--green-soft)"],
  ["#D4F0E2", "var(--green-wash)"],
  ["#4A7A62", "var(--green-ink)"],
  ["#2D5E48", "var(--green-copy)"],
  ["#EDE3C8", "var(--saffron-border)"],
  ["#FFF0D4", "var(--saffron-wash)"],
  ["#F5E6C0", "var(--saffron-muted)"],
  ["#FEF0D4", "var(--saffron-gold)"],
  ["#A07830", "var(--saffron-ink)"],
  ["#9E8A5E", "var(--saffron-copy)"],
  ["#7A5C14", "var(--saffron-heading)"],
  ["#8B7430", "var(--saffron-accent)"],
  ["#8B6020", "var(--saffron-deep)"],
  ["#F0EDE6", "var(--track)"],
  ["#FFF0F0", "var(--red-light)"],
  ["#FFD4D4", "var(--red-border)"],
  ["#DC3545", "var(--red-dark)"],
  ["#F0EBFA", "var(--green-light)"],
  ["#8B5CF6", "var(--green-dark)"],
  ["#E0D4F5", "var(--green-soft)"],
  ["#EBF4FF", "var(--saffron-light)"],
  ["#3B82F6", "var(--saffron-dark)"],
  ["#D4E8C8", "var(--green-soft)"],
  ["#B0DECA", "var(--green-soft)"],
  ["#B8DEC8", "var(--green-soft)"],
  ["#D5CFC3", "var(--border)"],
  ["#E5DFD3", "var(--border)"],
  ["#E8E0CA", "var(--saffron-border)"],
  ["#FFFFFF", "var(--surface)"],
  ["#fff", "var(--surface)"],
  ["#FAF7F2".toLowerCase(), "var(--surface-muted)"],
];

for (const [from, to] of replacements) {
  css = css.split(from).join(to);
}

css = css.replace(/body\{background:white\}/g, "body{background:var(--surface)}");
css = css.replace(/background:white;/g, "background:var(--surface);");
css = css.replace(/color:#666/g, "color:var(--muted)");

css = css.replace("/*__ROOT__*/", tokenBlock);
writeFileSync(path, css);
console.log("tokenized globals.css", css.length);
