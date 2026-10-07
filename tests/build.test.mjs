import test from 'node:test';
import assert from 'node:assert/strict';
import {readMetadata,build,validDate} from '../scripts/build.mjs';
import {mkdir,mkdtemp,writeFile,readFile,rm,access} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

test('reads uploaded HTML metadata and safely handles attributes and entities',()=>{
  const source=`<!-- <meta name="category" content="错误"> --><script>const x='<meta name="category" content="错误">'</script><title>学习 &amp; 记录</title><meta CONTENT='2026-10-07' NAME='date'><meta name="description" content="A > B &amp; C"><meta name=category content=技术><meta name="keywords" content="HTML，笔记"><body><h1>正文标题</h1></body>`;
  const post=readMetadata(source,'中文 文件.html','2026-01-01');
  assert.equal(post.title,'学习 & 记录');
  assert.equal(post.description,'A > B & C');
  assert.equal(post.category,'技术');
  assert.equal(post.date,'2026-10-07');
  assert.deepEqual(post.tags,['HTML','笔记']);
  assert.equal(post.href,'posts/%E4%B8%AD%E6%96%87%20%E6%96%87%E4%BB%B6.html');
});

test('supports ordinary HTML without metadata and rejects impossible dates',()=>{
  const post=readMetadata('<h1>普通页面</h1><p>内容</p>','2026-05-03-note.html','2026-01-01');
  assert.equal(post.title,'普通页面');
  assert.equal(post.date,'2026-05-03');
  assert.equal(post.category,'随笔');
  assert.equal(readMetadata('<p>内容</p>','plain.html','2026-02-03').date,'2026-02-03');
  assert.equal(validDate('2026-02-30'),false);
  assert.throws(()=>readMetadata('<meta name=date content=2026-02-30>','bad.html','2026-01-01'),/日期无效/);
});

test('build publishes raw articles and assets, indexes safely, updates deletions and handles no posts',async()=>{
  const project=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
  const scratch=path.join(project,'.test-tmp');
  await mkdir(scratch,{recursive:true});
  const root=await mkdtemp(path.join(scratch,'build-'));
  try{
    await mkdir(path.join(root,'posts','nested'),{recursive:true});
    await mkdir(path.join(root,'assets'),{recursive:true});
    await writeFile(path.join(root,'site.config.json'),JSON.stringify({title:'测试',author:'Ayuan',url:'https://example.com/blog/',language:'zh-CN',description:'摘要',hero:['第一行','第二行'],about:['关于'],github:'https://github.com/Ayuan2002'}));
    const raw='<title>&lt;img src=x onerror=alert(1)&gt;</title><meta name="date" content="2026-10-07"><meta name="category" content="&quot; onclick=&quot;bad"><body>原样发布</body>';
    await writeFile(path.join(root,'posts','new.html'),raw);
    await writeFile(path.join(root,'posts','nested','old.htm'),'<title>旧文</title><meta name="date" content="2025-01-01">');
    await writeFile(path.join(root,'posts','nested','image.svg'),'<svg/>');
    await writeFile(path.join(root,'posts','.hidden.html'),'<title>隐藏</title>');
    await writeFile(path.join(root,'assets','style.css'),'body{}');
    let result=await build(root);
    assert.deepEqual(result.posts.map(p=>p.date),['2026-10-07','2025-01-01']);
    assert.equal(await readFile(path.join(result.dist,'posts','new.html'),'utf8'),raw);
    await access(path.join(result.dist,'posts','nested','image.svg'));
    await assert.rejects(access(path.join(result.dist,'posts','.hidden.html')));
    const index=await readFile(path.join(result.dist,'index.html'),'utf8');
    assert.ok(index.includes('&lt;img src=x onerror=alert(1)&gt;'));
    assert.ok(!index.includes('<img src=x'));
    assert.ok(index.includes('href="/blog/assets/style.css"'));
    assert.ok(index.includes('href="posts/nested/old.htm"'));
    assert.ok((await readFile(path.join(result.dist,'feed.xml'),'utf8')).includes('https://example.com/blog/posts/new.html'));
    assert.ok((await readFile(path.join(result.dist,'sitemap.xml'),'utf8')).includes('https://example.com/blog/posts/nested/old.htm'));
    await rm(path.join(root,'posts','new.html'));
    await rm(path.join(root,'posts','nested','old.htm'));
    result=await build(root);
    assert.equal(result.posts.length,0);
    await assert.rejects(access(path.join(result.dist,'posts','new.html')));
    assert.ok((await readFile(path.join(result.dist,'index.html'),'utf8')).includes('文字，正在路上。'));
    const config=JSON.parse(await readFile(path.join(root,'site.config.json'),'utf8'));
    config.url='https://example.com/';
    await writeFile(path.join(root,'site.config.json'),JSON.stringify(config));
    await build(root);
    assert.ok((await readFile(path.join(result.dist,'404.html'),'utf8')).includes('href="/assets/style.css"'));
  }finally{
    if(path.dirname(root)!==scratch)throw new Error('Unexpected test directory');
    await rm(root,{recursive:true,force:true});
  }
});
