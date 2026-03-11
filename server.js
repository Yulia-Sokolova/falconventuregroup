const express = require('express');
const fs = require('fs');
const path = require('path');
const { marked } = require('marked');
const nodemailer = require('nodemailer');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.urlencoded({ extended: true }));

// Redirect www to naked domain
app.use((req, res, next) => {
  const host = req.hostname;
  if (host && host.startsWith('www.')) {
    return res.redirect(301, `https://${host.slice(4)}${req.originalUrl}`);
  }
  next();
});

app.use(express.static(path.join(__dirname, 'public')));

// --- Helpers ---

function loadJSON(file) {
  return JSON.parse(fs.readFileSync(path.join(__dirname, 'content', file), 'utf8'));
}

function loadMarkdown(file) {
  const raw = fs.readFileSync(path.join(__dirname, 'content', file), 'utf8');
  const fmMatch = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!fmMatch) return { meta: {}, html: marked(raw) };
  const meta = {};
  fmMatch[1].split('\n').forEach(line => {
    const [key, ...rest] = line.split(':');
    if (key && rest.length) meta[key.trim()] = rest.join(':').trim();
  });
  return { meta, html: marked(fmMatch[2]) };
}

function loadTemplate(file) {
  return fs.readFileSync(path.join(__dirname, 'templates', file), 'utf8');
}

function renderPage(pageTemplate, vars) {
  const site = loadJSON('site.json');
  let base = loadTemplate('base.html');

  // Nav links
  const navLinks = site.nav.map(n =>
    `<a href="${n.href}" class="px-3 py-2 text-sm font-medium rounded-lg text-dark-300 hover:text-white hover:bg-white/5 transition-all">${n.label}</a>`
  ).join('\n');
  const navLinksMobile = site.nav.map(n =>
    `<a href="${n.href}" class="block px-3 py-2 text-sm font-medium rounded-lg text-dark-300 hover:text-white hover:bg-white/5 transition-all">${n.label}</a>`
  ).join('\n');
  const footerNavLinks = site.nav.map(n =>
    `<li><a href="${n.href}" class="text-dark-400 hover:text-accent-teal transition-colors">${n.label}</a></li>`
  ).join('\n');

  const headSnippets = (site.headSnippets || []).join('\n  ');

  const replacements = {
    ...site,
    ...vars,
    navLinks,
    navLinksMobile,
    footerNavLinks,
    headSnippets,
    content: pageTemplate,
  };

  let html = base;
  for (const [key, val] of Object.entries(replacements)) {
    if (typeof val === 'string') {
      html = html.split(`{{${key}}}`).join(val);
    }
  }
  // Clear any remaining unreplaced placeholders
  html = html.replace(/\{\{[^}]+\}\}/g, '');
  return html;
}

// --- Configure marked for Tailwind prose-friendly output ---

marked.setOptions({ gfm: true, breaks: false });

// --- Routes ---

app.get('/', (req, res) => {
  const { meta, html } = loadMarkdown('home.md');

  // Split markdown into sections by h2
  const sections = html.split(/<h2[^>]*>/);
  const hero = sections[0] || '';
  const rest = sections.slice(1).map(s => '<h2>' + s);

  // Build service cards from the "What We Do" section
  const servicesSection = rest[0] || '';
  const ctaSection = rest[1] || '';

  let homeTemplate = loadTemplate('home.html');
  homeTemplate = homeTemplate
    .replace('{{heroContent}}', hero
      .replace('<h1', '<h1 class="text-4xl sm:text-5xl lg:text-6xl font-black tracking-tight mb-6 leading-[1.1]"')
      .replace('<p>', '<p class="text-lg sm:text-xl text-dark-300 mb-8 leading-relaxed max-w-2xl">')
    )
    .replace('{{servicesContent}}', formatServices(servicesSection))
    .replace('{{ctaContent}}', ctaSection
      .replace('<h2>', '<h2 class="text-3xl sm:text-4xl font-bold mb-6">')
      .replace('<p>', '<p class="text-lg text-dark-400 mb-10 max-w-2xl mx-auto">')
      .replace(/<a href/g, '<a class="inline-block px-8 py-4 gradient-bg text-white font-semibold rounded-lg hover:opacity-90 transition-all" href')
    );

  res.send(renderPage(homeTemplate, {
    pageTitle: 'Home',
    metaDescription: meta.metaDescription || '',
  }));
});

function formatServices(html) {
  // Turn h3 sections into a card grid
  const parts = html.split(/<h3[^>]*>/);
  const heading = parts[0] || '';
  const cards = parts.slice(1);

  if (!cards.length) return html;

  const cardHtml = cards.map(card => {
    const titleEnd = card.indexOf('</h3>');
    const title = card.substring(0, titleEnd);
    const body = card.substring(titleEnd + 5);
    return `
      <div class="glass-card p-8 rounded-2xl">
        <h3 class="text-xl font-semibold mb-3 text-accent-teal">${title}</h3>
        <div class="text-dark-300 leading-relaxed">${body}</div>
      </div>`;
  }).join('\n');

  return `
    ${heading.replace('<h2>', '<h2 id="services-heading" class="text-3xl sm:text-4xl font-bold mb-16 text-center">')}
    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
      ${cardHtml}
    </div>`;
}

