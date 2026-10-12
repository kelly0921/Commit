import {freezeQuote,requireRental,stayRequest,type RentalHome,type RentalProvider,type StayRequest} from './discovery.js';

// Fictional data only. No third-party inventory or copied listing content.
const homes=[
  {id:'cedar-house',name:'Cedar House',bedrooms:3,bathrooms:2,maxGuests:6,rating:4.8,reviewCount:142,rent:120000,fee:18000,tax:10800,cancellationText:'Fictional example: stay charges refundable until seven days before arrival. Exact agreement and deposit obligations remain unverified.'},
  {id:'maple-courtyard',name:'Maple Courtyard',bedrooms:4,bathrooms:2,maxGuests:8,rating:4.9,reviewCount:88,rent:144000,fee:16000,tax:12000,cancellationText:null},
  {id:'birch-place',name:'Birch Place',bedrooms:2,bathrooms:1,maxGuests:4,rating:3.8,reviewCount:12,rent:80000,fee:12000,tax:6900,cancellationText:null}
] as const;
export class FixtureRentalProvider implements RentalProvider {
  constructor(private readonly now=()=>new Date()){}
  async getHomeDetails(id:string):Promise<RentalHome>{
    const h=homes.find(h=>h.id===id);requireRental(h,'HOME_NOT_FOUND');
    return Object.freeze({id:h.id,name:h.name,supplier:'FIXTURE',merchantId:'fictional-direct-stays',city:'Fictional Vermont town',spaceType:'entire_home',currency:'USD',bedrooms:h.bedrooms,bathrooms:h.bathrooms,maxGuests:h.maxGuests,maxAdults:h.maxGuests,
      rooms:Object.freeze(Array.from({length:h.bedrooms},(_,i)=>Object.freeze({name:'Bedroom '+(i+1),type:'bedroom',totalBeds:1}))),rating:h.rating,reviewCount:h.reviewCount,cancellationText:h.cancellationText,source:'FICTIONAL',checkedAt:this.now().toISOString()});
  }
  async searchHomes(input:StayRequest){stayRequest(input);return Promise.all(homes.map(h=>this.getHomeDetails(h.id)));}
  async previewStayQuote(id:string,input:StayRequest){
    const request=stayRequest(input),home=await this.getHomeDetails(id),h=homes.find(h=>h.id===id)!;
    const nights=(Date.parse(request.departure)-Date.parse(request.arrival))/86400000;
    const rent=Math.round(h.rent*nights/2),fee=h.fee,tax=Math.round((rent+fee)*h.tax/(h.rent+h.fee));
    const now=this.now();return freezeQuote(home,request,[{label:'Stay · '+nights+' nights',kind:'RENT',amountCents:rent},{label:'Cleaning',kind:'FEE',amountCents:fee},{label:'Taxes',kind:'TAX',amountCents:tax}],new Date(now.getTime()+600000).toISOString(),now.toISOString());
  }
}
