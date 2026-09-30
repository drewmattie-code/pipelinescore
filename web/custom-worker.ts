// Wraps the OpenNext worker to answer byte-range requests for /video/*.
//
// Workers static assets ignore the Range header and always return the whole
// file with a 200. Safari and every iPhone browser refuse to play an mp4 that
// way (they probe with "Range: bytes=0-1" and need a 206), so the homepage
// video showed only its poster there. wrangler.jsonc sends /video/* here first
// (assets.run_worker_first); everything else still goes straight to the assets
// layer or the Next handler. The files are a few MB, so slicing in memory is fine.

// eslint-disable-next-line @typescript-eslint/ban-ts-comment -- the import only exists after the OpenNext build
// @ts-ignore `.open-next/worker.js` is generated at build time
import { default as handler } from "./.open-next/worker.js";

type Env = { ASSETS: { fetch: (request: Request) => Promise<Response> } };

const worker = {
  async fetch(request: Request, env: Env, ctx: unknown): Promise<Response> {
    const url = new URL(request.url);
    if (!url.pathname.startsWith("/video/")) return handler.fetch(request, env, ctx);

    const asset = await env.ASSETS.fetch(new Request(url, { method: "GET" }));
    if (!asset.ok) return asset;
    const headers = new Headers(asset.headers);
    headers.set("Accept-Ranges", "bytes");
    const range = request.headers.get("Range");
    if (!range) return new Response(request.method === "HEAD" ? null : asset.body, { status: 200, headers });

    const body = await asset.arrayBuffer();
    const size = body.byteLength;
    const match = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
    let start = match && match[1] !== "" ? Number(match[1]) : NaN;
    let end = match && match[2] !== "" ? Number(match[2]) : size - 1;
    if (match && match[1] === "" && match[2] !== "") {
      // "bytes=-N": the last N bytes
      start = Math.max(0, size - Number(match[2]));
      end = size - 1;
    }
    end = Math.min(end, size - 1);
    if (!match || Number.isNaN(start) || start > end || start >= size) {
      headers.set("Content-Range", `bytes */${size}`);
      headers.delete("Content-Length");
      return new Response(null, { status: 416, headers });
    }
    headers.set("Content-Range", `bytes ${start}-${end}/${size}`);
    headers.set("Content-Length", String(end - start + 1));
    return new Response(request.method === "HEAD" ? null : body.slice(start, end + 1), { status: 206, headers });
  },
};

export default worker;

// eslint-disable-next-line @typescript-eslint/ban-ts-comment -- see above
// @ts-ignore see above
export { DOQueueHandler, DOShardedTagCache, BucketCachePurge } from "./.open-next/worker.js";
