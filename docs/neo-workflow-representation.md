# Neo: showing an agent's workflow

26 Nov 2026 · prototype on localhost:3400 (Agents → Bank reconciliation 3 → Workflow tab)

## The problem

Neo agents do a job in several steps, and some of them wait for you. Today a user only sees this one step at a time in chat. Before they run an agent they can't see what it will do, where it will stop to ask them, or what it will write to Tally. After a run they can't see what happened without scrolling the chat.

## What the market does (Mobbin, web)

| Product | What it shows | What we took | What we left |
|---|---|---|---|
| [Zapier, zap editor](https://mobbin.com/screens/7d65f4c3-62bb-4455-9354-c28ce041a646) and [success/error paths](https://mobbin.com/screens/28ca5c8b-7579-470d-bbf2-089e2bb6c60d) | A vertical column of step cards joined by a line, a `+` between steps, a side panel to set up the open step, branches labelled Success / Error | The vertical column: it reads top to bottom and works in a 400px panel. Labelled branches. | The `+` and the setup panel: our users don't build, they read. |
| [HoneyBook, test run](https://mobbin.com/screens/6b0c0c5b-4b33-4767-a2c1-6baafed1f422) | The same steps with a green "Completed" tag and a time on each | Run result laid on the same steps | The zoom controls. |
| [Attio, workflow runs](https://mobbin.com/screens/d8d6c229-4909-490c-83a1-a84958f82b83) | An Editor / Runs switch; each run lists its own status; counts for completed and failed | One view, two modes: the definition, and the last run on top of it | Run history list (phase 2). |
| [Relevance AI, task timeline](https://mobbin.com/screens/db919f38-24cb-4151-b995-2781392d7db2) and [Browserbase, run](https://mobbin.com/screens/4c0e5829-5b9f-467e-810b-91bdeb76069a) | A log: each tool call with the time it took, then the result | Time on each step | Raw logs; accountants don't need payloads. |
| [Wix, approve blog post](https://mobbin.com/screens/35f261f5-eab7-4824-8575-661043bd2341) | Approval as a distinct moment: Dismiss / Publish | A step that waits for you looks different from one that doesn't | A modal; ours stays in the flow. |
| [Emergent, deploy progress](https://mobbin.com/screens/58d41784-2995-4688-99d7-6bc5e1276962) | A short checklist with one active row | Fits a live run (phase 2) | none |

Patterns that repeat in all of them:

1. **A column of cards joined by a line** is the default. Free-form canvases appear only in tools where people build.
2. **Definition and run are the same picture.** The run adds a status and a time; it doesn't redraw.
3. **Human steps are marked** (Wix, HoneyBook). In an accounting product this matters more than anywhere: "nothing reaches Tally until you confirm" is the promise.
4. **Branches are labelled by outcome**, not by logic (Zapier: Success / Error).

## What we built (v3, 27 Nov 2026: canvas, runs, Needs review)

Reference: the Korefi prototype's Agents and agent pages, the node types product wrote up, and Lindy-style canvases.

**Agents page.** Search, brand-coloured filter pills with counts (All, Running, Available, Drafts), and compact cards in sections. Each available card has its own **Run** button, so an agent starts without opening it. An agent that is running moves to **Running** and its card says where it is ("Reading the statement…") or what it is asking, with **View run** or **Review**. One type scale throughout: page title 16, section and card titles 14, descriptions 13, chips and meta 12.

**Agent page.** The agent's name is the title in the bar, with its state (Available, Running, Needs you). A chat or the run on the left; on the right what it does, then two tabs.

- **Preview** is an open canvas: dotted field, fixed top-to-bottom layout, nodes joined by arrows, the Decision node splitting into Exact, Potential and No match and joining again. Drag to move, zoom with the buttons, ⌘/Ctrl + scroll, + and −, 0 to fit. Clicking a node goes to its fields. While the agent runs, nodes show done, working or needs you.
- **Configuration** is one scrolling list of every node's fields, each node under its own heading.
- The left is the chat that edits the agent ("What should X do differently?"): chips or your own words change the fields, the changed node is scrolled to and ringed once, and every change can be undone.

**The flow.** Run (on a card) or Run now (on the agent page) starts a **new Neo chat named for the agent**. That chat has **Edit details** in its header, which goes to the agent's page: its chat, Preview and Configuration. While the agent is running, its page shows a banner ("Running · Reading the statement…", or "Needs you · …") and its header button becomes **View run** / **Review**, which return to the chat. A running agent's card and its row in Needs review open the same chat. So the loop is: Agents, Run, chat, Edit details, agent page, View run, chat.

**Needs review.** A page in Neo's menu, with a count on the menu item. It lists what any running agent has stopped to ask you (the agent, the question, a Review button that opens its chat). Empty, it says nothing needs review.

Files: `config/pages/neo/agent-nodes.ts`, `hooks/pages/neo/use-agent-config.ts`, `hooks/pages/neo/use-agent-run.ts`, `components/neo/page/agent/` (page, canvas, configuration, run pane, chat), `components/neo/page/agents/index.tsx` (directory), `components/neo/page/review/index.tsx`.

## How to implement it in the real product

**It is cheap because the agent already knows its steps.** The chat task already runs as named steps (`api.step`, `api.checkpoint`, `api.wait`). The Workflow view needs the same list as data, not new behaviour.

1. **Data (small).** Each agent gets a `nodes` array: id, type (one of the eight), title, and the fields it takes (select, toggle, checks, text, or a custom block like the match rules). This is `AgentNode` in the prototype; the configuration panel is drawn from it, so adding a field is data only. Keep it in the agent's own definition so the steps and the task can't drift apart.
2. **Endpoint (small).** `GET /api/neo/agents/:id/workflow` returns `{ nodes }`, and `PUT .../config` saves `{ values }` as the person edits. Preview needs nothing beyond the node list.
3. **UI (reuse).** The tab uses the existing panel, tokens, Switch and Link. No graph library, no canvas. A column of cards is plain HTML and works on a phone.
4. **Actor field decides the look.** One field drives icon, label and border; adding an agent never needs new UI.

Estimate for the real app: about 3 to 5 days for one engineer. Day 1 the data shape and endpoint; days 2 to 3 the tab and the last-run overlay; days 4 to 5 filling in steps for the other agents and tests.

## Phases

| Phase | What | Notes |
|---|---|---|
| 1 (built) | Read-only column, branches, last-run overlay | static data in the prototype |
| 2 | Live run: the active step pulses and the column follows the chat. Run history: a list of runs, each opens the same view | needs the run log's per-step events |
| 3 | Link from a chat run to its step ("see where we are"). Show it in the chat panel too | the panel already takes `inChat` |
| Later | Editing: reorder steps, turn a step on or off, add an approval step | only if users ask to build; this is where a canvas starts to pay off |

## Risks and decisions

- **Is this a builder?** No. It describes what Neo does and where you decide. A builder (Zapier-style) needs validation, versioning and error paths, and is a much bigger product decision.
- **Keeping it true.** If the steps in the view and the task differ, the view lies. Generate both from one definition.
- **Where users find it.** Today only in the agent panel. Worth deciding whether the chat should also link to it when a run starts.
- **Sample data.** The numbers on Last run are made up for the prototype (5,000 lines read, 22 reconciled); the sample statement elsewhere in the prototype has 22 lines. Fix before showing it as real.
