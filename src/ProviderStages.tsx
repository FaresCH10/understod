import './provider-stages.css';

export type PipelineStatus={dataClass:string;realDataAllowed:boolean;productionReady:boolean;stages:{id:string;name:string;configuration:string;verification:string;models:string[];declaredLanguages:string[];evidence:string}[]};

export function ProviderStages({pipeline}:{pipeline:PipelineStatus}) {
  return <div className="provider-stages">{pipeline.stages.map(stage=><section className="provider-stage" key={stage.id} aria-labelledby={`provider-stage-${stage.id}`}><div><h3 id={`provider-stage-${stage.id}`}>{stage.name}</h3><span className="provider-stage-config">{stage.configuration==='configured'?'Configured':'Disabled'}</span></div><dl><div><dt>Declared languages</dt><dd>{stage.declaredLanguages.map(code=>code.toUpperCase()).join(', ') || 'Not declared'}</dd></div><div><dt>Models</dt><dd>{stage.models.join(', ') || 'None enabled'}</dd></div><div><dt>Stage verification</dt><dd>{stage.verification.replaceAll('_',' ')}</dd></div></dl><p className="muted">{stage.evidence}</p></section>)}</div>;
}
