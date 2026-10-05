// Only fixed allowlisted labels cross the logging/child IPC boundary.
// Never serialize Error.message, stack, cause, environment or child output.
const stages=new Set(['launcher','config','storage','control','database','gateway','consumer','merchant','consumer_dependencies','merchant_dependencies','consumer_database','merchant_database','consumer_services','merchant_services','consumer_listen','merchant_listen']);
const reasons=new Set([
  'startup_failed','missing_required_env','invalid_render_environment','invalid_node_environment','invalid_staging_mode','non_sandbox_payment_environment','invalid_ai_mode','unsafe_negative_test_flag','invalid_database_path','invalid_render_hostname','invalid_public_origin','invalid_port','invalid_capability_flag','invalid_push_contact','invalid_vapid_config','invalid_access_user','invalid_access_password',
  'unsafe_storage_path','unsupported_platform','disk_mount_not_detected','invalid_storage_resource','storage_prepare_failed','control_setup_failed','database_initialization_failed','gateway_initialization_failed','dependency_load_failed','runtime_initialization_failed','runtime_listen_failed','runtime_start_failed','spawn_failed','child_exited','startup_timeout',
  'permission_denied','resource_missing','disk_full','read_only_filesystem','address_in_use','address_unavailable','file_limit_reached','module_missing','native_module_load_failed','sqlite_busy','sqlite_read_only','sqlite_io_failed','sqlite_corrupt','sqlite_open_failed','sqlite_constraint_failed','sqlite_not_database','sqlite_failed'
]);
const systemReasons=new Map([
  ['EACCES','permission_denied'],['EPERM','permission_denied'],['ENOENT','resource_missing'],['ENOSPC','disk_full'],['EROFS','read_only_filesystem'],['EADDRINUSE','address_in_use'],['EADDRNOTAVAIL','address_unavailable'],['EMFILE','file_limit_reached'],['ENFILE','file_limit_reached'],['ERR_MODULE_NOT_FOUND','module_missing'],['MODULE_NOT_FOUND','module_missing'],['ERR_UNKNOWN_BUILTIN_MODULE','module_missing'],['ERR_DLOPEN_FAILED','native_module_load_failed']
]);
const sqliteReasons=new Map([[5,'sqlite_busy'],[6,'sqlite_busy'],[8,'sqlite_read_only'],[10,'sqlite_io_failed'],[11,'sqlite_corrupt'],[14,'sqlite_open_failed'],[19,'sqlite_constraint_failed'],[26,'sqlite_not_database']]);
export class StartupFailure extends Error {
  constructor(stage,reason){
    super('Render startup failed');
    this.stage=stages.has(stage)?stage:'launcher';
    this.reason=reasons.has(reason)?reason:'startup_failed';
  }
}
export function requireStartup(condition,stage,reason){if(!condition)throw new StartupFailure(stage,reason);}
export function startupFailure(error,stage='launcher',fallback='startup_failed'){
  if(error instanceof StartupFailure)return new StartupFailure(error.stage,error.reason);
  let code,errcode;try{code=error?.code;errcode=error?.errcode;}catch{}
  const sqliteReason=Number.isInteger(errcode)?sqliteReasons.get(errcode&255):undefined;
  const reason=systemReasons.get(code)??(code==='ERR_SQLITE_ERROR'?(sqliteReason??'sqlite_failed'):fallback);
  return new StartupFailure(stage,reason);
}
export function startupFailureRecord(error,stage='launcher',fallback='startup_failed'){
  const failure=startupFailure(error,stage,fallback);
  return {event:'render_start_failed',stage:failure.stage,reason:failure.reason};
}
export function childStartupFailure(kind,message){
  const stage=message?.stage;
  if(['consumer','merchant'].includes(kind)&&typeof stage==='string'&&(stage===kind||stage.startsWith(kind+'_'))&&stages.has(stage)&&reasons.has(message?.reason))return new StartupFailure(stage,message.reason);
  return new StartupFailure(kind,'runtime_start_failed');
}
export function startupStep(stage,operation,fallback){try{return operation();}catch(error){throw startupFailure(error,stage,fallback);}}
export async function startupStepAsync(stage,operation,fallback){try{return await operation();}catch(error){throw startupFailure(error,stage,fallback);}}
