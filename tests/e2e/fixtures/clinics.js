// Invented clinic list for the harnesses that used to start from the app's own
// factory list. The code is public (v121), so it no longer ships the company's
// clinics; this list has the same shape and mix instead — 74 clinics, 39 for
// Mariam and 35 for Renova, classes A–F and two closed, a market letter, a few
// notes — and nothing real: every name is made up.
'use strict';

const WORDS = ['Amber', 'Birch', 'Cobalt', 'Dune', 'Ember', 'Fern', 'Garnet', 'Harbor', 'Indigo', 'Jasper', 'Kestrel', 'Lagoon', 'Maple',
  'Nimbus', 'Opal', 'Pebble', 'Quartz', 'Ripple', 'Saffron', 'Tundra', 'Umber', 'Velvet', 'Willow', 'Xylo', 'Yarrow', 'Zephyr'];
const KINDS = ['Sample Dental Clinic', 'Sample Dental Center', 'Sample Smile Clinic', 'Sample Pharmacy', 'Sample Medical Center', 'Sample Dental Care'];
// class mix and market mix of a real-sized territory (counts only)
const CLS = [].concat(Array(13).fill('A'), Array(17).fill('B'), Array(10).fill('C'), Array(17).fill('D'), Array(15).fill('F'), Array(2).fill('Closed'));
const MKT = [].concat(Array(16).fill('A'), Array(20).fill('B'), Array(14).fill('C'), Array(21).fill('D'), Array(1).fill('F'), Array(2).fill('Closed'));
const NOTES = ['Potential', 'Potential', 'Working on reactivation', 'Prescription', 'Potential + projects', 'Stock move'];
const slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30);

function buildClinics(){
  const out = [];
  for(let i = 0; i < 74; i++){
    const name = WORDS[i % WORDS.length] + ' ' + KINDS[(i * 5 + Math.floor(i / WORDS.length)) % KINDS.length];
    // spread the owners so both have every class; 39 + 35
    const rep = (i % 2 === 0 && out.filter(c => c.rep === 'Mariam').length < 39) || out.filter(c => c.rep === 'Renova').length >= 35 ? 'Mariam' : 'Renova';
    const cls = CLS[(i * 7) % CLS.length], market = cls === 'Closed' ? 'Closed' : MKT[(i * 11) % MKT.length] === 'Closed' ? 'D' : MKT[(i * 11) % MKT.length];
    out.push({ name, rep, cls, market, notes: i % 5 === 3 ? NOTES[i % NOTES.length] : '', id: 'c-' + slug(name) });
  }
  return out;
}
const CLINICS = buildClinics();
if(new Set(CLINICS.map(c => c.id)).size !== CLINICS.length) throw new Error('fixture clinics: duplicate ids');
module.exports = CLINICS;
