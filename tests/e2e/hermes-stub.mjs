import { createServer } from "node:http";

const port = Number(process.argv[2] ?? process.env.E2E_HERMES_PORT ?? 18642);
const sessions = new Map();

function readJson(request) {
  return new Promise((resolve, reject) => {
    let body = "";

    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      body += chunk;
    });
    request.on("end", () => {
      if (!body.trim()) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(error);
      }
    });
  });
}

function send(response, status, data) {
  response.writeHead(status, {
    "Content-Type": "application/json"
  });
  response.end(JSON.stringify(data));
}

function getSession(sessionId) {
  if (!sessions.has(sessionId)) {
    sessions.set(sessionId, {
      id: sessionId,
      title: sessionId,
      messages: [],
      chatCount: 0
    });
  }

  return sessions.get(sessionId);
}

function createAssistantReply(session, userMessage) {
  session.chatCount += 1;

  if (
    userMessage.includes("Party size:") ||
    userMessage.includes("The website has provided the full current party") ||
    userMessage.includes("Current party:")
  ) {
    return {
      content: "The party gathers as the archive door hums with old magic."
    };
  }

  if (userMessage.includes("AI_DND_INTERNAL_OPENING_REQUEST")) {
    return {
      content: "You stand before a sealed archive door etched with silver runes."
    };
  }

  if (userMessage.includes("Rolled Reflex save")) {
    return {
      content: "The runes flare, accept the roll, and the archive door opens."
    };
  }

  return {
    content:
      "The rune lock flashes and demands a Reflex save before anyone can proceed.",
    roll_request: {
      id: "e2e-reflex-save",
      dice: "1d20",
      modifier: 2,
      label: "Reflex save",
      player: "Test Adventurer",
      advantage_state: "normal"
    }
  };
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", `http://127.0.0.1:${port}`);
  const sessionMatch = url.pathname.match(/^\/api\/sessions\/([^/]+)(?:\/(.*))?$/);

  try {
    if (url.pathname === "/health") {
      send(response, 200, { ok: true });
      return;
    }

    if (url.pathname === "/api/sessions" && request.method === "POST") {
      const body = await readJson(request);
      const sessionId = typeof body.id === "string" ? body.id : crypto.randomUUID();
      const session = getSession(sessionId);
      session.title = typeof body.title === "string" ? body.title : session.title;
      send(response, 201, { id: sessionId });
      return;
    }

    if (url.pathname === "/api/sessions" && request.method === "GET") {
      send(response, 200, {
        data: Array.from(sessions.values()).map((session) => ({
          id: session.id,
          title: session.title,
          preview: session.messages.at(-1)?.content ?? "",
          last_active: new Date().toISOString(),
          started_at: new Date().toISOString(),
          message_count: session.messages.length
        }))
      });
      return;
    }

    if (sessionMatch && request.method === "GET" && sessionMatch[2] === "messages") {
      const session = getSession(decodeURIComponent(sessionMatch[1]));
      send(response, 200, { data: session.messages });
      return;
    }

    if (sessionMatch && request.method === "POST" && sessionMatch[2] === "chat") {
      const session = getSession(decodeURIComponent(sessionMatch[1]));
      const body = await readJson(request);
      const userMessage = typeof body.message === "string" ? body.message : "";
      const assistantReply = createAssistantReply(session, userMessage);
      const now = new Date().toISOString();
      const userRecord = {
        id: crypto.randomUUID(),
        role: "user",
        content: userMessage,
        timestamp: now
      };
      const assistantRecord = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: assistantReply.content,
        timestamp: now
      };

      session.messages.push(userRecord, assistantRecord);
      send(response, 200, {
        message: assistantRecord,
        roll_request: assistantReply.roll_request
      });
      return;
    }

    if (sessionMatch && request.method === "DELETE") {
      sessions.delete(decodeURIComponent(sessionMatch[1]));
      send(response, 200, { deleted: true, id: decodeURIComponent(sessionMatch[1]) });
      return;
    }

    send(response, 404, { error: "Not found" });
  } catch (error) {
    send(response, 500, {
      error: error instanceof Error ? error.message : "Hermes stub failed"
    });
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Hermes E2E stub listening on ${port}`);
});
