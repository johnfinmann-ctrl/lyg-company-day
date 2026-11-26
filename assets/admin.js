const get = id => document.getElementById(id);
const form = get('editor');
const fields = ['title', 'company', 'date', 'arrival', 'venue', 'logo', 'welcome', 'notice', 'contact', 'weather', 'clothing', 'bulletin', 'contactBefore', 'contactAfter',
  'beforePhone', 'beforeEmail', 'duringPhone', 'duringEmail', 'afterPhone', 'afterEmail'];
const columns = {
  program: [['time', 'Tidspunkt', 'time', 5, true], ['title', 'Programpunkt', 'text', 120, true], ['text', 'Beskrivelse', 'textarea', 1200]],
  starts: [['time', 'Starttid', 'time', 5, true], ['title', 'Hold eller gruppe', 'text', 120, true], ['hole', 'Starthul (valgfrit)', 'text', 40]],
  prizes: [['title', 'Præmie eller kategori', 'text', 120, true], ['text', 'Beskrivelse', 'textarea', 1200]],
  sponsors: [['title', 'Sponsornavn', 'text', 120, true], ['placement', 'Placering', 'select', 10, true], ['text', 'Kort tekst', 'textarea', 250], ['logo', 'Logo (HTTPS-billedlink)', 'url', 1200], ['link', 'Hjemmeside (valgfrit)', 'url', 1200]],
  extras: [['title', 'Overskrift', 'text', 120, true], ['text', 'Tekst til gæsterne', 'textarea', 2000], ['link', 'Link (valgfrit)', 'url', 1200]]
};
const template = {
  title: 'Company Day på Lyngbygaard', company: '', date: '', arrival: '08:30', venue: 'Klubhuset',
  logo: '', welcome: '', weather: '', clothing: '', notice: 'Husk praktisk tøj og sko efter vejret.', contact: '',
  sections: ['club', 'beginner', 'business'], extras: [], sponsors: [], bulletin: '', starts: [], prizes: [],
  program: [
    ['08:30', 'Ankomst og morgenmad', 'Kaffe og let morgenmad i klubhuset.'],
    ['09:15', 'Velkomst og briefing', 'Dagens format, hold og praktiske oplysninger.'],
    ['09:45', 'Opvarmning', 'Range, putting og korte slag.'],
    ['10:30', 'Gunstart', 'Holdene sendes ud på banen.'],
    ['15:30', 'Omklædning og pause', 'Pause og forfriskning i klubhuset.'],
    ['16:30', 'Middag og præmier', 'Fælles afslutning i Brasseriet.']
  ].map(([time, title, text]) => ({time, title, text}))
};
let current;
let dirty = false;
let busy = false;

function setStatus(text, error = false) {
  get('status').textContent = text;
  get('status').dataset.error = error;
}

async function api(path, body) {
  const init = body ? {method: 'PUT', headers: {'content-type': 'application/json'}, body: JSON.stringify(body)} : {};
  const response = await fetch(path, init);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error);
  return data;
}

function confirmSwitch() {
  return !dirty || confirm('Skift arrangement uden at gemme ændringerne?');
}

async function run(callback) {
  if (busy) return;
  busy = true;
  try {
    await callback();
  } catch (error) {
    setStatus(error.message || 'Prøv igen.', true);
  } finally {
    busy = false;
  }
}

function addRow(group, data = {}) {
  const container = get(group);
  if (container.children.length >= 30) return setStatus('Du kan tilføje op til 30 rækker pr. sektion.', true);
  const row = document.createElement('div');
  row.className = 'row ' + group;
  for (const [key, title, type, max, required] of columns[group]) {
    const label = document.createElement('label');
    label.textContent = title;
    if (key === 'text' || key === 'hole') label.className = 'full';
    const input = document.createElement(['textarea', 'select'].includes(type) ? type : 'input');
    if (input.tagName === 'INPUT') input.type = type;
    if (type === 'select') input.append(new Option('Forsiden', 'home'), new Option('Ved præmierne', 'program'));
    input.dataset.field = key;
    input.maxLength = max;
    input.required = !!required;
    input.value = data[key] || (type === 'select' ? 'home' : '');
    label.append(input);
    row.append(label);
  }
  const remove = document.createElement('button');
  remove.className = 'full';
  remove.type = 'button';
  remove.textContent = 'Fjern række';
  remove.addEventListener('click', () => {
    row.remove();
    dirty = true;
  });
  row.append(remove);
  container.append(row);
}

