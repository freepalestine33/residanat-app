import { readFile, writeFile } from 'node:fs/promises';

const [sourcePath, targetPath] = process.argv.slice(2);
if (!sourcePath || !targetPath) throw new Error('Usage: node scripts/import-residency-html.mjs <source.html> <target.json>');

function decode(value) {
  return value.replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (entity, key) => {
    if (key[0] === '#') return String.fromCodePoint(key[1]?.toLowerCase() === 'x' ? parseInt(key.slice(2), 16) : Number(key.slice(1)));
    return ({ amp: '&', apos: "'", nbsp: ' ', quot: '"', lt: '<', gt: '>' })[key.toLowerCase()] ?? entity;
  }).replace(/\s+/g, ' ').trim();
}

function repair(value) {
  if (!/[ÃÂâ]/.test(value)) return value;
  const bytes = Uint8Array.from(value, (char) => char.charCodeAt(0) & 255);
  try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch { return value; }
}

function parse(html) {
  const root = { tag: 'root', attrs: {}, children: [] };
  const stack = [root];
  const voidTags = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);
  for (const token of html.matchAll(/<!--[\s\S]*?-->|<![^>]*>|<\/?[a-zA-Z][^>]*>|[^<]+/g)) {
    const value = token[0];
    if (value.startsWith('<!--') || value.startsWith('<!')) continue;
    if (value.startsWith('</')) {
      const tag = value.slice(2).match(/^([\w-]+)/)?.[1]?.toLowerCase();
      const index = stack.map((node) => node.tag).lastIndexOf(tag);
      if (index > 0) stack.length = index;
      continue;
    }
    if (!value.startsWith('<')) { stack.at(-1).children.push(repair(decode(value))); continue; }
    const tag = value.match(/^<([\w-]+)/)?.[1]?.toLowerCase();
    if (!tag) continue;
    const attrs = {};
    const attrText = value.slice(tag.length + 1, -1);
    for (const attr of attrText.matchAll(/([\w-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s/>]+)))?/g)) {
      attrs[attr[1].toLowerCase()] = decode(attr[2] ?? attr[3] ?? attr[4] ?? '');
    }
    const node = { tag, attrs, children: [] };
    stack.at(-1).children.push(node);
    if (!voidTags.has(tag) && !value.endsWith('/>')) stack.push(node);
  }
  return root;
}

const hasClass = (node, name) => (node.attrs.class ?? '').split(/\s+/).includes(name);
const elements = (node) => node.children.filter((child) => typeof child !== 'string');
const find = (node, predicate) => elements(node).find(predicate);
const descendants = (node, predicate) => elements(node).flatMap((child) => [ ...(predicate(child) ? [child] : []), ...descendants(child, predicate) ]);
const text = (node) => node ? repair(node.children.map((child) => typeof child === 'string' ? child : text(child)).join(' ').replace(/\s+/g, ' ').trim()) : '';

const tree = parse(await readFile(sourcePath, 'utf8'));
const result = { B: { name: 'Biologie', groups: [] }, M: { name: 'Médecine', groups: [] }, C: { name: 'Chirurgie', groups: [] } };
for (const code of Object.keys(result)) {
  const section = descendants(tree, (node) => node.tag === 'section' && node.attrs.id === `sec${code}`)[0];
  for (const module of descendants(section, (node) => node.tag === 'details' && hasClass(node, 'mod'))) {
    const summary = find(module, (node) => node.tag === 'summary');
    const title = find(summary, (node) => node.tag === 'span' && hasClass(node, 'mt'));
    const group = { name: text(title), items: [] };
    for (const lecture of descendants(module, (node) => node.tag === 'details' && hasClass(node, 'lec'))) {
      const summaryNode = find(lecture, (node) => node.tag === 'summary');
      const number = find(summaryNode, (node) => node.tag === 'b' && hasClass(node, 'n'));
      const lectureTitle = find(summaryNode, (node) => node.tag === 'span' && hasClass(node, 'lt'));
      const description = find(lecture, (node) => node.tag === 'div' && hasClass(node, 'd'));
      const sourceBlock = find(lecture, (node) => node.tag === 'div' && hasClass(node, 'src'));
      const item = { n: text(number), t: text(lectureTitle), d: text(description), w: '', s: '', courseSource: '', qcmSource: '', alternativeCourseSource: '', alternativeQcmSource: '' };
      for (const source of elements(sourceBlock ?? { children: [] }).filter((node) => node.tag === 'div')) {
        const heading = text(find(source, (node) => node.tag === 'h4')).toLowerCase();
        const key = heading === 'qcm' ? 'qcm' : 'course';
        item[`${key}Source`] = text(find(source, (node) => node.tag === 'p'));
        const alternative = find(source, (node) => node.tag === 'div' && hasClass(node, 'alt'));
        item[`alternative${key === 'qcm' ? 'Qcm' : 'Course'}Source`] = alternative ? text(alternative).replace(/^Brahimi 2017-18\s*:\s*/i, '') : '';
      }
      item.s = [item.courseSource, item.qcmSource].filter(Boolean).join('; ');
      group.items.push(item);
    }
    result[code].groups.push(group);
  }
}
const counts = Object.fromEntries(Object.entries(result).map(([code, section]) => [code, section.groups.reduce((sum, group) => sum + group.items.length, 0)]));
if (JSON.stringify(counts) !== JSON.stringify({ B: 54, M: 99, C: 56 })) throw new Error(`Expected exact 209 lecture counts, got ${JSON.stringify(counts)}`);
if (Object.values(result).some((section) => section.groups.some((group) => !group.name || group.items.some((item) => !item.n || !item.t)))) throw new Error('A module or lecture is missing its name or number.');
await writeFile(targetPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
console.log(`Imported 209 lectures from HTML: ${JSON.stringify(counts)}`);
