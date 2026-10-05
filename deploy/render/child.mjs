// Deployment composition only. All HTTP, authority and payment classes are frozen.
import {ProductDatabase} from '../../dist/src/product/db.js';
import {createProductServer} from '../../dist/src/product/server.js';
import {createMerchantServer} from '../../dist/src/merchant/server.js';
import {ProductService} from '../../dist/src/product/service.js';
import {OpenAiProvider,OfflineDemoProvider} from '../../dist/src/product/ai.js';
import {PayPalAdapter} from '../../dist/src/paypal.js';
import {CommitmentService} from '../../dist/src/product/commitments.js';
import {CaptureSagaService} from '../../dist/src/product/capture-saga.js';
import {RenderCommunicationService} from './communication.mjs';
import {CONSUMER_COOKIE,MERCHANT_COOKIE} from './config.mjs';
import {AgentCoordinator} from '../../dist/src/product/agents.js';
import {MerchantOfferService} from '../../dist/src/merchant/offers.js';

const kind=process.argv[2];
let database,server,coordinator,stopWorker,closing=false;
const send=value=>{if(process.connected)process.send(value);};
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
  if(!['consumer','merchant'].includes(kind))throw Error('Invalid child kind');
  if(process.env.PAYPAL_ENVIRONMENT!=='sandbox')throw Error('Sandbox only');
  database=new ProductDatabase(process.env.PRODUCT_DATABASE_PATH);
  if(kind==='consumer'){
    const mode=process.env.AI_MODE;
    if(!['openai','offline-demo'].includes(mode))throw Error('Invalid AI mode');
    const ai=mode==='offline-demo'?new OfflineDemoProvider():new OpenAiProvider(process.env.OPENAI_API_KEY??'',process.env.OPENAI_MODEL??'gpt-5.6-terra');
    const gateway=process.env.PAYPAL_CLIENT_ID&&process.env.PAYPAL_CLIENT_SECRET?new PayPalAdapter(process.env.PAYPAL_CLIENT_ID,process.env.PAYPAL_CLIENT_SECRET):undefined;
    const commitments=new CommitmentService(database,gateway,process.env.PUBLIC_CONSUMER_ORIGIN,process.env.PAYPAL_MERCHANT_ID);
    const sagas=new CaptureSagaService(database,commitments,gateway,false);
    const service=new ProductService(database,ai,mode,commitments,sagas);
    const communication=new RenderCommunicationService(database,{publicKey:process.env.WEB_PUSH_VAPID_PUBLIC_KEY,privateKey:process.env.WEB_PUSH_VAPID_PRIVATE_KEY,contact:process.env.WEB_PUSH_CONTACT},process.env.WEB_PUSH_ENABLED==='true');
    coordinator=new AgentCoordinator(database,service,communication);stopWorker=coordinator.start();
    server=createProductServer(service,undefined,{coordinator,cookieName:CONSUMER_COOKIE,origin:process.env.PUBLIC_CONSUMER_ORIGIN,allowHistoricalReplay:false});
  }else server=createMerchantServer({cookieName:MERCHANT_COOKIE,origin:process.env.PUBLIC_MERCHANT_ORIGIN,key:process.env.OPENAI_API_KEY,model:process.env.OPENAI_MODEL,licenseKey:process.env.AG_STUDIO_LICENSE_KEY,offers:new MerchantOfferService(database)});
  server.once('error',()=>{send({type:'failed'});process.exit(1);});
  server.listen(Number(kind==='consumer'?process.env.PRODUCT_PORT:process.env.MERCHANT_PORT),'127.0.0.1',()=>send({type:'ready'}));
}catch{send({type:'failed'});database?.close();process.exitCode=1;process.disconnect?.();}
