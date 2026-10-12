import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {openDatabase} from '../server/db.mjs';
import {seed} from '../server/seed.mjs';
import {ensureBriefingSchema} from '../server/preparation.mjs';
import {ensureSettingsSchema,getDraftLanguageSelection,readGenerationLanguages} from '../server/settings.mjs';
import {saveDraftLanguages,draftLanguagesReceipt} from '../server/draft-languages.mjs';
import {processOne} from '../server/worker.mjs';

test('saved language selection re-prepares one revision and preserves published history',()=>{
  const db=openDatabase(':memory:');seed(db);ensureBriefingSchema(db);ensureSettingsSchema(db);
  const actor={principal_type:'staff',principal_id:'maya',org_id:'cedar',site_id:'beirut',role:'owner'};
  try {
    const snapshot=db.prepare("SELECT snapshot_json FROM publications WHERE id='shelf-v3'").get().snapshot_json;
    const input={requestId:randomUUID(),revision:1,generationLanguages:['en','ar'],confirmed:true};
    assert.deepEqual(saveDraftLanguages(db,actor,'shelf',input),{id:'shelf',revision:2,duplicate:false});
    assert.equal(saveDraftLanguages(db,actor,'shelf',input).duplicate,true);
    assert.deepEqual(getDraftLanguageSelection(db,'cedar','beirut','shelf'),['en','ar']);
    assert.equal(draftLanguagesReceipt(db,actor,input.requestId).revision,2);
    assert.throws(()=>saveDraftLanguages(db,actor,'shelf',{...input,generationLanguages:['en']}),/conflict/);
    assert.throws(()=>saveDraftLanguages(db,{...actor,role:'auditor'},'shelf',input),/Forbidden/);
    assert.equal(db.prepare("SELECT COUNT(*) n FROM jobs WHERE briefing_id='shelf' AND revision=2").get().n,1);
    processOne(db);assert.deepEqual(Object.keys(JSON.parse(db.prepare("SELECT prepared_json FROM briefings WHERE id='shelf'").get().prepared_json).languages),['en','ar']);
    saveDraftLanguages(db,actor,'shelf',{requestId:randomUUID(),revision:2,generationLanguages:null,confirmed:true});
    assert.equal(getDraftLanguageSelection(db,'cedar','beirut','shelf'),null);assert.deepEqual(readGenerationLanguages(db,'cedar','beirut',['en','ar','ur'],'shelf'),['en','ar','ur']);
    assert.equal(db.prepare("SELECT snapshot_json FROM publications WHERE id='shelf-v3'").get().snapshot_json,snapshot);
  }finally{db.close();}
});
