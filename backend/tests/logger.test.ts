import { PassThrough } from "stream";
import { describe, expect, it } from "vitest";
import { createLogger } from "../src/config/logger";

describe("Logger environment configuration", () => {
  it("uses standard JSON logging in production without a pretty transport", () => {
    const output = new PassThrough();
    let logged = "";
    output.on("data", (chunk) => {
      logged += chunk.toString();
    });

    const logger = createLogger("production", "info", output);
    logger.info({ component: "api" }, "production log");

    expect(JSON.parse(logged)).toMatchObject({
      level: 30,
      component: "api",
      msg: "production log",
    });
  });
});
