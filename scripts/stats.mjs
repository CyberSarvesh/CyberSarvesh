// Generates assets/neofetch.svg from your GitHub data.
// Runs inside GitHub Actions (see .github/workflows/stats.yml). No dependencies.
// Local preview without a token:  node scripts/stats.mjs --mock

import { writeFileSync, mkdirSync } from "node:fs";

const LOGIN = process.env.GH_LOGIN || "cybersarvesh";
const TOKEN = process.env.GITHUB_TOKEN;
const OUT = "assets/neofetch.svg";
const HEAT_WEEKS = 22;

const QUERY = `
query($login: String!) {
  user(login: $login) {
    login
    createdAt
    followers { totalCount }
    pullRequests { totalCount }
    issues { totalCount }
    repositories(ownerAffiliations: OWNER, isFork: false, privacy: PUBLIC, first: 100,
                 orderBy: { field: STARGAZERS, direction: DESC }) {
      totalCount
      nodes {
        stargazerCount
        languages(first: 10, orderBy: { field: SIZE, direction: DESC }) {
          edges { size node { name color } }
        }
      }
    }
    recent: repositories(ownerAffiliations: OWNER, privacy: PUBLIC, first: 5,
                         orderBy: { field: PUSHED_AT, direction: DESC }) {
      nodes { name pushedAt }
    }
    contributionsCollection {
      totalCommitContributions
      restrictedContributionsCount
      contributionCalendar {
        totalContributions
        weeks { contributionDays { date contributionCount contributionLevel } }
      }
    }
  }
}`;

// ---------------------------------------------------------------- data

function streaks(days) {
  // days: [{ date, count }] oldest → newest. Today may still be empty; don't break the streak for that.
  let longest = 0, run = 0;
  for (const d of days) {
    run = d.count > 0 ? run + 1 : 0;
    longest = Math.max(longest, run);
  }
  let i = days.length - 1;
  if (i >= 0 && days[i].count === 0) i--;
  let current = 0;
  while (i >= 0 && days[i].count > 0) { current++; i--; }
  return { current, longest };
}

async function fetchData() {
  const res = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: { Authorization: `bearer ${TOKEN}`, "Content-Type": "application/json", "User-Agent": "profile-stats" },
    body: JSON.stringify({ query: QUERY, variables: { login: LOGIN } }),
  });
  const json = await res.json();
  if (!res.ok || json.errors) throw new Error(JSON.stringify(json.errors || json));
  const u = json.data.user;

  const langs = new Map();
  for (const repo of u.repositories.nodes)
    for (const { size, node } of repo.languages.edges) {
      const cur = langs.get(node.name) || { size: 0, color: node.color || "#8b949e" };
      cur.size += size;
      langs.set(node.name, cur);
    }

  const c = u.contributionsCollection;
  const levels = { NONE: 0, FIRST_QUARTILE: 1, SECOND_QUARTILE: 2, THIRD_QUARTILE: 3, FOURTH_QUARTILE: 4 };
  const days = c.contributionCalendar.weeks.flatMap((w) =>
    w.contributionDays.map((d) => ({ date: d.date, count: d.contributionCount, level: levels[d.contributionLevel] ?? 0 })));

  // The profile repo itself is pushed daily by this Action, so skip it when picking "last push".
  const last = u.recent.nodes.find((r) => r.name.toLowerCase() !== u.login.toLowerCase());

  return {
    login: u.login,
    since: new Date(u.createdAt).getUTCFullYear(),
    repos: u.repositories.totalCount,
    stars: u.repositories.nodes.reduce((s, r) => s + r.stargazerCount, 0),
    followers: u.followers.totalCount,
    prs: u.pullRequests.totalCount,
    issues: u.issues.totalCount,
    commitsYear: c.totalCommitContributions + c.restrictedContributionsCount,
    contribYear: c.contributionCalendar.totalContributions,
    days,
    lastPush: last ? { name: last.name, at: last.pushedAt } : null,
    langs: [...langs.entries()].map(([name, v]) => ({ name, ...v })).sort((a, b) => b.size - a.size),
  };
}

