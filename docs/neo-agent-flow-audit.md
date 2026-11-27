# Neo agent flow: audit (27 Nov 2026)

Flow audited: Agents → Run → chat → Edit details → agent page → back to the run, plus Needs review.

## Fixed in this pass
- **Three-way reconciliation, Run.** It sent "Check September", which Neo treated as a question: a canned reply, and the chat took that title. It now sends "Run three-way reconciliation", which asks the period and goes on with the real flow. The chat is named for the agent.
- **Your own agents, Run.** The run stopped at "I stop here". It now follows the agent's workflow: says what it is starting, asks what to read, works through the processing and checking nodes, stops for your check where the workflow has one, and ends with a summary in the format you chose.
- **Banner** on the agent page removed.

## Still missing
1. **Settings don't drive the real agents.** Only the match rules reach the bank agents' runs. "Run every Monday", the checks, the AI and approval settings are stored but nothing reads them. Your own agents use what they read, OCR, review mode and summary format.
2. **No last run.** When a run ends, the card goes back to Available with nothing about what happened. The agent page has no run history and the canvas shows nothing once the run is over.
3. **Needs review shows one run.** Neo runs one chat at a time here, so the list never has more than one row. There is no record of what you reviewed.
4. **Recents all say the same.** Every run of an agent is titled with its name. Adding the period ("Bank reconciliation 3 · Sep 2026") would tell them apart.
5. **Canvas progress is inferred** from Neo's steps and cards, and only for the bank agents. It can drift if a run's steps change.
6. **Coming soon agents** open a full agent page with placeholder nodes and settings that do nothing. A short "coming soon" page would be more honest.
7. **Editing during a run** changes the agent but not the run in progress, and nothing says so.
8. **Your own agents' summaries are samples.** No data stands behind them; the run says so.
9. **Not checked:** narrow screens, full keyboard and screen-reader pass.

## What would help most, in order
1. A **Last run** line on each card and the agent page ("Sep 2026 · 22 lines reconciled · 3 needed review"), with the canvas keeping that run's result.
2. **Wire the settings** into the runs, so a change on the page changes the next run.
3. **Period in the chat title**.
