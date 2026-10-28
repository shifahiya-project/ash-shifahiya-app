import assert from 'node:assert/strict';
import {readdir} from 'node:fs/promises';
import test from 'node:test';
import {upgradePart2Session} from '../app/part2-session.ts';

const dir=new URL('../content/part2/',import.meta.url);
const lessons=await Promise.all((await readdir(dir)).filter(f=>/^lesson-\d+\.ts$/.test(f)).map(async f=>Object.values(await import(new URL(f,dir)))[0]));

test('the complete corrected second course contains every supplied word and reading fragment',()=>{
  assert.equal(lessons.length,105);
  assert.equal(lessons.reduce((n,l)=>n+l.words.length,0),2823);
  assert.equal(lessons.reduce((n,l)=>n+l.stories.length,0),253);
  assert.equal(lessons.reduce((n,l)=>n+l.stories.reduce((n,s)=>n+s.sentences.length,0),0),3618);
  assert.equal(new Set(lessons.map(l=>l.book)).size,6);
});

test('each vocabulary context is the exact source pair identified in its own revised lesson',()=>{
  const ids=new Set();
  for(const lesson of lessons){
    assert.equal(lesson.revision,'2026-10-28');
    let n=0;const sources=new Map();
    for(const story of lesson.stories){
      sources.set(`p2-${String(lesson.id).padStart(3,'0')}-${String(++n).padStart(3,'0')}`,{arabic:story.arabicTitle,russian:story.title});
      for(const pair of story.sentences)sources.set(`p2-${String(lesson.id).padStart(3,'0')}-${String(++n).padStart(3,'0')}`,pair);
    }
    const addresses=new Set();
    for(const word of lesson.words){
      assert(!ids.has(word.source.id));ids.add(word.source.id);
      assert(!addresses.has(word.reviewIndex));addresses.add(word.reviewIndex);
      assert(Number.isInteger(word.reviewIndex)&&word.reviewIndex>=0&&word.reviewIndex<lesson.reviewIndexCeiling);
      if(word.source.kind==='expression')assert.equal(word.contextForm,undefined,
        'an expression must not be reduced to a shared particle');
      if(word.source.passive_only)assert.notEqual(word.contextForm,'عَلَيْهِ',
        'a verb complement is not the verb to be recalled');
      const pair=sources.get(word.source.source_ref);assert(pair,word.source.source_ref);
      assert.equal(word.contextArabic,pair.arabic);
      assert.equal(word.contextRussian,pair.russian);
    }
  }
});

test('an old unfinished session is archived rather than applied to unrelated revised question indices',()=>{
  const old={lessonId:1,flowVersion:2,view:'practice',index:17,contextIndex:17,score:12,mistakes:['old'],vocabularyScore:30,answered:{option:'old',correct:true}};
  const current=upgradePart2Session(old,40,'2026-10-28');
  assert.equal(current.view,'learn');assert.equal(current.index,0);
  assert.equal(current.score,0);assert.equal(current.answered,undefined);
  assert.deepEqual(current.archivedSession,old);
  assert.equal(old.index,17);
  assert.equal(upgradePart2Session(current,40,'2026-10-28'),current);
});
