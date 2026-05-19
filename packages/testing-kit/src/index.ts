// @agentsflow/testing-kit
// FakeAgentAdapter, golden flows, contract fixtures, and test utilities.

export { FakeAgentAdapter, type FakeAdapterConfig } from "./adapters/fake-agent-adapter.js";
export { minimalFlow, multiAgentFlow, minimalFlowYaml } from "./fixtures/golden-flows.js";
export { planExecuteEvaluateFlow, planExecuteEvaluateFlowYaml } from "./fixtures/plan-loop-flow.js";
