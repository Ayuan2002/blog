import { readdir, readFile, writeFile, mkdir, rm, copyFile, lstat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const escapeHtml = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function decodeHtml(text) {
  return text.replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (match, entity) => {
    const named = {amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' '};
    if (!entity.startsWith('#')) return named[entity.toLowerCase()] ?? match;
    const code = entity[1].toLowerCase() === 'x' ? parseInt(entity.slice(2), 16) : Number(entity.slice(1));
    return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : '\uFFFD';
  });
}
const plain = value => decodeHtml(value.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
const safeSource = html => html.replace(/<!--[\s\S]*?-->/g, '').replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '');
export function validDate(date) {
  return /^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(Date.parse(date)) && new Date(date).toISOString().slice(0, 10) === date;
}
export function readMetadata(html, filename, fallbackDate) {
  const clean = safeSource(html);
  const meta = {};
  for (const tag of clean.matchAll(/<meta\b(?:[^>"']|"[^"]*"|'[^']*')*>/gi)) {
    const attrs = {};
    for (const attr of tag[0].matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)) {
      attrs[attr[1].toLowerCase()] = decodeHtml(attr[2] ?? attr[3] ?? attr[4]);
    }
    if (attrs.name || attrs.property) meta[(attrs.name || attrs.property).toLowerCase()] = attrs.content ?? '';
  }
  const title = (meta['blog:title'] || plain(clean.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? '') || plain(clean.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1] ?? '') || path.basename(filename, path.extname(filename))).trim();
  const text = plain(clean.match(/<article\b[^>]*>([\s\S]*?)<\/article>/i)?.[1] ?? clean.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i)?.[1] ?? clean);
  const declaredDate = (meta.date || meta['article:published_time'] || '').slice(0, 10);
  if (declaredDate && !validDate(declaredDate)) throw new Error(`${filename}: 日期无效，请使用 YYYY-MM-DD。`);
  const filenameDate = path.basename(filename).match(/^\d{4}-\d{2}-\d{2}/)?.[0];
  const date = declaredDate || (filenameDate && validDate(filenameDate) ? filenameDate : fallbackDate);
  if (!validDate(date)) throw new Error(`${filename}: 无法确定发布日期。`);
  return {
    title, date,
    description: (meta.description || meta['og:description'] || text.slice(0, 120)).trim(),
    category: (meta.category || '随笔').trim() || '随笔',
    tags: (meta.keywords || '').split(/[,，]/).map(x => x.trim()).filter(Boolean),
    minutes: Math.max(1, Math.ceil(text.length / 450)),
    href: `posts/${filename.split('/').map(encodeURIComponent).join('/')}`
  };
}
async function filesIn(directory, prefix = '') {
  const output = [];
  for (const entry of await readdir(directory, {withFileTypes:true})) {
    if (entry.name.startsWith('.')) continue;
    if (entry.isSymbolicLink()) throw new Error(`发布目录不支持符号链接：${entry.name}`);
    const relative = prefix + entry.name;
    if (entry.isDirectory()) output.push(...await filesIn(path.join(directory, entry.name), relative + '/'));
    else if (entry.isFile()) output.push(relative);
  }
  return output.sort();
}
const displayDate = date => date.replaceAll('-', '.');
function firstCommitDate(root, filename, fallback) {
  try {
    const date = execFileSync('git', ['log', '--follow', '--diff-filter=A', '--format=%aI', '--', `posts/${filename}`], {cwd:root, encoding:'utf8', stdio:['ignore','pipe','ignore']}).trim().split('\n').at(-1)?.slice(0, 10);
    return date && validDate(date) ? date : fallback;
  } catch { return fallback; }
}

