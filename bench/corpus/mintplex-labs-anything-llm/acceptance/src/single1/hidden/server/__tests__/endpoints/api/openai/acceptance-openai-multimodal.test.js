/* eslint-env jest, node */
// POST /v1/openai/chat/completions end to end inside the server process: the route's whole middleware chain and the
// real chat code run; only the outside world is replaced (database models, the LLM, the vector database, telemetry).
// The test observes what reaches the LLM, what is stored as the chat record and what the HTTP response is.
jest.mock("../../../../models/documents", () => ({ Document: {} }));
jest.mock("../../../../models/telemetry", () => ({ Telemetry: { sendTelemetry: jest.fn() } }));
jest.mock("../../../../models/eventLogs", () => ({ EventLogs: { logEvent: jest.fn() } }));
jest.mock("../../../../models/workspace", () => ({ Workspace: { get: jest.fn() } }));
jest.mock("../../../../models/workspaceChats", () => ({ WorkspaceChats: { new: jest.fn() } }));
jest.mock("../../../../utils/middleware/validApiKey", () => ({ validApiKey: (_req, _res, next) => next() }));
jest.mock("../../../../utils/helpers", () => ({
  getVectorDbClass: jest.fn(),
  getLLMProvider: jest.fn(),
  getEmbeddingEngineSelection: jest.fn(),
}));
jest.mock("../../../../utils/DocumentManager", () => ({
  DocumentManager: class {
    pinnedDocs() {
      return Promise.resolve([]);
    }
  },
}));
jest.mock("../../../../endpoints/utils", () => ({ getModelTag: () => "test-model" }));

const { Workspace } = require("../../../../models/workspace");
const { WorkspaceChats } = require("../../../../models/workspaceChats");
const { getVectorDbClass, getLLMProvider } = require("../../../../utils/helpers");
const { apiOpenAICompatibleEndpoints } = require("../../../../endpoints/api/openai");

const ROUTE = "/v1/openai/chat/completions";
const PNG = "data:image/png;base64,AAAA";
const JPEG = "data:image/jpeg;base64,BBBB";
const REMOTE = "https://example.org/picture";
const multimodal = [
  { type: "text", text: "What is in these images?" },
  { type: "image_url", image_url: { url: PNG, detail: "low" } },
  { type: "text", text: "Answer briefly." },
  { type: "image_url", image_url: { url: JPEG } },
  { type: "image_url", image_url: { url: REMOTE } },
];
const PROMPT = "What is in these images?\nAnswer briefly.";
const ATTACHMENTS = [
  { name: "uploaded_image_0", mime: "image/png", contentString: PNG },
  { name: "uploaded_image_1", mime: "image/jpeg", contentString: JPEG },
  { name: "uploaded_image_2", mime: "image/png", contentString: REMOTE },
];

/** Run the registered route with all its middlewares, like express would. */
async function post(body) {
  const routes = {};
  const register = (method) => (route, ...handlers) => (routes[`${method} ${route}`] = handlers.flat());
  apiOpenAICompatibleEndpoints({ get: register("GET"), post: register("POST"), delete: register("DELETE") });
  const chain = routes[`POST ${ROUTE}`];
  const res = {
    statusCode: 200,
    body: undefined,
    written: [],
    ended: false,
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; this.ended = true; return this; },
    send(value) { this.body = value; this.ended = true; return this; },
    write(chunk) { this.written.push(String(chunk)); return true; },
    end() { this.ended = true; return this; },
    setHeader() {},
    flushHeaders() {},
    on() {},
  };
  const req = { body, headers: { authorization: "Bearer test" }, header: () => "Bearer test", on: () => {} };
  for (const handler of chain) {
    let next = false;
    await handler(req, res, () => (next = true));
    if (!next) break;
  }
  return res;
}

let llm;
let vectors;
const lastSaved = () => WorkspaceChats.new.mock.calls.at(-1)[0];
const sentToLLM = () => llm.compressMessages.mock.calls.at(-1)[0];
const messages = (content) => [
  { role: "system", content: "Be helpful" },
  { role: "user", content: "earlier" },
  { role: "assistant", content: "earlier answer" },
  { role: "user", content },
];

