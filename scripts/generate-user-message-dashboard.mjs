import { execFile } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

const outputPath = join(process.cwd(), "dashboard.html");
const execFileAsync = promisify(execFile);

const userMessageQuery = `
  with player_messages as (
    select
      campaign_id,
      payload ->> 'clientId' as client_id
    from campaign_events
    where type = 'turn_submitted'
      and payload ->> 'role' = 'player'
      and btrim(coalesce(payload ->> 'content', '')) <> ''
  ),
  user_message_counts as (
    select
      users.id::text as user_id,
      users.email,
      users.display_name,
      users.created_at::text,
      count(player_messages.client_id)::integer as player_message_count
    from users
    left join players
      on players.user_id = users.id
    left join player_messages
      on player_messages.campaign_id = players.campaign_id
      and player_messages.client_id = players.client_id
    group by users.id, users.email, users.display_name, users.created_at
  )
  select coalesce(
    json_agg(user_message_counts order by created_at desc, user_id desc),
    '[]'::json
  )::text as users
  from user_message_counts
`;

function shellQuote(value) {
  return `'${value.replaceAll("'", "'\\\"'\\\"'")}'`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function renderDashboard(rows, generatedAt) {
  const userRows = rows
    .map(
      (row) => `
        <tr>
          <td>${escapeHtml(row.display_name || "—")}</td>
          <td>${escapeHtml(row.email)}</td>
          <td data-sort="${escapeHtml(row.created_at)}">${escapeHtml(
            new Date(row.created_at).toLocaleString()
          )}</td>
          <td class="count" data-sort="${row.player_message_count}">${row.player_message_count}</td>
        </tr>`
    )
    .join("");

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>AI Taverns user messages</title>
    <style>
      :root { color-scheme: dark; font-family: Inter, ui-sans-serif, system-ui, sans-serif; }
      body { margin: 0; min-width: 720px; background: #101114; color: #f4f4f5; }
      main { max-width: 1120px; margin: 0 auto; padding: 48px 32px; }
      h1 { margin: 0; font-size: 30px; }
      .subtitle { color: #a1a1aa; margin: 8px 0 28px; }
      .summary { display: flex; gap: 12px; margin-bottom: 20px; }
      .pill { border: 1px solid #30323a; border-radius: 999px; padding: 7px 12px; color: #d4d4d8; }
      input { box-sizing: border-box; width: 100%; padding: 12px 14px; margin-bottom: 16px; border: 1px solid #3f3f46; border-radius: 8px; background: #18181b; color: inherit; }
      table { width: 100%; border-collapse: collapse; background: #18181b; border: 1px solid #30323a; border-radius: 10px; overflow: hidden; }
      th, td { padding: 14px 16px; border-bottom: 1px solid #30323a; text-align: left; }
      th { color: #a1a1aa; font-size: 12px; letter-spacing: .04em; text-transform: uppercase; }
      tr:last-child td { border-bottom: 0; }
      tr:hover td { background: #22232a; }
      .count { font-variant-numeric: tabular-nums; font-weight: 700; color: #c4b5fd; }
      footer { color: #71717a; font-size: 12px; margin-top: 14px; }
    </style>
  </head>
  <body>
    <main>
      <h1>Users and player messages</h1>
      <p class="subtitle">Newest accounts first. A message is a non-empty <code>turn_submitted</code> player event recorded in Postgres.</p>
      <div class="summary">
        <span class="pill">${rows.length} users</span>
        <span class="pill">${rows.reduce((total, row) => total + row.player_message_count, 0)} player messages</span>
      </div>
      <input id="search" type="search" placeholder="Filter by name or email" autofocus />
      <table>
        <thead><tr><th>Name</th><th>Email</th><th>Created</th><th>Messages sent</th></tr></thead>
        <tbody id="users">${userRows}</tbody>
      </table>
      <footer>Generated locally from Postgres at ${escapeHtml(generatedAt)}. Re-run <code>npm run dashboard:users</code> to refresh.</footer>
    </main>
    <script>
      const search = document.querySelector("#search");
      const users = [...document.querySelectorAll("#users tr")];
      search.addEventListener("input", () => {
        const query = search.value.trim().toLowerCase();
        users.forEach((row) => { row.hidden = !row.textContent.toLowerCase().includes(query); });
      });
    </script>
  </body>
</html>`;
}

async function productionUsers() {
  const containerCommand = [
    'psql --username="$POSTGRES_USER" --dbname="$POSTGRES_DB"',
    '--tuples-only --no-align',
    `--command ${shellQuote(userMessageQuery)}`
  ].join(" ");
  const remoteCommand =
    "cd /opt/ai-taverns && " +
    "docker compose --env-file infra/production.env -f infra/docker-compose.production.yml " +
    `exec -T postgres sh -lc ${shellQuote(containerCommand)}`;
  const { stdout } = await execFileAsync(
    "npm",
    ["run", "droplet:one-time-access", "--", "sh", "-lc", remoteCommand],
    { cwd: process.cwd(), maxBuffer: 5 * 1024 * 1024 }
  );
  const json = stdout.trim().split(/\r?\n/).at(-1);

  if (!json) {
    throw new Error("Production database query returned no data.");
  }

  return JSON.parse(json);
}

try {
  const rows = await productionUsers();
  const generatedAt = new Date().toISOString();
  await writeFile(outputPath, renderDashboard(rows, generatedAt), "utf8");
  console.log(`Wrote ${outputPath} with ${rows.length} production users.`);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Could not generate the production dashboard: ${message}`);
  process.exitCode = 1;
}