export async function build(root = projectRoot) {
  root = path.resolve(root);
  const config = JSON.parse(await readFile(path.join(root, 'site.config.json'), 'utf8'));
  const configuredUrl = new URL(config.url);
  if (!['https:', 'http:'].includes(configuredUrl.protocol) || configuredUrl.search || configuredUrl.hash) throw new Error('site.config.json 中的 url 必须是完整网站地址，且不能带查询参数或锚点。');
  const siteUrl = configuredUrl.href.replace(/\/?$/, '/');
  const basePath = new URL(siteUrl).pathname;
  const today = new Intl.DateTimeFormat('en-CA', {timeZone:'Asia/Shanghai', year:'numeric', month:'2-digit', day:'2-digit'}).format(new Date());
  const postFiles = await filesIn(path.join(root, 'posts'));
  const posts = [];
  for (const filename of postFiles.filter(file => /\.html?$/i.test(file))) {
    posts.push(readMetadata(await readFile(path.join(root, 'posts', filename), 'utf8'), filename, firstCommitDate(root, filename, today)));
  }
  posts.sort((a,b) => b.date.localeCompare(a.date) || a.href.localeCompare(b.href));
  const dist = path.join(root, 'dist');
  if (path.dirname(dist) !== root || path.basename(dist) !== 'dist') throw new Error('输出目录不安全。');
  const existing = await lstat(dist).catch(error => { if (error.code !== 'ENOENT') throw error; });
  if (existing?.isSymbolicLink()) throw new Error('输出目录不能是符号链接。');
  await rm(dist, {recursive:true, force:true});
  await mkdir(dist, {recursive:true});
  for (const directory of ['posts','assets']) {
    for (const file of await filesIn(path.join(root, directory))) {
      const destination = path.join(dist, directory, file);
      await mkdir(path.dirname(destination), {recursive:true});
      await copyFile(path.join(root, directory, file), destination);
    }
  }
  const e = escapeHtml;
  const footer = `<footer class="site-footer"><span>© ${today.slice(0,4)} ${e(config.author)}<span class="footer-note"> · 慢慢写，慢慢来。</span></span><div><a href="${e(config.github)}">GitHub ↗</a><a href="${e(basePath)}feed.xml">RSS ↗</a><a href="#top">回到顶部 ↑</a></div></footer>`;
  function shell(title, description, body, current, filename) {
    return `<!doctype html>
<html lang="${e(config.language)}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${e(title)}</title><meta name="description" content="${e(description)}"><meta name="theme-color" content="#f7f7f2"><link rel="canonical" href="${e(new URL(filename, siteUrl).href)}"><meta property="og:type" content="website"><meta property="og:title" content="${e(title)}"><meta property="og:description" content="${e(description)}"><link rel="icon" type="image/svg+xml" href="${e(basePath)}assets/favicon.svg"><link rel="alternate" type="application/rss+xml" title="${e(config.title)}" href="${e(basePath)}feed.xml"><link rel="stylesheet" href="${e(basePath)}assets/style.css"><script defer src="${e(basePath)}assets/main.js"></script></head>
<body id="top"><a class="skip-link" href="#main">跳到正文</a><div class="page-shell"><header class="site-header"><a class="brand" href="${e(basePath)}" aria-label="${e(config.title)}首页"><span class="brand-mark">a.</span><span>${e(config.author)}<span class="brand-sub">的个人博客</span></span></a><nav aria-label="主导航"><a ${current==='posts'?'aria-current="page"':''} href="${e(basePath)}#writing">文章</a><a ${current==='about'?'aria-current="page"':''} href="${e(basePath)}about.html">关于</a><a class="nav-github" href="${e(config.github)}" aria-label="${e(config.author)} 的 GitHub">GitHub ↗</a></nav></header>${body}${footer}</div></body></html>\n`;
  }
  const categories = [...new Set(posts.map(post=>post.category))];
  const cards = posts.map((post, index) => `<article class="post-card" data-category="${e(post.category)}" data-search="${e([post.title,post.description,post.category,...post.tags].join(' ').toLocaleLowerCase())}"><div class="post-side"><span class="post-number">${String(posts.length-index).padStart(2,'0')}</span><time datetime="${post.date}">${displayDate(post.date)}</time></div><div class="post-main"><div class="post-eyebrow"><span>${e(post.category)}</span><span>${post.minutes} 分钟阅读</span></div><h3><a href="${e(post.href)}">${e(post.title)}<span class="post-arrow" aria-hidden="true">↗</span></a></h3><p>${e(post.description)}</p>${post.tags.length?`<div class="post-tags">${post.tags.map(tag=>`<span># ${e(tag)}</span>`).join('')}</div>`:''}</div></article>`).join('\n');
  const hero = `<section class="hero" aria-labelledby="hero-title"><div class="hero-copy"><p class="eyebrow"><span class="small-line"></span> A PERSONAL NOTEBOOK</p><h1 id="hero-title">${config.hero.map(line=>`<span>${e(line)}</span>`).join('')}</h1><p class="hero-description">${e(config.description)}</p><a class="text-link" href="#writing">翻开这些记录 <span aria-hidden="true">↘</span></a></div><div class="notebook-art" aria-hidden="true"><div class="orbit orbit-one"></div><div class="orbit orbit-two"></div><span class="art-star">✳</span><div class="paper"><span class="paper-label">NOTES / ${today.slice(0,4)}</span><span class="paper-word">一些文字，<br>一些生活。</span><div class="paper-lines"></div><span class="paper-footer">by ${e(config.author)} <span>↗</span></span></div><span class="art-caption">THE LITTLE THINGS MATTER.</span></div></section>`;
  const listing = `<section class="writing" id="writing" aria-labelledby="writing-title"><div class="section-heading"><div><p class="eyebrow">THE JOURNAL</p><h2 id="writing-title">最近的文字<span class="count">${String(posts.length).padStart(2,'0')}</span></h2></div><p>生活里的片段，思考中的回声。</p></div><div class="filter-bar" data-filters hidden><div class="categories" role="group" aria-label="按分类筛选"><button type="button" class="category-button" data-category="" aria-pressed="true">全部文章</button>${categories.map(category=>`<button type="button" class="category-button" data-category="${e(category)}" aria-pressed="false">${e(category)}</button>`).join('')}</div><label class="search"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" stroke="currentColor" stroke-width="1.5"/><path d="m16 16 5 5" stroke="currentColor" stroke-width="1.5"/></svg><input type="search" id="search" aria-label="搜索文章" placeholder="搜索文字、标签…" autocomplete="off"><span class="search-hint" aria-hidden="true">⌕</span></label></div><p class="sr-only" id="results-count" aria-live="polite"></p><div class="post-list">${cards}</div><div class="empty-state" id="empty-state" ${posts.length?'hidden':''}><span aria-hidden="true">＊</span><h3>${posts.length?'暂时没有找到相关文字':'文字，正在路上。'}</h3><p>${posts.length?'换个关键词，或者看看其他分类。':'下次见面，也许就有新的故事。'}</p><button id="reset-filters" class="text-link" type="button" hidden>查看全部文章 ↗</button></div></section>`;
  const note = `<aside class="closing-note"><span aria-hidden="true">✳</span><p>不急着抵达，<br><strong>也记得记录沿途。</strong></p><a href="about.html" class="text-link">关于这个小站 ↗</a></aside>`;
  await writeFile(path.join(dist,'index.html'), shell(config.title,config.description,`<main id="main">${hero}${listing}${note}</main>`,'posts',''));
  await writeFile(path.join(dist,'about.html'), shell(`关于 · ${config.title}`,config.description,`<main id="main" class="about-page"><p class="eyebrow">BEHIND THE WORDS</p><h1>关于这里<span class="accent-dot">。</span></h1><div class="about-layout"><div class="about-monogram" aria-hidden="true">a<span>.</span></div><div class="prose">${config.about.map(p=>`<p>${e(p)}</p>`).join('')}<p class="about-signature">${e(config.author)}</p><a class="text-link" href="${e(basePath)}#writing">去读一篇文章 ↗</a></div></div></main>`,'about','about.html'));
  await writeFile(path.join(dist,'404.html'), shell(`没有找到这页 · ${config.title}`,'这页可能搬家了。',`<main id="main" class="not-found"><p class="eyebrow">404 / A LITTLE DETOUR</p><h1>这一页，<br>还没有写下。</h1><p>可能是地址有误，也可能文章已经搬家。</p><a class="button" href="${e(basePath)}">回到首页 ↗</a></main>`,'','404.html'));
  await writeFile(path.join(dist,'posts.json'), JSON.stringify(posts,null,2)+'\n');
  const xml = value => e(value).replace(/[^\u0009\u000A\u000D\u0020-\uD7FF\uE000-\uFFFD\u{10000}-\u{10FFFF}]/gu,'');
  const urls = ['', 'about.html', ...posts.map(post=>post.href)];
  await writeFile(path.join(dist,'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.map(url=>`<url><loc>${xml(new URL(url,siteUrl).href)}</loc></url>`).join('')}</urlset>\n`);
  await writeFile(path.join(dist,'feed.xml'), `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom"><channel><title>${xml(config.title)}</title><link>${xml(siteUrl)}</link><description>${xml(config.description)}</description><language>${xml(config.language)}</language><atom:link href="${xml(siteUrl)}feed.xml" rel="self" type="application/rss+xml"/>${posts.map(post=>`<item><title>${xml(post.title)}</title><link>${xml(new URL(post.href,siteUrl).href)}</link><guid isPermaLink="true">${xml(new URL(post.href,siteUrl).href)}</guid><pubDate>${new Date(post.date+'T00:00:00+08:00').toUTCString()}</pubDate><description>${xml(post.description)}</description><category>${xml(post.category)}</category></item>`).join('')}</channel></rss>\n`);
  await writeFile(path.join(dist,'.nojekyll'),'');
  console.log(`已生成 ${posts.length} 篇文章：${dist}`);
  return {posts,dist};
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  build().catch(error=>{ console.error(error.message); process.exitCode=1; });
}
