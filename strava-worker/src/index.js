const ALLOWED_ORIGIN = "https://kricliff.github.io";

function corsHeaders(){
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type,X-App-Token"
  };
}

function jsonResponse(obj, status){
  return new Response(JSON.stringify(obj), { status, headers: { ...corsHeaders(), "Content-Type": "application/json" } });
}

function htmlResponse(html, status){
  return new Response(
    `<!doctype html><html><body style="font-family:sans-serif;text-align:center;padding:40px;">${html}</body></html>`,
    { status: status || 200, headers: { ...corsHeaders(), "Content-Type": "text/html; charset=utf-8" } }
  );
}

function escapeHtml(s){
  return String(s).replace(/[&<>"']/g, function(c){
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
  });
}

async function exchangeToken(env, params){
  const res = await fetch("https://www.strava.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(Object.assign({
      client_id: env.STRAVA_CLIENT_ID,
      client_secret: env.STRAVA_CLIENT_SECRET
    }, params))
  });
  const data = await res.json();
  if(!res.ok) throw new Error(JSON.stringify(data));
  return data;
}

async function handleCallback(url, env){
  const error = url.searchParams.get("error");
  if(error){
    return htmlResponse("<h1>Tilkobling avbrutt</h1><p>" + escapeHtml(error) + "</p>");
  }
  const code = url.searchParams.get("code");
  if(!code){
    return htmlResponse("<h1>Mangler kode fra Strava</h1>", 400);
  }
  let tokenData;
  try{
    tokenData = await exchangeToken(env, { code: code, grant_type: "authorization_code" });
  }catch(e){
    return htmlResponse("<h1>Feil ved token-utveksling</h1><pre>" + escapeHtml(e.message) + "</pre>", 500);
  }
  await env.STRAVA_KV.put("refresh_token", tokenData.refresh_token);
  const athleteName = tokenData.athlete
    ? [tokenData.athlete.firstname, tokenData.athlete.lastname].filter(Boolean).join(" ")
    : "";
  await env.STRAVA_KV.put("athlete_name", athleteName);
  return htmlResponse("<h1>✅ Strava tilkoblet" + (athleteName ? ", " + escapeHtml(athleteName) : "") + "!</h1><p>Du kan lukke denne fanen og gå tilbake til treningsappen.</p>");
}

async function getFreshAccessToken(env){
  const refreshToken = await env.STRAVA_KV.get("refresh_token");
  if(!refreshToken){
    var err = new Error("not_connected");
    throw err;
  }
  const data = await exchangeToken(env, { grant_type: "refresh_token", refresh_token: refreshToken });
  await env.STRAVA_KV.put("refresh_token", data.refresh_token);
  return data.access_token;
}

async function handleSendActivity(request, env){
  const appToken = request.headers.get("X-App-Token");
  if(!env.APP_TOKEN || appToken !== env.APP_TOKEN){
    return jsonResponse({ error: "unauthorized" }, 401);
  }

  let body;
  try{
    body = await request.json();
  }catch(e){
    return jsonResponse({ error: "bad_json" }, 400);
  }

  const name = body.name;
  const date = body.date;
  const elapsedMinutes = body.elapsedMinutes;
  const description = body.description || "";

  if(!name || !date || !elapsedMinutes){
    return jsonResponse({ error: "missing_fields" }, 400);
  }

  let accessToken;
  try{
    accessToken = await getFreshAccessToken(env);
  }catch(e){
    return jsonResponse({ error: e.message }, 401);
  }

  const activityRes = await fetch("https://www.strava.com/api/v3/activities", {
    method: "POST",
    headers: {
      "Authorization": "Bearer " + accessToken,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      name: name,
      type: "WeightTraining",
      start_date_local: date + "T12:00:00",
      elapsed_time: Math.round(elapsedMinutes * 60),
      description: description,
      trainer: 0
    })
  });

  const activityData = await activityRes.json();
  if(!activityRes.ok){
    return jsonResponse({ error: "strava_error", detail: activityData }, 502);
  }
  return jsonResponse({ ok: true, activityId: activityData.id }, 200);
}

async function handleStatus(env){
  const refreshToken = await env.STRAVA_KV.get("refresh_token");
  const athleteName = await env.STRAVA_KV.get("athlete_name");
  return jsonResponse({ connected: !!refreshToken, athlete: athleteName || null }, 200);
}

export default {
  async fetch(request, env){
    const url = new URL(request.url);

    if(request.method === "OPTIONS"){
      return new Response(null, { headers: corsHeaders() });
    }
    if(url.pathname === "/callback" && request.method === "GET"){
      return handleCallback(url, env);
    }
    if(url.pathname === "/send-activity" && request.method === "POST"){
      return handleSendActivity(request, env);
    }
    if(url.pathname === "/status" && request.method === "GET"){
      return handleStatus(env);
    }
    return jsonResponse({ error: "not_found" }, 404);
  }
};
