// The owner's code command: right key for the right course, and codes for one course never open another.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { makeCode, COURSES } from './code.mjs';
import { deriveKey } from './build-course.mjs';
const master = crypto.randomBytes(32);
const dec = (c) => JSON.parse(Buffer.from(c, 'base64url').toString());
const a = dec(makeCode('arc42', '  Ada  ', master)), c = dec(makeCode('cybersecurity', 'Cy', master));
assert.equal(a.b, 'Ada'); assert.equal(a.k, master.toString('base64url'));
assert.equal(c.k, deriveKey(master, 'cybersecurity').toString('base64url'));
assert.notEqual(a.k, c.k);
assert.throws(() => makeCode('nope', 'x', master), /Unknown course/);
assert.deepEqual(Object.keys(COURSES), ['arc42', 'cybersecurity', 'software-architecture-foundations', 'quality-decisions', 'agentic-architecture']);
assert.equal(dec(makeCode('quality-decisions', 'Q', master)).k, deriveKey(master, 'quality-decisions').toString('base64url'));
console.log('code command: ok');
