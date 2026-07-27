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

// Norway follows EU DST rules: CEST (+2h) from the last Sunday of March
// to the last Sunday of October, CET (+1h) otherwise. The app doesn't
// track exact clock time, so this is only used for a reasonable midday
// timestamp, not precision timing.
function osloUtcOffsetSeconds(dateStr){
  const d = new Date(dateStr + "T12:00:00Z");
  const year = d.getUTCFullYear();
  function lastSundayUTC(y, monthIndex){
    const last = new Date(Date.UTC(y, monthIndex + 1, 0));
    last.setUTCDate(last.getUTCDate() - last.getUTCDay());
    last.setUTCHours(1, 0, 0, 0);
    return last;
  }
  const dstStart = lastSundayUTC(year, 2);
  const dstEnd = lastSundayUTC(year, 9);
  const isDST = d >= dstStart && d < dstEnd;
  return isDST ? 7200 : 3600;
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
  const sets = Array.isArray(body.sets) ? body.sets : [];

  if(!name || !date || !elapsedMinutes){
    return jsonResponse({ error: "missing_fields" }, 400);
  }

  let accessToken;
  try{
    accessToken = await getFreshAccessToken(env);
  }catch(e){
    return jsonResponse({ error: e.message }, 401);
  }

  // Time-of-day isn't tracked by the app, but reusing a fixed placeholder
  // (e.g. always noon) makes every send for the same date+duration look
  // like the same activity to Strava's duplicate detection, silently
  // dropping later sends. Use the actual moment of sending instead —
  // still the right calendar date, but never identical twice.
  const now = new Date();
  const sendTime = String(now.getUTCHours()).padStart(2, "0") + ":" +
    String(now.getUTCMinutes()).padStart(2, "0") + ":" +
    String(now.getUTCSeconds()).padStart(2, "0");

  const workoutJson = {
    version: "1.0",
    start_time: date + "T" + sendTime + "Z",
    utc_offset: osloUtcOffsetSeconds(date),
    elapsed_time: Math.round(elapsedMinutes * 60),
    creator: { name: "Treningslogg" },
    sets: sets.map(function(s){
      const set = { exercise_type: s.exerciseType };
      if(s.weight != null) set.weight = s.weight;
      if(s.reps != null) set.repetitions = s.reps;
      return set;
    })
  };

  // external_id must be unique per upload — Strava treats a repeated
  // external_id (which defaults to the file's name if not set) as a
  // duplicate of a previous upload and won't create a new activity.
  const externalId = "treningslogg-" + date + "-" + Date.now();

  const form = new FormData();
  form.append("data_type", "json");
  form.append("sport_type", "WeightTraining");
  form.append("name", name);
  form.append("external_id", externalId);
  if(description) form.append("description", description);
  form.append("file", new Blob([JSON.stringify(workoutJson)], { type: "application/json" }), externalId + ".json");

  const uploadRes = await fetch("https://www.strava.com/api/v3/uploads", {
    method: "POST",
    headers: { "Authorization": "Bearer " + accessToken },
    body: form
  });
  const uploadData = await uploadRes.json();
  if(!uploadRes.ok){
    return jsonResponse({ error: "strava_upload_error", detail: uploadData }, 502);
  }

  // Strava processes uploads asynchronously and it can take several
  // seconds — don't hold the client's connection open waiting for it
  // (mobile Safari/PWA drops long-running fetches). Respond immediately;
  // the activity shows up on Strava shortly after.
  return jsonResponse({ ok: true, pending: true, uploadId: uploadData.id }, 200);
}

async function handleUploadStatus(request, url, env){
  const appToken = request.headers.get("X-App-Token");
  if(!env.APP_TOKEN || appToken !== env.APP_TOKEN){
    return jsonResponse({ error: "unauthorized" }, 401);
  }
  const id = url.searchParams.get("id");
  if(!id) return jsonResponse({ error: "missing_id" }, 400);
  let accessToken;
  try{
    accessToken = await getFreshAccessToken(env);
  }catch(e){
    return jsonResponse({ error: e.message }, 401);
  }
  const res = await fetch("https://www.strava.com/api/v3/uploads/" + id, {
    headers: { "Authorization": "Bearer " + accessToken }
  });
  const data = await res.json();
  return jsonResponse(data, res.status);
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
    if(url.pathname === "/upload-status" && request.method === "GET"){
      return handleUploadStatus(request, url, env);
    }
    return jsonResponse({ error: "not_found" }, 404);
  }
};
