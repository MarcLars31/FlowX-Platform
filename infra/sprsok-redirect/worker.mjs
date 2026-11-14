// sprsøk.no uses ø. URL.hostname represents this internationalized domain in ASCII.
const legacyHosts = new Set(["xn--sprsk-yua.no", "www.xn--sprsk-yua.no"]);
const searchParameters = ["q", "leverandor", "type", "utforelse", "k_verdi", "rti", "sort", "dir", "page"];

export default {
  fetch(request) {
    const incoming = new URL(request.url);
    if (!legacyHosts.has(incoming.hostname)) return new Response("Not found", { status: 404 });
    if (!["GET", "HEAD"].includes(request.method)) return new Response("Method not allowed", { status: 405, headers: { Allow: "GET, HEAD" } });
    const target = new URL("https://www.scipx.ai/sprsok");
    // Preserve supported search links. Never carry old auth tokens, redirect
    // destinations, or arbitrary paths into the new application.
    for (const key of searchParameters) {
      const value = incoming.searchParams.get(key);
      if (value) target.searchParams.set(key, value.slice(0, 200));
    }
    return new Response(null, { status: 301, headers: { Location: target.href, "Cache-Control": "public, max-age=300" } });
  }
};