// Standard pages
['about', 'services', 'privacy'].forEach(page => {
  app.get(`/${page}`, (req, res) => {
    const { meta, html } = loadMarkdown(`${page}.md`);
    let pageHtml = loadTemplate('page.html').replace('{{content}}', html);
    res.send(renderPage(pageHtml, {
      pageTitle: meta.title || page,
      metaDescription: meta.metaDescription || '',
    }));
  });
});

// Case studies page (custom template)
app.get('/case-studies', (req, res) => {
  const { meta, html } = loadMarkdown('case-studies.md');
  let caseStudiesTemplate = loadTemplate('case-studies.html');
  caseStudiesTemplate = caseStudiesTemplate.replace('{{content}}', html);
  res.send(renderPage(caseStudiesTemplate, {
    pageTitle: meta.title || 'Case Studies',
    metaDescription: meta.metaDescription || '',
  }));
});

// Contact page
app.get('/contact', (req, res) => {
  res.send(renderContactPage());
});

app.post('/contact', async (req, res) => {
  const { website, email, f_a7x, f_q9m, f_k3p, _ts } = req.body;

  // Anti-spam checks
  const isSpam = detectSpam({ website, email, f_a7x, f_q9m, f_k3p, _ts });

  if (isSpam) {
    // Fake success — don't let spammers know they were caught
    return res.send(renderContactPage('Thanks for reaching out! We\'ll get back to you soon.', 'success'));
  }

  // Validate real fields
  if (!f_a7x || !f_q9m || !f_k3p) {
    return res.send(renderContactPage('Please fill out all fields.', 'error'));
  }

  // Send email
  try {
    await sendContactEmail({ name: f_a7x, email: f_q9m, message: f_k3p });
    res.send(renderContactPage('Thanks for reaching out! We\'ll get back to you within one business day.', 'success'));
  } catch (err) {
    console.error('Email send failed:', err);
    res.send(renderContactPage('Something went wrong. Please try again or email us directly.', 'error'));
  }
});

function detectSpam({ website, email, f_a7x, f_q9m, f_k3p, _ts }) {
  // Honeypot: if the hidden fields are filled, it's a bot
  if (website || email) return true;

  // Timing: if submitted in under 3 seconds, likely a bot
  if (_ts) {
    const elapsed = Date.now() - parseInt(_ts, 10);
    if (elapsed < 3000) return true;
  }

  // Basic content checks
  const message = (f_k3p || '').toLowerCase();
  const urlCount = (message.match(/https?:\/\//g) || []).length;
  if (urlCount > 3) return true;

  return false;
}

async function sendContactEmail({ name, email, message }) {
  const smtpHost = process.env.SMTP_HOST;
  const smtpPort = process.env.SMTP_PORT || 587;
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;

  if (!smtpHost) {
    // Fallback: log to console if SMTP not configured
    console.log('--- CONTACT FORM SUBMISSION ---');
    console.log(`Name: ${name}`);
    console.log(`Email: ${email}`);
    console.log(`Message: ${message}`);
    console.log('--- END ---');
    console.log('(Configure SMTP_HOST, SMTP_USER, SMTP_PASS env vars to enable email delivery)');
    return;
  }

  const transporter = nodemailer.createTransport({
    host: smtpHost,
    port: parseInt(smtpPort, 10),
    secure: parseInt(smtpPort, 10) === 465,
    auth: { user: smtpUser, pass: smtpPass },
  });

  await transporter.sendMail({
    from: `"Falcon Venture Group Website" <${smtpUser}>`,
    replyTo: email,
    to: 'yulia@falconventuregroup.com',
    subject: `Contact form: ${name}`,
    text: `Name: ${name}\nEmail: ${email}\n\nMessage:\n${message}`,
  });
}

function renderContactPage(message, type) {
  const { meta, html } = loadMarkdown('contact.md');
  let contactTemplate = loadTemplate('contact.html');

  let formMessage = '';
  if (message) {
    const bgClass = type === 'success'
      ? 'bg-green-50 border-green-200 text-green-800'
      : 'bg-red-50 border-red-200 text-red-800';
    formMessage = `<div class="p-4 mb-6 border rounded-lg ${bgClass}">${message}</div>`;
  }

  contactTemplate = contactTemplate
    .replace('{{content}}', html)
    .replace('{{formMessage}}', formMessage)
    .replace('{{formTimestamp}}', Date.now().toString());

  return renderPage(contactTemplate, {
    pageTitle: meta.title || 'Contact',
    metaDescription: meta.metaDescription || '',
  });
}

// --- Start ---

app.listen(PORT, () => {
  console.log(`Falcon Venture Group running at http://localhost:${PORT}`);
});
