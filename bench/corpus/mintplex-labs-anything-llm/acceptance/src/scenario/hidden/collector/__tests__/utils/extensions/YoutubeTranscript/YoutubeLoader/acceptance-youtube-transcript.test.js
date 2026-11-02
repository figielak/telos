const {
  YoutubeTranscript,
} = require("../../../../../utils/extensions/YoutubeTranscript/YoutubeLoader/youtube-transcript.js");

// The YouTube service is replaced by a fake `fetch`. The test checks what is sent to it (the transcript endpoint
// contract) and what the loader returns for a response of the documented shape. No network is used.

const ENDPOINT = "https://www.youtube.com/youtubei/v1/get_transcript";
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_4) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/85.0.4183.83 Safari/537.36,gzip(gfe)";
const VIDEO_ID = "BJjsfNO5JTo";

/** Decode a protobuf message made of length-delimited fields → { fieldNumber: Buffer }. */
function decodeFields(buffer) {
  const fields = {};
  let i = 0;
  const varint = () => {
    let result = 0;
    let shift = 0;
    while (true) {
      const byte = buffer[i++];
      result |= (byte & 0x7f) << shift;
      if (!(byte & 0x80)) return result;
      shift += 7;
    }
  };
  while (i < buffer.length) {
    const tag = varint();
    if ((tag & 7) !== 2) throw new Error(`unexpected wire type ${tag & 7}`);
    const length = varint();
    fields[tag >> 3] = buffer.subarray(i, i + length);
    i += length;
  }
  return fields;
}

/** `params` of the request → { videoId, kind, lang } */
function decodeParams(params) {
  const outer = decodeFields(Buffer.from(params, "base64"));
  const inner = decodeFields(Buffer.from(outer[2].toString("utf8"), "base64"));
  return { videoId: outer[1].toString("utf8"), kind: inner[1].toString("utf8"), lang: inner[2].toString("utf8") };
}

const segment = (...texts) => ({
  transcriptSegmentRenderer: { snippet: { runs: texts.map((text) => ({ text })) } },
});
const transcriptResponse = (segments) => ({
  actions: [
    {
      updateEngagementPanelAction: {
        content: {
          transcriptRenderer: {
            content: {
              transcriptSearchPanelRenderer: {
                body: { transcriptSegmentListRenderer: { initialSegments: segments } },
              },
            },
          },
        },
      },
    },
  ],
});

/** Fake `fetch`: every call is normalised through `Request`, so any valid way of calling fetch is recorded the same. */
function fakeFetch(payload, { ok = true, status = 200 } = {}) {
  const calls = [];
  global.fetch = jest.fn(async (input, init) => {
    const request = new Request(input, init);
    const text = await request.text();
    calls.push({ url: request.url, method: request.method, headers: request.headers, body: text ? JSON.parse(text) : null });
    return new Response(JSON.stringify(payload), { status, headers: { "Content-Type": "application/json" } });
  });
  return calls;
}
const transcriptCall = (calls) => {
  const found = calls.filter((c) => c.url === ENDPOINT);
  expect(found).toHaveLength(1);
  return found[0];
};

const realFetch = global.fetch;
afterEach(() => {
  global.fetch = realFetch;
});

describe("YoutubeTranscript.fetchTranscript acceptance", () => {
  it("asks the transcript endpoint with a JSON POST that names the video and the language", async () => {
    const calls = fakeFetch(transcriptResponse([segment("Hello")]));
    await YoutubeTranscript.fetchTranscript(VIDEO_ID, { lang: "es" });

    const call = transcriptCall(calls);
    expect(call.method).toBe("POST");
    expect(call.headers.get("content-type")).toMatch(/application\/json/);
    expect(call.headers.get("user-agent")).toBe(USER_AGENT);
    expect(call.body.context.client).toEqual(expect.objectContaining({ clientName: "WEB", clientVersion: "2.20240826.01.00" }));
    expect(decodeParams(call.body.params)).toEqual({ videoId: VIDEO_ID, kind: "asr", lang: "es" });
  });

  it("defaults to English", async () => {
    const calls = fakeFetch(transcriptResponse([segment("Hello")]));
    await YoutubeTranscript.fetchTranscript(VIDEO_ID);
    expect(decodeParams(transcriptCall(calls).body.params).lang).toBe("en");
  });

  it("accepts the usual video URL forms and sends only the 11-character id", async () => {
    for (const input of [
      `https://www.youtube.com/watch?v=${VIDEO_ID}`,
      `https://youtu.be/${VIDEO_ID}`,
      `https://www.youtube.com/embed/${VIDEO_ID}`,
    ]) {
      const calls = fakeFetch(transcriptResponse([segment("Hi")]));
      await YoutubeTranscript.fetchTranscript(input);
      expect(decodeParams(transcriptCall(calls).body.params).videoId).toBe(VIDEO_ID);
    }
  });

  it("joins runs inside a segment, skips empty segments, joins segments with one space", async () => {
    fakeFetch(
      transcriptResponse([
        segment("Hello", ", world"),
        { transcriptSegmentRenderer: { snippet: {} } },
        segment("  second\n  line "),
        segment(""),
        segment("end."),
      ])
    );
    const text = await YoutubeTranscript.fetchTranscript(VIDEO_ID);
    expect(text).toBe("Hello, world second line end.");
  });

  it("rejects with a [YoutubeTranscript] error that carries the HTTP status", async () => {
    fakeFetch({}, { ok: false, status: 500 });
    await expect(YoutubeTranscript.fetchTranscript(VIDEO_ID)).rejects.toThrow(/\[YoutubeTranscript\].*500/);
  });

  it("rejects with a [YoutubeTranscript] error when the response has no transcript", async () => {
    // the message says why: more than the prefix, and not an undefined/TypeError leak
    const why = /\[YoutubeTranscript\] (?!undefined)\S.{3,}/;
    fakeFetch({ actions: [] });
    await expect(YoutubeTranscript.fetchTranscript(VIDEO_ID)).rejects.toThrow(why);
    fakeFetch({});
    await expect(YoutubeTranscript.fetchTranscript(VIDEO_ID)).rejects.toThrow(why);
  });

  it("rejects an input that holds no video id without calling the service", async () => {
    const calls = fakeFetch(transcriptResponse([segment("x")]));
    await expect(YoutubeTranscript.fetchTranscript("this is not a youtube video id")).rejects.toThrow(/\[YoutubeTranscript\]/);
    expect(calls.filter((c) => c.url === ENDPOINT)).toHaveLength(0);
  });
});
