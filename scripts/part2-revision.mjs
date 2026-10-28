import assert from 'node:assert/strict';
import {writeFile,readdir} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';

const canonical = value => value.normalize('NFC');
const lemma = value => canonical(value).split(/[()،;,–—]/)[0].replace(/[ً-ْٰـ]/g,'').replace(/[^ء-ي]/g,'');
const gloss = value => new Set(value.toLowerCase().match(/[а-яё]{4,}/g)?.map(s=>s.slice(0,5)) ?? []);
const sharesMeaning = (a,b) => [...gloss(a)].some(s=>gloss(b).has(s));
const kinds = {adjective:'adj',proper_noun:'noun',particle:'expression',term:'noun',interjection:'expression'};

/** Import a complete, source-linked revision without assigning old review boxes to new words. */
export async function importRevision(glossary, reading, {directory, render, locate}) {
  assert.equal(glossary.schemaVersion,2);
  assert.equal(glossary.lessons.length,105);
  assert.equal(glossary.entryCount,2823);
  assert.equal(reading.lessons.length,105);
  const old=[];
  for(const file of (await readdir(directory)).filter(f=>/^lesson-\d+\.ts$/.test(f))) {
    old.push(Object.values(await import(pathToFileURL(directory+file).href))[0]);
  }
  const byId=new Map(old.map(l=>[l.id,l]));
  const bookMap=new Map();
  const ids=new Set();const lessons=[];let retained=0,added=0;
  for(const [i,entry] of glossary.lessons.entries()) {
    const text=reading.lessons[i];assert.equal(entry.number,i+1);assert.equal(text.number,entry.number);
    const previous=byId.get(entry.number);assert(previous);
    assert.equal(entry.book,text.book);
    if(bookMap.has(entry.book))assert.equal(bookMap.get(entry.book),previous.book);
    bookMap.set(entry.book,previous.book);
    assert.equal(entry.newCount,entry.entries.length);
    const contexts=new Map(entry.contexts.map(c=>[c.id,c]));
    assert.equal(contexts.size,entry.contexts.length);
    const source=new Map();
    for(const story of text.stories) {
      source.set(story.id,{arabic:story.arabicTitle,russian:story.title});
      for(const sentence of story.sentences)source.set(sentence.id,sentence);
    }
    for(const context of contexts.values()) {
      assert(source.has(context.id),context.id);
      assert.equal(context.arabic,source.get(context.id).arabic,context.id);
      assert.equal(context.russian,source.get(context.id).russian,context.id);
    }
    const used=new Set();let next=previous.words.reduce((n,w,j)=>Math.max(n,(w.reviewIndex??j)+1),previous.reviewIndexCeiling??0);
    const words=entry.entries.map(raw=>{
      assert(!ids.has(raw.id),raw.id);ids.add(raw.id);
      const context=contexts.get(raw.source_ref);assert(context?.entry_ids.includes(raw.id),raw.id);
      const exact=previous.words.map((w,j)=>({w,j})).filter(({w,j})=>!used.has(j)&&w.source?.id===raw.id&&lemma(w.arabic)===lemma(raw.arabic)&&w.russian===raw.russian);
      const matches=exact.length===1?exact:previous.words.map((w,j)=>({w,j})).filter(({w,j})=>!used.has(j)&&lemma(w.arabic)===lemma(raw.arabic)&&sharesMeaning(w.russian,raw.russian));
      let reviewIndex;
      if(matches.length===1){const {w,j}=matches[0];used.add(j);reviewIndex=w.reviewIndex??j;retained++;}
      else {reviewIndex=next++;added++;}
      const contextArabic=canonical(context.arabic),contextRussian=context.russian;
      // An expression is checked as a whole sentence, never by hiding a shared
      // particle such as ما. Verb complements (عليه) are not verb answers.
      const functionWords=new Set(['ما','لا','عليه','عليها','به','بها','في','من','عن','على','إلى']);
      const verbForms=[raw.past,raw.present,raw.masdar].filter(Boolean).map(f=>f.split(/\s+/).find(t=>!functionWords.has(t.replace(/[ً-ْٰـ]/g,'')))).filter(Boolean);
      const candidate=raw.kind==='verb'&&verbForms.length?{...raw,arabic:verbForms.join(' ')}:raw;
      const form=raw.kind==='expression'?null:locate({...candidate,context_ar:contextArabic});
      return {arabic:canonical(raw.arabic),russian:raw.russian,kind:kinds[raw.kind]??raw.kind,
        contextArabic,contextRussian,...(form?{contextForm:form}:{}),reviewIndex,source:raw};
    });
    assert.equal(new Set(words.map(w=>w.reviewIndex)).size,words.length);
    const stories=text.stories.map(s=>({arabicTitle:canonical(s.arabicTitle),title:s.title,
      sentences:s.sentences.map(s=>({arabic:canonical(s.arabic),russian:s.russian}))}));
    lessons.push({id:entry.number,book:previous.book,title:stories[0].title,revision:'2026-10-28',reviewIndexCeiling:next,words,stories});
  }
  assert.equal(ids.size,2823);
  assert.equal(bookMap.size,6);
  assert.equal(new Set(bookMap.values()).size,6);
  assert.equal(glossary.lessons.reduce((n,l)=>n+l.contexts.length,0),1693);
  assert.equal(lessons.reduce((n,l)=>n+l.stories.reduce((n,s)=>n+s.sentences.length,0),0),3618);
  for(const lesson of lessons)await writeFile(directory+`lesson-${String(lesson.id).padStart(2,'0')}.ts`,render(lesson));
  const summaries=lessons.map(l=>({id:l.id,book:l.book,title:l.title,wordCount:l.words.length,
    storyCount:l.stories.length,sentenceCount:l.stories.reduce((n,s)=>n+s.sentences.length,0),storyTitles:l.stories.map(s=>s.title)}));
  await writeFile(directory+'manifest.ts','// Generated by scripts/import-part2.mjs — do not edit by hand.\nimport type { Part2Summary } from "../types";\n\nexport const part2Summaries: Part2Summary[] = '+JSON.stringify(summaries,null,2)+';\n');
  console.log(JSON.stringify({lessons:105,words:ids.size,stories:253,sentences:3618,retainedReviewAddresses:retained,newReviewAddresses:added}));
}
