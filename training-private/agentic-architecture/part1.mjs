// Level 4, lessons 1-4: Agents as components. Compact format as training-private/quality-decisions: slides are [title, objective, principle, evidence, response, check].
// Read on their own pages on 2026-11-27: the iSAQB AGENTA curriculum 2026.1-rev5 (LG codes below), the iSAQB CPSA-F 2027.1-RC1 chapter 5, the focus group report (arXiv 2609.30334),
// A-SAW (arXiv 2610.13647) and the harness study (arXiv 2611.09088). Sources marked "not re-read" are cited from the author's knowledge and must be rechecked before any figure is quoted.
// Cases marked "Illustrative" are invented. The running example is the Doubles-to-Go ordering app, which has a customer order-issue assistant.
export default [
{
  n: 1, title: 'Workflows, assistants and agents: choosing the shape',
  lead: 'Before you design anything, decide how much of the thinking the software does at run time. This lesson gives you three shapes, four signals for choosing between them and a short record that makes the choice reviewable.',
  slides: [
    ['Three shapes, one question', 'Tell a fixed workflow, an assistant and an agent apart.',
      'The difference is who decides the next step: your code, a person, or the model at run time.',
      'Anthropic’s guide Building effective agents (December 2024) defines workflows as systems where models and tools are orchestrated through predefined code paths, and agents as systems where the model dynamically directs its own process and tool use. The iSAQB AGENTA curriculum (2026.1-rev5, learning goal 1-4) asks learners to distinguish assistants from agents and to explain the agentic loop.',
      'For each task, write down who chooses the next step, then name the shape.',
      'A script calls a model to summarise every email and files it in a fixed folder. Is that a workflow, an assistant or an agent?'],
    ['Start with the simplest thing that works', 'Justify the simplest shape that meets the need.',
      'Every step of autonomy adds cost, delay and new ways to fail, so make each step earn its place.',
      'The same guide advises finding the simplest solution possible and adding complexity only when it clearly improves results, because agentic systems trade speed and cost for performance. AGENTA learning goal 1-2 includes knowing when to use people, classic tools or agents.',
      'Ask in order: can plain code do it, can a fixed workflow of model calls do it, and only then, can it be an agent?',
      'Name one task in your own work where plain code beats a model.'],
    ['Four signals that call for an agent', 'Score a task against signals for run-time decision making.',
      'An agent earns its place when the path cannot be written in advance, the result can be checked against something real, a wrong step is cheap to undo, and the cost per run is acceptable.',
      'These four signals are Intellica’s working checklist, not a published standard. A coding task whose result is checked by a test suite scores well on all four; an open-ended request to “make customers happier” scores badly on the second.',
      'Score the task on each signal as yes, partly or no before you pick a shape, and write the reason.',
      'Why is “the tests pass” a good signal for an agent and “the reader will like it” a poor one?'],
    ['Record the decision', 'Write the shape as a reviewable architectural decision.',
      'The shape is an architectural decision: it has reasons, rejected options and a trigger for revisiting it.',
      'AGENTA section 2 treats architectural decisions as hypotheses to test. The iSAQB Foundation curriculum release candidate 2027.1-RC1 (valid from 1 April 2027, still a preview) adds learning goal 05-01: decide, against stated criteria, whether and how to use AI for a task, and justify that as an architectural decision.',
      'Use a five-line record: task, options considered, choice, reasons, and the event that would make you revisit it.',
      'What event would make you move a workflow to an agent, or an agent back to a workflow?']
  ],
  guide: [
    'Most teams meet agents through a demo, and the demo skips the question this lesson asks: should this part of the system decide anything at run time at all? A fixed workflow is easier to test, cheaper to run and simpler to explain to an auditor. An assistant keeps a person in charge of every step. An agent chooses its own steps, which is powerful when the path is unknowable and risky when it is not. Treat the three as a ladder and climb only as far as the task forces you.',
    'The four signals are a conversation starter. Score honestly, write the reason next to each score, and keep the record. When a later incident or a cost surprise happens, the record tells you which assumption failed. That is what turns the choice from a mood into an engineering decision.'
  ],
  case: 'Illustrative case. Doubles-to-Go lets street-food vendors take orders in an app. Customers complain about missing items and late orders, and vendors want help answering. The team lists three designs. A: a fixed workflow that classifies each complaint with a model and routes it to a template reply. B: an assistant that drafts replies for the vendor to approve. C: an agent that reads the order, checks the payment, decides on a refund and writes to the customer. They score the task: the path varies (partly), the result can be checked against the order record (yes), a wrong refund is not cheap to undo (no), cost per case matters (partly). They choose B for the first release and write the trigger: move refunds under TT$50 to an agent only after sixty days of vendor-approved drafts show a correct-decision rate they have agreed in advance.',
  lab: {
    title: 'Describe the task and decide the shape',
    intro: 'Pick one real task in your own field where you are considering AI. The rest of the lab builds a design for it, so choose something you can describe in detail.',
    tasks: [
      'Describe the task in three sentences: who asks, what the input is, what a good result looks like and who checks it.',
      'List the three shapes for your task and say, in a sentence each, how it would work.',
      'Score the four signals (path unknown, result checkable, wrong step cheap to undo, cost acceptable) as yes, partly or no, with a reason for each.',
      'Write the decision record: choice, reasons, rejected options and the event that would make you revisit it.'
    ],
    evidence: 'The task description, the signal scores with reasons, and the five-line decision record.',
    model: '**Task.** Customers of the Doubles-to-Go app report a missing item or a late order. A vendor reads the report, checks the order and replies, and may refund. Good result: the right reply and the right refund within 15 minutes, checked by the vendor.\n\n**Shapes.** (A) Workflow: classify, then send a template. (B) Assistant: draft a reply and a refund suggestion for the vendor to approve. (C) Agent: investigate and refund by itself.\n\n**Signals.** Path unknown: partly (most cases follow three patterns). Result checkable: yes (order record and payment record). Wrong step cheap to undo: no (a refund cannot be recalled easily). Cost acceptable: partly (about TT$0.40 a case against vendor time).\n\n**Decision.** Choose B. Reasons: refunds are not cheap to undo and checks exist but are slow. Rejected: A (cannot handle variation), C (too risky now). **Revisit when** vendor-approved drafts reach the agreed accuracy for 60 days.'
  },
  rubric: [
    ['Task description', 'Vague, no checker named', 'Task described, no result or checker', 'Input, good result and who checks it are all stated'],
    ['Signals', 'No scores', 'Scores without reasons', 'All four scored with a reason each'],
    ['Options', 'One option only', 'Options listed but not compared', 'Three shapes compared with the signals'],
    ['Decision record', 'No record', 'Choice without a revisit trigger', 'Choice, reasons, rejected options and a revisit event']
  ],
  quiz: [
    ['What mainly separates a workflow from an agent?', ['The workflow uses a smaller model.', 'In a workflow your code fixes the path; in an agent the model chooses its steps at run time.', 'Agents never use tools.', 'Workflows cannot call a model.'], 1, 'The difference is who decides the next step. A workflow can call a model, but the code sets the path.'],
    ['Which task most favours an agent?', ['Convert each invoice to a PDF with a fixed template.', 'Fix a failing build where a test suite can confirm each attempt and a wrong change is easy to revert.', 'Decide which customers to dismiss.', 'Send the same reminder every Monday.'], 1, 'The path is not known in advance, the result is checkable and mistakes are cheap to undo.'],
    ['Why record the shape decision with a revisit trigger?', ['It is required by every standard.', 'So a later incident or cost surprise shows which assumption failed.', 'To make the document longer.', 'Because agents cannot be changed afterwards.'], 1, 'A trigger turns the choice into a testable hypothesis, as AGENTA section 2 recommends.']
  ],
  sources: [
    'Anthropic, Building effective agents (December 2024). anthropic.com/engineering/building-effective-agents (not re-read in this edition)',
    'iSAQB CPSA-A module AGENTA, curriculum 2026.1-rev5, sections 1 and 2. public.isaqb.org/curriculum-agenta/ (read 2026-11-27)',
    'iSAQB CPSA-F curriculum 2027.1-RC1, chapter 5, learning goal 05-01. Release candidate, read 2026-11-27'
  ]
},
{
  n: 2, title: 'The agentic loop and tools as contracts',
  lead: 'An agent acts through tools, and every tool is an interface your architecture must govern. This lesson shows the loop, then teaches you to write each tool as a contract with a permission and a limit.',
  slides: [
    ['The loop', 'Explain the agentic loop and where it can be controlled.',
      'An agent repeats three steps: decide, act through a tool, observe the result, until it stops or something stops it.',
      'The ReAct paper (Yao and colleagues, 2022) described interleaving reasoning with actions. AGENTA learning goal 1-4 asks learners to explain the loop, memory, planning, sub-agents, hand-offs and human-in-the-loop. Each pass through the loop is a place to measure, limit or interrupt.',
      'Mark where in the loop your design can stop the agent: before acting, after acting, and after a number of passes.',
      'Where in the loop would you place a limit on the number of steps?'],
    ['A tool is an interface', 'Treat every tool as an interface with a contract.',
      'A tool is just an interface that a model, not a programmer, will call, so it needs a clearer contract than most APIs.',
      'The Model Context Protocol, now stewarded by the Agentic AI Foundation under the Linux Foundation, gives tools a name, a description and an input schema that the model reads. Because the model chooses when to call a tool from that text, vague descriptions cause wrong calls. Confirm details against the current specification (not re-read in this edition).',
      'Write for each tool: purpose, inputs with types and limits, outputs, side effects, errors and who may call it.',
      'Why is “updates a customer” a weak tool description?'],
    ['Separate reading from changing', 'Classify tools by what they can change.',
      'Reading tools and changing tools need different controls; mixing them in one tool hides risk.',
      'A useful split is three classes: read only, reversible change, irreversible or external effect (money, messages, deletions). The class decides the permission, the limit and whether a person must approve. Security depth for tool misuse is taught in the Cybersecurity for the Agentic Era course; here you design the structure.',
      'Give every tool a class and a default permission of none; grant only what the task needs.',
      'Which class does “send a refund to the customer’s card” belong to, and what does that imply?'],
    ['Limits belong in the tool', 'Enforce limits in code, not in the prompt.',
      'A limit written only in the prompt is a request; a limit in the tool is a rule.',
      'A model can be persuaded or can misread an instruction, so amounts, rates and allowed targets should be checked by the tool itself. The 2026 harness study of five agent runtimes found that approval and policy controls could silently stop applying after routine operations such as reloading or saving a rule, which is why a limit should live where it cannot be skipped and be tested.',
      'For each changing tool, write the limit (amount, count, target list) and say where the code enforces it.',
      'Where would you enforce a refund cap of TT$100: in the prompt, in the tool, or both?']
  ],
  guide: [
    'Start by listing every action your agent could take, then turn each into a contract. The contract is short: a name, one sentence of purpose, typed inputs with ranges, what it returns, what it changes in the world, what errors it can give and which role may call it. This is ordinary interface design, with one twist: the reader of the description is a model that may misread it, so write the description as if for a careful but literal new colleague.',
    'Then classify. Tools that only read are cheap to grant. Tools that change something reversible need logging. Tools with an irreversible or external effect need a limit in code and, usually, a person’s approval. Start every permission at none and add only what the task proves it needs.'
  ],
  case: 'Illustrative case. The Doubles-to-Go order-issue assistant has five tools. get_order and get_payment are read only. draft_reply writes text to a queue and is reversible. issue_refund moves money. notify_customer sends a message outside the system. The team writes each as a contract. issue_refund accepts an order id and an amount in TT$ between 1 and 100, refuses an order that has already been refunded and returns the refund id. They enforce the cap and the duplicate check inside the tool, not in the prompt, and they give the assistant no permission on issue_refund at all in release one: it can only propose.',
  lab: {
    title: 'Define the tools and their contracts',
    intro: 'Use the task and shape you chose in lesson 1. List every action the system could take and write each as a contract.',
    tasks: [
      'List every tool your system needs, at least four, with a one-sentence purpose each.',
      'Write a contract for each tool: inputs with types and limits, outputs, side effects, errors and callers.',
      'Classify each tool as read only, reversible change or irreversible or external effect.',
      'For every changing tool, write the limit and the place in code where it is enforced.'
    ],
    evidence: 'A table of tools with contract, class and enforced limit.',
    model: '| Tool | Class | Contract | Limit and where enforced |\n|---|---|---|---|\n| get_order(order_id) | Read only | Returns items, status, times. Error: not found. Callers: assistant. | None. |\n| get_payment(order_id) | Read only | Returns amount, method, status. | Card number is never returned. |\n| draft_reply(order_id, text) | Reversible | Saves a draft for the vendor. | 1,000 characters, checked in the tool. |\n| issue_refund(order_id, amount_ttd) | Irreversible | Amount 1 to 100. Refuses a repeat refund. Returns refund id. | Cap and duplicate check in the tool; no permission in release one. |\n| notify_customer(order_id, text) | External | Sends one message. | Five messages a day per customer, in the tool. |'
  },
  rubric: [
    ['Contracts', 'Names only', 'Purpose and inputs, no side effects or errors', 'Inputs, outputs, side effects, errors and callers for every tool'],
    ['Classification', 'None', 'Some tools classified', 'Every tool classified, with reasons for the irreversible ones'],
    ['Limits', 'Limits only in a prompt', 'Limits stated, not located', 'Each changing tool has a limit and the place it is enforced'],
    ['Least permission', 'Every tool open', 'Some restriction', 'Default none, with the grant justified per tool']
  ],
  quiz: [
    ['Why should a limit such as a maximum refund be enforced in the tool?', ['Prompts are too long.', 'A prompt is a request the model may misread; code enforces the limit regardless.', 'Tools run faster.', 'Models cannot read numbers.'], 1, 'Controls that depend on the model’s compliance are weaker than controls the tool applies itself.'],
    ['Which classification fits a tool that deletes a customer record?', ['Read only', 'Reversible change', 'Irreversible or external effect', 'It needs no class'], 2, 'Deletion cannot easily be undone, so it needs the strongest controls.'],
    ['What is the safest starting permission for a new tool?', ['Allowed for all callers', 'None, then grant only what the task needs', 'Allowed in test only', 'Allowed if the model asks politely'], 1, 'Least privilege: start at none and add deliberately.']
  ],
  sources: [
    'Yao et al., ReAct: Synergizing Reasoning and Acting in Language Models (2022), arXiv 2210.03629 (not re-read in this edition)',
    'Model Context Protocol specification. modelcontextprotocol.io (not re-read in this edition; check the July 2026 changes)',
    'arXiv 2611.09088, When Routine Operations Break Architectural Pattern Relationships in LLM Agent Harnesses (read 2026-11-27)'
  ]
},
{
  n: 3, title: 'Levels of autonomy and the human in the loop',
  lead: 'Autonomy is a dial, not a switch. You will learn to set it per action, place approval where it matters and design a handover a tired person can use.',
  slides: [
    ['Autonomy is a dial', 'Describe levels of autonomy for a system component.',
      'Between “suggest only” and “acts alone” there are useful middle levels, and different actions in one system can sit at different levels.',
      'AGENTA learning goal 1-5 asks learners to place practical approaches on an autonomy spectrum. A working scale: 0 suggests, 1 acts after approval for each action, 2 acts within limits and reports, 3 acts alone and is audited afterwards. This scale is Intellica’s teaching aid, not a standard.',
      'Assign a level to each tool, not to the whole agent.',
      'Why might “read order” sit at level 3 while “issue refund” stays at level 1?'],
    ['Criticality sets the level', 'Choose oversight by uncertainty and cost of change.',
      'The more uncertain an action’s outcome and the more costly it is to reverse, the more human oversight it needs.',
      'A 2026 focus group of 22 architecture practitioners and researchers (van Heesch, Zimmermann and Kohls, arXiv 2609.30334) reached strong consensus that decisions, accountability and guardrail authoring stay human, and named criticality, meaning uncertainty combined with cost of change, as the shared criterion for oversight. It was one 90-minute session from one conference community, so treat it as expert opinion.',
      'Rate each action low, medium or high criticality and set the autonomy level from it.',
      'What two things make an action high criticality?'],
    ['Design the approval', 'Make approval informed, specific and hard to fake.',
      'An approval that shows the person what will actually happen, and binds to that exact action, protects; a generic “OK?” does not.',
      'Good approvals show the final arguments (who gets how much), expire, and cannot be reused for a different action. People also approve too much when asked too often, so ask only where it matters and batch low-risk items. The Cybersecurity course covers approval time-of-check problems in depth.',
      'Write the approval screen: what is shown, who may approve, when it expires.',
      'Why is “Approve this action?” a poor approval prompt?'],
    ['Design the handover', 'Design how the agent hands work to a person.',
      'When the agent stops, a person must be able to continue without starting over.',
      'A handover should carry the goal, what was tried, what was found, what is uncertain and what the agent recommends. The same research found practitioners rejected agent output nobody had reviewed, so the handover also tells the reviewer exactly what to check (A-SAW, arXiv 2610.13647: 11 of 13 practitioners; one organisation, small sample).',
      'Define the stop conditions and the handover note’s fields.',
      'List three situations in which your agent must stop and hand over.']
  ],
  guide: [
    'Do not give the agent one autonomy level. Walk through its tools and set a level for each, using criticality as the guide: how uncertain is the outcome, and how costly is it to undo? Reading an order is low on both. Refunding money is high on cost of change. The result is usually a small table, and that table is one of the most useful pages in your design.',
    'Then design the two human moments: the approval and the handover. An approval shows the final arguments and expires. A handover gives the next person the goal, the steps tried, the findings and the open doubts. If a person cannot continue in two minutes from the handover note, redesign it.'
  ],
  case: 'Illustrative case. For the Doubles-to-Go assistant the team rates get_order low criticality (level 3), draft_reply low (level 2, the vendor sees every draft), issue_refund high (level 1: a vendor must approve each refund) and notify_customer medium (level 1 in release one). The approval screen shows order id, customer first name, refund amount in TT$ and the reason, expires after ten minutes and applies only to that order and amount. The handover note has five fields: the complaint, what the order record shows, what the payment record shows, the suggested action and what the agent could not check.',
  lab: {
    title: 'Set permissions, budgets and approval points',
    intro: 'Take the tool table from lesson 2 and decide how much autonomy each tool gets, who approves and what the agent may spend.',
    tasks: [
      'Rate each tool low, medium or high criticality with a one-line reason, and give it an autonomy level from 0 to 3.',
      'Design the approval for every tool at level 1: what the approver sees, who may approve and when it expires.',
      'Set a budget for one run: maximum steps, maximum tool calls, maximum cost and maximum time, and say what happens at the limit.',
      'Define the handover note and list at least three stop conditions.'
    ],
    evidence: 'The autonomy table, one approval design, the run budget and the handover note.',
    model: '| Tool | Criticality | Level | Reason |\n|---|---|---|---|\n| get_order | Low | 3 | Read only, no effect |\n| draft_reply | Low | 2 | Vendor reads every draft |\n| issue_refund | High | 1 | Money, hard to undo |\n| notify_customer | Medium | 1 | External, cannot be recalled |\n\n**Approval for issue_refund.** Shows order id, first name, TT$ amount, reason. Only the vendor owner approves. Expires in 10 minutes. Valid for that order and amount only.\n\n**Run budget.** 12 steps, 20 tool calls, TT$0.60 of model cost, 90 seconds. At any limit the run stops and hands over.\n\n**Handover note.** Complaint; order facts; payment facts; suggested action; what could not be checked. **Stop when:** the amount is over TT$100, the order is more than 7 days old, or the customer mentions legal action.'
  },
  rubric: [
    ['Criticality and levels', 'No levels', 'One level for the whole agent', 'A level per tool with a criticality reason'],
    ['Approval', 'No approval design', 'Approval without arguments or expiry', 'Shows final arguments, names the approver and expires'],
    ['Budget', 'No budget', 'Some limits, no action at the limit', 'Steps, calls, cost and time limits and a defined stop'],
    ['Handover', 'None', 'A note without stop conditions', 'Note fields and at least three stop conditions']
  ],
  quiz: [
    ['What sets how much human oversight an action needs, according to the focus group report?', ['The length of the prompt', 'Criticality: uncertainty combined with the cost of changing the outcome', 'The brand of the model', 'The number of users'], 1, 'Participants used criticality as the shared criterion. It is expert opinion from one session, not measured evidence.'],
    ['Which approval design is strongest?', ['“Approve this action?” with a yes button', 'A screen showing the exact amount and target, an expiry and binding to that one action', 'An approval that lasts all day', 'Automatic approval after a timeout'], 1, 'Specific, bound, expiring approvals resist misuse and mistakes.'],
    ['What should a handover note let the next person do?', ['Admire the agent', 'Continue without starting over', 'Replace the agent', 'Delete the logs'], 1, 'It carries goal, steps tried, findings, doubts and a recommendation.']
  ],
  sources: [
    'van Heesch, Zimmermann, Kohls, What Will Remain Human in Software Architecture? A Focus Group Report, arXiv 2609.30334 (read 2026-11-27; experience report, one session)',
    'arXiv 2610.13647, A-SAW: The Agentic Software Architecture Workflow (read 2026-11-27; one organisation)',
    'iSAQB AGENTA curriculum 2026.1-rev5, learning goals 1-5 and 2-6 (read 2026-11-27)'
  ]
},
{
  n: 4, title: 'Context and memory as architecture',
  lead: 'What an agent knows when it acts decides what it does. You will treat context and memory as designed components with owners, limits and a way to correct them.',
  slides: [
    ['Context is the input', 'Explain how context shapes an agent’s output.',
      'A model can only use what is in its context at that moment, so deciding what goes in is an architectural decision.',
      'AGENTA learning goal 1-3 covers how prompt and context engineering affect output quality, and goal 3-1 states that the information available to an agent determines output quality and improves the odds without guaranteeing a result. Context has a size limit and a cost, and more is not always better.',
      'List what each step needs to know and include only that.',
      'Why can adding more documents to the context make answers worse?'],
    ['Kinds of memory', 'Separate working, session and long-term memory.',
      'Working memory lives in the current context, session memory lasts for one task or conversation, and long-term memory persists across tasks.',
      'Each kind has a different owner, lifetime and risk. Long-term memory can carry mistakes and untrusted text forward to later runs, which makes it a security and quality concern as well as a feature. The Cybersecurity course teaches poisoned memory as an attack.',
      'For each piece of information, choose where it lives, who may write it and how long it stays.',
      'Which of the three kinds is most dangerous to fill with unchecked text, and why?'],
    ['Trust labels', 'Keep track of where information came from.',
      'Information from a customer, a web page or a file is data, not instruction, and your design should keep it labelled that way.',
      'The 2026 harness study found that reapplying a plugin discarded provenance labels held in memory, so restrictions based on untrusted sources were lost. Design provenance so it survives restarts, compaction and reloads, and test that it does.',
      'Attach a source and a trust label to each item and store them with the item, not in a transient object.',
      'What could go wrong if a trust label is kept only in memory of one process?'],
    ['Forget on purpose', 'Define how memory is corrected, expired and deleted.',
      'Memory without a way to correct or delete it will eventually be wrong, stale or illegal to keep.',
      'Decide the retention period, who can inspect and edit memory, how a wrong entry is removed and what is deleted when a customer asks for their data to be erased. Check the rules that apply to you with your legal adviser; this course does not give legal advice.',
      'Write a retention rule and a correction path for every long-term store.',
      'Who in your design can remove a wrong fact from long-term memory, and how fast?']
  ],
  guide: [
    'Make a one-page context plan. For each step the agent takes, list what it must be told, where that comes from and how big it is. Cut everything that does not change the decision. Short, labelled context is cheaper, faster and usually more accurate than a long dump.',
    'Then plan memory the way you plan a database: who writes it, who reads it, how long it lives and how it is corrected. The important extra is provenance. Store the source and trust level with every item and test that the labels survive a restart. A fact with no source is a rumour.'
  ],
  case: 'Illustrative case. The Doubles-to-Go assistant needs the order, the payment status and the vendor’s refund policy, about 900 tokens in all. The team first loads three months of the customer’s history, which doubles cost and makes replies drift. They cut to the one order and the policy. They decide that nothing from a customer message enters long-term memory; vendor-approved policy edits do, with the editor’s name and date. Customer text is always labelled untrusted and stored with that label in the database. A test restarts the service mid-run and checks the label is still there.',
  lab: {
    title: 'Design the memory and context',
    intro: 'Plan what your agent knows at each step, what it remembers and how memory is corrected.',
    tasks: [
      'For each step of your agent, list what it must know, where that comes from and how large it is.',
      'Choose working, session or long-term storage for each piece of information, with an owner and a retention period.',
      'Define trust labels for each source and where the label is stored so it survives a restart.',
      'Write the correction and deletion path for long-term memory, including who may use it and how fast.'
    ],
    evidence: 'A context plan table, a memory table with owners and retention, the trust labels and the correction path.',
    model: '| Step | Needs | Source | Size |\n|---|---|---|---|\n| Understand complaint | Customer message | Customer (untrusted) | 200 tokens |\n| Check facts | Order, payment | Database (trusted) | 400 tokens |\n| Suggest action | Refund policy | Vendor-approved doc (trusted) | 300 tokens |\n\n**Memory.** Working: current run only. Session: none. Long-term: refund policy, written by the vendor owner, kept until replaced. Customer text is never stored in long-term memory.\n\n**Trust labels.** untrusted:customer, trusted:database, trusted:vendor-policy, stored in the database column source_label.\n\n**Correction.** The vendor owner edits or deletes a policy entry in the admin page; effect within one minute. Erasure requests delete customer records within the period the owner’s legal adviser sets.'
  },
  rubric: [
    ['Context plan', 'Everything included', 'Lists inputs without sources or sizes', 'Each step lists need, source and size, with extras cut'],
    ['Memory design', 'No distinction', 'Kinds named, no owner', 'Kind, owner and retention per item'],
    ['Provenance', 'None', 'Labels named, location unclear', 'Labels stored with the data and tested across restart'],
    ['Correction', 'None', 'Says memory can be edited', 'Named role, path and speed for correction and deletion']
  ],
  quiz: [
    ['Which statement about context is correct?', ['More context always improves answers.', 'Context shapes output and improves odds of a good result but does not guarantee it.', 'Context has no cost.', 'Models remember everything permanently.'], 1, 'AGENTA learning goal 3-1 says available information determines output quality and improves probability, not certainty.'],
    ['Where should a trust label be kept?', ['Only in a variable inside the running process', 'With the data in storage so it survives restarts and reloads', 'In the prompt as a polite request', 'Nowhere'], 1, 'The harness study showed labels kept in plugin instances were lost on reapplication.'],
    ['What must a long-term memory design include?', ['Unlimited retention', 'A correction and deletion path with a named role', 'Only the model’s own summaries', 'No owner'], 1, 'Without a way to correct and delete it, memory becomes wrong, stale or unlawful.']
  ],
  sources: [
    'iSAQB AGENTA curriculum 2026.1-rev5, learning goals 1-3 and 3-1 (read 2026-11-27)',
    'arXiv 2611.09088, harness study on provenance and compaction (read 2026-11-27)',
    'Intellica, Cybersecurity for the Agentic Era course, lessons on memory poisoning (internal)'
  ]
}
];
