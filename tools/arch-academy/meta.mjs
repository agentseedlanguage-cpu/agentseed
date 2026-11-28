// Architecture Academy: pathways, curriculum crosswalk, gap register, roadmap, policy and assessment text.
// Same shape as the Cybersecurity Academy (tools/cyber-academy/meta.mjs) so the two academies read alike.

// Lessons are named as [level, lesson number inside that level's course]. The builder fails if one does not exist.
export const PATHS = [
  { id: 'newcomer', title: 'Start here: new to architecture', who: 'Developers and analysts who build software but have never been asked to design it.', levels: [1], lessons: [[1, 1], [1, 2], [1, 3], [1, 4], [1, 10], [1, 12]], note: 'Open the free lessons first, then take the design and documentation lessons in order.' },
  { id: 'exam', title: 'Prepare for the iSAQB Foundation exam', who: 'Learners who plan to sit the external iSAQB CPSA-F exam.', levels: [1], lessons: [[1, 1], [1, 2], [1, 3], [1, 4], [1, 5], [1, 6], [1, 7], [1, 8], [1, 9], [1, 10], [1, 11], [1, 12], [1, 14]], note: 'Lessons 1 to 12, then the exam-strategy lesson and the mock exams. Lesson 13 (AI) is optional extra for now. Check the exam rules with a certification body.' },
  { id: 'document', title: 'Document a system well', who: 'Engineers and tech leads who must leave a system understandable to the next team.', levels: [1, 2], lessons: [[1, 10], [2, 3], [2, 4], [2, 5], [2, 6], [2, 8], [2, 9], [2, 10], [2, 13], [2, 14], [2, 15]], note: 'The Level 1 documentation lesson, then arc42 section by section.' },
  { id: 'decide', title: 'Decide and defend', who: 'Architects and senior engineers who choose between designs and must justify the choice.', levels: [2, 3], lessons: [[3, 1], [3, 2], [3, 6], [3, 8], [3, 9], [3, 11], [3, 17]], note: 'Numbers first, then options, then the written decision.' },
  { id: 'agents', title: 'Design with AI agents', who: 'Teams that use coding agents or put agents into the product.', levels: [1, 3, 4], lessons: [[1, 13], [2, 17], [3, 19], [3, 20], [4, 1], [4, 2], [4, 3], [4, 7], [4, 9], [4, 10]], note: 'Verification and provenance first, then the Level 4 agent-design course. For the security side, see the Cybersecurity Academy.' },
  { id: 'lead', title: 'Lead architecture', who: 'Senior architects and heads of engineering.', levels: [3, 5, 6], lessons: [[3, 9], [3, 15], [3, 16], [4, 16]], note: 'Levels 5 and 6 are planned. This path shows what to take today and where it leads.' },
];

// Active curriculum chapters (iSAQB CPSA-F 2025.1-rev2, read 2026-11-24). Minutes are the curriculum's own recommendation.
// Ratings are Intellica's own reading and have not been reviewed by anyone outside Intellica.
export const CHAPTERS = {
  1: { minutes: 120, rating: 'taught', note: 'Definitions, goals, responsibilities and the architect’s role. Taught in lesson 1.' },
  2: { minutes: 180, rating: 'taught', note: 'Stakeholders, constraints, qualities and measurable scenarios. Lessons 2 and 3.' },
  3: { minutes: 360, rating: 'taught', note: 'The largest chapter: decomposition, principles, interfaces, runtime, deployment and cross-cutting concepts. Lessons 4 to 9.' },
  4: { minutes: 240, rating: 'verify', note: 'Documentation, views and communication in lesson 10. Goal 04-04 is new in 2025.1 and its title is not yet confirmed against the curriculum.' },
  5: { minutes: 90, rating: 'taught', note: 'Analysis and assessment. Lesson 11.' },
  6: { minutes: 90, rating: 'verify', note: 'Examples. Lesson 12 is an integrated worked example. The curriculum treats this chapter as not relevant for the exam.' },
};
export const RATING = { taught: 'Taught; evidence to verify', verify: 'Taught; depth to verify', gap: 'Gap: work planned' };

