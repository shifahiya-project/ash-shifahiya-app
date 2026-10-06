#!/usr/bin/env python3
"""Import a supplied DOCX and recording without normalising its Unicode text."""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import tempfile
import xml.etree.ElementTree as ET
import zipfile

ROOT = Path(__file__).resolve().parent.parent
W = '{http://schemas.openxmlformats.org/wordprocessingml/2006/main}'

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('lesson', type=int)
    parser.add_argument('document', type=Path)
    parser.add_argument('audio', type=Path)
    args = parser.parse_args()
    if not 1 <= args.lesson <= 100:
        parser.error('The first course has lessons 1–100')
    with zipfile.ZipFile(args.document) as archive:
        document = ET.fromstring(archive.read('word/document.xml'))
    if any(next(document.iter(W + tag), None) is not None for tag in ['footnoteReference', 'tbl', 'delText']):
        parser.error('Footnotes, tables or tracked deletions require manual review')
    paragraphs = []
    for paragraph in document.findall('.//' + W + 'body/' + W + 'p'):
        text = ''.join(node.text or '' if node.tag == W + 't' else '\t' if node.tag == W + 'tab' else '\n'
                       for node in paragraph.iter() if node.tag in {W + 't', W + 'tab', W + 'br', W + 'cr'})
        paragraphs.append(text)
    if not any(paragraphs):
        parser.error('No text found')
    audio_path = ROOT / f'public/audio/shifahiya-1/lesson-{args.lesson}.mp3'
    text_path = ROOT / f'public/text/shifahiya-1/lesson-{args.lesson}.json'
    if audio_path.exists() or text_path.exists():
        parser.error('Lesson already exists; review updates manually instead of overwriting')
    catalog_path = ROOT / 'public/text-and-audio/catalog.json'
    catalog = json.loads(catalog_path.read_text()) if catalog_path.exists() else []
    if any(item['lessonId'] == args.lesson for item in catalog):
        parser.error('Lesson already has listening materials; review updates manually')
    for path in [audio_path, text_path, catalog_path]:
        path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(dir=audio_path.parent) as temp:
        encoded = Path(temp) / 'recording.mp3'
        subprocess.run(['ffmpeg', '-nostdin', '-hide_banner', '-loglevel', 'error', '-i', str(args.audio),
                        '-map', '0:a:0', '-map_metadata', '-1', '-c:a', 'libmp3lame', '-b:a', '96k', str(encoded)], check=True)
        duration = float(subprocess.check_output(['ffprobe', '-v', 'error', '-show_entries', 'format=duration',
                                                 '-of', 'default=noprint_wrappers=1:nokey=1', str(encoded)]))
        text = {'lessonId': args.lesson, 'paragraphs': paragraphs,
                'sourceSha256': hashlib.sha256(args.document.read_bytes()).hexdigest()}
        text_path.write_text(json.dumps(text, ensure_ascii=False, indent=2) + '\n')
        encoded.replace(audio_path)
    catalog.append({'lessonId': args.lesson, 'duration': round(duration, 3),
                    'audioSrc': f'./audio/shifahiya-1/lesson-{args.lesson}.mp3',
                    'textSrc': f'./text/shifahiya-1/lesson-{args.lesson}.json'})
    catalog.sort(key=lambda item: item['lessonId'])
    catalog_path.write_text(json.dumps(catalog, ensure_ascii=False, indent=2) + '\n')
    print(f'Lesson {args.lesson}: {len(paragraphs)} paragraphs, {duration:.1f}s, {audio_path.stat().st_size} bytes')

if __name__ == '__main__':
    main()
