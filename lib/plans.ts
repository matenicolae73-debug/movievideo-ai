
export const PLANS = {
 starter: {name:"Starter", credits:100, amount:900, currency:"eur"},
 pro: {name:"Pro", credits:500, amount:2900, currency:"eur"},
 business: {name:"Business", credits:2000, amount:9900, currency:"eur"},
} as const
export type PlanId=keyof typeof PLANS