// The 2027.1 release candidate, read 2026-11-25 from the public PDF. Not final: treat as a preview.
export const RC = {
  label: '2027.1-RC1-EN-20261113',
  total: 1050,
  chapters: [['Basic Concepts of Software Architecture', 120], ['Requirements and Constraints', 180], ['Design and Development', 360], ['Specification and Communication', 240], ['Use and Risks of Artificial Intelligence', 60], ['Examples', 90]],
  ai: ['Deciding on the use of AI in architecture work', 'Verification of AI-generated artefacts', 'Recognising the risks and the ethical and societal effects of AI'],
};

export const GAPS = [
  { id: 'G1', topic: 'Question bank depth', source: 'Blueprint v2 target of 600 reviewed items', planned: 'Grow the bank in steps. 124 items shipped with checkpoint 36; checkpoint 44 raised it to 206 items and five mock papers, still far short of the target.', finding: 'The Level 1 bank is a first edition. It is smaller than the blueprint target and is the main limit on how many different mock papers a learner can take.' },
  { id: 'G2', topic: 'Independent review of questions', source: 'Blueprint v2 risk: weak question bank', planned: 'A person who did not write the items reviews every item against its learning goal. Record the reviewer and date.', finding: 'Items were written and machine-checked. No human reviewer has read them yet, and correct options tend to be the longest.' },
  { id: 'G3', topic: 'Question types', source: 'Curriculum learning goals; external exam format', planned: 'More choose-several and allocation items, and scenario items that need a short reasoned choice.', finding: 'Most items are single choice. The real exam mixes types, so practice should too.' },
  { id: 'G4', topic: 'The 2027.1 release candidate', source: 'iSAQB RC1, 13 November 2026', planned: 'Run a formal comparison when the final text is published and update the lessons, bank and mock quotas.', finding: 'The candidate adds a chapter on AI. Lesson 13 already teaches verification and provenance, but it is Intellica extension content, not a match to the final goals.' },
  { id: 'G5', topic: 'Curriculum goal 04-04 title', source: 'Curriculum 2025.1-rev2', planned: 'Confirm the title against the official text and update the map.', finding: 'The goal was added in 2025.1. Its title in our map is marked unconfirmed.' },
  { id: 'G6', topic: 'One portfolio across levels', source: 'Blueprint v2 learner journey', planned: 'A single architecture dossier that carries evidence from Level 1 to Level 6, with export.', finding: 'Each course has its own lab record. Nothing yet links them into one portfolio.' },
  { id: 'G7', topic: 'Levels 5 and 6 are not built', source: 'Live catalogue', planned: 'Build Level 5 next, then Level 6.', finding: 'The two levels have published outlines and no courses.' },
  { id: 'G8', topic: 'Feedback from a person', source: 'Course pages and FAQ', planned: 'Offer reviewed feedback on submitted work as a separate service, and say so plainly.', finding: 'The courses are self-study. Marking is by rubric and health checks, not by a tutor.' },
  { id: 'G9', topic: 'No credential scheme yet', source: 'Blueprint v2 section 21; ISO/IEC 17024:2026 as a design benchmark', planned: 'Publish competence standards, assessor rules, appeals and renewal before any credential is issued.', finding: 'Only completion certificates exist, and they are self-reported. No assessors, moderation or appeals process exists.' },
  { id: 'G10', topic: 'External advanced route', source: 'iSAQB CPSA-A rules', planned: 'Decide later whether to offer anything beyond pointing to the official route.', finding: 'The academy does not prepare for the iSAQB Advanced assessment and does not claim to.' },
  { id: 'G11', topic: 'Level 4 is a first edition without outside review', source: 'Level 4 course, 2026-11-27', planned: 'Have an iSAQB-experienced architect read the lessons and labs, and re-check every source marked "not re-read" before the next edition.', finding: 'Lessons cite 2026 preprints and one press report with their limits stated. The labs have not been tried by learners. Some sources are cited from the author’s knowledge and marked as such.' },
];

