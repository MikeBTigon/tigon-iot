const S3_BASE = "https://s3.amazonaws.com/prod.docs.s3/carts/";

export default {
  async fetch(request) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS"
      }});
    }
    const file = url.searchParams.get("file") || "";
    const dl = (url.searchParams.get("name") || file).replace(/[\/\\:*?"<>|]+/g, "");
    if (!/^[A-Za-z0-9._-]+\.(jpg|jpeg|png|webp)$/i.test(file)) {
      return new Response("bad file", { status: 400 });
    }
    const upstream = await fetch(S3_BASE + file);
    const headers = new Headers();
    headers.set("Content-Type", upstream.headers.get("content-type") || "image/jpeg");
    headers.set("Content-Disposition", `attachment; filename="${dl}"`);
    headers.set("Access-Control-Allow-Origin", "*");
    headers.set("Cache-Control", "public, max-age=3600");
    return new Response(upstream.body, { status: 200, headers });
  }
};
