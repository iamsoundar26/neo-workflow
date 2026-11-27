import { getMyAgents } from "@/hooks/pages/neo/use-my-agents";
import { defaultsOf, flowFor, vkey, type AgentNode, type Values } from "@/config/pages/neo/agent-nodes";
import type { NeoOption, NeoTask } from "@/types/pages/neo";
import { has } from "@/utils/pages/neo";

/**
 * Run one of your own agents (27 Nov 2026). The run follows the agent's
 * workflow, node by node, with the settings saved on its page: Neo says what
 * it is starting, asks what to read, works through the processing and
 * checking nodes, stops for your check where the workflow has one, and ends
 * with a summary in the form you chose. Three-way reconciliation and the
 * bank agents have richer runs of their own.
 *
 * The results are a sample: this prototype has no data behind your agent.
 *
 * DEV: POST /api/neo/agents/:id/runs; the steps stream from the same nodes.
 */
const saved = (id: string, nodes: AgentNode[]): Values => {
  let v = defaultsOf(nodes);
  try {
    const raw = window.localStorage.getItem(`neo.agent-config.v1.${id}`);
    if (raw) v = { ...v, ...JSON.parse(raw) };
  } catch {
    /* no saved settings: the defaults stand */
  }
  return v;
};

const agentRun: NeoTask = {
  id: "agent-run",
  title: "Run an agent",
  match: (p) => (has(p, /^\s*run my agent\b/i) ? 90 : 0),
  run: async (api) => {
    const name = api.prompt.replace(/^\s*run my agent[:\s]*/i, "").trim();
    const a = getMyAgents().find((x) => x.name.toLowerCase() === name.toLowerCase());
    if (!a) {
      await api.say(`I couldn't find an agent called **${name}** in My agents.`);
      return "Agent not found";
    }
    if (a.status !== "active") {
      await api.say(`**${a.name}** is ${a.status === "draft" ? "a draft" : "paused"}. Switch it on from Agents, then run it.`);
      return "Agent is not on";
    }
    const flow = flowFor(a.id, [a.data]);
    const v = saved(a.id, flow.nodes);
    const of = (type: AgentNode["type"]) => flow.nodes.filter((n) => n.type === type);

    // Trigger: say what is starting.
    await api.say(`Starting **${a.name}**. ${a.goal.replace(/\.$/, "")}. ${a.access}.`);

    // Input: what to read.
    const reads: string[] = ((v[vkey("input", "sources")] as string[] | undefined) ?? [a.data]).filter(Boolean);
    const options: NeoOption[] = [
      { id: "all", label: reads.length ? reads.join(", ") : a.data, hint: "As set on the agent" },
      { id: "other", label: "Something else", hint: "I'll ask what to use" },
    ];
    const pick = await api.ask(`What should I read?`, options);
    if (pick === "other") {
      const what = await api.askText("What should I use instead?", { placeholder: "e.g. last month's purchase bills" });
      await api.say(`Using ${what} this time. The agent's saved settings stay as they are.`);
    }

    // Processing and validation: the work, one step per node.
    const work = [...of("processing"), ...of("validation")];
    for (const n of work) {
      const done = await api.step(n.title);
      await api.wait(900);
      done();
    }
    const ocr = work.some((n) => v[vkey(n.id, "ocr")] === true);
    await api.think(ocr ? "Scanned pages are on, so I read them as well." : "Reading the files as text.");

    // Human: stop for the check the workflow asks for.
    const human = of("human")[0];
    const mode = human ? String(v[vkey(human.id, "mode")] ?? "all") : "";
    if (human) {
      const q =
        mode === "diff"
          ? "I found 3 things that differ. Review them now?"
          : "I've prepared the work. Do you want to check it before I finish?";
      const a1 = await api.ask(q, [
        { id: "go", label: mode === "diff" ? "Review what differs" : "Check it now", hint: "Recommended" },
        { id: "skip", label: "Skip, show me the summary" },
      ]);
      if (a1 === "go") await api.say(mode === "diff" ? "The 3 that differ are: a missing entry, a mismatched amount, and a date outside the period. I've marked them for you." : "Everything is ready for your check. Nothing has been sent anywhere.");
    }

    // Action / output: the summary, in the form chosen.
    const out = of("action")[0];
    const format = out ? String(v[vkey(out.id, "format")] ?? "chat") : "chat";
    await api.say(
      `**Summary**\n\n- Read: ${pick === "other" ? "what you gave me" : reads.join(", ") || a.data}\n- Checked: ${work.length || 1} step${work.length === 1 ? "" : "s"}\n- Needs a look: ${human && mode === "diff" ? "3 items" : "nothing outstanding"}\n\n${
        format === "xlsx" ? "I've prepared this as an Excel file for you." : format === "pdf" ? "I've prepared this as a PDF for you." : "That is the whole run."
      } These figures are a sample: this prototype has no data behind your agent.`
    );
    api.suggest(["Run it again", "Change what it reads"]);
    return `${a.name} ran`;
  },
};

export default agentRun;