function serialize() {
  const draft = Object.fromEntries(fields.map(name => [name, form.elements.namedItem(name).value]));
  draft.sections = Array.from(form.querySelectorAll('input[name="sections"]:checked'), input => input.value);
  for (const group of Object.keys(columns)) {
    draft[group] = Array.from(get(group).children, row => Object.fromEntries(
      Array.from(row.querySelectorAll('[data-field]'), input => [input.dataset.field, input.value])
    ));
  }
  return draft;
}

function linkFor(id, preview = false) {
  const url = new URL('/', location.origin);
  url.searchParams.set('event', id);
  if (preview) url.searchParams.set('preview', '1');
  return url.href;
}

function showLinks() {
  const {id, revision, published} = current;
  get('preview').hidden = !revision;
  get('preview').href = linkFor(id, true);
  get('guest-link').href = linkFor(id);
  for (const name of ['guest-link', 'copy-link', 'unpublish']) get(name).hidden = !published;
  get('publication').textContent = published ? 'Arrangementet er udgivet. Gemte kladder bliver synlige ved næste udgivelse.' : 'Arrangementet er en kladde.';
}

function showEvent(record) {
  current = record;
  const draft = current.draft;
  for (const name of fields) form.elements.namedItem(name).value = draft[name] ?? '';
  for (const input of form.querySelectorAll('input[name="sections"]')) input.checked = draft.sections.includes(input.value);
  for (const group of Object.keys(columns)) {
    get(group).replaceChildren();
    for (const row of draft[group] ?? []) addRow(group, row);
  }
  dirty = !record.revision;
  form.hidden = false;
  showLinks();
  for (const button of get('events').children) button.setAttribute('aria-current', String(button.dataset.id === record.id));
}

async function refresh() {
  const records = await api('/api/events');
  const list = get('events');
  list.replaceChildren();
  if (!records.length) {
    list.textContent = 'Dine gemte Company Days vises her.';
    return;
  }
  for (const record of records) {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.id = record.id;
    button.textContent = record.company || record.title;
    button.setAttribute('aria-current', String(current?.id === record.id));
    const details = document.createElement('small');
    details.textContent = [record.date?.split('-').reverse().join('.'), record.status].filter(Boolean).join(' · ');
    button.append(details);
    button.addEventListener('click', () => {
      if (current?.id === record.id || !confirmSwitch()) return;
      run(async () => {
        showEvent({id: record.id, ...await api('/api/events/' + record.id)});
        setStatus('');
      });
    });
    list.append(button);
  }
}

function newEvent(draft) {
  showEvent({id: crypto.randomUUID(), draft: {...draft, date: ''}, revision: null, published: null});
  form.elements.namedItem('company').focus();
}

async function save(action) {
  if (!form.reportValidity()) return;
  const draft = serialize();
  const active = current;
  const inputs = Array.from(form.elements);
  for (const input of inputs) input.disabled = true;
  try {
    const saved = await api('/api/events/' + current.id, {action, draft, revision: current.revision});
    if (current !== active) return;
    current = {id: current.id, ...saved};
    dirty = false;
    showLinks();
    setStatus({save: 'Kladden er gemt. Forhåndsvisningen er klar.', publish: 'Arrangementet er udgivet. Gæstelinket er klar.', unpublish: 'Gæstelinket er lukket. Kladden er gemt.'}[action]);
    await refresh();
  } finally {
    for (const input of inputs) input.disabled = false;
  }
}

get('new').addEventListener('click', () => {
  if (busy || !confirmSwitch()) return;
  newEvent(template);
  setStatus('Ny Company Day. Udfyld virksomhed og dato, og tilpas programmet.');
});
get('copy').addEventListener('click', () => {
  newEvent(serialize());
  setStatus('Kopien er en ny kladde. Gennemgå dato, kunde og logo før udgivelse.');
});
form.addEventListener('input', () => { dirty = true; });
form.addEventListener('submit', event => {
  event.preventDefault();
  run(() => save('save'));
});
get('publish').addEventListener('click', () => run(() => save('publish')));
get('unpublish').addEventListener('click', () => {
  if (confirm('Luk gæstelinket til dette arrangement?')) run(() => save('unpublish'));
});
get('copy-link').addEventListener('click', () => run(async () => {
  await navigator.clipboard.writeText(get('guest-link').href);
  setStatus('Gæstelinket er kopieret.');
}));
for (const group of Object.keys(columns)) {
  get('add-' + group).addEventListener('click', () => {
    addRow(group);
    dirty = true;
    get(group).lastElementChild.querySelector('input')?.focus();
  });
}
window.addEventListener('beforeunload', event => {
  if (dirty) event.preventDefault();
});
run(refresh);
