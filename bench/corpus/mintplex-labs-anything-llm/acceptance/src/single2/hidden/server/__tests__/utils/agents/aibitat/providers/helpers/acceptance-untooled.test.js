const UnTooled = require("../../../../../../utils/agents/aibitat/providers/helpers/untooled");

// Public behaviour of UnTooled.validFuncCall: which model-produced function calls are accepted.
describe("UnTooled.validFuncCall acceptance", () => {
  const untooled = new UnTooled();
  const search = {
    name: "web-search",
    description: "Search the web",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string" },
        count: { type: "number", default: 10 },
        offset: { type: "number", default: 0 },
      },
      required: ["query"],
    },
  };
  const ping = {
    name: "ping",
    description: "Takes nothing",
    parameters: { type: "object", properties: {} },
  };
  const bare = { name: "bare", description: "No parameter schema at all" };
  const call = (name, args, defs = [search, ping, bare]) =>
    untooled.validFuncCall({ name, arguments: args }, defs);

  it("accepts a call that supplies only the required arguments", () => {
    const result = call("web-search", { query: "cats" });
    expect(result.valid).toBe(true);
    expect(result.reason).toBeNull();
  });

  it("accepts a call that supplies required and some optional arguments", () => {
    expect(call("web-search", { query: "cats", count: 5 }).valid).toBe(true);
  });

  it("accepts a call that supplies every argument", () => {
    expect(
      call("web-search", { query: "cats", count: 5, offset: 2 }).valid
    ).toBe(true);
  });

  it("rejects a call that lacks a required argument and gives a reason", () => {
    const result = call("web-search", { count: 5 });
    expect(result.valid).toBe(false);
    expect(typeof result.reason).toBe("string");
    expect(result.reason.length).toBeGreaterThan(0);
  });

  it("rejects a call without any arguments when one is required", () => {
    expect(call("web-search", {}).valid).toBe(false);
  });

  it("rejects an argument that is not in the schema, even when the required ones are present", () => {
    const result = call("web-search", { query: "cats", colour: "red" });
    expect(result.valid).toBe(false);
    expect(typeof result.reason).toBe("string");
  });

  it("rejects a call to a function that is not defined", () => {
    const result = call("nope", {});
    expect(result.valid).toBe(false);
    expect(typeof result.reason).toBe("string");
  });

  it("rejects a call with no name or no arguments object", () => {
    expect(untooled.validFuncCall({ arguments: {} }, [search]).valid).toBe(false);
    expect(untooled.validFuncCall({ name: "web-search" }, [search]).valid).toBe(false);
    expect(untooled.validFuncCall({}, [search]).valid).toBe(false);
  });

  it("accepts an empty call to a function without parameters", () => {
    expect(call("ping", {}).valid).toBe(true);
  });

  it("accepts an empty call to a function that has no parameter schema", () => {
    expect(call("bare", {}).valid).toBe(true);
  });

  it("rejects an argument for a function that has no parameter schema", () => {
    expect(call("bare", { x: 1 }).valid).toBe(false);
  });

  const booking = {
    name: "book",
    description: "Two required, one optional",
    parameters: {
      type: "object",
      properties: { from: { type: "string" }, to: { type: "string" }, seats: { type: "number" } },
      required: ["from", "to"],
    },
  };
  const optionalOnly = {
    name: "list",
    description: "Only optional parameters",
    parameters: { type: "object", properties: { limit: { type: "number" }, page: { type: "number" } } },
  };
  const expectValid = (result) => {
    expect(result.valid).toBe(true);
    expect(result.reason).toBeNull();
  };
  const expectInvalid = (result) => {
    expect(result.valid).toBe(false);
    expect(typeof result.reason).toBe("string");
    expect(result.reason.trim().length).toBeGreaterThan(0);
  };

  it("checks every required argument, not only the first", () => {
    expectValid(call("book", { from: "A", to: "B" }, [booking]));
    expectInvalid(call("book", { from: "A" }, [booking]));
    expectInvalid(call("book", { to: "B" }, [booking]));
    expectInvalid(call("book", { seats: 2 }, [booking]));
  });

  it("treats falsy values of required arguments as supplied", () => {
    expectValid(call("book", { from: "", to: "B", seats: 0 }, [booking]));
    expectValid(call("web-search", { query: "", count: 0, offset: false }));
  });

  it("accepts any subset of the arguments of an optional-only schema, but no unknown ones", () => {
    expectValid(call("list", {}, [optionalOnly]));
    expectValid(call("list", { limit: 5 }, [optionalOnly]));
    expectValid(call("list", { limit: 5, page: 2 }, [optionalOnly]));
    expectInvalid(call("list", { limit: 5, sort: "asc" }, [optionalOnly]));
  });

  it("gives a reason for every kind of rejection", () => {
    expectInvalid(untooled.validFuncCall({ arguments: {} }, [booking]));
    expectInvalid(call("nope", {}, [booking]));
    expectInvalid(call("book", { from: "A" }, [booking]));
    expectInvalid(call("book", { from: "A", to: "B", extra: 1 }, [booking]));
  });
});
