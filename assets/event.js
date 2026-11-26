const query = new URLSearchParams(location.search);
const event = query.get('event');
const pick = selector => document.querySelector(selector);
const dateText = date => new Intl.DateTimeFormat('da-DK', {dateStyle: 'full', timeZone: 'Europe/Copenhagen'}).format(new Date(date));

function element(tag, value, className) {
  const node = document.createElement(tag);
  node.textContent = value;
  if (className) node.className = className;
  return node;
}

function renderDetails(id, rows, format) {
  const section = pick(id);
  section.hidden = !rows.length;
  section.querySelector('.example-label').remove();
  section.querySelector('ul').replaceChildren(...rows.map(row => {
    const [title, detail] = format(row);
    const item = element('li', '');
    item.append(element('strong', title));
    if (detail) item.append(element('span', detail));
    return item;
  }));
}

const weatherClock = new Intl.DateTimeFormat('sv-SE', {
  timeZone:'Europe/Copenhagen', year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit'
});
const weatherNumber = new Intl.NumberFormat('da-DK', {maximumFractionDigits:1});

function setupWeather(data) {
  const status = pick('#weather-status');
  const select = pick('#weather-start');
  const table = pick('#guest-weather table');
  const today = weatherClock.format(new Date()).slice(0,10);
  const date = data.date || today;
  const daysAway = (Date.parse(date) - Date.parse(today)) / 86400000;
  if (daysAway < 0 || daysAway >= 9) {
    status.textContent = daysAway < 0 ? 'Arrangementet er afholdt. Radaren viser vejret lige nu.' : 'Vejrudsigten vises tættere på arrangementsdatoen.';
    return;
  }
  const starts = data.starts?.length ? data.starts : [{time:data.arrival || '09:00',title:'Fra mødetid'}];
  starts.forEach((start,index) => select.add(new Option(start.time + ' · ' + start.title,index)));
  pick('#weather-choice').hidden = !event;
  let rows;
  let loading = false;
  function render() {
    if (!rows) return;
    const start = starts[Number(select.value)].time;
    const first = date + ' ' + start.slice(0,2) + ':00';
    const last = new Date(Date.parse(date + 'T' + start + ':00Z') + 5 * 3600000).toISOString().slice(0,16).replace('T',' ');
    const selected = rows.filter(row => row.local >= first && row.local <= last);
    table.tBodies[0].replaceChildren(...selected.map(row => {
      const tr = element('tr','');
      const showValue = (value,unit) => Number.isFinite(value) ? weatherNumber.format(value) + unit : '–';
      for (const value of [row.local.slice(11),showValue(row.temperature,' °C'),showValue(row.rain,' mm'),showValue(row.wind,' m/s')]) tr.append(element('td',value));
      return tr;
    }));
    table.hidden = !selected.length;
    pick('#weather-credit').hidden = !selected.length;
    status.textContent = selected.length
      ? (event ? 'Prognose fra start og cirka fem timer frem.' : 'Demo · Dagens prognose fra kl. 09.00.')
      : 'Der er ingen tilgængelig prognose for det valgte tidsrum.';
  }
  select.addEventListener('change', render);
  async function load() {
    if (rows || loading) return;
    loading = true;
    status.textContent = 'Henter vejrudsigten …';
    try {
      const response = await fetch('/api/weather');
      if (!response.ok) throw new Error('Vejrudsigten kunne ikke hentes.');
      rows = (await response.json()).map(row => ({...row, local:weatherClock.format(new Date(row.time))}));
      render();
    } catch {
      status.textContent = 'Vejrudsigten kunne ikke hentes lige nu. Du kan stadig åbne radaren.';
    } finally {
      loading = false;
    }
  }
  for (const button of document.querySelectorAll('[data-go="program"],[data-go^="guest-"]')) button.addEventListener('click',load);
  if (['#program','#guest-weather','#guest-prizes','#guest-starts'].includes(location.hash)) load();
}

function renderContacts(data) {
  const section = pick('#event-contacts');
  const phases = [
    ['Før Company Day', 'before', data.contactBefore],
    ['Under Company Day', 'during', data.contact],
    ['Efter Company Day', 'after', data.contactAfter]
  ];
  const cards = [];
  for (const [title, key, description] of phases) {
    const phone = data[key + 'Phone'];
    const email = data[key + 'Email'];
    if (!description && !phone && !email) continue;
    const card = element('article', '', 'card');
    card.append(element('h4', title));
    if (description) card.append(element('p', description));
    const links = element('div', '', 'event-contact-links');
    if (phone) {
      const link = element('a', 'Ring ' + phone);
      link.href = 'tel:' + phone.replace(/[^+0-9]/g, '');
      links.append(link);
    }
    if (email) {
      const link = element('a', 'Skriv e-mail');
      link.href = 'mailto:' + encodeURIComponent(email).replace('%40', '@');
      links.append(link);
    }
    if (links.childElementCount) card.append(links);
    cards.push(card);
  }
  section.querySelector('.sponsor-grid').replaceChildren(...cards);
  section.hidden = !cards.length;
}

