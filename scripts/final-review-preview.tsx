// Real publication component in a read-only display harness. No commercial endpoints.
import React from 'react';
import {createRoot} from 'react-dom/client';
import {MerchantOfferPanel} from '../src/merchant-ui/offers.js';
import type {Transport} from '../src/merchant-ui/adapter.js';
const transport:Transport=async(path)=>{
 if(path!=='/api/merchant/offers/review')throw Error('Read-only review: publication and revocation disabled.');
 const offer=(await fetch('/api/merchant/offers').then(r=>r.json())).offers[0];
 return {offer,confirmationToken:'DISPLAY_ONLY_NO_SERVER_AUTHORITY'};
};
createRoot(document.getElementById('merchant-review')!).render(<MerchantOfferPanel transport={transport}/>);
