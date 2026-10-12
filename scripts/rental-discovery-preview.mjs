import {createRentalPreviewServer} from '../src/rentals/preview-server.ts';
const server=createRentalPreviewServer();
server.listen(3063,'127.0.0.1',()=>console.log(JSON.stringify({url:'http://127.0.0.1:3063/',inventory:'fictional',providerCalls:false,payments:false,database:false})));
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close(()=>process.exit(0)));
