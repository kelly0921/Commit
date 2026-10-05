import {build} from 'esbuild';
import {mkdir,copyFile} from 'node:fs/promises';
await mkdir('merchant-public',{recursive:true});
await build({entryPoints:['src/merchant-ui/studio.tsx'],bundle:true,platform:'browser',format:'esm',target:'es2023',outfile:'merchant-public/merchant.js',minify:true,define:{'process.env.NODE_ENV':'"production"'},legalComments:'external',metafile:true}).then(async r=>{const forbidden=Object.keys(r.metafile.inputs).filter(p=>/src\/(?:product\/(?:seed|solver|service|db|ai|commitments|capture-saga)|merchant\/(?:demand|provider|server))\./.test(p));if(forbidden.length)throw new Error('Private server module entered merchant bundle');});
await mkdir('dist/merchant-public',{recursive:true});
for(const file of ['index.html','merchant.css','merchant.js','merchant.js.LEGAL.txt'])await copyFile(`merchant-public/${file}`,`dist/merchant-public/${file}`);
