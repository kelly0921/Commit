// No HTTP route. Fixed Linux host paths, root-only, stopped services, recoverable backup.
import assert from 'node:assert/strict';
import {existsSync,lstatSync,realpathSync,mkdirSync,copyFileSync,unlinkSync,chownSync,statSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
export const STAGING='/var/lib/commit-staging',FILES=['staging.sqlite','staging.sqlite-wal','staging.sqlite-shm'];
export function exactStagingDirectory(path,fs={realpathSync,lstatSync}){assert.equal(path,STAGING,'Fixed staging directory only');assert.equal(fs.realpathSync(path),STAGING,'Symlink/alternate directory forbidden');assert.ok(!fs.lstatSync(path).isSymbolicLink(),'Symlink forbidden');}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 assert.equal(process.platform,'linux','Host-only Linux command');assert.equal(process.getuid(),0,'Run as root');assert.deepEqual(process.argv.slice(2),['--reset-staging'],'Explicit --reset-staging required');
 process.umask(0o077);
 const uidResult=spawnSync('id',['-u','commit-staging'],{encoding:'utf8'}),gidResult=spawnSync('id',['-g','commit-staging'],{encoding:'utf8'}),uid=Number(uidResult.stdout?.trim()),gid=Number(gidResult.stdout?.trim());assert.equal(uidResult.status,0);assert.equal(gidResult.status,0);assert.ok(Number.isInteger(uid)&&uid>0&&Number.isInteger(gid)&&gid>0,'Staging service account required before reset');
 exactStagingDirectory(STAGING);const paths=FILES.map(name=>STAGING+'/'+name);for(const p of paths)if(existsSync(p))assert.ok(lstatSync(p).isFile()&&!lstatSync(p).isSymbolicLink(),'Unexpected staging resource; refusing reset');
 const units=['commit-merchant.service','commit-consumer.service'];const stop=spawnSync('systemctl',['stop',...units],{stdio:'ignore'});assert.equal(stop.status,0,'Services could not stop; DB untouched');
 for(const unit of units){const active=spawnSync('systemctl',['is-active','--quiet',unit]);assert.equal(active.status,3,'Expected inactive services; DB untouched');}
 const backupRoot='/var/backups/commit-staging';if(!existsSync(backupRoot))mkdirSync(backupRoot,{mode:0o700});assert.equal(realpathSync(backupRoot),backupRoot,'Backup symlink forbidden');assert.equal(statSync(backupRoot).uid,0,'Root-owned backups required');assert.equal(statSync(backupRoot).mode&0o777,0o700,'Backup permissions must be 0700');
 const backup=backupRoot+'/'+new Date().toISOString().replaceAll(':','-');mkdirSync(backup,{mode:0o700});for(const p of paths)if(existsSync(p))copyFileSync(p,backup+'/'+p.slice(p.lastIndexOf('/')+1));
 // Recheck after stop/backup before any unlink; never recursively delete a directory.
 exactStagingDirectory(STAGING);for(const p of paths)if(existsSync(p)){assert.ok(lstatSync(p).isFile()&&!lstatSync(p).isSymbolicLink());unlinkSync(p);}
 const {ProductDatabase}=await import('../../dist/src/product/db.js');const db=new ProductDatabase(STAGING+'/staging.sqlite');assert.equal(db.get('SELECT COUNT(*) AS n FROM commitments').n,0);assert.equal(db.get('SELECT COUNT(*) AS n FROM push_subscriptions').n,0);db.close();
 chownSync(STAGING+'/staging.sqlite',uid,gid);
 assert.equal(spawnSync('systemctl',['start','commit-consumer.service','commit-merchant.service'],{stdio:'ignore'}).status,0,'Restart failed; backup retained');console.log('Fresh fictional staging catalog restored; services restarted. Backup: '+backup);
}
