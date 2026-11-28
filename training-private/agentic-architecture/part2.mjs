// Level 4, lessons 5-8: Deciding with AI, and giving agents architectural knowledge. Same compact format as part1.mjs.
// Read 2026-11-27: AGENTA curriculum 2026.1-rev5 (sections 2 and 3), arXiv 2609.30334, arXiv 2610.13647, arXiv 2510.21031 and 2603.28914 (read 2026-11-26, per the cp40 notes).
// Cases marked "Illustrative" are invented.
export default [
{
  n: 5, title: 'Decisions as testable hypotheses',
  lead: 'A decision you cannot be wrong about is not an engineering decision. This lesson turns each important choice into a hypothesis with a cheap experiment and a result that would change your mind.',
  slides: [
    ['The decision cycle', 'Explain how AI changes the architectural decision cycle.',
      'Architectural decisions run in a cycle of drivers, options, choice, evidence and review, and AI speeds up some of the steps but not the responsibility.',
      'AGENTA learning goal 2-1 asks learners to explain how AI and agentic engineering affect the cyclical decision lifecycle and its feedback loops. The 2026 focus group report (arXiv 2609.30334) found strong agreement that humans keep decisions and accountability while AI prepares options.',
      'Draw your own cycle and mark which steps an AI may help with and which a named person owns.',
      'Which step in the cycle should always have a named human owner?'],
    ['A decision is a hypothesis', 'Phrase a decision as a testable claim.',
      'Write each important decision as: we believe this choice will deliver this outcome, and we will know by this date from this measurement.',
      'AGENTA learning goal 2-5 asks learners to treat architectural decisions as testable hypotheses and to validate them with lightweight experiments. Level 3 taught decision records; this adds the claim and the test to the record.',
      'Add three lines to a decision record: the claim, the measurement and the result that would reverse the decision.',
      'Rewrite “we will use a queue” as a testable hypothesis.'],
    ['Cheap experiments', 'Choose a lightweight experiment that fits the risk.',
      'The experiment should cost far less than the decision it protects.',
      'Useful cheap experiments: a spike of a day or two, a shadow run where the new design sees real input but changes nothing, a replay of recorded cases, or a small trial with one vendor or team. For agent designs, replaying sixty real cases through the proposed agent and counting correct decisions is often the best first test.',
      'Match the experiment to the risk: the riskier the assumption, the earlier and harder you test it.',
      'What cheap experiment would test “an agent can draft correct refund replies”?'],
    ['Criticality and review', 'Set review depth by criticality.',
      'High criticality decisions get a named reviewer and a recorded review; low ones can be lighter.',
      'The focus group used criticality, meaning uncertainty combined with cost of change, as the shared test for how much human oversight to apply. It is one expert session, so it is opinion, but it matches the Level 3 practice of reviewing the decisions that are costly to reverse.',
      'Tag each decision low, medium or high and write the reviewer’s name next to every high one.',
      'Why does the cost of changing a decision matter as much as how uncertain it is?']
  ],
  guide: [
    'Pick the three decisions in your agent design that would hurt most if wrong: usually the shape, the autonomy of one irreversible tool and the way knowledge reaches the agent. For each, write the claim, the measurement and the reverse trigger. If you cannot name a result that would change your mind, you have a preference, not a hypothesis.',
    'Then choose the cheapest experiment that could falsify the claim. Replaying recorded real cases through a draft design costs days, not months, and it replaces opinion with a count. Keep the experiment small; its job is to tell you which assumption to fix next.'
  ],
  case: 'Illustrative case. The Doubles-to-Go team decides that an assistant can draft correct refund replies. They write: Claim, the assistant’s suggested action matches the vendor’s final action in at least 85 percent of cases. Measurement, a replay of 120 past complaints with the vendor’s real decisions hidden. Reverse if, below 70 percent or if any suggestion exceeds the vendor’s stated policy. The replay takes two days. The result is 78 percent, mostly wrong on late orders. They keep the decision, record the finding, and add the late-order policy to the knowledge they give the assistant, then replay again.',
  lab: {
    title: 'Turn three decisions into testable hypotheses',
    intro: 'Choose the three decisions from your design that carry the most risk and give each a claim, a test and a reverse trigger.',
    tasks: [
      'Name three high-risk decisions from your design so far, with a criticality tag and a reviewer.',
      'Write each as a hypothesis: the claim, the measurement and the number or result that would reverse it.',
      'Choose a cheap experiment for each and estimate its cost in hours.',
      'Record the first result or, if you have not run it, the date you will and the person who will.'
    ],
    evidence: 'Three hypothesis records with experiments and reviewers.',
    model: '**Decision 1: Assistant, not agent, in release one (High, reviewer: vendor owner).** Claim: vendors approve at least 85 percent of drafted actions unchanged. Measure: replay 120 past complaints. Reverse if below 70 percent. Experiment: 2 days.\n\n**Decision 2: Refund cap TT$100 in the tool (High, reviewer: finance lead).** Claim: under 3 percent of valid refunds exceed the cap. Measure: last 6 months of refunds. Reverse if over 10 percent. Experiment: 2 hours of queries.\n\n**Decision 3: Policy text delivered at run time (Medium, reviewer: tech lead).** Claim: answers cite the right policy clause in 90 percent of test cases. Measure: 30 questions with known clauses. Reverse if below 75 percent. Experiment: 6 hours.'
  },
  rubric: [
    ['Hypothesis form', 'Preferences only', 'Claim without measurement', 'Claim, measurement and reverse trigger each stated'],
    ['Numbers', 'No numbers', 'A target but no reverse threshold', 'Target and reverse thresholds both numeric'],
    ['Experiment', 'None', 'Experiment named, no cost', 'Cheap experiment with an estimated cost and owner'],
    ['Review', 'No reviewer', 'Reviewer for some', 'Criticality tag and a named reviewer for every high decision']
  ],
  quiz: [
    ['What makes a decision testable?', ['It is written down.', 'It names a measurement and a result that would reverse it.', 'It was approved by a manager.', 'It uses a popular tool.'], 1, 'AGENTA learning goal 2-5 treats decisions as hypotheses to validate with lightweight experiments.'],
    ['Which is a cheap experiment for an agent design?', ['Build the full system first.', 'Replay recorded real cases through the draft design and count correct decisions.', 'Ask the model if it is correct.', 'Wait a year.'], 1, 'A replay costs days and produces a count.'],
    ['Who keeps accountability for architectural decisions in an AI-assisted team?', ['The model', 'A named human', 'The vendor of the model', 'Nobody'], 1, 'The focus group agreed accountability stays human; AI prepares options.']
  ],
  sources: [
    'iSAQB AGENTA curriculum 2026.1-rev5, learning goals 2-1 and 2-5 (read 2026-11-27)',
    'arXiv 2609.30334, What Will Remain Human in Software Architecture? (read 2026-11-27; one focus group)',
    'Nygard, Documenting Architecture Decisions (2011). cognitect.com/blog/2011/11/15/documenting-architecture-decisions (not re-read in this edition)'
  ]
},
{
  n: 6, title: 'Design exploration with AI: options, drivers and review points',
  lead: 'A model is good at producing many options quickly and poor at knowing which one fits your drivers. You will learn to use it for breadth while keeping the judgment with a person.',
  slides: [
    ['Drivers first', 'Turn quality goals into drivers and criteria before asking for options.',
      'Options generated without stated drivers are generic; decompose goals into assessable criteria first.',
      'AGENTA learning goals 2-2 and 2-3 ask learners to decompose quality goals top-down into drivers and assessable criteria, and to find pain points bottom-up. Your Level 3 quality tree and scenarios are exactly the input a model needs.',
      'Give the model your top three drivers with numbers and your hard constraints before asking for any design.',
      'What would a model produce if you asked for “a good architecture” with no drivers?'],
    ['Use AI for breadth', 'Generate and compare design variants against drivers.',
      'Ask for several distinct options, each evaluated against your drivers, with the assumptions each one makes.',
      'AGENTA learning goal 2-4 describes using AI for design exploration and variant generation, evaluated against drivers, constraints and principles. Ask for options that differ in kind, ask what each one assumes and ask what would make each fail.',
      'Request three options, a scoring against each driver and a list of assumptions, and treat the output as a draft.',
      'Why ask for the assumptions behind each option?'],
    ['Know the limits', 'Name the ways AI support goes wrong.',
      'Models can anchor on the first idea, flatter your preference, miss your constraints and sound equally sure when wrong.',
      'AGENTA learning goal 2-6 asks learners to recognise limits and keep human responsibility through review checkpoints. Early research applies LLMs to architecture evaluation: a 2026 preliminary study (Capilla and colleagues, arXiv 2603.28914) ran an LLM on an ATAM-style exercise, and AgentArcEval (arXiv 2510.21031) adapted ATAM to agent systems with eleven agent-specific scenarios in one qualitative case. Both are early and small, so treat them as leads, not proof.',
      'Ask the model to argue against its own best option, then check its claims against your numbers.',
      'Name two ways a model’s comparison of options could mislead you.'],
    ['Place the review points', 'Decide where a person must look.',
      'Review points should sit where an error is costly and hard to see: the drivers, the scoring and the final choice.',
      'In A-SAW (arXiv 2610.13647) the agent drafted documents but never committed to the main branch and a two-role human approval was mandatory; 11 of 13 practitioners rejected agent output no human had reviewed. The study has one organisation, one model judge and a builder who was also the evaluator.',
      'Mark three review points in your exploration process and name who attends each.',
      'Who should check the scoring of options, and what should they check it against?']
  ],
  guide: [
    'Use the model as a fast, tireless junior who has read a lot and knows nothing about your system. Give it your drivers with numbers, your constraints and your current design. Ask for three options that differ in kind, scored against the drivers, with assumptions and failure points. Then do the judging yourself: check each score against your own numbers and look for constraints it ignored.',
    'Keep a record of what you asked, what it returned and what you changed. That makes the process reviewable and lets you see where the model helped and where it misled you. The final decision is yours and carries your name.'
  ],
  case: 'Illustrative case. Doubles-to-Go needs a place for the assistant’s drafts to wait for vendor approval. The architect gives a model three drivers (drafts visible to the vendor within 2 seconds, no extra monthly cost above US$20, works on weak mobile data) and three constraints. It proposes a queue service, a database table with polling and a push channel. Its scoring favours the queue. The architect checks and finds the queue breaks the cost driver by a wide margin, which the model had not weighed. They pick the table with polling, write down why, and note the model’s error in the record.',
  lab: {
    title: 'Explore design options with AI and review them',
    intro: 'Choose one real design decision in your system and use a model, or yourself acting as one, to explore options. Record what you asked and what you changed.',
    tasks: [
      'State the decision, your top three drivers with numbers and your hard constraints.',
      'Ask for three options of different kinds, each scored against every driver with its assumptions and failure points. Paste the useful parts.',
      'Check every score against your own numbers and list at least two things you corrected or rejected.',
      'Choose an option, name the reviewer and write the review points where a person must look.'
    ],
    evidence: 'The decision, the prompt or request in summary, the options with your corrections, the choice and the review points.',
    model: '**Decision.** Where drafts wait for vendor approval. **Drivers.** Visible within 2 s; extra cost under US$20 a month; works on weak mobile data. **Constraints.** No new vendor contract; the team has no queue experience.\n\n**Options (AI draft, then corrected).** A Message queue (score: strong on speed, but extra cost about US$60, corrected from “low”). B Database table with polling every 2 s (cost nil, speed meets target, weak-data friendly). C Push channel (fast, but fails on weak mobile data, corrected from “works offline”).\n\n**Corrections.** Cost of A; offline claim for C. **Choice.** B. **Reviewer.** Tech lead checks scores against the cost sheet. **Review points.** Drivers, scores, final choice.'
  },
  rubric: [
    ['Drivers', 'Adjectives only', 'Drivers without numbers', 'Top drivers with numbers and constraints'],
    ['Options', 'One option', 'Options without scoring', 'Three different options scored against every driver with assumptions'],
    ['Checking the AI', 'Accepted as given', 'Spot checked', 'At least two real corrections recorded'],
    ['Review points', 'None', 'Reviewer named, no points', 'Named reviewer and the points where they look']
  ],
  quiz: [
    ['What should you give a model before asking for design options?', ['Nothing, so it is creative', 'Your drivers with numbers and your constraints', 'The competitor’s design', 'A request for the best architecture'], 1, 'Options without drivers are generic.'],
    ['Why ask a model for the assumptions behind each option?', ['To lengthen the answer', 'Because hidden assumptions are where options fail, and you can check them', 'Models cannot score without them', 'To avoid review'], 1, 'Assumptions are testable and reveal where a score is weak.'],
    ['What do early studies on LLMs in architecture evaluation allow you to conclude?', ['LLMs can replace reviewers', 'They are interesting leads that are small and early, not proof', 'LLMs are always wrong', 'Evaluation is no longer needed'], 1, 'Both cited studies are preliminary: treat them as leads.']
  ],
  sources: [
    'iSAQB AGENTA curriculum 2026.1-rev5, learning goals 2-2 to 2-6 (read 2026-11-27)',
    'AgentArcEval, arXiv 2510.21031, and Capilla et al., arXiv 2603.28914 (both read 2026-11-26 per the cp40 notes; early studies)',
    'arXiv 2610.13647, A-SAW (read 2026-11-27; one organisation, one model judge)'
  ]
},
{
  n: 7, title: 'Architecture knowledge agents can read: decision records, rules and specifications',
  lead: 'A coding agent cannot respect a rule it never saw. This lesson teaches you to write architecture knowledge in forms an agent can read, and to make every rule name the check that proves it.',
  slides: [
    ['Forms of knowledge', 'Choose forms of architectural knowledge suited to agents.',
      'Agents work best from short, structured, specific sources: decision records, rules, context files and typed element lists.',
      'AGENTA learning goal 3-2 asks learners to design agent-facing representations of architectural knowledge: decision records, rules, context files, knowledge bases and structured constraints. A-SAW (arXiv 2610.13647) used a typed element catalog as a naming contract so every document called the same building block by the same name.',
      'List your sources of architecture knowledge and mark which an agent could use today and which need rewriting.',
      'Why does a shared catalogue of component names help an agent?'],
    ['One rule, one check', 'Write each rule so that it names how it is verified.',
      'A rule is finished only when it says what verifies it: a test, a linter, a policy check, or a named person who reviews it.',
      'A rule written as a sentence in a document will be missed. Write it with an id, a plain statement, a reason and either VERIFIED_BY, naming the automated check, or REVIEWED_BY, naming the human role. Rules a machine cannot check stay human-reviewed, and you say so. This is Intellica’s teaching convention; a small public repository of agent guidance uses the same idea, and it is an example, not a standard.',
      'Rewrite your three most important rules in the id, statement, reason, check form.',
      'Why is “services must be loosely coupled” not yet a rule?'],
    ['Entry point, not encyclopaedia', 'Keep the agent’s entry file short and let it point onward.',
      'A short entry file that routes the agent to the right detail beats one giant file.',
      'Entry files such as AGENTS.md, a convention for coding agents that is now hosted with the Agentic AI Foundation (not re-read in this edition), work best as a map: what the project is, the commands to build and test, the rules that must never be broken and where to read more. AGENTA learning goal 3-4 asks for a balance between completeness and signal quality.',
      'Write an entry file of under one page that points to your rules, decisions and tests.',
      'What belongs in the entry file and what should it only link to?'],
    ['Keep it true', 'Keep knowledge current and say when it is not.',
      'Stale knowledge misleads an agent as confidently as correct knowledge guides it.',
      'Date every record, name its owner and mark status as active, superseded or proposed. When an agent finds a gap, it should say so and ask rather than invent; A-SAW had its agent mark gaps instead of filling them with plausible text. Review the knowledge when the code or the decision changes.',
      'Add an owner, a date and a status to each rule and record.',
      'What should an agent do when your documentation does not answer its question?']
  ],
  guide: [
    'Start from what you already have: arc42 sections, decision records, a README. Pick the ten statements an agent most needs to respect and rewrite them as rules. Each rule gets an id like RULE-3, one sentence of statement, one of reason and a check. If you can only write a person for the check, write REVIEWED_BY and the role. If you can write a test, write VERIFIED_BY and its location. That line is what separates guidance from wishes.',
    'Then write the short entry file. It should fit one screen and say what the system is, how to build and test it, the rules that cannot be broken and where the detail lives. Link to it from the root of the repository so any agent finds it. Put dates and owners on everything and mark superseded records so agents do not follow them.'
  ],
  case: 'Illustrative case. The Doubles-to-Go repository has an arc42 document nobody reads and a coding agent that keeps importing the payment library directly into the order screens. The team writes six rules. RULE-2: order screens must not import the payment library; payments go through the PaymentPort. Reason: lets us change payment providers. VERIFIED_BY: tests/architecture/test_imports.py. RULE-5: refund amounts above TT$100 need a human approval step. VERIFIED_BY: tests/policy/test_refund_cap.py. RULE-6: a new external service needs a decision record. REVIEWED_BY: tech lead in pull request review. The entry file is 40 lines and links to all six.',
  lab: {
    title: 'Write the machine-readable architecture rules an agent must follow',
    intro: 'Write the rules file for your system. Every rule must say how it is verified, by an automated check or by a named person.',
    tasks: [
      'Write at least six rules as RULE-1 to RULE-6 or more, each with a statement and a reason, covering structure, tools, data and approval.',
      'Give every rule a VERIFIED_BY line naming the check, or a REVIEWED_BY line naming the role.',
      'Add an owner, a date and a status (active, superseded or proposed) to the rules file.',
      'Write the entry file of under 40 lines that points an agent to the rules, the decisions and the commands to build and test.'
    ],
    evidence: 'The rules file with six or more rules, each with a check or a reviewer, and the entry file.',
    model: '**Rules file (owner: tech lead, 2026-11-27, status: active)**\n\nRULE-1: Only tools listed in the tool table may be called. Reason: unlisted tools have no contract. VERIFIED_BY: tests/policy/test_tool_allowlist.py\nRULE-2: Order screens must not import the payment library; use PaymentPort. Reason: lets us swap providers. VERIFIED_BY: tests/architecture/test_imports.py\nRULE-3: issue_refund accepts 1 to 100 TT$ and refuses a repeat refund. Reason: limits loss. VERIFIED_BY: tests/policy/test_refund_cap.py\nRULE-4: Customer text is stored with source_label untrusted:customer. Reason: stops injected text acting as instruction. VERIFIED_BY: tests/data/test_labels.py\nRULE-5: Refunds above TT$50 need vendor owner approval. Reason: money is hard to recall. VERIFIED_BY: tests/policy/test_approval.py\nRULE-6: A new external service needs a decision record. Reason: keeps decisions visible. REVIEWED_BY: tech lead in pull request review\n\n**Entry file (AGENTS.md).** What the system is; how to build and test; the six rules; where decisions live; what to do if unsure: stop and ask.'
  },
  rubric: [
    ['Rule quality', 'Vague wishes', 'Statements without reasons', 'Specific statement and reason for every rule'],
    ['Checks', 'No check named', 'Some rules name a check', 'Every rule has VERIFIED_BY or REVIEWED_BY'],
    ['Currency', 'No owner or date', 'Owner or date only', 'Owner, date and status on the file'],
    ['Entry file', 'None', 'Long, no routing', 'Short, with build and test commands and links to the detail']
  ],
  quiz: [
    ['When is an architecture rule finished?', ['When it is written in the wiki', 'When it names the automated check or the human reviewer that verifies it', 'When the CTO approves', 'When it has a number'], 1, 'A rule without a verification step is a wish.'],
    ['What belongs in an agent entry file?', ['The entire arc42 document', 'A short map: purpose, build and test commands, key rules, and links to detail', 'Marketing text', 'Passwords'], 1, 'Signal quality matters more than volume; link onward.'],
    ['What should an agent do when your documents do not answer its question?', ['Guess plausibly', 'Say there is a gap and ask', 'Delete the document', 'Ignore the question'], 1, 'A-SAW had its agent mark gaps instead of inventing text.']
  ],
  sources: [
    'iSAQB AGENTA curriculum 2026.1-rev5, learning goals 3-2 and 3-4 (read 2026-11-27)',
    'arXiv 2610.13647, A-SAW (read 2026-11-27; one organisation, one model judge, builder also evaluator)',
    'AGENTS.md convention, hosted with the Agentic AI Foundation. agents.md (not re-read in this edition)'
  ]
},
{
  n: 8, title: 'Delivering knowledge at the right moment: retrieval, skills and tool servers',
  lead: 'Having the right knowledge somewhere is not enough; it has to reach the agent when it needs it. You will design delivery, then measure whether it worked.',
  slides: [
    ['Three delivery routes', 'Compare always-loaded, retrieved and tool-provided knowledge.',
      'Knowledge can be loaded every time, fetched when needed or provided through a tool, and each route trades cost, freshness and reliability.',
      'AGENTA learning goal 3-3 asks learners to design delivery mechanisms such as retrieval-augmented generation, skills and the Model Context Protocol. Always-loaded text is reliable but costs every run; retrieval is cheaper but can miss; a tool call can fetch live data but adds a step.',
      'Assign each piece of knowledge to a route and say why.',
      'Which route suits “the refund cap is TT$100”, and which suits “today’s order status”?'],
    ['Skills and tool servers', 'Explain how skills and tool servers supply knowledge on demand.',
      'A skill packages instructions and resources that an agent loads only when the task matches; a tool server exposes data and actions through a standard interface.',
      'Agent skills and the Model Context Protocol both let an agent load detail on demand instead of carrying everything in context. MCP’s July 2026 update, as reported by VentureBeat, made the transport stateless and added durable task handles for long operations; confirm against the official specification before relying on those details.',
      'Move rarely used, detailed procedures into skills or tools and keep the always-loaded text small.',
      'What is the cost of putting every procedure in the always-loaded context?'],
    ['Signal over volume', 'Balance completeness against signal quality.',
      'The best knowledge set is the smallest one that still answers the questions the agent actually faces.',
      'AGENTA learning goal 3-4 asks learners to assess and improve how well architectural knowledge reaches agents, balancing completeness with signal quality. Too little leaves gaps; too much buries the key rule. Both fail quietly, which is why delivery needs a test.',
      'List the twenty questions an agent most needs answered and check each is answered by short, findable text.',
      'What is a sign that your knowledge set is too big?'],
    ['Measure delivery', 'Test whether the knowledge reaches the agent.',
      'Build a small question set with known answers and measure how often the agent finds and uses the right source.',
      'A-SAW (arXiv 2610.13647) found traceability the weakest dimension of agent-written documents at 79 percent, and its rubric measured structure, not whether recorded decisions were correct. So test correctness with questions whose answers you know, and record which source the agent cited.',
      'Write ten questions with expected answers and the source for each; run them and record hits and misses.',
      'If the agent answers correctly but cites no source, is delivery proven?']
  ],
  guide: [
    'Make a delivery plan as a three-column table: always loaded, retrieved on demand, provided by a tool. Keep the first column to what every run needs, such as the entry file and the non-negotiable rules. Put long procedures, reference material and history in the second. Put live data, such as the current order or the latest policy version, behind a tool.',
    'Then test it. Write ten to twenty questions the agent will actually face, with the correct answer and the document that holds it. Run them, record whether the agent answered correctly and whether it found the right source, and fix the weakest delivery first. Re-run after every change to the knowledge.'
  ],
  case: 'Illustrative case. The Doubles-to-Go assistant carries a 12-page refund policy in every run, and cost and drift both rise. The team keeps a 15-line summary and the six rules always loaded, moves the full policy to a retrieval index and the live order data behind get_order. They write twelve test questions, including three about late orders. First run: ten correct, two wrong, both because the late-order clause sat in a footnote. They promote that clause to the summary and the next run scores twelve of twelve.',
  lab: {
    title: 'Design delivery of knowledge and test it',
    intro: 'Plan how each piece of your agent’s knowledge reaches it, then write a test set that shows whether it does.',
    tasks: [
      'List the knowledge your agent needs and assign each item to always loaded, retrieved or tool-provided, with a reason.',
      'Estimate the size of the always-loaded text and say what you cut to keep it small.',
      'Write at least ten test questions with the expected answer and the source that holds it.',
      'Run the questions (with a model or by hand), record the results and name the first fix you would make.'
    ],
    evidence: 'The delivery table, the size estimate, the ten test questions and the results with a first fix.',
    model: '| Knowledge | Route | Reason |\n|---|---|---|\n| Six rules, entry file | Always loaded | Every run needs them; 600 tokens |\n| Refund policy summary | Always loaded | 15 lines; 250 tokens |\n| Full refund policy | Retrieved | 4,000 tokens; needed in about 1 case in 5 |\n| Order and payment data | Tool | Live data |\n\n**Test set (12 questions).** Example: “A customer reports a missing item eight days after the order. Refund?” Expected: no, policy limit 7 days (clause 3). Source: refund policy clause 3.\n\n**Results.** 10 of 12 correct; 2 wrong on late orders; both clauses were in a footnote. **First fix.** Promote the late-order clause to the summary and re-run.'
  },
  rubric: [
    ['Delivery plan', 'Everything always loaded', 'Routes named without reasons', 'Each item has a route and a reason'],
    ['Signal', 'No size thinking', 'Size noted, nothing cut', 'Size estimate and what was cut'],
    ['Test set', 'Fewer than five questions', 'Questions without expected sources', 'Ten or more questions with expected answers and sources'],
    ['Improvement', 'No results', 'Results without a fix', 'Results recorded and the first fix named']
  ],
  quiz: [
    ['Which knowledge belongs in the always-loaded context?', ['Everything the project has ever recorded', 'Only what every run needs, such as the entry file and non-negotiable rules', 'Nothing', 'Only marketing text'], 1, 'Always-loaded text costs every run, so keep it small.'],
    ['Why test knowledge delivery with questions you know the answers to?', ['To make the agent faster', 'Because structure can look right while content is wrong; known answers check correctness', 'Because models cannot read documents', 'It is not necessary'], 1, 'A-SAW’s rubric measured structure, not correctness of decisions.'],
    ['Which route suits live data such as today’s order status?', ['Always loaded text', 'A tool call', 'A skill written last year', 'Memory'], 1, 'Live data should be fetched, not copied.']
  ],
  sources: [
    'iSAQB AGENTA curriculum 2026.1-rev5, learning goals 3-3 and 3-4 (read 2026-11-27)',
    'VentureBeat, MCP just got its biggest update ever (reported 28 July 2026; press report, confirm against the official specification)',
    'arXiv 2610.13647, A-SAW, results on traceability (read 2026-11-27)'
  ]
}
];