function mockData() {
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const days = [];
  const end = new Date();
  for (let i = 364; i >= 0; i--) {
    const dt = new Date(end); dt.setUTCDate(end.getUTCDate() - i);
    const count = i < 9 ? 1 + Math.floor(rnd() * 6) : rnd() < 0.45 ? 0 : Math.floor(rnd() * 9);
    days.push({ date: dt.toISOString().slice(0, 10), count, level: count === 0 ? 0 : Math.min(4, Math.ceil(count / 2)) });
  }
  return {
    login: "cybersarvesh", since: 2023, repos: 24, stars: 37, followers: 18, prs: 41, issues: 9,
    commitsYear: 214, contribYear: 266, days,
    lastPush: { name: "some-cool-project", at: new Date().toISOString() },
    langs: [
      { name: "JavaScript", size: 52, color: "#f1e05a" }, { name: "TypeScript", size: 21, color: "#3178c6" },
      { name: "C", size: 11, color: "#555555" }, { name: "C++", size: 7, color: "#f34b7d" },
      { name: "CSS", size: 5, color: "#663399" }, { name: "Python", size: 3, color: "#3572A5" },
      { name: "Shell", size: 1, color: "#89e051" },
    ],
  };
}

// ---------------------------------------------------------------- render

const esc = (s) => String(s).replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
const plural = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;
const clip = (s, n) => (s.length > n ? s.slice(0, n - 1) + "…" : s);
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const shortDate = (iso) => { const d = new Date(iso); return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`; };

function render(d) {
  const W = 900, H = 470;
  const now = new Date();
  const uptime = now.getUTCFullYear() - d.since;
  const { current, longest } = streaks(d.days);

  const mug = [
    "      ( (       ",
    "       ) )      ",
    "    ........    ",
    "    |      |]   ",
    "    \\      /    ",
    "     `----'     ",
    "   coffee.ko    ",
  ];

  const left = [
    ["OS", "SarveshOS 20.05"],
    ["Host", `github.com/${d.login}`],
    ["Uptime", `${plural(uptime, "yr")} (since ${d.since})`],
    ["Repos", `${d.repos} public`],
    ["Stars", `${d.stars} ★ earned`],
    ["Followers", `${d.followers}`],
  ];
  const right = [
    ["Commits", `${d.commitsYear} (last 12 mo)`],
    ["Contribs", `${d.contribYear} (last 12 mo)`],
    ["PRs/Issues", `${d.prs} / ${d.issues}`],
    ["Streak", current > 0 ? plural(current, "day") : "0 days · brewing"],
    ["Best", `${plural(longest, "day")} (12 mo)`],
    ["Last push", d.lastPush ? `${clip(d.lastPush.name, 12)} ·${shortDate(d.lastPush.at)}` : "—"],
  ];

  // ---- language bar
  const total = d.langs.reduce((s, l) => s + l.size, 0) || 1;
  let top = d.langs.slice(0, 6);
  const rest = d.langs.slice(6).reduce((s, l) => s + l.size, 0);
  if (rest > 0) top = [...top, { name: "Other", size: rest, color: "#6e7681" }];
  const barX = 300, barW = 570, barY = 316;
  let x = barX;
  const segs = top.map((l) => {
    const w = (l.size / total) * barW;
    const r = `<rect x="${x.toFixed(2)}" y="${barY}" width="${w.toFixed(2)}" height="10" fill="${esc(l.color)}"/>`;
    x += w;
    return r;
  }).join("");
  const legend = top.map((l, i) => {
    const col = i % 3, row = Math.floor(i / 3);
    const lx = barX + col * 190, ly = barY + 36 + row * 22;
    const pct = ((l.size / total) * 100).toFixed(1);
    return `<circle cx="${lx + 5}" cy="${ly - 4}" r="5" fill="${esc(l.color)}"/>` +
      `<text class="t" x="${lx + 16}" y="${ly}">${esc(l.name)} <tspan class="d">${pct}%</tspan></text>`;
  }).join("");

  // ---- contribution heatmap (last HEAT_WEEKS weeks, columns = weeks, rows = weekdays)
  const HEAT = ["#161b22", "#0e4429", "#006d32", "#26a641", "#39d353"];
  const cell = 11, gap = 0;
  const hx = 24, hy = 290;
  const recent = d.days.slice(-HEAT_WEEKS * 7);
  const firstDow = recent.length ? new Date(recent[0].date + "T00:00:00Z").getUTCDay() : 0;
  const heat = recent.map((day, i) => {
    const pos = i + firstDow;
    const col = Math.floor(pos / 7), row = pos % 7;
    return `<rect class="c" x="${hx + col * cell + gap}" y="${hy + row * cell}" width="9" height="9" rx="2" fill="${HEAT[day.level]}" style="animation-delay:${(0.9 + col * 0.05).toFixed(2)}s"><title>${day.date}: ${day.count}</title></rect>`;
  }).join("");
  const heatScale = HEAT.map((c, i) => `<rect x="${hx + 150 + i * 13}" y="${hy + 86}" width="9" height="9" rx="2" fill="${c}"/>`).join("");

  const palette = ["#f85149", "#d29922", "#3fb950", "#58a6ff", "#bc8cff", "#39c5cf", "#f0f6fc", "#6e7681"]
    .map((c, i) => `<rect x="${300 + i * 26}" y="262" width="22" height="14" rx="2" fill="${c}"/>`).join("");

  const delay = (i) => `style="animation-delay:${(0.15 + i * 0.1).toFixed(2)}s"`;
  const header = `${esc(d.login)}@hairless-ape`;
  const row = ([k, v], i, xx, di) =>
    `<text class="t l" x="${xx}" y="${140 + i * 20}" ${delay(di)}><tspan class="k">${esc(k)}</tspan><tspan class="d">:</tspan> ${esc(v)}</text>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="GitHub stats for ${esc(d.login)}: ${d.contribYear} contributions in the last year, current streak ${current} days, longest ${longest} days">
<title>${esc(d.login)} — neofetch</title>
<style>
  .t { font-family: 'JetBrains Mono','Fira Code','Cascadia Code',Consolas,'Courier New',monospace; font-size: 14px; fill: #c9d1d9; white-space: pre; }
  .k { fill: #3fb950; font-weight: 700; }
  .d { fill: #6e7681; }
  .h { fill: #f0f6fc; font-weight: 700; }
  .a { fill: #d29922; font-weight: 700; }
  .l, .c { opacity: 0; animation: on .3s ease-out forwards; }
  @keyframes on { from { opacity: 0; } to { opacity: 1; } }
  .steam { animation: rise 2.4s ease-in-out infinite; }
  @keyframes rise { 0%,100% { opacity: .35; transform: translateY(0); } 50% { opacity: 1; transform: translateY(-3px); } }
</style>
<rect width="${W}" height="${H}" rx="12" fill="#0d1117"/>
<rect width="${W}" height="34" rx="12" fill="#161b22"/><rect y="22" width="${W}" height="12" fill="#161b22"/>
<circle cx="20" cy="17" r="6" fill="#f85149"/><circle cx="40" cy="17" r="6" fill="#d29922"/><circle cx="60" cy="17" r="6" fill="#3fb950"/>
<text x="${W / 2}" y="22" text-anchor="middle" class="t d" style="font-size:12px">${header}: ~ — neofetch</text>

<text class="t" x="24" y="66"><tspan class="k">${header}</tspan><tspan class="d">:</tspan><tspan fill="#58a6ff">~</tspan><tspan class="d">$</tspan> neofetch</text>

${mug.map((line, i) => `<text class="t a${i < 2 ? " steam" : ""}" x="40" y="${106 + i * 20}">${esc(line)}</text>`).join("\n")}

<text class="t d" x="${hx}" y="${hy - 12}" style="font-size:12px">last ${HEAT_WEEKS} weeks</text>
${heat}
<text class="t d" x="${hx + 112}" y="${hy + 94}" style="font-size:11px">less</text>${heatScale}<text class="t d" x="${hx + 218}" y="${hy + 94}" style="font-size:11px">more</text>

<text class="t h l" x="300" y="100" ${delay(0)}>${header}</text>
<text class="t d l" x="300" y="116" ${delay(0)}>${"─".repeat(header.length)}</text>
${left.map((r, i) => row(r, i, 300, i + 1)).join("\n")}
${right.map((r, i) => row(r, i, 590, i + 7)).join("\n")}

<g class="l" ${delay(13)}>${palette}</g>

<text class="t d l" x="300" y="304" ${delay(14)}>languages by bytes</text>
<g class="l" ${delay(15)}>
<clipPath id="bar"><rect x="${barX}" y="${barY}" width="${barW}" height="10" rx="5"/></clipPath>
<g clip-path="url(#bar)">${segs}</g>
${legend}
</g>

<text class="t d" x="${W - 24}" y="${H - 14}" text-anchor="end" style="font-size:11px">regenerated ${now.toISOString().slice(0, 10)} by a GitHub Action · no third-party servers were harmed</text>
</svg>
`;
}

const data = process.argv.includes("--mock") ? mockData() : await fetchData();
mkdirSync("assets", { recursive: true });
writeFileSync(OUT, render(data));
console.log(`wrote ${OUT}`, { ...streaks(data.days), lastPush: data.lastPush?.name, langs: data.langs.length });
