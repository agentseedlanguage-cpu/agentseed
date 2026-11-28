// Level 4, lessons 9-12: Keeping coding agents aligned, extracting architecture, and orchestration. Same compact format as part1.mjs.
// Read 2026-11-27: AGENTA curriculum 2026.1-rev5 (sections 2, 4 and 5), arXiv 2611.09088, arXiv 2610.13647, arXiv 2609.30334. Cases marked "Illustrative" are invented.
export default [
{
  n: 9, title: 'A harness of preventive and detective controls',
  lead: 'Giving an agent knowledge improves the odds; controls make the rules hold. You will design a small harness of preventive and detective controls and test that it still works after routine operations.',
  slides: [
    ['Knowledge is not control', 'Explain why agents need explicit controls beyond knowledge.',
      'Knowledge raises the probability that an agent follows a rule; only a control makes the rule hold when the agent does not.',
      'AGENTA learning goal 4-1 asks learners to explain why agents need explicit architectural control beyond knowledge alone, and why such controls are temporary investments. As models and tooling improve, some controls can be retired, so write down why each one exists and when you would review it.',
      'For each rule, ask: what happens if the agent has the knowledge and still breaks it?',
      'Why might a control be a temporary investment?'],
    ['Preventive and detective', 'Choose between controls that stop and controls that find.',
      'Preventive controls stop a violation before it lands; detective controls find it afterwards.',
      'Preventive examples: type checks, linters, architecture tests that block a merge, sandboxing, permissions, approval steps. Detective examples: nightly drift reports, review of agent changes, audit logs and alerts. AGENTA learning goal 4-2 asks learners to weigh precision, coverage, speed and depth when designing such a harness.',
      'Pair each high-criticality rule with a preventive control and add a detective control as a safety net.',
      'Which of your rules needs both a preventive and a detective control?'],
    ['Controls fail quietly', 'Test controls against real operation sequences.',
      'A control that works on day one can stop working after an ordinary operation, with no code change.',
      'A 2026 study of five agent runtimes (arXiv 2611.09088) found that reapplying a plugin, saving an “always allow” rule, compacting history or restarting could silently drop policy checks or provenance labels; an approved edit once ran without a policy decision. The study is purposive and some runtimes were developer previews, so it shows the failures can happen, not how often.',
      'List the operations your system performs routinely and test each control after each one.',
      'Name three routine operations after which you would retest an approval control.'],
    ['Weigh the trade-offs', 'Balance precision, coverage, speed and depth.',
      'A control that is slow, noisy or shallow will be switched off, so design for the people who live with it.',
      'Precise controls give few false alarms; broad ones catch more but cost trust. Fast controls can run on every change; deep ones may run nightly. AGENTA learning goal 4-5 adds feedback: every escape, meaning a violation that slipped through, should improve a control.',
      'For each control write precision, coverage, speed and depth in a word each, and where it runs.',
      'What should you do when a violation slips past every control?']
  ],
  guide: [
    'Build a small control matrix. Rows are your rules from lesson 7. Columns are: the preventive control, the detective control, how precise it is, how much it covers, how fast it runs and where it runs. Fill every high-criticality row; leave low rows lighter on purpose. A page like this is the heart of your harness, and it is easier to improve than a vague intention to keep agents in line.',
    'Add the column the harness study makes necessary: operations to retest after. List what your team does routinely, such as upgrading the agent tool, adding a rule, restarting the service and compacting context, and run the controls after each. A control you have never seen fail is a control you have not tested.'
  ],
  case: 'Illustrative case. For Doubles-to-Go, RULE-3 (refund cap) has a preventive control in the tool, a test that runs on every change, and a detective control, a nightly query that lists any refund above TT$100. The team lists operations: restart, redeploy, edit the allow list, upgrade the agent library. After a library upgrade, their test shows the approval step is skipped when two refunds are batched. They fix the batch path, add a test for it and record it as an escape that improved the harness.',
  lab: {
    title: 'Design the harness: a matrix of controls',
    intro: 'Take the rules from lesson 7 and give each a preventive and a detective control, with an honest view of their strengths.',
    tasks: [
      'For every rule, name a preventive control and a detective control (or say why only one).',
      'Describe each control in a word each for precision, coverage, speed and depth, and say where it runs.',
      'List at least five routine operations after which the controls must be retested, and say how.',
      'Write why each high-criticality control exists and the condition under which you would review or retire it.'
    ],
    evidence: 'The control matrix, the operations list and the review conditions.',
    model: '| Rule | Preventive | Detective | Precision / coverage / speed / depth | Where |\n|---|---|---|---|---|\n| RULE-2 imports | Architecture test blocks merge | Nightly import graph report | High / broad / fast / medium | CI, nightly |\n| RULE-3 refund cap | Cap inside the tool | Nightly list of refunds over 100 | High / complete / instant / shallow | Runtime, nightly |\n| RULE-5 approval | Tool refuses without approval id | Weekly audit of refunds without approval | High / complete / instant / shallow | Runtime, weekly |\n\n**Retest after.** Restart; redeploy; allow-list edit; agent library upgrade; batched requests. Run the policy tests in CI after each.\n\n**Review.** The RULE-3 cap check is reviewed when the agent has run 90 days with no escape, and retired only by the finance lead.'
  },
  rubric: [
    ['Coverage of rules', 'Some rules only', 'Every rule listed, controls missing', 'Every high-criticality rule has preventive and detective controls'],
    ['Trade-offs', 'None stated', 'Some attributes', 'Precision, coverage, speed, depth and where it runs for each'],
    ['Operations', 'No operations', 'Operations listed, no retest', 'Five operations and how each control is retested'],
    ['Lifespan', 'No reasoning', 'Reasons without review condition', 'Why each control exists and when it would be reviewed']
  ],
  quiz: [
    ['Why add controls when the agent already has the rules?', ['Rules are decoration.', 'Knowledge raises the odds of compliance; a control makes the rule hold when the agent does not follow it.', 'Controls are cheaper than knowledge.', 'Agents cannot read rules.'], 1, 'AGENTA learning goal 4-1: knowledge alone is not control.'],
    ['What did the 2026 runtime study show about controls?', ['They never fail.', 'Routine operations such as reapplying a plugin or restarting could silently stop a control from applying.', 'They are unnecessary.', 'Only detective controls fail.'], 1, 'The study shows such failures occur; it does not measure how often.'],
    ['What should happen when a violation slips past every control?', ['Nothing', 'Improve a control so the escape would be caught next time', 'Remove the rule', 'Blame the model'], 1, 'AGENTA learning goal 4-5 asks for feedback that improves the control system.']
  ],
  sources: [
    'iSAQB AGENTA curriculum 2026.1-rev5, learning goals 4-1, 4-2 and 4-5 (read 2026-11-27)',
    'arXiv 2611.09088, When Routine Operations Break Architectural Pattern Relationships in LLM Agent Harnesses (read 2026-11-27; purposive study)',
    'Ford, Parsons and Kua, Building Evolutionary Architectures, O’Reilly (fitness functions) (not re-read in this edition)'
  ]
},
{
  n: 10, title: 'Architecture tests and drift checks in the pipeline',
  lead: 'Rules that run on every change keep an agent inside your design. You will write real checks, add them to existing code without drowning in old violations and prove each one catches a deliberate break.',
  slides: [
    ['Fitness functions', 'Express a rule as an automated check.',
      'A fitness function is an automated check that tells you whether the system still has a property you care about.',
      'Ford, Parsons and Kua popularised fitness functions in Building Evolutionary Architectures. Tools exist for many languages: ArchUnit for Java, import-linter for Python and dependency-cruiser for JavaScript (not re-read in this edition). Structural rules such as who may import whom are the easiest to automate.',
      'Turn your structural rules into tests with a tool for your language.',
      'Which of your rules can a machine check, and which cannot?'],
    ['Where the checks run', 'Place each check where it is fast enough to be used.',
      'Fast checks run on every change, slower ones run nightly, and a drift analysis runs after larger agent changes.',
      'AGENTA learning goal 4-3 asks learners to decide where in the process controls belong and to design continuous verification against drift. A sensible split: pre-commit for formatting and imports, CI for architecture tests, nightly for dependency and size reports.',
      'For each check, write where it runs and how long it takes.',
      'Why is a ten-minute check a poor choice for every commit?'],
    ['Add controls to old code', 'Introduce checks incrementally without a wall of failures.',
      'Record today’s violations as a baseline, fail only on new ones and shrink the baseline over time.',
      'AGENTA learning goal 4-4 asks learners to introduce controls incrementally into existing codebases, weighing effort against risk. A ratchet works: the number of allowed violations may go down but never up. Prioritise rules where one violation is dangerous. The Thoughtworks Technology Radar (volume 35, April 2026, Assess ring) describes pairing deterministic tools such as ArchUnit with model-based triage to reduce drift, and warns that first scans surface many violations, that agent-made fixes should stay small and that a verification loop is needed to confirm a fix helped.',
      'Create a baseline file of known violations and make the check fail on anything new.',
      'What does a ratchet do when someone fixes a violation?'],
    ['Prove the check works', 'Break the rule on purpose and watch the check fail.',
      'A check you have never seen fail may not be checking anything.',
      'Write a deliberately bad change and show the check rejects it; keep it as a test. This also guards against the harness study’s finding that controls can silently stop applying (arXiv 2611.09088). Review escapes and update rules; AGENTA learning goal 4-5 asks for feedback processes that improve the control system.',
      'For each check, keep one example that must fail.',
      'How do you know your import rule is really running?']
  ],
  guide: [
    'Choose the three rules from lesson 7 that a tool can check and write the checks. For import rules, a short configuration for import-linter, ArchUnit or dependency-cruiser is enough. For policy rules such as the refund cap, a plain unit test of the tool is enough. For each check, write the command that runs it and where it runs. Run them now and fix or baseline what they find.',
    'Then prove each check. Make a small bad change, such as an illegal import or a refund over the cap, and show the check fails. Keep that example as a permanent test. Last, add a line to the harness for escapes: when something slips through, the postmortem ends with a new or sharper check.'
  ],
  case: 'Illustrative case. The Doubles-to-Go repository has 43 places where order screens import the payment library. The team writes an import contract and runs it: 43 failures. They record the 43 as a baseline, so the build fails only on new violations, and they set a goal of removing five a week. A coding agent then adds a 44th in a feature branch and the build blocks the merge with a clear message. A week later the count is 38 and the baseline file shows it.',
  lab: {
    title: 'Write the tests that prove each rule, or mark it as a human review',
    intro: 'For the rules you wrote, produce the actual checks, their baseline and the evidence that each one fails when it should.',
    tasks: [
      'Write or describe a real check for at least three rules: the tool or test, the command to run it and the file where it lives.',
      'Say where each check runs and how long it takes, and mark any rule that only a person can review with the reviewer and the moment of review.',
      'If your code already breaks a rule, describe the baseline and the plan to shrink it, with a weekly number.',
      'For each check, describe the deliberate bad change that must make it fail and the result you saw or expect.'
    ],
    evidence: 'Three checks with commands and locations, the baseline plan, and one must-fail example per check.',
    model: '**RULE-2 imports.** Tool: import-linter. File: .importlinter. Command: lint-imports. Runs in CI on every pull request, about 8 seconds. Baseline: 43 existing violations in baseline.txt; shrink by 5 a week. Must-fail example: add `import payments.client` in orders/screen.py; expected result: contract broken.\n\n**RULE-3 refund cap.** Test: tests/policy/test_refund_cap.py. Command: pytest tests/policy. Runs in CI, 2 seconds. Must-fail example: call issue_refund(order, 101); expected: refused with error CAP_EXCEEDED.\n\n**RULE-6 decision records.** Human review: tech lead, at pull request review, when a new external service appears.'
  },
  rubric: [
    ['Checks', 'No real checks', 'Checks described vaguely', 'Three checks with tool, command and location'],
    ['Placement', 'Not stated', 'Where it runs, not how long', 'Where it runs and how long, with human reviews marked'],
    ['Baseline', 'Ignores existing code', 'Mentions old violations', 'Baseline and a shrink plan with a number'],
    ['Must-fail example', 'None', 'One example', 'A deliberate bad change and expected failure for every check']
  ],
  quiz: [
    ['What is a ratchet baseline?', ['A list of rules', 'A record of existing violations so only new ones fail, shrinking over time', 'A type of test', 'A model setting'], 1, 'AGENTA learning goal 4-4: introduce controls incrementally into existing code.'],
    ['Why keep a deliberate must-fail example for each check?', ['For decoration', 'To show the check really fires and to catch it silently stopping', 'Because tools require it', 'To slow the build'], 1, 'A check never seen failing may not be checking anything.'],
    ['Which rule is hardest to automate?', ['A forbidden import', 'A refund cap in code', 'Whether a design choice is wise', 'A file size limit'], 2, 'Judgment calls stay with a named human reviewer.']
  ],
  sources: [
    'iSAQB AGENTA curriculum 2026.1-rev5, learning goals 4-3 to 4-5 (read 2026-11-27)',
    'Thoughtworks Technology Radar vol. 35, Architecture drift reduction with LLMs (April 2026, Assess). thoughtworks.com/radar/techniques/architecture-drift-reduction-with-llms (read 2026-11-27)',
    'ArchUnit (archunit.org), import-linter (import-linter.readthedocs.io), dependency-cruiser (github.com/sverweij/dependency-cruiser) (not re-read in this edition)'
  ]
},
{
  n: 11, title: 'Extracting architecture from existing code, and checking what the agent found',
  lead: 'Agents can read a codebase faster than you can, but they can also describe it wrongly with total confidence. You will extract a view, then verify every claim before it enters your documentation.',
  slides: [
    ['As-is and to-be', 'Separate as-is from to-be and human-facing from agent-facing documentation.',
      'As-is documentation says what the system is; to-be says what we intend; and readers differ, so humans and agents need different forms.',
      'AGENTA learning goal 5-1 asks learners to distinguish as-is from to-be documentation and human-facing from agent-facing documentation. Extraction from code produces as-is; it must never silently become to-be.',
      'Label every extracted view as as-is, with the date and the commit it came from.',
      'Why is an extracted description not a statement of what the architecture should be?'],
    ['What can be extracted', 'Use agents to extract information from code and other artefacts.',
      'Code, configuration, tests, interfaces and dependency files all carry architectural facts that an agent can read.',
      'AGENTA learning goal 5-3 asks learners to use AI and agents to extract architectural information from such artefacts, validate it and identify business rules. Use deterministic tools, such as a dependency graph from your build, for facts that a tool can compute, and ask the agent for what tools cannot see, such as purpose and business rules.',
      'Choose for each fact whether a tool or an agent should extract it.',
      'Which would you trust more for listing module dependencies: an agent’s description or a tool’s graph?'],
    ['Verify before you trust', 'Validate extracted views against evidence.',
      'Treat each extracted claim as a hypothesis: confirm it with a tool, a test, a run of the system or a developer who knows.',
      'AGENTA learning goal 5-4 asks learners to validate generated views against developer knowledge and system behaviour. The 2026 focus group named cognitive debt, the gradual loss of human understanding when AI output is accepted without engagement. Checking claims is how you stay in command of the system.',
      'Sample the claims, check each against evidence and record confirmed, wrong or unknown.',
      'What should happen to a claim you cannot confirm?'],
    ['Keep it alive', 'Maintain documentation through the agentic loop.',
      'Extraction is repeated, not one-off: detect drift, draft updates, review and record.',
      'AGENTA learning goal 5-2 lists drift detection, decision record drafting with human review, traceability and review checkpoints. In A-SAW (arXiv 2610.13647) an agent drafted documents and humans approved them; practitioners said effort moved from drafting to verification. That study had one organisation and one model judge.',
      'Schedule a regular extraction, compare it with the last approved view and send differences to a reviewer.',
      'Who approves a change to the documented architecture, and how often?']
  ],
  guide: [
    'Pick one slice of a real codebase, such as one service or one module, and ask an agent to describe its building blocks, dependencies, interfaces and business rules. In parallel, produce the dependency graph with your build tool. Compare them. Where they disagree, the tool is usually right about structure and the agent is often more useful about meaning.',
    'Then verify. Take ten claims, check each against evidence and mark it confirmed, wrong or unknown. Record the wrong ones, because they teach you where this agent misleads. Only confirmed claims enter the documentation, dated, with the commit they came from. Repeat on a schedule and send changes to a person.'
  ],
  case: 'Illustrative case. A new engineer asks an agent to document the Doubles-to-Go order service. It lists eight modules and says the payment module calls the notification module. The dependency graph from the build shows the opposite direction. Of ten sampled claims, seven are confirmed, two wrong and one unknown. The team records the two errors, confirms the unknown with the original developer, and publishes the seven confirmed claims as the as-is view for commit 9f3c2a1, dated and marked unreviewed for the rest.',
  lab: {
    title: 'Extract an architecture view and verify what the agent found',
    intro: 'Choose one slice of a real or sample codebase. Extract a view with an agent or by hand and verify at least ten claims.',
    tasks: [
      'Name the slice, the commit or date and the artefacts you extracted from.',
      'List ten claims about building blocks, dependencies, interfaces or business rules, saying whether a tool or an agent produced each.',
      'Check each claim against evidence and mark it confirmed, wrong or unknown, with the evidence.',
      'Say what enters your documentation, what is rejected and when you will extract again.'
    ],
    evidence: 'The slice, ten claims with evidence and verdicts, and the decision on what to publish.',
    model: '**Slice.** order-service, commit 9f3c2a1, 2026-11-27. Artefacts: source, build file, tests.\n\n| # | Claim | By | Evidence | Verdict |\n|---|---|---|---|---|\n| 1 | Eight modules | Tool | Build graph | Confirmed |\n| 2 | Payment calls notification | Agent | Graph: notification calls payment | Wrong |\n| 3 | Refunds capped at 100 | Agent | issue_refund test | Confirmed |\n| ... | | | | |\n| 10 | Orders expire after 20 minutes | Agent | Config not found | Unknown |\n\n**Result.** 7 confirmed, 2 wrong, 1 unknown. Publish the 7 as the as-is view for the commit. Ask the original developer about claim 10. **Next extraction.** Weekly, differences sent to the tech lead.'
  },
  rubric: [
    ['Slice and provenance', 'No commit or date', 'Slice named only', 'Slice, commit or date and artefacts named'],
    ['Claims', 'Fewer than five', 'Claims without source', 'Ten claims marked tool or agent'],
    ['Verification', 'None', 'Verdicts without evidence', 'A verdict and evidence for each claim'],
    ['Maintenance', 'One-off', 'A plan without a reviewer', 'Schedule, comparison and a named approver']
  ],
  quiz: [
    ['Which should you trust more for module dependencies?', ['An agent’s prose', 'A dependency graph produced by your build tool', 'A guess', 'The oldest document'], 1, 'Tools compute structure reliably; agents add meaning.'],
    ['What is cognitive debt, as named by the focus group?', ['A financial loan', 'Loss of human understanding when AI output is accepted without engaging with it', 'A syntax error', 'Slow builds'], 1, 'It is a risk named in an experience report; checking claims is a way to avoid it.'],
    ['What should happen to a claim you cannot confirm?', ['Publish it anyway', 'Mark it unknown and resolve it with evidence or a person', 'Delete the module', 'Rewrite as fact'], 1, 'Only confirmed claims enter the documentation.']
  ],
  sources: [
    'iSAQB AGENTA curriculum 2026.1-rev5, learning goals 5-1 to 5-4 (read 2026-11-27)',
    'arXiv 2609.30334, focus group report on cognitive debt and harness engineering (read 2026-11-27)',
    'arXiv 2610.13647, A-SAW (read 2026-11-27; one organisation, one model judge)'
  ]
},
{
  n: 12, title: 'Orchestration patterns and when multi-agent designs help',
  lead: 'More agents is not more intelligence. You will learn the common orchestration patterns, when splitting into several agents pays for itself, and how to contain failure between them.',
  slides: [
    ['Common patterns', 'Name the standard orchestration patterns.',
      'Most agent systems are built from a few patterns: chaining, routing, parallel work, an orchestrator with workers, and an evaluator that critiques an optimiser.',
      'Anthropic’s guide Building effective agents (December 2024) names these as prompt chaining, routing, parallelisation, orchestrator-workers and evaluator-optimizer (not re-read in this edition). AGENTA learning goal 2-7 asks learners to shift architectural work from implementation to orchestration, comparing fixed plans with composed workflows.',
      'Match your task to the simplest pattern that fits.',
      'Which pattern fits “classify the complaint, then send it to the right team”?'],
    ['When to split into agents', 'Decide whether several agents are justified.',
      'Split only when contexts, permissions or skills genuinely differ, not because the org chart has several boxes.',
      'Each extra agent adds a hand-off, a context to build, a failure to contain and a cost to pay. Good reasons: separate permissions (one agent reads customer data, another acts), a context too large for one agent, or independent work that can run in parallel. Weak reason: it looks neat.',
      'For each proposed agent, write the permission, context or skill that justifies it.',
      'What would be a weak reason to create a second agent?'],
    ['Contracts between agents', 'Design the interface between agents.',
      'The message between two agents is an interface: define its fields, its size and what it must never carry.',
      'Open protocols such as Agent2Agent (A2A, announced by Google in 2025 and now also hosted by the Linux Foundation; not re-read in this edition) exist for agent-to-agent calls, but the architectural questions are the same as for any interface: schema, versioning, authentication, limits and failure. Untrusted text passed between agents can carry instructions, so keep trust labels attached.',
      'Define each hand-off as a small schema with limits and a trust label.',
      'What should the hand-off between a research agent and an acting agent never carry unchecked?'],
    ['Contain the failure', 'Stop one agent’s failure spreading.',
      'Give each agent its own budget, its own permissions and a place where a run stops.',
      'A wrong output from one agent becomes the next agent’s trusted input unless you check it. Put validation at each boundary, cap the total steps and cost of the whole system and make every agent’s authority narrower than the system’s. Compare with ATAM-style scenarios for agents, as in AgentArcEval (arXiv 2510.21031), an early study.',
      'Set a budget per agent and per system and write where an invalid hand-off is rejected.',
      'Where do you check an agent’s output before another agent acts on it?']
  ],
  guide: [
    'Start with one agent and a workflow. Add a second only when you can name the permission, context or skill that needs it. Draw the agents as boxes with their tools, their permissions and their budgets, and draw each hand-off as an arrow labelled with a schema. If an arrow carries free text, ask what could ride along inside it.',
    'Then add containment: validation at every boundary, a budget for each agent and one for the whole system, and a rule that no agent has more authority than the task needs. When the diagram is on one page, you can review it. When it needs three pages, you probably have too many agents.'
  ],
  case: 'Illustrative case. Doubles-to-Go considers three agents: triage, investigator and refunder. Review shows the triage and investigator both only read data, so they merge. The refunder has the only changing tool and a separate budget. The hand-off from investigator to refunder is a schema: order id, amount between 1 and 100 and a reason of at most 200 characters, with a label showing the reason came from a customer. The refunder checks the schema and the cap again, and neither agent can approve its own action.',
  lab: {
    title: 'Choose an orchestration pattern and contain failure between agents',
    intro: 'Decide whether your system needs one agent or several, and design the hand-offs and boundaries.',
    tasks: [
      'Choose the simplest pattern that fits your task and say why the simpler ones do not.',
      'If you propose more than one agent, justify each by a permission, context or skill; otherwise explain why one is enough.',
      'Define each hand-off as a schema with limits, a trust label and a check at the receiving side.',
      'Set a budget for each agent and for the whole system, and say where a run stops when a boundary is violated.'
    ],
    evidence: 'The pattern choice, a one-page diagram or list of agents with tools and permissions, the hand-off schemas and the budgets.',
    model: '**Pattern.** Orchestrator-workers is more than needed; routing plus two workers suffices. **Agents.** (1) Investigator, read only: get_order, get_payment, 8 steps, TT$0.30. (2) Refunder, changing: issue_refund only, 3 steps, TT$0.10. Merged triage into investigator because both only read.\n\n**Hand-off investigator to refunder.** {order_id: string, amount_ttd: 1 to 100, reason: at most 200 characters, label: untrusted:customer}. The refunder validates the schema and the cap again.\n\n**System budget.** 12 steps, TT$0.60, 90 seconds. **Stop.** An invalid hand-off is rejected and the case goes to the vendor with the note.'
  },
  rubric: [
    ['Pattern', 'None chosen', 'Pattern named, no reasoning', 'Simplest fitting pattern with why simpler ones fail'],
    ['Agent split', 'Several agents with no reason', 'Some reasons', 'Each agent justified by permission, context or skill'],
    ['Hand-offs', 'Free text', 'Fields without limits', 'Schema, limits, trust label and receiver-side check'],
    ['Containment', 'None', 'System budget only', 'Per-agent and system budgets and a defined stop']
  ],
  quiz: [
    ['Which is a good reason to create a second agent?', ['It makes the diagram look balanced.', 'It needs different permissions from the first.', 'Competitors have more agents.', 'Models prefer teams.'], 1, 'Separate permissions, context or skills justify a split.'],
    ['Why attach a trust label to a hand-off?', ['To save tokens', 'Because untrusted text from one agent can carry instructions to the next', 'It is decorative', 'Labels speed up models'], 1, 'Trust must travel with the data between agents.'],
    ['What contains the failure of one agent?', ['Hoping', 'Validation at each boundary, separate budgets and narrower authority', 'A bigger model', 'A longer prompt'], 1, 'Boundaries and budgets stop errors spreading.']
  ],
  sources: [
    'Anthropic, Building effective agents (December 2024). anthropic.com/engineering/building-effective-agents (not re-read in this edition)',
    'iSAQB AGENTA curriculum 2026.1-rev5, learning goal 2-7 (read 2026-11-27)',
    'AgentArcEval, arXiv 2510.21031 (read 2026-11-26 per the cp40 notes; one qualitative case)'
  ]
}
];
