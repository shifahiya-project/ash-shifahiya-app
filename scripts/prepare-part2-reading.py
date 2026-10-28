#!/usr/bin/env python3
"""Extract a complete corrected second-course DOCX into source-linked reading JSON."""
import argparse
import hashlib
import json
from pathlib import Path
import re
import xml.etree.ElementTree as ET
import zipfile

W = '{http://schemas.openxmlformats.org/wordprocessingml/2006/main}'
ROOT = Path(__file__).resolve().parent.parent

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('document', type=Path)
    parser.add_argument('output', type=Path)
    parser.add_argument('--update-listening', action='store_true', help='Replace existing course-two transcripts; keep recordings and catalogue membership')
    args = parser.parse_args()
    with zipfile.ZipFile(args.document) as archive:
        document = ET.fromstring(archive.read('word/document.xml'))
    if any(next(document.iter(W + tag), None) is not None for tag in ['footnoteReference', 'tbl', 'delText']):
        parser.error('Tables, footnotes or tracked deletions require manual review')
    paragraphs = []
    for p in document.findall('./' + W + 'body/' + W + 'p'):
        text = ''.join(n.text or '' if n.tag == W+'t' else '\t' if n.tag == W+'tab' else '\n'
                       for n in p.iter() if n.tag in {W+'t', W+'tab', W+'br', W+'cr'})
        if text.strip():
            style = p.find('./'+W+'pPr/'+W+'pStyle')
            paragraphs.append((text, style.get(W+'val', '') if style is not None else ''))
    lessons = []; current = None; story = None; counter = 0; i = 0
    while i < len(paragraphs):
        text, style = paragraphs[i]
        match = re.fullmatch(r'Урок (\d+)', text.strip())
        if match:
            number = int(match[1]); assert number == len(lessons)+1
            current = {'number':number, 'book':paragraphs[i+1][0], 'stories':[]}
            lessons.append(current); story = None; counter = 0; i += 2; continue
        if current is None:
            i += 1; continue
        assert re.search('[ء-ي]', text), (i, text)
        russian, russian_style = paragraphs[i+1]
        assert re.search('[а-яА-ЯёЁ]', russian), (i, russian)
        counter += 1; ref = f'p2-{current["number"]:03d}-{counter:03d}'
        if russian_style.lower() == 'heading2':
            story = {'id':ref, 'arabicTitle':text, 'title':russian, 'sentences':[]}
            current['stories'].append(story)
        else:
            assert story is not None
            story['sentences'].append({'id':ref, 'arabic':text, 'russian':russian})
        i += 2
    assert len(lessons) == 105
    assert sum(len(l['stories']) for l in lessons) == 253
    assert sum(len(s['sentences']) for l in lessons for s in l['stories']) == 3618
    result = {'sourceSha256':hashlib.sha256(args.document.read_bytes()).hexdigest(), 'lessons':lessons}
    args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2)+'\n')
    updated = 0
    if args.update_listening:
        catalog_path = ROOT / 'public/text-and-audio/catalog.json'
        catalog = json.loads(catalog_path.read_text())
        for item in catalog:
            if item.get('courseId', 1) != 2: continue
            lesson = lessons[item['lessonId']-1]
            text_path = ROOT / f'public/text/reading-2/lesson-{item["lessonId"]}.json'
            assert text_path.exists()
            text = json.loads(text_path.read_text())
            text['paragraphs'] = [part for s in lesson['stories'] for part in [s['arabicTitle'], *[p['arabic'] for p in s['sentences']]] if part]
            text['sourceSha256'] = result['sourceSha256']
            text_path.write_text(json.dumps(text, ensure_ascii=False, indent=2)+'\n')
            digest = hashlib.sha256(text_path.read_bytes()).hexdigest()[:16]
            item['textSrc'] = item['textSrc'].split('?')[0]+'?v='+digest
            updated += 1
        catalog_path.write_text(json.dumps(catalog, ensure_ascii=False, indent=2)+'\n')
    print(json.dumps({'lessons':105, 'stories':253, 'sentences':3618, 'listeningTranscriptsUpdated':updated}))

if __name__ == '__main__': main()
