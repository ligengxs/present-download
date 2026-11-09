/**
 * Host half of the present-download bundle: serves one presented file's bytes
 * as a browser download, reusing the Session coordinates the delivery card
 * already carries (sessionId / seq / index) without requiring a Host desktop.
 */

/** Authenticated GET route serving a declared file's bytes as an attachment. */
const PRESENT_DOWNLOAD_PATH = "/api/present.download";

const NUMERIC = /^\d+$/;

function coordinate(value) {
  return value !== null && NUMERIC.test(value) && Number.isSafeInteger(Number(value)) ? Number(value) : undefined;
}

/** Trailing path segment, the part that identifies the file at a glance. */
function basename(path) {
  const at = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  return at === -1 ? path : path.slice(at + 1);
}

/** Whether the value is a valid presented-file declaration. */
function isPresentedFile(value) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const { path, description } = value;
  return typeof path === "string" && path.trim().length > 0 && (description === undefined || typeof description === "string");
}

/** Whether the value is a valid deliverables/presented event payload. */
function isPresentedData(value) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const { turn, callId, files } = value;
  return typeof turn === "number" && Number.isSafeInteger(turn) && turn >= 1 && typeof callId === "string" && callId.length > 0 && Array.isArray(files);
}

/** Walk the error cause chain for the first stable code. */
function errorCodeOf(error) {
  for (let e = error; e; e = e && e.cause) {
    if (e && typeof e === "object" && typeof e.code === "string") return e.code;
  }
  return undefined;
}

/** Translate lookup and filesystem failures into the status the browser can act on. */
function failureStatus(error) {
  const code = errorCodeOf(error);
  if (
    code === "session/not-found" ||
    code === "SESSION_QUERY_SESSION_NOT_FOUND" ||
    code === "SESSION_QUERY_EVENT_NOT_FOUND" ||
    code === "workspace-file/not-found" ||
    code === "workspace-file/not-regular-file" ||
    code === "ENOENT" ||
    code === "ENOTDIR"
  ) return 404;
  if (code === "workspace-file/too-large") return 413;
  return 500;
}

/** Content-Disposition with both plain and RFC 5987 forms for maximum client compatibility. */
function contentDisposition(name) {
  const star = `filename*=UTF-8''${encodeURIComponent(name)}`;
  const plainSafe = /^[\x20-\x7e]+$/.test(name) && !/["\\]/.test(name);
  const plain = plainSafe ? name : "download";
  return `attachment; filename="${plain}"; ${star}`;
}

/** Read one delivered file's bytes and return them as a download response. */
async function handlePresentDownload(ctx, request) {
  const query = new URL(request.url).searchParams;
  const id = query.get("sessionId");
  const seq = coordinate(query.get("seq"));
  const index = coordinate(query.get("index"));
  if (!id || seq === undefined || index === undefined) {
    return new Response("Invalid Presented file coordinates.", { status: 400 });
  }
  try {
    const { target, session } = await ctx.sessionQuery.readEvent(
      { sessionId: id, seq, before: 0, after: 0 },
      request.signal
    );
    const file =
      target.type === "deliverables/presented" && isPresentedData(target.data)
        ? target.data.files[index]
        : undefined;
    if (!isPresentedFile(file)) {
      return new Response("Presented file not found in this Session result.", { status: 404 });
    }
    const name = basename(file.path);
    const headers = {
      "content-type": "application/octet-stream",
      "content-disposition": contentDisposition(name),
      "cache-control": "no-store"
    };

    // HEAD reports the filename without reading the bytes, so the browser can
    // name the download before it fetches the body.
    if (request.method === "HEAD") {
      return new Response(null, { status: 200, headers });
    }

    request.signal.throwIfAborted();
    const result = await ctx.workspaceFiles.readBytes(
      { sessionId: id, workspaceRoot: session.cwd ?? ctx.sandboxPolicy.workspaceRoot },
      file.path,
      {},
      request.signal
    );
    return new Response(result.data, {
      status: 200,
      headers: { ...headers, "content-length": String(result.data.byteLength) }
    });
  } catch (error) {
    request.signal.throwIfAborted();
    return new Response("Presented file unavailable.", { status: failureStatus(error) });
  }
}

/** Register the download route inside Connection's authentication fence. */
function apply(ctx) {
  ctx.connection.fetch.register({
    path: PRESENT_DOWNLOAD_PATH,
    methods: ["GET", "HEAD"],
    requestBody: "buffered",
    fetch: (request) => handlePresentDownload(ctx, request)
  });
}

export { apply };
export const inject = ["connection", "sessionQuery", "workspaceFiles", "sandboxPolicy"];