function renderActivity(bulletin, sponsors) {
  const banner = pick('#event-bulletin');
  banner.hidden = !bulletin;
  banner.querySelector('.bulletin-message').textContent = bulletin;
  banner.style.setProperty('--bulletin-speed', Math.max(12, 8 + bulletin.length / 8) + 's');
  for (const placement of ['home', 'program']) {
    const section = pick('#' + placement + '-sponsors');
    const cards = sponsors.filter(item => item.placement === placement).map(item => {
      const card = element('article', '', 'card sponsor-card');
      if (item.logo) {
        const logo = document.createElement('img');
        logo.alt = '';
        logo.loading = 'lazy';
        logo.referrerPolicy = 'no-referrer';
        logo.addEventListener('error', () => logo.remove(), {once:true});
        logo.src = item.logo;
        card.append(logo);
      }
      card.append(element('strong', item.title));
      if (item.text) card.append(element('p', item.text));
      if (item.link) {
        const link = element('a', 'Besøg ' + item.title);
        link.href = item.link;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        card.append(link);
      }
      return card;
    });
    section.querySelector('.sponsor-grid').replaceChildren(...cards);
    section.hidden = !cards.length;
  }
}

const banner = pick('#event-bulletin');
const bulletinToggle = banner.querySelector('button');
bulletinToggle.addEventListener('click', () => {
  const paused = banner.dataset.paused !== 'true';
  banner.dataset.paused = String(paused);
  bulletinToggle.textContent = paused ? 'Start' : 'Pause';
  bulletinToggle.setAttribute('aria-label', paused ? 'Start rulning af infobjælken' : 'Stop rulning af infobjælken');
});

const opening = pick('#opening');
const dayDialog = pick('#day-dialog');
const infoButton = pick('#open-day-info');
const visitKey = 'company-day:' + (event || 'demo') + (query.has('preview') ? ':preview' : '');

function firstView(key, value) {
  try {
    if (sessionStorage.getItem(key) === value) return false;
    sessionStorage.setItem(key, value);
  } catch {
    // The intro also works when the browser blocks session storage.
  }
  return true;
}

function startGuestView(data) {
  opening.querySelector('.opening-company').textContent = data.company;
  const ballBrand = opening.querySelector('.opening-ball-brand');
  const name = element('span', data.company);
  ballBrand.replaceChildren(name);
  if (data.logo) {
    const logo = document.createElement('img');
    logo.alt = '';
    logo.referrerPolicy = 'no-referrer';
    logo.addEventListener('load', () => ballBrand.replaceChildren(logo), {once: true});
    logo.src = data.logo;
  }
  const openingDate = opening.querySelector('.opening-date');
  openingDate.hidden = !data.date;
  if (data.date) openingDate.textContent = dateText(data.date);
  const weather = data.weather || '';
  const clothing = data.clothing || '';
  const hasInfo = Boolean(weather || clothing);
  for (const [id, value] of [['#day-weather', weather], ['#day-clothing', clothing]]) {
    const row = pick(id);
    row.hidden = !value;
    row.querySelector('dd').textContent = value;
  }
  pick('#day-demo').hidden = !!event;
  infoButton.hidden = !hasInfo;
  const app = pick('.app');
  const skip = opening.querySelector('button');

  function finish() {
    const skipped = document.activeElement === skip;
    opening.hidden = true;
    app.inert = false;
    if (hasInfo && firstView(visitKey + ':info', JSON.stringify([weather, clothing]))) {
      dayDialog.showModal();
    } else if (skipped) {
      pick('[data-go="program"]').focus();
    }
  }

  if (matchMedia('(prefers-reduced-motion: reduce)').matches || !firstView(visitKey + ':intro-v4', '1')) {
    finish();
    return;
  }
  app.inert = true;
  opening.hidden = false;
  const timer = setTimeout(finish, 2800);
  skip.addEventListener('click', () => {
    clearTimeout(timer);
    finish();
  }, {once: true});
}

infoButton.addEventListener('click', () => dayDialog.showModal());
dayDialog.addEventListener('close', () => {
  const target = infoButton.offsetWidth ? infoButton : pick('.nav-btn.active');
  target?.focus({preventScroll: true});
});