beforeEach(() => {
  jest.clearAllMocks();
  Workspace.get.mockResolvedValue({ id: 7, slug: "ws", name: "WS", chatMode: "chat", chatProvider: "openai", chatModel: "gpt-4o" });
  WorkspaceChats.new.mockResolvedValue({ chat: { id: 1 } });
  vectors = {
    hasNamespace: jest.fn().mockResolvedValue(true),
    namespaceCount: jest.fn().mockResolvedValue(1),
    performSimilaritySearch: jest.fn().mockResolvedValue({ contextTexts: [], sources: [], message: null }),
  };
  getVectorDbClass.mockReturnValue(vectors);
  llm = {
    promptWindowLimit: jest.fn().mockReturnValue(8000),
    compressMessages: jest.fn().mockResolvedValue([{ role: "user", content: "x" }]),
    getChatCompletion: jest.fn().mockResolvedValue({ textResponse: "Mock response", metrics: {} }),
    streamingEnabled: jest.fn().mockReturnValue(true),
    streamGetChatCompletion: jest.fn().mockResolvedValue({ metrics: {} }),
    handleStream: jest.fn().mockResolvedValue("Mock streamed response"),
    defaultTemp: 0.7,
  };
  getLLMProvider.mockReturnValue(llm);
});

describe("multimodal user messages on the OpenAI-compatible endpoint", () => {
  it("non-streaming: the text parts form the prompt, the images reach the LLM and the chat record", async () => {
    const res = await post({ model: "ws", stream: false, temperature: 0.2, messages: messages(multimodal) });

    expect(res.statusCode).toBe(200);
    expect(res.body.choices[0].message.content).toBe("Mock response");
    expect(sentToLLM().userPrompt).toBe(PROMPT);
    expect(sentToLLM().attachments).toEqual(ATTACHMENTS);
    expect(lastSaved().prompt).toBe(PROMPT);
    expect(lastSaved().response.attachments).toEqual(ATTACHMENTS);
  });

  it("streaming: the same prompt and attachments reach the LLM and the chat record", async () => {
    const res = await post({ model: "ws", stream: true, messages: messages(multimodal) });

    expect(res.statusCode).toBe(200);
    expect(llm.streamGetChatCompletion).toHaveBeenCalled();
    expect(sentToLLM().userPrompt).toBe(PROMPT);
    expect(sentToLLM().attachments).toEqual(ATTACHMENTS);
    expect(lastSaved().response.text).toBe("Mock streamed response");
    expect(lastSaved().response.attachments).toEqual(ATTACHMENTS);
  });

  it("a query-mode workspace without documents refuses but still stores the attachments, in both modes", async () => {
    Workspace.get.mockResolvedValue({ id: 7, slug: "ws", name: "WS", chatMode: "query", chatProvider: "openai", chatModel: "gpt-4o" });
    vectors.hasNamespace.mockResolvedValue(false);
    vectors.namespaceCount.mockResolvedValue(0);

    await post({ model: "ws", stream: false, messages: messages(multimodal) });
    expect(llm.getChatCompletion).not.toHaveBeenCalled();
    expect(lastSaved().prompt).toBe(PROMPT);
    expect(lastSaved().response.attachments).toEqual(ATTACHMENTS);

    await post({ model: "ws", stream: true, messages: messages(multimodal) });
    expect(lastSaved().prompt).toBe(PROMPT);
    expect(lastSaved().response.attachments).toEqual(ATTACHMENTS);
  });

  it("plain string messages keep working, with no attachments", async () => {
    const res = await post({ model: "ws", stream: false, messages: messages("just text") });

    expect(res.statusCode).toBe(200);
    expect(sentToLLM().userPrompt).toBe("just text");
    expect(sentToLLM().attachments ?? []).toEqual([]);
    expect(lastSaved().prompt).toBe("just text");
    expect(lastSaved().response.attachments ?? []).toEqual([]);
  });

  it("only text parts or only image parts", async () => {
    await post({ model: "ws", stream: false, messages: messages([{ type: "text", text: "one" }, { type: "text", text: "two" }]) });
    expect(sentToLLM().userPrompt).toBe("one\ntwo");
    expect(sentToLLM().attachments ?? []).toEqual([]);

    await post({ model: "ws", stream: false, messages: messages([{ type: "image_url", image_url: { url: JPEG } }]) });
    expect(sentToLLM().userPrompt).toBe("");
    expect(sentToLLM().attachments).toEqual([{ name: "uploaded_image_0", mime: "image/jpeg", contentString: JPEG }]);
  });
});
