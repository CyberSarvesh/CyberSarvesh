// Generates assets/neofetch.svg from your GitHub data.
// Runs inside GitHub Actions (see .github/workflows/stats.yml). No dependencies.
// Local preview without a token:  node scripts/stats.mjs --mock

import { writeFileSync, mkdirSync } from "node:fs";

const LOGIN = process.env.GH_LOGIN || "cybersarvesh";
const TOKEN = process.env.GITHUB_TOKEN;
const OUT = "assets/neofetch.svg";

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
    contributionsCollection {
      totalCommitContributions
      restrictedContributionsCount
      contributionCalendar { totalContributions }
    }
  }
}`;

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
    langs: [...langs.entries()].map(([name, v]) => ({ name, ...v })).sort((a, b) => b.size - a.size),
  };
}

const MOCK = {
  login: "cybersarvesh", since: 2023, repos: 24, stars: 37, followers: 18, prs: 41, issues: 9,
  commitsYear: 214, contribYear: 266,
  langs: [
    { name: "JavaScript", size: 52, color: "#f1e05a" }, { name: "TypeScript", size: 21, color: "#3178c6" },
    { name: "C", size: 11, color: "#555555" }, { name: "C++", size: 7, color: "#f34b7d" },
    { name: "CSS", size: 5, color: "#663399" }, { name: "Python", size: 3, color: "#3572A5" },
    { name: "Shell", size: 1, color: "#89e051" },
  ],
};

const esc = (s) => String(s).replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));

function render(d) {
  const W = 900, H = 440;
  const mug = [
    "      ( (       ",
    "       ) )      ",
    "    ........    ",
    "    |      |]   ",
    "    \\      /    ",
    "     `----'     ",
    "                ",
    "   coffee.ko    ",
  ];

  const now = new Date();
  const uptime = now.getUTCFullYear() - d.since;
  const rows = [
    ["OS", `SarveshOS 20.05`],
    ["Host", `github.com/${d.login}`],
    ["Uptime", `${uptime} yr${uptime === 1 ? "" : "s"} (since ${d.since})`],
    ["Repos", `${d.repos} public`],
    ["Stars", `${d.stars} ★ earned`],
    ["Commits", `${d.commitsYear} (last 12 mo)`],
    ["Contribs", `${d.contribYear} (last 12 mo)`],
    ["PRs / Issues", `${d.prs} / ${d.issues}`],
    ["Followers", `${d.followers}`],
    ["Shell", `bash < /dev/coffee`],
  ];

  const total = d.langs.reduce((s, l) => s + l.size, 0) || 1;
  let top = d.langs.slice(0, 6);
  const rest = d.langs.slice(6).reduce((s, l) => s + l.size, 0);
  if (rest > 0) top = [...top, { name: "Other", size: rest, color: "#6e7681" }];

  const barX = 300, barW = 560, barY = 300;
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

  const palette = ["#f85149", "#d29922", "#3fb950", "#58a6ff", "#bc8cff", "#39c5cf", "#f0f6fc", "#6e7681"]
    .map((c, i) => `<rect x="${300 + i * 26}" y="250" width="22" height="14" rx="2" fill="${c}"/>`).join("");

  const delay = (i) => `style="animation-delay:${(0.15 + i * 0.12).toFixed(2)}s"`;
  const header = `${esc(d.login)}@hairless-ape`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="GitHub stats for ${esc(d.login)}">
<title>${esc(d.login)} — neofetch</title>
<style>
  .t { font-family: 'JetBrains Mono','Fira Code','Cascadia Code',Consolas,'Courier New',monospace; font-size: 14px; fill: #c9d1d9; white-space: pre; }
  .k { fill: #3fb950; font-weight: 700; }
  .d { fill: #6e7681; }
  .h { fill: #f0f6fc; font-weight: 700; }
  .a { fill: #d29922; font-weight: 700; }
  .l { opacity: 0; animation: on .25s ease-out forwards; }
  @keyframes on { from { opacity: 0; transform: translateX(-6px); } to { opacity: 1; transform: none; } }
  .steam { animation: rise 2.4s ease-in-out infinite; }
  @keyframes rise { 0%,100% { opacity: .35; transform: translateY(0); } 50% { opacity: 1; transform: translateY(-3px); } }
</style>
<rect width="${W}" height="${H}" rx="12" fill="#0d1117"/>
<rect width="${W}" height="34" rx="12" fill="#161b22"/><rect y="22" width="${W}" height="12" fill="#161b22"/>
<circle cx="20" cy="17" r="6" fill="#f85149"/><circle cx="40" cy="17" r="6" fill="#d29922"/><circle cx="60" cy="17" r="6" fill="#3fb950"/>
<text x="${W / 2}" y="22" text-anchor="middle" class="t d" style="font-size:12px">${header}: ~ — neofetch</text>

<text class="t" x="24" y="66"><tspan class="k">${header}</tspan><tspan class="d">:</tspan><tspan fill="#58a6ff">~</tspan><tspan class="d">$</tspan> neofetch</text>

${mug.map((line, i) => `<text class="t a${i < 2 ? " steam" : ""}" x="40" y="${110 + i * 20}">${esc(line)}</text>`).join("\n")}

<text class="t h l" x="300" y="100" ${delay(0)}>${header}</text>
<text class="t d l" x="300" y="116" ${delay(0)}>${"─".repeat(header.length)}</text>
${rows.map(([k, v], i) => `<text class="t l" x="300" y="${138 + i * 20 - (i > 4 ? 0 : 0)}" ${delay(i + 1)}><tspan class="k">${esc(k)}</tspan><tspan class="d">:</tspan> ${esc(v)}</text>`).slice(0, 5).join("\n")}
${rows.slice(5).map(([k, v], i) => `<text class="t l" x="600" y="${138 + i * 20}" ${delay(i + 6)}><tspan class="k">${esc(k)}</tspan><tspan class="d">:</tspan> ${esc(v)}</text>`).join("\n")}

<g class="l" ${delay(11)}>${palette}</g>

<text class="t d l" x="300" y="290" ${delay(12)}>languages by bytes</text>
<g class="l" ${delay(13)}>
<clipPath id="bar"><rect x="${barX}" y="${barY}" width="${barW}" height="10" rx="5"/></clipPath>
<g clip-path="url(#bar)">${segs}</g>
${legend}
</g>

<text class="t d" x="${W - 24}" y="${H - 14}" text-anchor="end" style="font-size:11px">regenerated ${now.toISOString().slice(0, 10)} by a GitHub Action · no third-party servers were harmed</text>
</svg>
`;
}

const data = process.argv.includes("--mock") ? MOCK : await fetchData();
mkdirSync("assets", { recursive: true });
writeFileSync(OUT, render(data));
console.log(`wrote ${OUT}`, { ...data, langs: data.langs.length });
