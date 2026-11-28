// Software Architecture Academy: the six levels. Titles, lesson lists, counts and free lessons are read from the live catalogue
// when the pages are built; this file holds only what the catalogue does not: audience, evidence, assessment and mappings.
// Edit the data, not the generated pages. Statuses are honest: "available" means a live online course exists.
export const REVIEWED = '2026-11-25';

export const LEVELS = [
  {
    n: 1, id: 'level-1', course: 'software-architecture-foundations', short: 'Foundations',
    tagline: 'What software architecture is and how to practise it on a small system: requirements, quality, design, description and analysis, with exam readiness built in.',
    audience: 'Developers, aspiring architects and IT professionals who take part in software projects and want to design, describe and assess architecture for small and medium systems.',
    prereq: 'No earlier level. Some experience building or maintaining software helps, and basic UML (the Unified Modeling Language) and object-oriented ideas are assumed.',
    status: { key: 'available', label: 'Live online course' },
    evidence: ['A glossary and a one-page statement of the architect’s role', 'Stakeholder list, constraints and measurable quality scenarios', 'Decomposition, interface and data-model sketches with reasons', 'Context, building-block, runtime and deployment views', 'A short assessment of the design against its own scenarios', 'A verified AI-use note and a readiness report from the mock exams'],
    capstone: 'One architecture file for a system you know, built across all 14 lessons, and a mock-exam readiness report.',
    assessment: 'Five quiz questions per lesson, a lab health check of six items, and five timed mock exams. The certificate shows you finished the course; it is not proctored.',
    mapping: [
      ['iSAQB CPSA-F curriculum 2025.1-rev2', 'Lessons 1 to 12 and 14 follow its six chapters and learning goals. Lesson 13 (AI) is Intellica extension content. See the mapping page.'],
      ['arc42 (Level 2)', 'The file you build here is the starting point for the Level 2 documentation baseline.'],
    ],
    caveat: 'Level 1 is independent self-study. It is not an iSAQB course and Intellica is not an accredited training provider. The external exam is separate; check its current rules with a certification body.',
  },
  {
    n: 2, id: 'level-2', course: 'arc42', short: 'Mastering arc42',
    tagline: 'Document one real system with the arc42 template, section by section, with a lab on your own document and a worked example you can read and run.',
    audience: 'Engineers, architects and tech leads who must leave a system understandable to the next team, and teams that want documentation that stays alive.',
    prereq: 'Level 1 is recommended, not required. You need a system you know well enough to describe.',
    status: { key: 'available', label: 'Live online course' },
    evidence: ['Opening page and documentation goals', 'Goals, constraints, context and solution strategy (sections 1 to 4)', 'Building blocks, runtime, deployment, concepts, decisions, quality and risks (sections 5 to 12)', 'An agent-readable version of your documentation'],
    capstone: 'A complete arc42 document for one system, with its decisions and risks recorded.',
    assessment: 'Recall questions in every lesson, timed exercises, and a lab with health checks. The certificate shows you finished the course.',
    mapping: [
      ['arc42 template (CC BY-SA 4.0)', 'The template structure is used under its licence. Attribution and the licence link are on every course page.'],
      ['iSAQB documentation topics', 'Topics overlap with documentation material in the iSAQB programme. There is no automatic credit and no claim of equivalence.'],
    ],
    caveat: 'arc42 is created by Gernot Starke and Peter Hruschka. The creators do not endorse Intellica or this course.',
  },
  {
    n: 3, id: 'level-3', course: 'quality-decisions', short: 'Quality and Decisions',
    tagline: 'Turn vague goals into numbers, weigh options honestly and record the decisions your team will have to live with.',
    audience: 'Architects, senior engineers and tech leads who choose between designs and must defend the choice.',
    prereq: 'Level 2, Mastering arc42, or equivalent experience writing architecture documentation.',
    status: { key: 'available', label: 'Live online course' },
    evidence: ['Quality tree, scenarios and budgets with numbers', 'Options compared against scenarios, with trade-offs', 'Decision records a new team member can act on', 'A review of a design against its own scenarios', 'Decision notes that an AI agent can read'],
    capstone: 'One quality and decisions record built on top of your arc42 document.',
    assessment: 'Quiz questions in every lesson and a lab with health checks across 20 sections. The certificate shows you finished the course.',
    mapping: [
      ['ISO/IEC 25010:2023 quality model', 'Used as the vocabulary for quality characteristics. Paid standard: we teach the ideas and do not reproduce the text.'],
      ['ATAM (Architecture Tradeoff Analysis Method)', 'Scenario-based evaluation ideas from the Software Engineering Institute inform the review lessons. This is not an ATAM certification.'],
    ],
    caveat: 'Level 3 teaches evaluation practice. It does not replace an independent review of your own architecture.',
  },
  {
    n: 4, id: 'level-4', course: 'agentic-architecture', short: 'Agentic AI',
    tagline: 'Design systems where AI agents do real work: tools, memory, limits, evaluation and human approval, documented so the next engineer can trust them.',
    audience: 'Architects and engineers who add agents to products or run agents inside their organisation.',
    prereq: 'Level 3, Quality, Decisions and Evaluation, or equivalent experience designing systems against quality goals.',
    status: { key: 'available', label: 'Live online course' },
    evidence: ['A workflow-or-agent decision with reasons, tool contracts and an autonomy level', 'A decision tested as a hypothesis, with an AI-assisted option comparison and its review points', 'Machine-readable architecture rules, each with the check that verifies it or a named human reviewer', 'Orchestration, approval and failure design with budgets, an evaluation plan, tracing design and an agent architecture document'],
    capstone: 'One agent system design: tools as contracts, memory, limits, human approval, rules an agent must follow with the checks that enforce them, and an evaluation plan.',
    assessment: 'Quiz questions in every lesson and a lab with health checks across 16 sections, including a check that every rule names the test or reviewer that verifies it. The certificate shows you finished the course.',
    mapping: [
      ['Cybersecurity for Agentic Environments Academy', 'The security side of agent systems is taught there. Level 4 here is about design; the two are meant to be taken together.'],
      ['iSAQB CPSA-A module AGENTA', 'The public curriculum (2026.1-rev5, 31 July 2026) was read on 27 November 2026: seven sections and 34 learning goals. The lessons are written against those topics. This is a topic benchmark only: no iSAQB credit is offered and Intellica is not an accredited provider.'],
    ],
    caveat: 'Level 4 is independent self-study. It is not iSAQB AGENTA training and gives no iSAQB credit. Research it cites is recent, mostly preprints, and its limits are stated in each lesson.',
  },
  {
    n: 5, id: 'level-5', course: null, short: 'Governance and Evolution',
    tagline: 'Keep architecture healthy across many teams and many years: guardrails teams accept, migrations that finish and dependencies you can leave.',
    audience: 'Lead engineers, platform owners and architects responsible for more than one team or system.',
    prereq: 'Level 4, Agentic AI Architecture, or equivalent experience across more than one system.',
    status: { key: 'planned', label: 'Planned: outline published, course not built' },
    evidence: ['Principles, guardrails, a review process that does not block, and health measures', 'A migration plan with a way back at each step, and a dependency assessment with an exit', 'A risk register and compliance mapping with audit evidence'],
    capstone: 'One governance pack: principles, checks, migration plan, dependency exits and compliance evidence.',
    assessment: 'Planned: quiz questions, a governance lab and a moderated review. Not available yet.',
    mapping: [
      ['ISO/IEC/IEEE 42010:2022', 'Architecture description vocabulary (viewpoints, concerns, rationale). Paid standard: concepts only.'],
      ['Cybersecurity academy, Level 6', 'Risk, regulation and accountable decisions overlap with the governance level there.'],
    ],
    caveat: 'This level has no course yet. Nothing here is for sale.',
  },
  {
    n: 6, id: 'level-6', course: null, short: 'Lead Architect Practice',
    tagline: 'Lead architecture across an organisation: strategy, roadmap, stakeholders and teams, including the AI agents that now work beside them.',
    audience: 'Senior architects and heads of engineering who set architecture direction for an organisation.',
    prereq: 'Level 5, Architecture Governance and Evolution, or equivalent experience leading architecture work.',
    status: { key: 'planned', label: 'Planned: outline published, course not built' },
    evidence: ['Stakeholder map, business case and a roadmap a board can read in ten minutes', 'Capability map and build, buy or partner decisions', 'An architecture strategy you present and defend'],
    capstone: 'An architecture strategy document, presented and defended against hard questions.',
    assessment: 'Planned: a portfolio, an oral defence and independent review. A multiple-choice test alone cannot assess this level, so none will be used for it.',
    mapping: [
      ['iSAQB CPSA-A (Advanced)', 'A separate external route with its own experience and examination rules. Intellica does not prepare for it or award it.'],
    ],
    caveat: 'This level has no course yet. Any Intellica recognition for it would follow a published, moderated assessment that does not exist yet.',
  },
];
