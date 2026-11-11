// Synthetic stand-in for the August 2026 sales seed the harnesses were written
// against. Until v118 they read the app's one-time import, the supervisor's
// real ERP export shipped in www/ (and so published to everyone); v119 took
// real sales data off the public site, so this builds a file of the same
// shape instead — same counts, same ERP salesmen, nothing real:
//   1,343 packed lines dated 1–26 Aug 2026, 225 of them returns;
//   312 for the team's two salesmen (Ranova Ayman Mohammed 244, Mariam Zohair 68),
//   1,031 for the two mapped to "not my team" (Mr. Sundeep Kohli 916, Reem Omar 115).
// Customers, products, invoice numbers and amounts are invented.
// Packed line, as the app stores it:
//   [date, invoice, type 0 invoice | 1 return, product, qty, gross, net, return, salesman, brand, customer, class, discount on return]
'use strict';

const REP_MAP = { 'Ranova Ayman Mohammed': 'Renova', 'Mariam Zohair': 'Mariam', 'Mr. Sundeep Kohli': null, 'Reem Omar': null };
// [ERP salesman, lines, of which returns]
const SALESMEN = [['Mr. Sundeep Kohli', 916, 193], ['Ranova Ayman Mohammed', 244, 28], ['Reem Omar', 115, 4], ['Mariam Zohair', 68, 0]];
const PRODUCTS = [
  ['Waterpik Cordless Plus BLACK', 'WATERPIK', 35], ['C3 Plaque Defense Brush Head White', 'Philips Export BV', 11.5],
  ['Sonicare 4100', 'Philips Export BV', 49], ['Tepe Interdental Mixed', 'TEPE', 3.25], ['Flash Tongue Scraper Pink', 'FLASH', 4.5],
  ['GC Tooth Mousse', 'GC', 9.75], ['Mini Flosser INT', 'TEPE', 2.4], ['Pap+ Toothpaste', 'Hismile', 7.5],
];
// The team's customers are the ones the September fixture uses; the rest are made up.
const CUSTOMERS = {
  'Mariam Zohair': [['Dental 8 Clinic', 'Clinics'], ['My Fatoorah', 'Online Customers'], ['Smile Care Clinic', 'Clinics'], ['Sultan Center', 'Hypermarkets and Supermarkets']],
  'Ranova Ayman Mohammed': [['Crown Dental Center', 'Clinics'], ['Bright Dental Center', 'Clinics'], ['My Fatoorah', 'Online Customers'], ['Sample Pharmacy 1', 'Pharmacy']],
  'Mr. Sundeep Kohli': [['Sample Hypermarket 1', 'Hypermarkets and Supermarkets'], ['Sample Hypermarket 2', 'Hypermarkets and Supermarkets'],
    ['Sample Hypermarket 3', 'Hypermarkets and Supermarkets'], ['Sample Trading Co', 'Other Customers'], ['Sample Platform', 'Platform Customers']],
  'Reem Omar': [['Sample Pharmacy 2', 'Pharmacy'], ['Sample Pharmacy 3', 'Pharmacy'], ['Sample Trading Co', 'Other Customers']],
};
const r3 = x => Math.round(x * 1000) / 1000;

function buildAugustSeed(){
  let state = 20260801;                                   // fixed: the same file on every run
  const rand = () => { state = (state * 1103515245 + 12345) % 2147483648; return state / 2147483648; };
  const rows = [];
  let inv = 91000, ret = 7000;
  SALESMEN.forEach(([salesman, lines, returns]) => {
    const customers = CUSTOMERS[salesman];
    for(let i = 0; i < lines; i++){
      const day = 1 + Math.floor(i * 26 / lines);         // spread over 1–26 Aug
      const date = '2026-08-' + String(day).padStart(2, '0');
      // exactly `returns` of the lines are returns, spread evenly over the month
      const isReturn = Math.floor((i + 1) * returns / lines) > Math.floor(i * returns / lines);
      const p = PRODUCTS[Math.floor(rand() * PRODUCTS.length)];
      const c = customers[Math.floor(rand() * customers.length)];
      const qty = 1 + Math.floor(rand() * 6);
      const gross = r3(p[2] * qty), net = r3(gross * (0.75 + rand() * 0.2));
      if(isReturn){
        const disc = rand() < 0.9 ? r3(gross - net) : 0;
        rows.push([date, 'SRT000' + (ret++), 1, p[0], qty, 0, -net, net, salesman, p[1], c[0], c[1], disc]);
      } else {
        rows.push([date, 'SINV00' + (inv++), 0, p[0], qty, gross, net, 0, salesman, p[1], c[0], c[1], 0]);
      }
    }
  });
  rows.sort((a, b) => a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0);
  return {
    seedKey: 'sales3_aug26', month: '2026-08', from: '2026-08-01', to: '2026-08-26',
    net: r3(rows.reduce((s, a) => s + a[6], 0)), rowCount: rows.length, repMap: Object.assign({}, REP_MAP), rows,
  };
}

const AUGUST_SEED = buildAugustSeed();
module.exports = AUGUST_SEED;
