import {Resvg} from '@resvg/resvg-js';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
const svg=await readFile('assets/brand/commit-common-yes-mark.svg','utf8');
await mkdir('product-public/icons',{recursive:true});
for(const size of [192,512])await writeFile(`product-public/icons/commit-${size}.png`,new Resvg(svg,{fitTo:{mode:'width',value:size}}).render().asPng());
const inner=svg.slice(svg.indexOf('>')+1,svg.lastIndexOf('</svg>'));
const maskable=`<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512"><rect width="512" height="512" fill="#A64B1F"/><g transform="translate(96 96) scale(5)">${inner.replaceAll('#A64B1F','#FFFFFF')}</g></svg>`;
await writeFile('product-public/icons/commit-maskable-512.png',new Resvg(maskable).render().asPng());