if (!event) {
  setupWeather({});
  renderContacts({contactBefore: 'Eksempel · Arrangementskoordinator', contact: 'Eksempel · Dagens vært', contactAfter: 'Eksempel · Opfølgning og feedback'});
  renderActivity('Demo · Gå til Program for at se holdenes starttider.', [
    {placement: 'home', title: 'Eksempel på hovedsponsor', text: 'Virksomhedens navn, logo og link kan vises her.'},
    {placement: 'program', title: 'Eksempel på præmiesponsor', text: 'Vis fx hvem der sponsorerer præmien til nærmest flaget.'}
  ]);
  startGuestView({
    company: 'Nordic Operations',
    date: '2026-09-24',
    weather: 'Mulighed for en byge i løbet af dagen.',
    clothing: 'Tag en let regnjakke med, og vælg golfsko eller sko med godt greb.'
  });
  fetch('/api/editor').then(response => response.json()).then(({editor}) => {
    pick('#edit-events').hidden = !editor;
  }).catch(() => {});
} else {
  const app = pick('.app');
  const status = pick('#guest-status');
  app.hidden = true;
  status.hidden = false;
  status.textContent = 'Henter jeres Company Day …';
  const preview = query.has('preview');
  fetch('/api/guest/' + encodeURIComponent(event) + (preview ? '?preview' : ''))
    .then(async response => {
      if (response.status === 404) throw new Error('Arrangementet er ikke tilgængeligt.');
      if (!response.ok) throw new Error('Programmet kunne ikke hentes. Prøv at genindlæse.');
      return response.json();
    })
    .then(data => {
      document.title = data.title + ' · Lyngbygaard Golf';
      pick('.demo-pill').hidden = !preview;
      pick('.demo-pill').textContent = 'Forhåndsvisning';
      pick('.hero h1 span').textContent = data.title === 'Company Day på Lyngbygaard' ? 'Company Day' : data.title;
      pick('.hero-company small').textContent = 'Company Day for';
      pick('.hero-company strong').textContent = data.company;
      const logo = pick('.company-logo');
      logo.hidden = !data.logo;
      if (data.logo) {
        const image = document.createElement('img');
        image.src = data.logo;
        image.alt = data.company;
        image.referrerPolicy = 'no-referrer';
        image.addEventListener('error', () => { logo.hidden = true; });
        logo.replaceChildren(image);
      }
      for (const selector of ['.hero-date', '#program .eyebrow']) pick(selector).textContent = dateText(data.date);
      const quick = document.querySelectorAll('.quick strong');
      quick[0].textContent = 'Kl. ' + data.arrival.replace(':', '.');
      quick[1].textContent = data.venue;
      const welcome = pick('#guest-welcome');
      welcome.textContent = data.welcome;
      welcome.hidden = !data.welcome;
      pick('#program .lead').hidden = true;
      pick('#program .notice').textContent = data.notice;
      pick('#program .notice').hidden = !data.notice;
      const timeline = pick('.timeline');
      timeline.replaceChildren(...data.program.map(row => {
        const item = element('div', '', 'timeline-item');
        const details = element('div', '');
        const time = element('time', row.time.replace(':', '.'));
        time.dateTime = row.time;
        details.append(element('h3', row.title), element('p', row.text));
        item.append(time, element('span', '', 'rail'), details);
        return item;
      }));
      renderDetails('#guest-starts', data.starts ?? [], row => [
        'Kl. ' + row.time.replace(':', '.') + ' · ' + row.title,
        row.hole ? 'Starthul ' + row.hole : ''
      ]);
      renderDetails('#guest-prizes', data.prizes ?? [], row => [row.title, row.text]);
      const extras = pick('#guest-extras');
      for (const row of data.extras) {
        const card = element('article', '', 'notice');
        card.append(element('h3', row.title), element('p', row.text));
        if (row.link) {
          const link = element('a', 'Åbn ' + row.title);
          link.href = row.link;
          link.target = '_blank';
          link.rel = 'noopener noreferrer';
          card.append(link);
        }
        extras.append(card);
      }
      for (const name of ['club', 'beginner', 'business']) {
        if (data.sections.includes(name)) continue;
        pick('#' + name).hidden = true;
        pick('.nav-btn[data-go="' + name + '"]').hidden = true;
        if (name === 'club') pick('.section-promo').hidden = true;
        if (location.hash.slice(1) === name) pick('.nav-btn[data-go="home"]').click();
      }
      pick('.bottom-nav').style.setProperty('--nav-count', 2 + data.sections.length);
      pick('link[rel="manifest"]').href = '/app.webmanifest?event=' + encodeURIComponent(event);
      status.hidden = true;
      app.hidden = false;
      for (const id of ['guest-starts','guest-prizes']) {
        pick('[data-go="' + id + '"]').hidden = pick('#' + id).hidden;
      }
      setupWeather(data);
      if (location.hash.startsWith('#guest-')) show(location.hash.slice(1));
      renderContacts(data);
      renderActivity(data.bulletin ?? '', data.sponsors ?? []);
      startGuestView(data);
    }).catch(error => { status.textContent = error.message; });
}
