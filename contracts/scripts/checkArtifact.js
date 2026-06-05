const d = require('../lib/uma-ctf-adapter/artifacts/ConditionalTokens.json');
const keys = Object.keys(d);
console.log('keys:', keys.slice(0, 15));
const bc = (typeof d.bytecode === 'string' ? d.bytecode : (d.bytecode && d.bytecode.object) || '') || d.bin || '';
console.log('bytecode len:', bc.length);
console.log('bytecode start:', bc.slice(0, 20));

const d2 = require('../lib/ctf-exchange/artifacts/CTFExchange.json');
const keys2 = Object.keys(d2);
console.log('CTFExchange keys:', keys2.slice(0, 10));
const bc2 = d2.bytecode || d2.bin || '';
console.log('CTFExchange bytecode len:', bc2.length);
