#!/usr/bin/env node
// Makes an access code for one buyer of one course. Run it yourself, anywhere the project is checked out
// (Codespaces or any terminal that has the .course-key file):
//   npm run code -- list
//   npm run code -- arc42 "Buyer name"
//   npm run code -- cybersecurity "Buyer name"
// The code carries the course key, so send it only to the person who paid. The buyer's name is shown on
// every lesson they open, which discourages sharing. Every code made here is noted in .codes.log (git-ignored).
import fs from 'node:fs';
import { loadKey, deriveKey } from './build-course.mjs';

export const COURSES = {
  arc42: { title: 'Mastering arc42, online course', path: '/training/arc42/course/', master: true },
  cybersecurity: { title: 'Application Cyber Security for Agentic Environments, online course', path: '/training/cybersecurity/course/' },
  'software-architecture-foundations': { title: 'Software Architecture Foundations, online course', path: '/training/software-architecture-foundations/course/' },
  'quality-decisions': { title: 'Quality, Decisions and Evaluation, online course', path: '/training/quality-decisions/course/' },
  'agentic-architecture': { title: 'Agentic AI Architecture, online course', path: '/training/agentic-architecture/course/' },
};

export function makeCode(course, name, master) {
  const c = COURSES[course];
  if (!c) throw new Error(`Unknown course "${course}". Courses: ${Object.keys(COURSES).join(', ')}`);
  const key = c.master ? master : deriveKey(master, course);
  return Buffer.from(JSON.stringify({ v: 1, b: String(name).trim().slice(0, 60), k: key.toString('base64url') })).toString('base64url');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [course, ...rest] = process.argv.slice(2);
  const name = rest.join(' ').trim();
  if (!course || course === 'list' || !name) {
    console.log('\nUsage: npm run code -- <course> "Buyer name"\n\nCourses:');
    for (const [id, c] of Object.entries(COURSES)) console.log(`  ${id.padEnd(15)} ${c.title}`);
    console.log('');
    process.exit(course === 'list' ? 0 : 1);
  }
  if (!COURSES[course]) { console.error(`Unknown course "${course}". Courses: ${Object.keys(COURSES).join(', ')}`); process.exit(1); }
  const master = loadKey({ create: false });
  if (!master) { console.error('No .course-key file here. Run this in the folder you deploy from (it was created by the first deploy), or copy .course-key into this folder.'); process.exit(1); }
  const code = makeCode(course, name, master);
  fs.appendFileSync('.codes.log', `${new Date().toISOString()}\t${course}\t${name}\n`);
  console.log(`\nAccess code for ${name} (${COURSES[course].title}):\n\n${code}\n\nSend it with this link: https://meeting-mind.com${COURSES[course].path}\nThey paste the code on that page and everything unlocks on their device.\n`);
}
