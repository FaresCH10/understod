import {preparationStage} from '../preparation-progress.mjs';

// The caller must hold the current job lease lock in the same transaction.
export async function appendPreparationStage(client,job,input) {
  const event=preparationStage(input);
  const existing=(await client.query(`SELECT stage,language,track,state,origin,error_code FROM preparation_stage_events
    WHERE job_id=$1 AND run_id=$2 AND step=$3 ORDER BY state`,[job.id,job.token,event.step])).rows;
  const same=row=>row.stage===event.stage && row.language===event.language && row.track===event.track && row.origin===event.origin;
  const replay=existing.find(row=>row.state===event.state);
  if(replay) {
    if(!same(replay) || replay.error_code!==event.errorCode) throw Error('Preparation stage replay conflict');
    return;
  }
  if(existing.some(row=>!same(row)) || (['completed','failed'].includes(event.state)
    ? existing.length!==1 || existing[0].state!=='started' : existing.length!==0)) throw Error('Invalid preparation stage transition');
  await client.query(`INSERT INTO preparation_stage_events(job_id,org_id,site_id,briefing_id,revision,run_id,step,stage,language,track,state,origin,error_code)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
  [job.id,job.org_id,job.site_id,job.briefing_id,job.revision,job.token,event.step,event.stage,event.language,event.track,event.state,event.origin,event.errorCode]);
}

export const systemStage=(stage,state,errorCode=null)=>({step:{worker:0,storage:100,finalization:101}[stage],
  stage,language:null,track:null,state,origin:'system',errorCode});

export async function preparationProgress(client,scope,job) {
  const runs=(await client.query(`SELECT run_id,min(occurred_at) AS started_at FROM preparation_stage_events
    WHERE job_id=$1 AND org_id=$2 AND site_id=$3 GROUP BY run_id ORDER BY started_at DESC,run_id LIMIT 3`,
  [job.id,scope.org_id,scope.site_id])).rows;
  const attempts=[];
  for(const run of runs) {
    const events=(await client.query(`SELECT step,stage,language,track,state,origin,error_code AS "errorCode",occurred_at
      FROM preparation_stage_events WHERE job_id=$1 AND org_id=$2 AND site_id=$3 AND run_id=$4
      ORDER BY occurred_at,step,state LIMIT 200`,[job.id,scope.org_id,scope.site_id,run.run_id])).rows;
    attempts.push({current:job.status==='processing' ? job.lease_token===run.run_id : job.status!=='queued' && attempts.length===0,
      startedAt:run.started_at.toISOString(),events:events.map(({occurred_at,...event})=>({...event,occurredAt:occurred_at.toISOString()}))});
  }
  return {available:attempts.length>0,attempts};
}
