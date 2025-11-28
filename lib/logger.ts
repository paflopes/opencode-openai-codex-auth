import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

// Logging configuration
export const LOGGING_ENABLED = process.env.ENABLE_PLUGIN_REQUEST_LOGGING === "1";
export const DEBUG_ENABLED = process.env.DEBUG_CODEX_PLUGIN === "1" || LOGGING_ENABLED;
const LOG_DIR = join(homedir(), ".opencode", "logs", "codex-plugin");
const LOG_FILE = join(LOG_DIR, "plugin.log");

type LogLevel = "info" | "warn" | "error" | "debug";

function ensureLogDir(): void {
	if (!existsSync(LOG_DIR)) {
		mkdirSync(LOG_DIR, { recursive: true });
	}
}

function shouldLog(level: LogLevel): boolean {
	if (level === "debug") return DEBUG_ENABLED;
	if (level === "info") return LOGGING_ENABLED || DEBUG_ENABLED;
	return true;
}

/**
 * General log writer that persists logs to file.
 * @param level - Log level
 * @param message - Log message
 * @param data - Optional data to log
 */
export function log(level: LogLevel, message: string, data?: unknown): void {
	if (!shouldLog(level)) return;

	try {
		ensureLogDir();
		const entry = {
			timestamp: new Date().toISOString(),
			level,
			message,
			...(data !== undefined ? { data: normalizeForLogging(data) } : {}),
		};

		writeFileSync(LOG_FILE, `${JSON.stringify(entry)}\n`, { flag: "a", encoding: "utf8" });
	} catch {
		// Intentionally swallow logging errors to avoid side effects
	}
}

// Log startup message about logging state
if (LOGGING_ENABLED) {
	log("info", "Request logging ENABLED", { logDir: LOG_DIR });
}
if (DEBUG_ENABLED && !LOGGING_ENABLED) {
	log("info", "Debug logging ENABLED");
}

let requestCounter = 0;

/**
 * Log request data to file (only when LOGGING_ENABLED is true)
 * @param stage - The stage of the request (e.g., "before-transform", "after-transform")
 * @param data - The data to log
 */
export function logRequest(stage: string, data: Record<string, unknown>): void {
	// Only log if explicitly enabled via environment variable
	if (!LOGGING_ENABLED) return;

	// Ensure log directory exists on first log
	ensureLogDir();

	const timestamp = new Date().toISOString();
	const requestId = ++requestCounter;
	const filename = join(LOG_DIR, `request-${requestId}-${stage}.json`);

	try {
		writeFileSync(
			filename,
			JSON.stringify(
				{
					timestamp,
					requestId,
					stage,
					...data,
				},
				null,
				2,
			),
			"utf8",
		);
		log("info", `Logged ${stage}`, { filename });
	} catch (e) {
		log("error", `Failed to write log for ${stage}`, { filename, error: e });
	}
}

/**
 * Log debug information (only when DEBUG_ENABLED is true)
 * @param message - Debug message
 * @param data - Optional data to log
 */
export function logDebug(message: string, data?: unknown): void {
	if (!DEBUG_ENABLED) return;

	log("debug", message, data);
}

/**
 * Log warning (always enabled for important issues)
 * @param message - Warning message
 * @param data - Optional data to log
 */
export function logWarn(message: string, data?: unknown): void {
	log("warn", message, data);
}

function normalizeForLogging(value: unknown, seen = new WeakSet<object>()): unknown {
    if (value instanceof Error) {
        return {
            name: value.name,
            message: value.message,
            stack: value.stack,
            cause:
                value.cause && typeof value.cause !== "string"
                    ? normalizeForLogging(value.cause, seen)
                    : value.cause ?? undefined,
        };
    }

    if (value === null || value === undefined) return value;

    const type = typeof value;
    if (type === "string" || type === "number" || type === "boolean") {
        return value;
    }
    if (type === "bigint" || type === "symbol" || type === "function") {
        return String(value);
    }

    if (type === "object") {
        const obj = value as Record<string, unknown>;
        if (seen.has(obj)) return "[Circular]";
        seen.add(obj);
        if (Array.isArray(obj)) {
            return obj.map((item) => normalizeForLogging(item, seen));
        }
        const normalized: Record<string, unknown> = {};
        for (const [key, val] of Object.entries(obj)) {
            normalized[key] = normalizeForLogging(val, seen);
        }
        return normalized;
    }

    return String(value);
}
