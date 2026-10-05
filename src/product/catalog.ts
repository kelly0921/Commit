import type { ProductDatabase } from './db.js';
import { invariant, type MerchantPackage, type OfferPackageTerms } from './domain.js';

export const PRICE_FIELDS=['sharedBaseCostCents','liftTicketPriceCents','rentalPriceCents','bedSupplementCents','parkingFeeCents'] as const;
export function discountedCatalog(catalog:MerchantPackage[],offer:OfferPackageTerms):MerchantPackage[] {
  return catalog.map(source=>{
    if(!offer.eligiblePackageIds.includes(source.id))return structuredClone(source);
    const pkg=structuredClone(source);
    for(const key of PRICE_FIELDS)pkg[key]=Math.ceil(source[key]*(100-offer.discountPercent)/100);
    pkg.offer=structuredClone(offer);return pkg;
  });
}
export function catalogForGroup(db:ProductDatabase,groupId?:string):MerchantPackage[] {
  const scoped=groupId?db.get<{catalog_json:string}>('SELECT catalog_json FROM group_catalogs WHERE group_id=?',groupId):undefined;
  const catalog:MerchantPackage[]=scoped?JSON.parse(scoped.catalog_json):db.all<{id:string;merchant_id:string;data_json:string}>('SELECT * FROM merchant_packages ORDER BY id').map(row=>{
    const pkg=JSON.parse(row.data_json) as MerchantPackage;invariant(pkg.id===row.id&&pkg.merchantId===row.merchant_id,'MERCHANT_IDENTITY_MISMATCH',409);return pkg;
  });
  const applied=groupId?db.get<{offer_snapshot_json:string}>(`SELECT a.offer_snapshot_json FROM offer_applications a JOIN proposals p ON p.id=a.proposal_id JOIN purchase_goals g ON g.id=p.goal_id WHERE a.group_id=? AND p.revision=g.revision AND a.state IN ('RESERVED','CONSUMED')`,groupId):undefined;
  return applied?discountedCatalog(catalog,JSON.parse(applied.offer_snapshot_json)):catalog;
}
