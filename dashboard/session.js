const BASE = 'https://purrcels-api.devinnovations.co.in/v1/studio/';

export function reportingZone(session, deviceZone) {
  if (deviceZone === 'Asia/Calcutta' || deviceZone === 'Asia/Kolkata') {
    // Older game servers can rewrite Kolkata to an alias absent from PostgreSQL.
    return session.databaseTimeZones === true ? 'Asia/Kolkata' : 'UTC';
  }
  return deviceZone;
}

export class StudioError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
export async function request(path, body, fetcher = fetch) {
  const options = {credentials:'include', mode:'cors', cache:'no-store', redirect:'error',
    headers:{Accept:'application/json'}};
  if (body !== undefined) {
    options.method='POST';
    options.headers['Content-Type']='application/json';
    options.body=JSON.stringify(body);
  }
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),20000);
  try {
    const response=await fetcher(BASE+path,{...options,signal:controller.signal});
    const json=await response.json().catch(()=>null);
    if (!response.ok) throw new StudioError(response.status, json?.error?.message || 'The game server could not complete this request.');
    if (!json || typeof json!=='object') throw new StudioError(503,'The game server returned an unreadable response.');
    return json;
  } catch (err) {
    if (err instanceof StudioError) throw err;
    throw new StudioError(0,'The Studio API is unavailable. Retry the connection.');
  } finally { clearTimeout(timer); }
}
