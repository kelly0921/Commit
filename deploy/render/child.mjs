// Deployment composition only. All HTTP, authority and payment classes are frozen.
import {CONSUMER_COOKIE,MERCHANT_COOKIE} from './config.mjs';
import {requireStartup,startupFailureRecord} from './diagnostics.mjs';

const kind=process.argv[2];
let stage=['consumer','merchant'].includes(kind)?kind:'launcher',fallback='runtime_initialization_failed';
let database,server,coordinator,stopWorker,closing=false;
const send=value=>{if(process.connected)process.send(value);};
function failStartup(error){
  const record=startupFailureRecord(error,stage,fallback),payload={type:'failed',stage:record.stage,reason:record.reason};
  // Flush only these labels before exiting; raw stdout/stderr stay suppressed.
  if(process.connected)process.send(payload,()=>process.exit(1));else process.exit(1);
}
async function shutdown(){
  if(closing)return;closing=true;stopWorker?.();
  // Stop new HTTP work, let accepted requests and the existing worker drain finish.
  const httpClosed=new Promise(resolve=>{if(!server?.listening)resolve();else{server.close(resolve);server.closeIdleConnections();}});
  await httpClosed;
  while(coordinator?.running)await new Promise(resolve=>setTimeout(resolve,25));
  database?.close();send({type:'stopped'});process.disconnect?.();
}
process.on('message',message=>{
  if(message?.type==='shutdown')void shutdown().catch(()=>process.exit(1));
  else if(message?.type==='health'){
    let ok=false;try{ok=!closing&&server.listening&&database.get('SELECT MAX(version) AS version FROM schema_migrations').version===6;}catch{}
    send({type:'health',id:message.id,ok});
  }
});
for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>void shutdown().catch(()=>process.exit(1)));
process.on('disconnect',()=>void shutdown().catch(()=>process.exit(1)));
try{
  requireStartup(['consumer','merchant'].includes(kind),'launcher','runtime_start_failed');
  requireStartup(process.env.PAYPAL_ENVIRONMENT==='sandbox',kind,'non_sandbox_payment_environment');
  stage=kind+'_dependencies';fallback='dependency_load_failed';
  // Same frozen dependencies, loaded inside the safe IPC failure boundary.
  const [{ProductDatabase},{createProductServer},{createMerchantServer},{ProductService},{OpenAiProvider,OfflineDemoProvider},{PayPalAdapter},{CommitmentService},{CaptureSagaService},{RenderCommunicationService},{AgentCoordinator},{MerchantOfferService}]=await Promise.all([
    import('../../dist/src/product/db.js'),import('../../dist/src/product/server.js'),import('../../dist/src/merchant/server.js'),import('../../dist/src/product/service.js'),import('../../dist/src/product/ai.js'),import('../../dist/src/paypal.js'),import('../../dist/src/product/commitments.js'),import('../../dist/src/product/capture-saga.js'),import('./communication.mjs'),import('../../dist/src/product/agents.js'),import('../../dist/src/merchant/offers.js')
  ]);
  // A shutdown received while dependencies load must not start services afterward.
  if(closing)process.exit(0);
  stage=kind+'_database';fallback='database_initialization_failed';
  database=new ProductDatabase(process.env.PRODUCT_DATABASE_PATH);
  stage=kind+'_services';fallback='runtime_initialization_failed';
  if(kind==='consumer'){
    const mode=process.env.AI_MODE;
    requireStartup(['openai','offline-demo'].includes(mode),stage,'invalid_ai_mode');
    const ai=mode==='offline-demo'?new OfflineDemoProvider():new OpenAiProvider(process.env.OPENAI_API_KEY??'',process.env.OPENAI_MODEL??'gpt-5.6-terra');
    const gateway=process.env.PAYPAL_CLIENT_ID&&process.env.PAYPAL_CLIENT_SECRET?new PayPalAdapter(process.env.PAYPAL_CLIENT_ID,process.env.PAYPAL_CLIENT_SECRET):undefined;
    const commitments=new CommitmentService(database,gateway,process.env.PUBLIC_CONSUMER_ORIGIN,process.env.PAYPAL_MERCHANT_ID);
    const sagas=new CaptureSagaService(database,commitments,gateway,false);
    const service=new ProductService(database,ai,mode,commitments,sagas);
    const communication=new RenderCommunicationService(database,{publicKey:process.env.WEB_PUSH_VAPID_PUBLIC_KEY,privateKey:process.env.WEB_PUSH_VAPID_PRIVATE_KEY,contact:process.env.WEB_PUSH_CONTACT},process.env.WEB_PUSH_ENABLED==='true');
    coordinator=new AgentCoordinator(database,service,communication);stopWorker=coordinator.start();
    server=createProductServer(service,undefined,{coordinator,cookieName:CONSUMER_COOKIE,origin:process.env.PUBLIC_CONSUMER_ORIGIN,allowHistoricalReplay:false});
  }else server=createMerchantServer({cookieName:MERCHANT_COOKIE,origin:process.env.PUBLIC_MERCHANT_ORIGIN,key:process.env.OPENAI_API_KEY,model:process.env.OPENAI_MODEL,licenseKey:process.env.AG_STUDIO_LICENSE_KEY,offers:new MerchantOfferService(database)});
  stage=kind+'_listen';fallback='runtime_listen_failed';
  server.once('error',failStartup);
  server.listen(Number(kind==='consumer'?process.env.PRODUCT_PORT:process.env.MERCHANT_PORT),'127.0.0.1',()=>send({type:'ready'}));
}catch(error){try{database?.close();}catch{}failStartup(error);}
