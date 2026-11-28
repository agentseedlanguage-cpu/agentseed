// Level 4, lessons 13-16: Running agent systems you can trust. Same compact format as part1.mjs.
// Read 2026-11-27: AGENTA curriculum 2026.1-rev5 (sections 6 and 7), iSAQB CPSA-F 2027.1-RC1 chapter 5, arXiv 2609.30334, arXiv 2610.13647. Legal topics are orientation only, not legal advice.
// Cases marked "Illustrative" are invented. Costs and prices in cases are invented placeholders: use your own measured figures.
export default [
{
  n: 13, title: 'Failure modes, retries and cost budgets',
  lead: 'Agents fail in ordinary ways: loops, wrong tools, timeouts and runaway cost. You will list the failure modes, design safe retries and set budgets you can calculate.',
  slides: [
    ['Name the failure modes', 'List how an agent system fails.',
      'Common failures are a wrong tool or wrong arguments, a loop, work done halfway, stale context, a tool error or timeout, a rate limit and a cost that runs away.',
      'AGENTA learning goal 2-7 includes failure containment and cost awareness when shifting from implementation to orchestration. Add the failures from your own system: for each, write how you would notice it and what the harm is.',
      'Write a failure table with six rows: failure, detection, containment, recovery.',
      'How would you notice that an agent is looping?'],
    ['Retries that are safe', 'Design retries that cannot double an action.',
      'Retry only what is safe to repeat, bound the attempts, and make changing actions idempotent so a repeat has no extra effect.',
      'Use an idempotency key so a repeated refund request returns the first result rather than paying twice. Use bounded retries with waiting between attempts and stop with a clear error. For long operations the Model Context Protocol’s July 2026 update, as reported by VentureBeat, returns a durable task handle so a client can disconnect and resume (press report; confirm in the specification).',
      'Give each changing tool an idempotency key and each retry a maximum.',
      'What happens if a refund tool retries after a timeout without an idempotency key?'],
    ['Checkpoints and resumption', 'Resume work safely after a failure.',
      'Save progress at safe points so a restart continues rather than repeats.',
      'The 2026 harness study (arXiv 2611.09088) found a grouped node that repeated completed work on resumption, and approval that failed on some routes. Record each completed step with its result, and on resume skip what is done; test restart in the middle of a run.',
      'Define the checkpoints and test a restart between two steps.',
      'What could go wrong if a resumed run repeats an already completed step?'],
    ['Budgets you can calculate', 'Set and compute cost and step budgets.',
      'A budget is a number you can calculate in advance and enforce at run time.',
      'Cost per run is roughly the number of model calls times the tokens in and out times your provider’s price, plus tool costs. Use your own measured figures. Level 3’s error budget idea applies too: decide how many failed runs you can tolerate and what happens when you spend that budget.',
      'Compute the expected and worst case cost of one run and set a hard limit above it.',
      'What should happen at the moment a run reaches its cost limit?']
  ],
  guide: [
    'Write the failure table first: at least six failures, each with how you would see it, how far it can spread, and how the system recovers. Then add the guards: step and cost limits that stop a loop, idempotency keys on every changing tool, bounded retries with waiting, and checkpoints so a restart does not repeat finished work.',
    'Then do the arithmetic. Count the model calls in a typical run and in the worst allowed run, use your measured token counts and your provider’s current price, and compute both costs. Set the hard limit a little above the worst allowed case, and decide what happens when it is hit. A budget you never calculate is only a hope.'
  ],
  case: 'Illustrative case, placeholder numbers. A Doubles-to-Go run typically makes 4 model calls of about 1,500 tokens in and 300 out, and the worst allowed run makes 12. At the team’s measured price of TT$0.000012 a token, a typical run costs about TT$0.11 and the worst about TT$0.32. They set a hard cost limit of TT$0.60 and a step limit of 12. A loop test with a deliberately confusing complaint hits the step limit, stops and hands over with a note. A refund timeout is retried once with the same idempotency key and pays only once.',
  lab: {
    title: 'Design failures, retries and cost budgets',
    intro: 'Make your design survive ordinary failures and cost what you expect.',
    tasks: [
      'Write a failure table with at least six failure modes, each with detection, containment and recovery.',
      'For every changing tool, define the idempotency key, the retry limit and the waiting between tries.',
      'Define the checkpoints and describe the restart test you will run between two steps.',
      'Calculate the typical and worst-case cost and time per run with your own numbers, set the hard limits and say what happens when each is reached.'
    ],
    evidence: 'The failure table, retry rules, checkpoints and the cost calculation with limits.',
    model: '| Failure | Detection | Containment | Recovery |\n|---|---|---|---|\n| Loop | Step count over 12 | Stop run | Handover with note |\n| Wrong refund amount | Tool cap check | Tool refuses | Vendor decides |\n| Tool timeout | No reply in 5 s | One retry, same key | Handover if second fails |\n| Rate limit | Provider error 429 | Wait 2 s, up to 3 tries | Queue the case |\n| Stale policy | Policy date older than 30 days | Warn vendor | Owner refreshes policy |\n| Cost runaway | Cost over TT$0.60 | Hard stop | Handover and alert |\n\n**Retries.** issue_refund uses key order_id+amount; max 1 retry; wait 2 s. **Checkpoints.** After get_order, after draft, after approval; restart test between draft and approval.\n\n**Cost.** Typical 4 calls, about 7,200 tokens, TT$0.09. Worst 12 calls, TT$0.32. Hard limits: TT$0.60, 12 steps, 90 seconds.'
  },
  rubric: [
    ['Failure table', 'Fewer than three', 'Failures without detection', 'Six failures with detection, containment and recovery'],
    ['Retries', 'Unbounded', 'Limits without idempotency', 'Idempotency key, retry limit and waiting for each changing tool'],
    ['Checkpoints', 'None', 'Named but untested', 'Checkpoints and a restart test described'],
    ['Cost numbers', 'No numbers', 'A limit with no calculation', 'Typical and worst-case cost computed with hard limits and actions']
  ],
  quiz: [
    ['What does an idempotency key prevent?', ['Slow responses', 'A repeated request having a second effect, such as paying twice', 'Model errors', 'Long prompts'], 1, 'The key lets a tool recognise and ignore a repeat.'],
    ['What should the system do when a run reaches its hard cost limit?', ['Continue quietly', 'Stop and hand over', 'Switch off logging', 'Double the limit'], 1, 'A limit you do not enforce is not a limit.'],
    ['Why test a restart between two steps?', ['To warm up the model', 'To check a resumed run does not repeat finished work', 'To reset the budget', 'It is not needed'], 1, 'The harness study found resumption repeating completed work in one runtime.']
  ],
  sources: [
    'iSAQB AGENTA curriculum 2026.1-rev5, learning goal 2-7 (read 2026-11-27)',
    'arXiv 2611.09088, harness study, approval and resumption findings (read 2026-11-27)',
    'VentureBeat, MCP just got its biggest update ever (28 July 2026; press report, confirm against the specification)'
  ]
},
{
  n: 14, title: 'Evaluation plans and tracing',
  lead: 'You cannot trust what you cannot measure. This lesson helps you build an evaluation set from real cases, choose graders honestly, set a pass mark before you look at results and trace every run.',
  slides: [
    ['An evaluation set', 'Build a set of cases from reality.',
      'An evaluation set is a collection of real or realistic cases with known good outcomes, kept separate from the examples you tuned on.',
      'Include ordinary cases, hard cases, cases that should be refused and cases that try to trick the agent. Draw them from real history when you can. Add a case each time something goes wrong in practice so the set grows with your experience.',
      'Collect at least twenty cases across the four kinds and record the expected outcome for each.',
      'Why keep tuning examples separate from evaluation cases?'],
    ['Choose graders honestly', 'Pick code, model or human graders with their limits in mind.',
      'Code graders are precise but narrow, human graders are rich but slow, and model graders are fast but can share the blind spots of the system they judge.',
      'The 2027.1 release candidate of the iSAQB Foundation curriculum asks learners to explain the risks of delegating review and verification to an LLM (learning goal 05-02, a preview). In A-SAW (arXiv 2610.13647) one model judged documents from the same model family that wrote them, and the paper lists that as a limitation. Spot-check model graders against a human.',
      'Use code graders where an answer is checkable and a human sample to calibrate any model grader.',
      'Why might a model grading its own family’s output be generous?'],
    ['Pass marks and repeats', 'Set a numeric pass mark before you see results.',
      'Decide in advance what counts as good enough, and run each case several times, because agents vary.',
      'Write the pass mark first, for example success on at least 85 percent of cases with zero safety violations. Because outputs vary, also measure how often a case succeeds on every one of several runs. The tau-bench benchmark reports such a repeated-success measure (pass^k; not re-read in this edition). Safety rules are usually pass or fail with no tolerance.',
      'Write the pass marks for success, safety, cost and time, and the number of runs per case.',
      'Why decide the pass mark before running the evaluation?'],
    ['Trace every run', 'Record enough to explain any run afterwards.',
      'A trace records each step: input, decision, tool call, result, cost and time, tied together by an id.',
      'AGENTA learning goal 6-2 asks learners to ensure traceability of AI outputs and their context through structured logging, referencing and versioning. OpenTelemetry has emerging conventions for generative AI spans (not re-read in this edition). Redact personal data in traces and set a retention period.',
      'List the trace fields, the id that links them and what you redact.',
      'What would you need in a trace to explain why an agent refunded an order?']
  ],
  guide: [
    'Build the evaluation set from what really happens: twenty or more cases, tagged ordinary, hard, should-refuse and adversarial, each with the expected outcome. Write the pass marks before you run anything: a success rate, a zero-tolerance safety rule, a cost limit and a time limit. Decide how many times to run each case.',
    'Pick graders to suit each check. Use code where the answer can be checked exactly, a human sample where judgment is needed and a model grader only after you have compared it with a human on a sample. Then add tracing, so that for any run you can answer what it saw, what it decided, what it called and what it cost.'
  ],
  case: 'Illustrative case. The Doubles-to-Go team assembles 24 cases from real complaints: twelve ordinary, six hard (late orders, partial deliveries), three should-refuse and three adversarial (a message that says to ignore the policy). Pass marks: correct action on 85 percent, zero refunds above the cap, cost under TT$0.60 a run, time under 90 seconds, three runs per case. The first run gets 79 percent and one adversarial case slips past the model but is stopped by the tool cap. They fix the late-order knowledge, re-run, reach 88 percent and keep the failed adversarial case in the set. A trace id links every step.',
  lab: {
    title: 'Write the evaluation and tracing plan',
    intro: 'Plan how you will measure whether your design is good enough, and how you will explain any single run.',
    tasks: [
      'Describe at least twenty cases across ordinary, hard, should-refuse and adversarial kinds, and where each comes from.',
      'Write numeric pass marks for success, safety, cost and time, and the number of runs per case, before any results.',
      'Choose a grader for each check, say how you will calibrate any model grader against a human, and name the limits.',
      'List the trace fields, the id that links them, what you redact and how long you keep traces.'
    ],
    evidence: 'The case plan, the pass marks with numbers, the grader choices and the trace specification.',
    model: '**Cases (24).** 12 ordinary, 6 hard, 3 should-refuse, 3 adversarial, from last quarter’s real complaints, anonymised.\n\n**Pass marks.** Correct action in at least 85 percent of cases across 3 runs each; zero refunds above TT$100; cost under TT$0.60 a run; time under 90 s.\n\n**Graders.** Code for amount and policy checks; vendor owner scores 8 cases by hand; model grader for reply tone, calibrated on those 8 and trusted only if it agrees on at least 7. Limit: the grader is from the same provider as the agent.\n\n**Trace fields.** run_id, step, input summary, tool, arguments, result, tokens, cost, time, approver. **Redaction.** Names and phone numbers. **Retention.** 90 days.'
  },
  rubric: [
    ['Evaluation set', 'Fewer than ten', 'Cases without kinds', 'Twenty or more across four kinds with sources'],
    ['Pass marks', 'No numbers', 'Numbers without cost or safety', 'Success, safety, cost, time and runs per case, set in advance'],
    ['Graders', 'Model only', 'Graders chosen without limits', 'Grader per check, calibration against a human and limits stated'],
    ['Tracing', 'None', 'Fields without id or redaction', 'Fields, linking id, redaction and retention']
  ],
  quiz: [
    ['Why set the pass mark before running the evaluation?', ['It is quicker', 'Otherwise the mark drifts to match the result', 'Models prefer it', 'It is a legal rule'], 1, 'Fixing it first keeps the test honest.'],
    ['What is a risk of using a model to grade the same model family’s output?', ['It is too slow', 'It may share blind spots and be generous, so it should be checked against a human sample', 'It cannot read text', 'It costs nothing'], 1, 'A-SAW lists a single model judge from the generator’s family as a limitation.'],
    ['What does a good trace allow?', ['Replacing tests', 'Explaining afterwards what a run saw, decided, called and cost', 'Removing approvals', 'Hiding errors'], 1, 'AGENTA learning goal 6-2 asks for traceability of outputs and their context.']
  ],
  sources: [
    'iSAQB AGENTA curriculum 2026.1-rev5, learning goal 6-2 (read 2026-11-27)',
    'iSAQB CPSA-F curriculum 2027.1-RC1, learning goal 05-02, release candidate (read 2026-11-27)',
    'arXiv 2610.13647, A-SAW, limitations (read 2026-11-27); Yao et al., tau-bench, arXiv 2406.12045 (not re-read in this edition)'
  ]
},
{
  n: 15, title: 'Governance, law and safe integrations',
  lead: 'Agents touch data, law and other people’s systems. This lesson gives you a governance one-pager: where data goes, what is allowed, what is logged and how you leave a vendor. It is orientation, not legal advice.',
  slides: [
    ['Know the legal conditions', 'Identify the legal questions an agent system raises.',
      'Typical questions are who owns and may reuse generated code, which data you may send to a provider, who is controller and who is processor of personal data, and which AI regulation applies.',
      'AGENTA learning goal 6-1 covers copyright and copyleft, data protection roles, EU AI Act basics and stakeholder involvement. The EU AI Act is Regulation (EU) 2024/1689 and applies in stages; the timetable and obligations for your case depend on your role and use, so take advice. For Trinidad and Tobago, check the current status of the Data Protection Act, 2011 with a qualified adviser (not re-read in this edition).',
      'Write the five legal questions your system raises and who will answer them.',
      'Which personal data would your agent send to a model provider, and is that allowed?'],
    ['Govern at scale', 'Control vendors, data location and tools consistently.',
      'Decide once, centrally: which models and providers are allowed, where data may go, which tools an agent may use and how you can leave.',
      'AGENTA learning goal 6-3 lists billing models, vendor lock-in, data sovereignty, guardrails and tool allowlists. Keep an allowlist of approved tools and models, keep an exit plan for each provider and record the data classes each provider may see.',
      'Create a one-page table of providers, data classes allowed and the exit route.',
      'What would you do if your model provider changed its terms tomorrow?'],
    ['Safe integrations', 'Protect integrations against injection and misuse.',
      'Treat every external input as untrusted, give every tool the least privilege it needs and run risky actions in a sandbox.',
      'AGENTA learning goal 6-6 names prompt injection, tool misuse and insecure execution, with the OWASP LLM Top 10 and MITRE ATLAS as references. The Cybersecurity for the Agentic Era course covers attacks and defences in depth; here you record the architecture decisions: allowlists, sandboxing, secrets handling and egress limits.',
      'List each integration with its permission, its secret handling and its network limit.',
      'Why should an agent that reads email not have the right to send money?'],
    ['Traceable and sustainable', 'Log for accountability and weigh the footprint.',
      'Keep records that let you explain AI-assisted work later, and know the energy and cost you are choosing.',
      'AGENTA learning goals 6-2 and 6-4 cover traceability and the environmental cost of AI-assisted development. Record which model and version produced what, keep prompts and outputs where the law allows, and choose smaller models or fewer calls when they are good enough. Handle sensitive data under learning goal 6-5: classify it, minimise it and do not send what you do not need to.',
      'Write a logging rule (what, how long, who can read) and a rule for choosing a model size.',
      'What is the cheapest way to cut both cost and footprint without losing quality?']
  ],
  guide: [
    'Make a one-page governance record with five parts. First, the data table: each kind of data, whether it may leave your system, and where it goes. Second, the provider table: which providers are allowed, what they may see, and how you leave. Third, the tool allowlist with permissions and secrets handling. Fourth, the logging rule. Fifth, the legal questions you have put to a qualified adviser, with the date.',
    'Do not try to be your own lawyer. Your job as an architect is to put the right questions in front of the right person and to build the system so the answers can be followed: data classified, providers listed, logs kept, tools limited. A system that records what it did and for whom is much easier to defend than one that cannot.'
  ],
  case: 'Illustrative case. Doubles-to-Go classes its data as public (menu), business (orders) and personal (customer names and phone numbers). The assistant may send orders to the model provider with names and phone numbers removed, and never sends card data. The provider table names one approved provider and a second as a documented fallback with a tested export of prompts and policies. The tool allowlist has five tools. Logs keep model name and version, run id and tool calls for 90 days. Four legal questions, including whether a data processing agreement is needed, go to the company’s lawyer, dated, with the answers recorded.',
  lab: {
    title: 'Write the governance and safe-integration record',
    intro: 'Produce a one-page governance record for your agent system. Mark every legal point as a question for a qualified person, not an answer.',
    tasks: [
      'Make a data table: each data class, whether it may be sent to a model provider, and any redaction.',
      'Make a provider table with what each may see and an exit route you could actually follow.',
      'List each integration with its permission, how its secret is handled and its network or sandbox limit.',
      'Write the logging rule, the model-size rule and at least four legal questions with who will answer them and by when.'
    ],
    evidence: 'The data table, provider table, integration list, logging rule and the dated legal questions.',
    model: '| Data class | To provider? | Redaction |\n|---|---|---|\n| Menu | Yes | None |\n| Orders | Yes | Remove names and phone |\n| Card data | Never | Not in the system |\n\n**Providers.** A (primary): orders only; exit: export prompts and policy, tested quarterly. B (fallback): same limits.\n\n**Integrations.** get_order: read only, token with order scope, internal network. issue_refund: cap 100, secret in vault, no internet egress.\n\n**Logging.** model and version, run id, tool calls, approver; 90 days; tech lead and owner may read. **Model size.** Smallest model that passes the evaluation.\n\n**Legal questions (for the company lawyer, by 2027-01-15).** Is a data processing agreement needed? What notice do customers need? Who owns generated replies? Which local data protection rules apply?'
  },
  rubric: [
    ['Data', 'None', 'Classes without rules', 'Data classes with rules and redaction'],
    ['Providers', 'One provider, no exit', 'Providers listed, no exit', 'Allowed data per provider and a followable exit route'],
    ['Integrations', 'No limits', 'Permissions without secrets or network', 'Permission, secret handling and network limit for each'],
    ['Legal and logging', 'Assumed answers', 'Questions without owners', 'Dated questions to a named adviser and a logging rule']
  ],
  quiz: [
    ['What is your role regarding legal questions about your agent system?', ['Decide them alone', 'Put the right questions to a qualified person and build the system so answers can be followed', 'Ignore them', 'Ask the model'], 1, 'This course is orientation, not legal advice.'],
    ['Why keep an exit plan for each model provider?', ['To save money on day one', 'To reduce lock-in and survive changes in terms or availability', 'It is required by every contract', 'To avoid logging'], 1, 'AGENTA learning goal 6-3 lists vendor lock-in and data sovereignty.'],
    ['Which is least privilege?', ['An agent that reads mail may also send money', 'Each integration has only the permission its task needs', 'All tools share one admin token', 'Secrets in the prompt'], 1, 'Narrow permissions limit the damage of injection and mistakes.']
  ],
  sources: [
    'iSAQB AGENTA curriculum 2026.1-rev5, learning goals 6-1 to 6-6 (read 2026-11-27)',
    'Regulation (EU) 2024/1689 (Artificial Intelligence Act), eur-lex.europa.eu (not re-read in this edition; check the current timetable with an adviser)',
    'OWASP Top 10 for LLM Applications, owasp.org; MITRE ATLAS, atlas.mitre.org (not re-read in this edition)'
  ]
},
{
  n: 16, title: 'Keeping judgment: ownership, skill and the architect’s changing role',
  lead: 'The risk of agents is not only a wrong output; it is that people slowly stop understanding their own system. You will plan ownership, practice and adoption, then finish the architecture note an agent could read.',
  slides: [
    ['Own what you ship', 'Keep clear human ownership of code and decisions.',
      'Every artefact needs a named human owner who can explain it, whoever or whatever drafted it.',
      'AGENTA learning goal 7-1 asks learners to maintain code ownership and preserve analytical skills against atrophy. The iSAQB Foundation 2027.1 release candidate, learning goal 05-02, states that humans remain responsible for decisions and artefacts even when partly AI-generated (a preview, not final).',
      'Assign an owner for every important artefact and rule.',
      'Who is the owner of a decision record drafted by an agent?'],
    ['Cognitive debt', 'Guard against losing understanding.',
      'Accepting AI output without engaging builds cognitive debt: the system works but nobody can explain it.',
      'The 2026 focus group named cognitive debt and unresolved tension between efficiency and skill preservation (arXiv 2609.30334; one 90-minute session, opinion rather than measurement). Practical defences are to explain AI-written code in review, to do some work unaided and to keep a glossary of shared domain terms that humans and agents both use (AGENTA learning goals 7-1 and 7-2).',
      'Set a rule for when people must explain, and an amount of unaided practice.',
      'What is one concrete habit that keeps your analytical skills sharp?'],
    ['Bias and hypothesis-driven adoption', 'Adopt AI with a hypothesis and a measure.',
      'Adopt AI use as an experiment with an owner and a metric, and watch for biases such as trusting fluent answers.',
      'AGENTA learning goals 7-2 and 7-3 cover bias awareness, shared terminology, and hypothesis-based adoption with ownership, a learning culture and success metrics. Automation bias, the tendency to over-trust a system’s output, is a known effect in human-automation research (not re-read in this edition). Measure what matters to you, such as defects found in review, time to a correct decision and rework.',
      'Write an adoption hypothesis with two metrics and a review date.',
      'Which metric would tell you AI use is making your team worse?'],
    ['The changing role', 'Describe how the architect’s role is shifting.',
      'The architect’s work moves toward specifying, guarding and verifying, while accountability stays human.',
      'AGENTA learning goal 7-4 looks at roles, Human plus Human plus AI collaboration, team topologies and scope across levels. The focus group called the new work harness engineering: building the validation, knowledge and standards layer that governs AI-assisted development, and said quality assurance of that harness itself is unresolved. Education should keep fundamentals and architectural reasoning, with more on specification and validation.',
      'Write what you will do more of, less of and never delegate.',
      'What parts of architecture work will you never delegate, and why?']
  ],
  guide: [
    'Finish with people, not tools. Name an owner for each artefact in your design: the tool contracts, the rules, the checks, the evaluation set, the governance record. Write the rule for when a person must be able to explain what an agent produced, and a small amount of work done unaided so skills do not fade. Share a glossary of your domain terms and use the same words in code, documents and prompts.',
    'Then write the adoption hypothesis, with two numeric metrics and a review date, and compose the final architecture note: one page an agent or a new engineer can read first. It links to everything you built and states what the agent may do, what it may not, how it is checked and who to ask. Sign it with a name and a date.'
  ],
  case: 'Illustrative case. The Doubles-to-Go team names the tech lead as owner of the rules and checks, the vendor owner as owner of the refund policy and the support lead as owner of the evaluation set. Their rule: any agent-written change to a rule file must be explained aloud in review by the author. Once a month an engineer fixes a small bug without an agent. Their adoption hypothesis: after 90 days the assistant cuts median time to reply from 14 to under 6 minutes with no rise in wrongly refunded orders; review on 2027-03-01. The final note is one page and begins: “Purpose, what the assistant may do, what it may never do, how it is checked.”',
  lab: {
    title: 'Assign ownership and adoption, then write the architecture note an agent could read',
    intro: 'Complete your design with owners, practice and an adoption plan, then write the one-page note that ties it all together.',
    tasks: [
      'Make an ownership table: each important artefact with its named owner and reviewer.',
      'Write your anti-atrophy rules: when a person must explain AI output, how much unaided practice, and your glossary of at least five domain terms.',
      'Write an adoption hypothesis with two numeric metrics, a baseline, a target and a review date.',
      'Write the architecture note an agent could read in under 40 lines: purpose, what the system may do, what it may never do, where the rules and checks live, the limits, and who to ask. Add the name of the person who signs it and the date.'
    ],
    evidence: 'The ownership table, the practice rules and glossary, the adoption hypothesis and the one-page note.',
    model: '| Artefact | Owner | Reviewer |\n|---|---|---|\n| Tool contracts | Tech lead | Vendor owner |\n| Rules and checks | Tech lead | Another engineer |\n| Refund policy | Vendor owner | Finance lead |\n| Evaluation set | Support lead | Tech lead |\n| Governance record | CTO | Lawyer |\n\n**Practice.** Authors explain agent-written rule changes in review. One unaided small fix a month. **Glossary.** order, vendor, refund, draft, approval.\n\n**Adoption.** Median time to reply from 14 minutes to under 6 within 90 days; wrongly refunded orders no higher than 1 in 200. Review 2027-03-01.\n\n**Note (ARCHITECTURE-NOTE.md).** Purpose. May do: read orders, draft replies, propose refunds. May never: issue refunds above TT$100 or without approval. Rules: rules.md. Checks: tests/. Limits: 12 steps, TT$0.60. Ask: tech lead. Signed: tech lead, 2026-12-01.'
  },
  rubric: [
    ['Ownership', 'None', 'Owners for some', 'A named owner and reviewer for every important artefact'],
    ['Skills', 'Not considered', 'A general intention', 'Explain-in-review rule, unaided practice and a glossary'],
    ['Adoption', 'No metrics', 'Metrics without targets', 'Two numeric metrics with baseline, target and review date'],
    ['Final note', 'None', 'Long or without limits', 'Under 40 lines with may, may not, checks, limits, contact and signature']
  ],
  quiz: [
    ['Who is responsible for an artefact partly drafted by an agent?', ['The agent', 'A named human owner', 'The model provider', 'No one'], 1, 'AGENTA 7-1 and the 2027.1 preview chapter both place responsibility with humans.'],
    ['What is cognitive debt?', ['A loan', 'A growing gap between what the system does and what the people responsible understand', 'A test type', 'Unused tokens'], 1, 'The focus group named it as a risk when AI output is accepted without engagement; it is an experience report.'],
    ['What makes AI adoption a hypothesis?', ['Hope', 'An owner, numeric metrics, a baseline, a target and a review date', 'A press release', 'A bigger budget'], 1, 'AGENTA learning goal 7-3 asks for hypothesis-based adoption with success metrics.']
  ],
  sources: [
    'iSAQB AGENTA curriculum 2026.1-rev5, section 7, learning goals 7-1 to 7-4 (read 2026-11-27)',
    'arXiv 2609.30334, What Will Remain Human in Software Architecture? (read 2026-11-27; one focus group)',
    'iSAQB CPSA-F curriculum 2027.1-RC1, learning goal 05-02, release candidate (read 2026-11-27)'
  ]
}
];
