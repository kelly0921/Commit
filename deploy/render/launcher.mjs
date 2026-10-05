import assert from 'node:assert/strict';
import {fork} from 'node:child_process';
import {createServer as controlServer,connect} from 'node:net';
import {existsSync,lstatSync,unlinkSync,writeFileSync,chmodSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve,join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {renderConfig,prepareStorage} from './config.mjs';
import {createGateway} from './gateway.mjs';
import {StartupFailure,startupFailure,startupFailureRecord,childStartupFailure,startupStep,startupStepAsync} from './diagnostics.mjs';

const childFile=fileURLToPath(new URL('./child.mjs',import.meta.url));
const log=(event,kind)=>console.log(JSON.stringify({event,...(kind?{runtime:kind}:{})}));
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
// Disk-backed Render services cannot customize the platform shutdown delay.
// Leave cleanup headroom before Render's documented 30-second default.
const shutdownMs=25000;
export async function startLauncher(config,{control=true,onEvent=log,signal}={}){
  startupStep('storage',()=>prepareStorage(config),'storage_prepare_failed');
  // Catch compiled/native dependency failures before any listener/child opens.
  const {initializeDatabase,resetDatabase}=await startupStepAsync('database',()=>import('./storage.mjs'),'dependency_load_failed');
  let stopping=false,resetting=false,ready=false,controlSocket,ownsControl=false,stopPromise,healthPromise;
  const children=new Map(),runtimeId=randomUUID(),probes=new Map();
  const socketPath=join(config.root,'runtime','control.sock'),metadataPath=join(config.root,'runtime','launcher.json');
  let resolveClosed;const closed=new Promise(resolve=>{resolveClosed=resolve;});
  const available=()=>ready&&!stopping&&!resetting&&children.size===2&&[...children.values()].every(c=>c.connected&&c.exitCode===null&&c.signalCode===null);
  const probe=child=>new Promise(resolve=>{
    if(!child.connected){resolve(false);return;}
    const id=randomUUID(),timer=setTimeout(()=>{probes.delete(id);resolve(false);},1500);
    probes.set(id,{child,done:ok=>{clearTimeout(timer);probes.delete(id);resolve(ok);}});
    child.send({type:'health',id},error=>{if(error)probes.get(id)?.done(false);});
  });
  const health=()=>{
    if(!available())return Promise.resolve(false);
    if(!healthPromise)healthPromise=Promise.all([...children.values()].map(probe)).then(results=>available()&&results.every(Boolean)).finally(()=>{healthPromise=undefined;});
    return healthPromise;
  };
  const gateway=startupStep('gateway',()=>createGateway(config,{health,available}),'gateway_initialization_failed');
  const waitExit=child=>child.exitCode!==null||child.signalCode!==null||!child.pid?Promise.resolve():new Promise(resolve=>child.once('close',resolve));
  async function stopChildren(){
    const current=[...children.values()];
    for(const child of current)if(child.connected)child.send({type:'shutdown'},()=>{});
    await Promise.all(current.map(waitExit));children.clear();
  }
  function spawnRuntime(kind){
    assert.ok(!stopping,'Launcher stopping');
    return new Promise((resolveReady,rejectReady)=>{
      const environment={PATH:process.env.PATH,SystemRoot:process.env.SystemRoot,NODE_ENV:'production',AI_MODE:config.aiMode,PAYPAL_ENVIRONMENT:'sandbox',COMMIT_STAGING:'true',PRODUCT_DATABASE_PATH:config.database,PUBLIC_CONSUMER_ORIGIN:config.consumerOrigin,PUBLIC_MERCHANT_ORIGIN:config.merchantOrigin,PRODUCT_PORT:String(config.consumerPort),MERCHANT_PORT:String(config.merchantPort),TMPDIR:join(config.root,'tmp'),TMP:join(config.root,'tmp'),TEMP:join(config.root,'tmp'),...config.childEnv};
      const child=fork(childFile,[kind],{env:environment,execArgv:[],stdio:['ignore','ignore','ignore','ipc']});children.set(kind,child);
      const timer=setTimeout(()=>rejectReady(new StartupFailure(kind,'startup_timeout')),60000);
      child.on('message',message=>{
        if(message?.type==='ready'){clearTimeout(timer);onEvent('child_ready',kind);resolveReady();}
        else if(message?.type==='health'&&probes.get(message.id)?.child===child)probes.get(message.id).done(message.ok===true);
        else if(message?.type==='failed'){clearTimeout(timer);rejectReady(childStartupFailure(kind,message));}
      });
      child.once('error',error=>{clearTimeout(timer);rejectReady(startupFailure(error,kind,'spawn_failed'));if(!stopping&&!resetting)void stop(1);});
      child.once('exit',()=>{
        clearTimeout(timer);for(const pending of probes.values())if(pending.child===child)pending.done(false);
        rejectReady(new StartupFailure(kind,'child_exited'));
        if(!stopping&&!resetting){ready=false;onEvent('child_exit',kind);void stop(1);}
      });
    });
  }
  async function startChildren(){await spawnRuntime('consumer');await spawnRuntime('merchant');ready=true;}
  async function stop(code=0){
    if(stopPromise)return stopPromise;stopping=true;ready=false;
    stopPromise=(async()=>{
      const deadline=setTimeout(()=>{for(const child of children.values())child.kill('SIGKILL');gateway.closeAllConnections();},config.shutdownMs??shutdownMs);
      const gatewayClosed=new Promise(resolve=>{if(gateway.listening){gateway.close(resolve);gateway.closeIdleConnections();}else resolve();});
      if(controlSocket?.listening)controlSocket.close();
      await stopChildren();await gatewayClosed;clearTimeout(deadline);
      for(const file of [socketPath,metadataPath])if(ownsControl&&existsSync(file)){assert.ok(!lstatSync(file).isSymbolicLink());unlinkSync(file);}
      onEvent('stopped');resolveClosed(code);
    })();return stopPromise;
  }
  async function reset(){
    assert.ok(!stopping&&!resetting,'Runtime busy');resetting=true;ready=false;
    const deadline=setTimeout(()=>{for(const child of children.values())child.kill('SIGKILL');},config.shutdownMs??shutdownMs);
    try{
      await stopChildren();clearTimeout(deadline);
      assert.ok(!stopping,'Launcher stopping');
      const result=resetDatabase(config);await startChildren();onEvent('staging_reset');return result;
    }catch(error){
      clearTimeout(deadline);
      // A refused financial reset keeps the ledger; restore both unchanged runtimes.
      if(!stopping&&children.size===0)await startChildren().catch(()=>void stop(1));
      else if(!stopping)void stop(1);
      throw error;
    }finally{resetting=false;}
  }
  signal?.addEventListener('abort',()=>void stop(0),{once:true});
  let stage='control';
  try{
    assert.ok(!signal?.aborted,'Startup cancelled');
    if(control){
      assert.equal(process.platform,'linux');
      if(existsSync(socketPath)){
        assert.ok(lstatSync(socketPath).isSocket()&&!lstatSync(socketPath).isSymbolicLink());
        const active=await new Promise(resolve=>{const socket=connect(socketPath);socket.once('connect',()=>{socket.destroy();resolve(true);});socket.once('error',()=>resolve(false));});
        assert.ok(!active,'Existing launcher active');unlinkSync(socketPath);
      }
      controlSocket=controlServer(socket=>{
        socket.setTimeout(5000,()=>socket.destroy());let input='';
        socket.on('data',async chunk=>{
          input+=chunk.toString();if(input.length>2048){socket.destroy();return;}if(!input.includes('\n'))return;
          socket.removeAllListeners('data');socket.setTimeout(0);
          let command;try{command=JSON.parse(input);}catch{socket.end('{"ok":false}\n');return;}
          if(command.command!=='reset'||command.confirm!=='RESET_DISPOSABLE_STAGING'||command.runtimeId!==runtimeId){socket.end('{"ok":false}\n');return;}
          try{await reset();socket.end('{"ok":true}\n');}catch{socket.end('{"ok":false,"error":"RESET_REFUSED_OR_FAILED"}\n');}
        });
        socket.on('error',()=>{});
      });
      await new Promise((resolve,reject)=>{controlSocket.once('error',reject);controlSocket.listen(socketPath,resolve);});ownsControl=true;chmodSync(socketPath,0o600);
      controlSocket.on('error',()=>void stop(1));
      if(existsSync(metadataPath))assert.ok(lstatSync(metadataPath).isFile()&&!lstatSync(metadataPath).isSymbolicLink());
      writeFileSync(metadataPath,JSON.stringify({runtimeId})+'\n',{mode:0o600});chmodSync(metadataPath,0o600);
    }
    assert.ok(!stopping,'Startup cancelled');
    stage='database';
    const initialization=initializeDatabase(config);onEvent(initialization.fresh?'fresh_staging_initialized':'staging_reopened');
    stage='gateway';
    await new Promise((resolve,reject)=>{gateway.once('error',reject);gateway.listen(config.port,config.bind,resolve);});
    stage='consumer';
    await startChildren();onEvent('ready');
    return {gateway,closed,stop,reset,health,children:()=>new Map(children),initialization};
  }catch(error){
    const fallback=stage==='control'?'control_setup_failed':stage==='database'?'database_initialization_failed':stage==='gateway'?'gateway_initialization_failed':'runtime_start_failed';
    const failure=startupFailure(error,stage,fallback);
    await stop(1);throw failure;
  }
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  process.umask(0o077);
  const shutdown=new AbortController();
  for(const signal of ['SIGTERM','SIGINT'])process.once(signal,()=>shutdown.abort());
  let stage='config';
  try{
    const config=renderConfig(process.env);stage='launcher';
    const runtime=await startLauncher(config,{signal:shutdown.signal});
    process.exitCode=await runtime.closed;
  }catch(error){if(!shutdown.signal.aborted){console.log(JSON.stringify(startupFailureRecord(error,stage)));process.exitCode=1;}}
}