export const ROADMAP = [
  { n: 0, name: 'Discovery and audit', status: 'done', work: 'Reconcile the blueprint with the live site and the existing courses; decide the six-level ladder.', gate: 'A ladder with honest statuses on the catalogue.' },
  { n: 1, name: 'Foundations course (Level 1)', status: 'done', work: 'Fourteen lessons, a lab, health check, certificate rule, curriculum map and five mock exams.', gate: 'Tests, build checks and browser checks pass; claims match the code.' },
  { n: 2, name: 'Question bank growth and review', status: 'active', work: 'Grow the bank, add question types, add papers four and five, and have every item reviewed by a person.', gate: 'Reviewer recorded for each item; chapter quotas met for every paper.' },
  { n: 3, name: 'Level 4: Agentic AI Architecture', status: 'done', work: 'Sixteen lessons, a lab with a seven-part health check, a rules checker and a tool contract checker. First edition.', gate: 'Every lesson has a lab that runs and sources with dates. Outside review is still to come (gap G11).' },
  { n: 4, name: 'Level 5: Architecture Governance and Evolution', status: 'next', work: 'Research, then write the lessons and lab, built on Levels 3 and 4.', gate: 'Every lesson has a lab that runs and sources with dates.' },
  { n: 5, name: 'Level 6 and the lead architect portfolio', status: 'later', work: 'Lead architect practice, including a portfolio and oral defence design.', gate: 'Assessment design reviewed by someone outside Intellica.' },
  { n: 6, name: 'Platform foundations', status: 'later', work: 'One portfolio across levels, recall scheduling and export.', gate: 'Automated tests, accessibility review and a restore test.' },
  { n: 7, name: 'Beta and external review', status: 'later', work: 'Pilot with learners and employers; independent curriculum and assessment review.', gate: 'Measurable learning gain and no critical defect.' },
  { n: 8, name: 'Credential launch and refresh', status: 'later', work: 'Publish the scheme handbook, rules, verification, appeals and renewal; refresh mappings every year, including the iSAQB 2027.1 comparison.', gate: 'Governance operating and a legal review complete before the first award.' },
];
export const STATUS_LABEL = { done: 'Done', active: 'In progress', next: 'Next', later: 'Planned' };

export const ENDORSEMENTS = ['Agentic AI architecture', 'Cybersecurity (see the Cybersecurity Academy)', 'Cloud-native infrastructure', 'APIs and integration', 'Web application security', 'Green software'];

export const POLICY = [
  'Intellica owns its curriculum, teaching, practice items, labs, credential names, rules and decisions. Public curricula, standards and exam blueprints are references and mappings only.',
  'Intellica is independent of iSAQB, arc42, ISO, IEC, IEEE, the Software Engineering Institute and every certification body. Nothing here suggests an affiliation, approval or partnership.',
  'Intellica is not an accredited iSAQB training provider. We do not use iSAQB logos or seals, and we never say a learner is “iSAQB certified” because of an Intellica course.',
  'We use no protected exam questions, leaked questions or confidential task briefs. Practice items are original and are not real exam questions.',
  'A mapping shows which of our lessons relate to a published learning goal. It does not mean a course replaces, counts towards or predicts the result of any external exam, and it does not satisfy any experience requirement.',
  'No Intellica credential has been issued yet. Course certificates show that you finished a course by its published rule and are self-reported. When a credential scheme launches, its handbook, rules, appeals process and renewal policy will be published first.',
];

export const ASSESSMENT = [
  ['Knowledge is necessary, not sufficient', 'Each open course combines quiz questions with a lab that builds a real artefact. Higher levels will add reviewed design work and an oral defence, because recognising terms is not the same as designing.'],
  ['Evidence you can inspect', 'Every lesson ends in a lab section that adds to one record, so what you built is on the page, not only a score.'],
  ['Checks that tell the truth', 'Health checks look for completeness, not for a good design. The pages say so, and rubrics in each lesson show what missing, partial and competent work looks like.'],
  ['Practice that is separate from assessment', 'Mock exams are practice. A learner can take a paper again; the readiness report says what is weak. They do not predict an external result.'],
  ['Separated decisions', 'When a credential scheme exists, the people who teach a level will not decide whether a candidate meets its standard, and appeals will go to someone who did not assess the candidate.'],
  ['Design benchmark, not a claim', 'ISO/IEC 17024:2026 guides how a person-certification scheme should be designed. Intellica makes no accreditation or conformity claim.'],
];

export const CREDENTIALS = [
  [1, 'Intellica Foundation Architecture Certificate (working title)'],
  [2, 'Intellica Architecture Documentation Professional (working title)'],
  [3, 'Intellica Architecture Design and Evaluation Professional (working title)'],
  [4, 'Intellica Agentic Architecture Specialist (working title)'],
  [5, 'Intellica Architecture Governance Professional (working title)'],
  [6, 'Intellica Lead Architect (working title)'],
];
