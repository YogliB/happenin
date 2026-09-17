import { homedir } from "node:os";
import process from "node:process";

export const homeDir = (): string => process.env.HOME || homedir();
