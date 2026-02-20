import { Command } from "commander";
import { runCommand } from "./commands/run.js";

const program = new Command();

program
  .name("voiceci")
  .description("VoiceCI — behavioral regression tests for voice agents")
  .version("0.0.1");

program
  .command("run")
  .description("Bundle and run voice agent tests")
  .option("-m, --mode <mode>", "Test mode: smoke | ci | deep", "smoke")
  .option("--api-url <url>", "API URL", process.env["API_URL"] ?? "http://localhost:3000")
  .action(runCommand);

program.parse();
