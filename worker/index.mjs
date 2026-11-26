const types = {js: 'text/javascript', html: 'text/html', png: 'image/png', webmanifest: 'application/manifest+json'};
const eventId = /^[0-9a-f-]{36}$/;
const editorEmail = 'john.finmann@gmail.com';

function json(value, status = 200) {
  return Response.json(value, {status, headers: {'cache-control': 'no-store', 'x-content-type-options': 'nosniff'}});
}

function asset(name, cache = 'no-store') {
  return new Response(Uint8Array.from(atob(assets[name]), letter => letter.charCodeAt(0)), {headers: {
    'content-type': types[name.split('.').pop()],
    'cache-control': cache,
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'no-referrer'
  }});
}

function cleanEvent(data) {
  const fields = {title: 100, company: 100, date: 10, arrival: 5, venue: 180,
    logo: 1200, welcome: 1500, notice: 1500, contact: 500};
  const dayFields = {weather: 300, clothing: 500, bulletin: 180,
    contactBefore: 500, contactAfter: 500, beforePhone: 35, beforeEmail: 254,
    duringPhone: 35, duringEmail: 254, afterPhone: 35, afterEmail: 254};
  const result = {};
  for (const [field, max] of Object.entries({...fields, ...dayFields})) {
    const value = data[field] ?? (Object.hasOwn(dayFields, field) ? '' : undefined);
    if (typeof value !== 'string' || value.length > max) throw new Error('Et felt er ugyldigt eller for langt.');
    result[field] = value.trim();
  }
  for (const phase of ['before', 'during', 'after']) {
    const email = result[phase + 'Email'];
    const phone = result[phase + 'Phone'];
    if (email && !/^[^\s@/?#]+@[^\s@/?#]+$/.test(email)) throw new Error('Kontrollér kontaktpersonens e-mail.');
    if (phone && (!/^\+?[0-9 ().-]+$/.test(phone) || !/\d/.test(phone))) throw new Error('Kontrollér kontaktpersonens telefonnummer.');
  }
  const date = new Date(result.date + 'T00:00:00Z');
  if (!result.title || !result.company || !result.venue || !/^\d{4}-\d\d-\d\d$/.test(result.date) ||
      Number.isNaN(date.valueOf()) || date.toISOString().slice(0, 10) !== result.date ||
      !/^([01]\d|2[0-3]):[0-5]\d$/.test(result.arrival)) {
    throw new Error('Angiv titel, virksomhed, gyldig dato, mødetid og mødested.');
  }
  if (result.logo && new URL(result.logo).protocol !== 'https:') throw new Error('Logoets billedlink skal begynde med https://.');
  const groups = {
    program: {time: 5, title: 120, text: 1200},
    starts: {time: 5, title: 120, hole: 40},
    prizes: {title: 120, text: 1200},
    sponsors: {title: 120, text: 250, logo: 1200, link: 1200, placement: 10},
    extras: {title: 120, text: 2000, link: 1200}
  };
  for (const [group, columns] of Object.entries(groups)) {
    const rows = data[group] ?? (group === 'starts' || group === 'prizes' || group === 'sponsors' ? [] : null);
    if (!Array.isArray(rows) || rows.length > 30) throw new Error('Brug højst 30 rækker pr. sektion.');
    result[group] = rows.map(row => {
      const clean = {};
      for (const [field, max] of Object.entries(columns)) {
        if (typeof row?.[field] !== 'string' || row[field].length > max) throw new Error('Et felt er ugyldigt eller for langt.');
        clean[field] = row[field].trim();
      }
      if (!clean.title || ((group === 'program' || group === 'starts') && !/^([01]\d|2[0-3]):[0-5]\d$/.test(clean.time))) {
        throw new Error('Udfyld titel på alle rækker og et gyldigt tidspunkt for program- og startrækker.');
      }
      for (const address of [clean.link, clean.logo]) {
        if (address && new URL(address).protocol !== 'https:') throw new Error('Links skal begynde med https://.');
      }
      if (group === 'sponsors' && !['home', 'program'].includes(clean.placement)) throw new Error('Vælg en placering for sponsoren.');
      return clean;
    });
  }
  for (const group of ['program', 'starts']) result[group].sort((a, b) => a.time.localeCompare(b.time));
  result.sections = ['club', 'beginner', 'business'].filter(section => data.sections?.includes(section));
  return result;
}

async function forecast(env) {
  const key = 'weather/lyngbygaard.json';
  const cached = await env.BUCKET.get(key);
  const record = cached && await cached.json();
  if (record?.expires > Date.now()) return json(record.rows);
  const response = await fetch('https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=56.1693&lon=10.0317', {
    headers: {'User-Agent': 'LyngbygaardCompanyDay/1.0 (+https://lyg-company-day-app.finmann.chatgpt.site)'},
    signal: AbortSignal.timeout(8000)
  });
  if (!response.ok) return json({error:'Vejrudsigten kunne ikke hentes.'}, 502);
  const payload = await response.json();
  const rows = payload.properties.timeseries.map(({time,data}) => ({
    time, temperature: data.instant.details.air_temperature, wind: data.instant.details.wind_speed,
    rain: data.next_1_hours?.details.precipitation_amount ?? null
  }));
  const expires = Math.max(Date.now() + 1800000, Date.parse(response.headers.get('expires')) || 0);
  await env.BUCKET.put(key, JSON.stringify({expires,rows}));
  return json(rows);
}

async function handler(request, env) {
  const url = new URL(request.url);
  const path = url.pathname;
  const user = request.headers.get('oai-authenticated-user-id');
  const editor = !!user && request.headers.get('oai-authenticated-user-email')?.toLowerCase() === editorEmail;
  if (path === '/admin') return editor ? asset('admin.html') : new Response('Administrationen er forbeholdt appens ejer.', {status: 403});
  if (path === '/') return asset('index.html');
  if (path === '/app.webmanifest' && eventId.test(url.searchParams.get('event') ?? '')) {
    const manifest = JSON.parse(atob(assets['app.webmanifest']));
    manifest.scope = '/';
    manifest.start_url = '/?event=' + url.searchParams.get('event');
    manifest.id = manifest.start_url;
    return new Response(JSON.stringify(manifest), {headers: {'content-type': types.webmanifest, 'cache-control': 'no-store'}});
  }
  const file = path.slice(1);
  if (request.method === 'GET' && Object.hasOwn(assets, file) && !file.endsWith('.html')) return asset(file);
  if (!path.startsWith('/api/')) return new Response('Siden findes ikke.', {status: 404});
  if (path === '/api/weather' && request.method === 'GET') return forecast(env);
  if (path === '/api/editor' && request.method === 'GET') return json({editor});
  const guest = path.match(/^\/api\/guest\/([^/]+)$/);
  if (guest && request.method === 'GET' && eventId.test(guest[1])) {
    const item = await env.BUCKET.get('events/' + guest[1]);
    const record = item && await item.json();
    const preview = editor && url.searchParams.has('preview');
    const event = preview ? record?.draft : record?.published;
    return event ? json(event) : json({error: 'Arrangementet er ikke tilgængeligt.'}, 404);
  }
  if (!editor) return json({error: 'Adgang afvist.'}, 403);
  if (path === '/api/events' && request.method === 'GET') {
    const records = [];
    let cursor;
    do {
      const page = await env.BUCKET.list({prefix: 'events/', limit: 100, cursor, include: ['customMetadata']});
      for (const item of page.objects) records.push({id: item.key.slice(7), ...item.customMetadata});
      cursor = page.truncated ? page.cursor : undefined;
    } while (cursor);
    records.sort((a,b) => (b.date || '').localeCompare(a.date || ''));
    return json(records);
  }
  const match = path.match(/^\/api\/events\/([^/]+)$/);
  if (!match || !eventId.test(match[1])) return json({error: 'Siden findes ikke.'}, 404);
  const key = 'events/' + match[1];
  const item = await env.BUCKET.get(key);
  const record = item && await item.json();
  if (request.method === 'GET') return record ? json({ ...record, revision: item.etag }) : json({error: 'Arrangementet findes ikke.'}, 404);
  if (request.method !== 'PUT' || request.headers.get('origin') !== url.origin ||
      !request.headers.get('content-type')?.startsWith('application/json')) return json({error: 'Anmodningen er ikke tilladt.'}, 403);
  const raw = await request.text();
  if (raw.length > 160000) return json({error: 'Arrangementet fylder for meget.'}, 413);
  let body, draft;
  try {
    body = JSON.parse(raw);
    if (!['save', 'publish', 'unpublish'].includes(body.action)) throw new Error('Vælg en gyldig handling.');
    draft = cleanEvent(body.draft);
  } catch (error) {
    return json({error: error instanceof TypeError ? 'Kontrollér felter og links.' : error.message}, 400);
  }
  if ((item?.etag ?? null) !== body.revision) return json({error: 'Arrangementet er ændret i et andet vindue. Kopiér dine ændringer, og genindlæs.'}, 409);
  if (body.action === 'publish' && !draft.program.length) return json({error: 'Tilføj mindst ét programpunkt før udgivelse.'}, 400);
  const published = body.action === 'publish' ? draft : body.action === 'unpublish' ? null : record?.published ?? null;
  const updated = await env.BUCKET.put(key, JSON.stringify({draft, published}), {
    onlyIf: item ? {etagMatches: item.etag} : {etagDoesNotMatch: '*'},
    customMetadata: { title: draft.title, company: draft.company, date: draft.date, status: published ? 'Udgivet' : 'Kladde' }
  });
  return updated ? json({draft, published, revision: updated.etag}) : json({error: 'Arrangementet er ændret i et andet vindue. Kopiér dine ændringer, og genindlæs.'}, 409);
}

export default {
  async fetch(request, env) {
    try {
      return await handler(request, env);
    } catch (error) {
      console.error(error);
      return json({error: 'Der opstod en fejl. Prøv igen.'}, 500);
    }
  }
};
